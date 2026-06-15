import { run } from "./system.js";

export async function analyzeAudio(filePath) {
  const warnings = [];
  const result = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=sample_rate,channels",
    "-of", "json",
    filePath
  ], { timeout: 10000 });

  if (!result.ok) {
    return ["Could not inspect audio. Confirm this is a playable WAV, MP3, M4A, or FLAC file."];
  }

  try {
    const data = JSON.parse(result.stdout);
    const duration = Number(data.format?.duration || 0);
    const stream = data.streams?.[0] || {};
    const sampleRate = Number(stream.sample_rate || 0);
    const channels = Number(stream.channels || 0);

    if (duration > 0 && duration < 3) warnings.push("Reference audio is under 3 seconds; cloning quality may be weak.");
    if (duration > 30) warnings.push("Reference audio is over 30 seconds; trim to the cleanest section if generation is slow.");
    if (sampleRate > 0 && sampleRate < 16000) warnings.push("Sample rate is below 16 kHz.");
    if (channels > 2) warnings.push("Audio has more than two channels.");
    if (channels === 2) warnings.push("Stereo input detected; mono or centered speech usually works better.");
  } catch {
    warnings.push("Audio metadata could not be parsed.");
  }

  return warnings;
}
