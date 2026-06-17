import { $, escapeHtml, state, setDramaStatus, getActiveSceneId } from "../state.js";
import { api } from "../api.js";
import { resetPreviewAssembly } from "./previewAssembly.js";
import { confirmDestructive } from "../navigation.js";

// Render takes grouped under a specific line card
export function renderLineTakes(lineId) {
  const projectId = $("projectSelect").value;
  const sceneId = getActiveSceneId();
  if (!projectId || !sceneId) return;

  const lineTakes = state.takes.filter(
    (take) => take.projectId === projectId && take.sceneId === sceneId && take.lineId === lineId
  );

  const container = $(`line-takes-${lineId}`);
  if (!container) return;

  if (!lineTakes.length) {
    container.innerHTML = "";
    return;
  }

  if (!state.selectedTakesMap) {
    state.selectedTakesMap = {};
  }

  const selectedTakeId = state.selectedTakesMap[lineId] || lineTakes.find(t => t.selected)?.id;

  const selectedLineTakeIds = lineTakes.filter(t => state.selectedTakeIds.has(t.id)).map(t => t.id);
  const selectedCount = selectedLineTakeIds.length;
  const isDeleteDisabled = selectedCount === 0 ? "disabled" : "";

  const bulkActionsHtml = `
    <div class="line-takes-bulk-actions">
      <button class="reactive-button small-btn" data-line-takes-action="select-all" type="button">Select All</button>
      <button class="reactive-button small-btn" data-line-takes-action="deselect-all" type="button">Deselect All</button>
      <button class="reactive-button destructive small-btn" data-line-takes-action="delete-selected" ${isDeleteDisabled} type="button">Delete Selected</button>
      <span class="selected-badge">${selectedCount} selected</span>
    </div>
  `;

  container.innerHTML = `
    <div class="line-takes-group">
      <div class="line-takes-header">
        <h4>Takes</h4>
        ${bulkActionsHtml}
      </div>
      <div class="line-takes-list">
        ${lineTakes.map((take) => {
          const isSelected = take.id === selectedTakeId;
          const createdTime = new Date(take.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const voice = state.voices.find(v => v.id === take.voiceId);
          const voiceName = voice ? voice.name : `ID: ${take.voiceId.slice(0, 8)}`;

          let speechSettingsHtml = "";
          if (take.speechSettings) {
            const ss = take.speechSettings;
            const eff = ss.effective || {};
            const act = ss.activeGeneratorParams || {};
            
            const items = [];
            if (eff.delivery) {
              items.push(`<span class="take-settings-item" title="Delivery Note"><b>Delivery:</b> "${escapeHtml(eff.delivery)}"</span>`);
            }
            if (eff.exaggeration !== undefined && eff.exaggeration !== null) {
              const isActive = act.exaggeration !== undefined && act.exaggeration !== null;
              items.push(`<span class="take-settings-item ${isActive ? "active-param" : "meta-param"}" title="${isActive ? 'Active Generator Parameter' : 'Metadata/Note'}"><b>Exg:</b> ${eff.exaggeration}${isActive ? "" : " (note)"}</span>`);
            }
            if (eff.cfgWeight !== undefined && eff.cfgWeight !== null) {
              const isActive = act.cfgWeight !== undefined && act.cfgWeight !== null;
              items.push(`<span class="take-settings-item ${isActive ? "active-param" : "meta-param"}" title="${isActive ? 'Active Generator Parameter' : 'Metadata/Note'}"><b>CFG:</b> ${eff.cfgWeight}${isActive ? "" : " (note)"}</span>`);
            }
            if (eff.speed !== undefined && eff.speed !== null) {
              items.push(`<span class="take-settings-item meta-param" title="Metadata/Note"><b>Spd:</b> ${eff.speed} (note)</span>`);
            }
            if (eff.temperature !== undefined && eff.temperature !== null) {
              items.push(`<span class="take-settings-item meta-param" title="Metadata/Note"><b>Temp:</b> ${eff.temperature} (note)</span>`);
            }
            if (eff.seed !== undefined && eff.seed !== null) {
              items.push(`<span class="take-settings-item meta-param" title="Metadata/Note"><b>Seed:</b> ${eff.seed} (note)</span>`);
            }

            if (items.length > 0) {
              const modelKind = take.model || "Standard";
              speechSettingsHtml = `
                <div class="take-speech-settings">
                  <div class="take-speech-settings-items">${items.join(" | ")}</div>
                  <div class="take-speech-settings-support">${escapeHtml(ss.supportNote || `Model: ${modelKind}`)}</div>
                </div>
              `;
            }
          } else if (take.settings) {
            // Fallback for older takes
            const items = [];
            if (take.settings.exaggeration !== undefined && take.settings.exaggeration !== null) {
              items.push(`<span class="take-settings-item active-param" title="Active Generator Parameter"><b>Exg:</b> ${take.settings.exaggeration}</span>`);
            }
            if (take.settings.cfgWeight !== undefined && take.settings.cfgWeight !== null) {
              items.push(`<span class="take-settings-item active-param" title="Active Generator Parameter"><b>CFG:</b> ${take.settings.cfgWeight}</span>`);
            }
            if (items.length > 0) {
              speechSettingsHtml = `
                <div class="take-speech-settings">
                  <div class="take-speech-settings-items">${items.join(" | ")}</div>
                </div>
              `;
            }
          }
          
          return `
            <div class="take-item-card ${isSelected ? "selected" : ""}" id="take-${take.id}">
              <div class="take-meta">
                <input type="checkbox" class="take-select-checkbox" data-take-checkbox-id="${take.id}" ${state.selectedTakeIds.has(take.id) ? "checked" : ""} aria-label="Select take">
                <span class="take-badge">Take ${take.takeNumber}</span>
                <span class="take-engine">${escapeHtml(take.engine)}</span>
                <span class="take-voice">Voice: ${escapeHtml(voiceName)}</span>
                <span class="take-time">${createdTime}</span>
              </div>
              ${speechSettingsHtml}
              <audio controls src="/api/audio?path=${encodeURIComponent(take.outputPath)}"></audio>
              <button class="reactive-button select-take-btn ${isSelected ? "primary" : ""}" 
                      data-take-id="${take.id}" data-line-id="${lineId}" type="button">
                ${isSelected ? "✓ Selected" : "Select Take"}
              </button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  // Bind click listener for select buttons
  container.querySelectorAll(".select-take-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const takeId = btn.dataset.takeId;
      await handleSelectTake(lineId, takeId);
    });
  });

  // Bind change listener for checkboxes
  container.querySelectorAll(".take-select-checkbox").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const takeId = cb.dataset.takeCheckboxId;
      if (e.target.checked) {
        state.selectedTakeIds.add(takeId);
      } else {
        state.selectedTakeIds.delete(takeId);
      }
      renderLineTakes(lineId);
    });
  });

  // Bind click listener for line-specific bulk actions
  container.querySelectorAll("[data-line-takes-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.lineTakesAction;
      if (action === "select-all") {
        lineTakes.forEach(t => state.selectedTakeIds.add(t.id));
        renderLineTakes(lineId);
      } else if (action === "deselect-all") {
        lineTakes.forEach(t => state.selectedTakeIds.delete(t.id));
        renderLineTakes(lineId);
      } else if (action === "delete-selected") {
        const toDeleteIds = lineTakes.filter(t => state.selectedTakeIds.has(t.id)).map(t => t.id);
        if (toDeleteIds.length === 0) return;
        const affectsSelected = state.selectedTakesMap[lineId] && toDeleteIds.includes(state.selectedTakesMap[lineId]);
        const confirmed = await confirmDestructive({
          title: "Delete selected takes",
          message: `Permanently delete the selected take audio for line ${lineId}.`,
          count: toDeleteIds.length,
          scope: affectsSelected ? "Includes this line's chosen take — preview will reset" : `Line ${lineId}`,
          irreversible: true
        });
        if (!confirmed) return;

        setDramaStatus(`Deleting ${toDeleteIds.length} takes...`);
        try {
          const res = await api("/api/takes/delete-batch", {
            method: "POST",
            body: JSON.stringify({ takeIds: toDeleteIds })
          });

          // Clean up local selection state
          toDeleteIds.forEach(id => state.selectedTakeIds.delete(id));

          // If the currently selected take was deleted, clear it from selectedTakesMap
          if (state.selectedTakesMap[lineId] && toDeleteIds.includes(state.selectedTakesMap[lineId])) {
            delete state.selectedTakesMap[lineId];
            resetPreviewAssembly();
          }

          // Reload takes list and refresh UI
          const { takes } = await api("/api/takes");
          state.takes = takes;

          let statusMsg = `Deleted ${res.deleted.length} takes.`;
          if (res.skipped && res.skipped.length > 0) {
            statusMsg += ` ${res.skipped.length} missing.`;
          }
          setDramaStatus(statusMsg);
          renderLineTakes(lineId);
        } catch (err) {
          setDramaStatus(`Error: ${err.message || err}`);
        }
      }
    });
  });
}

// Select a take and update selection state immediately
export async function handleSelectTake(lineId, takeId) {
  const projectId = $("projectSelect").value;
  const sceneId = getActiveSceneId();
  if (!projectId || !sceneId) return;

  try {
    const res = await api("/api/scenes/select-take", {
      method: "POST",
      body: JSON.stringify({ projectId, sceneId, lineId, takeId })
    });

    if (!state.selectedTakesMap) {
      state.selectedTakesMap = {};
    }
    state.selectedTakesMap[lineId] = takeId;

    // Update local state.takes
    state.takes = state.takes.map(t => {
      if (t.projectId === projectId && t.sceneId === sceneId && t.lineId === lineId) {
        return { ...t, selected: t.id === takeId };
      }
      return t;
    });

    setDramaStatus(`Selected take for line ${lineId}.`);
    renderLineTakes(lineId);
  } catch (error) {
    setDramaStatus(`Error selecting take: ${error.message}`);
  }
}
