# BigMac VoiceTools UI Rework Handoff Document

This document serves as a complete map of the current architecture, features, workflows, and endpoints of BigMac VoiceTools. It is designed to guide the next development phase in successfully redesigning the UI layout and user experience without breaking functional pipelines.

---

## 1. Product Overview
BigMac VoiceTools is a local-only voice cloning and multi-character audio drama orchestration suite. 
- **Topology:** A split client/server architecture.
  - **MacBook Client/Control Surface:** Serves the frontend UI on port `7870` and runs the Node wrapper process.
  - **BigMac Inference Backend:** A remote workstation reached via `ssh westcat` that runs the heavy GPU-based inference tools (Chatterbox, F5-TTS, Seed-VC) and Ollama.
- **Port/Tunnel Doctrine:**
  - **Local Wrapper:** `http://127.0.0.1:7870`
  - **Chatterbox Tunnel:** `127.0.0.1:7860` (established via SSH from MacBook to BigMac remote port `7860`).
  - **Ollama Tunnel:** `127.0.0.1:11435` (mapped to BigMac Ollama port `11434` for model search and parsing).
- **Launcher:** Pressing the macOS Dock icon executes a check-first launcher wrapper. If ports `7870` or `7860` are down, it runs the canonical script `/Users/andrew/bin/bigmac-voicetools-launch` to restore tunnels and LaunchAgents.

---

## 2. Main Workflows

### 2.1 Health Check
- The client queries `/api/health` to confirm the local Node wrapper is up, the SSH route reaches `bigmac@bigmac`, the remote voice server is listening on port `7860`, the local tunnel is open, and raw storage drives are mounted.
- If Ollama is used, it also queries `/api/script/parser-health` to check if a valid LLM (Gemma, Llama, etc.) is loaded.

### 2.2 Voice Upload/Save
- In the Voice Lab panel, the user enters a voice name, tags, and optional notes.
- They either upload a local WAV/MP3/M4A file or record a short micro-sample directly in the browser (captured via MediaRecorder API).
- The file is base64 encoded and sent to the backend, which writes it to the remote backend voice reference directory and performs an audio quality analysis (clipping, silence, volume variance).

### 2.3 Voice Synthesis/Render (Single / Conversation)
- **Single Render:** The user inputs text, selects a saved voice, selects the model kind (Standard/Turbo), and tweaks settings (Exaggeration, CFG Weight). The backend invokes the Chatterbox API to synthesize a WAV take.
- **Conversation Render:** The user sets up 1-4 character slots mapping speaker names to voices. They enter a multi-turn script (e.g. `Ava: hello \n Ben: hi`). The app formats it, maps speakers, runs sequential generations, and saves takes.

### 2.4 Audio Drama Project Creation
- The user creates a named project (stored in JSON state). This acts as a folder boundary for characters, scenes, and generated takes.

### 2.5 Character Creation & Voice Binding
- Within a project, the user creates characters, giving them names (e.g. `TIGER`) and binding them to a saved voice ID from the Voice Library. They can set default speech overrides here.

### 2.6 Script Parsing (Ollama)
- The user imports or pastes a screenplay script block into the scene editor. They hit "Parse Script". The app sends the script to the Ollama parser on BigMac, which extracts dialogue turns, assigns speaker names, normalizes texts, and returns structured JSON containing scene titles and sequential lines.

### 2.7 Speaker/Character Binding Preflight
- The app analyzes the parsed script turns and lists unique speaker names. The user maps these script speaker names (e.g. "TIGER") to saved project characters. A status badge displays "Ready" only when mapping is complete.

### 2.8 Render-Line & Render Ready Lines
- **Render Line:** Clicking "Render Line" executes inference for a single line using resolved speech settings, generating a take.
- **Render Ready Lines:** The user hits "Render Ready Scene Lines" to sequential-queue render all unrendered lines in the active scene. The queue processes them sequentially, skipping unknown speakers or empty lines.

### 2.9 Take Review & Selected Take Persistence
- Each line card can expand to show all its generated takes. Each take has a play button, waveform, parameters details, and a delete button.
- The user clicks "Select Take" to mark a specific take as the scene-selected audio for that line. This maps `lineId` -> `takeId` inside `selectedTakes` and persists across page restarts.

### 2.10 Selected-Take Preview Assembly & Polish (Timing/Fades)
- The user hits "Assemble Scene Preview". The backend gathers the selected takes for all scene lines in sequence.
- It calculates spacing using scene-wide default gaps, line-level gap overrides (`pauseAfterMs`), and applies take-level fade-in/fade-out commands.
- It builds a single complex `ffmpeg` filter command, runs it on BigMac, saves the merged WAV, and registers a preview record.

### 2.11 Recent Previews List
- A "Recent Previews" panel lists previously assembled previews for the scene, showing generation time, overrides, gaps, and durations. Clicking play loads the preview into the player.

### 2.12 Open/Download/Copy Preview Actions
- The user can open a preview in a new browser tab, download it locally, or copy its remote path.

### 2.13 Bulk Take/Render Deletion
- Checkboxes on take cards (in Voice Lab or Line Take Review) allow selecting multiple takes to batch delete, or clearing all visible takes. 

---

## 3. Feature Inventory

| Feature Name | User Purpose | UI Location | Key Frontend Files/Functions | Backend Endpoint | Store/Data Touched | Safety Constraints | Redesigned UI Must Preserve |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **System Health Status** | Monitor client-server connectivity | Side rail / Diagnostics fold | `healthView.js` (`loadHealth`, `loadLogs`) | `/api/health`, `/api/script/parser-health` | None | Read-only | Explicit status warnings |
| **Voice Library** | Store and review reference voices | Right rail / Tab screen | `voiceLabView.js` (`renderVoices`, `saveVoice`) | `/api/voices`, `/api/voice-audio` | `state.voices`, voice files | Read-only except saves | Canvas-based waveform drawing |
| **Script Parser** | Parse raw script into dialogue lines | Audio Drama Screen Step 1 | `audioDramaView.js` (`parseRawScript`) | `/api/script/parse` | `state.parsedScript` | None | Tuned prompt templates |
| **Speaker Binder** | Bind script speaker tags to saved voices | Audio Drama Screen Step 2 | `speakerMapping.js` | None | `state.characters` mapping | Badge must block render if missing | Visible mapping dots/dots mapping |
| **Sequential Render Queue** | Render whole scene sequentially | Audio Drama Screen Step 3 | `sceneRender.js` | `/api/scenes/render` | `state.takes` | Sequential queue to avoid GPU memory crash | Render queue status updates, skips count |
| **Take Selector** | Audition takes and mark the canonical one | Audio Drama Screen Step 4 | `takeReview.js` | `/api/scenes/selected`, `/api/scenes/select-take` | `state.selectedTakes` | Deleting takes clears mapping | Check badge / active selected take state |
| **Preview Assembly** | Concatenate takes with gap and fade controls | Audio Drama Screen Step 5 | `previewAssembly.js` | `/api/scenes/preview` | `state.previews` | strict audio allowlist checks | Gap inputs, fade inputs, duration estimation |
| **Recent Previews** | Play past assemblies | Audio Drama Screen Step 5 | `previewAssembly.js` (`loadRecentPreviews`) | `/api/scenes/previews` | `state.previews` | None | Playback, download, copy path |
| **Batch Deletion** | Bulk delete takes safely | Voice Lab & Take Review | `app.js`, `voiceLabView.js`, `takeReview.js` | `/api/takes/delete-batch` | `state.takes`, `state.selectedTakes` | Allowlist match, batch size <= 500 | Checkboxes, confirm alert, clear counts |

---

## 4. Endpoint Map

| Method | Path | Request Shape | Response Shape Summary | Safety Notes / Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | None | `{ checkedAt, bigMac: { ok }, server: { ok }, ... }` | Diagnostics runbook checks |
| **GET** | `/api/voices` | None | `{ voices: [...] }` | Reads voice profiles list |
| **POST**| `/api/voices` | `{ name, tags, notes, fileName, dataBase64 }` | `{ voice: { id, name, ... } }` | Saves audio locally, runs quality checks |
| **GET** | `/api/voice-audio` | `?id=<voiceId>` | Audio binary stream | Allowlist matched |
| **GET** | `/api/takes` | None | `{ takes: [...] }` | Lists all takes metadata |
| **POST**| `/api/takes/delete` | `{ id }` | `{ ok: true, deleted: take }` | Checks allowlist, deletes remote file via SSH |
| **POST**| `/api/takes/delete-batch` | `{ takeIds: [...] }` | `{ ok: true, deleted: [], skipped: [], errors: [] }` | Size <= 500, parses SSH output, clears DB mapping |
| **POST**| `/api/generate` | `{ voiceId, text, model, exaggeration, cfgWeight }` | `{ take }` | Generates take on BigMac |
| **POST**| `/api/generate-conversation` | `{ turns: [...], model, ... }` | `{ takes: [...] }` | Sequentially renders conversation turns |
| **GET** | `/api/projects` | None | `{ projects: [...] }` | Project index list |
| **POST**| `/api/projects` | `{ id, name }` | `{ project }` | Saves project info |
| **POST**| `/api/characters` | `{ id, projectId, name, voiceId, preferredEngine, speechSettings }` | `{ character }` | Saves character profile |
| **GET** | `/api/scenes/selected` | `?projectId=...&sceneId=...` | `{ projectId, sceneId, selectedTakes: {} }` | Loads active selections |
| **POST**| `/api/scenes/select-take` | `{ projectId, sceneId, lineId, takeId }` | `{ projectId, sceneId, selectedTakes: {} }` | Saves selections, flags take selected |
| **POST**| `/api/scenes/render-line` | `{ projectId, sceneId, lineId }` | `{ takes: [...] }` | Validates, generates audio |
| **POST**| `/api/scenes/render` | `{ projectId, sceneId, lineIds }` | `{ ok, summary: {}, results: [] }` | Sequential render queue endpoint |
| **POST**| `/api/scenes/preview` | `{ projectId, sceneId, mode, gapsMs, fadeInMs, fadeOutMs, lineTiming }` | `{ preview }` | Combines audio using ffmpeg filter script |
| **GET** | `/api/scenes/previews` | `?projectId=...&sceneId=...` | `{ previews: [...] }` | Retrieves scene preview assemblies list |
| **POST**| `/api/script/parse` | `{ text, model }` | `{ turns: [...] }` | Parses text into dialogue using Ollama |
| **POST**| `/api/script/format` | `{ mode: "dialogue", text, characterNames }` | `{ turns: [...] }` | Formats turns without LLM |
| **GET** | `/api/script/parser-health` | None | `{ ok, models: [...] }` | Checks Ollama service status |
| **GET** | `/api/audio` | `?path=<absolutePath>` | Audio binary stream | Strict check against allowed audio root |

---

## 5. Data Model Map

- **Voice:** `{ id, name, tags: [], notes, fileName, qualityWarnings: [], createdAt }`
- **Take (Render):** `{ id, projectId, sceneId, lineId, speaker, voiceId, sourceText, model, settings: {}, speechSettings: {}, outputPath, createdAt }`
- **Project:** `{ id, name, defaultEngine, notes, createdAt, updatedAt }`
- **Character:** `{ id, projectId, name, voiceId, preferredEngine, speechSettings: { delivery, exaggeration, cfgWeight, speed, temperature, seed }, createdAt }`
- **Scene:** `{ id, projectId, title, lines: [{ id, type, speaker, text, takes, speechSettings: {}, timing: { pauseAfterMs } }], createdAt }`
- **Selected Takes (Scene Manifest):** `{ projectId, sceneId, selectedTakes: { [lineId]: takeId }, createdAt, updatedAt }`
- **Preview:** `{ id, projectId, sceneId, remotePath, lineTakeIds: [], includedLineIds: [], skippedLineIds: [], gapsMs, fadeInMs, fadeOutMs, lineTiming: {}, durationEstimateMs, createdAt }`

---

## 6. Current UI Pain Points
- **Density:** Single-page interface exposes forms, lists, queue managers, and players simultaneously, leading to high cognitive load.
- **Ambiguous Terminology:** "Generate Single Take" in Voice Lab versus "Render Line" in Audio Drama confuse users.
- **Workflow Stepper visibility:** The pipeline steps are numbered but lack layout separation.
- **Launcher Port Visibility:** Stale dev servers on port `7873` bypass SSH tunnels. Launcher status must be visually prominent.

---

## 7. Recommended UI Rework Direction
- **Sidebar-Based Navigation:** Move from single page vertical sections to a dedicated dashboard structure:
  - **Dashboard/Home:** Show stack health, active project stats, and launcher connection indicators.
  - **Voice Manager:** Upload/Record voices, tags, and run tests.
  - **Drama Studio:** Multi-step stepper wizard (Step 1: Script & Parse -> Step 2: Bind Speakers -> Step 3: Render Queue -> Step 4: Audit & Select -> Step 5: Assembly & Export).
- **Collapsible Inspector:** Put advanced speech parameters (Exaggeration, CFG Weight, Seed) in a collapsible sidebar drawer.

---

## 8. Non-Negotiables & Hard Boundaries
- **No Cloud Services:** The app must work fully offline (MacBook + BigMac LAN connection).
- **Strict Allowlist Serving:** `/api/audio` must reject files outside the remote output allowlist (returns `403 Forbidden`).
- **No Arbitrary Deletion:** Deletion routes must only delete files located inside the allowed output directory, checking paths locally first.
- **Backward-Compatible Endpoints:** Redesigned UI must query the same API routes. Do not change DB schemas without migration support.

---

## 9. Future UI Validation Checklist
Use this checklist when verifying a redesigned UI:
- [ ] Voice Library: Saves new voices, loads waveforms, and displays quality warning logs.
- [ ] Text Translation: Tuned syntax buttons load pauses.
- [ ] Script Parser: Extracts JSON list correctly.
- [ ] Bindings Matrix: Highlights missing characters, mapping dots change color.
- [ ] Render Line: Triggers take generation, plays audio.
- [ ] Sequential Queue: Runs rendering loop, updates status badge.
- [ ] Take Review checkboxes: Selection count updates, Delete Selected batch works.
- [ ] Preview Assembly: Renders WAV preview with custom gaps and fades.
- [ ] Recent Previews: List renders, plays past previews.
- [ ] Allowlist Safety: Attempting `/api/audio?path=/etc/passwd` returns `403`.
- [ ] Connection Guard: Launching app starts tunnel `7860` and wrapper `7870` safely.
