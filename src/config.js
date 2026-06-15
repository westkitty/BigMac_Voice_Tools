const DEFAULT_REMOTE_ROOT = "/Volumes/wc2tb/Ai/VoiceTools";
const DEFAULT_REMOTE_ENGINE_ROOT = `${DEFAULT_REMOTE_ROOT}/chatterbox`;
const DEFAULT_REMOTE_VOICE_ROOT = `${DEFAULT_REMOTE_ROOT}/wrapper-voices`;
const DEFAULT_REMOTE_OUTPUT_ROOT = `${DEFAULT_REMOTE_ENGINE_ROOT}/outputs`;

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function getRemoteConfig(env = process.env) {
  const remoteRoot = stripTrailingSlash(env.BIGMAC_VOICETOOLS_REMOTE_ROOT || DEFAULT_REMOTE_ROOT);
  return {
    remoteRoot,
    remoteEngineRoot: stripTrailingSlash(env.BIGMAC_VOICETOOLS_REMOTE_ENGINE_ROOT || `${remoteRoot}/chatterbox` || DEFAULT_REMOTE_ENGINE_ROOT),
    remoteVoiceRoot: stripTrailingSlash(env.BIGMAC_VOICETOOLS_REMOTE_VOICE_ROOT || `${remoteRoot}/wrapper-voices` || DEFAULT_REMOTE_VOICE_ROOT),
    remoteOutputRoot: stripTrailingSlash(env.BIGMAC_VOICETOOLS_REMOTE_OUTPUT_ROOT || `${remoteRoot}/chatterbox/outputs` || DEFAULT_REMOTE_OUTPUT_ROOT),
    recommendedFutureRemoteRoot: "/Volumes/wc1tb/Ai/VoiceTools"
  };
}

export function isAllowedAudioPath(outputPath, config = getRemoteConfig()) {
  const root = `${stripTrailingSlash(config.remoteOutputRoot)}/`;
  const value = String(outputPath || "");
  return value.startsWith(root) && !value.slice(root.length).includes("..");
}
