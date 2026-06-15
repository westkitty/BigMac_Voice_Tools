import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pickPort() {
  return 19000 + Math.floor(Math.random() * 10000);
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 8000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/projects`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("Timed out waiting for server.");
}

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function withServer(fn) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "bvt-routes-data-"));
  const port = pickPort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      BIGMAC_VOICETOOLS_DATA: dataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseUrl, child);
    await fn(baseUrl);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("named scenes selected route is not swallowed by generic scene-id route", async () => {
  await withServer(async (baseUrl) => {
    const projectResult = await requestJson(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ id: "route_project", name: "Route Project" })
    });
    assert.equal(projectResult.response.status, 201);

    const sceneResult = await requestJson(baseUrl, "/api/scenes", {
      method: "POST",
      body: JSON.stringify({
        id: "route_scene",
        projectId: "route_project",
        title: "Route Scene",
        lines: [{ id: "L001", type: "dialogue", speaker: "TIGER", text: "Route test.", takes: 1 }]
      })
    });
    assert.equal(sceneResult.response.status, 201);

    const selectedResult = await requestJson(baseUrl, "/api/scenes/selected?projectId=route_project&sceneId=route_scene");
    assert.equal(selectedResult.response.status, 200);
    assert.deepEqual(selectedResult.body.selectedTakes, {});
    assert.equal(selectedResult.body.projectId, "route_project");
    assert.equal(selectedResult.body.sceneId, "route_scene");
  });
});

test("named scene render endpoint processes candidates and summaries", async () => {
  await withServer(async (baseUrl) => {
    // 1. Missing projectId/sceneId
    const resNoProject = await requestJson(baseUrl, "/api/scenes/render", {
      method: "POST",
      body: JSON.stringify({ sceneId: "route_scene" })
    });
    assert.equal(resNoProject.response.status, 400);
    assert.equal(resNoProject.body.code, "MISSING_PROJECT");

    const resNoScene = await requestJson(baseUrl, "/api/scenes/render", {
      method: "POST",
      body: JSON.stringify({ projectId: "route_project" })
    });
    assert.equal(resNoScene.response.status, 400);
    assert.equal(resNoScene.body.code, "MISSING_SCENE");

    // Create project & scene
    await requestJson(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ id: "p1", name: "Project 1" })
    });

    await requestJson(baseUrl, "/api/scenes", {
      method: "POST",
      body: JSON.stringify({
        id: "s1",
        projectId: "p1",
        title: "Scene 1",
        lines: [
          { id: "L001", type: "dialogue", speaker: "UNKNOWN", text: "Line 1 text.", takes: 1 },
          { id: "L002", type: "dialogue", speaker: "TIGER", text: "", takes: 1 }
        ]
      })
    });

    // Post to /api/scenes/render and assert it returns status 200 with skipped/failed details
    const resRender = await requestJson(baseUrl, "/api/scenes/render", {
      method: "POST",
      body: JSON.stringify({
        projectId: "p1",
        sceneId: "s1",
        lineIds: ["L001", "L002"]
      })
    });

    assert.equal(resRender.response.status, 200);
    assert.equal(resRender.body.ok, true);
    assert.equal(resRender.body.summary.requested, 2);
    assert.equal(resRender.body.summary.rendered, 0);
    assert.equal(resRender.body.summary.skipped, 2);
    assert.equal(resRender.body.summary.failed, 0);

    const l001Result = resRender.body.results.find(r => r.lineId === "L001");
    assert.equal(l001Result.skipped, true);
    assert.equal(l001Result.code, "UNKNOWN_SPEAKER");

    const l002Result = resRender.body.results.find(r => r.lineId === "L002");
    assert.equal(l002Result.skipped, true);
    assert.equal(l002Result.code, "EMPTY_LINE_TEXT");
  });
});

test("route-level render-line validation check cases", async () => {
  await withServer(async (baseUrl) => {
    // 1. Missing Scene ID
    const resNoScene = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ lineId: "L001" })
    });
    assert.equal(resNoScene.response.status, 400);
    assert.equal(resNoScene.body.code, "MISSING_SCENE");

    // 2. Scene Not Found
    const resSceneNotFound = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "nonexistent_scene", lineId: "L001" })
    });
    assert.equal(resSceneNotFound.response.status, 404);
    assert.equal(resSceneNotFound.body.code, "MISSING_SCENE");

    // Create project & scene for other tests
    const projectResult = await requestJson(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ id: "test_project", name: "Test Project" })
    });
    assert.equal(projectResult.response.status, 201);

    const sceneResult = await requestJson(baseUrl, "/api/scenes", {
      method: "POST",
      body: JSON.stringify({
        id: "test_scene",
        projectId: "test_project",
        title: "Test Scene",
        lines: [
          { id: "L001", type: "dialogue", speaker: "TIGER", text: "Test text.", takes: 1 },
          { id: "L002", type: "dialogue", speaker: "UNKNOWN", text: "Unknown text.", takes: 1 },
          { id: "L003", type: "dialogue", speaker: "TIGER", text: "", takes: 1 }
        ]
      })
    });
    assert.equal(sceneResult.response.status, 201);

    // 3. Line Not Found
    const resLineNotFound = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L999" })
    });
    assert.equal(resLineNotFound.response.status, 404);
    assert.equal(resLineNotFound.body.code, "MISSING_LINE");

    // 4. Empty Line Text
    const resEmptyText = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L003" })
    });
    assert.equal(resEmptyText.response.status, 400);
    assert.equal(resEmptyText.body.code, "EMPTY_LINE_TEXT");

    // 5. Invalid Take Count
    const resInvalidTakes = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L001", takes: 15 })
    });
    assert.equal(resInvalidTakes.response.status, 400);
    assert.equal(resInvalidTakes.body.code, "INVALID_TAKE_COUNT");

    // 6. Unknown speaker / missing character
    const resUnknownSpeaker = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L002" })
    });
    assert.equal(resUnknownSpeaker.response.status, 400);
    assert.equal(resUnknownSpeaker.body.code, "UNKNOWN_SPEAKER");

    const resMissingChar = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L001" })
    });
    assert.equal(resMissingChar.response.status, 404);
    assert.equal(resMissingChar.body.code, "MISSING_CHARACTER");

    // Create character Tiger with no voice
    const charResult = await requestJson(baseUrl, "/api/characters", {
      method: "POST",
      body: JSON.stringify({
        id: "tiger_char",
        projectId: "test_project",
        name: "TIGER",
        voiceId: "",
        preferredEngine: "chatterbox"
      })
    });
    assert.equal(charResult.response.status, 201);

    // 7. Missing Voice
    const resMissingVoice = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L001" })
    });
    assert.equal(resMissingVoice.response.status, 400);
    assert.equal(resMissingVoice.body.code, "MISSING_VOICE");

    // Map character to a nonexistent voice
    await requestJson(baseUrl, "/api/characters", {
      method: "POST",
      body: JSON.stringify({
        id: "tiger_char",
        projectId: "test_project",
        name: "TIGER",
        voiceId: "nonexistent_voice"
      })
    });

    // 8. Voice Not Found
    const resVoiceNotFound = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L001" })
    });
    assert.equal(resVoiceNotFound.response.status, 404);
    assert.equal(resVoiceNotFound.body.code, "VOICE_NOT_FOUND");

    // Create a voice record
    const voiceResult = await requestJson(baseUrl, "/api/voices", {
      method: "POST",
      body: JSON.stringify({
        name: "TigerVoice",
        fileName: "tiger.wav",
        dataBase64: Buffer.from("fake").toString("base64")
      })
    });
    assert.equal(voiceResult.response.status, 201);
    const voiceId = voiceResult.body.voice.id;

    // Update character with valid voice and unconfigured engine
    await requestJson(baseUrl, "/api/characters", {
      method: "POST",
      body: JSON.stringify({
        id: "tiger_char",
        projectId: "test_project",
        name: "TIGER",
        voiceId: voiceId,
        preferredEngine: "dia"
      })
    });

    // 9. Engine Not Configured
    const resEngineNotConfigured = await requestJson(baseUrl, "/api/scenes/render-line", {
      method: "POST",
      body: JSON.stringify({ sceneId: "test_scene", lineId: "L001" })
    });
    assert.equal(resEngineNotConfigured.response.status, 501);
    assert.equal(resEngineNotConfigured.body.code, "ENGINE_NOT_CONFIGURED");
  });
});
