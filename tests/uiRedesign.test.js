import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { state, getActiveScene, getActiveSceneId, getSceneList } from "../public/modules/state.js";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

const sceneRenderJs = await read("../public/modules/audioDrama/sceneRender.js");
const audioDramaJs = await read("../public/modules/audioDramaView.js");
const navigationJs = await read("../public/modules/navigation.js");
const healthJs = await read("../public/modules/healthView.js");
const previewJs = await read("../public/modules/audioDrama/previewAssembly.js");
const takeReviewJs = await read("../public/modules/audioDrama/takeReview.js");
const appJs = await read("../public/app.js");
const voiceLabJs = await read("../public/modules/voiceLabView.js");
const indexHtml = await read("../public/index.html");
const stylesCss = await read("../public/styles.css");

// --- Behavioral: active scene resolution (multi-scene no longer collapses) ---
test("getActiveScene honors currentSceneId across parsed scenes", () => {
  state.parsedScript = { scenes: [{ id: "s1", lines: [] }, { id: "s2", lines: [] }, { id: "s3", lines: [] }] };
  state.scenes = [];
  state.currentSceneId = "s2";
  assert.equal(getActiveScene().id, "s2");
  assert.equal(getActiveSceneId(), "s2");
  assert.equal(getSceneList().length, 3);
});

test("getActiveScene falls back to first scene when id is unknown", () => {
  state.parsedScript = { scenes: [{ id: "a", lines: [] }, { id: "b", lines: [] }] };
  state.scenes = [];
  state.currentSceneId = "does-not-exist";
  assert.equal(getActiveScene().id, "a");
});

test("getActiveScene uses saved scenes when no parsed script is present", () => {
  state.parsedScript = null;
  state.scenes = [{ id: "saved-1", lines: [] }, { id: "saved-2", lines: [] }];
  state.currentSceneId = "saved-2";
  assert.equal(getActiveScene().id, "saved-2");
});

test("getActiveScene returns null when there are no scenes", () => {
  state.parsedScript = null;
  state.scenes = [];
  state.currentSceneId = "";
  assert.equal(getActiveScene(), null);
  assert.equal(getActiveSceneId(), "");
});

// --- Render submits the ready set, not all line IDs ---
test("scene render submits ready line IDs only", () => {
  assert.ok(sceneRenderJs.includes("lineIds: readyLineIds"), "must send readyLineIds");
  assert.ok(!sceneRenderJs.includes("lineIds: allLineIds"), "must not send allLineIds");
  assert.ok(sceneRenderJs.includes("getBlockedSceneLines"), "must surface blocked lines");
});

// --- Parser shows a human summary; raw JSON is demoted ---
test("parser renders a human summary and demotes raw JSON", () => {
  assert.ok(audioDramaJs.includes("renderParseSummary"), "parse summary exists");
  assert.ok(!audioDramaJs.includes("renderParsedLines(parsed.result.scenes[0])"), "no first-scene-only collapse");
  assert.ok(indexHtml.includes("parser-raw-fold"), "raw JSON lives behind a details fold");
  assert.ok(indexHtml.includes('id="parserSummary"'), "summary container present");
});

// --- No scenes[0] collapse pattern remains in the drama view ---
test("audioDramaView no longer hardcodes scenes[0] for the active scene", () => {
  assert.ok(!audioDramaJs.includes("state.parsedScript?.scenes?.[0] || state.scenes?.[0]"));
  assert.ok(audioDramaJs.includes("getActiveScene"));
  assert.ok(indexHtml.includes('id="sceneSelect"'), "scene selector present");
});

// --- copyText is honest about failure ---
test("copyText is async and offers a manual fallback on failure", () => {
  assert.ok(navigationJs.includes("export async function copyText"));
  assert.ok(navigationJs.includes("showManualCopyFallback"));
  assert.ok(navigationJs.includes("return false"));
});

// --- Health pills are spans, not dead buttons ---
test("health pills render as read-only spans", () => {
  assert.ok(healthJs.includes('<span class="status-pill'));
  assert.ok(!healthJs.includes('<button class="status-pill'));
});

// --- Preview visibility uses el.hidden, not style.display while hidden remains ---
test("preview container toggles via el.hidden", () => {
  assert.ok(previewJs.includes("audioContainer.hidden = false"));
  assert.ok(previewJs.includes("audioContainer.hidden = true"));
  assert.ok(!previewJs.includes('audioContainer.style.display'));
});

// --- Destructive deletion uses the scoped modal, not native confirm ---
test("take deletion uses scoped confirmation, not native confirm", () => {
  assert.ok(takeReviewJs.includes("confirmDestructive"));
  assert.ok(!takeReviewJs.includes("if (!confirm("));
  assert.ok(appJs.includes("confirmDestructive"));
  assert.ok(!appJs.includes("if (!confirm("));
  assert.ok(indexHtml.includes('id="confirmModal"'));
});

// --- CSS debt fixed ---
test("CSS defines --normal and styles destructive buttons", () => {
  assert.ok(stylesCss.includes("--normal:"));
  assert.ok(stylesCss.includes(".reactive-button.destructive"));
});

// --- Quick-create character failures are surfaced ---
test("quick-create character failure is surfaced, not console-only", async () => {
  const speakerMappingJs = await read("../public/modules/audioDrama/speakerMapping.js");
  assert.ok(speakerMappingJs.includes("showSpeakerRowError"));
  assert.ok(speakerMappingJs.includes("pushUiError"));
  assert.ok(speakerMappingJs.includes("setDramaStatus"));
});
