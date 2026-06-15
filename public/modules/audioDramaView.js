import { api } from "./api.js";
import { $, escapeHtml, setDramaStatus, state } from "./state.js";
import { loadTakes } from "./voiceLabView.js";

export function renderCharacterVoiceOptions() {
  const select = $("characterVoice");
  if (!select) return;
  select.innerHTML = `<option value="">Choose voice</option>${state.voices.map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`).join("")}`;
}

export async function loadDrama() {
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

export function renderDrama() {
  const current = $("projectSelect").value;
  $("projectSelect").innerHTML = `<option value="">No project selected</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
  if (current) $("projectSelect").value = current;
  $("dramaCharacters").innerHTML = state.characters.length
    ? state.characters.map((character) => `<article class="compact-card"><strong>${escapeHtml(character.name)}</strong><div class="meta-line">Voice: ${escapeHtml(state.voices.find((voice) => voice.id === character.voiceId)?.name || "missing")}</div></article>`).join("")
    : `<div class="empty-state">No characters for this project.</div>`;
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

export async function parseRawScript() {
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

export async function saveParsedScene() {
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

export async function renderFirstLine() {
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

export async function refreshSelectedTakes() {
  const projectId = $("projectSelect").value;
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!projectId || !sceneId) return setDramaStatus("Choose a project and save a scene first.");
  setDramaStatus(await api(`/api/scenes/selected?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(sceneId)}`));
}
