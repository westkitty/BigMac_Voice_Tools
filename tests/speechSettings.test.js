import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveSpeechSettings } from "../server.js";

test("resolveEffectiveSpeechSettings: global defaults apply when nothing else is set", () => {
  const result = resolveEffectiveSpeechSettings({
    character: null,
    line: null,
    body: null
  });

  assert.deepEqual(result.effective, {
    delivery: "",
    speed: 1.0,
    temperature: null,
    exaggeration: 0.5,
    cfgWeight: 0.5,
    seed: null
  });

  assert.deepEqual(result.activeGeneratorParams, {
    exaggeration: 0.5,
    cfgWeight: 0.5
  });

  assert.deepEqual(result.metadataOnly, {
    delivery: "",
    speed: 1.0,
    temperature: null,
    seed: null
  });
});

test("resolveEffectiveSpeechSettings: character defaults apply", () => {
  const result = resolveEffectiveSpeechSettings({
    character: {
      speechSettings: {
        delivery: "quietly",
        speed: 0.9,
        temperature: 0.7,
        exaggeration: 0.6,
        cfgWeight: 0.4,
        seed: 123
      }
    },
    line: null,
    body: null
  });

  assert.deepEqual(result.effective, {
    delivery: "quietly",
    speed: 0.9,
    temperature: 0.7,
    exaggeration: 0.6,
    cfgWeight: 0.4,
    seed: 123
  });
});

test("resolveEffectiveSpeechSettings: line overrides beat character defaults", () => {
  const result = resolveEffectiveSpeechSettings({
    character: {
      speechSettings: {
        delivery: "quietly",
        speed: 0.9,
        temperature: 0.7,
        exaggeration: 0.6,
        cfgWeight: 0.4,
        seed: 123
      }
    },
    line: {
      speechSettings: {
        delivery: "whispered",
        speed: null,
        temperature: 0.8,
        exaggeration: 0.3,
        cfgWeight: null,
        seed: null
      }
    },
    body: null
  });

  assert.deepEqual(result.effective, {
    delivery: "whispered",
    speed: 0.9,
    temperature: 0.8,
    exaggeration: 0.3,
    cfgWeight: 0.4,
    seed: 123
  });
});

test("resolveEffectiveSpeechSettings: request override beats line and character", () => {
  const result = resolveEffectiveSpeechSettings({
    character: {
      speechSettings: {
        delivery: "quietly",
        speed: 0.9,
        exaggeration: 0.6
      }
    },
    line: {
      speechSettings: {
        delivery: "whispered",
        speed: 1.1,
        exaggeration: 0.3
      }
    },
    body: {
      speechSettings: {
        delivery: "shouting",
        speed: 1.2,
        exaggeration: 0.85
      }
    }
  });

  assert.equal(result.effective.delivery, "shouting");
  assert.equal(result.effective.speed, 1.2);
  assert.equal(result.effective.exaggeration, 0.85);
});

test("resolveEffectiveSpeechSettings: legacy request parameters override", () => {
  const result = resolveEffectiveSpeechSettings({
    character: null,
    line: null,
    body: {
      exaggeration: 0.75,
      cfgWeight: 0.65
    }
  });

  assert.equal(result.effective.exaggeration, 0.75);
  assert.equal(result.effective.cfgWeight, 0.65);
});

test("resolveEffectiveSpeechSettings: active parameters vs metadata for Turbo vs Standard", () => {
  const resultTurbo = resolveEffectiveSpeechSettings({
    character: null,
    line: null,
    body: {
      model: "Turbo",
      speechSettings: {
        exaggeration: 0.8,
        cfgWeight: 0.7,
        delivery: "fast"
      }
    }
  });

  assert.deepEqual(resultTurbo.activeGeneratorParams, {});
  assert.equal(resultTurbo.metadataOnly.exaggeration, 0.8);
  assert.equal(resultTurbo.metadataOnly.cfgWeight, 0.7);
  assert.equal(resultTurbo.metadataOnly.delivery, "fast");

  const resultStandard = resolveEffectiveSpeechSettings({
    character: null,
    line: null,
    body: {
      model: "Standard",
      speechSettings: {
        exaggeration: 0.8,
        cfgWeight: 0.7,
        delivery: "slow"
      }
    }
  });

  assert.deepEqual(resultStandard.activeGeneratorParams, {
    exaggeration: 0.8,
    cfgWeight: 0.7
  });
  assert.equal(resultStandard.metadataOnly.exaggeration, undefined);
  assert.equal(resultStandard.metadataOnly.cfgWeight, undefined);
  assert.equal(resultStandard.metadataOnly.delivery, "slow");
});
