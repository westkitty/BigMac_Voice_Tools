import { api } from "./api.js";
import { $, escapeHtml, pushUiError, setDramaStatus, state } from "./state.js";
import { loadTakes } from "./voiceLabView.js";
import { renderSpeakerMapping, getSpeakerStatus, propagateMappingsToLines } from "./audioDrama/speakerMapping.js";
import { preflightRenderLine } from "./audioDrama/renderPreflight.js";
import { renderLineTakes } from "./audioDrama/takeReview.js";
import { handleRenderReadyLines } from "./audioDrama/sceneRender.js";
import { resetPreviewAssembly, loadRecentPreviews } from "./audioDrama/previewAssembly.js";
import { renderWorkflowStatus } from "./dashboardView.js";

export function renderCharacterVoiceOptions() {
  const select = $("characterVoice");
  if (!select) return;
  select.innerHTML = `<option value="">Choose voice</option>${state.voices.map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`).join("")}`;
}

export async function loadDrama() {
  const projectId = $("projectSelect").value || "";
  const sceneId = state.currentSceneId || state.scenes[0]?.id || "";
  
  const [projectsBody, charactersBody, scenesBody, takesBody] = await Promise.all([
    api("/api/projects"),
    projectId ? api(`/api/characters?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ characters: [] }),
    projectId ? api(`/api/scenes?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ scenes: [] }),
    api("/api/takes")
  ]);

  state.projects = projectsBody.projects || [];
  state.characters = charactersBody.characters || [];
  state.scenes = scenesBody.scenes || [];
  state.takes = takesBody.takes || [];

  if (!$("projectSelect").value && state.projects[0]) {
    $("projectSelect").value = state.projects[0].id;
    return loadDrama(); // reload with project
  }

  // Load selected takes
  const activeSceneId = state.currentSceneId || state.scenes[0]?.id;
  if (projectId && activeSceneId) {
    try {
      const selectedBody = await api(`/api/scenes/selected?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(activeSceneId)}`);
      state.selectedTakesMap = selectedBody.selectedTakes || {};
    } catch (err) {
      console.error("Failed to load selected takes", err);
      pushUiError("Selected takes", err);
      state.selectedTakesMap = {};
    }
  } else {
    state.selectedTakesMap = {};
  }

  renderDrama();
  renderWorkflowStatus();
}

export function renderDrama() {
  const current = $("projectSelect").value;
  $("projectSelect").innerHTML = `<option value="">No project selected</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
  if (current) $("projectSelect").value = current;

  $("dramaCharacters").innerHTML = state.characters.length
    ? state.characters.map((character) => {
        const voiceName = state.voices.find((voice) => voice.id === character.voiceId)?.name || "missing";
        const ss = character.speechSettings || {};
        const settingsList = [];
        if (character.delivery) settingsList.push(`"${character.delivery}"`);
        if (ss.exaggeration !== null && ss.exaggeration !== undefined) settingsList.push(`Exg:${ss.exaggeration}`);
        if (ss.cfgWeight !== null && ss.cfgWeight !== undefined) settingsList.push(`CFG:${ss.cfgWeight}`);
        if (ss.speed !== null && ss.speed !== undefined) settingsList.push(`Spd:${ss.speed}`);
        const settingsText = settingsList.length ? ` | Settings: ${settingsList.join(", ")}` : "";
        return `
          <article class="compact-card">
            <strong>${escapeHtml(character.name)}</strong>
            <div class="meta-line">Voice: ${escapeHtml(voiceName)}${escapeHtml(settingsText)}</div>
          </article>
        `;
      }).join("")
    : `<div class="empty-state">No characters for this project.</div>`;

  renderSpeakerMapping(onSpeakerMappingChanged);

  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  renderParsedLines(scene);
  resetPreviewAssembly();
  loadRecentPreviews().catch((error) => pushUiError("Recent previews", error));
  renderWorkflowStatus();
}

// When speaker mapping changes, we re-propagate and re-render
async function onSpeakerMappingChanged() {
  propagateMappingsToLines();
  renderSpeakerMapping(onSpeakerMappingChanged);
  
  // Update line cards status badges and actions
  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (scene && scene.lines) {
    for (const line of scene.lines) {
      updateLineMappingUI(line);
    }
  }
}

function updateLineMappingUI(line) {
  const badge = $(`status-badge-${line.id}`);
  const btn = document.querySelector(`.render-line-btn[data-line-id="${CSS.escape(line.id)}"]`);
  if (!badge) return;

  const mapping = getSpeakerStatus(line.speaker);
  let statusClass = "badge-error";
  if (mapping.status === "Ready") statusClass = "badge-success";
  else if (mapping.status === "Missing voice" || mapping.status === "Missing character") statusClass = "badge-warning";

  badge.className = `status-badge ${statusClass}`;
  badge.textContent = mapping.status;

  if (btn) {
    if (mapping.status === "Ready") {
      btn.disabled = false;
      btn.title = "Render line with Chatterbox";
    } else {
      btn.disabled = true;
      btn.title = `Blocked: ${mapping.status}`;
    }
  }
}

export async function createProject(event) {
  event.preventDefault();
  const name = $("projectName").value.trim();
  if (!name) return setDramaStatus("Project name is required.");
  const { project } = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, defaultEngine: "chatterbox" }) });
  $("projectSelect").value = project.id;
  $("projectName").value = "";
  await loadDrama();
  setDramaStatus(`Created project ${project.name}.`);
  renderWorkflowStatus();
}

export async function createCharacter(event) {
  event.preventDefault();
  const projectId = $("projectSelect").value;
  if (!projectId) return setDramaStatus("Create or choose a project first.");
  const name = $("characterName").value.trim();
  if (!name) return setDramaStatus("Character name is required.");

  const speechSettings = {
    delivery: $("characterDelivery").value,
    speed: $("charSpeed").value !== "" ? Number($("charSpeed").value) : null,
    temperature: $("charTemp").value !== "" ? Number($("charTemp").value) : null,
    exaggeration: $("charExaggeration").value !== "" ? Number($("charExaggeration").value) : null,
    cfgWeight: $("charCfgWeight").value !== "" ? Number($("charCfgWeight").value) : null,
    seed: $("charSeed").value !== "" ? Number($("charSeed").value) : null
  };

  const { character } = await api("/api/characters", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      name,
      voiceId: $("characterVoice").value,
      preferredEngine: "chatterbox",
      delivery: $("characterDelivery").value,
      speechSettings
    })
  });

  $("characterName").value = "";
  $("characterDelivery").value = "";
  $("charSpeed").value = "";
  $("charTemp").value = "";
  $("charExaggeration").value = "";
  $("charCfgWeight").value = "";
  $("charSeed").value = "";

  await loadDrama();
  setDramaStatus(`Created character ${character.name}.`);
  renderWorkflowStatus();
}

function getEffectiveLineSettings(line) {
  const defaults = {
    delivery: "",
    speed: 1.0,
    temperature: null,
    exaggeration: 0.5,
    cfgWeight: 0.5,
    seed: null
  };

  const mapping = getSpeakerStatus(line.speaker);
  const character = mapping.character;
  const cs = character?.speechSettings || {};
  const ls = line.speechSettings || {};

  const effective = { ...defaults };
  const source = {
    delivery: "default",
    speed: "default",
    temperature: "default",
    exaggeration: "default",
    cfgWeight: "default",
    seed: "default"
  };

  // Apply character
  for (const key of Object.keys(defaults)) {
    if (cs[key] !== undefined && cs[key] !== null && cs[key] !== "") {
      effective[key] = cs[key];
      source[key] = "character default";
    }
  }

  // Apply line
  for (const key of Object.keys(defaults)) {
    if (ls[key] !== undefined && ls[key] !== null && ls[key] !== "") {
      effective[key] = ls[key];
      source[key] = "line override";
    }
  }

  // Determine active vs metadata
  const modelKind = line.model || character?.preferredEngine === "chatterbox" && line.model || "Standard";
  const isTurbo = modelKind === "Turbo";
  const activeParams = [];
  const metaOnly = [];

  if (isTurbo) {
    metaOnly.push("exaggeration", "cfgWeight", "delivery", "speed", "temperature", "seed");
  } else {
    activeParams.push("exaggeration", "cfgWeight");
    metaOnly.push("delivery", "speed", "temperature", "seed");
  }

  return { effective, source, activeParams, metaOnly };
}

export function updateLineSpeechSettingsSummary(lineId) {
  const container = document.querySelector(`.speech-settings-summary[data-line-id="${CSS.escape(lineId)}"]`);
  if (!container) return;

  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene) return;
  const line = scene.lines.find(l => l.id === lineId);
  if (!line) return;

  const getInputValue = (field) => {
    const input = document.querySelector(`[data-line-id="${CSS.escape(lineId)}"][data-line-field="${field}"]`);
    if (!input) return null;
    let val = input.value;
    if (input.type === "number") {
      return val === "" ? null : Number(val);
    }
    return val;
  };

  const currentLineSpeechSettings = {
    delivery: getInputValue("speechSettings.delivery") || "",
    speed: getInputValue("speechSettings.speed"),
    temperature: getInputValue("speechSettings.temperature"),
    exaggeration: getInputValue("speechSettings.exaggeration"),
    cfgWeight: getInputValue("speechSettings.cfgWeight"),
    seed: getInputValue("speechSettings.seed")
  };

  const lineWithCurrentInputs = {
    ...line,
    speechSettings: currentLineSpeechSettings
  };

  const { effective, source, activeParams, metaOnly } = getEffectiveLineSettings(lineWithCurrentInputs);

  const items = [];
  const keys = ["delivery", "exaggeration", "cfgWeight", "speed", "temperature", "seed"];
  
  for (const key of keys) {
    const val = effective[key];
    if (val !== undefined && val !== null && val !== "") {
      const src = source[key];
      const isAct = activeParams.includes(key);
      const label = key === "cfgWeight" ? "CFG Weight" : key.charAt(0).toUpperCase() + key.slice(1);
      const badgeClass = isAct ? "active-param" : "meta-param";
      items.push(`
        <span class="summary-setting-item ${badgeClass}" title="Source: ${src} (${isAct ? 'Active Parameter' : 'Metadata/Note'})">
          <strong>${label}:</strong> ${val} <span class="setting-src">(${src === 'default' ? 'default' : src === 'character default' ? 'char' : 'line'})</span>
        </span>
      `);
    }
  }

  container.innerHTML = `
    <strong>Effective Settings Summary:</strong>
    <div class="summary-items-list" style="display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px;">
      ${items.length ? items.join(" | ") : '<span style="font-style: italic;">No settings active</span>'}
    </div>
  `;
}

export function renderParsedLines(scene) {
  const container = $("sceneLineEditor");
  if (!scene?.lines?.length) {
    container.innerHTML = `<div class="empty-state">No parsed lines yet.</div>`;
    container.classList.add("empty-state");
    return;
  }
  container.classList.remove("empty-state");

  container.innerHTML = scene.lines.map((line) => {
    const isUnknown = line.speaker.toUpperCase() === "UNKNOWN";
    
    return `
      <article class="line-card ${isUnknown ? "unsafe-unknown" : ""}" id="line-card-${escapeHtml(line.id)}">
        <div class="line-card-header">
          <div class="line-card-info">
            <span class="line-badge">${escapeHtml(line.id)}</span>
            <span class="speaker-badge">${escapeHtml(line.speaker)}</span>
            <span class="status-badge" id="status-badge-${escapeHtml(line.id)}">Checking...</span>
          </div>
          <button class="reactive-button primary render-line-btn" data-line-id="${escapeHtml(line.id)}" type="button">Render Line</button>
        </div>
        <div class="line-card-fields">
          <label><span>Type</span><select data-line-field="type" data-line-id="${escapeHtml(line.id)}">
            ${["dialogue", "narration", "action"].map((type) => `<option value="${type}" ${line.type === type ? "selected" : ""}>${type}</option>`).join("")}
          </select></label>
          <label><span>Speaker</span><input data-line-field="speaker" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.speaker)}"></label>
          <label class="wide-field"><span>Text</span><textarea data-line-field="text" data-line-id="${escapeHtml(line.id)}">${escapeHtml(line.text)}</textarea></label>
          <label><span>Emotion</span><input data-line-field="emotion" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.emotion)}"></label>
          <label><span>Pace</span><input data-line-field="pace" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.pace)}"></label>
          <label><span>Delivery cue</span><input data-line-field="deliveryCue" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.deliveryCue)}"></label>
          <label><span>Takes</span><input type="number" min="1" max="10" data-line-field="takes" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.takes)}"></label>
        </div>
        <details class="line-speech-details" style="margin: 0 16px 12px 16px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 6px 10px; background: rgba(2, 6, 12, 0.15);">
          <summary style="cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--muted); user-select: none;">Speech Settings Override</summary>
          <div class="speech-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px;">
            <label style="font-size: 0.72rem; grid-column: span 2;"><span>Delivery Override</span><input data-line-field="speechSettings.delivery" data-line-id="${escapeHtml(line.id)}" value="${escapeHtml(line.speechSettings?.delivery || "")}" placeholder="colder, whispered (Notes)"></label>
            <label style="font-size: 0.72rem;"><span>Exaggeration</span><input type="number" step="0.05" data-line-field="speechSettings.exaggeration" data-line-id="${escapeHtml(line.id)}" value="${line.speechSettings?.exaggeration !== null && line.speechSettings?.exaggeration !== undefined ? escapeHtml(line.speechSettings.exaggeration) : ""}" placeholder="Inherit (Active)"></label>
            <label style="font-size: 0.72rem;"><span>CFG Weight</span><input type="number" step="0.05" data-line-field="speechSettings.cfgWeight" data-line-id="${escapeHtml(line.id)}" value="${line.speechSettings?.cfgWeight !== null && line.speechSettings?.cfgWeight !== undefined ? escapeHtml(line.speechSettings.cfgWeight) : ""}" placeholder="Inherit (Active)"></label>
            <label style="font-size: 0.72rem;"><span>Speed Override</span><input type="number" step="0.05" data-line-field="speechSettings.speed" data-line-id="${escapeHtml(line.id)}" value="${line.speechSettings?.speed !== null && line.speechSettings?.speed !== undefined ? escapeHtml(line.speechSettings.speed) : ""}" placeholder="Inherit (Notes)"></label>
            <label style="font-size: 0.72rem;"><span>Temperature</span><input type="number" step="0.05" data-line-field="speechSettings.temperature" data-line-id="${escapeHtml(line.id)}" value="${line.speechSettings?.temperature !== null && line.speechSettings?.temperature !== undefined ? escapeHtml(line.speechSettings.temperature) : ""}" placeholder="Inherit (Notes)"></label>
            <label style="font-size: 0.72rem;"><span>Seed Override</span><input type="number" data-line-field="speechSettings.seed" data-line-id="${escapeHtml(line.id)}" value="${line.speechSettings?.seed !== null && line.speechSettings?.seed !== undefined ? escapeHtml(line.speechSettings.seed) : ""}" placeholder="Inherit (Notes)"></label>
            <label style="font-size: 0.72rem;"><span>Pause after (ms)</span><input type="number" min="0" max="3000" data-line-field="timing.pauseAfterMs" data-line-id="${escapeHtml(line.id)}" value="${line.timing?.pauseAfterMs !== null && line.timing?.pauseAfterMs !== undefined ? escapeHtml(line.timing.pauseAfterMs) : ""}" placeholder="Inherit (ms)"></label>
          </div>
          <div class="speech-settings-summary" data-line-id="${escapeHtml(line.id)}" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--muted);"></div>
          <p class="meta-line" style="margin-top: 6px; font-size: 0.68rem; color: var(--muted); margin-bottom: 0;">Line overrides beat character defaults. Unsupported parameters are saved as notes only.</p>
        </details>
        <div class="line-takes" id="line-takes-${escapeHtml(line.id)}"></div>
      </article>
    `;
  }).join("");

  // Initialize UI state for mapping badges & action buttons on each line card
  scene.lines.forEach((line) => {
    updateLineMappingUI(line);
    renderLineTakes(line.id);
    updateLineSpeechSettingsSummary(line.id);
  });

  // Bind input listeners on speech settings overrides to update summaries
  container.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.lineId && input.dataset.lineField && input.dataset.lineField.startsWith("speechSettings.")) {
      updateLineSpeechSettingsSummary(input.dataset.lineId);
    }
  });

  // Bind click listener for render-line buttons
  container.querySelectorAll(".render-line-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lineId = btn.dataset.lineId;
      await handleLineRenderClick(lineId, btn);
    });
  });
}

async function handleLineRenderClick(lineId, btn) {
  // 1. Run preflight checks
  const preflight = preflightRenderLine(lineId);
  if (!preflight.ok) {
    setDramaStatus(`Preflight blocked: ${preflight.error}`);
    if (preflight.field) {
      let element = typeof preflight.field === "string" 
        ? $(preflight.field) || document.querySelector(preflight.field) 
        : preflight.field;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("preflight-error-highlight");
        setTimeout(() => element.classList.remove("preflight-error-highlight"), 2000);
        element.focus?.();
      }
    }
    return;
  }

  // 2. Call backend render-line API
  const originalHtml = btn.innerHTML;
  btn.innerHTML = "Rendering...";
  btn.disabled = true;
  setDramaStatus(`Rendering line ${lineId} with ${preflight.payload.takes} takes...`);

  try {
    const res = await api("/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify(preflight.payload)
    });
    
    // Reload takes & re-render
    const takesBody = await api("/api/takes");
    state.takes = takesBody.takes || [];
    renderLineTakes(lineId);
    setDramaStatus(`Successfully rendered line ${lineId}.`);
    renderWorkflowStatus();
  } catch (error) {
    setDramaStatus(`Render failed: ${error.message}`);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    // Update mapping UI
    const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
    const line = scene?.lines?.find(l => l.id === lineId);
    if (line) updateLineMappingUI(line);
  }
}

function collectEditedScene() {
  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene) return null;
  const lines = scene.lines.map((line) => {
    const updated = { ...line };
    updated.speechSettings = {
      delivery: "",
      speed: null,
      temperature: null,
      exaggeration: null,
      cfgWeight: null,
      seed: null
    };
    updated.timing = {
      pauseAfterMs: null
    };

    document.querySelectorAll(`[data-line-id="${CSS.escape(line.id)}"]`).forEach((input) => {
      const field = input.dataset.lineField;
      if (!field) return;
      let val = input.value;
      if (input.type === "number") {
        val = val === "" ? null : Number(val);
      }

      if (field.startsWith("speechSettings.")) {
        const sub = field.slice("speechSettings.".length);
        updated.speechSettings[sub] = val;
      } else if (field.startsWith("timing.")) {
        const sub = field.slice("timing.".length);
        updated.timing[sub] = val;
      } else {
        updated[field] = input.type === "number" ? (val === null ? 0 : val) : val;
      }
    });
    return updated;
  });
  return { ...scene, lines };
}

export async function parseRawScript() {
  $("parserOutput").textContent = "Parsing through the BigMac-backed Ollama tunnel...";
  const parsed = await api("/api/script/parse", {
    method: "POST",
    body: JSON.stringify({ rawText: $("rawScriptText").value, model: $("parserModelSelect")?.value || state.parserModel || "auto" })
  }).catch((error) => ({ ok: false, error: error.message }));
  $("parserOutput").textContent = JSON.stringify(parsed, null, 2);
  if (parsed.ok) {
    state.parsedScript = parsed.result;
    state.speakerMappings = {}; // reset mapping
    renderSpeakerMapping(onSpeakerMappingChanged);
    renderParsedLines(parsed.result.scenes[0]);
  }
}

export async function saveParsedScene() {
  const projectId = $("projectSelect").value;
  if (!projectId) return setDramaStatus("Create or choose a project before saving a scene.");
  const scene = collectEditedScene();
  if (!scene) return setDramaStatus("Parse a script before saving a scene.");
  
  // Propagate mapping updates to lines before saving
  propagateMappingsToLines();
  
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
  renderWorkflowStatus();
}

export async function renderFirstLine() {
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  const scene = sceneId ? await api(`/api/scenes/${encodeURIComponent(sceneId)}`).then((body) => body.scene) : null;
  const line = scene?.lines?.[0];
  if (!line) return setDramaStatus("Save a scene with at least one line first.");
  
  await handleLineRenderClick(line.id, $("renderFirstLineButton"));
}

export async function refreshSelectedTakes() {
  const projectId = $("projectSelect").value;
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!projectId || !sceneId) return setDramaStatus("Choose a project and save a scene first.");
  const selected = await api(`/api/scenes/selected?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(sceneId)}`);
  state.selectedTakesMap = selected.selectedTakes || {};
  setDramaStatus(selected);
  renderWorkflowStatus();
}

export { handleRenderReadyLines };
