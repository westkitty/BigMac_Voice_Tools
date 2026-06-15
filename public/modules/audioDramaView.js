import { api } from "./api.js";
import { $, escapeHtml, setDramaStatus, state } from "./state.js";
import { loadTakes } from "./voiceLabView.js";
import { renderSpeakerMapping, getSpeakerStatus, propagateMappingsToLines } from "./audioDrama/speakerMapping.js";
import { preflightRenderLine } from "./audioDrama/renderPreflight.js";
import { renderLineTakes } from "./audioDrama/takeReview.js";

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
      state.selectedTakesMap = {};
    }
  } else {
    state.selectedTakesMap = {};
  }

  renderDrama();
}

export function renderDrama() {
  const current = $("projectSelect").value;
  $("projectSelect").innerHTML = `<option value="">No project selected</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
  if (current) $("projectSelect").value = current;

  $("dramaCharacters").innerHTML = state.characters.length
    ? state.characters.map((character) => `<article class="compact-card"><strong>${escapeHtml(character.name)}</strong><div class="meta-line">Voice: ${escapeHtml(state.voices.find((voice) => voice.id === character.voiceId)?.name || "missing")}</div></article>`).join("")
    : `<div class="empty-state">No characters for this project.</div>`;

  renderSpeakerMapping(onSpeakerMappingChanged);

  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  renderParsedLines(scene);
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
}

export async function createCharacter(event) {
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
        <div class="line-takes" id="line-takes-${escapeHtml(line.id)}"></div>
      </article>
    `;
  }).join("");

  // Initialize UI state for mapping badges & action buttons on each line card
  scene.lines.forEach((line) => {
    updateLineMappingUI(line);
    renderLineTakes(line.id);
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
    document.querySelectorAll(`[data-line-id="${CSS.escape(line.id)}"]`).forEach((input) => {
      updated[input.dataset.lineField] = input.type === "number" ? Number(input.value) : input.value;
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
  setDramaStatus(await api(`/api/scenes/selected?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(sceneId)}`));
}
