const SPEAKER_COLORS = [
  { css: "var(--violet)", hex: "#b28cff" },
  { css: "var(--cyan)",   hex: "#64e7ff" },
  { css: "var(--green)",  hex: "#7dffa8" },
  { css: "var(--amber)",  hex: "#ffd166" },
];

const state = {
  voices: [],
  takes: [],
  projects: [],
  characters: [],
  scenes: [],
  parsedScript: null,
  parserModels: [],
  parserModel: "auto",
  currentSceneId: "",
  selectedVoiceId: null,
  advanced: false,
  captureMode: "upload",
  speakerCount: 2,
  showPreview: false,
  recorder: null,
  recordedBlob: null,
  recordStream: null
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return fileToBase64(blob);
}

function setMessage(text, type = "") {
  $("message").textContent = text;
  $("message").className = `message ${type}`.trim();
}

function setDramaStatus(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  $("dramaStatus").textContent = text;
}

const helpContent = {
  global: {
    title: "Studio help",
    body: [
      "Save or record voices in the right rail, write or import a script on the left, then generate either a single take or a multi-character conversation.",
      "Use Tune syntax before generation when text came from a document, notes app, or copy-paste source. It adds pause-friendly line breaks and expands common acronyms."
    ]
  },
  script: {
    title: "Script tips",
    body: [
      "Short sentences and clear punctuation usually produce cleaner timing.",
      "Use Name: dialogue lines for conversations, such as Ava: Hello there.",
      "Use Format document after uploading plain text or Markdown to collapse messy line breaks into speech-ready paragraphs."
    ]
  },
  voice: {
    title: "Voice capture tips",
    body: [
      "Upload works best with a clean WAV, MP3, M4A, or FLAC sample.",
      "Record works directly in the browser. Keep the sample short, close-mic, and mostly free of room noise."
    ]
  },
  characters: {
    title: "Conversation voices",
    body: [
      "Set one to four character slots. Each slot has a speaker name and a saved voice.",
      "Conversation generation uses lines like Ava: Text here. Lines without a name use the first character."
    ]
  },
  outputs: {
    title: "Outputs",
    body: [
      "Each generated take gets a card with a waveform, audio player, copy-path action, and delete action.",
      "Open Big Mac output folder opens the actual Chatterbox output directory on Big Mac."
    ]
  }
};

function pill(label, item) {
  const ok = item?.ok;
  return `<button class="status-pill ${ok ? "ok" : "warn"}" title="${escapeHtml(item?.detail || "")}" type="button">${label}: ${ok ? "OK" : "Check"}</button>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderParserModelOptions(parser) {
  const select = $("parserModelSelect");
  if (!select) return;
  const models = parser?.models || [];
  const selected = state.parserModel && state.parserModel !== "auto"
    ? state.parserModel
    : parser?.selectedModel || parser?.model || "auto";
  state.parserModels = models;
  if (selected) state.parserModel = selected;
  const autoLabel = parser?.selectedModel ? `Auto / best available (${parser.selectedModel})` : "Auto / best available";
  select.innerHTML = `<option value="auto">${escapeHtml(autoLabel)}</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  select.value = models.includes(state.parserModel) ? state.parserModel : "auto";
}

async function loadHealth() {
  try {
    const health = await api("/api/health");
    const parserQuery = state.parserModel && state.parserModel !== "auto" ? `?model=${encodeURIComponent(state.parserModel)}` : "";
    const parser = await api(`/api/script/parser-health${parserQuery}`).catch((error) => ({ ok: false, detail: error.message, models: [] }));
    renderParserModelOptions(parser);
    $("statusRail").innerHTML = [
      pill("Big Mac", health.bigMac),
      pill("Server", health.server),
      pill("Tunnel", health.tunnel),
      pill("Parser", parser),
      pill("Disk", health.disk),
      pill("Raw GUI", health.rawGui),
      pill("Wrapper", health.wrapper)
    ].join("");
    $("diagnosticsText").textContent = JSON.stringify({ health, parser }, null, 2);
    $("healthScreenDetails").textContent = JSON.stringify({ health, parser }, null, 2);
    $("parserTunnelCopy").textContent = parser.copy || "The parser uses the MacBook-side tunnel to BigMac Ollama. This is not MacBook-local inference.";
    const parserModelStatus = $("parserModelStatus");
    if (parserModelStatus) {
      parserModelStatus.textContent = parser.selectedModel
        ? `Configured: ${parser.configuredModel || parser.requestedModel || "auto"}. Selected: ${parser.selectedModel}. Available models: ${(parser.models || []).length}.`
        : `No usable parser model selected. Available models: ${(parser.models || []).length}.`;
    }
  } catch (error) {
    $("statusRail").innerHTML = `<button class="status-pill warn" type="button">Health: Failed</button>`;
    $("diagnosticsText").textContent = error.message;
    $("healthScreenDetails").textContent = error.message;
  }
}

async function loadVoices() {
  const { voices } = await api("/api/voices");
  state.voices = voices;
  if (!state.selectedVoiceId && voices[0]) state.selectedVoiceId = voices[0].id;
  renderVoices();
  renderCharacterSlots();
  updateGenerateCopy();
}

async function loadTakes() {
  const { takes } = await api("/api/takes");
  state.takes = takes;
  renderTakes();
}

function renderVoices() {
  const html = voiceCardsHtml();
  if (!state.voices.length) {
    $("voiceList").innerHTML = `<div class="empty-state"><p>No voices saved. Upload or record a reference sample.</p></div>`;
    $("voicesScreenList").innerHTML = `<div class="empty-state"><p>No voices saved. Upload or record a reference sample.</p></div>`;
    renderCharacterVoiceOptions();
    return;
  }
  $("voiceList").innerHTML = html;
  $("voicesScreenList").innerHTML = html;
  renderCharacterVoiceOptions();
}

function voiceCardsHtml() {
  return state.voices.map((voice) => {
    const selected = voice.id === state.selectedVoiceId;
    const warnings = (voice.qualityWarnings || []).map((warning) => `<div class="meta-line warning">${escapeHtml(warning)}</div>`).join("");
    return `
      <article class="voice-card ${selected ? "selected" : ""}">
        <button class="icon-button" data-select-voice="${voice.id}" type="button">
          <strong>${escapeHtml(voice.name)}</strong>
          <div class="meta-line">${escapeHtml((voice.tags || []).join(", ") || "untagged")}</div>
          <div class="meta-line">${escapeHtml(voice.notes || "No notes")}</div>
          <canvas class="waveform" data-waveform-src="/api/voice-audio?id=${encodeURIComponent(voice.id)}"></canvas>
          ${warnings}
        </button>
      </article>
    `;
  }).join("");
}

function renderTakes() {
  const empty = `<p>No takes yet. Save or record a voice, generate, then the output lands here.</p>`;
  if (!state.takes.length) {
    $("takesList").classList.add("empty-state");
    $("takesList").innerHTML = empty;
    $("takesScreenList").classList.add("empty-state");
    $("takesScreenList").innerHTML = empty;
    return;
  }
  const html = takesHtml();
  $("takesList").classList.remove("empty-state");
  $("takesList").innerHTML = html;
  $("takesScreenList").classList.remove("empty-state");
  $("takesScreenList").innerHTML = html;
  drawWaveforms();
}

function takesHtml() {
  return state.takes.map((take) => `
    <article class="take-card">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(take.model)} take</h3>
          <div class="meta-line">${escapeHtml(new Date(take.createdAt).toLocaleString())}</div>
        </div>
        <button class="reactive-button" data-copy-path="${escapeHtml(take.outputPath)}" type="button">Copy path</button>
        <button class="reactive-button" data-delete-take="${escapeHtml(take.id)}" type="button">Delete</button>
      </div>
      <p>${escapeHtml(take.sourceText)}</p>
      <div class="meta-line">${escapeHtml(take.outputPath)}</div>
      <canvas class="waveform" data-waveform-src="/api/audio?path=${encodeURIComponent(take.outputPath)}"></canvas>
      <audio controls preload="none" src="/api/audio?path=${encodeURIComponent(take.outputPath)}"></audio>
    </article>
  `).join("");
}

function updateGenerateCopy() {
  const voice = state.voices.find((item) => item.id === state.selectedVoiceId);
  $("generateSubtext").textContent = voice ? `Using ${voice.name}` : "Select a voice first";
}

function renderCharacterSlots() {
  const defaultNames = ["Ava", "Ben", "Casey", "Drew"];
  const container = $("characterSlots");
  container.innerHTML = "";

  for (let i = 0; i < state.speakerCount; i++) {
    const color = SPEAKER_COLORS[i];

    const labelDiv = document.createElement("div");
    labelDiv.className = "character-slot-label";
    const dot = document.createElement("span");
    dot.className = "speaker-dot";
    dot.style.background = color.hex;
    dot.style.boxShadow = `0 0 6px ${color.hex}88`;
    labelDiv.appendChild(dot);
    labelDiv.appendChild(document.createTextNode(`Speaker ${i + 1}`));

    const slotDiv = document.createElement("div");
    slotDiv.className = "character-slot";

    const nameInput = document.createElement("input");
    nameInput.className = "character-name";
    nameInput.dataset.characterIndex = String(i);
    nameInput.value = defaultNames[i] || `Speaker ${i + 1}`;
    nameInput.setAttribute("aria-label", `Character ${i + 1} name`);
    nameInput.dataset.tip = "Must match the name before the colon in your script";

    const voiceSelect = document.createElement("select");
    voiceSelect.className = "character-voice";
    voiceSelect.dataset.characterIndex = String(i);
    voiceSelect.setAttribute("aria-label", `Character ${i + 1} voice`);
    voiceSelect.dataset.tip = "Voice used for this speaker";

    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "Choose voice";
    voiceSelect.appendChild(blankOpt);

    for (const voice of state.voices) {
      const opt = document.createElement("option");
      opt.value = voice.id;
      opt.textContent = voice.name;
      voiceSelect.appendChild(opt);
    }

    slotDiv.appendChild(nameInput);
    slotDiv.appendChild(voiceSelect);

    const wrapper = document.createElement("div");
    wrapper.appendChild(labelDiv);
    wrapper.appendChild(slotDiv);
    container.appendChild(wrapper);
  }

  renderScriptPreview();
}

function buildColorMap() {
  const map = new Map();
  getCharacters().forEach((char, i) => {
    if (char.name) map.set(char.name.toLowerCase(), SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
  });
  return map;
}

function renderScriptPreview() {
  const previewEl = $("scriptPreview");
  const countEl = $("previewCount");
  previewEl.innerHTML = "";
  countEl.textContent = "";
  if (!state.showPreview) return;

  const raw = ($("scriptText").value || "").trim();
  if (!raw) {
    const p = document.createElement("p");
    p.className = "preview-narration";
    p.style.padding = "8px 14px";
    p.textContent = "Nothing to preview yet.";
    previewEl.appendChild(p);
    return;
  }

  const colorMap = buildColorMap();
  let turnCount = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colon = trimmed.indexOf(":");
    if (colon < 1) {
      const div = document.createElement("div");
      div.className = "preview-line preview-narration";
      const span = document.createElement("span");
      span.className = "preview-text";
      span.textContent = trimmed;
      div.appendChild(span);
      previewEl.appendChild(div);
      continue;
    }

    const speaker = trimmed.slice(0, colon).trim();
    const text = trimmed.slice(colon + 1).trim();
    if (!text) continue;
    turnCount++;

    const color = colorMap.get(speaker.toLowerCase());
    const div = document.createElement("div");
    div.className = "preview-line";
    if (color) div.style.setProperty("--speaker-color", color.css);

    const badge = document.createElement("span");
    badge.className = "preview-speaker";
    badge.textContent = speaker;

    const textSpan = document.createElement("span");
    textSpan.className = "preview-text";
    textSpan.textContent = text;

    div.appendChild(badge);
    div.appendChild(textSpan);
    previewEl.appendChild(div);
  }

  if (!previewEl.children.length) {
    const p = document.createElement("p");
    p.className = "preview-narration";
    p.style.padding = "8px 14px";
    p.textContent = "No dialogue turns found — use Name: text format, one turn per line.";
    previewEl.appendChild(p);
  }

  countEl.textContent = turnCount ? `${turnCount} turn${turnCount === 1 ? "" : "s"}` : "";
}

async function saveVoice(event) {
  event.preventDefault();
  let fileName = "";
  let dataBase64 = "";

  if (state.captureMode === "upload") {
    const file = $("voiceFile").files[0];
    if (!file) {
      setMessage("Choose a reference audio file first.", "error");
      return;
    }
    fileName = file.name;
    dataBase64 = await fileToBase64(file);
  } else {
    if (!state.recordedBlob) {
      setMessage("Record a sample first.", "error");
      return;
    }
    fileName = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    dataBase64 = await blobToBase64(state.recordedBlob);
  }

  setMessage("Saving voice and checking audio quality...");
  const { voice } = await api("/api/voices", {
    method: "POST",
    body: JSON.stringify({
      name: $("voiceName").value,
      tags: $("voiceTags").value,
      notes: $("voiceNotes").value,
      fileName,
      dataBase64
    })
  });
  state.selectedVoiceId = voice.id;
  $("voiceForm").reset();
  clearRecording();
  setMessage(`Saved ${voice.name}.`, "ok");
  await loadVoices();
}

async function transformText(kind) {
  const text = $("scriptText").value;
  if (kind === "clean") {
    $("scriptText").value = text.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  }
  if (kind === "sentences") {
    $("scriptText").value = text.replace(/([.!?])\s+/g, "$1\n").trim();
  }
  if (kind === "paragraphs") {
    $("scriptText").value = text.split(/\n+/).map((part) => part.trim()).filter(Boolean).join("\n\n");
  }
  if (kind === "syntax") {
    const { text: tuned, notes } = await formatScript(text, "syntax");
    $("scriptText").value = tuned;
    $("syntaxReport").innerHTML = notes.map((note) => `<span>${escapeHtml(note)}</span>`).join(" · ");
  }
  if (kind === "paragraph-check") {
    const { notes } = await formatScript(text, "paragraph-check");
    $("syntaxReport").innerHTML = notes.map((note) => `<span>${escapeHtml(note)}</span>`).join(" · ");
  }
  if (kind === "dialogue") {
    const characterNames = getCharacters().map((character) => character.name);
    const { turns } = await api("/api/script/format", {
      method: "POST",
      body: JSON.stringify({ mode: "dialogue", text, characterNames })
    });
    $("syntaxReport").innerHTML = [`${turns.length} dialogue turn${turns.length === 1 ? "" : "s"} detected`].map((note) => `<span>${escapeHtml(note)}</span>`).join(" · ");
  }
}

async function formatScript(text, mode) {
  return api("/api/script/format", {
    method: "POST",
    body: JSON.stringify({ mode, text })
  });
}

async function formatDocumentFile() {
  const file = $("documentFile").files[0];
  if (!file) {
    const result = await formatScript($("scriptText").value, "document");
    $("scriptText").value = result.text;
    $("syntaxReport").innerHTML = result.notes.map((note) => `<span>${escapeHtml(note)}</span>`).join(" · ");
    return;
  }
  const text = await file.text();
  const result = await formatScript(text, "document");
  $("scriptText").value = result.text;
  $("syntaxReport").innerHTML = result.notes.map((note) => `<span>${escapeHtml(note)}</span>`).join(" · ");
}

async function drawWaveforms() {
  const canvases = [...document.querySelectorAll("canvas[data-waveform-src]")];
  await Promise.all(canvases.map(drawWaveform).slice(0, 24));
}

async function drawWaveform(canvas) {
  const src = canvas.dataset.waveformSrc;
  if (!src || canvas.dataset.rendered === src) return;
  canvas.dataset.rendered = src;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 54;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(100, 231, 255, 0.08)";
  context.fillRect(0, 0, width, height);
  try {
    const arrayBuffer = await (await fetch(src)).arrayBuffer();
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const mid = height / 2;
    context.strokeStyle = "rgba(100, 231, 255, 0.92)";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 1) {
      let min = 1;
      let max = -1;
      const start = x * step;
      for (let i = 0; i < step && start + i < data.length; i += 1) {
        const value = data[start + i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      context.beginPath();
      context.moveTo(x, mid + min * mid * 0.88);
      context.lineTo(x, mid + max * mid * 0.88);
      context.stroke();
    }
    await audioContext.close();
  } catch {
    context.fillStyle = "rgba(255, 209, 102, 0.82)";
    context.font = "12px Avenir Next, sans-serif";
    context.fillText("Waveform unavailable", 12, 31);
  }
}

async function generate() {
  const voice = state.voices.find((item) => item.id === state.selectedVoiceId);
  if (!voice) {
    setMessage("Save and select a voice first.", "error");
    return;
  }
  const text = $("scriptText").value.trim();
  if (!text) {
    setMessage("Enter text first.", "error");
    return;
  }

  $("generateButton").classList.add("loading");
  $("generateButton").disabled = true;
  setMessage("Generating on Big Mac. First run may load the model slowly.");
  try {
    const { take } = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        voiceId: voice.id,
        text,
        model: $("modelKind").value,
        exaggeration: $("exaggeration").value,
        cfgWeight: $("cfgWeight").value
      })
    });
    setMessage(`Generated take: ${take.outputPath}`, "ok");
    await loadTakes();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    $("generateButton").classList.remove("loading");
    $("generateButton").disabled = false;
  }
}

function getCharacters() {
  const names = [...document.querySelectorAll(".character-name")];
  const voices = [...document.querySelectorAll(".character-voice")];
  return names.map((nameInput, index) => ({
    name: nameInput.value.trim() || `Character ${index + 1}`,
    voiceId: voices[index]?.value || ""
  }));
}

async function generateConversation() {
  const characters = getCharacters();
  const missing = characters.find((character) => !character.voiceId);
  if (missing) {
    setMessage(`Choose a voice for ${missing.name}.`, "error");
    return;
  }
  const text = $("scriptText").value.trim();
  if (!text) {
    setMessage("Enter dialogue first.", "error");
    return;
  }
  const { turns } = await api("/api/script/format", {
    method: "POST",
    body: JSON.stringify({ mode: "dialogue", text, characterNames: characters.map((character) => character.name) })
  });
  const voiceByName = new Map(characters.map((character) => [character.name.toLowerCase(), character.voiceId]));
  const payloadTurns = turns.map((turn) => ({
    speaker: turn.speaker,
    text: turn.text,
    voiceId: voiceByName.get(turn.speaker.toLowerCase()) || characters[0].voiceId
  }));

  $("conversationButton").classList.add("loading");
  $("conversationButton").disabled = true;
  setMessage(`Generating ${payloadTurns.length} conversation turn${payloadTurns.length === 1 ? "" : "s"} on Big Mac.`);
  try {
    const { takes } = await api("/api/generate-conversation", {
      method: "POST",
      body: JSON.stringify({
        turns: payloadTurns,
        model: $("modelKind").value,
        exaggeration: $("exaggeration").value,
        cfgWeight: $("cfgWeight").value
      })
    });
    setMessage(`Generated ${takes.length} conversation take${takes.length === 1 ? "" : "s"}.`, "ok");
    await loadTakes();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    $("conversationButton").classList.remove("loading");
    $("conversationButton").disabled = false;
  }
}

async function loadLogs() {
  const logs = await api("/api/logs");
  $("diagnosticsText").textContent = `MacBook launcher log\n${logs.local || "(empty)"}\n\nBig Mac server log\n${logs.remote || "(empty)"}`;
}

function setView(viewId) {
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("hidden", view.id !== viewId));
  document.querySelectorAll("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === viewId));
}

function renderCharacterVoiceOptions() {
  const select = $("characterVoice");
  select.innerHTML = `<option value="">Choose voice</option>${state.voices.map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`).join("")}`;
}

async function loadDrama() {
  const projectId = $("projectSelect").value || "";
  const [projectsBody, charactersBody, scenesBody] = await Promise.all([
    api("/api/projects"),
    projectId ? api(`/api/characters?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ characters: [] }),
    projectId ? api(`/api/scenes?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ scenes: [] })
  ]);
  state.projects = projectsBody.projects || [];
  state.characters = charactersBody.characters || [];
  state.scenes = scenesBody.scenes || [];
  if (!$("projectSelect").value && state.projects[0]) $("projectSelect").value = state.projects[0].id;
  renderDrama();
}

function renderDrama() {
  const current = $("projectSelect").value;
  $("projectSelect").innerHTML = `<option value="">No project selected</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
  if (current) $("projectSelect").value = current;
  $("dramaCharacters").innerHTML = state.characters.length
    ? state.characters.map((character) => `<article class="compact-card"><strong>${escapeHtml(character.name)}</strong><div class="meta-line">Voice: ${escapeHtml(state.voices.find((voice) => voice.id === character.voiceId)?.name || "missing")}</div></article>`).join("")
    : `<div class="empty-state">No characters for this project.</div>`;
}

async function createProject(event) {
  event.preventDefault();
  const name = $("projectName").value.trim();
  if (!name) return setDramaStatus("Project name is required.");
  const { project } = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, defaultEngine: "chatterbox" }) });
  $("projectSelect").value = project.id;
  $("projectName").value = "";
  await loadDrama();
  setDramaStatus(`Created project ${project.name}.`);
}

async function createCharacter(event) {
  event.preventDefault();
  const projectId = $("projectSelect").value;
  if (!projectId) return setDramaStatus("Create or choose a project first.");
  const name = $("characterName").value.trim();
  if (!name) return setDramaStatus("Character name is required.");
  const { character } = await api("/api/characters", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      name,
      voiceId: $("characterVoice").value,
      preferredEngine: "chatterbox",
      delivery: $("characterDelivery").value
    })
  });
  $("characterName").value = "";
  $("characterDelivery").value = "";
  await loadDrama();
  setDramaStatus(`Created character ${character.name}.`);
}

function renderParsedLines(scene) {
  if (!scene?.lines?.length) {
    $("sceneLineEditor").innerHTML = `<div class="empty-state">No parsed lines yet.</div>`;
    return;
  }
  $("sceneLineEditor").classList.remove("empty-state");
  $("sceneLineEditor").innerHTML = scene.lines.map((line) => `
    <article class="line-card">
      <label><span>Line</span><input data-line-field="id" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.id)}"></label>
      <label><span>Type</span><select data-line-field="type" data-line-id="${escapeHtml(line.id)}">
        ${["dialogue", "narration", "action"].map((type) => `<option value="${type}" ${line.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select></label>
      <label><span>Speaker</span><input data-line-field="speaker" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.speaker)}"></label>
      <label class="wide-field"><span>Text</span><textarea data-line-field="text" data-line-id="${escapeHtml(line.id)}">${escapeHtml(line.text)}</textarea></label>
      <label><span>Emotion</span><input data-line-field="emotion" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.emotion)}"></label>
      <label><span>Pace</span><input data-line-field="pace" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.pace)}"></label>
      <label><span>Delivery cue</span><input data-line-field="deliveryCue" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.deliveryCue)}"></label>
      <label><span>Takes</span><input type="number" min="1" max="10" data-line-field="takes" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.takes)}"></label>
    </article>
  `).join("");
}

function collectEditedScene() {
  const parsedScene = state.parsedScript?.scenes?.[0];
  if (!parsedScene) return null;
  const lines = parsedScene.lines.map((line) => {
    const updated = { ...line };
    document.querySelectorAll(`[data-line-id="${CSS.escape(line.id)}"]`).forEach((input) => {
      updated[input.dataset.lineField] = input.type === "number" ? Number(input.value) : input.value;
    });
    return updated;
  });
  return { ...parsedScene, lines };
}

async function parseRawScript() {
  $("parserOutput").textContent = "Parsing through the BigMac-backed Ollama tunnel...";
  const parsed = await api("/api/script/parse", {
    method: "POST",
    body: JSON.stringify({ rawText: $("rawScriptText").value, model: $("parserModelSelect")?.value || state.parserModel || "auto" })
  }).catch((error) => ({ ok: false, error: error.message }));
  $("parserOutput").textContent = JSON.stringify(parsed, null, 2);
  if (parsed.ok) {
    state.parsedScript = parsed.result;
    renderParsedLines(parsed.result.scenes[0]);
  }
}

async function saveParsedScene() {
  const projectId = $("projectSelect").value;
  if (!projectId) return setDramaStatus("Create or choose a project before saving a scene.");
  const scene = collectEditedScene();
  if (!scene) return setDramaStatus("Parse a script before saving a scene.");
  const saved = await api("/api/scenes", {
    method: "POST",
    body: JSON.stringify({
      id: scene.id,
      projectId,
      title: scene.title,
      rawText: $("rawScriptText").value,
      parsedResult: state.parsedScript,
      lines: scene.lines,
      warnings: scene.warnings || []
    })
  });
  state.currentSceneId = saved.scene.id;
  await loadDrama();
  setDramaStatus(saved);
}

async function renderFirstLine() {
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  const scene = sceneId ? await api(`/api/scenes/${encodeURIComponent(sceneId)}`).then((body) => body.scene) : null;
  const line = scene?.lines?.[0];
  if (!line) return setDramaStatus("Save a scene with at least one line first.");
  const result = await api("/api/scenes/render-line", {
    method: "POST",
    body: JSON.stringify({ sceneId: scene.id, lineId: line.id, takes: line.takes })
  }).catch((error) => ({ error: error.message }));
  setDramaStatus(result);
  await loadTakes();
}

async function refreshSelectedTakes() {
  const projectId = $("projectSelect").value;
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!projectId || !sceneId) return setDramaStatus("Choose a project and save a scene first.");
  setDramaStatus(await api(`/api/scenes/selected?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(sceneId)}`));
}

function setCaptureMode(mode) {
  state.captureMode = mode;
  $("uploadPane").classList.toggle("hidden", mode !== "upload");
  $("recordPane").classList.toggle("hidden", mode !== "record");
  $("uploadTab").classList.toggle("active", mode === "upload");
  $("recordTab").classList.toggle("active", mode === "record");
  $("uploadTab").setAttribute("aria-selected", String(mode === "upload"));
  $("recordTab").setAttribute("aria-selected", String(mode === "record"));
  $("voiceFile").required = mode === "upload";
}

function clearRecording() {
  state.recordedBlob = null;
  $("recordPreview").classList.add("hidden");
  $("recordPreview").removeAttribute("src");
  $("recordStatus").textContent = "Record a short clean sample, then save it.";
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage("This browser cannot record audio.", "error");
    return;
  }
  clearRecording();
  state.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  state.recorder = new MediaRecorder(state.recordStream);
  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  state.recorder.addEventListener("stop", () => {
    state.recordedBlob = new Blob(chunks, { type: state.recorder.mimeType || "audio/webm" });
    $("recordPreview").src = URL.createObjectURL(state.recordedBlob);
    $("recordPreview").classList.remove("hidden");
    $("recordStatus").textContent = "Recording ready. Save it to the voice library.";
    state.recordStream?.getTracks().forEach((track) => track.stop());
    state.recordStream = null;
  });
  state.recorder.start();
  $("recordStart").disabled = true;
  $("recordStop").disabled = false;
  $("recordStatus").textContent = "Recording...";
}

function stopRecording() {
  if (state.recorder?.state === "recording") {
    state.recorder.stop();
  }
  $("recordStart").disabled = false;
  $("recordStop").disabled = true;
}

function openHelp(key) {
  const content = helpContent[key] || helpContent.global;
  $("helpTitle").textContent = content.title;
  $("helpBody").innerHTML = content.body.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  $("helpModal").showModal();
}

document.addEventListener("click", async (event) => {
  const viewTarget = event.target.closest("[data-view-target]");
  if (viewTarget) {
    setView(viewTarget.dataset.viewTarget);
    if (viewTarget.dataset.viewTarget === "audioDramaView") await loadDrama();
    if (viewTarget.dataset.viewTarget === "healthView") await loadHealth();
  }

  const selectVoice = event.target.closest("[data-select-voice]");
  if (selectVoice) {
    state.selectedVoiceId = selectVoice.dataset.selectVoice;
    renderVoices();
    updateGenerateCopy();
  }

  const copyPath = event.target.closest("[data-copy-path]");
  if (copyPath) {
    await navigator.clipboard.writeText(copyPath.dataset.copyPath);
    setMessage("Output path copied.", "ok");
  }

  const deleteTake = event.target.closest("[data-delete-take]");
  if (deleteTake) {
    if (!confirm("Delete this output file and remove the take?")) return;
    await api("/api/takes/delete", {
      method: "POST",
      body: JSON.stringify({ id: deleteTake.dataset.deleteTake })
    });
    setMessage("Output deleted.", "ok");
    await loadTakes();
  }

  const transform = event.target.closest("[data-transform]");
  if (transform) transformText(transform.dataset.transform);

  const help = event.target.closest("[data-help]");
  if (help) openHelp(help.dataset.help);
});

$("voiceForm").addEventListener("submit", saveVoice);
$("generateButton").addEventListener("click", generate);
$("conversationButton").addEventListener("click", generateConversation);
$("refreshButton").addEventListener("click", loadHealth);
$("logsButton").addEventListener("click", loadLogs);
$("formatDocumentButton").addEventListener("click", formatDocumentFile);
$("documentFile").addEventListener("change", formatDocumentFile);
$("speakerCount").addEventListener("change", () => {
  state.speakerCount = Number($("speakerCount").value);
  renderCharacterSlots();
});
$("helpClose").addEventListener("click", () => $("helpModal").close());
$("helpModal").addEventListener("click", (event) => {
  if (event.target === $("helpModal")) $("helpModal").close();
});
$("openRawButton").addEventListener("click", () => window.open("http://127.0.0.1:7860", "_blank"));
$("revealOutputsButton").addEventListener("click", async () => {
  await api("/api/reveal-output-folder", { method: "POST", body: "{}" });
  setMessage("Opened the configured BigMac Chatterbox output folder.", "ok");
});
$("uploadTab").addEventListener("click", () => setCaptureMode("upload"));
$("recordTab").addEventListener("click", () => setCaptureMode("record"));
$("recordStart").addEventListener("click", startRecording);
$("recordStop").addEventListener("click", stopRecording);
$("projectForm").addEventListener("submit", createProject);
$("characterForm").addEventListener("submit", createCharacter);
$("projectSelect").addEventListener("change", loadDrama);
$("refreshDramaButton").addEventListener("click", loadDrama);
$("parserModelSelect")?.addEventListener("change", async (event) => {
  state.parserModel = event.target.value || "auto";
  await loadHealth();
});
$("parseScriptButton").addEventListener("click", parseRawScript);
$("saveSceneButton").addEventListener("click", saveParsedScene);
$("renderFirstLineButton").addEventListener("click", renderFirstLine);
$("refreshSelectedButton").addEventListener("click", refreshSelectedTakes);
$("healthScreenRefresh").addEventListener("click", loadHealth);
$("previewToggle").addEventListener("click", () => {
  state.showPreview = !state.showPreview;
  $("previewToggle").classList.toggle("active", state.showPreview);
  $("scriptPreview").classList.toggle("hidden", !state.showPreview);
  renderScriptPreview();
});

let _previewTimer = null;
$("scriptText").addEventListener("input", () => {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(renderScriptPreview, 180);
});

$("simpleMode").addEventListener("click", () => {
  state.advanced = false;
  $("advancedControls").classList.add("hidden");
  $("simpleMode").classList.add("active");
  $("advancedMode").classList.remove("active");
});
$("advancedMode").addEventListener("click", () => {
  state.advanced = true;
  $("advancedControls").classList.remove("hidden");
  $("advancedMode").classList.add("active");
  $("simpleMode").classList.remove("active");
});

await Promise.all([loadHealth(), loadVoices(), loadTakes()]);
await loadDrama().catch(() => {});
