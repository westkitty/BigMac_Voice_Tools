import { $, escapeHtml, state, setDramaStatus } from "../state.js";
import { api } from "../api.js";

// Render takes grouped under a specific line card
export function renderLineTakes(lineId) {
  const projectId = $("projectSelect").value;
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
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

  container.innerHTML = `
    <div class="line-takes-group">
      <h4>Takes</h4>
      <div class="line-takes-list">
        ${lineTakes.map((take) => {
          const isSelected = take.id === selectedTakeId;
          const createdTime = new Date(take.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const voice = state.voices.find(v => v.id === take.voiceId);
          const voiceName = voice ? voice.name : `ID: ${take.voiceId.slice(0, 8)}`;
          
          return `
            <div class="take-item-card ${isSelected ? "selected" : ""}" id="take-${take.id}">
              <div class="take-meta">
                <span class="take-badge">Take ${take.takeNumber}</span>
                <span class="take-engine">${escapeHtml(take.engine)}</span>
                <span class="take-voice">Voice: ${escapeHtml(voiceName)}</span>
                <span class="take-time">${createdTime}</span>
              </div>
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
}

// Select a take and update selection state immediately
export async function handleSelectTake(lineId, takeId) {
  const projectId = $("projectSelect").value;
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
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
