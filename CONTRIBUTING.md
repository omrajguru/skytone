# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```bash
npm install
```

```bash
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck && npm test && npm run build
```

## Where things live

- `packages/skytone/src`: the engine.
  - `astro.ts`: the sun and moon.
  - `palette.ts`: colours by sun altitude.
  - `plate.ts`: the watercolour painter.
  - `renderer.ts`: the WebGL2 renderer.
  - `weather.ts`: Open-Meteo.
- `apps/studio/src`: the Studio app.
  - `state/` holds the data flow.
  - `studio/` holds the workspace.
  - `pages/` holds the routes.

## Changing the look

The painter is deterministic, so a change to `plate.ts` or `palette.ts` shows up the same way every time. Paint a contact sheet before and after your change and compare them. Include both in your pull request.

## Releasing the engine

1. Update `packages/skytone/CHANGELOG.md` and the version in `packages/skytone/package.json`.
2. From `packages/skytone`, run `npm publish`. `prepublishOnly` typechecks, tests and builds first.
