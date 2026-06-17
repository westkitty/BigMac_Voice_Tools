# Claude UI Redesign Evaluation: BigMac VoiceTools

> Forensic product/design/code evaluation of the redesign walkthrough at
> `bigmac_voicetools_redesign_walkthrough.html`, verified against the live source in
> `/Users/andrew/dex_voice_cloner/`. Confirmed source facts are separated from design judgment.
> Where the earlier audit overstated or got something wrong, this report says so plainly.

---

## 1. Verification Log

- **Date/time of evaluation:** 2026-06-17, ~17:42 EDT (host: macOS, Apple Silicon, zsh).
- **Working directory:** `/Users/andrew/dex_voice_cloner/`
- **Files inspected (read in full or in targeted regions):**
  - `bigmac_voicetools_redesign_walkthrough.html` (full, 294 lines)
  - `README.md` (full)
  - `public/index.html` (topbar, nav, drawers, preview block)
  - `public/styles.css` (tokens, `.hidden`, `.status-pill`, `.bulk-action-bar`, `.preview-audio-container`, destructive)
  - `public/modules/navigation.js` (full)
  - `public/modules/healthView.js` (full)
  - `public/modules/audioDramaView.js` (parser region 464–520)
  - `public/modules/audioDrama/sceneRender.js` (full)
  - `public/modules/audioDrama/speakerMapping.js` (full)
  - `public/modules/audioDrama/previewAssembly.js` (full)
  - `public/modules/audioDrama/takeReview.js` (deletion region)
  - `public/app.js` (deletion region)
  - `server.js` (port config; `/api/scenes/render` handler 537–624)
- **Commands run:**
  - `find . -type f …` (structure map)
  - `grep -n …` across the above files (evidence extraction)
  - `npm test` → **50 tests, 50 pass, 0 fail** (duration ~1.66s)
  - `date`, plus `grep` for `PORT`/`listen` in `server.js`
- **Was the app/server run?** The **test suite was run** (50/50 pass). The **HTTP server was not started**. Reason: the backend is a *remote* host ("BigMac") reached over SSH/tunnels (`ssh westcat`, Ollama tunnel `127.0.0.1:11435`, Chatterbox, ffmpeg on the remote). Starting `npm start` would serve the static shell, but every meaningful action (parse, render, preview) calls the remote backend, which is not reachable from this evaluation environment. Running the shell with a dead backend would prove nothing the source does not already show, and could produce misleading "it's broken" screenshots that are really just "backend offline." I therefore evaluated from source + tests, which is authoritative for the bug claims here.
- **Local URL/port verified from source:** **`http://127.0.0.1:7870`** — confirmed three ways:
  - `server.js:25` → `const port = Number(process.env.PORT || 7870);`
  - `README.md:53` → Default URL `http://127.0.0.1:7870`
  - `public/index.html:17` → "Canonical URL: **127.0.0.1:7870**"
  - **`7999` is wrong.** No occurrence of `7999` exists anywhere in the source.
- **Test results:** `npm test` = 50/50 pass. Matches the walkthrough's "50/50" claim.
- **Environment limitations:** No remote backend; no browser automation run (the `Claude_Preview`/Chrome tools were not used because the meaningful flows require the remote stack). Contrast was reasoned from token values, not measured with a pixel sampler — contrast claims below are labeled accordingly.

---

## 2. Corrected Source Facts

| Claim | Status | Evidence | Correction |
|---|---|---|---|
| Server runs on `127.0.0.1:7870`, not `7999` | ✅ Confirmed | `server.js:25`, `README.md:53`, `index.html:17`; no `7999` in tree | None — earlier "7999" audit was wrong; 7870 stands |
| `npm test` passes 50/50 | ✅ Confirmed | Ran `npm test` → `tests 50 / pass 50 / fail 0` | None |
| Local-only, no cloud APIs | ✅ Confirmed | `README.md:11,74` ("no cloud APIs, no telemetry, no external SaaS"); backend over `ssh westcat` | "Local" = on-prem compute. It does **not** imply consent/rights — keep those separate (see §3) |
| Topbar leads with infrastructure, not outcome | ✅ Confirmed | `index.html:16-17` `<h1>BigMac VoiceTools</h1>` + "MacBook control surface to BigMac inference backend" | Valid critique |
| Nav labels are functional buckets ("Script & Render", "Queue", "Index") | ✅ Confirmed | `index.html:32,34,35` | Valid critique |
| Major workspaces are Popover API drawers | ✅ Confirmed | `index.html:69,240,398,411,424` all `popover="auto"`; `navigation.js:5-11` `DRAWER_VIEWS` | Only `dashboardView` is a real stage; the other 5 are popovers |
| Parser dumps raw JSON as success output | ✅ Confirmed | `audioDramaView.js:470` `parserOutput.textContent = JSON.stringify(parsed, null, 2)` | Valid |
| Only first parsed scene is used | ✅ Confirmed | `audioDramaView.js:475` `renderParsedLines(parsed.result.scenes[0])`; `scenes?.[0]` repeated in `sceneRender.js:11,32`, `speakerMapping.js:36,159`, `previewAssembly.js:47,242` | Multi-scene is structurally collapsed app-wide, not just at parse |
| Render sends `allLineIds` though it computes `readyLines` | ✅ Confirmed (severity lowered) | `sceneRender.js:38` computes `readyLines`; `:56` `allLineIds = scene.lines.map(...)`; `:64` `lineIds: allLineIds` | **Correction to earlier framing:** the backend re-validates each line (`server.js:581 validateRenderLineRequest`) and **skips** non-ready ones. So it does *not* render broken lines — the bug is a **trust/consistency** defect (status says "Rendering N ready lines" while submitting all; `summary.requested` is inflated), not a data-corruption bug |
| Preview audio container has `hidden`, JS toggles `style.display` | ⚠️ Confirmed code / ❌ Effect overstated | `index.html:374` `<div id="previewAudioContainer" … hidden>`; `previewAssembly.js:160` `style.display="block"`, `:222` `"none"` | **Correction:** the walkthrough/earlier audit claim "the player can remain inaccessible because `hidden` still wins" is **technically wrong**. Inline `style.display:block` has higher cascade priority than the UA `[hidden]{display:none}` rule (no `!important`), and no CSS rule targets `.preview-audio-container[hidden]`. So the player **does become visible**. The *real* defect: the `hidden` **attribute is never removed**, leaving the element's `.hidden` IDL state `true` while it renders visibly — a semantics/a11y inconsistency and fragile pattern, not an invisibility bug. Fix is still correct (use `el.hidden = false/true`) |
| Quick-create character fails silently | ✅ Confirmed | `speakerMapping.js:153-155` catch → `console.error(...)` only, no UI surface | Valid |
| Clipboard copy falsely reports success | ✅ Confirmed | `navigation.js:84-90` `writeText(...).catch(()=>{})` then `return true` | Valid; note `previewAssembly.js:25-32` copy path *does* handle failure correctly — the bug is the shared `copyText()` helper |
| Destructive take deletion uses native `confirm()` | ✅ Confirmed | `app.js:68,103,130`; `takeReview.js:166` | Valid |
| Health pills are non-interactive buttons | ✅ Confirmed | `healthView.js:7` renders `<button class="status-pill" type="button">…</button>` with **no** click handler bound anywhere | Should be `<span>` (or wired to open diagnostics). Currently focusable, clickable-looking, do nothing |
| CSS references undefined `--normal` | ✅ Confirmed | `styles.css:1134` `transition: all var(--normal) var(--ease)`; no `--normal:` defined (tokens are `--fast:140ms`, `--slow:260ms`) | Real bug — that transition silently no-ops (invalid var → initial `0s`) |
| Duplicate `.bulk-action-bar` definitions | ❌ Rejected | `grep -c '.bulk-action-bar {'` → **1**. `:1180` is the rule; `:1900` is `.bulk-action-bar .reactive-button` (different selector) | **Earlier claim is false.** No duplicate exists |
| Destructive button styling missing/incomplete | ✅ Confirmed | `takeReview.js:37` uses `class="… destructive …"`; `grep destructive public/styles.css` → **no matches** | The `destructive` class has **zero** CSS — destructive buttons render identically to normal ones. Real bug |
| No consent/rights gate in voice creation | ✅ Confirmed | `grep -i 'consent|permission|rights|acknowledge'` in `index.html` → none; voice form (`index.html:~130-175`) has name/tags/notes/file only | Valid — high-priority for a voice-cloning product |
| Walkthrough's evidence line citations are accurate | ✅ Mostly confirmed | Spot-checked every `source-chip` in the HTML against source; line numbers match | Only factual slip is the "hidden still wins" effect claim (corrected above) |

---

## 3. Product Purpose Reconstruction

**Confirmed purpose.** BigMac VoiceTools is a **local-first, browser-based audio-drama production studio**. The MacBook serves a static control surface and holds project/voice/take state; a remote Apple-Silicon host ("BigMac") does the heavy lifting — Chatterbox for speech synthesis, an Ollama model for script parsing, ffmpeg/ffprobe for preview assembly — reached over SSH/local tunnels with **no cloud, no telemetry** (`README.md:3-11`). The product's actual deliverable is **assembled scene audio**: take a script → parse it → cast speakers to voices → render takes → pick the best takes → assemble a listenable preview → export/open/copy the output (`README.md:58-68`).

**Likely target users (inferred).** A small set — most plausibly a solo creator/hobbyist or a tiny team producing audio drama / narrated fiction, technical enough to run a local stack and an SSH tunnel, but who should *not* have to think about ports, CFG weights, and seeds to make a scene. The home-lab "MacBook → BigMac" framing implies a power user, but the workflow value is creative, not infrastructural.

**Primary workflow.** Voice setup → Project → Script paste → Parse → Speaker/voice binding → Render ready lines → Take review → Preview assembly → Export. This is a **linear production pipeline with gates** (you can't render without bound voices; you can't preview without selected takes).

**Secondary workflows.** Voice library management; health/diagnostics of the local stack; replaying/reviewing previously generated previews; single-voice narration (a simpler one-shot path).

**Main user anxieties / confusions (source-grounded).**
- "Did that save?" — parse output is raw JSON; only scene 0 is kept; save state is implicit.
- "Why won't it render / preview?" — blockers (missing voice, missing selected take) are not legibly surfaced before the action fails.
- "Did my copy/delete actually work?" — clipboard lies on failure; deletes use a bare native dialog; quick-create errors vanish into the console.
- "What is this app even for?" — the first thing the UI says is an infrastructure sentence, not a creative promise.
- "Where did my other scenes go?" — multi-scene scripts silently collapse to scene 0.

**What remains uncertain.**
- Real user count / skill level (no analytics; local-only). Persona is inferred.
- Whether the backend can *restore* deleted takes (so far: no evidence of undo/trash — `/api/takes/delete-batch` deletes files; **do not promise undo**).
- Mobile/tablet usage intent — there's a `1100px` breakpoint in the walkthrough but the *app's* `styles.css` responsive behavior for the dense line/take grids was not exhaustively measured (flagged as responsive risk, not asserted failure).
- Sample-quality analysis capability — whether the backend can return duration/clipping/SNR for an uploaded sample (the Casting Board concept assumes it; unverified).

---

## 4. Source-Backed Bug and UX Issue Register

Severity: **P0** = breaks trust or core flow / data legibility; **P1** = meaningful UX or correctness defect; **P2** = polish/semantics.
Priority: order to fix.

| # | Issue | Type | Severity | Priority | Evidence | Recommended Fix |
|---|---|---|---|---|---|---|
| 1 | Parser dumps raw JSON as the success surface | UX / comprehension | P0 | 1 | `audioDramaView.js:470` | Replace with `renderParseSummary()`: scenes found, speakers, line count, warnings, primary next action. Keep JSON behind a "Raw output" `<details>` |
| 2 | Multi-scene scripts collapse to scene 0 across the app | Correctness / data loss (UX) | P0 | 2 | `audioDramaView.js:475`; `scenes?.[0]` in `sceneRender.js:11,32`, `speakerMapping.js:36,159`, `previewAssembly.js:47,242` | Introduce `state.currentSceneId` as the single source of truth; add a scene selector; save-selected / save-all; never hardcode `scenes[0]` |
| 3 | Render submits all line IDs while claiming "ready lines only" | Trust / consistency | P0 | 3 | `sceneRender.js:38,56,64`; backend skip net at `server.js:581` | Send `readyLines.map(l=>l.id)`; make `summary.requested` reflect the real submitted set so the status message matches |
| 4 | Quick-create character failure is console-only (silent) | Reliability / silent failure | P0 | 4 | `speakerMapping.js:153-155` | Surface row-level error on the speaker row + global `setDramaStatus`/`pushUiError`; keep the dropdown on the failed selection |
| 5 | `copyText()` returns `true` even when clipboard write fails | Trust / silent failure | P1 | 5 | `navigation.js:84-90` | `await writeText`, return real success/failure; on failure show a manual-copy fallback (select text / show path). Mirror the correct pattern already in `previewAssembly.js:25-32` |
| 6 | Destructive take deletion uses native `confirm()`, no scope, no styling | Safety / destructive | P1 | 6 | `app.js:68,103,130`; `takeReview.js:166`; `destructive` class has **no** CSS | Custom modal showing count, scene, affected selected-takes, and remote path; real destructive styling; **no fake undo** unless backend restore exists |
| 7 | Preview container keeps `hidden` attribute while shown via inline `display` | Semantics / a11y | P1 | 7 | `index.html:374`; `previewAssembly.js:160,222,317` | Use `el.hidden = false/true` everywhere; drop the inline `style.display` toggling so the rendered state and IDL state agree |
| 8 | Health "pills" are buttons that do nothing | A11y / semantics | P2 | 8 | `healthView.js:7` | Render `<span class="status-pill">` for read-only status, **or** wire the button to open the diagnostics panel for that subsystem |
| 9 | `transition: all var(--normal)` references an undefined token | CSS debt | P2 | 9 | `styles.css:1134`; no `--normal:` defined | Define `--normal` (e.g. `200ms`) or change to `var(--fast)`/`var(--slow)` |
| 10 | All major workspaces are `popover="auto"` drawers | Architecture | P1 | 10 | `index.html:69,240,398,411,424`; `navigation.js:5-11,38-64` | Move major workspaces to stable hash routes (`#/script`, `#/cast`, `#/render`, `#/review`, `#/preview`); reserve popovers for transient UI (help, confirm). Restores back/forward, deep links, focus management |
| 11 | Topbar / product identity leads with infrastructure | Product clarity | P1 | 11 | `index.html:16-17` | Lead with creative promise ("Local Audio Drama Studio"); demote "MacBook → BigMac / 127.0.0.1:7870" to a status/diagnostics line |
| 12 | No consent/rights gate or sample-quality guidance in voice creation | Trust / ethics | P1 | 12 | voice form `index.html:~130-175`; no consent markup | Add a required consent acknowledgement (disable Save until checked) + pre-upload sample checklist; surface duration/type after file select |
| 13 | `destructive` button class has zero styling | Visual / safety affordance | P2 | 13 | `grep destructive public/styles.css` → none | Add `.reactive-button.destructive` styles (red border/text, hover state) so dangerous actions look dangerous |

**Needs Browser / User Testing (plausible, not source-confirmed):**

| Area | Why it needs testing |
|---|---|
| Contrast of `--muted`/`--soft` text on dark panels | Token values suggest low-contrast small text in places, but I did not measure rendered contrast. Do not claim a WCAG failure until sampled |
| Dense line-card / take grids on tablet/mobile | The app's responsive collapse for the render/review grids wasn't exhaustively verified; flagged as a responsive risk |
| Focus management on drawer open/close and step change | `navigation.js` toggles `aria-hidden`/popover but focus-move and `aria-live` announcements were not runtime-verified |
| Sample-quality analysis feasibility | Casting Board assumes the backend can report clipping/SNR/duration; unverified against `server.js`/remote |
| Whether deleted takes are recoverable | No trash/undo found; confirm with backend before any "Undo" UI is promised |

---

## 5. Evaluation of Existing HTML Walkthrough

The artifact is a single self-contained dark-glass HTML deck: a corrected-audit overview page plus five concept pages, hash-routed by a small inline script. Overall it is **well above the usual "vibe redesign"** — its evidence chips cite real files and (verified) accurate line numbers, it corrected the 7870/7999 port error, and it recommends a defensible hybrid. The weaknesses are a couple of overstated technical claims, missing accessibility in its own markup, and mockups that are illustrative rather than spec-grade.

| Section/Page | What Works | What Is Wrong / Weak | Factual Corrections Needed | Design Corrections Needed |
|---|---|---|---|---|
| **Overview / Corrected audit** | Strong thesis ("design it as a studio, not a console"); evidence register ties to real paths; flow rebuild matches README workflow | Slightly performative tone ("Tiny mercy.", "Naturally."); the preview-hidden evidence overstates the effect | The `previewAssembly.js` chip says the player "can remain inaccessible because `hidden` still wins" — **false**; inline `display:block` overrides UA `[hidden]`. Reframe as a semantics/a11y inconsistency. The render chip should note the backend skip net lowers severity | Add a small legend for P0/P1/P2; the register is text-dense — group by subsystem |
| **Comparable lessons table** | Useful framing (Chatterbox/Coqui/SoVITS/RVC → local-trust + sample requirements) | These are asserted from general knowledge, not from project source; risk of treating competitor framing as verified fact | Label as **design inspiration, not verified product facts** | Keep, but mark clearly as external/inferred |
| **Solution 1 — Guided Pipeline** | Best-matched to the real workflow; mockup shows steps + blockers + explicit save; implementation list is concrete and mostly correct | Mockup `textarea`/`listitem` are illustrative; readiness logic hand-waved | Implementation step "Replace popover workspaces with route-like sections" is correct and important — keep | Show an explicit *blocked* preview state and the "next action" affordance per step |
| **Solution 2 — Timeline Workbench** | Good mental model for the real endpoint (assembled audio); clip/track/missing-take visualization is genuinely useful | Risks implying a full DAW (waveform editing, automation) the backend can't do; per-line timing is real but clip-level scrubbing is not | Clarify scope: it visualizes *line order, speaker tracks, selected/missing takes, pause-after* — not waveform editing | Don't render a fake waveform as if it's editable; tie clips to the real `timing.pauseAfterMs` field |
| **Solution 3 — Casting Board** | Correctly centers the most sensitive part (consent + sample quality); voice readiness badges are right | Sample-health meter assumes analysis the backend may not provide | Mark sample SNR/clipping as **capability-dependent (unverified)** | Separate "consent (always required)" from "sample quality (best-effort)"; don't gate Save on a metric you can't compute |
| **Solution 4 — Render Control Room** | Directly targets the real render mismatch + native-confirm deletion; queue states are the right model | "Stop after current line" / cancellation implies backend support not shown in `server.js` (render is a sequential server loop) | Note cancellation needs a backend hook; today the loop runs server-side to completion | Make "requested set" inspectable *before* submit (this is the actual fix for bug #3) |
| **Solution 5 — Focus Composer** | Correct instinct for first-run; plain-English error reframing is excellent | Slightly underspecified; "Switch to Pro Studio" implies two full UIs to maintain | None factual | Define it as a *mode/filter over the same pipeline*, not a parallel app, to avoid double maintenance |
| **Sidebar "Winning strategy" + "Verified environment"** | Crisp hybrid recommendation; correct 7870 + 50/50 callouts | — | None | Keep |
| **Inline script / a11y of the deck itself** | Hash routing works; print stylesheet is a nice touch | The deck's own nav buttons lack `aria-selected`/`role=tab`; pages toggle `display` without focus move | None | If this becomes a living doc, add tab semantics and focus management (ironic given the report critiques the app for the same) |

---

## 6. Evaluation of the Five Redesign Concepts

### Concept 1: Guided Pipeline Studio
- **Optimizes for:** comprehension and a trustworthy linear flow with explicit gates and save state.
- **Helps most:** the core creator doing the script→preview job — i.e. essentially everyone, including first-timers.
- **Solves:** product clarity (§2 topbar), raw-JSON parse (#1), multi-scene collapse (#2), implicit save state, hidden prerequisites, popover-vs-route architecture (#10), preview readiness legibility.
- **Fails to solve:** fine-grained take/timing work (no track view), and it doesn't by itself add the consent/sample-quality trust layer or a robust render-queue/recovery model.
- **Implementation complexity:** **Medium.** Mostly a re-architecture of navigation (popovers → hash routes), a parse-summary component, a scene selector, and step-readiness computation from existing state. No backend changes required for the core.
- **Risk:** **Low.** It formalizes the workflow the app already implements (`README.md:58-68`); low chance of a dead-end.
- **Verdict:** **KEEP — this is the base.**

### Concept 2: Timeline Workbench
- **Optimizes for:** spatial reasoning about scene structure — line order, speaker tracks, selected vs missing takes, pause-after timing.
- **Helps most:** power users with long, multi-speaker scenes who review takes in bulk.
- **Solves:** take-review legibility, missing-take visibility, per-line timing (`timing.pauseAfterMs` already exists, `previewAssembly.js:69`), preview-gap reasoning.
- **Fails to solve:** onboarding (too dense for first-run); trust/consent; it implies DAW capabilities (waveform editing) the backend doesn't offer.
- **Implementation complexity:** **High.** A timeline/clip renderer, drag-to-select-take interactions, and careful state binding. Easy to over-scope into a fake DAW.
- **Risk:** **Medium-High** if taken literally (uncanny-DAW that can't actually edit audio).
- **Verdict:** **MERGE (scoped).** Adopt the **take-review/preview workspace** as a *line-ordered, speaker-grouped clip view* — not waveform editing. It becomes the Review + Preview screens of Concept 1.

### Concept 3: Casting Board
- **Optimizes for:** trust — consent, sample quality, and clear voice↔character↔role binding.
- **Helps most:** anyone setting up voices, especially the first voice; ethically, *everyone* (it's the cloning-consent surface).
- **Solves:** the missing consent gate (#12), weak pre-upload sample guidance, and binding clarity (`getSpeakerStatus` already computes Ready/Missing voice/Missing character/Unknown — `speakerMapping.js:5-29` — but the UI under-surfaces it).
- **Fails to solve:** the production flow after casting (render/review/preview); sample-health meters assume analysis that may not exist.
- **Implementation complexity:** **Low-Medium.** Consent checkbox + Save gating + sample checklist + readiness badges are cheap. Real sample analysis (SNR/clipping) is the expensive, capability-dependent part — make it optional.
- **Risk:** **Low** for the consent/checklist core; **Medium** only if you hard-gate on a metric you can't compute.
- **Verdict:** **MERGE.** Its **consent + sample-readiness + binding-status** patterns become the Voice and Cast stages of Concept 1.

### Concept 4: Render Control Room
- **Optimizes for:** operational confidence during rendering — queue state, progress, failures attached to rows, safe deletion.
- **Helps most:** users rendering many lines / long sessions.
- **Solves:** the render payload mismatch (#3) by making the requested set inspectable; native-confirm deletion (#6); console-only render errors; vague progress.
- **Fails to solve:** onboarding and voice trust; "stop after current line"/cancellation needs backend support that isn't in `server.js` today (the render loop runs server-side to completion).
- **Implementation complexity:** **Medium**, **High** if cancellation is required (needs a backend job model).
- **Risk:** **Medium.** Don't promise cancellation/undo the backend can't honor.
- **Verdict:** **MERGE.** Its **queue/progress/failure-row + scoped destructive modal** become the Render stage of Concept 1. Defer true mid-run cancellation to a backend job-control phase.

### Concept 5: Focus Composer
- **Optimizes for:** a calm, single-path first-run; plain-English errors instead of error codes.
- **Helps most:** brand-new users and the "I just want one scene" case.
- **Solves:** first-run anxiety; jargon exposure (ports/seeds/CFG hidden until Advanced).
- **Fails to solve:** advanced production by itself; risks a second full UI to maintain if built as a parallel app.
- **Implementation complexity:** **Low-Medium** *if* built as a mode/filter over the same pipeline; **High** if built as a separate UI.
- **Risk:** **Medium** — maintenance duplication if mis-scoped.
- **Verdict:** **KEEP as a MODE.** A "Focus" toggle that hides advanced controls and reframes errors as actions, sharing the Concept 1 routes and state. Not a separate app.

**Are five enough?** Mostly — but they collectively under-serve two things the source shows are weak: **(a) capability-level health on the dashboard** (the app currently exposes seven raw pills incl. "Raw GUI", "Tunnel", "Disk" — `healthView.js:33-41`), and **(b) cross-cutting state/empty/error patterns**. I add one small concept:

### Concept 6 (Claude's addition): Capability Dashboard + System State Kit
- **Optimizes for:** answering "what can I do right now?" on the home stage, and consistent empty/loading/error/success treatment everywhere.
- **Solves:** demotes raw diagnostics (ports/tunnels/disk) behind a details panel; surfaces capabilities ("Can parse", "Can render", "Can assemble preview", "Local stack degraded"); standardizes the silent-failure fixes (#4, #5) into one toast/inline pattern.
- **Complexity:** **Low.** Reuses `/api/health`; it's a presentation re-map, plus a shared status/toast component.
- **Verdict:** **KEEP as the dashboard layer of the hybrid.**

---

## 7. Claude's Own Redesign Recommendation

**Best single concept if forced:** **Guided Pipeline Studio (Concept 1).** It is the only one that fixes comprehension *and* the core flow, matches the README workflow, and is low-risk. Everything else is an enhancement to one stage of it.

**Best hybrid (recommended):** The walkthrough's hybrid is essentially correct. I endorse it with sharper scoping:
- **Base architecture:** Guided Pipeline Studio (hash-routed stages, explicit gates, persistent project/scene/step state).
- **Dashboard layer:** Capability Dashboard (Concept 6) — capabilities up front, raw diagnostics demoted.
- **Voice + Cast stages:** Casting Board's consent gate + sample checklist + binding-status badges.
- **Render stage:** Render Control Room's queue/progress/failure-row + scoped destructive modal (defer true cancellation).
- **Review + Preview stages:** Timeline Workbench's line-ordered, speaker-grouped clip view (selected/missing takes, pause-after) — **not** waveform editing.
- **First-run / simplicity:** Focus Composer as a **mode toggle** over the same routes, not a second app.

**Default interface:** Guided Pipeline with Focus mode **on by default for empty projects** (no voices/no scenes), auto-relaxing to full controls once the user has rendered once or toggles "Pro".

**Advanced / power-user mode:** Full timeline review, per-line speech settings (CFG/temp/seed/exaggeration — these fields already exist, `speakerMapping.js:138-147`), batch operations, raw diagnostics, raw parser JSON.

**Remove or demote:**
- Demote topbar infrastructure line (`index.html:17`) to diagnostics.
- Demote five of the seven health pills (Tunnel, Disk, Raw GUI, Wrapper) behind a Diagnostics details panel; keep capability-level status on the dashboard.
- Remove raw `JSON.stringify(parsed)` as the default parse surface (move to `<details>`).
- Remove the `popover="auto"` architecture for the five workspaces.

**Implement first (highest leverage, lowest risk):** the **P0 confirmed bugs** (parse summary, multi-scene, render payload, silent quick-create) — they restore trust immediately and are independent of the larger re-architecture.

---

## 8. Final Proposed Information Architecture

**Main navigation (left rail, persistent, hash-routed):**
1. **Home** (`#/`) — Capability Dashboard + active-project resume.
2. **Voices** (`#/voices`) — library + create (consent/sample).
3. **Project** (`#/project/:id`) — the pipeline container, with sub-routes:
   - `#/project/:id/script` — paste + parse summary + scene selector
   - `#/project/:id/cast` — speaker→character→voice binding
   - `#/project/:id/render` — queue/progress/failures
   - `#/project/:id/review` — take review (line-ordered clip view)
   - `#/project/:id/preview` — assembly + export/open/copy
4. **Diagnostics** (`#/diagnostics`) — raw health, logs, ports, tunnels (demoted from top of mind).

**Core screens:** Dashboard, Voice library/create, Script+Parse, Cast, Render, Review, Preview.

**Secondary screens:** Recent previews list, single-voice narration (Focus quick path), per-line advanced speech settings.

**On the dashboard:** active project + resume-where-you-left-off; capability status (Can parse / Can render / Can assemble / Stack degraded); next-action CTA; voice-count and "add your first voice" empty state.

**In diagnostics:** the seven raw pills, JSON health/parser dumps (`healthView.js:44-46`), logs (`loadLogs`), ports/tunnels/disk paths, parser model selection.

**In advanced settings:** per-character speech settings (CFG/temp/seed/exaggeration/speed), default takes count, preview gap/fade defaults, parser model override.

**Should NOT be top-level:** ports/tunnels/disk; raw parser JSON; "Raw GUI" status; native technical labels ("Queue", "Index").

---

## 9. Final Proposed Core Workflow

1. **First launch / stack check.** Home shows capability status from `/api/health`, reframed: "Can parse ✓ / Can render ✓ / Can assemble preview ✓" or "Local stack degraded — open Diagnostics." Raw ports stay in Diagnostics. If degraded, the relevant downstream actions are disabled with a reason, not hidden.
2. **Voice creation or selection.** Voice library with readiness badges. Creating a voice requires the consent acknowledgement and shows the sample checklist *before* file pick.
3. **Consent / sample quality.** Save disabled until consent is checked (always). After file select, show duration/type/size; if the backend can compute it, show clipping/SNR risk as best-effort (never hard-gate on an uncomputable metric).
4. **Project creation.** Project is the root object (voices, characters, scenes, takes, previews). Persist active project; offer "Resume."
5. **Script paste / import.** Paste into the script stage; pick parser model (advanced) or accept auto.
6. **Parse summary.** Replace raw JSON with: scenes found, speakers per scene, line counts, warnings (e.g. "1 UNKNOWN speaker"), and one primary next action ("Save scenes → Cast"). Multi-scene results show a selector; save-selected and save-all are explicit. Raw JSON lives in a `<details>`.
7. **Speaker / character binding.** Per-row status from `getSpeakerStatus`: **Ready / Needs character / Needs voice / Unknown**, each with one next action. Quick-create surfaces success *and* failure on the row.
8. **Preflight.** Before render, show the **exact ready set** ("9 of 12 lines ready; 2 need a voice, 1 UNKNOWN") with a fix-link per blocker. This *is* the fix for the render mismatch.
9. **Render queue.** Submit **ready line IDs only**. Show queued/current/done/skipped/failed with human labels (speaker + excerpt, not raw IDs). Failures attach to their row with a retry. "Stop after current line" only if/when a backend job model exists.
10. **Take review.** Line-ordered, speaker-grouped clip view. Selected-take state is scene-level and visible: "14 of 18 lines have a chosen take; 4 to review; next unreviewed →." Missing takes are dashed placeholders.
11. **Preview assembly.** Disabled (or marked "Partial") when required selected takes are missing — show *which* before building, not after failure. Gap/fade/per-line pause controls. Player visibility uses `el.hidden`, deterministic.
12. **Export / open / copy.** Open/Download links activate only after real output exists (no `href="#"` dead links). Copy-path reports true success/failure with a manual fallback.
13. **Recovery paths.** Every failure → a plain-English action ("Add a voice for UNKNOWN", "Re-render line 7", "Pick a take for line 12"). Destructive deletes go through a scoped modal (count, scene, affected selected-takes, remote path). No "Undo" claim unless the backend can restore.

---

## 10. Component-Level Redesign Specification

| Component | Current Problem | New Design | Files Likely Affected | Acceptance Criteria |
|---|---|---|---|---|
| **Dashboard** | Leads with infra; status is raw 7-pill rail | Capability cards (parse/render/preview/stack), active-project resume, next-action CTA | `index.html`, `dashboardView.js`, `healthView.js`, `styles.css` | First sentence is a creative promise; ports not on home; capabilities reflect `/api/health` |
| **Sidebar / navigation** | 5 of 6 sections are `popover="auto"`; functional labels | Persistent rail, hash routes, creative labels (Voices/Script/Cast/Render/Review/Preview/Diagnostics) | `index.html`, `navigation.js` | Back/forward works; deep links restore section; only transient UI uses popovers |
| **Workflow stepper** | Steps don't compute readiness/blockers | 6 steps with done/active/blocked states derived from project/voice/character/take state | `audioDramaView.js`, `dashboardView.js`, new `pipelineState.js` | Each step shows status + one next action; blocked steps explain why |
| **Voice creation card** | No consent; no sample guidance | Consent checkbox gates Save; sample checklist pre-pick; post-pick file facts | `index.html`, `voiceLabView.js` | Save disabled until consent; checklist visible before file dialog |
| **Voice library** | Names only; no readiness/usage | Cards with Ready/Risky/Missing-consent/Missing-file badges + "used by" roles | `voicesView`/`voiceLabView.js`, `styles.css` | Each voice shows readiness + which scenes/roles depend on it |
| **Consent / sample block** | Absent | Required acknowledgement + 20–60s/quiet/no-clip checklist; best-effort metrics if available | `index.html`, `voiceLabView.js` | Cannot save a voice without consent; metrics are optional, never a hard gate |
| **Project card** | Thin; active project state implicit | Persistent active project, resume, scene count, blocker summary | `audioDramaView.js`, `state.js` | Reopening app resumes last project/scene/step |
| **Parser summary** | Raw `JSON.stringify` (`audioDramaView.js:470`) | `renderParseSummary()`: scenes/speakers/lines/warnings + next action; JSON in `<details>` | `audioDramaView.js`, `index.html`, `styles.css` | Default view is human-readable; raw JSON opt-in |
| **Scene selector** | Hardcoded `scenes[0]` everywhere | Selector bound to `state.currentSceneId`; save-selected/save-all | `audioDramaView.js`, `sceneRender.js`, `speakerMapping.js`, `previewAssembly.js` | Multi-scene scripts never collapse to scene 0; all stages read `currentSceneId` |
| **Speaker binding table** | Status computed but under-surfaced; silent quick-create fail | Row status badges + per-row error on quick-create failure | `speakerMapping.js`, `styles.css` | Quick-create failure shows on the row + global status |
| **Line card** | Dense; raw line IDs | Speaker + excerpt label, status, inline take strip | `takeReview.js`, `sceneRender.js`, `styles.css` | No raw IDs in user-facing labels; responsive stack on narrow widths |
| **Render queue** | Sends all IDs; status mismatch; console-only errors | Submit ready IDs; queued/current/done/skipped/failed rows; retry per row | `sceneRender.js`, `server.js` (labels), `styles.css` | `summary.requested` == submitted set; status message matches; errors visible inline |
| **Take review card** | Selected-take state buried | Scene-level "N of M chosen; next unreviewed →"; missing = dashed | `takeReview.js`, `state.js`, `styles.css` | Reviewer can see coverage and jump to next unreviewed line |
| **Preview assembly** | Builds then fails on missing takes; `hidden` semantics bug | Pre-build readiness check; disabled/"Partial" state; `el.hidden` player toggle | `previewAssembly.js`, `index.html` | Missing selections shown before build; player visibility deterministic |
| **Health diagnostics** | 7 raw pills as non-interactive buttons on a prominent rail | `<span>` capability chips on home; full raw panel in Diagnostics route | `healthView.js`, `index.html` | No dead buttons; raw ports/tunnels/disk behind Diagnostics |
| **Error/empty/loading/success states** | Ad hoc; some silent (#4, #5) | Shared toast + inline status component; standard empty/loading/error/success | new `status.js`, `navigation.js`, `styles.css` | Clipboard/quick-create/delete all report real outcomes |
| **Destructive confirmation modal** | Native `confirm()`; `destructive` class unstyled | Custom modal (count/scene/affected selected-takes/remote path); real destructive styling; no fake undo | `app.js`, `takeReview.js`, `index.html`, `styles.css` | Native `confirm()` removed; modal shows scope; destructive buttons visibly dangerous |

---

## 11. Implementation Roadmap

### Phase 1: Correct Confirmed Bugs
- **Included:** #1 parse summary, #2 multi-scene (`currentSceneId`), #3 render payload, #4 silent quick-create, #5 copyText, #6 destructive modal, #7 preview `hidden`, #8 health pills, #9 `--normal`, #13 destructive CSS.
- **Files:** `audioDramaView.js`, `sceneRender.js`, `speakerMapping.js`, `previewAssembly.js`, `navigation.js`, `healthView.js`, `app.js`, `takeReview.js`, `index.html`, `styles.css`.
- **Dependencies:** none (independent of re-architecture). Do #2 (`currentSceneId`) before #3/preview since they share scene state.
- **Acceptance:** parse shows summary not JSON; multi-scene preserved; render submits ready IDs and `requested` matches; quick-create/copy/delete report real outcomes; preview player toggles via `el.hidden`; no dead health buttons; `--normal` defined; destructive buttons styled.
- **Test plan:** extend `tests/` for `getReadySceneLines` payload, parse-summary shape, scene-selection persistence; manual: paste 3-scene script → confirm all 3 selectable; force a clipboard/quick-create failure → confirm visible error. Keep `npm test` green (currently 50/50).

### Phase 2: Rebuild the Core Workflow
- **Included:** popover→hash-route migration (#10), topbar reframe (#11), pipeline stepper readiness, persistent project/scene/step.
- **Files:** `index.html`, `navigation.js`, `dashboardView.js`, `audioDramaView.js`, `state.js`, new `pipelineState.js`, `styles.css`.
- **Dependencies:** Phase 1's `currentSceneId`.
- **Acceptance:** browser back/forward and deep links work; each step computes done/active/blocked; refresh resumes context.
- **Test plan:** route unit tests; manual nav/back/deep-link; `uiShell.test.js` updated for landmarks.

### Phase 3: Add Voice Trust and Casting System
- **Included:** consent gate + sample checklist (#12), voice readiness badges, binding-status surfacing, voice "used by" usage.
- **Files:** `index.html`, `voiceLabView.js`, `voicesView`, `speakerMapping.js`, `styles.css`.
- **Dependencies:** Phase 2 routes.
- **Acceptance:** cannot save a voice without consent; sample checklist precedes file pick; binding rows show Ready/Needs character/Needs voice/Unknown with actions.
- **Test plan:** form-gating unit test; manual consent/sample flow; verify no hard-gate on uncomputable metrics.

### Phase 4: Add Render Control and Take Review
- **Included:** render queue states + human labels + retry; scoped destructive modal; line-ordered clip review; preview pre-build readiness.
- **Files:** `sceneRender.js`, `takeReview.js`, `previewAssembly.js`, `app.js`, `server.js` (optional labels/job model), `styles.css`.
- **Dependencies:** Phases 1–2.
- **Acceptance:** queue shows per-line status + retry; deletes go through scoped modal; review shows coverage + next-unreviewed; preview disabled/"Partial" when takes missing.
- **Test plan:** `preview.test.js` extended for blocked-build path; manual render of a scene with one blocked speaker; delete-flow modal check. **Cancellation deferred** unless a backend job model is added.

### Phase 5: Polish Visual System, Accessibility, Responsive
- **Included:** design tokens (text/surface/border/status/focus), button hierarchy (primary/secondary/tertiary/destructive/disabled-with-reason), empty/loading/error/success patterns, focus management on route/step change + `aria-live`, responsive stacking for dense grids, contrast verification.
- **Files:** `styles.css`, all view modules, `navigation.js`.
- **Dependencies:** Phases 1–4.
- **Acceptance:** measured contrast meets WCAG AA for functional text; focus moves to new step heading on change and is announced; dense grids stack on tablet/mobile; non-interactive badges are not buttons.
- **Test plan:** axe/lighthouse pass; manual keyboard-only run of the full pipeline; contrast sampled (not assumed).

---

## 12. Recommended Patch Plan

> Each task: **Objective → Files → Steps → Definition of Done → Check.** Tasks 1–10 are the confirmed bugs (ship-first); 11–18 are the rebuild.

**1. Replace raw parser JSON with a human summary**
- Files: `audioDramaView.js` (~464–476), `index.html` (parser output region), `styles.css`.
- Steps: add `renderParseSummary(parsed)` (scenes, speakers, line counts, warnings, next action); set it on success; wrap raw JSON in a `<details>`; remove line 470's default JSON dump.
- DoD: success state shows summary; raw JSON is opt-in.
- Check: paste a script → see counts/warnings, not JSON.

**2. Make scene selection the single source of truth (kill `scenes[0]`)**
- Files: `audioDramaView.js:475`, `sceneRender.js:11,32`, `speakerMapping.js:36,159`, `previewAssembly.js:47,242`, `state.js`.
- Steps: render a scene selector bound to `state.currentSceneId`; replace `scenes?.[0]` reads with a `getActiveScene()` helper using `currentSceneId`; add save-selected/save-all.
- DoD: a 3-scene script keeps all 3; switching scenes drives cast/render/review/preview.
- Check: parse 3 scenes → select scene 2 → render targets scene 2.

**3. Send only ready line IDs on render**
- Files: `sceneRender.js:38,56,64`.
- Steps: build `readyIds = readyLines.map(l => l.id)`; send `lineIds: readyIds`; ensure status message count == submitted count.
- DoD: payload == ready set; `summary.requested` matches the status message.
- Check: scene with 2 blocked lines → request shows ready count, not all.

**4. Surface quick-create character failures**
- Files: `speakerMapping.js:125–156`.
- Steps: in the `catch`, set a row-level error (on the `tr[data-speaker]`) and call `setDramaStatus`/`pushUiError`; keep the select on its prior value.
- DoD: a forced 500 shows a visible row + global error.
- Check: simulate API failure → error visible, not console-only.

**5. Make `copyText` honest + add fallback**
- Files: `navigation.js:84–90`.
- Steps: `return navigator.clipboard.writeText(value).then(()=>{status…;return true}).catch(()=>{show manual-copy fallback; return false})`; update callers to respect the boolean.
- DoD: failure path shows fallback and returns false.
- Check: deny clipboard permission → fallback appears, no false "Copied."

**6. Replace native delete confirms with a scoped modal**
- Files: `app.js:68,103,130`, `takeReview.js:166`, `index.html`, `styles.css`.
- Steps: build a `<dialog>`-based destructive modal showing count, scene, affected selected-takes, remote path; route all delete paths through it; **no Undo** unless backend restore is confirmed.
- DoD: no `confirm()` remains for deletes; modal shows scope.
- Check: delete selected → modal lists exactly what's affected.

**7. Fix preview player visibility semantics**
- Files: `previewAssembly.js:160,222,317`, `index.html:374`.
- Steps: replace `style.display="block"/"none"` with `audioContainer.hidden = false/true`; remove the lingering `hidden` attribute inconsistency.
- DoD: rendered state and `.hidden` IDL agree; reset re-hides via `hidden`.
- Check: build preview → player shows and `el.hidden===false`; reset → `el.hidden===true`.

**8. Make health pills correct semantically**
- Files: `healthView.js:5–8,33–41,57`.
- Steps: render read-only `<span class="status-pill">`; OR keep `<button>` and wire it to open the Diagnostics route for that subsystem.
- DoD: no focusable no-op buttons.
- Check: tab through status rail → no dead buttons (or each opens diagnostics).

**9. Define the `--normal` token**
- Files: `styles.css:14–19 (tokens), :1134`.
- Steps: add `--normal: 200ms;` to `:root`, or change `:1134` to `var(--fast)`.
- DoD: no `var(--normal)` resolves to invalid.
- Check: that transition animates.

**10. Style the `destructive` button class**
- Files: `styles.css`, referencing `takeReview.js:37`.
- Steps: add `.reactive-button.destructive { border/text red; hover state }`.
- DoD: destructive buttons look distinct from normal.
- Check: "Delete Selected" is visibly dangerous.

**11. Migrate workspaces from popovers to hash routes**
- Files: `index.html:69,240,398,411,424`, `navigation.js:5–64`.
- Steps: replace `popover="auto"` sections with routed `.app-view`s; map `#/voices`, `#/project/:id/{script,cast,render,review,preview}`, `#/diagnostics`; keep popovers only for help/confirm.
- DoD: back/forward + deep links work; focus moves to the new view heading.
- Check: deep-link `#/project/x/render` loads render directly.

**12. Reframe the topbar / product identity**
- Files: `index.html:14–17`.
- Steps: `<h1>Local Audio Drama Studio</h1>`; move "MacBook → BigMac / 127.0.0.1:7870" to a small status line / Diagnostics.
- DoD: first line is a creative promise.
- Check: home no longer leads with infra.

**13. Build the Capability Dashboard**
- Files: `dashboardView.js`, `healthView.js`, `index.html`, `styles.css`.
- Steps: map `/api/health` to capability cards (Can parse/render/preview/Stack degraded); demote raw pills to Diagnostics; add resume + next-action.
- DoD: home answers "what can I do now?"
- Check: degrade the stack → relevant actions disabled with reason.

**14. Compute pipeline step readiness**
- Files: new `pipelineState.js`, `audioDramaView.js`, `dashboardView.js`.
- Steps: derive done/active/blocked per step from project/voice/character/scene/take state; render stepper accordingly.
- DoD: blocked steps explain why + offer one action.
- Check: missing voice → Cast step blocked with "Assign a voice for UNKNOWN."

**15. Add consent gate + sample checklist to voice creation**
- Files: `index.html` (voice form), `voiceLabView.js`, `styles.css`.
- Steps: required consent checkbox gating Save; checklist before file pick; show file facts after select; best-effort metrics only if backend provides them.
- DoD: cannot save without consent.
- Check: unchecked consent → Save disabled.

**16. Add preview pre-build readiness**
- Files: `previewAssembly.js`, `index.html`.
- Steps: before build, compute lines missing selected takes; disable/"Partial" the build button and list missing lines.
- DoD: missing selections shown before build, not after failure.
- Check: leave one line unselected → build warns first.

**17. Render queue with human labels + retry**
- Files: `sceneRender.js`, `styles.css` (and optional `server.js` labels).
- Steps: render queued/current/done/skipped/failed rows with speaker+excerpt; attach failures to rows; add per-row retry.
- DoD: no raw line IDs in labels; failures retryable.
- Check: force a line failure → row shows error + retry.

**18. Shared status/empty/loading/error/success kit**
- Files: new `status.js`, `navigation.js`, all views, `styles.css`.
- Steps: one toast + inline status component; standard empty/loading/error/success blocks; route #4/#5 through it.
- DoD: consistent feedback everywhere; no silent paths.
- Check: trigger each state → consistent treatment.

---

## 13. Corrected HTML Walkthrough Changes

A reviewed copy was created at `bigmac_voicetools_redesign_walkthrough.claude_reviewed.html` (original preserved untouched).

**What changed:**
- Added a "Claude-reviewed" banner on the overview page noting this is a verified pass with two factual corrections.
- **Corrected the preview-hidden claim.** The original evidence chip said the player "can remain inaccessible because `hidden` still wins." Replaced with the accurate statement: inline `display:block` *does* override UA `[hidden]`, so the player becomes visible; the real defect is that the `hidden` attribute is never removed, leaving an a11y/semantics inconsistency (fix: `el.hidden`).
- **Added the render-mismatch nuance.** Annotated that `server.js:581` re-validates and skips non-ready lines, so the bug is a trust/consistency defect (inflated `requested`, status mismatch), not data corruption.
- **Rejected the "duplicate `.bulk-action-bar`" claim** (not present in the original HTML's register, but noted in a correction box for completeness) and **confirmed** two real CSS bugs the original under-stated: undefined `--normal` and the unstyled `destructive` class.
- Labeled the "Comparable design lessons" (Chatterbox/Coqui/SoVITS/RVC) table as **design inspiration, not verified product facts**.
- Marked **Solution 1 + the documented hybrid** as the recommended direction (the original already leaned this way; made it explicit) and added Concept 6 (Capability Dashboard) to the winning-strategy box.

**Caveats:**
- The mockups remain illustrative, not pixel-spec.
- Contrast and responsive claims in both documents are flagged as needing measurement/runtime testing, not asserted.
- No backend cancellation/undo is promised.

---

## 14. Final Decision

**Best redesign direction:** **Guided Pipeline Studio as the base**, hybridized with Casting Board (consent/sample), Render Control Room (queue/safe-delete), a scoped Timeline-style Review/Preview, a Capability Dashboard, and Focus Composer **as a mode, not a second app**. This matches the walkthrough's hybrid — with the corrections that (a) the preview "invisibility" bug is really a semantics bug, (b) the render mismatch is a trust bug softened by a backend skip net, and (c) the Timeline must not pretend to be a DAW.

**Why:** The product's value is a *linear, gated production pipeline* the code already implements (`README.md:58-68`) but the UI fragments across popovers, raw JSON, implicit state, and silent failures. The fix isn't a new metaphor — it's making the existing workflow legible, honest, and gated. The other concepts are each strong at exactly one stage of that pipeline; merged, they cover it end-to-end without inventing capabilities the backend lacks.

**First three implementation moves:**
1. **Ship the P0 bug fixes** (parse summary, multi-scene `currentSceneId`, ready-only render payload, surfaced quick-create/copy/delete failures). Low risk, immediate trust recovery, no re-architecture needed.
2. **Migrate the five popover workspaces to hash routes** and reframe the topbar — this unlocks back/forward, deep links, and focus management, and is the structural prerequisite for the stepper.
3. **Add the consent gate + capability dashboard** — the two cheapest high-trust wins (ethics + "what can I do now?").

**Biggest risk if the team chooses wrong:** Picking **Timeline Workbench (Concept 2) as the base.** It's the most seductive mockup and the most implementation-hostile: it implies waveform/DAW editing the remote backend doesn't provide, it's hostile to first-run users, and it solves comprehension *last*. Building it first would burn the most engineering effort while leaving the core trust bugs (silent failures, raw JSON, multi-scene collapse) unfixed — a beautiful interface on top of a workflow users still don't understand or trust.
