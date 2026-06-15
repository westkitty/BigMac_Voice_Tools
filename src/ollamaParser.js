const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11435/v1";
const DEFAULT_OLLAMA_MODEL = "auto";

const systemPrompt = `You are a local script parser for an audio drama production tool. You are running through a BigMac-hosted Ollama model behind a local MacBook-side tunnel. Convert the user's raw script into strict JSON for line-by-line TTS rendering. Return valid JSON only. Do not use markdown. Do not summarize. Do not rewrite dialogue unless required to split overlong render units. Preserve line order, speaker names, bracketed delivery cues, narration, and action text. Use NARRATOR for prose or action narration. Use UNKNOWN when the speaker cannot be inferred. Add warnings for ambiguity instead of pretending certainty.`;

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeModel(value) {
  const model = String(value || "").trim();
  return model || DEFAULT_OLLAMA_MODEL;
}

export function getOllamaParserConfig(env = process.env, overrides = {}) {
  const baseUrl = trimSlash(overrides.baseUrl || env.BIGMAC_VOICETOOLS_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
  return {
    baseUrl,
    model: normalizeModel(overrides.model || env.BIGMAC_VOICETOOLS_OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL),
    isBigMacTunnelDefault: baseUrl === DEFAULT_OLLAMA_BASE_URL,
    copy: "The parser uses the MacBook-side tunnel to BigMac Ollama. This is not MacBook-local inference."
  };
}

export function stripJsonFences(value) {
  let text = String(value || "").trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  return text;
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function lineId(index) {
  return `L${String(index + 1).padStart(3, "0")}`;
}

function validateLine(line, index, errors) {
  if (!line || typeof line !== "object" || Array.isArray(line)) {
    errors.push(`Line ${index + 1} must be an object.`);
    return null;
  }
  const type = ["dialogue", "narration", "action"].includes(line.type) ? line.type : "";
  if (!type) errors.push(`Line ${index + 1} type must be dialogue, narration, or action.`);
  const text = asString(line.text).trim();
  if (!text) errors.push(`Line ${index + 1} text is required.`);
  const speakerInput = asString(line.speaker).trim();
  const speaker = speakerInput || (type === "narration" || type === "action" ? "NARRATOR" : "UNKNOWN");

  return {
    id: lineId(index),
    type: type || "dialogue",
    speaker,
    text,
    emotion: asString(line.emotion),
    pace: asString(line.pace),
    deliveryCue: asString(line.deliveryCue),
    takes: Math.max(1, Number(line.takes || 3))
  };
}

export function validateParsedScriptResult(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, error: "Parsed result must be an object.", value: null };
  }
  const title = asString(result.title, "Untitled Scene").trim() || "Untitled Scene";
  if (typeof result.rawText !== "string") errors.push("rawText must be a string.");
  if (!Array.isArray(result.scenes)) errors.push("scenes must be an array.");

  const scenes = Array.isArray(result.scenes) ? result.scenes.map((scene, sceneIndex) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      errors.push(`Scene ${sceneIndex + 1} must be an object.`);
      return null;
    }
    if (!asString(scene.id).trim()) errors.push(`Scene ${sceneIndex + 1} id is required.`);
    if (!Array.isArray(scene.lines)) errors.push(`Scene ${sceneIndex + 1} lines must be an array.`);
    const lines = Array.isArray(scene.lines)
      ? scene.lines.map((line, index) => validateLine(line, index, errors)).filter(Boolean)
      : [];
    return {
      id: asString(scene.id).trim() || `scene_${String(sceneIndex + 1).padStart(3, "0")}`,
      title: asString(scene.title).trim() || title || `Scene ${sceneIndex + 1}`,
      lines,
      warnings: Array.isArray(scene.warnings) ? scene.warnings.map(String) : []
    };
  }).filter(Boolean) : [];

  if (errors.length) {
    return { ok: false, error: errors.join(" "), value: null };
  }
  return {
    ok: true,
    error: "",
    value: {
      projectId: asString(result.projectId),
      title,
      rawText: result.rawText,
      scenes,
      warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : []
    }
  };
}

function userPrompt(rawText) {
  return `Convert this raw script into the required JSON schema. Keep every renderable unit in order. Generate stable line IDs beginning with L001. Preserve the raw script separately. Mark dialogue, narration, and action lines. Identify speaker, text, emotion, pace, deliveryCue, and suggested takes. Return JSON only.

Required output schema:
{
  "title": string,
  "rawText": string,
  "scenes": [{
    "id": string,
    "title": string,
    "lines": [{
      "id": string,
      "type": "dialogue" | "narration" | "action",
      "speaker": string,
      "text": string,
      "emotion": string,
      "pace": string,
      "deliveryCue": string,
      "takes": number
    }],
    "warnings": string[]
  }],
  "warnings": string[]
}

Raw script:
${rawText}`;
}

function modelIdFromItem(item) {
  return typeof item === "string" ? item : item?.id || item?.name || item?.model || "";
}

export function normalizeModelList(models) {
  return Array.isArray(models) ? models.map(modelIdFromItem).map((id) => String(id).trim()).filter(Boolean) : [];
}

export function isAutoModel(value) {
  const model = normalizeModel(value);
  return model === "auto" || model === "best-available" || model === "";
}

export function chooseParserModel(models, requestedModel = DEFAULT_OLLAMA_MODEL) {
  const available = normalizeModelList(models);
  const requested = normalizeModel(requestedModel);
  if (available.length === 0) return "";
  if (!isAutoModel(requested) && available.includes(requested)) return requested;

  const scored = available.map((id, index) => {
    const lower = id.toLowerCase();
    let score = 0;
    if (/(qwen|llama|mistral|mixtral|gemma|phi|deepseek|command|yi|nous|hermes)/.test(lower)) score += 30;
    if (/(instruct|chat|assistant)/.test(lower)) score += 25;
    if (/(coder|code|embed|embedding|vision|clip|whisper|tts|sdxl|stable|image)/.test(lower)) score -= 60;
    const size = lower.match(/(\d+(?:\.\d+)?)b/);
    if (size) {
      const billions = Number(size[1]);
      if (billions >= 7 && billions <= 34) score += 15;
      if (billions > 70) score -= 10;
    }
    return { id, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.id || available[0];
}

async function listBigMacOllamaModels(fetchImpl, config) {
  const response = await fetchImpl(`${config.baseUrl}/models`, { signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({}));
  const models = Array.isArray(body.data) ? normalizeModelList(body.data) : [];
  return { response, models, body };
}

export async function resolveParserModel({ fetchImpl = fetch, config = getOllamaParserConfig() } = {}) {
  const requestedModel = normalizeModel(config.model);
  let models = [];
  try {
    ({ models } = await listBigMacOllamaModels(fetchImpl, config));
  } catch {
    return {
      requestedModel,
      selectedModel: isAutoModel(requestedModel) ? "" : requestedModel,
      modelAvailable: false,
      autoSelected: false,
      models
    };
  }
  const selectedModel = chooseParserModel(models, requestedModel);
  return {
    requestedModel,
    selectedModel,
    modelAvailable: Boolean(selectedModel && models.includes(selectedModel)),
    autoSelected: isAutoModel(requestedModel) && Boolean(selectedModel),
    models
  };
}

export async function parseScriptWithOllama({ rawText, fetchImpl = fetch, config = getOllamaParserConfig() }) {
  const text = String(rawText || "");
  if (!text.trim()) {
    return { ok: false, error: "Raw script text is required.", rawOutput: "", result: null };
  }
  try {
    const resolution = await resolveParserModel({ fetchImpl, config });
    const model = resolution.selectedModel;
    if (!model) {
      return {
        ok: false,
        error: `No usable BigMac Ollama parser model is available through ${config.baseUrl}. Choose an installed chat/instruct model from the parser health list.`,
        rawOutput: JSON.stringify({ requestedModel: resolution.requestedModel, models: resolution.models }),
        result: null,
        parserModel: resolution
      };
    }
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt(text) }
        ],
        temperature: 0.1
      })
    });
    const body = await response.json().catch(async () => ({ error: await response.text?.() }));
    if (!response.ok) {
      return {
        ok: false,
        error: `BigMac Ollama parser request failed through ${config.baseUrl} using ${model}: ${body?.error?.message || body?.error || response.status}`,
        rawOutput: JSON.stringify(body),
        result: null,
        parserModel: resolution
      };
    }
    const rawOutput = String(body?.choices?.[0]?.message?.content || body?.message?.content || "");
    let parsed;
    try {
      parsed = JSON.parse(stripJsonFences(rawOutput));
    } catch {
      return {
        ok: false,
        error: "BigMac Ollama returned invalid JSON through the tunnel. Your raw script was preserved.",
        rawOutput,
        result: null,
        parserModel: resolution
      };
    }
    const validation = validateParsedScriptResult(parsed);
    if (!validation.ok) {
      return { ok: false, error: validation.error, rawOutput, result: null, parserModel: resolution };
    }
    return { ok: true, error: "", rawOutput, result: validation.value, parserModel: resolution };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || /timeout/i.test(error?.message || "");
    return {
      ok: false,
      error: timedOut
        ? `BigMac Ollama parser timed out through ${config.baseUrl}. Your raw script was preserved.`
        : `BigMac Ollama is unreachable through ${config.baseUrl}. Check the com.bigmac.ollama-tunnel LaunchAgent and BigMac Ollama service. Do not start MacBook-local Ollama as a fallback.`,
      rawOutput: "",
      result: null
    };
  }
}

export async function getParserHealth({ fetchImpl = fetch, config = getOllamaParserConfig() } = {}) {
  try {
    const { response, models } = await listBigMacOllamaModels(fetchImpl, config);
    const selectedModel = chooseParserModel(models, config.model);
    const modelAvailable = Boolean(selectedModel && models.includes(selectedModel));
    return {
      ok: response.ok && modelAvailable,
      detail: response.ok
        ? (modelAvailable
          ? `BigMac-backed Ollama tunnel responded. Parser will use ${selectedModel}.`
          : "BigMac-backed Ollama tunnel responded, but no usable parser model was selected.")
        : `BigMac-backed Ollama tunnel returned HTTP ${response.status}.`,
      baseUrl: config.baseUrl,
      configuredModel: config.model,
      requestedModel: config.model,
      selectedModel,
      model: selectedModel || config.model,
      modelAvailable,
      autoSelected: isAutoModel(config.model) && Boolean(selectedModel),
      models,
      copy: config.copy
    };
  } catch (error) {
    return {
      ok: false,
      detail: `BigMac Ollama is unreachable through ${config.baseUrl}. Check the com.bigmac.ollama-tunnel LaunchAgent and BigMac Ollama service. Do not start MacBook-local Ollama as a fallback.`,
      baseUrl: config.baseUrl,
      configuredModel: config.model,
      requestedModel: config.model,
      selectedModel: "",
      model: config.model,
      modelAvailable: false,
      autoSelected: false,
      models: [],
      copy: config.copy,
      error: error.message
    };
  }
}
