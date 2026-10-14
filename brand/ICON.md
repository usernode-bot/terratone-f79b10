# Musik Dunia icon

One flat mark: a globe with a pair of beamed eighth-notes orbiting it, on a
rounded-square tile. No text, no gradients, no shadows. Follows the Homeroom
brand framework (https://baked.design/brand/homeroom/), Black + Yellow
pairing, with Cream for the orbit and notes.

## Colours (only these three appear in every file)

| Colour | Hex |
| --- | --- |
| Black | `#000000` |
| Yellow | `#FFEE6F` |
| Cream | `#FFFEEA` |

## Files

| File | Size | Use |
| --- | --- | --- |
| `icon.svg` → `icon.png` | 1024×1024 | App icon, set as `icon.image` in `dapp.json`. Black tile, yellow globe, cream orbit and notes. |
| `featured-light.svg` → `featured-light.png` | 1600×900 | Featured artwork, light: cream background, the same mark with black orbit, notes, globe lines and a black globe outline. |
| `featured-dark.svg` → `featured-dark.png` | 1600×900 | Featured artwork, dark: identical to the app-icon mark, centred on a 1600×900 black canvas. |

`icon.emoji` (`🎶`) stays in `dapp.json` as the fallback if the image ever
fails to load.

## Geometry (1024 grid, bottom to top)

1. Background: full-bleed square rect, square corners (the platform rounds
   the tile). Black in the icon and the dark featured version; cream in the
   light featured version.
2. Orbit, back half: ellipse cx 512 cy 540 rx 420 ry 140, rotated −18°,
   stroke 40, no fill. Cream in the icon/dark, black in the light version.
3. Globe: circle cx 480 cy 560 r 250, yellow. In the light version it also
   gets a 36-wide black outline.
4. Globe lines: meridian ellipse rx 105 ry 250 plus an equator line from
   (230,560) to (730,560), stroke 36, round caps, black.
5. Orbit, front half: the lower arc of the same ellipse
   (`M 110 655 A 420 140 -18 0 0 914 425`), redrawn over the globe so the
   ring passes in front below and behind above.
6. Notes: beamed eighth-note pair above the orbit's top-right arc — two
   tilted oval heads (rx 56 ry 42, rotated −20°) at (710,300) and (855,255),
   30-wide stems, a beam about 50 thick. Cream in the icon/dark, black in
   the light version.

Everything keeps ~90 px clear of the edges and no stroke is thinner than 36,
so the mark stays readable down to about 32 px.

## Rendering

The PNGs are rendered from the SVG sources with resvg (no dependency added
to the repo):

```sh
npx @resvg/resvg-js-cli brand/icon.svg brand/icon.png
npx @resvg/resvg-js-cli brand/featured-light.svg brand/featured-light.png
npx @resvg/resvg-js-cli brand/featured-dark.svg brand/featured-dark.png
```
