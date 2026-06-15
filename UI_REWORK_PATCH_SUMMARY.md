# Studio Workspace UI Shell v2 Patch Summary

This zip contains the second Studio Workspace UI shell patch for BigMac VoiceTools. It applies the 20 critique improvements from the previous shell pass while preserving all backend behavior.

## What changed

- Added a top-level degraded stack banner for wrapper `7870`, Chatterbox `7860`, BigMac SSH, and Ollama `11435` failures.
- Added a data-driven Drama Studio workflow readiness model.
- Added active Drama Studio step switching for Script, Characters, Bind, Render, Review, Preview, and Export.
- Added a live workflow step summary under the Drama Studio header.
- Added a functional right-side inspector that summarizes the current project, scene, binding count, chosen takes, and total takes.
- Added an activity drawer live status target.
- Added copyable relaunch command controls for `/Users/andrew/bin/bigmac-voicetools-launch`.
- Added a lightweight Export panel under Preview Assembly.
- Added guarded frontend event binding so missing DOM elements record UI errors instead of crashing the app shell.
- Added inline recent-preview error empty states.
- Added responsive layout rules for narrower laptop/tablet widths.
- Added accessibility basics: skip link, focus-visible, reduced-motion, `aria-hidden` view toggling, and live status regions.
- Added `tests/uiShell.test.js` smoke coverage for the new shell.
- Added `UI_REWORK_CRITIQUE_APPLIED.md` mapping each of the 20 critique items to the patch response.

## What did not change

- Backend endpoints are preserved.
- Render logic is preserved.
- Preview assembly logic is preserved.
- Bulk deletion logic is preserved.
- Launcher logic is preserved.
- No generated audio, reference voices, local state, logs, `.env`, or app bundles are included.

## Validation performed here

```text
node --check public/app.js
find public/modules -name '*.js' -print -exec node --check {} \;
node --check server.js
find src -name '*.js' -print -exec node --check {} \;
npm test
```

Result:

```text
tests 50
pass 50
fail 0
```

A local sandbox server served the updated `index.html` and `/api/health`. Real BigMac validation must still be performed on Andrew's machine.
