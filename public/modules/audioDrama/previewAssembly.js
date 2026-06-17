import { $, escapeHtml, state, setDramaStatus, pushUiError, getActiveSceneId } from "../state.js";
import { api } from "../api.js";
import { renderWorkflowStatus } from "../dashboardView.js";

let activePreviewRemotePath = "";

/**
 * Initialize preview assembly event bindings
 */
export function initPreviewAssembly() {
  const btn = $("buildScenePreviewButton");
  if (btn) {
    btn.addEventListener("click", async () => {
      await handleBuildScenePreview();
    });
  }

  const copyBtn = $("previewCopyPathBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!activePreviewRemotePath) {
        setDramaStatus("No preview is currently loaded to copy path.");
        return;
      }
      navigator.clipboard.writeText(activePreviewRemotePath).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = originalText; }, 1500);
        setDramaStatus("Copied remote preview path to clipboard.");
      }).catch(err => {
        setDramaStatus("Failed to copy path: " + err.message);
      });
    });
  }
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

  const sceneId = getActiveSceneId();
  if (!sceneId) {
    setDramaStatus("Save the scene before assembling a preview.");
    return;
  }

  const gapInput = $("previewGapInput");
  const fadeInInput = $("previewFadeInInput");
  const fadeOutInput = $("previewFadeOutInput");
  const modeSelect = $("previewModeSelect");
  const btn = $("buildScenePreviewButton");
  const audioContainer = $("previewAudioContainer");
  const audioPlayer = $("previewAudioPlayer");
  const summaryContainer = $("previewAssemblySummary");

  const gapsMs = gapInput ? Number(gapInput.value) : 350;
  const fadeInMs = fadeInInput ? Number(fadeInInput.value) : 0;
  const fadeOutMs = fadeOutInput ? Number(fadeOutInput.value) : 0;
  const mode = modeSelect ? modeSelect.value : "skip-missing";

  // Collect line-specific pause overrides
  const lineTiming = {};
  document.querySelectorAll('input[data-line-field="timing.pauseAfterMs"]').forEach(input => {
    const val = input.value;
    if (val !== undefined && val !== null && val.trim() !== "") {
      const lineId = input.dataset.lineId;
      lineTiming[lineId] = { pauseAfterMs: Number(val) };
    }
  });

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
        gapsMs,
        fadeInMs,
        fadeOutMs,
        lineTiming
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

      let timingOverridesHtml = "";
      const overridesList = [];
      const includedLineIds = res.preview.includedLineIds || res.preview.lineTakeIds || [];
      if (res.preview.lineTiming) {
        for (const lineId of includedLineIds) {
          const timing = res.preview.lineTiming[lineId];
          if (timing?.pauseAfterMs !== undefined && timing?.pauseAfterMs !== null) {
            overridesList.push(`Line ${lineId}: ${timing.pauseAfterMs}ms`);
          }
        }
      }
      if (overridesList.length > 0) {
        timingOverridesHtml = `<div style="margin-bottom: 4px;"><strong>Line overrides:</strong> ${escapeHtml(overridesList.join(", "))}</div>`;
      }

      summaryContainer.classList.remove("hidden");
      summaryContainer.innerHTML = `
        <div class="preview-stats" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600;">
          <span>Lines: ${res.summary.lines}</span>
          <span>Assembled: ${res.summary.included}</span>
          <span>Skipped: ${res.summary.skipped}</span>
        </div>
        <div style="margin-bottom: 4px;"><strong>Duration Estimate:</strong> ${durationText}</div>
        <div style="margin-bottom: 4px;"><strong>Default Gap:</strong> ${res.preview.gapsMs !== undefined ? res.preview.gapsMs : 350}ms</div>
        <div style="margin-bottom: 4px;"><strong>Fades:</strong> In: ${res.preview.fadeInMs || 0}ms | Out: ${res.preview.fadeOutMs || 0}ms</div>
        ${timingOverridesHtml}
        <div><strong>Location:</strong> <span style="word-break: break-all; color: var(--muted); font-size: 0.7rem;">${escapeHtml(res.preview.remotePath)}</span></div>
        ${skippedHtml}
      `;
    }

    // Load and show audio player
    if (audioPlayer && audioContainer) {
      audioPlayer.src = res.preview.audioUrl;
      audioPlayer.load();
      audioContainer.hidden = false;
    }

    const openLink = $("previewOpenLink");
    const downloadLink = $("previewDownloadLink");
    if (openLink) openLink.href = res.preview.audioUrl;
    if (downloadLink) downloadLink.href = res.preview.audioUrl;
    activePreviewRemotePath = res.preview.remotePath;
    state.latestPreview = res.preview;
    renderWorkflowStatus();

    // Refresh the recent previews list
    await loadRecentPreviews();

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
  const openLink = $("previewOpenLink");
  const downloadLink = $("previewDownloadLink");

  if (audioContainer) audioContainer.hidden = true;
  if (audioPlayer) {
    audioPlayer.src = "";
    audioPlayer.load();
  }
  if (summaryContainer) {
    summaryContainer.innerHTML = "";
    summaryContainer.classList.add("hidden");
  }
  if (openLink) openLink.href = "#";
  if (downloadLink) downloadLink.href = "#";
  activePreviewRemotePath = "";
  renderWorkflowStatus();
}

/**
 * Load and render the list of recent previews for the active project and scene
 */
export async function loadRecentPreviews() {
  const projectId = $("projectSelect")?.value;
  const sceneId = getActiveSceneId();
  const listContainer = $("latestPreviewsList");
  if (!listContainer) return;

  if (!projectId || !sceneId) {
    listContainer.innerHTML = `<div style="font-size: 0.75rem; color: var(--muted); font-style: italic;">Select a project and scene to load previews.</div>`;
    return;
  }

  try {
    const res = await api(`/api/scenes/previews?projectId=${encodeURIComponent(projectId)}&sceneId=${encodeURIComponent(sceneId)}`);
    const previews = res.previews || [];
    if (previews.length === 0) {
      state.latestPreview = null;
      renderWorkflowStatus();
      listContainer.innerHTML = `<div class="empty-state compact-empty"><p>No previews generated yet. Assemble a scene preview after choosing takes.</p></div>`;
      return;
    }

    // Sort descending by createdAt
    previews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.latestPreview = previews[0];
    renderWorkflowStatus();

    listContainer.innerHTML = previews.map(p => {
      const dateStr = new Date(p.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const duration = p.durationEstimateMs ? `${(p.durationEstimateMs / 1000).toFixed(2)}s` : "unknown";
      const gaps = p.gapsMs !== undefined ? `${p.gapsMs}ms` : "350ms";
      const fades = `In:${p.fadeInMs || 0}ms|Out:${p.fadeOutMs || 0}ms`;
      const included = p.includedLineIds ? p.includedLineIds.length : 0;
      const skipped = p.skippedLineIds ? p.skippedLineIds.length : 0;

      // Safe link to play
      const audioUrl = `/api/audio?path=${encodeURIComponent(p.remotePath)}`;

      return `
        <div class="compact-card" style="display: flex; flex-direction: column; gap: 4px; padding: 8px; font-size: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); margin-bottom: 4px; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--cyan);">${escapeHtml(dateStr)}</strong>
            <div style="display: flex; gap: 6px;">
              <button class="chip play-preview-btn" data-url="${escapeHtml(audioUrl)}" data-path="${escapeHtml(p.remotePath)}" style="padding: 2px 6px; font-size: 0.7rem; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text);">Play</button>
              <a href="${escapeHtml(audioUrl)}" target="_blank" class="chip" style="padding: 2px 6px; font-size: 0.7rem; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text);">Open</a>
              <a href="${escapeHtml(audioUrl)}" download class="chip" style="padding: 2px 6px; font-size: 0.7rem; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text);">Download</a>
            </div>
          </div>
          <div style="color: var(--muted); font-size: 0.7rem; display: flex; flex-wrap: wrap; gap: 8px;">
            <span>Dur: ${duration}</span>
            <span>Gap: ${gaps}</span>
            <span>Fades: ${fades}</span>
            <span>Inc: ${included} / Skip: ${skipped}</span>
          </div>
          <div style="font-size: 0.65rem; color: var(--muted); word-break: break-all; margin-top: 2px;">
            Path: ${escapeHtml(p.remotePath)}
          </div>
        </div>
      `;
    }).join("");

    // Bind event listeners for Play buttons
    listContainer.querySelectorAll(".play-preview-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const url = btn.dataset.url;
        const path = btn.dataset.path;
        const audioPlayer = $("previewAudioPlayer");
        const audioContainer = $("previewAudioContainer");
        if (audioPlayer && audioContainer) {
          audioPlayer.src = url;
          audioPlayer.load();
          audioPlayer.play();
          audioContainer.hidden = false;
          
          // Also set the main actions container links
          const openLink = $("previewOpenLink");
          const downloadLink = $("previewDownloadLink");
          if (openLink) openLink.href = url;
          if (downloadLink) downloadLink.href = url;
          
          activePreviewRemotePath = path;
          
          // Update the metadata summary if we wish (or just show location)
          const summaryContainer = $("previewAssemblySummary");
          if (summaryContainer) {
            summaryContainer.classList.remove("hidden");
            summaryContainer.innerHTML = `
              <div style="margin-bottom: 4px;"><strong>Playing Saved Preview:</strong></div>
              <div><strong>Location:</strong> <span style="word-break: break-all; color: var(--muted); font-size: 0.7rem;">${escapeHtml(path)}</span></div>
            `;
          }
        }
      });
    });

  } catch (err) {
    console.error("Failed to load recent previews", err);
    pushUiError("Recent previews", err);
    renderWorkflowStatus();
    listContainer.innerHTML = `<div class="empty-state compact-empty error-empty"><p>Recent previews could not load: ${escapeHtml(err.message)}</p></div>`;
  }
}

