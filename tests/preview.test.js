import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStore } from "../src/store.js";
import { assembleScenePreview } from "../src/preview.js";

test("assembleScenePreview returns validation errors for missing projectId or sceneId", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    
    const res1 = await assembleScenePreview({ projectId: "", sceneId: "s1", store });
    assert.equal(res1.ok, false);
    assert.equal(res1.code, "MISSING_PROJECT");
    assert.equal(res1.status, 400);

    const res2 = await assembleScenePreview({ projectId: "p1", sceneId: "", store });
    assert.equal(res2.ok, false);
    assert.equal(res2.code, "MISSING_SCENE");
    assert.equal(res2.status, 400);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("assembleScenePreview returns error for invalid mode or gapsMs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    
    const res1 = await assembleScenePreview({ projectId: "p1", sceneId: "s1", mode: "invalid-mode", store });
    assert.equal(res1.ok, false);
    assert.equal(res1.code, "INVALID_PREVIEW_MODE");
    assert.equal(res1.status, 400);

    const res2 = await assembleScenePreview({ projectId: "p1", sceneId: "s1", gapsMs: -10, store });
    assert.equal(res2.ok, false);
    assert.equal(res2.code, "INVALID_GAP_MS");
    assert.equal(res2.status, 400);

    const res3 = await assembleScenePreview({ projectId: "p1", sceneId: "s1", gapsMs: 4000, store });
    assert.equal(res3.ok, false);
    assert.equal(res3.code, "INVALID_GAP_MS");
    assert.equal(res3.status, 400);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("assembleScenePreview returns 404 for missing project or scene", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    
    const res1 = await assembleScenePreview({ projectId: "p-missing", sceneId: "s1", store });
    assert.equal(res1.ok, false);
    assert.equal(res1.code, "MISSING_PROJECT");
    assert.equal(res1.status, 404);

    await store.saveProject({ id: "p1", name: "Project 1" });
    const res2 = await assembleScenePreview({ projectId: "p1", sceneId: "s-missing", store });
    assert.equal(res2.ok, false);
    assert.equal(res2.code, "MISSING_SCENE");
    assert.equal(res2.status, 404);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("assembleScenePreview skip-missing and fail-on-missing behaviors", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    const project = await store.saveProject({ id: "p1", name: "Project 1" });
    const scene = await store.saveScene({
      id: "s1",
      projectId: "p1",
      title: "Scene 1",
      lines: [
        { id: "L001", speaker: "TIGER", text: "Line 1" },
        { id: "L002", speaker: "NARRATOR", text: "Line 2" }
      ]
    });

    // 1. No selected takes at all -> 409 NO_SELECTED_TAKES
    const resNoTakes = await assembleScenePreview({ projectId: "p1", sceneId: "s1", store });
    assert.equal(resNoTakes.ok, false);
    assert.equal(resNoTakes.code, "NO_SELECTED_TAKES");
    assert.equal(resNoTakes.status, 409);

    // Add takes
    const take1 = await store.saveTake({
      id: "take-1",
      voiceId: "voice-1",
      sourceText: "Line 1",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take1.wav",
      projectId: "p1",
      sceneId: "s1",
      lineId: "L001"
    });
    
    await store.selectTake({
      projectId: "p1",
      sceneId: "s1",
      lineId: "L001",
      takeId: take1.id
    });

    // 2. Strict mode (fail-on-missing) fails because L002 is missing selected take -> 409 NO_SELECTED_TAKE
    const resStrict = await assembleScenePreview({ projectId: "p1", sceneId: "s1", mode: "fail-on-missing", store });
    assert.equal(resStrict.ok, false);
    assert.equal(resStrict.code, "NO_SELECTED_TAKE");
    assert.equal(resStrict.status, 409);
    assert.equal(resStrict.skipped.length, 1);
    assert.equal(resStrict.skipped[0].lineId, "L002");

    // 3. Skip mode (skip-missing) succeeds
    let runWithInputCalled = false;
    let runCalled = false;

    const mockRunWithInput = async (cmd, args, input) => {
      runWithInputCalled = true;
      assert.equal(cmd, "ssh");
      assert.equal(args[0], "westcat");
      return { ok: true, stdout: "", stderr: "", code: 0 };
    };

    const mockRun = async (cmd, args) => {
      runCalled = true;
      assert.equal(cmd, "ssh");
      assert.equal(args[0], "westcat");
      return { ok: true, stdout: "5.5", stderr: "", code: 0 }; // 5.5 seconds duration
    };

    const resSkip = await assembleScenePreview({
      projectId: "p1",
      sceneId: "s1",
      mode: "skip-missing",
      store,
      runFn: mockRun,
      runWithInputFn: mockRunWithInput
    });

    assert.equal(resSkip.ok, true);
    assert.equal(runWithInputCalled, true);
    assert.equal(runCalled, true);
    assert.equal(resSkip.summary.included, 1);
    assert.equal(resSkip.summary.skipped, 1);
    assert.equal(resSkip.preview.durationEstimateMs, 5500);
    assert.equal(resSkip.skipped[0].lineId, "L002");

  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("assembleScenePreview checks allowlist on take path and preview output path", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    await store.saveProject({ id: "p1", name: "Project 1" });
    await store.saveScene({
      id: "s1",
      projectId: "p1",
      title: "Scene 1",
      lines: [
        { id: "L001", speaker: "TIGER", text: "Line 1" }
      ]
    });

    // Save take outside allowlisted root
    const takeOutside = await store.saveTake({
      id: "take-1",
      voiceId: "voice-1",
      sourceText: "Line 1",
      outputPath: "/tmp/not-allowed.wav",
      projectId: "p1",
      sceneId: "s1",
      lineId: "L001"
    });
    
    await store.selectTake({
      projectId: "p1",
      sceneId: "s1",
      lineId: "L001",
      takeId: takeOutside.id
    });

    const res = await assembleScenePreview({ projectId: "p1", sceneId: "s1", store });
    assert.equal(res.ok, false);
    assert.equal(res.code, "AUDIO_PATH_NOT_ALLOWED");
    assert.equal(res.status, 403);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
