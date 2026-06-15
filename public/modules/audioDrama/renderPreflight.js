import { $, state } from "../state.js";
import { getSpeakerStatus } from "./speakerMapping.js";

export function preflightRenderLine(lineId) {
  const projectId = $("projectSelect").value;
  if (!projectId) {
    return { ok: false, error: "Create or select a project before rendering.", field: "projectSelect" };
  }
  
  const sceneId = state.currentSceneId || state.scenes[0]?.id;
  if (!sceneId) {
    return { ok: false, error: "Save the scene before rendering this line.", field: "saveSceneButton" };
  }

  // Find DOM inputs for this line card
  const textInput = document.querySelector(`[data-line-id="${CSS.escape(lineId)}"][data-line-field="text"]`);
  const text = textInput ? textInput.value.trim() : "";
  if (!text) {
    return { ok: false, error: `Line ${lineId} has no text.`, field: textInput };
  }

  const speakerInput = document.querySelector(`[data-line-id="${CSS.escape(lineId)}"][data-line-field="speaker"]`);
  const speaker = speakerInput ? speakerInput.value.trim() : "";
  if (!speaker) {
    return { ok: false, error: `Line ${lineId} has no speaker.`, field: speakerInput };
  }

  const mapping = getSpeakerStatus(speaker);
  if (speaker.toUpperCase() === "UNKNOWN" && !mapping.character) {
    return { ok: false, error: "Speaker UNKNOWN is not mapped to a character. Map it before rendering.", field: `tr[data-speaker="UNKNOWN"] select` };
  }

  if (!mapping.character) {
    return { ok: false, error: `Speaker ${speaker} is not mapped to a character. Map it before rendering.`, field: `tr[data-speaker="${CSS.escape(speaker)}"] select` };
  }

  if (!mapping.character.voiceId) {
    return { ok: false, error: `Character ${mapping.character.name} has no assigned reference voice.`, field: `tr[data-speaker="${CSS.escape(speaker)}"] select` };
  }

  const voice = state.voices.find(v => v.id === mapping.character.voiceId);
  if (!voice) {
    return { ok: false, error: `Assigned voice for character ${mapping.character.name} was not found in the voice list.`, field: `tr[data-speaker="${CSS.escape(speaker)}"] select` };
  }

  const takesInput = document.querySelector(`[data-line-id="${CSS.escape(lineId)}"][data-line-field="takes"]`);
  const takes = takesInput ? Number(takesInput.value) : 1;
  if (isNaN(takes) || takes < 1 || takes > 10 || !Number.isInteger(takes)) {
    return { ok: false, error: "Take count must be between 1 and 10.", field: takesInput };
  }

  const engine = mapping.character.preferredEngine || "chatterbox";

  return { 
    ok: true, 
    payload: { 
      projectId, 
      sceneId, 
      lineId, 
      text, 
      speaker, 
      takes, 
      characterId: mapping.character.id, 
      voiceId: mapping.character.voiceId, 
      engine 
    } 
  };
}
