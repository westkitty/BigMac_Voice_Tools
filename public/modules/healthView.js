import { api } from "./api.js";
import { $, escapeHtml, state } from "./state.js";
import { renderGlobalStatus } from "./dashboardView.js";

function pill(label, item) {
  const ok = item?.ok;
  return `<button class="status-pill ${ok ? "ok" : "warn"}" title="${escapeHtml(item?.detail || "")}" type="button">${label}: ${ok ? "OK" : "Check"}</button>`;
}

export function renderParserModelOptions(parser) {
  const select = $("parserModelSelect");
  if (!select) return;
  const models = parser?.models || [];
  const selected = state.parserModel && state.parserModel !== "auto"
    ? state.parserModel
    : parser?.selectedModel || parser?.model || "auto";
  state.parserModels = models;
  if (selected) state.parserModel = selected;
  const autoLabel = parser?.selectedModel ? `Auto / best available (${parser.selectedModel})` : "Auto / best available";
  select.innerHTML = `<option value="auto">${escapeHtml(autoLabel)}</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  select.value = models.includes(state.parserModel) ? state.parserModel : "auto";
}

export async function loadHealth() {
  try {
    const health = await api("/api/health");
    const parserQuery = state.parserModel && state.parserModel !== "auto" ? `?model=${encodeURIComponent(state.parserModel)}` : "";
    const parser = await api(`/api/script/parser-health${parserQuery}`).catch((error) => ({ ok: false, detail: error.message, models: [] }));
    renderParserModelOptions(parser);
    renderGlobalStatus({ health, parser });
    const statusRail = $("statusRail");
    if (statusRail) {
      statusRail.innerHTML = [
        pill("Big Mac", health.bigMac),
        pill("Server", health.server),
        pill("Tunnel", health.tunnel),
        pill("Parser", parser),
        pill("Disk", health.disk),
        pill("Raw GUI", health.rawGui),
        pill("Wrapper", health.wrapper)
      ].join("");
    }
    const diagnosticsText = $("diagnosticsText");
    if (diagnosticsText) diagnosticsText.textContent = JSON.stringify({ health, parser }, null, 2);
    const healthScreenDetails = $("healthScreenDetails");
    if (healthScreenDetails) healthScreenDetails.textContent = JSON.stringify({ health, parser }, null, 2);
    $("parserTunnelCopy").textContent = parser.copy || "The parser uses the MacBook-side tunnel to BigMac Ollama. This is not MacBook-local inference.";
    const parserModelStatus = $("parserModelStatus");
    if (parserModelStatus) {
      parserModelStatus.textContent = parser.selectedModel
        ? `Configured: ${parser.configuredModel || parser.requestedModel || "auto"}. Selected: ${parser.selectedModel}. Available models: ${(parser.models || []).length}.`
        : `No usable parser model selected. Available models: ${(parser.models || []).length}.`;
    }
  } catch (error) {
    renderGlobalStatus();
    const statusRail = $("statusRail");
    if (statusRail) statusRail.innerHTML = `<button class="status-pill warn" type="button">Health: Failed</button>`;
    const diagnosticsText = $("diagnosticsText");
    if (diagnosticsText) diagnosticsText.textContent = error.message;
    const healthScreenDetails = $("healthScreenDetails");
    if (healthScreenDetails) healthScreenDetails.textContent = error.message;
  }
}

export async function loadLogs() {
  const logs = await api("/api/logs");
  $("diagnosticsText").textContent = `MacBook launcher log\n${logs.local || "(empty)"}\n\nBig Mac server log\n${logs.remote || "(empty)"}`;
}
