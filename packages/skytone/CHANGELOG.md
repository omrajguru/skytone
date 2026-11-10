# Changelog

## 0.2.0

- Palettes and brush strokes refitted for closer watercolour skies: softer sweeps, a greyer overcast, and no seam or dark bands at low sun.
- Smoother watercolour texture, without vertical streaks.
- `DEFAULT_LOOK.watercolor` is now `0`. Set it in `setLook` or `renderStill` to keep the textured look.
- Breaking: plates are now 128×72 (`PLATE_W` × `PLATE_H`), up from 80×45. Code that hard-codes the size or stores plates needs updating.

## 0.1.0

First release.

- Sun and moon positions, sunrise and sunset, polar day and night.
- Palettes keyed to the sun's altitude, with separate morning and evening tints.
- A watercolour plate painter: graded washes, sweeps, wisps, low-sun curtains, rain, snow, fog, storms and land at dusk.
- `SkyRenderer`: WebGL2 with cubic B-spline upsampling, watercolour texture, easing between plates, offscreen pausing and context-loss recovery.
- Open-Meteo forecast and place search, with interpolation between hours.
- PNG, JPEG and SVG stills.
