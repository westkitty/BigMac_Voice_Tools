import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseParserModel,
  getOllamaParserConfig,
  parseScriptWithOllama,
  stripJsonFences,
  validateParsedScriptResult
} from "../src/ollamaParser.js";

const fixtureText = `TIGER: [quietly] You built a station and called it permanence.
NARRATOR: The corridor lights failed one at a time.
UNKNOWN: Is anyone still there?`;

test("parser config defaults to the BigMac Ollama tunnel and auto model selection", () => {
  const config = getOllamaParserConfig({});

  assert.equal(config.baseUrl, "http://127.0.0.1:11435/v1");
  assert.equal(config.model, "auto");
  assert.equal(config.isBigMacTunnelDefault, true);
});

test("chooseParserModel uses an installed chat or instruct model instead of hardcoding Hermes", () => {
  assert.equal(
    chooseParserModel(["nomic-embed-text:latest", "qwen2.5:14b-instruct", "llava:latest"], "auto"),
    "qwen2.5:14b-instruct"
  );
  assert.equal(
    chooseParserModel(["llama3.1:8b", "qwen2.5:14b-instruct"], "llama3.1:8b"),
    "llama3.1:8b"
  );
});

test("stripJsonFences removes accidental markdown wrappers", () => {
  assert.equal(stripJsonFences("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
});

test("validateParsedScriptResult normalizes renderable audio drama lines", () => {
  const result = validateParsedScriptResult({
    title: "Corridor Pressure Loss",
    rawText: fixtureText,
    scenes: [{
      id: "scene_001",
      title: "Corridor Pressure Loss",
      lines: [
        { id: "L001", type: "dialogue", speaker: "TIGER", text: "You built a station and called it permanence.", emotion: "quiet contempt", pace: "deliberate", deliveryCue: "quietly", takes: 5 },
        { id: "L002", type: "narration", speaker: "", text: "The corridor lights failed one at a time.", emotion: "", pace: "", deliveryCue: "", takes: 3 }
      ],
      warnings: []
    }],
    warnings: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.scenes[0].lines[0].id, "L001");
  assert.equal(result.value.scenes[0].lines[1].speaker, "NARRATOR");
});

test("validateParsedScriptResult safely defaults empty titles and regenerates line ids", () => {
  const result = validateParsedScriptResult({
    title: "",
    rawText: fixtureText,
    scenes: [{
      id: "L001",
      title: "",
      lines: [
        { id: "L002", type: "dialogue", speaker: "TIGER", text: "You built a station and called it permanence.", emotion: "", pace: "", deliveryCue: "quietly", takes: 1 },
        { id: "L004", type: "dialogue", speaker: "UNKNOWN", text: "Is anyone still there?", emotion: "", pace: "", deliveryCue: "", takes: 1 }
      ],
      warnings: []
    }],
    warnings: ["No title provided"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.title, "Untitled Scene");
  assert.equal(result.value.scenes[0].title, "Untitled Scene");
  assert.equal(result.value.scenes[0].lines[0].id, "L001");
  assert.equal(result.value.scenes[0].lines[1].id, "L002");
});

test("validateParsedScriptResult rejects invalid output without a normalized value", () => {
  const result = validateParsedScriptResult({ title: "Bad", rawText: fixtureText, scenes: [{ id: "s1", title: "Bad", lines: [{ id: "L001", type: "aside", text: "" }] }] });

  assert.equal(result.ok, false);
  assert.match(result.error, /type/i);
  assert.equal(result.value, null);
});

test("parseScriptWithOllama accepts fenced JSON from a BigMac tunnel response", async () => {
  const responseBody = {
    choices: [{
      message: {
        content: "```json\n{\"title\":\"Fixture\",\"rawText\":\"x\",\"scenes\":[{\"id\":\"scene_001\",\"title\":\"Fixture\",\"lines\":[{\"id\":\"L001\",\"type\":\"dialogue\",\"speaker\":\"UNKNOWN\",\"text\":\"Is anyone still there?\",\"emotion\":\"\",\"pace\":\"\",\"deliveryCue\":\"\",\"takes\":3}],\"warnings\":[]}],\"warnings\":[]}\n```"
      }
    }]
  };
  const fakeFetch = async (url, options) => {
    if (url === "http://127.0.0.1:11435/v1/models") {
      return { ok: true, json: async () => ({ data: [{ id: "qwen2.5:14b-instruct" }] }) };
    }
    assert.equal(url, "http://127.0.0.1:11435/v1/chat/completions");
    assert.match(options.body, /BigMac-hosted Ollama/);
    assert.match(options.body, /qwen2.5:14b-instruct/);
    return { ok: true, json: async () => responseBody };
  };

  const parsed = await parseScriptWithOllama({ rawText: fixtureText, fetchImpl: fakeFetch });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.scenes[0].lines[0].id, "L001");
});

test("parseScriptWithOllama returns raw model output when JSON is invalid", async () => {
  const fakeFetch = async (url) => {
    if (url === "http://127.0.0.1:11435/v1/models") {
      return { ok: true, json: async () => ({ data: [{ id: "llama3.1:8b" }] }) };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json" } }] })
    };
  };

  const parsed = await parseScriptWithOllama({ rawText: fixtureText, fetchImpl: fakeFetch });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.rawOutput, "not json");
  assert.match(parsed.error, /invalid JSON/i);
});
