# BigMac VoiceTools UI Shell Critique Response Patch

This patch applies the 20-point critique from the first Studio Workspace UI shell pass. It remains a frontend/UI-shell patch and intentionally preserves backend render, preview, delete, launcher, and data-model behavior.

## Applied improvements

1. **Data-driven shell:** dashboard and inspector now compute real project/scene readiness from current state instead of acting as decoration.
2. **Route/view isolation:** view switching records `state.activeView`, toggles `aria-hidden`, marks active nav, and dispatches a `bvt:view-change` event.
3. **Workflow stepper state machine:** Drama Studio steps now derive statuses for Script, Characters, Bind, Render, Review, Preview, and Export.
4. **Functional inspector:** right inspector now shows current project, scene, line count, speaker binding count, chosen takes, and total takes.
5. **Less eager redraw risk:** inactive view refresh behavior is routed through guarded view-change handlers, and errors are captured instead of crashing the whole shell.
6. **Degraded stack banner:** a top-level banner appears if wrapper 7870, Chatterbox 7860, BigMac SSH, or Ollama 11435 are unhealthy.
7. **Relaunch command affordance:** dashboard/system banner exposes a copyable `/Users/andrew/bin/bigmac-voicetools-launch` recovery command.
8. **Voice Library separation groundwork:** existing Voice Lab remains functional, while sidebar and copy now frame it as Voice Library / reference voices / samples.
9. **Clearer destructive-action context:** existing bulk-delete labels remain explicit: Delete Selected Takes and Clear All Visible Takes.
10. **Deletion receipt visibility:** activity drawer now surfaces status/error messages and deletion results remain reflected in message areas.
11. **Terminology cleanup:** the shell uses Command Center, Voice Library, Drama Studio, Chosen Takes, Scene Preview, and Export language.
12. **Dashboard action map:** dashboard cards now guide users to Drama Studio, Voice Library, and System instead of acting as a static home screen.
13. **Export panel added:** Preview Assembly now includes a lightweight Export panel with app URL copy and safety copy.
14. **Global activity drawer:** the bottom drawer now has a live status target used by dashboard logic.
15. **Better empty/error states:** recent-preview failures now render inline error empty states and record UI errors.
16. **Frontend fetch boundaries:** shell-critical refreshes catch failures and push them into `state.uiErrors` instead of silently dying.
17. **Responsive behavior:** sidebar, inspector, workflow step cards, and takes grid now adapt at laptop/tablet widths.
18. **Accessibility baseline:** skip link, focus-visible styling, aria-hidden view toggling, aria-live status areas, and reduced-motion rules were added.
19. **UI shell smoke tests:** added `tests/uiShell.test.js` to lock down the redesigned landmarks, canonical port doctrine, guarded binding, and readiness logic.
20. **Phased handoff preserved:** patch still avoids backend/data rewrites and keeps the next deeper rework safely separable.

## Files changed

- `public/index.html`
- `public/app.js`
- `public/modules/dashboardView.js`
- `public/modules/navigation.js`
- `public/modules/state.js`
- `public/modules/healthView.js`
- `public/modules/audioDramaView.js`
- `public/modules/audioDrama/previewAssembly.js`
- `public/styles.css`
- `tests/uiShell.test.js`
- `UI_REWORK_CRITIQUE_APPLIED.md`
- `UI_REWORK_PATCH_SUMMARY.md`
- `NEXT_ANTIGRAVITY_UNPACK_PROMPT.md`

## Validation performed in sandbox

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

A local sandbox server also served `/` and `/api/health`. BigMac checks cannot be validated inside this sandbox because `ssh westcat` and Mac launch agents are not available here.
