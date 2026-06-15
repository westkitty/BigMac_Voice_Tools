import { $, escapeHtml, state, setDramaStatus } from "../state.js";
import { api } from "../api.js";

/**
 * Initialize preview assembly event bindings
 */
export function initPreviewAssembly() {
  const btn = $("buildScenePreviewButton");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await handleBuildScenePreview();
  });
}

/**
 * Perform scene preview assembly request and display results
 */
export async function handleBuildScenePreview() {
  const projectId = $("projectSelect").value;
  if (!projectId) {
    setDramaStatus("Create or select a project before assembling a preview.");
    return;
  }

  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!sceneId) {
    setDramaStatus("Save the scene before assembling a preview.");
    return;
  }

  const gapInput = $("previewGapInput");
  const modeSelect = $("previewModeSelect");
  const btn = $("buildScenePreviewButton");
  const audioContainer = $("previewAudioContainer");
  const audioPlayer = $("previewAudioPlayer");
  const summaryContainer = $("previewAssemblySummary");

  const gapsMs = gapInput ? Number(gapInput.value) : 350;
  const mode = modeSelect ? modeSelect.value : "skip-missing";

  // Reset UI state
  resetPreviewAssembly();

  const originalHtml = btn.innerHTML;
  btn.innerHTML = "Assembling Preview...";
  btn.disabled = true;
  setDramaStatus("Assembling scene preview on BigMac remote backend...");

  try {
    const res = await api("/api/scenes/preview", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        sceneId,
        mode,
        gapsMs
      })
    });

    setDramaStatus("Successfully assembled scene preview.");
    
    // Render success summary
    if (summaryContainer) {
      const durationText = res.preview.durationEstimateMs 
        ? `${(res.preview.durationEstimateMs / 1000).toFixed(2)} seconds`
        : "unknown";

      let skippedHtml = "";
      if (res.skipped && res.skipped.length > 0) {
        skippedHtml = `
          <div style="margin-top: 8px;">
            <strong style="color: var(--amber);">Skipped Lines:</strong>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              ${res.skipped.map(s => `
                <div class="preview-summary-item preview-skipped">
                  <span class="preview-item-id">Line ${escapeHtml(s.lineId)}</span>
                  <span class="preview-item-status">Skipped</span>
                  <span style="color: var(--muted); margin-left: 8px;">${escapeHtml(s.error || s.code)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      summaryContainer.classList.remove("hidden");
      summaryContainer.innerHTML = `
        <div class="preview-stats" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600;">
          <span>Lines: ${res.summary.lines}</span>
          <span>Assembled: ${res.summary.included}</span>
          <span>Skipped: ${res.summary.skipped}</span>
        </div>
        <div style="margin-bottom: 4px;"><strong>Duration Estimate:</strong> ${durationText}</div>
        <div><strong>Location:</strong> <span style="word-break: break-all; color: var(--muted); font-size: 0.7rem;">${escapeHtml(res.preview.remotePath)}</span></div>
        ${skippedHtml}
      `;
    }

    // Load and show audio player
    if (audioPlayer && audioContainer) {
      audioPlayer.src = res.preview.audioUrl;
      audioPlayer.load();
      audioContainer.style.display = "block";
    }

  } catch (error) {
    setDramaStatus(`Preview assembly failed: ${error.message}`);
    
    if (summaryContainer) {
      summaryContainer.classList.remove("hidden");
      let skippedHtml = "";
      
      // If error payload contains detailed blocked/skipped lines list
      if (error.payload && error.payload.skipped && error.payload.skipped.length > 0) {
        skippedHtml = `
          <div style="margin-top: 8px;">
            <strong style="color: var(--red);">Lines Blocked (Missing Selected Take):</strong>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              ${error.payload.skipped.map(s => `
                <div class="preview-summary-item preview-skipped">
                  <span class="preview-item-id">Line ${escapeHtml(s.lineId)}</span>
                  <span class="preview-item-status" style="background: rgba(255,100,100,0.1); color: var(--red);">Blocked</span>
                  <span style="color: var(--muted); margin-left: 8px;">${escapeHtml(s.error || s.code)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      summaryContainer.innerHTML = `
        <div style="color: var(--red); font-weight: 600; margin-bottom: 4px;">
          Assembly Failed: ${escapeHtml(error.message || "Unknown error")}
        </div>
        ${skippedHtml}
      `;
    }
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

/**
 * Reset preview UI state (e.g. when scene changes)
 */
export function resetPreviewAssembly() {
  const audioContainer = $("previewAudioContainer");
  const audioPlayer = $("previewAudioPlayer");
  const summaryContainer = $("previewAssemblySummary");

  if (audioContainer) audioContainer.style.display = "none";
  if (audioPlayer) {
    audioPlayer.src = "";
    audioPlayer.load();
  }
  if (summaryContainer) {
    summaryContainer.innerHTML = "";
    summaryContainer.classList.add("hidden");
  }
}

