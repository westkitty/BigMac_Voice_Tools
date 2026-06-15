import { api } from "./modules/api.js";
import { $, setMessage, state } from "./modules/state.js";
import { loadHealth, loadLogs } from "./modules/healthView.js";
import { loadDrama, createCharacter, createProject, parseRawScript, refreshSelectedTakes, renderFirstLine, saveParsedScene, handleRenderReadyLines } from "./modules/audioDramaView.js";
import { openHelp, openStudioWindow, setView } from "./modules/navigation.js";
import { initPreviewAssembly } from "./modules/audioDrama/previewAssembly.js";
import {
  formatDocumentFile,
  generate,
  generateConversation,
  loadTakes,
  loadVoices,
  renderCharacterSlots,
  renderScriptPreview,
  renderTakes,
  renderVoices,
  saveVoice,
  setCaptureMode,
  startRecording,
  stopRecording,
  transformText,
  updateGenerateCopy
} from "./modules/voiceLabView.js";

async function handleDocumentClick(event) {
  const viewTarget = event.target.closest("[data-view-target]");
  if (viewTarget) {
    setView(viewTarget.dataset.viewTarget);
    if (viewTarget.dataset.viewTarget === "audioDramaView") await loadDrama();
    if (viewTarget.dataset.viewTarget === "healthView") await loadHealth();
  }

  const selectVoice = event.target.closest("[data-select-voice]");
  if (selectVoice) {
    state.selectedVoiceId = selectVoice.dataset.selectVoice;
    renderVoices();
    updateGenerateCopy();
  }

  const copyPath = event.target.closest("[data-copy-path]");
  if (copyPath) {
    await navigator.clipboard.writeText(copyPath.dataset.copyPath);
    setMessage("Output path copied.", "ok");
  }

  const deleteTake = event.target.closest("[data-delete-take]");
  if (deleteTake) {
    if (!confirm("Delete this output file and remove the take?")) return;
    await api("/api/takes/delete", {
      method: "POST",
      body: JSON.stringify({ id: deleteTake.dataset.deleteTake })
    });
    state.selectedTakeIds.delete(deleteTake.dataset.deleteTake);
    setMessage("Output deleted.", "ok");
    await loadTakes();
  }

  // Handle take checkbox selection in Voice Lab / Review Screens
  if (event.target.classList.contains("take-select-checkbox")) {
    const takeId = event.target.dataset.takeCheckboxId;
    if (event.target.checked) {
      state.selectedTakeIds.add(takeId);
    } else {
      state.selectedTakeIds.delete(takeId);
    }
    renderTakes();
  }

  // Handle Voice Lab bulk actions
  const takesAction = event.target.closest("[data-takes-action]");
  if (takesAction) {
    const action = takesAction.dataset.takesAction;
    if (action === "select-all") {
      state.takes.forEach(t => state.selectedTakeIds.add(t.id));
      renderTakes();
    } else if (action === "deselect-all") {
      state.selectedTakeIds.clear();
      renderTakes();
    } else if (action === "delete-selected") {
      const selectedCount = state.selectedTakeIds.size;
      if (selectedCount === 0) return;
      if (!confirm(`Delete ${selectedCount} selected takes? This cannot be undone.`)) return;

      const takeIds = Array.from(state.selectedTakeIds);
      setMessage(`Deleting ${selectedCount} takes...`);
      try {
        const res = await api("/api/takes/delete-batch", {
          method: "POST",
          body: JSON.stringify({ takeIds })
        });

        state.selectedTakeIds.clear();
        let statusMsg = `Deleted ${res.deleted.length} takes.`;
        if (res.skipped && res.skipped.length > 0) {
          statusMsg += ` ${res.skipped.length} file${res.skipped.length === 1 ? " was" : "s were"} already missing.`;
        }
        if (res.errors && res.errors.length > 0) {
          statusMsg += ` Failed to delete ${res.errors.length} files.`;
        }
        setMessage(statusMsg, "ok");
        await loadTakes();
      } catch (err) {
        setMessage(err.message || String(err), "error");
      }
    } else if (action === "clear-all") {
      const totalCount = state.takes.length;
      if (totalCount === 0) return;
      if (!confirm(`Delete all ${totalCount} visible takes? This cannot be undone.`)) return;

      const takeIds = state.takes.map(t => t.id);
      setMessage(`Clearing all ${totalCount} takes...`);
      try {
        const res = await api("/api/takes/delete-batch", {
          method: "POST",
          body: JSON.stringify({ takeIds })
        });

        state.selectedTakeIds.clear();
        let statusMsg = `Cleared all ${res.deleted.length} takes.`;
        if (res.skipped && res.skipped.length > 0) {
          statusMsg += ` ${res.skipped.length} file${res.skipped.length === 1 ? " was" : "s were"} already missing.`;
        }
        if (res.errors && res.errors.length > 0) {
          statusMsg += ` Failed to delete ${res.errors.length} files.`;
        }
        setMessage(statusMsg, "ok");
        await loadTakes();
      } catch (err) {
        setMessage(err.message || String(err), "error");
      }
    }
  }

  const transform = event.target.closest("[data-transform]");
  if (transform) transformText(transform.dataset.transform);

  const help = event.target.closest("[data-help]");
  if (help) openHelp(help.dataset.help);
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  $("voiceForm").addEventListener("submit", saveVoice);
  $("generateButton").addEventListener("click", generate);
  $("conversationButton").addEventListener("click", generateConversation);
  $("refreshButton").addEventListener("click", loadHealth);
  $("logsButton").addEventListener("click", loadLogs);
  $("formatDocumentButton").addEventListener("click", formatDocumentFile);
  $("documentFile").addEventListener("change", formatDocumentFile);
  $("speakerCount").addEventListener("change", () => {
    state.speakerCount = Number($("speakerCount").value);
    renderCharacterSlots();
  });
  $("helpClose").addEventListener("click", () => $("helpModal").close());
  $("helpModal").addEventListener("click", (event) => {
    if (event.target === $("helpModal")) $("helpModal").close();
  });
  $("openRawButton").addEventListener("click", () => window.open("http://127.0.0.1:7860", "_blank"));
  $("openStudioWindowButton")?.addEventListener("click", () => {
    if (!openStudioWindow()) setMessage("Browser blocked the studio window. Allow popups for this local app or use /wrapper.html.", "error");
  });
  $("revealOutputsButton").addEventListener("click", async () => {
    await api("/api/reveal-output-folder", { method: "POST", body: "{}" });
    setMessage("Opened the configured BigMac Chatterbox output folder.", "ok");
  });
  $("uploadTab").addEventListener("click", () => setCaptureMode("upload"));
  $("recordTab").addEventListener("click", () => setCaptureMode("record"));
  $("recordStart").addEventListener("click", startRecording);
  $("recordStop").addEventListener("click", stopRecording);
  $("projectForm").addEventListener("submit", createProject);
  $("characterForm").addEventListener("submit", createCharacter);
  $("projectSelect").addEventListener("change", loadDrama);
  $("refreshDramaButton").addEventListener("click", loadDrama);
  $("parserModelSelect")?.addEventListener("change", async (event) => {
    state.parserModel = event.target.value || "auto";
    await loadHealth();
  });
  $("parseScriptButton").addEventListener("click", parseRawScript);
  $("saveSceneButton").addEventListener("click", saveParsedScene);
  $("renderReadyLinesButton").addEventListener("click", handleRenderReadyLines);
  $("renderFirstLineButton").addEventListener("click", renderFirstLine);
  $("refreshSelectedButton").addEventListener("click", refreshSelectedTakes);
  $("healthScreenRefresh").addEventListener("click", loadHealth);
  $("previewToggle").addEventListener("click", () => {
    state.showPreview = !state.showPreview;
    $("previewToggle").classList.toggle("active", state.showPreview);
    $("scriptPreview").classList.toggle("hidden", !state.showPreview);
    renderScriptPreview();
  });

  let previewTimer = null;
  $("scriptText").addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderScriptPreview, 180);
  });

  $("simpleMode").addEventListener("click", () => {
    state.advanced = false;
    $("advancedControls").classList.add("hidden");
    $("simpleMode").classList.add("active");
    $("advancedMode").classList.remove("active");
  });
  $("advancedMode").addEventListener("click", () => {
    state.advanced = true;
    $("advancedControls").classList.remove("hidden");
    $("advancedMode").classList.add("active");
    $("simpleMode").classList.remove("active");
  });
  initPreviewAssembly();
}

bindEvents();
await Promise.all([loadHealth(), loadVoices(), loadTakes()]);
await loadDrama().catch(() => {});
