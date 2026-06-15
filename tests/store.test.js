import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStore } from "../src/store.js";

test("voice records require audio and a name before saving", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    await assert.rejects(
      store.saveVoice({
        name: "Missing Audio",
        fileName: "sample.wav",
      }),
      /audio/i
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving a voice persists metadata and audio file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const voice = await store.saveVoice({
      name: "Narrator",
      tags: ["test", "calm"],
      notes: "Recorded for local test use.",
      fileName: "sample.wav",
      dataBase64: Buffer.from("fake-audio").toString("base64")
    });

    const voices = await store.listVoices();

    assert.equal(voices.length, 1);
    assert.equal(voices[0].id, voice.id);
    assert.equal(voices[0].name, "Narrator");
    assert.equal(voices[0].notes, "Recorded for local test use.");
    assert.match(voices[0].filePath, /sample\.wav$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("take records preserve generation settings and output path", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const take = await store.saveTake({
      voiceId: "voice-1",
      sourceText: "This is a local Big Mac voice tools test.",
      model: "Standard",
      settings: { exaggeration: 0.5, cfgWeight: 0.5 },
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/test.wav"
    });

    const takes = await store.listTakes();

    assert.equal(takes.length, 1);
    assert.equal(takes[0].id, take.id);
    assert.equal(takes[0].settings.cfgWeight, 0.5);
    assert.match(takes[0].outputPath, /test\.wav$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("take records can be deleted by id", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const take = await store.saveTake({
      voiceId: "voice-1",
      sourceText: "Delete this one.",
      model: "Standard",
      settings: { exaggeration: 0.5, cfgWeight: 0.5 },
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/delete-me.wav"
    });

    const deleted = await store.deleteTake(take.id);
    const takes = await store.listTakes();

    assert.equal(deleted.outputPath, "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/delete-me.wav");
    assert.equal(takes.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("multiple take records can be deleted in batch and references cleaned", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const take1 = await store.saveTake({
      id: "take-1",
      voiceId: "voice-1",
      sourceText: "Delete batch 1",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take1.wav",
      projectId: "proj-1",
      sceneId: "scene-1",
      lineId: "line-1"
    });
    const take2 = await store.saveTake({
      id: "take-2",
      voiceId: "voice-1",
      sourceText: "Delete batch 2",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take2.wav",
      projectId: "proj-1",
      sceneId: "scene-1",
      lineId: "line-2"
    });
    const take3 = await store.saveTake({
      id: "take-3",
      voiceId: "voice-1",
      sourceText: "Keep this one",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/take3.wav",
      projectId: "proj-1",
      sceneId: "scene-1",
      lineId: "line-3"
    });

    // select takes
    await store.selectTake({ projectId: "proj-1", sceneId: "scene-1", lineId: "line-1", takeId: take1.id });
    await store.selectTake({ projectId: "proj-1", sceneId: "scene-1", lineId: "line-2", takeId: take2.id });
    await store.selectTake({ projectId: "proj-1", sceneId: "scene-1", lineId: "line-3", takeId: take3.id });

    // Verify they are selected
    let selected = await store.listSelectedTakes({ projectId: "proj-1", sceneId: "scene-1" });
    assert.equal(selected.selectedTakes["line-1"], take1.id);
    assert.equal(selected.selectedTakes["line-2"], take2.id);
    assert.equal(selected.selectedTakes["line-3"], take3.id);

    // Delete batch
    const result = await store.deleteTakes([take1.id, take2.id, "take-nonexistent"]);
    assert.equal(result.deleted.length, 2);
    assert.equal(result.notFound.length, 1);
    assert.equal(result.notFound[0], "take-nonexistent");

    const takes = await store.listTakes();
    assert.equal(takes.length, 1);
    assert.equal(takes[0].id, take3.id);

    // Verify selected takes references are cleaned
    selected = await store.listSelectedTakes({ projectId: "proj-1", sceneId: "scene-1" });
    assert.equal(selected.selectedTakes["line-1"], undefined);
    assert.equal(selected.selectedTakes["line-2"], undefined);
    assert.equal(selected.selectedTakes["line-3"], take3.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});



test("projects, characters, and scenes persist without losing old voices and takes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const voice = await store.saveVoice({
      name: "Tiger Reference",
      fileName: "tiger.wav",
      dataBase64: Buffer.from("fake-audio").toString("base64")
    });
    const oldTake = await store.saveTake({
      voiceId: voice.id,
      sourceText: "Existing take.",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/existing.wav"
    });

    const project = await store.saveProject({ id: "orbital_tomb", name: "Orbital Tomb", defaultEngine: "chatterbox" });
    const character = await store.saveCharacter({
      id: "tiger",
      projectId: project.id,
      name: "Tiger",
      voiceId: voice.id,
      preferredEngine: "chatterbox",
      delivery: "low, surgical, calm",
      forbidden: ["shouting"],
      notes: "Anger gets quieter."
    });
    const scene = await store.saveScene({
      id: "corridor_pressure_loss",
      projectId: project.id,
      title: "Corridor Pressure Loss",
      rawText: "TIGER: [quietly] You built a station and called it permanence.",
      parsedResult: { warnings: ["demo warning"] },
      lines: [{
        id: "L001",
        type: "dialogue",
        speaker: "TIGER",
        text: "You built a station and called it permanence.",
        emotion: "quiet contempt",
        pace: "deliberate",
        deliveryCue: "quietly",
        takes: 5,
        characterId: character.id,
        voiceId: voice.id
      }],
      warnings: ["demo warning"]
    });

    const reloaded = createStore(dir);
    const voices = await reloaded.listVoices();
    const takes = await reloaded.listTakes();
    const projects = await reloaded.listProjects();
    const characters = await reloaded.listCharacters(project.id);
    const scenes = await reloaded.listScenes(project.id);

    assert.equal(voices.length, 1);
    assert.equal(takes[0].id, oldTake.id);
    assert.equal(projects[0].name, "Orbital Tomb");
    assert.equal(characters[0].forbidden[0], "shouting");
    assert.equal(scenes[0].id, scene.id);
    assert.equal(scenes[0].rawText, "TIGER: [quietly] You built a station and called it permanence.");
    assert.deepEqual(scenes[0].parsedResult, { warnings: ["demo warning"] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("selected takes and take review metadata persist", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const take = await store.saveTake({
      voiceId: "voice-tiger",
      sourceText: "Line text.",
      outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/line.wav",
      projectId: "orbital_tomb",
      sceneId: "corridor_pressure_loss",
      lineId: "L001",
      speaker: "TIGER",
      characterId: "tiger",
      engine: "chatterbox",
      takeNumber: 3,
      text: "Line text.",
      emotion: "quiet contempt",
      pace: "deliberate",
      deliveryCue: "quietly",
      rating: 4,
      notes: "Best so far."
    });

    await store.selectTake({
      projectId: "orbital_tomb",
      sceneId: "corridor_pressure_loss",
      lineId: "L001",
      takeId: take.id
    });

    const reloaded = createStore(dir);
    const takes = await reloaded.listTakes();
    const selected = await reloaded.listSelectedTakes({ projectId: "orbital_tomb", sceneId: "corridor_pressure_loss" });

    assert.equal(takes[0].rating, 4);
    assert.equal(takes[0].selected, true);
    assert.equal(takes[0].projectId, "orbital_tomb");
    assert.equal(takes[0].lineId, "L001");
    assert.equal(selected.selectedTakes.L001, take.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("older state shape loads with migration-safe defaults", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    await writeFile(path.join(dir, "state.json"), `${JSON.stringify({
      schemaVersion: 1,
      voices: [{ id: "voice-1", name: "Old Voice", createdAt: "2026-01-01T00:00:00.000Z" }],
      takes: [{ id: "take-1", createdAt: "2026-01-01T00:00:00.000Z", outputPath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/old.wav" }]
    })}\n`);

    const store = createStore(dir);
    assert.deepEqual(await store.listProjects(), []);
    assert.deepEqual(await store.listCharacters("missing"), []);
    assert.deepEqual(await store.listScenes("missing"), []);
    assert.equal((await store.listVoices())[0].id, "voice-1");
    assert.equal((await store.listTakes())[0].id, "take-1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving character persists speech settings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const project = await store.saveProject({ id: "p1", name: "P1" });
    const character = await store.saveCharacter({
      projectId: "p1",
      name: "Test Character",
      voiceId: "v1",
      preferredEngine: "chatterbox",
      speechSettings: {
        delivery: "hushed tone",
        speed: 1.1,
        temperature: null,
        exaggeration: 0.6,
        cfgWeight: 0.7,
        seed: 42
      }
    });

    const reloaded = createStore(dir);
    const chars = await reloaded.listCharacters("p1");
    assert.equal(chars.length, 1);
    assert.deepEqual(chars[0].speechSettings, {
      delivery: "hushed tone",
      speed: 1.1,
      temperature: null,
      exaggeration: 0.6,
      cfgWeight: 0.7,
      seed: 42
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving scene line persists speech override", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const project = await store.saveProject({ id: "p1", name: "P1" });
    const scene = await store.saveScene({
      projectId: "p1",
      title: "S1",
      lines: [{
        id: "L001",
        speaker: "TIGER",
        text: "Yo",
        speechSettings: {
          delivery: "angry",
          speed: null,
          temperature: 0.85,
          exaggeration: null,
          cfgWeight: 0.4,
          seed: null
        }
      }]
    });

    const reloaded = createStore(dir);
    const scenes = await reloaded.listScenes("p1");
    assert.equal(scenes.length, 1);
    assert.deepEqual(scenes[0].lines[0].speechSettings, {
      delivery: "angry",
      speed: null,
      temperature: 0.85,
      exaggeration: null,
      cfgWeight: 0.4,
      seed: null
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving take stores speech settings metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const take = await store.saveTake({
      voiceId: "v1",
      sourceText: "Take text",
      outputPath: "/outputs/take.wav",
      speechSettings: {
        effective: {
          delivery: "whisper",
          speed: 0.9,
          temperature: null,
          exaggeration: 0.4,
          cfgWeight: 0.6,
          seed: null
        },
        activeGeneratorParams: {
          exaggeration: 0.4,
          cfgWeight: 0.6
        },
        metadataOnly: {
          delivery: "whisper",
          speed: 0.9,
          temperature: null,
          seed: null
        },
        supportNote: "Only Standard Chatterbox uses exaggeration and cfgWeight."
      }
    });

    const reloaded = createStore(dir);
    const takes = await reloaded.listTakes();
    assert.equal(takes.length, 1);
    assert.deepEqual(takes[0].speechSettings, {
      effective: {
        delivery: "whisper",
        speed: 0.9,
        temperature: null,
        exaggeration: 0.4,
        cfgWeight: 0.6,
        seed: null
      },
      activeGeneratorParams: {
        exaggeration: 0.4,
        cfgWeight: 0.6
      },
      metadataOnly: {
        delivery: "whisper",
        speed: 0.9,
        temperature: null,
        seed: null
      },
      supportNote: "Only Standard Chatterbox uses exaggeration and cfgWeight."
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving preview persists metadata and lists correctly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const preview = await store.savePreview({
      projectId: "p1",
      sceneId: "s1",
      remotePath: "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/previews/scene-preview-s1.wav",
      lineTakeIds: ["take1", "take2"],
      includedLineIds: ["L001", "L002"],
      skippedLineIds: ["L003"],
      gapsMs: 350,
      fadeInMs: 10,
      fadeOutMs: 35,
      lineTiming: { "L001": { "pauseAfterMs": 700 } },
      format: "wav",
      durationEstimateMs: 12345
    });

    const list = await store.listPreviews({ projectId: "p1", sceneId: "s1" });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, preview.id);
    assert.equal(list[0].gapsMs, 350);
    assert.equal(list[0].fadeInMs, 10);
    assert.equal(list[0].fadeOutMs, 35);
    assert.deepEqual(list[0].lineTiming, { "L001": { "pauseAfterMs": 700 } });
    assert.equal(list[0].durationEstimateMs, 12345);
    assert.deepEqual(list[0].lineTakeIds, ["take1", "take2"]);
    assert.deepEqual(list[0].includedLineIds, ["L001", "L002"]);
    assert.deepEqual(list[0].skippedLineIds, ["L003"]);

    const reloaded = createStore(dir);
    const reloadedList = await reloaded.listPreviews({ projectId: "p1" });
    assert.equal(reloadedList.length, 1);
    assert.equal(reloadedList[0].id, preview.id);
    assert.equal(reloadedList[0].fadeInMs, 10);
    assert.equal(reloadedList[0].fadeOutMs, 35);
    assert.deepEqual(reloadedList[0].lineTiming, { "L001": { "pauseAfterMs": 700 } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saving scene line persists timing override", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bvt-store-"));
  try {
    const store = createStore(dir);
    const project = await store.saveProject({ id: "p1", name: "P1" });
    const scene = await store.saveScene({
      projectId: "p1",
      title: "S1",
      lines: [{
        id: "L001",
        speaker: "TIGER",
        text: "Yo",
        timing: {
          pauseAfterMs: 700
        }
      }]
    });

    const reloaded = createStore(dir);
    const scenes = await reloaded.listScenes("p1");
    assert.equal(scenes.length, 1);
    assert.deepEqual(scenes[0].lines[0].timing, {
      pauseAfterMs: 700
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

