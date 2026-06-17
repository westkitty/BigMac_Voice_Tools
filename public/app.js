import { api } from "./modules/api.js";
import { $, pushUiError, setMessage, state } from "./modules/state.js";
import { loadHealth, loadLogs } from "./modules/healthView.js";
import { loadDashboard, renderWorkflowStatus, setDramaStep } from "./modules/dashboardView.js";
import { loadDrama, createCharacter, createProject, parseRawScript, refreshSelectedTakes, renderFirstLine, saveParsedScene, handleRenderReadyLines } from "./modules/audioDramaView.js";
import { copyText, initDrawers, openHelp, openStudioWindow, setView } from "./modules/navigation.js";
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
    const target = viewTarget.dataset.viewTarget;
    setView(target);
    if (target === "dashboardView") await loadDashboard();
    if (target === "audioDramaView") await loadDrama();
    if (target === "voiceLabView" || target === "takesView") await loadTakes();
        renderWorkflowStatus();
    if (target === "voicesView" || target === "voiceLabView") await loadVoices();
    if (target === "healthView") {
      await loadHealth();
      await loadDashboard();
    }
  }

  const copyCommand = event.target.closest("[data-copy-command]");
  if (copyCommand) {
    copyText(copyCommand.dataset.copyCommand, "Command copied.");
    setMessage("Command copied.", "ok");
  }

  const dramaStep = event.target.closest("[data-drama-step]");
  if (dramaStep) {
    setDramaStep(dramaStep.dataset.dramaStep);
  }

  const selectVoice = event.target.closest("[data-select-voice]");
  if (selectVoice) {
    state.selectedVoiceId = selectVoice.dataset.selectVoice;
    renderVoices();
    updateGenerateCopy();
  }

  const copyPath = event.target.closest("[data-copy-path]");
  if (copyPath) {
    copyText(copyPath.dataset.copyPath, "Output path copied.");
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
        renderWorkflowStatus();
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
        renderWorkflowStatus();
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
        renderWorkflowStatus();
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

function bind(id, eventName, handler) {
  const element = $(id);
  if (!element) {
    pushUiError("Binding", new Error(`Missing #${id}`));
    return;
  }
  element.addEventListener(eventName, handler);
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  bind("voiceForm", "submit", saveVoice);
  bind("generateButton", "click", generate);
  bind("conversationButton", "click", generateConversation);
  bind("refreshButton", "click", loadHealth);
  bind("logsButton", "click", loadLogs);
  bind("formatDocumentButton", "click", formatDocumentFile);
  bind("documentFile", "change", formatDocumentFile);
  bind("speakerCount", "change", () => {
    state.speakerCount = Number($("speakerCount").value);
    renderCharacterSlots();
  });
  bind("helpClose", "click", () => $("helpModal")?.close());
  bind("helpModal", "click", (event) => {
    if (event.target === $("helpModal")) $("helpModal").close();
  });
  bind("openRawButton", "click", () => window.open("http://127.0.0.1:7860", "_blank"));
  $("openStudioWindowButton")?.addEventListener("click", () => {
    if (!openStudioWindow()) setMessage("Browser blocked the studio window. Allow popups for this local app or use /wrapper.html.", "error");
  });
  bind("revealOutputsButton", "click", async () => {
    await api("/api/reveal-output-folder", { method: "POST", body: "{}" });
    setMessage("Opened the configured BigMac Chatterbox output folder.", "ok");
  });
  bind("uploadTab", "click", () => setCaptureMode("upload"));
  bind("recordTab", "click", () => setCaptureMode("record"));
  bind("recordStart", "click", startRecording);
  bind("recordStop", "click", stopRecording);
  bind("projectForm", "submit", createProject);
  bind("characterForm", "submit", createCharacter);
  bind("projectSelect", "change", loadDrama);
  bind("refreshDramaButton", "click", loadDrama);
  $("parserModelSelect")?.addEventListener("change", async (event) => {
    state.parserModel = event.target.value || "auto";
    await loadHealth();
  });
  bind("parseScriptButton", "click", parseRawScript);
  bind("saveSceneButton", "click", saveParsedScene);
  bind("renderReadyLinesButton", "click", handleRenderReadyLines);
  bind("renderFirstLineButton", "click", renderFirstLine);
  bind("refreshSelectedButton", "click", refreshSelectedTakes);
  bind("healthScreenRefresh", "click", loadHealth);
  bind("copyDiagnosticsButton", "click", () => {
    copyText($("healthScreenDetails")?.textContent || "", "Diagnostics copied.");
    setMessage("Diagnostics copied.", "ok");
  });
  bind("previewToggle", "click", () => {
    state.showPreview = !state.showPreview;
    $("previewToggle").classList.toggle("active", state.showPreview);
    $("scriptPreview").classList.toggle("hidden", !state.showPreview);
    renderScriptPreview();
  });

  let previewTimer = null;
  bind("scriptText", "input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderScriptPreview, 180);
  });

  bind("simpleMode", "click", () => {
    state.advanced = false;
    $("advancedControls").classList.add("hidden");
    $("simpleMode").classList.add("active");
    $("advancedMode").classList.remove("active");
  });
  bind("advancedMode", "click", () => {
    state.advanced = true;
    $("advancedControls").classList.remove("hidden");
    $("advancedMode").classList.add("active");
    $("simpleMode").classList.remove("active");
  });
  document.addEventListener("bvt:view-change", async (event) => {
    if (event.detail?.viewId === "dashboardView") await loadDashboard().catch((error) => pushUiError("Dashboard", error));
    if (event.detail?.viewId === "healthView") await loadHealth().catch((error) => pushUiError("Health", error));
  });
  initPreviewAssembly();
  initDrawers();
  setDramaStep(state.activeDramaStep);
}

bindEvents();
await Promise.all([
  loadHealth().catch((error) => pushUiError("Health", error)),
  loadVoices().catch((error) => pushUiError("Voices", error)),
  loadTakes().catch((error) => pushUiError("Takes", error))
]);
// Home must not be blocked by the heaviest loader: render the dashboard in
// parallel with the Drama Studio data so the launchpad is usable immediately.
await Promise.all([
  loadDrama().catch((error) => pushUiError("Drama", error)),
  loadDashboard().catch((error) => pushUiError("Dashboard", error))
]);
renderWorkflowStatus();
