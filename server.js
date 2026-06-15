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
import { assembleScenePreview } from "./src/preview.js";

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

export function resolveEffectiveSpeechSettings({ character, line, body }) {
  // 1. Global defaults
  const effective = {
    delivery: "",
    speed: 1.0,
    temperature: null,
    exaggeration: 0.5,
    cfgWeight: 0.5,
    seed: null
  };

  // 2. Character defaults
  if (character?.speechSettings) {
    const cs = character.speechSettings;
    if (cs.delivery !== undefined && cs.delivery !== null && cs.delivery !== "") effective.delivery = cs.delivery;
    if (cs.speed !== undefined && cs.speed !== null) effective.speed = cs.speed;
    if (cs.temperature !== undefined && cs.temperature !== null) effective.temperature = cs.temperature;
    if (cs.exaggeration !== undefined && cs.exaggeration !== null) effective.exaggeration = cs.exaggeration;
    if (cs.cfgWeight !== undefined && cs.cfgWeight !== null) effective.cfgWeight = cs.cfgWeight;
    if (cs.seed !== undefined && cs.seed !== null) effective.seed = cs.seed;
  }

  // 3. Line overrides
  if (line?.speechSettings) {
    const ls = line.speechSettings;
    if (ls.delivery !== undefined && ls.delivery !== null && ls.delivery !== "") effective.delivery = ls.delivery;
    if (ls.speed !== undefined && ls.speed !== null) effective.speed = ls.speed;
    if (ls.temperature !== undefined && ls.temperature !== null) effective.temperature = ls.temperature;
    if (ls.exaggeration !== undefined && ls.exaggeration !== null) effective.exaggeration = ls.exaggeration;
    if (ls.cfgWeight !== undefined && ls.cfgWeight !== null) effective.cfgWeight = ls.cfgWeight;
    if (ls.seed !== undefined && ls.seed !== null) effective.seed = ls.seed;
  }

  // 4. Request overrides (explicit speechSettings)
  if (body?.speechSettings) {
    const bs = body.speechSettings;
    if (bs.delivery !== undefined && bs.delivery !== null && bs.delivery !== "") effective.delivery = bs.delivery;
    if (bs.speed !== undefined && bs.speed !== null) effective.speed = bs.speed;
    if (bs.temperature !== undefined && bs.temperature !== null) effective.temperature = bs.temperature;
    if (bs.exaggeration !== undefined && bs.exaggeration !== null) effective.exaggeration = bs.exaggeration;
    if (bs.cfgWeight !== undefined && bs.cfgWeight !== null) effective.cfgWeight = bs.cfgWeight;
    if (bs.seed !== undefined && bs.seed !== null) effective.seed = bs.seed;
  }

  // Legacy/Voice Lab overrides directly in request body
  if (body?.exaggeration !== undefined && body.exaggeration !== null && body.exaggeration !== "") {
    effective.exaggeration = Number(body.exaggeration);
  }
  if (body?.cfgWeight !== undefined && body.cfgWeight !== null && body.cfgWeight !== "") {
    effective.cfgWeight = Number(body.cfgWeight);
  }

  // Clamp active generator parameters
  if (effective.exaggeration < 0.25) effective.exaggeration = 0.25;
  if (effective.exaggeration > 1.2) effective.exaggeration = 1.2;
  if (effective.cfgWeight < 0) effective.cfgWeight = 0;
  if (effective.cfgWeight > 1) effective.cfgWeight = 1;

  // Determine active generator parameters based on model kind
  const modelKind = body?.model || character?.preferredEngine === "chatterbox" && line?.model || line?.model || "Standard";
  const isTurbo = modelKind === "Turbo";

  const activeGeneratorParams = {};
  if (!isTurbo) {
    activeGeneratorParams.exaggeration = effective.exaggeration;
    activeGeneratorParams.cfgWeight = effective.cfgWeight;
  }

  const metadataOnly = {
    delivery: effective.delivery,
    speed: effective.speed,
    temperature: effective.temperature,
    seed: effective.seed
  };

  if (isTurbo) {
    metadataOnly.exaggeration = effective.exaggeration;
    metadataOnly.cfgWeight = effective.cfgWeight;
  }

  return {
    effective,
    activeGeneratorParams,
    metadataOnly,
    supportNote: isTurbo 
      ? "Turbo Chatterbox does not support exaggeration or cfgWeight; they are saved as metadata."
      : "Only Standard Chatterbox uses exaggeration and cfgWeight; unsupported settings are saved as metadata."
  };
}

async function validateRenderLineRequest(body, store) {
  if (!body.sceneId) {
    return { ok: false, error: "sceneId is required.", code: "MISSING_SCENE", status: 400 };
  }
  const scene = await store.getScene(body.sceneId);
  if (!scene) {
    return { ok: false, error: "Scene was not found.", code: "MISSING_SCENE", status: 404 };
  }

  const project = await store.getProject(scene.projectId);
  if (!project) {
    return { ok: false, error: "Project was not found.", code: "MISSING_PROJECT", status: 404 };
  }

  if (!body.lineId) {
    return { ok: false, error: "lineId is required.", code: "MISSING_LINE", status: 400 };
  }
  const line = scene.lines.find((item) => item.id === body.lineId);
  if (!line) {
    return { ok: false, error: "Scene line was not found.", code: "MISSING_LINE", status: 404 };
  }

  if (!line.speaker) {
    return { ok: false, error: "Line speaker is required.", code: "MISSING_SPEAKER", status: 400 };
  }

  const textToRender = typeof body.text === "string" ? body.text : line.text;
  if (!textToRender || !textToRender.trim()) {
    return { ok: false, error: "Line text is empty.", code: "EMPTY_LINE_TEXT", status: 400 };
  }

  const takeCountParam = body.takes || line.takes || 1;
  const takeCount = Number(takeCountParam);
  if (isNaN(takeCount) || takeCount < 1 || takeCount > 10 || !Number.isInteger(takeCount)) {
    return { ok: false, error: "Take count must be between 1 and 10.", code: "INVALID_TAKE_COUNT", status: 400 };
  }

  const characters = await store.listCharacters(scene.projectId);
  const character = characters.find((item) => item.id === (body.characterId || line.characterId) || item.name.toLowerCase() === line.speaker.toLowerCase());
  
  if (!character) {
    if (line.speaker.toUpperCase() === "UNKNOWN") {
      return { ok: false, error: "Speaker UNKNOWN is not mapped to a character. Map it before rendering.", code: "UNKNOWN_SPEAKER", status: 400 };
    }
    return { ok: false, error: `Speaker ${line.speaker} is not mapped to a character.`, code: "MISSING_CHARACTER", status: 404 };
  }

  const voiceId = body.voiceId || character.voiceId || line.voiceId;
  if (!voiceId) {
    return { ok: false, error: `Character ${character.name} has no assigned reference voice.`, code: "MISSING_VOICE", status: 400 };
  }
  const voice = await store.getVoice(voiceId);
  if (!voice) {
    return { ok: false, error: `Assigned voice for speaker ${line.speaker} was not found.`, code: "VOICE_NOT_FOUND", status: 404 };
  }

  const engine = body.engine || character.preferredEngine || "chatterbox";
  const engineMeta = listEngines().find(e => e.id === engine);
  if (!engineMeta || !engineMeta.configured) {
    return { ok: false, error: `Engine "${engine}" is not configured yet.`, code: "ENGINE_NOT_CONFIGURED", status: 501 };
  }

  const speechSettings = resolveEffectiveSpeechSettings({ character, line, body });

  return {
    ok: true,
    scene,
    project,
    line,
    character,
    voice,
    engine,
    takeCount,
    textToRender,
    speechSettings
  };
}

async function renderValidatedLine(validation, body, store, remoteConfig) {
  const { scene, line, character, voice, engine, takeCount, textToRender, speechSettings } = validation;
  const takes = [];
  for (let index = 0; index < takeCount; index += 1) {
    const result = await generateTake({
      engine,
      voice,
      text: textToRender,
      model: body.model,
      speechSettings
    });
    
    // Output path allowlist check
    if (!isAllowedAudioPath(result.remotePath, remoteConfig)) {
      throw { status: 403, message: "Audio path is outside the Chatterbox output directory.", code: "OUTPUT_PATH_NOT_ALLOWED" };
    }

    await store.markVoiceUsed(voice.id);
    takes.push(await store.saveTake({
      projectId: scene.projectId,
      sceneId: scene.id,
      lineId: line.id,
      speaker: line.speaker,
      characterId: character.id || "",
      engine,
      takeNumber: index + 1,
      text: textToRender,
      sourceText: textToRender,
      emotion: line.emotion,
      pace: line.pace,
      deliveryCue: line.deliveryCue,
      voiceId: voice.id,
      model: body.model || result.metadata.model || "Standard",
      settings: { 
        exaggeration: Number(speechSettings.effective.exaggeration), 
        cfgWeight: Number(speechSettings.effective.cfgWeight) 
      },
      speechSettings,
      outputPath: result.remotePath
    }));
  }
  return takes;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (url.pathname === "/favicon.ico" && req.method === "GET") {
      res.writeHead(204, {
        "content-type": "image/x-icon",
        "cache-control": "public, max-age=86400"
      });
      res.end();
      return;
    }
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
    if (url.pathname.startsWith("/api/scenes/") && req.method === "GET" && !["/api/scenes/selected", "/api/scenes/previews"].includes(url.pathname) && !url.pathname.startsWith("/api/scenes/render")) {
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
      try {
        const body = await readBody(req);
        const validation = await validateRenderLineRequest(body, store);
        if (!validation.ok) {
          res.writeHead(validation.status, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: validation.error, code: validation.code }) + "\n");
          return;
        }

        const takes = await renderValidatedLine(validation, body, store, remoteConfig);
        sendJson(res, 201, { takes });
      } catch (err) {
        if (err.status) {
          res.writeHead(err.status, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: err.message || err.error, code: err.code }) + "\n");
        } else {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: `Generation failed: ${err.message || err}`, code: "GENERATION_FAILED" }) + "\n");
        }
      }
      return;
    }
    if (url.pathname === "/api/scenes/render" && req.method === "POST") {
      try {
        const body = await readBody(req);
        if (!body.projectId) {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "projectId is required.", code: "MISSING_PROJECT" }) + "\n");
          return;
        }
        if (!body.sceneId) {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "sceneId is required.", code: "MISSING_SCENE" }) + "\n");
          return;
        }

        const project = await store.getProject(body.projectId);
        if (!project) {
          res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "Project was not found.", code: "MISSING_PROJECT" }) + "\n");
          return;
        }

        const scene = await store.getScene(body.sceneId);
        if (!scene || scene.projectId !== body.projectId) {
          res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "Scene was not found in project.", code: "MISSING_SCENE" }) + "\n");
          return;
        }

        const lineIds = Array.isArray(body.lineIds) ? body.lineIds : scene.lines.map((l) => l.id);
        const candidateLines = scene.lines.filter((l) => lineIds.includes(l.id));

        const results = [];
        let renderedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const line of candidateLines) {
          const renderLineBody = {
            projectId: body.projectId,
            sceneId: body.sceneId,
            lineId: line.id,
            takes: body.takes || line.takes
          };

          const validation = await validateRenderLineRequest(renderLineBody, store);
          if (!validation.ok) {
            results.push({
              lineId: line.id,
              ok: false,
              skipped: true,
              code: validation.code,
              error: validation.error
            });
            skippedCount += 1;
            continue;
          }

          try {
            const takes = await renderValidatedLine(validation, renderLineBody, store, remoteConfig);
            results.push({
              lineId: line.id,
              ok: true,
              takes
            });
            renderedCount += 1;
          } catch (err) {
            results.push({
              lineId: line.id,
              ok: false,
              code: err.code || "GENERATION_FAILED",
              error: err.message || String(err)
            });
            failedCount += 1;
          }
        }

        sendJson(res, 200, {
          ok: true,
          projectId: body.projectId,
          sceneId: body.sceneId,
          summary: {
            requested: candidateLines.length,
            rendered: renderedCount,
            skipped: skippedCount,
            failed: failedCount
          },
          results
        });
      } catch (err) {
        sendError(res, err, 500);
      }
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
    if (url.pathname === "/api/scenes/previews" && req.method === "GET") {
      const projectId = url.searchParams.get("projectId") || "";
      const sceneId = url.searchParams.get("sceneId") || "";
      if (!projectId || !sceneId) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "projectId and sceneId are required." }) + "\n");
        return;
      }
      sendJson(res, 200, { previews: await store.listPreviews({ projectId, sceneId }) });
      return;
    }
    if (url.pathname === "/api/scenes/preview" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const result = await assembleScenePreview({
          projectId: body.projectId,
          sceneId: body.sceneId,
          mode: body.mode,
          gapsMs: body.gapsMs,
          fadeInMs: body.fadeInMs,
          fadeOutMs: body.fadeOutMs,
          lineTiming: body.lineTiming,
          store
        });
        if (!result.ok) {
          res.writeHead(result.status || 500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: result.error, code: result.code, skipped: result.skipped }) + "\n");
          return;
        }
        sendJson(res, 200, result);
      } catch (err) {
        sendError(res, err, 500);
      }
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

const isMain = process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1].endsWith("/server.js") || process.argv[1].endsWith("\\server.js"));

if (isMain) {
  await mkdir(dataRoot, { recursive: true });
  const server = http.createServer(route);
  server.listen(port, host, () => {
    console.log(`BigMac VoiceTools Studio listening on http://${host}:${port}`);
  });
}
