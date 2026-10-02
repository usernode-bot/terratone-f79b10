const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const IS_STAGING = process.env.USERNODE_ENV === 'staging';

// Filter keys the API accepts, duplicated server-side so a client that
// sends an unknown key gets a clear rejection instead of a row the
// gallery later renders unfiltered by surprise.
const FILTER_KEYS = new Set(['original', 'terracotta', 'olive', 'sand', 'sage', 'clay']);

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

app.use(express.json());

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process (a per-app Ingress rule on
// Kubernetes, the wildcard site's matcher on the docker runtime). This
// handler is what makes the same relative paths work under a plain
// `node server.js`, where there is no edge in front of the app at all.
//
// Registered BEFORE the auth middleware because these three files are
// public: the platform serves them anonymously from any app origin, and a
// login redirect arriving where a <script> was expected is exactly the
// failure a relative path is meant to avoid.
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file: a baked-in one is what left
// the whole fleet pointing at a domain the platform had moved away from.
// Unset only outside the platform (a plain local `node server.js`) — set
// USERNODE_PLATFORM_ORIGIN there too if you want the hosted assets locally.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

let shuttingDown = false;

app.get('/health', (req, res) => {
  // Anything polling readiness sees the container leaving rotation as a
  // 503 rather than a connection reset mid-drain.
  if (shuttingDown) return res.status(503).json({ status: 'shutting down' });
  res.json({ status: 'ok' });
});

// The template ships no favicon file; index.html carries an inline SVG
// icon instead. Answer 204 here so anything that still probes
// /favicon.ico (older browsers, direct visits) doesn't fall through to
// the auth-gated catch-all and surface a 401 in the console on every
// fresh load.
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Save a graded photo. The file itself lives in the platform's storage;
// only its URL is persisted here, next to the filter key needed to
// re-apply the grading in the browser.
app.post('/api/photos', async (req, res) => {
  try {
    const { file_url, filter } = req.body || {};
    if (typeof file_url !== 'string' || !file_url.startsWith('https://')) {
      return res.status(400).json({ error: 'A saved photo needs a valid file URL.' });
    }
    if (typeof filter !== 'string' || !FILTER_KEYS.has(filter)) {
      return res.status(400).json({ error: 'Unknown filter.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO photos (user_id, username, file_url, filter)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, username, file_url, filter, created_at`,
      [req.user.id, req.user.username, file_url, filter]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The caller's own photos, newest first. The table is personal: a user
// never sees another user's rows.
app.get('/api/photos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, username, file_url, filter, created_at
       FROM photos WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ photos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Homeroom" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user) {
    // Deep-link pass-through (platform #743): carry the visited
    // path+query into the chromeless view so share links land on the
    // shared screen, not Home. The clean platform route stores `path`
    // as one encoded query value so an inner ?, &, or = survives. The
    // character test keeps the
    // value attribute-safe for the landing anchor below — anything
    // unusual falls back to the bare link.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + '/app/terratone-f79b10/full' + deepPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}/app/terratone-f79b10/full${deepPath}" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255) NOT NULL,
      file_url TEXT NOT NULL,
      filter VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Photo rows are personal user content: staging copies the schema
  // without the rows, so the gallery would be blank there. Seed a few
  // obviously fake rows owned by a fake identity, with data URIs rather
  // than real /app-files/ URLs because platform-stored files are not
  // cloned into staging.
  await pool.query(`COMMENT ON TABLE photos IS 'staging:private'`);
  if (IS_STAGING) {
    await pool.query(
      `INSERT INTO photos (id, user_id, username, file_url, filter)
       VALUES ($1, $2, $3, $4, $5), ($6, $2, $3, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        900001, 900001, 'staging-demo-user',
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22400%22%3E%3Crect width=%22600%22 height=%22400%22 fill=%22%23a16207%22/%3E%3Ccircle cx=%22300%22 cy=%22200%22 r=%22120%22 fill=%22%23d97706%22/%3E%3Ctext x=%22300%22 y=%22350%22 text-anchor=%22middle%22 font-family=%22system-ui%22 font-size=%2230%22 fill=%22white%22%3EStaging%20demo%3C/text%3E%3C/svg%3E',
        'terracotta',
        900002,
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22400%22%3E%3Crect width=%22600%22 height=%22400%22 fill=%22%233f6212%22/%3E%3Crect x=%22180%22 y=%22140%22 width=%22240%22 height=%22120%22 fill=%22%2365a30d%22/%3E%3Ctext x=%22300%22 y=%22350%22 text-anchor=%22middle%22 font-family=%22system-ui%22 font-size=%2230%22 fill=%22white%22%3EStaging%20demo%3C/text%3E%3C/svg%3E',
        'sage',
      ]
    );
  }
  const server = app.listen(port, () => console.log(`Listening on :${port}`));
  // Let Envoy retire idle upstream connections at 60s, with a 15s margin.
  server.keepAliveTimeout = 75_000;

  const DRAIN_MS = 3000;
  async function shutdown(signal) {
    if (shuttingDown) return; // idempotent: SIGTERM then SIGINT must not double-run
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining`);
    server.close(() => {}); // stop accepting new connections
    server.closeIdleConnections?.(); // drop idle keep-alives immediately
    const t = setTimeout(() => server.closeAllConnections?.(), DRAIN_MS);
    t.unref?.(); // never hold the process open on this timer
    try {
      await pool.end(); // finish/close DB work cleanly
    } catch (e) {
      console.error('[shutdown] pool.end failed', e.message);
    }
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => { console.error(err); process.exit(1); });
