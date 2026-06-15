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

test("assembleScenePreview timing overrides, fades, and ffmpeg command verification", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-preview-"));
  try {
    const store = createStore(dir);
    await store.saveProject({ id: "p1", name: "Project 1" });
    await store.saveScene({
      id: "s1",
      projectId: "p1",
      title: "Scene 1",
      lines: [
        { id: "L001", speaker: "TIGER", text: "Line 1." },
        { id: "L002", speaker: "NARRATOR", text: "Line 2." }
      ]
    });

    const take1 = await store.saveTake({
      id: "take-1",
      voiceId: "voice-1",
      sourceText: "Line 1",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take1.wav",
      projectId: "p1",
      sceneId: "s1",
      lineId: "L001"
    });
    const take2 = await store.saveTake({
      id: "take-2",
      voiceId: "voice-1",
      sourceText: "Line 2",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take2.wav",
      projectId: "p1",
      sceneId: "s1",
      lineId: "L002"
    });

    await store.selectTake({ projectId: "p1", sceneId: "s1", lineId: "L001", takeId: take1.id });
    await store.selectTake({ projectId: "p1", sceneId: "s1", lineId: "L002", takeId: take2.id });

    // Validate invalid fades return 400
    const resBadFadeIn = await assembleScenePreview({ projectId: "p1", sceneId: "s1", fadeInMs: -5, store });
    assert.equal(resBadFadeIn.ok, false);
    assert.equal(resBadFadeIn.code, "INVALID_FADE_IN_MS");

    const resBadFadeOut = await assembleScenePreview({ projectId: "p1", sceneId: "s1", fadeOutMs: 600, store });
    assert.equal(resBadFadeOut.ok, false);
    assert.equal(resBadFadeOut.code, "INVALID_FADE_OUT_MS");

    const resBadPause = await assembleScenePreview({
      projectId: "p1",
      sceneId: "s1",
      lineTiming: { "L001": { "pauseAfterMs": 4000 } },
      store
    });
    assert.equal(resBadPause.ok, false);
    assert.equal(resBadPause.code, "INVALID_PAUSE_AFTER_MS");

    // Success assembly check with timing and fades
    let runWithInputArgs = null;
    let runWithInputContent = null;
    let runArgsList = [];

    const mockRunWithInput = async (cmd, args, input) => {
      runWithInputArgs = args;
      runWithInputContent = input;
      return { ok: true, stdout: "", stderr: "", code: 0 };
    };

    const mockRun = async (cmd, args) => {
      runArgsList.push(args);
      // Durations loop will execute and output durations for files:
      // take1.wav and take2.wav
      // We will output:
      // "1.250000\n0.020000" (first file is 1.25s, second is 0.02s)
      if (args[1] && args[1].includes("format=duration")) {
        return { ok: true, stdout: "1.250000\n0.020000\n", stderr: "", code: 0 };
      }
      return { ok: true, stdout: "1.62", stderr: "", code: 0 };
    };

    const res = await assembleScenePreview({
      projectId: "p1",
      sceneId: "s1",
      gapsMs: 350,
      fadeInMs: 10,
      fadeOutMs: 35,
      lineTiming: { "L001": { "pauseAfterMs": 700 } },
      store,
      runFn: mockRun,
      runWithInputFn: mockRunWithInput
    });

    assert.equal(res.ok, true);
    assert.equal(res.summary.included, 2);
    assert.equal(res.summary.skipped, 0);

    // Let's inspect the piped command chain
    const fullCmd = runWithInputArgs[1];
    
    // Duration loop check:
    // first file has duration 1.25s. Fades are: in 10ms (0.01s), out 35ms (0.035s).
    // duration (1.25) > fadeIn (0.01) + fadeOut (0.035). No clamping needed.
    // fadeOutStart = 1.25 - 0.035 = 1.215.
    // afade filter should contain: afade=t=in:st=0:d=0.0100,afade=t=out:st=1.2150:d=0.0350
    assert.match(fullCmd, /afade=t=in:st=0:d=0\.0100/);
    assert.match(fullCmd, /afade=t=out:st=1\.2150:d=0\.0350/);

    // second file has duration 0.02s (20ms).
    // duration (0.02) < fadeIn (0.01) + fadeOut (0.035). Clamping required!
    // sum = 0.045s.
    // activeFadeIn = (0.01 / 0.045) * 0.02 = 0.0044s.
    // activeFadeOut = (0.035 / 0.045) * 0.02 = 0.0156s.
    // fadeOutStart = 0.02 - 0.0156 = 0.0044s.
    // afade filter: afade=t=in:st=0:d=0.0044,afade=t=out:st=0.0044:d=0.0156
    assert.match(fullCmd, /afade=t=in:st=0:d=0\.0044/);
    assert.match(fullCmd, /afade=t=out:st=0\.0044:d=0\.0156/);

    // Silence gap checks:
    // L001 has pauseAfterMs 700ms override, beating default 350ms gap.
    // So unique silence files should include silence_700.wav.
    // The concat manifest should contain silence_700.wav.
    assert.match(fullCmd, /silence_700\.wav/);
    assert.match(runWithInputContent, /silence_700\.wav/);
    // And should not contain silence_350.wav because it was overridden.
    assert.equal(runWithInputContent.includes("silence_350.wav"), false);

  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

