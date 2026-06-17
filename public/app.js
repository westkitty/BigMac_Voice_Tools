import { api } from "./modules/api.js";
import { $, pushUiError, setMessage, state } from "./modules/state.js";
import { loadHealth, loadLogs } from "./modules/healthView.js";
import { loadDashboard, renderWorkflowStatus, setDramaStep } from "./modules/dashboardView.js";
import { loadDrama, createCharacter, createProject, parseRawScript, refreshSelectedTakes, renderFirstLine, saveParsedScene, handleRenderReadyLines, selectScene } from "./modules/audioDramaView.js";
import { copyText, confirmDestructive, initDrawers, openHelp, openStudioWindow, setView, restoreViewFromHash } from "./modules/navigation.js";
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
    const ok = await copyText(copyCommand.dataset.copyCommand, "Command copied.");
    setMessage(ok ? "Command copied." : "Copy failed — copy it manually from the prompt.", ok ? "ok" : "error");
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
    const ok = await copyText(copyPath.dataset.copyPath, "Output path copied.");
    setMessage(ok ? "Output path copied." : "Copy failed — copy it manually from the prompt.", ok ? "ok" : "error");
  }

  const deleteTake = event.target.closest("[data-delete-take]");
  if (deleteTake) {
    const confirmed = await confirmDestructive({
      title: "Delete take",
      message: "Permanently delete this output file and remove the take.",
      count: 1,
      scope: "Single take",
      irreversible: true
    });
    if (!confirmed) return;
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
      const confirmedSelected = await confirmDestructive({
        title: "Delete selected takes",
        message: "Permanently delete the selected take audio files.",
        count: selectedCount,
        scope: "Selected takes across all lines",
        irreversible: true
      });
      if (!confirmedSelected) return;

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
      const confirmedClear = await confirmDestructive({
        title: "Delete ALL takes",
        message: `Permanently delete every visible take (${totalCount}). Chosen takes will be lost and previews will reset.`,
        count: totalCount,
        scope: "All visible takes",
        irreversible: true
      });
      if (!confirmedClear) return;

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

// Show basic, safe file metadata after a reference file is chosen.
function showVoiceFileMeta() {
  const input = $("voiceFile");
  const box = $("voiceFileMeta");
  if (!box) return;
  const file = input?.files?.[0];
  if (!file) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  const kb = Math.round(file.size / 1024);
  const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  box.hidden = false;
  box.textContent = `Selected: ${file.name} · ${file.type || "audio"} · ${size}`;
}

// --- Focus mode: hide advanced controls + debug panels via a body class ---
const FOCUS_KEY = "bvt:focusMode";
function applyFocusMode(on) {
  document.body.classList.toggle("focus-mode", on);
  const toggle = $("focusModeToggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.classList.toggle("active", on);
    toggle.textContent = on ? "Focus mode: on" : "Focus mode";
  }
}
function toggleFocusMode() {
  const on = !document.body.classList.contains("focus-mode");
  try { localStorage.setItem(FOCUS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  applyFocusMode(on);
}
function initFocusMode() {
  let on = false;
  try { on = localStorage.getItem(FOCUS_KEY) === "1"; } catch { /* ignore */ }
  applyFocusMode(on);
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
  bind("sceneSelect", "change", (event) => selectScene(event.target.value));
  bind("voiceFile", "change", showVoiceFileMeta);
  bind("focusModeToggle", "click", toggleFocusMode);
  bind("renderReadyLinesButton", "click", handleRenderReadyLines);
  bind("renderFirstLineButton", "click", renderFirstLine);
  bind("refreshSelectedButton", "click", refreshSelectedTakes);
  bind("healthScreenRefresh", "click", loadHealth);
  bind("copyDiagnosticsButton", "click", async () => {
    const ok = await copyText($("healthScreenDetails")?.textContent || "", "Diagnostics copied.");
    setMessage(ok ? "Diagnostics copied." : "Copy failed — copy it manually from the prompt.", ok ? "ok" : "error");
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
  initFocusMode();
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
// Restore the last section from the URL hash (refresh / deep-link), if present.
restoreViewFromHash();
