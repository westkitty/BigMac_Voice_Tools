import path from "node:path";
import { getRemoteConfig } from "./config.js";
import { run, runWithInput, shellQuote } from "./system.js";

function remoteSafeName(voice) {
  return `${voice.id}-${path.basename(voice.fileName || "reference.wav").replace(/[^a-z0-9._-]+/gi, "-")}`;
}

export async function generateWithChatterbox({ voice, text, model, exaggeration, cfgWeight }) {
  const config = getRemoteConfig();
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Text is required.");

  await run("ssh", ["westcat", `mkdir -p ${shellQuote(config.remoteVoiceRoot)}`], { timeout: 10000 });
  const remoteVoicePath = `${config.remoteVoiceRoot}/${remoteSafeName(voice)}`;
  const scp = await run("scp", [voice.filePath, `westcat:${remoteVoicePath}`], { timeout: 60000 });
  if (!scp.ok) {
    throw new Error(`Could not copy reference voice to Big Mac: ${scp.stderr || scp.error}`);
  }

  const modelKind = model || "Standard";
  const requestPayload = {
    text: cleanText,
    reference_audio: remoteVoicePath,
    model_kind: modelKind
  };
  if (modelKind === "Standard") {
    requestPayload.exaggeration = exaggeration !== undefined && exaggeration !== null ? Number(exaggeration) : 0.5;
    requestPayload.cfg_weight = cfgWeight !== undefined && cfgWeight !== null ? Number(cfgWeight) : 0.5;
  }
  const payload = JSON.stringify(requestPayload);
  const command = [
    `cd ${shellQuote(config.remoteEngineRoot)}`,
    "source .venv/bin/activate",
    `export HF_HOME=${shellQuote(`${config.remoteRoot}/.cache/huggingface`)}`,
    `export HUGGINGFACE_HUB_CACHE=${shellQuote(`${config.remoteRoot}/.cache/huggingface/hub`)}`,
    `export TORCH_HOME=${shellQuote(`${config.remoteRoot}/.cache/torch`)}`,
    `export XDG_CACHE_HOME=${shellQuote(`${config.remoteRoot}/.cache/xdg`)}`,
    "python generate-from-wrapper.py"
  ].join(" && ");
  const result = await runWithInput("ssh", ["westcat", command], payload, { timeout: 1000 * 60 * 15 });
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Chatterbox generation failed.");
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error(`Chatterbox did not return JSON: ${result.stdout}`);
  }
  return JSON.parse(jsonLine);
}
