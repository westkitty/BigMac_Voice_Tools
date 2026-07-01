import { $, helpContent, state } from "./state.js";

// Command Center is the always-present home stage. Every other section pops
// out of the left rail as a drawer (Popover API, top layer — never clipped).
export const DRAWER_VIEWS = new Set([
  "voiceLabView",
  "audioDramaView",
  "takesView",
  "voicesView",
  "healthView"
]);

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

// Move keyboard focus to the heading of the newly active section so screen
// readers and keyboard users land in the right place on navigation.
function focusViewHeading(viewId) {
  const el = $(viewId);
  if (!el) return;
  const headingId = el.getAttribute("aria-labelledby");
  const heading = (headingId && $(headingId)) || el.querySelector("h2, h3");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  try { heading.focus({ preventScroll: false }); } catch { /* ignore */ }
}

// Keep the URL hash in sync so refresh/back can restore the active section.
function syncHash(viewId) {
  if (!viewId) return;
  const next = `#${viewId}`;
  if (window.location.hash !== next) {
    try { window.history.replaceState(null, "", next); } catch { /* ignore */ }
  }
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
  syncHash(viewId);
  focusViewHeading(viewId);
  document.dispatchEvent(new CustomEvent("bvt:view-change", { detail: { viewId } }));
}

export function openDrawer(viewId) {
  const el = $(viewId);
  if (!el) return;
  DRAWER_VIEWS.forEach((id) => {
    if (id !== viewId) $(id)?.hidePopover?.();
  });
  // Drawers are popover="manual" (workspaces, not transient menus). Manual
  // popovers do NOT light-dismiss, so showing synchronously from the triggering
  // click is safe — an "auto" popover would be killed by that same click.
  if (el.showPopover && el.matches && !el.matches(":popover-open")) {
    try { el.showPopover(); } catch { /* already open */ }
  }
  updateNav(viewId, { drawerOpen: true });
  syncHash(viewId);
  focusViewHeading(viewId);
  document.dispatchEvent(new CustomEvent("bvt:view-change", { detail: { viewId } }));
}

// On load, restore the last section from the URL hash (refresh/deep-link).
export function restoreViewFromHash() {
  const id = (window.location.hash || "").replace(/^#/, "");
  if (!id) return false;
  if (!$(id)) return false;
  setView(id);
  return true;
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

// Manual popovers don't close on Esc; restore that affordance ourselves so the
// drawers still feel like dismissible panels.
function closeOpenDrawer() {
  for (const id of DRAWER_VIEWS) {
    const el = $(id);
    if (el?.matches?.(":popover-open")) {
      el.hidePopover?.();
      return true;
    }
  }
  return false;
}

// Keep nav highlight in sync when a drawer is closed (Esc / close button / nav switch).
export function initDrawers() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && closeOpenDrawer()) {
      event.preventDefault();
    }
  });
  DRAWER_VIEWS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("toggle", (event) => {
      if (event.newState === "closed") {
        const trigger = document.querySelector(`[data-view-target="${id}"]`);
        trigger?.classList.remove("active");
        trigger?.setAttribute?.("aria-current", "false");
        // If nothing else is open, return focus highlight to the home stage.
        const anyOpen = [...DRAWER_VIEWS].some((other) => $(other)?.matches?.(":popover-open"));
        if (!anyOpen) updateNav(state.activeView);
      }
    });
  });
}

// Honest clipboard copy. Resolves to true only when the write actually
// succeeded. On failure it offers a manual-copy fallback and reports the
// failure instead of pretending success.
export async function copyText(value, successMessage = "Copied.") {
  if (!value) return false;
  const status = $("activityStatusText");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(value);
    if (status) status.textContent = successMessage;
    return true;
  } catch {
    if (status) status.textContent = "Copy failed — copy the highlighted text manually.";
    showManualCopyFallback(value);
    return false;
  }
}

function showManualCopyFallback(value) {
  // window.prompt presents the value pre-selected so the user can Cmd+C it.
  // Crude but reliable and, crucially, honest when the async API is blocked.
  try {
    window.prompt("Copy failed. Select and copy this manually:", value);
  } catch {
    /* prompt unavailable — the status line already reported the failure */
  }
}

// Scoped destructive confirmation. Returns a Promise<boolean>. Renders a real
// modal (count, scope, irreversibility) instead of a bare native confirm().
export function confirmDestructive({ title = "Confirm deletion", message = "", count = 0, scope = "", irreversible = true } = {}) {
  const dialog = $("confirmModal");
  if (!dialog || typeof dialog.showModal !== "function") {
    // Graceful fallback if the dialog is missing for any reason.
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  $("confirmModalTitle").textContent = title;
  $("confirmModalMessage").textContent = message;
  const meta = $("confirmModalMeta");
  if (meta) {
    const bits = [];
    if (count) bits.push(`${count} take${count === 1 ? "" : "s"} affected`);
    if (scope) bits.push(scope);
    if (irreversible) bits.push("This cannot be undone — there is no restore.");
    meta.textContent = bits.join(" · ");
  }
  return new Promise((resolve) => {
    const confirmBtn = $("confirmModalConfirm");
    const cancelBtn = $("confirmModalCancel");
    const cleanup = (result) => {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
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
