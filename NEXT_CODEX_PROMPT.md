# Next Codex Prompt — BigMac VoiceTools stabilization after parser model correction

You are continuing work on:

`/Users/andrew/dex_voice_cloner`

Use only this repo path. Do not use the old iCloud path.

## Current patch context

A corrected repo snapshot has already been prepared with these changes:

- Parser no longer defaults to `hermes3:latest`.
- Parser config now defaults to `auto` model selection.
- BigMac Ollama model selection chooses an installed chat/instruct model from `/v1/models` instead of assuming Hermes 3.
- Parser requests can accept a specific model from the UI/API request body.
- Parser health reports configured/requested model, selected model, available models, and whether auto-selection happened.
- Audio Drama UI now includes a Parser model selector populated from BigMac Ollama through the MacBook-side tunnel.
- Take deletion no longer hardcodes `/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/`; it uses the configured remote output allowlist.
- The hardcoded UI success message for the output folder was changed to avoid assuming `wc2tb` forever.
- Tests were updated for auto model selection.

Validation already run on this corrected snapshot:

```sh
npm test
node --check server.js
node --check src/ollamaParser.js
node --check src/engines.js
node --check src/config.js
node --check public/app.js
```

Result:

```text
22 pass, 0 fail
node --check passed for listed files
```

## Critical architecture rule

MacBook is the client/control surface. BigMac is the inference/backend machine.

Do not install, run, or store Ollama models on the MacBook.

Ollama inference must remain on BigMac.

The MacBook app may call:

`http://127.0.0.1:11435/v1`

but this is only the MacBook-side SSH tunnel endpoint. It forwards to BigMac Ollama at:

`BigMac 127.0.0.1:11434`

The expected flow is:

```text
MacBook Node app / browser UI
→ http://127.0.0.1:11435/v1 on the MacBook
→ SSH tunnel com.bigmac.ollama-tunnel
→ BigMac Ollama at 127.0.0.1:11434
→ BigMac-hosted model inference
```

Do not label this as MacBook-local Ollama. Do not suggest MacBook-local Ollama as a fallback.

## Important model-selection rule

Do not force Hermes 3.

Use whatever installed BigMac Ollama model is appropriate for script parsing.

Preferred behavior:

- Fetch installed model IDs from `http://127.0.0.1:11435/v1/models`.
- Prefer chat/instruct models.
- Avoid embedding, image, vision, TTS, whisper, and code-specialized models when a general chat/instruct model is available.
- Allow the user to choose a model in the UI.
- If the configured model is missing, show the available model list and select a suitable installed model when the parser is set to `auto`.
- Never download models to the MacBook.
- Never bind BigMac Ollama publicly.

## Hard constraints

- Local-only.
- No cloud APIs.
- No SaaS calls.
- No telemetry.
- No analytics.
- No external uploads.
- No internet-dependent runtime behavior.
- BigMac performs TTS model inference through `ssh westcat` and `scp`.
- BigMac performs Ollama LLM parsing through the existing MacBook-side tunnel to BigMac Ollama.
- Preserve the existing Node.js 20+ ECMAScript module structure.
- Preserve the plain HTML/CSS/JavaScript frontend.
- Preserve the no-runtime-npm-dependencies design unless there is a strong reason and the change is explicitly justified.
- Preserve Chatterbox as the first working TTS engine.
- Do not remove or loosen the remote output path allowlist for `/api/audio`.
- Do not assume `/api/health` proves generation works.
- Do not blindly migrate remote files from `/Volumes/wc2tb` to `/Volumes/wc1tb`; only keep remote roots configurable for now.
- Do not claim generation works unless a real take is generated and playable.
- Do not commit investigation data, generated audio, uploaded reference voices, secrets, local state, or large model files.
- Do not break existing Voice Lab behavior while continuing Audio Drama Maker.
- Do not rewrite `remote/generate-from-wrapper.py` unless current integration requires it. Inspect first. Preserve the working Chatterbox path.
- Do not convert the app to a frontend framework.

## Before changing code

Run:

```sh
cd /Users/andrew/dex_voice_cloner
pwd
npm test
node --check server.js
node --check src/ollamaParser.js
node --check src/engines.js
node --check src/config.js
node --check public/app.js
ssh westcat 'whoami && hostname && pwd && sw_vers'
curl -fsS http://127.0.0.1:11435/v1/models | jq -r '.data[].id'
```

Proceed only if:

- `pwd` is `/Users/andrew/dex_voice_cloner`
- tests pass
- BigMac SSH first two lines are `bigmac` and `bigmac`
- BigMac Ollama tunnel responds with installed models

If any gate fails, stop and report.

## Tasks for this pass

### 1. Validate parser model auto-selection in the live app

Start the server on an available port.

Open the UI and confirm:

- Audio Drama screen shows a Parser model selector.
- Health screen/parser status lists installed BigMac Ollama models.
- The UI says BigMac-backed Ollama through the MacBook-side tunnel.
- It does not imply MacBook-local Ollama.
- The parser can use either Auto / best available or a user-selected installed model.

Use the demo fixture:

```text
TIGER: [quietly] You built a station and called it permanence.
NARRATOR: The corridor lights failed one at a time.
UNKNOWN: Is anyone still there?
```

Expected parser behavior:

- returns structured JSON or fails safely
- raw script remains preserved
- line IDs are stable
- `TIGER` remains speaker
- `NARRATOR` remains narration/prose speaker where appropriate
- `UNKNOWN` remains explicit when uncertain
- bracketed cue `[quietly]` is captured or preserved

If the selected model produces invalid JSON, report which model was used and whether another installed model works better. Do not blame Hermes 3. Hermes 3 is not required.

### 2. Prove or isolate real Chatterbox generation

Do not rely on raw GUI tunnel `127.0.0.1:7860` as proof.

Test the actual wrapper generation path:

- Reference voice exists locally.
- `/api/generate` can send one short line to BigMac through `ssh westcat`.
- Remote helper exists at `/Volumes/wc2tb/Ai/VoiceTools/chatterbox/generate-from-wrapper.py` or the configured equivalent.
- Remote output is created under the configured output root.
- Local playback through `/api/audio?path=...` works.

If generation fails, report the precise layer:

- missing local reference voice
- SSH route failure
- missing remote helper
- missing remote virtual environment
- Python import failure
- Chatterbox model failure
- output path failure
- audio stream/allowlist failure
- port/tunnel confusion

Health UI must distinguish:

- Raw Chatterbox GUI/tunnel on 7860: diagnostic/optional unless proven required.
- Wrapper generation helper: required for actual app generation.

### 3. Confirm configurable remote output delete behavior

Verify `/api/takes/delete` uses the configured remote output allowlist, not a hardcoded `wc2tb` path.

Acceptance:

- Delete behavior refuses paths outside the configured output root.
- Delete behavior will still work if `BIGMAC_VOICETOOLS_REMOTE_OUTPUT_ROOT` changes later.
- Existing `/api/audio` allowlist remains enforced.

### 4. Split frontend code before adding new UI features

`public/app.js` is still too large for future growth.

Split only if you can do it without breaking behavior.

Preferred split:

```text
public/modules/api.js
public/modules/state.js
public/modules/navigation.js
public/modules/healthView.js
public/modules/voiceLabView.js
public/modules/audioDramaView.js
public/modules/takesView.js
public/modules/voicesView.js
```

Rules:

- Use browser-native ES modules only.
- No build step.
- No frontend framework.
- No npm runtime dependency.
- Preserve current UI behavior.
- Run `node --check` on changed JS files.
- Make sure `index.html` loads modules correctly.

If full splitting is too risky, split only the parser/health/audio-drama code and report what remains.

### 5. Validate the core spine with the smallest real test possible

Target workflow:

```text
raw script
→ parse with selected available BigMac Ollama model
→ review parsed result
→ save scene
→ assign character/voice
→ render one line with multiple takes, if Chatterbox generation is available
→ select a take
→ restart server
→ confirm selected take persists
```

If parser works but Chatterbox generation remains blocked, still validate:

```text
raw script
→ parse
→ save scene
→ assign voice
→ selected-take store tests
```

Report clearly that real render remains blocked.

## Do not add in this pass

- scene-wide render
- preview assembly
- IndexTTS2 integration
- Dia integration
- Kokoro integration
- model downloads
- remote migration to `wc1tb`
- new visual redesign beyond needed UI clarity

## Acceptance criteria

- `npm test` passes.
- `node --check` passes for changed JS files.
- Repo path remains `/Users/andrew/dex_voice_cloner`.
- No old iCloud path references appear.
- Parser health lists available BigMac Ollama models.
- Parser model selection does not depend on Hermes 3.
- Parser can use Auto / best available or a selected installed model.
- Parser fixture succeeds with at least one installed model, or the exact model/output failure is reported.
- The UI never implies MacBook-local Ollama.
- Health distinguishes Chatterbox GUI/tunnel status from wrapper generation readiness.
- Hardcoded remote output delete path remains removed.
- `/api/audio` allowlist remains enforced.
- Voice Lab still loads.
- Audio Drama screen still loads.
- Real Chatterbox generation is tested, or the exact blocker is identified.
- Selected-take persistence remains tested.
- No large audio/model/reference/state files are committed.

## Validation commands

Run from repo root:

```sh
cd /Users/andrew/dex_voice_cloner
pwd
npm test
node --check server.js
node --check src/ollamaParser.js
node --check src/engines.js
node --check src/config.js
node --check public/app.js
ssh westcat 'whoami && hostname && pwd && sw_vers'
curl -fsS http://127.0.0.1:11435/v1/models | jq -r '.data[].id'
npm start
```

Then in another shell, using the actual port reported by the server:

```sh
curl -s http://127.0.0.1:<PORT>/api/health | jq .
curl -s http://127.0.0.1:<PORT>/api/script/parser-health | jq .
```

Manual validation:

1. Open the UI on the actual server port.
2. Confirm navigation still works.
3. Confirm Health lists available BigMac Ollama models.
4. Select Auto / best available or a specific installed parser model.
5. Parse the demo fixture.
6. Save parsed scene.
7. Create/assign a character and reference voice.
8. Try rendering one line with two takes.
9. If render succeeds, play both takes.
10. Select one take.
11. Restart server.
12. Confirm selected take persists.
13. Confirm missing/unconfigured engines still fail clearly.
14. Confirm app does not suggest MacBook-local Ollama.
15. Confirm no old iCloud path reference appears.

## Report back with

1. Files changed.
2. Tests run and exact results.
3. Actual server port used.
4. Installed BigMac Ollama models listed.
5. Parser model selected/configured.
6. Whether parser fixture succeeded.
7. Whether Chatterbox real generation succeeded.
8. If generation failed, exact failure layer.
9. Whether generated audio playback succeeded.
10. Whether selected-take persistence after restart was manually tested.
11. Whether `public/app.js` was split and new file sizes.
12. Whether hardcoded `wc2tb` delete path remains removed.
13. Whether `/api/generate-conversation` still bypasses the engine adapter or was normalized.
14. Any blockers.
15. Next recommended phase.

Stop at stabilization. Do not build new shiny objects. Shiny objects are how useful tools get buried.
