import { api, blobToBase64, fileToBase64, formatScript } from "./api.js";
import { SPEAKER_COLORS, $, escapeHtml, setMessage, state } from "./state.js";
import { renderCharacterVoiceOptions } from "./audioDramaView.js";
import { drawWaveforms } from "./waveforms.js";

export async function loadVoices() {
  const { voices } = await api("/api/voices");
  state.voices = voices;
  if (!state.selectedVoiceId && voices[0]) state.selectedVoiceId = voices[0].id;
  renderVoices();
  renderCharacterSlots();
  updateGenerateCopy();
}

export async function loadTakes() {
  const { takes } = await api("/api/takes");
  state.takes = takes;
  renderTakes();
}

export function renderVoices() {
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

export function renderTakes() {
  const empty = `<p>No takes yet. Save or record a voice, generate, then the output lands here.</p>`;
  if (!state.takes.length) {
    state.selectedTakeIds.clear();
    $("takesList").classList.add("empty-state");
    $("takesList").innerHTML = empty;
    $("takesScreenList").classList.add("empty-state");
    $("takesScreenList").innerHTML = empty;
    return;
  }

  // Filter out any selected IDs that no longer exist in state.takes
  const existingIds = new Set(state.takes.map(t => t.id));
  for (const selectedId of state.selectedTakeIds) {
    if (!existingIds.has(selectedId)) {
      state.selectedTakeIds.delete(selectedId);
    }
  }

  const selectedCount = state.selectedTakeIds.size;
  const totalCount = state.takes.length;
  const isDeleteDisabled = selectedCount === 0 ? "disabled" : "";
  const isClearAllDisabled = totalCount === 0 ? "disabled" : "";

  const bulkActionBarHtml = `
    <div class="bulk-action-bar">
      <button class="reactive-button" data-takes-action="select-all" type="button">Select All</button>
      <button class="reactive-button" data-takes-action="deselect-all" type="button">Deselect All</button>
      <button class="reactive-button destructive" data-takes-action="delete-selected" ${isDeleteDisabled} type="button">Delete Selected Takes</button>
      <button class="reactive-button destructive" data-takes-action="clear-all" ${isClearAllDisabled} type="button">Clear All Visible Takes</button>
      <span class="selected-count-badge">${selectedCount} of ${totalCount} selected</span>
    </div>
  `;

  const html = bulkActionBarHtml + `<div class="takes-grid">${takesHtml()}</div>`;
  $("takesList").classList.remove("empty-state");
  $("takesList").innerHTML = html;
  $("takesScreenList").classList.remove("empty-state");
  $("takesScreenList").innerHTML = html;
  drawWaveforms();
}

function takesHtml() {
  return state.takes.map((take) => {
    const isChecked = state.selectedTakeIds.has(take.id) ? "checked" : "";
    return `
      <article class="take-card" data-take-card-id="${escapeHtml(take.id)}">
        <div class="take-card-select-row">
          <input type="checkbox" class="take-select-checkbox" data-take-checkbox-id="${escapeHtml(take.id)}" ${isChecked} aria-label="Select take">
          <span class="take-checkbox-label">Select</span>
        </div>
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
    `;
  }).join("");
}

export function updateGenerateCopy() {
  const voice = state.voices.find((item) => item.id === state.selectedVoiceId);
  $("generateSubtext").textContent = voice ? `Using ${voice.name}` : "Select a voice first";
}

export function renderCharacterSlots() {
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

export function renderScriptPreview() {
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

export async function saveVoice(event) {
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
  const fileMeta = $("voiceFileMeta");
  if (fileMeta) { fileMeta.hidden = true; fileMeta.textContent = ""; }
  setMessage(`Saved ${voice.name}.`, "ok");
  await loadVoices();
}

export async function transformText(kind) {
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

export async function formatDocumentFile() {
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

export async function generate() {
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

export function getCharacters() {
  const names = [...document.querySelectorAll(".character-name")];
  const voices = [...document.querySelectorAll(".character-voice")];
  return names.map((nameInput, index) => ({
    name: nameInput.value.trim() || `Character ${index + 1}`,
    voiceId: voices[index]?.value || ""
  }));
}

export async function generateConversation() {
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

export function setCaptureMode(mode) {
  state.captureMode = mode;
  $("uploadPane").classList.toggle("hidden", mode !== "upload");
  $("recordPane").classList.toggle("hidden", mode !== "record");
  $("uploadTab").classList.toggle("active", mode === "upload");
  $("recordTab").classList.toggle("active", mode === "record");
  $("uploadTab").setAttribute("aria-selected", String(mode === "upload"));
  $("recordTab").setAttribute("aria-selected", String(mode === "record"));
  $("voiceFile").required = mode === "upload";
}

export function clearRecording() {
  state.recordedBlob = null;
  $("recordPreview").classList.add("hidden");
  $("recordPreview").removeAttribute("src");
  $("recordStatus").textContent = "Record a short clean sample, then save it.";
}

export async function startRecording() {
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

export function stopRecording() {
  if (state.recorder?.state === "recording") {
    state.recorder.stop();
  }
  $("recordStart").disabled = false;
  $("recordStop").disabled = true;
}
