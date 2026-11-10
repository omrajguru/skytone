# skytone

A living watercolour sky for any interface. Give it a place and a moment, and it paints the sky there: the sun and moon where they really are, the weather from the live forecast, rendered as soft washes by a small WebGL2 renderer. No dependencies.

It's the engine behind [Skytone Studio](https://skytone.site).

```bash
npm install skytone
```

## Quick start

```ts
import { SkyRenderer, skyAt, presetConditions } from 'skytone';

const canvas = document.querySelector('canvas')!;
const sky = new SkyRenderer(canvas); // sizes itself to the canvas and pauses offscreen

const { plate } = skyAt({
  latitude: 19.08,
  longitude: 72.88,
  time: Date.now(),
  conditions: presetConditions('partly'),
});

sky.setPlate(plate);
sky.start();
```

Give the canvas a size with CSS (`width: 100%; height: 100%`). The sky covers it at any aspect ratio.

## With the live forecast

```ts
import { SkyRenderer, conditionsAt, fetchForecast, skyAt } from 'skytone';

const latitude = 51.51, longitude = -0.13;
const sky = new SkyRenderer(canvas);
const forecast = await fetchForecast(latitude, longitude); // Open-Meteo, no key needed

function paint() {
  const { conditions } = conditionsAt(forecast, Date.now());
  const { plate } = skyAt({ latitude, longitude, time: Date.now(), conditions });
  sky.setPlate(plate, { storm: conditions.storm }); // changes ease in over a second
}

paint();
sky.start();
setInterval(paint, 60_000);
```

## Text on top

`skyAt` also says which text colour reads best on the current sky:

```ts
const { foreground } = skyAt({ latitude, longitude, time: Date.now(), conditions });
document.body.dataset.foreground = foreground; // 'light' or 'dark'
```

## React

```tsx
import { useEffect, useRef } from 'react';
import { SkyRenderer, type Plate } from 'skytone';

export function Sky({ plate }: { plate: Plate }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sky = useRef<SkyRenderer | null>(null);

  useEffect(() => {
    sky.current = new SkyRenderer(ref.current!);
    sky.current.start();
    return () => sky.current?.destroy();
  }, []);

  useEffect(() => sky.current?.setPlate(plate), [plate]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} aria-hidden />;
}
```

## How it works

1. **Sun and moon.** Positions come from low-precision astronomical formulas. The tests check sunrise and sunset against published times to within three minutes, including polar night.
2. **A plate.** The scene is painted into a 128×72 colour grid, the way a watercolourist paints a sky: a graded wash, then soft brush strokes laid wet into it. The palette follows the sun's *altitude*, not the clock, so 6 pm in Oslo in December and 6 pm in Mumbai in June are different skies. Clouds come in as broad sweeps, high wisps, and at low sun, curtains rising from the horizon. Rain, snow, fog, storms and land at dusk are layered on top.
3. **The renderer.** A WebGL2 shader upsamples the plate with a cubic B-spline, which never draws an edge. It adds a gentle current, faint smoky texture and paper grain, and eases between plates so the sky morphs instead of cutting.

Painting a plate is pure and deterministic: the same place, time, conditions and seed always give the same sky.

## API

### Painting a sky

| Export | What it does |
| --- | --- |
| `skyAt(options, out?)` | Paints the sky. Returns `{ plate, scene, phase, foreground }`. |
| `SkyOptions` | `{ latitude, longitude, time, conditions, seed?, viewAzimuth? }`. `time` is epoch ms. `seed` varies the composition (defaults to one per place). `viewAzimuth` is the compass direction the view faces (defaults to facing the equator). |
| `sceneFor(options)` | The sun, moon and conditions for a moment, without painting. |
| `paintPlate(scene, out?)` | Paints a scene into a plate. Pass `out` to reuse memory. |
| `phaseOf(altitude)` | `'night' \| 'astronomical' \| 'nautical' \| 'civil' \| 'golden' \| 'day'`. |
| `seedFor(latitude, longitude)` | The default seed for a place. |
| `createPlate()`, `PLATE_W`, `PLATE_H` | A plate is a `Float32Array` of sRGB values, row 0 at the top. |
| `plateAverage(plate, v0?, v1?)` | Average colour, optionally of a horizontal band (0 bottom, 1 top). |
| `foregroundFor(plate)` | `'light'` or `'dark'` text for this sky. |

### Rendering

`new SkyRenderer(canvas, options?)`

| Option | Default | |
| --- | --- | --- |
| `renderScale` | `0.5` | Resolution relative to CSS pixels × devicePixelRatio. The sky is soft, so half resolution looks the same and costs a quarter. |
| `size` | | A fixed `{ width, height }` drawing buffer (for exports). Turns off automatic resizing. |
| `look` | `DEFAULT_LOOK` | Partial `Look`. |
| `preserveDrawingBuffer` | `false` | Keep frames readable (for exports). |

| Method | |
| --- | --- |
| `setPlate(plate, { instant?, storm? })` | Shows a plate. Changes ease in; large jumps soften briefly. `storm` (0..1) adds distant flashes. |
| `setLook(look)` | `{ watercolor, motion, softness, grain }`, each 0..1 (`softness` 0..2). |
| `start()`, `stop()` | The animation loop. It also pauses on its own when the canvas is offscreen or the tab is hidden. |
| `renderFrame(seconds)` | Draws one frame at an explicit time (exports, video). |
| `setSize(width, height)` | Sets the drawing buffer when `size` was given. |
| `destroy({ releaseContext? })` | Frees GPU resources. Pass `releaseContext: true` for a throwaway canvas. |

`SkyRenderer` needs WebGL2, which every current browser has. It recovers from a lost GPU context.

### Weather

| Export | |
| --- | --- |
| `presetConditions(preset, intensity?)` | Conditions without a network call. Presets: `clear`, `partly`, `cloudy`, `overcast`, `rain`, `snow`, `fog`, `storm`. `intensity` is 0..1. |
| `fetchForecast(latitude, longitude, options?)` | Hourly forecast from Open-Meteo: the past 7 days and the next 16. |
| `conditionsAt(forecast, time)` | `{ conditions, known }`, interpolated between hours. Outside the forecast it returns a typical sky with `known: false`. |
| `searchPlaces(query, options?)` | Place search (Open-Meteo geocoding). Returns `{ name, region, country, latitude, longitude, timezone }[]`. |
| `placeQueryFromTimezone(tz?)` | A city name from the device timezone, for a first guess with no permission prompt. |
| `lerpConditions(a, b, t)`, `describe(conditions)`, `CONDITION_PRESETS` | Helpers. |

`Conditions` is `{ cloud, cloudLow, cloudHigh, rain, snow, fog, storm, windSpeed, windDirection, temperature }`, each normalised to 0..1 except wind (m/s, degrees) and temperature (°C or `null`).

The forecast functions accept `{ baseUrl, geocodingUrl, apiKey, signal }` to point at Open-Meteo's commercial endpoint or cancel a request.

### Sun and moon

| Export | |
| --- | --- |
| `sunPosition(time, latitude, longitude)` | `{ altitude, azimuth, rising }` in degrees. Azimuth is clockwise from north. |
| `moonPosition(time, latitude, longitude)` | `{ altitude, azimuth, fraction }`, where `fraction` is the illuminated part (0 new, 1 full). |
| `sunEvents(dayStart, latitude, longitude)` | `{ sunrise, sunset, always }` within 24 hours of `dayStart`. `always` is `'up'` or `'down'` for polar day and night. |

### Images

| Export | |
| --- | --- |
| `renderStill(plate, { width, height, look?, time? })` | Renders a plate at full resolution into a new canvas. |
| `stillBlob(plate, options, 'image/png' \| 'image/jpeg', quality?)` | The same, as a `Blob`. |
| `plateToSVG(plate, width, height)` | A resolution-independent SVG of the washes (no paper texture or grain). |

## Where it runs

- **Browsers:** everything. The renderer and image functions need a DOM and WebGL2.
- **Node 18+, Deno, Bun, workers:** the sky model (`skyAt`, `paintPlate`, sun, moon, palettes) and the weather functions. These need no DOM, so you can paint plates on a server and render them on the client.

## Data and credits

- Weather and place search use [Open-Meteo](https://open-meteo.com/), whose data is licensed CC BY 4.0. Credit Open-Meteo wherever you show its weather. Its free API is for non-commercial use; commercial apps need an Open-Meteo plan (`baseUrl` and `apiKey`) or their own provider, which works with `presetConditions` or your own `Conditions`.
- The sun and moon formulas follow those used by [SunCalc](https://github.com/mourner/suncalc) by Vladimir Agafonkin.

## License

MIT
