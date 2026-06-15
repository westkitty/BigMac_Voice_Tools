import { $, escapeHtml, state, setDramaStatus } from "../state.js";
import { api } from "../api.js";
import { preflightRenderLine } from "./renderPreflight.js";
import { renderLineTakes } from "./takeReview.js";

/**
 * Filter all lines in the active scene to find those that pass the preflight check.
 * @returns {Array<object>} List of lines ready for rendering.
 */
export function getReadySceneLines() {
  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene || !scene.lines || !scene.lines.length) return [];
  return scene.lines.filter(line => preflightRenderLine(line.id).ok);
}

/**
 * Render all lines in the active scene sequentially, showing a progress panel and result lists.
 */
export async function handleRenderReadyLines() {
  const projectId = $("projectSelect").value;
  if (!projectId) {
    setDramaStatus("Create or select a project before rendering.");
    return;
  }
  
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!sceneId) {
    setDramaStatus("Save the scene before rendering.");
    return;
  }
  
  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene || !scene.lines || !scene.lines.length) {
    setDramaStatus("No lines in the scene to render.");
    return;
  }
  
  const readyLines = getReadySceneLines();
  if (readyLines.length === 0) {
    setDramaStatus("No ready lines found. Make sure speakers are mapped and lines have text.");
    const summaryContainer = $("sceneRenderSummary");
    if (summaryContainer) {
      summaryContainer.innerHTML = "";
      summaryContainer.classList.add("hidden");
    }
    return;
  }

  const btn = $("renderReadyLinesButton");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = "Rendering Scene...";
  btn.disabled = true;
  setDramaStatus(`Rendering ${readyLines.length} ready lines sequentially...`);

  const defaultTakes = Number($("sceneTakesInput")?.value || 2);
  const allLineIds = scene.lines.map(line => line.id);

  try {
    const res = await api("/api/scenes/render", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        sceneId,
        lineIds: allLineIds,
        takes: defaultTakes
      })
    });

    // Reload takes list from state to match what's on disk
    const takesBody = await api("/api/takes");
    state.takes = takesBody.takes || [];

    // Trigger inline take review updates for all successfully rendered lines
    for (const result of res.results) {
      if (result.ok && !result.skipped) {
        renderLineTakes(result.lineId);
      }
    }

    // Render visual summary
    renderSceneRenderSummary(res);
    
    setDramaStatus(`Scene render completed. Rendered: ${res.summary.rendered}, Skipped: ${res.summary.skipped}, Failed: ${res.summary.failed}.`);
  } catch (error) {
    setDramaStatus(`Scene render failed: ${error.message}`);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

/**
 * Render the HTML summary dashboard for the scene render queue results.
 * @param {object} res The result payload from the /api/scenes/render API.
 */
export function renderSceneRenderSummary(res) {
  const container = $("sceneRenderSummary");
  if (!container) return;

  container.classList.remove("hidden");
  
  const { summary, results } = res;
  
  const resultsHtml = results.map(r => {
    let statusText = "";
    let statusClass = "";
    let details = "";
    
    if (r.ok && !r.skipped) {
      statusText = "Rendered";
      statusClass = "summary-rendered";
      details = `${r.takes.length} take(s) generated`;
    } else if (r.skipped) {
      statusText = "Skipped";
      statusClass = "summary-skipped";
      details = `Reason: ${r.error} (${r.code})`;
    } else {
      statusText = "Failed";
      statusClass = "summary-failed";
      details = `Error: ${r.error}`;
    }
    
    return `
      <div class="summary-result-item ${statusClass}">
        <span class="summary-item-id">Line ${escapeHtml(r.lineId)}</span>
        <span class="summary-item-status">${statusText}</span>
        <span class="summary-item-details">${escapeHtml(details)}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="render-summary-panel glass-card">
      <h4>Scene Render Summary</h4>
      <div class="summary-stats">
        <div class="stat-box">
          <span class="stat-val">${summary.requested}</span>
          <span class="stat-lbl">Requested</span>
        </div>
        <div class="stat-box val-success">
          <span class="stat-val">${summary.rendered}</span>
          <span class="stat-lbl">Rendered</span>
        </div>
        <div class="stat-box val-warning">
          <span class="stat-val">${summary.skipped}</span>
          <span class="stat-lbl">Skipped</span>
        </div>
        <div class="stat-box val-error">
          <span class="stat-val">${summary.failed}</span>
          <span class="stat-lbl">Failed</span>
        </div>
      </div>
      <div class="summary-results-list">
        ${resultsHtml}
      </div>
    </div>
  `;
}
