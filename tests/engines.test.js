import assert from "node:assert/strict";
import test from "node:test";

import { getRemoteConfig, isAllowedAudioPath } from "../src/config.js";
import { generateTake, listEngines } from "../src/engines.js";

test("remote roots preserve wc2tb defaults and audio allowlist", () => {
  const config = getRemoteConfig({});

  assert.equal(config.remoteRoot, "/Volumes/wc2tb/Ai/VoiceTools");
  assert.equal(config.remoteEngineRoot, "/Volumes/wc2tb/Ai/VoiceTools/chatterbox");
  assert.equal(config.remoteVoiceRoot, "/Volumes/wc2tb/Ai/VoiceTools/wrapper-voices");
  assert.equal(config.remoteOutputRoot, "/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs");
  assert.equal(isAllowedAudioPath("/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/test.wav", config), true);
  assert.equal(isAllowedAudioPath("/Volumes/wc2tb/Ai/VoiceTools/chatterbox/not-outputs/test.wav", config), false);
});

test("remote roots can be configured without loosening output allowlist", () => {
  const config = getRemoteConfig({
    BIGMAC_VOICETOOLS_REMOTE_ROOT: "/Volumes/wc1tb/Ai/VoiceTools",
    BIGMAC_VOICETOOLS_REMOTE_ENGINE_ROOT: "/Volumes/wc1tb/Ai/VoiceTools/chatterbox",
    BIGMAC_VOICETOOLS_REMOTE_VOICE_ROOT: "/Volumes/wc1tb/Ai/VoiceTools/wrapper-voices",
    BIGMAC_VOICETOOLS_REMOTE_OUTPUT_ROOT: "/Volumes/wc1tb/Ai/VoiceTools/chatterbox/outputs"
  });

  assert.equal(config.remoteRoot, "/Volumes/wc1tb/Ai/VoiceTools");
  assert.equal(isAllowedAudioPath("/Volumes/wc1tb/Ai/VoiceTools/chatterbox/outputs/test.wav", config), true);
  assert.equal(isAllowedAudioPath("/Volumes/wc2tb/Ai/VoiceTools/chatterbox/outputs/test.wav", config), false);
});

test("engine list marks Chatterbox configured and placeholders unconfigured", () => {
  const engines = listEngines();

  assert.equal(engines.find((engine) => engine.id === "chatterbox").configured, true);
  assert.equal(engines.find((engine) => engine.id === "indextts2").configured, false);
  assert.equal(engines.find((engine) => engine.id === "dia").configured, false);
  assert.equal(engines.find((engine) => engine.id === "kokoro").configured, false);
});

test("placeholder engines fail clearly", async () => {
  await assert.rejects(
    generateTake({ engine: "dia" }),
    /Engine "dia" is not configured yet\./
  );
});
