import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { getRemoteConfig, isAllowedAudioPath } from "./src/config.js";
import { generateTake, listEngines } from "./src/engines.js";
import { getHealth } from "./src/health.js";
import { getOllamaParserConfig, getParserHealth, parseScriptWithOllama } from "./src/ollamaParser.js";
import { analyzeAudio } from "./src/quality.js";
import { checkParagraphs, formatDocumentForSpeech, parseDialogue, tuneSyntaxForTts } from "./src/scriptTools.js";
import { createStore } from "./src/store.js";
import { run } from "./src/system.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataRoot = process.env.BIGMAC_VOICETOOLS_DATA || path.join(homedir(), "Library", "Application Support", "BigMacVoiceTools");
const store = createStore(dataRoot);
const remoteConfig = getRemoteConfig();
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 7870);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4"
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024 * 80) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendError(res, error, status = 500) {
  sendJson(res, status, { error: error.message || String(error) });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  createReadStream(filePath)
    .on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(404);
        res.end("Not found");
      } else {
        res.end();
      }
    })
    .on("open", () => {
      res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    })
    .pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, await getHealth());
      return;
    }
    if (url.pathname === "/api/engines" && req.method === "GET") {
      sendJson(res, 200, { engines: listEngines() });
      return;
    }
    if (url.pathname === "/api/engine-health" && req.method === "GET") {
      sendJson(res, 200, { engines: listEngines(), remote: remoteConfig });
      return;
    }
    if (url.pathname === "/api/voices" && req.method === "GET") {
      sendJson(res, 200, { voices: await store.listVoices() });
      return;
    }
    if (url.pathname === "/api/projects" && req.method === "GET") {
      sendJson(res, 200, { projects: await store.listProjects() });
      return;
    }
    if (url.pathname === "/api/projects" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, { project: await store.saveProject(body) });
      return;
    }
    if (url.pathname.startsWith("/api/projects/") && req.method === "GET") {
      const project = await store.getProject(decodeURIComponent(url.pathname.slice("/api/projects/".length)));
      if (!project) throw new Error("Project was not found.");
      sendJson(res, 200, { project });
      return;
    }
    if (url.pathname === "/api/projects/delete" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, deleted: await store.deleteProject(body.id) });
      return;
    }
    if (url.pathname === "/api/characters" && req.method === "GET") {
      sendJson(res, 200, { characters: await store.listCharacters(url.searchParams.get("projectId") || "") });
      return;
    }
    if (url.pathname === "/api/characters" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, { character: await store.saveCharacter(body) });
      return;
    }
    if (url.pathname === "/api/characters/delete" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, deleted: await store.deleteCharacter(body.id) });
      return;
    }
    if (url.pathname === "/api/scenes" && req.method === "GET") {
      sendJson(res, 200, { scenes: await store.listScenes(url.searchParams.get("projectId") || "") });
      return;
    }
    if (url.pathname === "/api/scenes" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, { scene: await store.saveScene(body) });
      return;
    }
    if (url.pathname.startsWith("/api/scenes/") && req.method === "GET" && !["/api/scenes/selected"].includes(url.pathname) && !url.pathname.startsWith("/api/scenes/render")) {
      const scene = await store.getScene(decodeURIComponent(url.pathname.slice("/api/scenes/".length)));
      if (!scene) throw new Error("Scene was not found.");
      sendJson(res, 200, { scene });
      return;
    }
    if (url.pathname === "/api/scenes/delete" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, deleted: await store.deleteScene(body.id) });
      return;
    }
    if (url.pathname === "/api/voices" && req.method === "POST") {
      const body = await readBody(req);
      const voice = await store.saveVoice(body);
      const warnings = await analyzeAudio(voice.filePath);
      if (warnings.length) {
        voice.qualityWarnings = warnings;
        const state = JSON.parse(await readFile(store.paths.stateFile, "utf8"));
        state.voices = state.voices.map((item) => item.id === voice.id ? voice : item);
        await writeFile(store.paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
      }
      sendJson(res, 201, { voice });
      return;
    }
    if (url.pathname === "/api/takes" && req.method === "GET") {
      sendJson(res, 200, { takes: await store.listTakes() });
      return;
    }
    if (url.pathname === "/api/takes/delete" && req.method === "POST") {
      const body = await readBody(req);
      const take = await store.deleteTake(body.id);
      if (isAllowedAudioPath(take.outputPath, remoteConfig)) {
        await run("ssh", ["westcat", "rm", "-f", take.outputPath], { timeout: 10000 });
      }
      sendJson(res, 200, { ok: true, deleted: take });
      return;
    }
    if (url.pathname === "/api/scenes/render-line" && req.method === "POST") {
      const body = await readBody(req);
      const scene = await store.getScene(body.sceneId);
      if (!scene) throw new Error("Scene was not found.");
      const line = scene.lines.find((item) => item.id === body.lineId);
      if (!line) throw new Error("Scene line was not found.");
      const characters = await store.listCharacters(scene.projectId);
      const character = characters.find((item) => item.id === (body.characterId || line.characterId) || item.name.toLowerCase() === line.speaker.toLowerCase());
      const voiceId = body.voiceId || character?.voiceId || line.voiceId;
      if (!voiceId) throw new Error(`Speaker ${line.speaker} has no assigned reference voice. Assign a voice before rendering this line.`);
      const voice = await store.getVoice(voiceId);
      if (!voice) throw new Error(`Assigned voice for speaker ${line.speaker} was not found.`);
      const takeCount = Math.max(1, Math.min(10, Number(body.takes || line.takes || 1)));
      const takes = [];
      for (let index = 0; index < takeCount; index += 1) {
        const result = await generateTake({
          engine: body.engine || character?.preferredEngine || "chatterbox",
          voice,
          text: line.text,
          model: body.model,
          exaggeration: body.exaggeration,
          cfgWeight: body.cfgWeight
        });
        await store.markVoiceUsed(voice.id);
        takes.push(await store.saveTake({
          projectId: scene.projectId,
          sceneId: scene.id,
          lineId: line.id,
          speaker: line.speaker,
          characterId: character?.id || line.characterId || "",
          engine: body.engine || character?.preferredEngine || "chatterbox",
          takeNumber: index + 1,
          text: line.text,
          sourceText: line.text,
          emotion: line.emotion,
          pace: line.pace,
          deliveryCue: line.deliveryCue,
          voiceId: voice.id,
          model: body.model || result.metadata.model || "Standard",
          settings: { exaggeration: Number(body.exaggeration || 0.5), cfgWeight: Number(body.cfgWeight || 0.5) },
          outputPath: result.remotePath
        }));
      }
      sendJson(res, 201, { takes });
      return;
    }
    if (url.pathname === "/api/scenes/render" && req.method === "POST") {
      sendJson(res, 501, { error: "Render scene is deferred until render-line is proven for this project." });
      return;
    }
    if (url.pathname === "/api/scenes/select-take" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, { selected: await store.selectTake(body) });
      return;
    }
    if (url.pathname === "/api/scenes/selected" && req.method === "GET") {
      sendJson(res, 200, await store.listSelectedTakes({
        projectId: url.searchParams.get("projectId") || "",
        sceneId: url.searchParams.get("sceneId") || ""
      }));
      return;
    }
    if (url.pathname === "/api/scenes/assemble-preview" && req.method === "POST") {
      sendJson(res, 501, { error: "Preview assembly is deferred until selected-take workflow is proven." });
      return;
    }
    if (url.pathname === "/api/generate" && req.method === "POST") {
      const body = await readBody(req);
      const voice = await store.getVoice(body.voiceId);
      if (!voice) throw new Error("Selected voice was not found.");
      const result = await generateTake({
        engine: body.engine || "chatterbox",
        voice,
        text: body.text,
        model: body.model,
        exaggeration: body.exaggeration,
        cfgWeight: body.cfgWeight
      });
      const generated = result.generated;
      await store.markVoiceUsed(voice.id);
      const take = await store.saveTake({
        voiceId: voice.id,
        sourceText: body.text,
        engine: "chatterbox",
        model: body.model || result.metadata.model || "Standard",
        settings: { exaggeration: Number(body.exaggeration || 0.5), cfgWeight: Number(body.cfgWeight || 0.5) },
        outputPath: result.remotePath
      });
      sendJson(res, 201, { take, generated });
      return;
    }
    if (url.pathname === "/api/generate-conversation" && req.method === "POST") {
      const body = await readBody(req);
      const turns = Array.isArray(body.turns) ? body.turns.slice(0, 80) : [];
      if (!turns.length) throw new Error("Conversation has no turns.");
      const takes = [];
      for (const turn of turns) {
        const voice = await store.getVoice(turn.voiceId);
        if (!voice) throw new Error(`Voice was not found for ${turn.speaker || "speaker"}.`);
        const result = await generateTake({
          engine: body.engine || "chatterbox",
          voice,
          text: turn.text,
          model: body.model,
          exaggeration: body.exaggeration,
          cfgWeight: body.cfgWeight
        });
        const generated = result.generated;
        await store.markVoiceUsed(voice.id);
        takes.push(await store.saveTake({
          voiceId: voice.id,
          sourceText: `${turn.speaker || voice.name}: ${turn.text}`,
          engine: "chatterbox",
          model: body.model || result.metadata.model || "Standard",
          settings: { speaker: turn.speaker || voice.name, exaggeration: Number(body.exaggeration || 0.5), cfgWeight: Number(body.cfgWeight || 0.5) },
          outputPath: result.remotePath
        }));
      }
      sendJson(res, 201, { takes });
      return;
    }
    if (url.pathname === "/api/script/format" && req.method === "POST") {
      const body = await readBody(req);
      const mode = body.mode || "syntax";
      const text = String(body.text || "");
      if (mode === "document") sendJson(res, 200, formatDocumentForSpeech(text));
      else if (mode === "paragraph-check") sendJson(res, 200, { text, notes: checkParagraphs(text) });
      else if (mode === "dialogue") sendJson(res, 200, { turns: parseDialogue(text, body.characterNames || []) });
      else sendJson(res, 200, tuneSyntaxForTts(text));
      return;
    }
    if (url.pathname === "/api/script/parser-health" && req.method === "GET") {
      const config = getOllamaParserConfig(process.env, { model: url.searchParams.get("model") || undefined });
      sendJson(res, 200, await getParserHealth({ config }));
      return;
    }
    if ((url.pathname === "/api/script/parse" || url.pathname === "/api/script/parse-preview") && req.method === "POST") {
      const body = await readBody(req);
      const config = getOllamaParserConfig(process.env, { model: body.model || body.parserModel || undefined });
      const parsed = await parseScriptWithOllama({ rawText: body.rawText || body.text, config });
      sendJson(res, parsed.ok ? 200 : 422, parsed);
      return;
    }
    if (url.pathname === "/api/logs" && req.method === "GET") {
      const local = await run("tail", ["-80", path.join(homedir(), "Library", "Logs", "BigMacVoiceTools", "launcher.log")]);
      const remote = await run("ssh", ["westcat", "tail -80 /Users/bigmac/Library/Logs/BigMacVoiceTools/server.log 2>/dev/null || true"]);
      sendJson(res, 200, { local: local.stdout || local.stderr, remote: remote.stdout || remote.stderr });
      return;
    }
    if (url.pathname === "/api/audio" && req.method === "GET") {
      const outputPath = url.searchParams.get("path") || "";
      if (!isAllowedAudioPath(outputPath, remoteConfig)) {
        sendJson(res, 403, { error: "Audio path is outside the Chatterbox output directory." });
        return;
      }
      res.writeHead(200, { "content-type": "audio/wav", "accept-ranges": "none" });
      const child = spawn("ssh", ["westcat", "cat", outputPath], { stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.pipe(res);
      child.stderr.on("data", () => {});
      child.on("close", () => res.end());
      return;
    }
    if (url.pathname === "/api/voice-audio" && req.method === "GET") {
      const voice = await store.getVoice(url.searchParams.get("id"));
      if (!voice) {
        sendJson(res, 404, { error: "Voice was not found." });
        return;
      }
      createReadStream(voice.filePath)
        .on("error", (err) => {
          if (!res.headersSent) {
            res.writeHead(404);
            res.end("Not found");
          } else {
            res.end();
          }
        })
        .on("open", () => {
          res.writeHead(200, { "content-type": "audio/wav", "accept-ranges": "none" });
        })
        .pipe(res);
      return;
    }
    if (url.pathname === "/api/reveal-output-folder" && req.method === "POST") {
      await run("ssh", ["westcat", "open", remoteConfig.remoteOutputRoot], { timeout: 10000 });
      sendJson(res, 200, { ok: true, location: remoteConfig.remoteOutputRoot });
      return;
    }
    if (url.pathname === "/api/open-output-folder" && req.method === "POST") {
      await run("open", ["http://127.0.0.1:7860"]);
      sendJson(res, 200, { ok: true });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendError(res, error, /required|not found|Text|audio/i.test(error.message) ? 400 : 500);
  }
}

await mkdir(dataRoot, { recursive: true });
const server = http.createServer(route);
server.listen(port, host, () => {
  console.log(`BigMac VoiceTools Studio listening on http://${host}:${port}`);
});
