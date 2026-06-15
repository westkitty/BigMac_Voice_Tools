import { $, escapeHtml, helpContent } from "./state.js";

export function setView(viewId) {
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("hidden", view.id !== viewId));
  document.querySelectorAll("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === viewId));
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
