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

test("named scene render endpoint returns explicit deferred response", async () => {
  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/scenes/render", {
      method: "POST",
      body: JSON.stringify({ sceneId: "route_scene" })
    });
    assert.equal(result.response.status, 501);
    assert.match(result.body.error, /deferred/i);
  });
});
