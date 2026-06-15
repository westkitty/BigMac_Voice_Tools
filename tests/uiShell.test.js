import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const dashboardJs = await readFile(new URL("../public/modules/dashboardView.js", import.meta.url), "utf8");

test("studio shell exposes required redesign landmarks", () => {
  for (const needle of [
    "degradedStackBanner",
    "workflowStepSummary",
    "inspectorContent",
    "activityStatusText",
    "data-drama-step=\"script\"",
    "data-drama-step=\"export\"",
    "Copy relaunch command"
  ]) {
    assert.ok(indexHtml.includes(needle), `missing ${needle}`);
  }
});

test("studio shell preserves canonical launch doctrine", () => {
  assert.ok(indexHtml.includes("127.0.0.1:7870"));
  assert.ok(indexHtml.includes("/Users/andrew/bin/bigmac-voicetools-launch"));
  assert.ok(indexHtml.includes("7873 except debugging"));
});

test("frontend binds shell controls through guarded handlers", () => {
  assert.ok(appJs.includes("function bind(id, eventName, handler)"));
  assert.ok(appJs.includes("data-copy-command"));
  assert.ok(appJs.includes("data-drama-step"));
  assert.ok(appJs.includes("renderWorkflowStatus"));
});

test("dashboard computes workflow readiness and degraded stack state", () => {
  assert.ok(dashboardJs.includes("function workflowModel()"));
  assert.ok(dashboardJs.includes("renderDegradedBanner"));
  assert.ok(dashboardJs.includes("renderWorkflowStatus"));
  assert.ok(dashboardJs.includes("setDramaStep"));
});
