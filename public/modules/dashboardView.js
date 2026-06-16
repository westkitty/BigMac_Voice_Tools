import { api } from "./api.js";
import { $, escapeHtml, state, pushUiError } from "./state.js";

function statusTone(item) {
  if (!item) return "unknown";
  return item.ok ? "ok" : "warn";
}

function statusText(item) {
  if (!item) return "Unknown";
  return item.ok ? "Online" : "Check";
}

function statusCard(label, item, detailFallback = "") {
  const tone = statusTone(item);
  const detail = item?.detail || detailFallback || "No detail reported.";
  return `
    <article class="studio-status-card ${tone}">
      <div class="status-card-top">
        <span class="status-dot ${tone}"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
      <p>${escapeHtml(statusText(item))}</p>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function compactCount(label, value, tone = "") {
  return `<span class="studio-metric ${tone}"><strong>${escapeHtml(value)}</strong><small>${escapeHtml(label)}</small></span>`;
}


function getActiveProject() {
  return state.projects.find((project) => project.id === $("projectSelect")?.value) || state.projects[0] || null;
}

function getActiveScene() {
  return state.scenes.find((scene) => scene.id === state.currentSceneId) || state.scenes[0] || null;
}

function selectedTakesForScene(scene) {
  const map = state.selectedTakesMap || {};
  if (!scene?.lines?.length) return 0;
  return scene.lines.filter((line) => map[line.id]).length;
}

function speakerNames(scene) {
  return [...new Set((scene?.lines || []).map((line) => line.speaker).filter(Boolean))];
}

function boundSpeakerCount(scene) {
  const speakers = speakerNames(scene);
  if (!speakers.length) return 0;
  const characters = new Map(state.characters.map((character) => [String(character.name || "").toLowerCase(), character]));
  return speakers.filter((speaker) => {
    const character = characters.get(String(speaker).toLowerCase());
    return character?.voiceId;
  }).length;
}

function workflowModel() {
  const project = getActiveProject();
  const scene = getActiveScene();
  const lines = scene?.lines || [];
  const speakers = speakerNames(scene);
  const bound = boundSpeakerCount(scene);
  const chosen = selectedTakesForScene(scene);
  const sceneTakes = scene ? state.takes.filter((take) => take.sceneId === scene.id) : [];
  const latestPreview = state.latestPreview || null;
  return {
    project,
    scene,
    lines,
    speakers,
    bound,
    chosen,
    sceneTakes,
    latestPreview,
    steps: [
      { id: "script", label: "Script", ok: Boolean(scene || state.parsedScript), detail: scene ? `${lines.length} saved lines` : state.parsedScript ? "parsed but unsaved" : "paste or parse script" },
      { id: "characters", label: "Characters", ok: state.characters.length > 0, detail: `${state.characters.length} characters` },
      { id: "bind", label: "Bind", ok: speakers.length > 0 && bound >= speakers.length, warn: speakers.length > 0 && bound < speakers.length, detail: `${bound}/${speakers.length || 0} speakers bound` },
      { id: "render", label: "Render", ok: sceneTakes.length > 0, detail: `${sceneTakes.length} takes` },
      { id: "review", label: "Review", ok: chosen > 0, warn: lines.length > 0 && chosen < lines.length, detail: `${chosen}/${lines.length || 0} chosen` },
      { id: "preview", label: "Preview", ok: Boolean(latestPreview), detail: latestPreview ? "latest ready" : "assemble scene" },
      { id: "export", label: "Export", ok: Boolean(latestPreview), detail: latestPreview ? "open/download/copy" : "needs preview" }
    ]
  };
}

function renderDegradedBanner({ health, parser } = {}) {
  const banner = $("degradedStackBanner");
  if (!banner) return;
  const issues = [];
  if (health && !health.wrapper?.ok) issues.push("Wrapper 7870");
  if (health && !health.tunnel?.ok) issues.push("Chatterbox tunnel 7860");
  if (health && !health.bigMac?.ok) issues.push("BigMac SSH");
  if (parser && !parser.ok) issues.push("Ollama 11435");
  if (!issues.length) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <strong>Stack degraded:</strong>
    <span>${escapeHtml(issues.join(", "))}</span>
    <code>/Users/andrew/bin/bigmac-voicetools-launch</code>
    <button class="chip" data-copy-command="/Users/andrew/bin/bigmac-voicetools-launch" type="button">Copy relaunch command</button>
  `;
}

function toneForStep(step) {
  if (step.ok) return "ok";
  if (step.warn) return "warn";
  return "idle";
}

export function renderWorkflowStatus() {
  const model = workflowModel();
  const summary = $("workflowStepSummary");
  if (summary) {
    summary.innerHTML = model.steps.map((step) => `
      <button class="workflow-step-card ${toneForStep(step)} ${state.activeDramaStep === step.id ? "active" : ""}" data-drama-step="${step.id}" type="button">
        <strong>${escapeHtml(step.label)}</strong>
        <small>${escapeHtml(step.detail)}</small>
      </button>
    `).join("");
  }
  document.querySelectorAll("[data-drama-step]").forEach((button) => {
    const step = model.steps.find((item) => item.id === button.dataset.dramaStep);
    if (!step) return;
    const isActive = state.activeDramaStep === step.id;
    button.classList.toggle("ok", step.ok);
    button.classList.toggle("warn", Boolean(step.warn));
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });
  const inspector = $("inspectorContent");
  if (inspector) {
    inspector.innerHTML = `
      <div class="inspector-kv"><span>Project</span><strong>${escapeHtml(model.project?.name || "None")}</strong></div>
      <div class="inspector-kv"><span>Scene</span><strong>${escapeHtml(model.scene?.title || "None")}</strong></div>
      <div class="inspector-kv"><span>Lines</span><strong>${model.lines.length}</strong></div>
      <div class="inspector-kv"><span>Speakers bound</span><strong>${model.bound}/${model.speakers.length}</strong></div>
      <div class="inspector-kv"><span>Chosen takes</span><strong>${model.chosen}/${model.lines.length}</strong></div>
      <div class="inspector-kv"><span>Total takes</span><strong>${state.takes.length}</strong></div>
    `;
  }
  const activity = $("activityStatusText");
  if (activity) {
    const lastError = state.uiErrors[0];
    activity.textContent = lastError ? `${lastError.source}: ${lastError.message}` : `Ready. ${model.chosen}/${model.lines.length || 0} scene lines have chosen takes.`;
  }
}

export function setDramaStep(stepId) {
  state.activeDramaStep = stepId || "script";
  document.querySelectorAll("[data-drama-step-panel]").forEach((panel) => {
    const panelStep = panel.dataset.dramaStepPanel;
    const active = panelStep === state.activeDramaStep || (panelStep === "review" && ["preview", "export"].includes(state.activeDramaStep));
    panel.classList.toggle("active-step-panel", active);
    panel.classList.toggle("collapsed-step-panel", !active);
  });
  renderWorkflowStatus();
}

export function renderGlobalStatus({ health, parser } = {}) {
  const target = $("globalStatusSummary");
  if (!target) return;
  state.lastHealth = health || state.lastHealth;
  state.lastParser = parser || state.lastParser;
  renderDegradedBanner({ health: state.lastHealth, parser: state.lastParser });
  target.innerHTML = [
    compactCount("Wrapper 7870", health?.wrapper?.ok ? "Online" : "Check", health?.wrapper?.ok ? "ok" : "warn"),
    compactCount("Chatterbox 7860", health?.tunnel?.ok ? "Online" : "Check", health?.tunnel?.ok ? "ok" : "warn"),
    compactCount("Ollama 11435", parser?.ok ? "Online" : "Check", parser?.ok ? "ok" : "warn"),
    compactCount("BigMac", health?.bigMac?.ok ? "Connected" : "Check", health?.bigMac?.ok ? "ok" : "warn")
  ].join("");
}

function renderProjectSummary() {
  const model = workflowModel();
  const activeProject = model.project;
  const activeScene = model.scene;
  const sceneLines = model.lines.length;
  const projectCharacters = activeProject ? state.characters.filter((character) => character.projectId === activeProject.id).length : state.characters.length;
  return `
    <div class="continue-card-body">
      <div>
        <p class="eyebrow">Continue working</p>
        <h3>${escapeHtml(activeProject?.name || "No project selected")}</h3>
        <p class="meta-line">${escapeHtml(activeScene?.title || "Create or open a scene to begin.")}</p>
      </div>
      <div class="studio-metric-row">
        ${compactCount("voices", state.voices.length)}
        ${compactCount("characters", projectCharacters)}
        ${compactCount("scene lines", sceneLines)}
        ${compactCount("chosen", `${model.chosen}/${sceneLines}`)}
      </div>
      <button class="reactive-button primary" data-view-target="audioDramaView" type="button">Open Drama Studio</button>
    </div>
  `;
}

function renderRecentActivity() {
  const recentTakes = [...state.takes].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 5);
  if (!recentTakes.length) return `<p class="empty-state compact-empty">No generated takes yet. Render a voice sample or scene line to populate activity.</p>`;
  return recentTakes.map((take) => `
    <div class="activity-row">
      <span class="status-dot ok"></span>
      <div>
        <strong>${escapeHtml(take.speaker || take.voiceName || "Take")}</strong>
        <p>${escapeHtml((take.text || take.sourceText || "Generated audio").slice(0, 82))}${(take.text || take.sourceText || "").length > 82 ? "…" : ""}</p>
      </div>
      <small>${escapeHtml(take.createdAt ? new Date(take.createdAt).toLocaleString() : "recent")}</small>
    </div>
  `).join("");
}

export async function loadDashboard() {
  renderWorkflowStatus();
  const statusCards = $("dashboardStatusCards");
  const continueCard = $("dashboardContinueCard");
  const activity = $("dashboardActivityList");
  if (continueCard) continueCard.innerHTML = renderProjectSummary();
  if (activity) activity.innerHTML = renderRecentActivity();
  try {
    const health = await api("/api/health");
    const parser = await api("/api/script/parser-health").catch((error) => ({ ok: false, detail: error.message, models: [] }));
    renderGlobalStatus({ health, parser });
    if (statusCards) {
      statusCards.innerHTML = [
        statusCard("Wrapper 7870", health.wrapper, "Local Node wrapper"),
        statusCard("Chatterbox 7860", health.tunnel, "Local tunnel to BigMac voice server"),
        statusCard("Ollama 11435", parser, "Local tunnel to BigMac Ollama"),
        statusCard("BigMac SSH", health.bigMac, "ssh westcat route"),
        statusCard("Disk", health.disk, "BigMac storage"),
        statusCard("Raw GUI", health.rawGui, "Underlying Chatterbox UI")
      ].join("");
    }
    const systemDock = $("systemDoctrineCards");
    if (systemDock) {
      systemDock.innerHTML = `
        ${statusCard("Canonical URL", { ok: true, detail: "http://127.0.0.1:7870" }, "Local wrapper")}
        ${statusCard("Canonical launcher", { ok: true, detail: "/Users/andrew/bin/bigmac-voicetools-launch" }, "Dock delegates here")}
        ${statusCard("Do not use for normal work", { ok: false, detail: "PORT=7873 npm start is dev/debug only" }, "Avoid split-stack failures")}
      `;
    }
  } catch (error) {
    pushUiError("Dashboard health", error);
    renderGlobalStatus();
    if (statusCards) statusCards.innerHTML = `<article class="studio-status-card warn"><strong>Health failed</strong><p>${escapeHtml(error.message)}</p></article>`;
  }
}
