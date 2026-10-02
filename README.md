# TerraTone

Transform your photos with earthy, natural color grading filters. Choose a
photo, tap a filter to preview it instantly, and save the graded result to
your personal gallery. The grading is applied in the browser with CSS, so
what you preview is exactly what gets saved.

## Features

- **Add a photo** from your device. Very large camera photos are shrunk in
  the browser before upload, and the platform's file storage keeps the
  image; the database stores only its URL.
- **Six filter presets**: Original, Terracotta, Olive, Sand, Sage and Clay.
  Tapping one re-grades the preview instantly.
- **My photos** gallery, newest first. Each entry re-applies its saved
  filter in the browser, so a graded photo always displays correctly.
- Photos are personal: you only ever see your own saved photos.

## Stack

- Express server (`server.js`) with the platform's JWT auth middleware
  gating everything under `/api/`.
- Postgres for photo records (`photos` table; private to staging).
- Precompiled Tailwind CSS: `npm run build` regenerates `public/tailwind.css`
  from the markup on every image build.
- Platform file storage via the bridge's `usernode.uploadFile()`, with
  client-side canvas downscaling for oversized photos.

## Staging note

On staging previews the gallery is seeded with a couple of obviously fake
"Staging demo" placeholder photos so the screen is never empty for testers.
Real users' production data is untouched.
