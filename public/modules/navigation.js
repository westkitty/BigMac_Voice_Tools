import { $, helpContent, state } from "./state.js";

// Secondary surfaces render as pop-out drawers (Popover API, top layer) instead
// of full-page swaps. Workspaces remain in-place stages.
export const DRAWER_VIEWS = new Set(["takesView", "voicesView", "healthView"]);

function updateNav(activeId, { drawerOpen = false } = {}) {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const target = button.dataset.viewTarget;
    const isDrawer = DRAWER_VIEWS.has(target);
    // Workspace triggers reflect the active stage; drawer triggers reflect open state.
    const active = isDrawer ? drawerOpen && target === activeId : target === activeId;
    button.classList.toggle("active", active);
    if (button.tagName === "BUTTON") {
      button.setAttribute("aria-current", active ? (isDrawer ? "true" : "page") : "false");
    }
  });
}

function applyStage(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".app-view").forEach((view) => {
    const active = view.id === viewId;
    view.classList.toggle("hidden", !active);
    view.classList.toggle("active-view", active);
    view.setAttribute("aria-hidden", active ? "false" : "true");
  });
  updateNav(viewId);
  document.dispatchEvent(new CustomEvent("bvt:view-change", { detail: { viewId } }));
}

export function openDrawer(viewId) {
  const el = $(viewId);
  if (!el) return;
  DRAWER_VIEWS.forEach((id) => {
    if (id !== viewId) $(id)?.hidePopover?.();
  });
  if (el.showPopover && el.matches && !el.matches(":popover-open")) {
    try { el.showPopover(); } catch { /* already open */ }
  }
  updateNav(viewId, { drawerOpen: true });
  document.dispatchEvent(new CustomEvent("bvt:view-change", { detail: { viewId } }));
}

export function setView(viewId) {
  if (DRAWER_VIEWS.has(viewId)) {
    openDrawer(viewId);
    return;
  }
  // Switching to a workspace: dismiss any open drawer, then animate the swap.
  DRAWER_VIEWS.forEach((id) => $(id)?.hidePopover?.());
  const run = () => applyStage(viewId);
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(run);
  } else {
    run();
  }
}

// Keep nav highlight in sync when a drawer is light-dismissed (Esc / outside click).
export function initDrawers() {
  DRAWER_VIEWS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("toggle", (event) => {
      if (event.newState === "closed") {
        const trigger = document.querySelector(`[data-view-target="${id}"]`);
        trigger?.classList.remove("active");
        trigger?.setAttribute?.("aria-current", "false");
      }
    });
  });
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
  const body = $("helpBody");
  body.replaceChildren(...content.body.map((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    return paragraph;
  }));
  $("helpModal").showModal();
}

export function openStudioWindow() {
  const features = "popup=yes,width=1440,height=980,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";
  const opened = window.open("/", "BigMacVoiceToolsStudio", features);
  if (opened) opened.focus();
  return Boolean(opened);
}
