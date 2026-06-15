import { generateWithChatterbox } from "./generator.js";

const engines = [
  { id: "chatterbox", name: "Chatterbox", configured: true, description: "BigMac Chatterbox wrapper" },
  { id: "indextts2", name: "IndexTTS2", configured: false, description: "Placeholder adapter" },
  { id: "dia", name: "Dia", configured: false, description: "Placeholder adapter" },
  { id: "kokoro", name: "Kokoro", configured: false, description: "Placeholder adapter" }
];

export function listEngines() {
  return engines.map((engine) => ({ ...engine }));
}

export async function generateTake(input) {
  const engine = input?.engine || "chatterbox";
  if (engine !== "chatterbox") {
    throw new Error(`Engine "${engine}" is not configured yet.`);
  }

  let exaggeration = input.exaggeration;
  let cfgWeight = input.cfgWeight;

  if (input.speechSettings && input.speechSettings.activeGeneratorParams) {
    exaggeration = input.speechSettings.activeGeneratorParams.exaggeration;
    cfgWeight = input.speechSettings.activeGeneratorParams.cfgWeight;
  }

  const generated = await generateWithChatterbox({
    voice: input.voice,
    text: input.text,
    model: input.model,
    exaggeration,
    cfgWeight
  });
  return {
    remotePath: generated.output_path,
    metadata: {
      engine: "chatterbox",
      model: generated.model || input.model || "Standard",
      remotePath: generated.output_path
    },
    generated
  };
}
