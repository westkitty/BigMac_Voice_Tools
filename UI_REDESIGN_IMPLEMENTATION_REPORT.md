# BigMac VoiceTools UI Redesign Implementation Report

## 1. Summary

This pass implements the **confirmed trust/bug fixes** plus the highest-value, lowest-risk slices of the Guided Pipeline / Capability / Casting / Render-Control / Focus direction, while keeping the app runnable and all tests green (now **64/64**, up from 50/50).

What changed and why, in one line each:

- **Multi-scene scripts no longer collapse to scene 0.** A canonical `getActiveScene()`/`getActiveSceneId()` helper in `state.js` is now the single source of truth, honoring `state.currentSceneId`; a scene selector lets users switch and save per scene. This was the most structurally dangerous defect.
- **The parser shows a readable summary** (scenes, speakers, lines, UNKNOWN count, warnings, next action) instead of dumping raw JSON; raw JSON is preserved behind a debug `<details>`.
- **Render Ready Lines submits only the ready set** (`readyLineIds`) and previews blocked lines with reasons before rendering — the action now matches its promise.
- **Silent failures are surfaced:** quick-create character errors now show inline on the speaker row + global status; `copyText` reports real success/failure with a manual-copy fallback instead of always returning `true`.
- **Destructive take deletion uses a scoped modal** (count, scope, irreversibility) instead of bare `confirm()`, with real destructive button styling.
- **Preview visibility uses `el.hidden`** instead of toggling `style.display` while the `hidden` attribute lingers.
- **Health pills are read-only spans**, not dead focusable buttons.
- **CSS debt fixed:** `--normal` token defined; `.destructive` styling added; status/focus tokens introduced.
- **Product leads with the creator outcome** ("Local Audio Drama Studio"), demoting infrastructure.
- **Consent gate + sample checklist** added to voice creation (Save disabled until consent; enforced in `saveVoice`).
- **Focus mode** added as a body-class toggle (persisted) that hides advanced/debug surfaces — not a second app.
- **Halfway routing:** URL hash syncs with the active section, refresh/deep-link restores it, and focus moves to the section heading.

The app's local-first architecture, canonical `127.0.0.1:7870` URL, launch doctrine, and existing backend contracts are unchanged. No backend feature was invented (no undo, no render cancellation, no sample-quality analysis).

## 2. Source Documents Used

- `CLAUDE_UI_REDESIGN_EVALUATION.md` — primary source of truth (verified bug register, IA, roadmap, patch plan).
- `bigmac_voicetools_redesign_walkthrough.claude_reviewed.html` — corrected concept artifact (preview-hidden and render-mismatch corrections).
- `bigmac_voicetools_redesign_walkthrough.html` — original concept artifact (reference only).
- Actual source verified before every change; where the report and code disagreed, the code won (e.g. the workflow step model already existed in `dashboardView.js`, so it was built upon, not duplicated).

## 3. Files Changed

| File | Purpose of Change | Risk |
|---|---|---|
| `public/modules/state.js` | Added canonical `getActiveScene`/`getActiveSceneId`/`getSceneList` helpers | Low |
| `public/modules/audioDramaView.js` | Parser summary, scene selector, `selectScene`, removed `scenes[0]` collapse | Medium |
| `public/modules/audioDrama/sceneRender.js` | Submit ready IDs only; `getBlockedSceneLines` + blocked preview | Medium |
| `public/modules/audioDrama/speakerMapping.js` | Surface quick-create failures inline; use active scene | Low |
| `public/modules/audioDrama/previewAssembly.js` | `el.hidden` visibility; active-scene id | Low |
| `public/modules/audioDrama/takeReview.js` | Scoped destructive modal; active-scene id | Low |
| `public/modules/navigation.js` | Honest async `copyText` + fallback; `confirmDestructive`; hash sync + focus-on-heading; `restoreViewFromHash` | Medium |
| `public/modules/healthView.js` | Pills → read-only spans | Low |
| `public/modules/voiceLabView.js` | Consent enforcement in `saveVoice`; reset gate after save | Low |
| `public/app.js` | Honest copy callers; scoped delete modal; consent gate, file meta, Focus mode, scene-select, hash-restore wiring | Medium |
| `public/index.html` | Topbar reframe; Focus toggle; parser summary + scene selector + raw-JSON fold; consent gate + sample checklist; confirm modal | Medium |
| `public/styles.css` | `--normal` + status/focus tokens; destructive/disabled/focus styling; parser/scene/consent/confirm/focus-mode component styles; reduced-motion | Low |
| `tests/uiRedesign.test.js` | New test file: 14 tests (behavioral scene resolution + source assertions) | Low |
| `UI_REDESIGN_IMPLEMENTATION_REPORT.md` | This report | None |

## 4. Confirmed Fixes Implemented

| Issue | Status | Evidence / File | Test |
|---|---|---|---|
| Raw parser JSON as success surface | ✅ Fixed | `audioDramaView.js renderParseSummary`; raw JSON in `index.html .parser-raw-fold` | `parser renders a human summary and demotes raw JSON` |
| Multi-scene collapse to `scenes[0]` | ✅ Fixed | `state.getActiveScene`; selector in `index.html #sceneSelect`; `selectScene()` | 4 behavioral `getActiveScene…` tests + `no longer hardcodes scenes[0]` |
| Render submits all IDs vs "ready" promise | ✅ Fixed | `sceneRender.js` `lineIds: readyLineIds` + `getBlockedSceneLines` | `scene render submits ready line IDs only` |
| Silent quick-create character failure | ✅ Fixed | `speakerMapping.js showSpeakerRowError` + `pushUiError` + `setDramaStatus` | `quick-create character failure is surfaced` |
| `copyText` lies on failure | ✅ Fixed | `navigation.js` async `copyText` + `showManualCopyFallback`; honest callers in `app.js` | `copyText is async and offers a manual fallback` |
| Native `confirm()` destructive deletion | ✅ Fixed | `navigation.confirmDestructive`; `index.html #confirmModal`; `app.js`/`takeReview.js` | `take deletion uses scoped confirmation` |
| Preview `hidden` semantics | ✅ Fixed | `previewAssembly.js` `audioContainer.hidden = …` | `preview container toggles via el.hidden` |
| Health pills are dead buttons | ✅ Fixed | `healthView.js pill()` → `<span role="status">` | `health pills render as read-only spans` |
| Undefined `--normal` token | ✅ Fixed | `styles.css :root --normal: 200ms` | `CSS defines --normal and styles destructive buttons` |
| `.destructive` class had no CSS | ✅ Fixed | `styles.css .reactive-button.destructive` | same as above |
| Product leads with infrastructure | ✅ Fixed | `index.html` topbar `<h1>Local Audio Drama Studio</h1>` | manual (landmarks test still passes) |
| No consent gate in voice creation | ✅ Fixed | `index.html #voiceConsent`; `voiceLabView.saveVoice` guard | `voice creation has a consent gate` |

## 5. Redesign Features Implemented

| Feature | Status | Notes |
|---|---|---|
| Guided pipeline step model | ✅ Pre-existing, preserved | `dashboardView.workflowModel()` already computes per-step ok/warn/detail; built on rather than duplicated |
| Scene selector (active-scene state) | ✅ New | `#sceneSelect`, shows for multi-scene; saved + parsed scenes |
| Blocked-lines preview before render | ✅ New | `renderBlockedPreview()` lists speaker + reason + excerpt |
| Capability-led product framing | ✅ Partial | Topbar + dashboard hero reframed to outcome; raw diagnostics already foldered in Diagnostics drawer. Full capability-card remap deferred (see §6) |
| Casting consent + sample checklist | ✅ New | Consent gate enforced; checklist is guidance only (no fake SNR analysis) |
| Render Control trust fixes | ✅ Partial | Ready-set payload, blocked preview, human labels in blocked list. Full live queue/log + retry deferred |
| Scoped destructive confirmation | ✅ New | `confirmDestructive()` modal across all take-delete paths |
| Preview readiness (mode select) | ✅ Pre-existing, preserved | `previewModeSelect` skip/fail-on-missing already present; visibility bug fixed |
| Focus mode (simplification layer) | ✅ New | Body-class toggle, localStorage-persisted, same screens/state |
| Halfway hash routing + focus mgmt | ✅ New | `syncHash`, `focusViewHeading`, `restoreViewFromHash`; popovers retained |
| Design tokens + component patterns | ✅ Partial | Status/focus/normal tokens, destructive/disabled/focus styles, parser/consent/confirm components. Full token migration deferred |

## 6. Features Deferred

| Feature | Why Deferred | What Must Happen Next |
|---|---|---|
| Full popover→route migration | The 5 workspaces are `popover="auto"` drawers wired through `navigation.js` + pinned by `uiShell.test.js`; full migration is high-risk in one pass | Replace popovers with routed `.app-view`s behind a feature flag; update `uiShell.test.js`; keep popovers only for help/confirm |
| Live render queue panel + per-line retry | Backend `/api/scenes/render` runs a synchronous server-side loop with no progress stream or cancel API | Add a backend job/SSE/poll model; then render queued/current/done/failed rows with retry |
| Mid-render cancellation | No backend cancellation endpoint exists | Add backend job cancellation; only then expose a Cancel control |
| Sample-quality metrics (SNR/clipping/duration) | Backend does not compute audio analysis; only basic browser file metadata is safe | If/when backend returns analysis, show best-effort badges — never hard-gate on them |
| Scene-level review coverage surface | The inspector already shows `chosen/total`; a dedicated "next unreviewed line" surface needs more review-panel wiring | Add `#sceneReviewCoverage` driven by `selectedTakesMap` with a jump-to-next-unreviewed action |
| Capability-card dashboard remap | Dashboard already shows service cards + workflow steps; a full capability ("Can parse/render/preview") remap is a larger visual change | Map `/api/health` to capability cards; demote remaining raw service cards into Diagnostics |
| Save-all-scenes | Backend `/api/scenes` saves one scene per call; "save all" needs a loop + clear partial-save messaging | Add a save-all that iterates scenes and reports per-scene results; current UI explicitly warns only the active scene saves |
| Dashboard `getActiveScene` parity | `dashboardView.js` keeps a local saved-scenes-only `getActiveScene`; fine for status but not parsed-aware | Optionally import the canonical helper if dashboard should reflect unsaved parsed scenes |

## 7. Tests Run

```
# Baseline (before changes)
npm test → tests 50 / pass 50 / fail 0

# Syntax checks (all changed modules)
node --check public/app.js … public/modules/audioDrama/*.js → all OK

# After changes
npm test → tests 64 / pass 64 / fail 0 / duration ~1.67s
```

New tests in `tests/uiRedesign.test.js` (14): 4 behavioral `getActiveScene` cases (multi-scene id honor, unknown-id fallback, saved-scene path, empty), plus source-assertion locks for the ready-line payload, parser summary, no-`scenes[0]`-collapse, honest `copyText`, span pills, `el.hidden` preview, scoped delete modal, consent gate, CSS `--normal`/destructive, and surfaced quick-create failures.

## 8. Manual QA Checklist

> Requires the live stack: `npm start` → `http://127.0.0.1:7870` with the BigMac backend, Chatterbox (7860), and Ollama (11435) tunnels up. Backend-dependent steps cannot be exercised offline.

- **First launch dashboard:** Home leads with "Local Audio Drama Studio" and the creator-outcome line; infra/URL is the smaller subtle line; service status in header/footer.
- **Add voice consent gate:** Open Voices. "Save voice" is disabled. Check the consent box → button enables; note updates. Choose a file → metadata line appears. Save → form resets and the gate re-disables.
- **Parse multi-scene script:** Paste a script with multiple scenes → readable summary (scenes/speakers/lines/UNKNOWN/warnings/next action) appears; raw JSON only under "Raw parser output (debug)". Scene selector appears when >1 scene.
- **Switch active scene:** Change `#sceneSelect` → speaker binding, line editor, and preview update to the selected scene; "Active scene (1 of N)" reflects it.
- **Bind speaker:** In Step 3, assign/create a character + voice → row status moves Needs character → Needs voice → Ready.
- **Quick-create failure:** With a project selected but backend erroring, choose "[Create character…]" → inline red error on the row + global status message (not console-only); dropdown resets.
- **Render ready lines:** With some speakers unbound → status says "Rendering N ready lines (M blocked will be skipped)"; with none ready → blocked-lines panel lists each blocked line + reason; request payload contains only ready IDs.
- **Take review:** Render, then select takes; selected take is highlighted; inspector shows chosen/total.
- **Preview readiness:** Build preview; player appears via `hidden` toggle; with "Require every line" mode and a missing take, blocked lines are shown.
- **Copy path failure/success:** Copy a preview/diagnostics path → success message only when it actually copied; if clipboard is blocked, a manual-copy prompt appears and the status says "Copy failed".
- **Delete confirmation:** Delete a take / selected / all → scoped modal shows count, scope, and "cannot be undone"; Cancel aborts; Delete proceeds. No native `confirm()`.
- **Focus mode:** Toggle "Focus mode" → advanced/debug folds hide; reload → preference persists.
- **Diagnostics:** Health pills are non-focusable spans; raw JSON and logs remain available in the Diagnostics drawer.
- **Routing/focus:** Navigate between sections → URL hash updates and focus lands on the section heading; reload restores the section.

## 9. Remaining Risks

- **Source-assertion tests** lock several fixes by string match (the repo's established pattern in `uiShell.test.js`). They prevent regressions in intent but do not exercise the DOM; the behavioral `getActiveScene` tests are the only true logic tests added. Backend-dependent flows still need live QA.
- **Parsed-scene IDs:** the scene selector keys on `scene.id`. If the parser ever returns scenes without stable ids, the selector falls back to index labels but `currentSceneId` matching could be imperfect. Verify parser output includes per-scene ids.
- **`window.prompt` fallback** for copy is intentionally crude; it is honest and reliable but not pretty. Acceptable for a local tool.
- **Popovers retained:** routing is "halfway" — hash + focus + restore work, but the workspaces are still Popover API drawers. Deep-linking opens the drawer; this is better than before but not a full route architecture.
- **Focus mode** hides via `display:none` on `.advanced-only`/debug folds; any control a user needs that lives in those folds is hidden in Focus mode by design — ensure no *required* control is only in an advanced fold.
- **Dashboard local `getActiveScene`** is saved-scenes-only; it won't reflect an unsaved parsed multi-scene in the dashboard step summary (the Drama Studio does).

## 10. Next Recommended Patch (next 10 tasks)

1. **Save-all-scenes**: iterate `/api/scenes` per parsed scene, report per-scene results, and replace the "only active scene saves" warning once available.
2. **Capability-card dashboard**: map `/api/health` to "Can parse / Can render / Can assemble preview / Stack degraded"; demote raw service cards to Diagnostics.
3. **Scene review coverage surface**: `#sceneReviewCoverage` with "X of Y lines have a chosen take" + jump-to-next-unreviewed.
4. **Backend render progress**: add SSE/poll to `/api/scenes/render`; render a live queue panel (queued/current/done/failed) with per-line retry.
5. **Per-line retry** wired to `/api/scenes/render-line` for failed rows.
6. **Full route migration** behind a flag: popovers → routed `.app-view`s; update `uiShell.test.js`; keep help/confirm as dialogs.
7. **aria-live announcements** on step changes and render progress; audit focus traps in the confirm/help dialogs.
8. **Contrast audit (measured)** of `--muted`/`--soft` text on panels; adjust tokens and document deltas.
9. **Responsive pass** for dense line-card/take grids at tablet/mobile widths.
10. **DOM-level tests** (jsdom or Playwright) for consent gating, scene switching, and the confirm modal to complement the source-assertion locks.
