import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const emptyState = {
  schemaVersion: 2,
  voices: [],
  takes: [],
  sessions: [],
  presets: [],
  projects: [],
  characters: [],
  scenes: [],
  selectedTakes: [],
  previews: []
};

function cleanFileName(name) {
  const parsed = path.parse(name || "reference.wav");
  const base = parsed.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "reference";
  const ext = (parsed.ext || ".wav").replace(/[^a-z0-9.]/gi, "").slice(0, 12) || ".wav";
  return `${base}${ext}`;
}

function cleanId(value, fallbackPrefix) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || `${fallbackPrefix}_${randomUUID()}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseNumeric(val) {
  if (val === undefined || val === null || String(val).trim() === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

export function createStore(rootDir) {
  const dataDir = rootDir;
  const voicesDir = path.join(dataDir, "voices");
  const stateFile = path.join(dataDir, "state.json");

  async function ensure() {
    await mkdir(voicesDir, { recursive: true });
  }

  async function load() {
    await ensure();
    const state = await readJson(stateFile, emptyState);
    const merged = { ...structuredClone(emptyState), ...state };
    merged.voices = ensureArray(merged.voices);
    merged.takes = ensureArray(merged.takes);
    merged.sessions = ensureArray(merged.sessions);
    merged.presets = ensureArray(merged.presets);
    merged.projects = ensureArray(merged.projects);
    merged.characters = ensureArray(merged.characters);
    merged.scenes = ensureArray(merged.scenes);
    merged.selectedTakes = ensureArray(merged.selectedTakes);
    merged.previews = ensureArray(merged.previews);
    merged.schemaVersion = Math.max(Number(merged.schemaVersion || 1), emptyState.schemaVersion);
    return merged;
  }

  async function save(state) {
    await ensure();
    await writeJson(stateFile, state);
  }

  return {
    paths: { dataDir, voicesDir, stateFile },

    async listVoices() {
      const state = await load();
      return state.voices.sort((a, b) => (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt));
    },

    async getVoice(id) {
      const state = await load();
      return state.voices.find((voice) => voice.id === id) || null;
    },

    async saveVoice(input) {
      if (!input?.dataBase64) {
        throw new Error("Reference audio is required.");
      }
      const name = String(input.name || "").trim();
      if (!name) {
        throw new Error("Voice name is required.");
      }

      await ensure();
      const state = await load();
      const id = randomUUID();
      const fileName = `${id}-${cleanFileName(input.fileName)}`;
      const filePath = path.join(voicesDir, fileName);
      const now = new Date().toISOString();
      const tags = Array.isArray(input.tags)
        ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(input.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);

      await writeFile(filePath, Buffer.from(String(input.dataBase64), "base64"));

      const voice = {
        id,
        name,
        tags,
        notes: String(input.notes || "").trim(),
        fileName,
        filePath,
        qualityWarnings: input.qualityWarnings || [],
        createdAt: now,
        lastUsedAt: now
      };
      state.voices.push(voice);
      await save(state);
      return voice;
    },

    async markVoiceUsed(id) {
      const state = await load();
      const voice = state.voices.find((item) => item.id === id);
      if (voice) {
        voice.lastUsedAt = new Date().toISOString();
        await save(state);
      }
    },

    async listTakes() {
      const state = await load();
      return state.takes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async saveTake(input) {
      if (!input?.voiceId) throw new Error("voiceId is required.");
      if (!input?.sourceText) throw new Error("sourceText is required.");
      if (!input?.outputPath) throw new Error("outputPath is required.");
      const state = await load();
      const now = new Date().toISOString();
      const take = {
        id: randomUUID(),
        projectId: input.projectId || "",
        sceneId: input.sceneId || "",
        lineId: input.lineId || "",
        speaker: input.speaker || "",
        characterId: input.characterId || "",
        engine: input.engine || "chatterbox",
        takeNumber: Number(input.takeNumber || 1),
        text: String(input.text || input.sourceText),
        emotion: input.emotion || "",
        pace: input.pace || "",
        deliveryCue: input.deliveryCue || "",
        voiceId: input.voiceId,
        sourceText: String(input.sourceText),
        model: input.model || "Standard",
        settings: input.settings || {},
        speechSettings: input.speechSettings || null,
        outputPath: input.outputPath,
        notes: input.notes || "",
        rating: Number(input.rating || 0),
        selected: Boolean(input.selected),
        favorite: Boolean(input.favorite),
        createdAt: now
      };
      state.takes.push(take);
      await save(state);
      return take;
    },

    async deleteTake(id) {
      const state = await load();
      const index = state.takes.findIndex((take) => take.id === id);
      if (index === -1) {
        throw new Error("Take was not found.");
      }
      const [deleted] = state.takes.splice(index, 1);
      await save(state);
      return deleted;
    },

    async listProjects() {
      const state = await load();
      return state.projects.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    },

    async getProject(id) {
      const state = await load();
      return state.projects.find((project) => project.id === id) || null;
    },

    async saveProject(input) {
      const name = String(input?.name || "").trim();
      if (!name) throw new Error("Project name is required.");
      const state = await load();
      const now = new Date().toISOString();
      const id = cleanId(input.id || name, "project");
      const existing = state.projects.find((project) => project.id === id);
      const project = {
        id,
        name,
        defaultEngine: input.defaultEngine || existing?.defaultEngine || "chatterbox",
        notes: String(input.notes || existing?.notes || ""),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      if (existing) Object.assign(existing, project);
      else state.projects.push(project);
      await save(state);
      return project;
    },

    async deleteProject(id) {
      const state = await load();
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error("Project was not found.");
      state.projects = state.projects.filter((item) => item.id !== id);
      state.characters = state.characters.filter((item) => item.projectId !== id);
      state.scenes = state.scenes.filter((item) => item.projectId !== id);
      state.selectedTakes = state.selectedTakes.filter((item) => item.projectId !== id);
      await save(state);
      return project;
    },

    async listCharacters(projectId) {
      const state = await load();
      return state.characters
        .filter((character) => !projectId || character.projectId === projectId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async saveCharacter(input) {
      if (!input?.projectId) throw new Error("projectId is required.");
      const name = String(input.name || "").trim();
      if (!name) throw new Error("Character name is required.");
      const state = await load();
      const now = new Date().toISOString();
      const id = cleanId(input.id || `${input.projectId}_${name}`, "character");
      const existing = state.characters.find((character) => character.id === id);
      const character = {
        id,
        projectId: input.projectId,
        name,
        voiceId: input.voiceId || "",
        preferredEngine: input.preferredEngine || "chatterbox",
        delivery: String(input.delivery || ""),
        forbidden: ensureArray(input.forbidden).map(String),
        notes: String(input.notes || ""),
        speechSettings: input.speechSettings ? {
          delivery: input.speechSettings.delivery !== undefined && input.speechSettings.delivery !== null ? String(input.speechSettings.delivery).trim() : "",
          speed: parseNumeric(input.speechSettings.speed),
          temperature: parseNumeric(input.speechSettings.temperature),
          exaggeration: parseNumeric(input.speechSettings.exaggeration),
          cfgWeight: parseNumeric(input.speechSettings.cfgWeight),
          seed: parseNumeric(input.speechSettings.seed)
        } : (existing?.speechSettings || {
          delivery: "",
          speed: null,
          temperature: null,
          exaggeration: null,
          cfgWeight: null,
          seed: null
        }),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      if (existing) Object.assign(existing, character);
      else state.characters.push(character);
      await save(state);
      return character;
    },

    async deleteCharacter(id) {
      const state = await load();
      const character = state.characters.find((item) => item.id === id);
      if (!character) throw new Error("Character was not found.");
      state.characters = state.characters.filter((item) => item.id !== id);
      await save(state);
      return character;
    },

    async listScenes(projectId) {
      const state = await load();
      return state.scenes
        .filter((scene) => !projectId || scene.projectId === projectId)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    },

    async getScene(id) {
      const state = await load();
      return state.scenes.find((scene) => scene.id === id) || null;
    },

    async saveScene(input) {
      if (!input?.projectId) throw new Error("projectId is required.");
      const title = String(input.title || "").trim() || "Untitled Scene";
      const state = await load();
      const now = new Date().toISOString();
      const id = cleanId(input.id || `${input.projectId}_${title}`, "scene");
      const existing = state.scenes.find((scene) => scene.id === id);
      const scene = {
        id,
        projectId: input.projectId,
        title,
        rawText: String(input.rawText || ""),
        parsedResult: input.parsedResult || null,
        lines: ensureArray(input.lines).map((line, index) => {
          const existingLine = existing?.lines?.find((el) => el.id === line.id);
          const speechSettings = line.speechSettings ? {
            delivery: line.speechSettings.delivery !== undefined && line.speechSettings.delivery !== null ? String(line.speechSettings.delivery) : "",
            speed: parseNumeric(line.speechSettings.speed),
            temperature: parseNumeric(line.speechSettings.temperature),
            exaggeration: parseNumeric(line.speechSettings.exaggeration),
            cfgWeight: parseNumeric(line.speechSettings.cfgWeight),
            seed: parseNumeric(line.speechSettings.seed)
          } : (existingLine?.speechSettings || null);
          const timing = line.timing ? {
            pauseAfterMs: parseNumeric(line.timing.pauseAfterMs)
          } : (existingLine?.timing || null);
          return {
            id: String(line.id || `L${String(index + 1).padStart(3, "0")}`),
            type: ["dialogue", "narration", "action"].includes(line.type) ? line.type : "dialogue",
            speaker: String(line.speaker || "UNKNOWN").trim() || "UNKNOWN",
            text: String(line.text || ""),
            emotion: String(line.emotion || ""),
            pace: String(line.pace || ""),
            deliveryCue: String(line.deliveryCue || ""),
            takes: Math.max(1, Number(line.takes || 1)),
            characterId: String(line.characterId || ""),
            voiceId: String(line.voiceId || ""),
            speechSettings,
            timing
          };
        }),
        warnings: ensureArray(input.warnings).map(String),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      if (existing) Object.assign(existing, scene);
      else state.scenes.push(scene);
      await save(state);
      return scene;
    },

    async deleteScene(id) {
      const state = await load();
      const scene = state.scenes.find((item) => item.id === id);
      if (!scene) throw new Error("Scene was not found.");
      state.scenes = state.scenes.filter((item) => item.id !== id);
      state.selectedTakes = state.selectedTakes.filter((item) => item.sceneId !== id);
      await save(state);
      return scene;
    },

    async selectTake({ projectId, sceneId, lineId, takeId }) {
      if (!projectId || !sceneId || !lineId || !takeId) {
        throw new Error("projectId, sceneId, lineId, and takeId are required.");
      }
      const state = await load();
      const take = state.takes.find((item) => item.id === takeId);
      if (!take) throw new Error("Take was not found.");
      for (const item of state.takes) {
        if (item.projectId === projectId && item.sceneId === sceneId && item.lineId === lineId) {
          item.selected = item.id === takeId;
        }
      }
      const now = new Date().toISOString();
      const existing = state.selectedTakes.find((item) => item.projectId === projectId && item.sceneId === sceneId);
      const manifest = existing || { projectId, sceneId, selectedTakes: {}, createdAt: now, updatedAt: now };
      manifest.selectedTakes[lineId] = takeId;
      manifest.updatedAt = now;
      if (!existing) state.selectedTakes.push(manifest);
      await save(state);
      return manifest;
    },

    async listSelectedTakes({ projectId, sceneId }) {
      const state = await load();
      const manifest = state.selectedTakes.find((item) => item.projectId === projectId && item.sceneId === sceneId);
      return manifest || { projectId, sceneId, selectedTakes: {} };
    },

    async savePreview(input) {
      if (!input?.projectId || !input?.sceneId || !input?.remotePath) {
        throw new Error("projectId, sceneId, and remotePath are required.");
      }
      const state = await load();
      const now = new Date().toISOString();
      const preview = {
        id: input.id || randomUUID(),
        projectId: input.projectId,
        sceneId: input.sceneId,
        remotePath: input.remotePath,
        createdAt: now,
        lineTakeIds: ensureArray(input.lineTakeIds).map(String),
        includedLineIds: ensureArray(input.includedLineIds).map(String),
        skippedLineIds: ensureArray(input.skippedLineIds).map(String),
        gapsMs: Number(input.gapsMs !== undefined ? input.gapsMs : 350),
        fadeInMs: Number(input.fadeInMs || 0),
        fadeOutMs: Number(input.fadeOutMs || 0),
        lineTiming: input.lineTiming || {},
        format: input.format || "wav",
        durationEstimateMs: Number(input.durationEstimateMs || 0)
      };
      state.previews = ensureArray(state.previews);
      state.previews.push(preview);
      await save(state);
      return preview;
    },

    async listPreviews({ projectId, sceneId }) {
      const state = await load();
      state.previews = ensureArray(state.previews);
      return state.previews.filter(
        (preview) =>
          (!projectId || preview.projectId === projectId) &&
          (!sceneId || preview.sceneId === sceneId)
      );
    }
  };
}
