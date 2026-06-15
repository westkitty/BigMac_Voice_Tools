import { $, escapeHtml, helpContent, state } from "./state.js";

export function setView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".app-view").forEach((view) => {
    const active = view.id === viewId;
    view.classList.toggle("hidden", !active);
    view.classList.toggle("active-view", active);
    view.setAttribute("aria-hidden", active ? "false" : "true");
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === viewId;
    button.classList.toggle("active", active);
    if (button.tagName === "BUTTON") button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.dispatchEvent(new CustomEvent("bvt:view-change", { detail: { viewId } }));
}

export function copyText(value, successMessage = "Copied.") {
  if (!value) return false;
  navigator.clipboard?.writeText(value).catch(() => {});
  const status = $("activityStatusText");
  if (status) status.textContent = successMessage;
  return true;
}

export function openHelp(key) {
  const content = helpContent[key] || helpContent.global;
  $("helpTitle").textContent = content.title;
  $("helpBody").innerHTML = content.body.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  $("helpModal").showModal();
}

export function openStudioWindow() {
  const features = "popup=yes,width=1440,height=980,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";
  const opened = window.open("/", "BigMacVoiceToolsStudio", features);
  if (opened) opened.focus();
  return Boolean(opened);
}
