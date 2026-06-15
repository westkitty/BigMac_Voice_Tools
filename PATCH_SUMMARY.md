# BigMac VoiceTools module split pass

This snapshot implements the requested browser-native frontend split and route regression coverage.

## Frontend split

`public/app.js` is now a small bootstrap/orchestration file. Browser-native ES modules live under `public/modules/`:

- `api.js` — fetch wrapper, base64 helpers, script-format API helper
- `state.js` — shared app state, DOM lookup, escaping, shared message helpers
- `navigation.js` — mode switching, help modal, dedicated studio-window launcher
- `healthView.js` — health loading, status pills, parser model selector hydration
- `audioDramaView.js` — Audio Drama project/character/parser/scene/render-line workflow
- `voiceLabView.js` — Voice Lab, voices, takes, conversation generation, recording, formatting
- `waveforms.js` — waveform drawing

`public/app.js` is reduced from 937 lines to 133 lines.

## Wrapper/window feature

- Added `public/wrapper.html`, a local launcher page that opens the studio in a named dedicated browser window.
- Added an `Open Studio Window` button in the main top bar.
- Added a `Wrapper` top-bar link to `/wrapper.html`.

## Route regression tests

Added `tests/routes.test.js` to spawn the local server with a temporary data root and verify:

- `GET /api/scenes/selected` is not swallowed by the generic `/api/scenes/:id` route.
- `POST /api/scenes/render` returns the explicit deferred `501` response.

## Validation run

- `npm test`: 25 pass, 0 fail
- `node --check` passed for `public/app.js`, every `public/modules/*.js`, `server.js`, `src/ollamaParser.js`, `src/engines.js`, `src/config.js`, and `tests/routes.test.js`.
- Static smoke test confirmed `/wrapper.html`, `/app.js`, and `/modules/api.js` are served by the local Node server.

## Not changed

- No scene-wide render implementation.
- No preview assembly implementation.
- No new dependencies.
- No frontend framework.
- No generated audio, voices, local state, model files, or `node_modules` included.
