import { getRemoteConfig, isAllowedAudioPath } from "./config.js";
import { run, runWithInput } from "./system.js";

export async function assembleScenePreview({
  projectId,
  sceneId,
  mode = "skip-missing",
  gapsMs = 350,
  store,
  runFn = run,
  runWithInputFn = runWithInput
}) {
  // 1. Validation of inputs
  if (!projectId) {
    return { ok: false, error: "projectId is required.", code: "MISSING_PROJECT", status: 400 };
  }
  if (!sceneId) {
    return { ok: false, error: "sceneId is required.", code: "MISSING_SCENE", status: 400 };
  }

  const allowedModes = ["skip-missing", "fail-on-missing"];
  if (!allowedModes.includes(mode)) {
    return { ok: false, error: `Invalid mode "${mode}".`, code: "INVALID_PREVIEW_MODE", status: 400 };
  }

  const gap = Number(gapsMs);
  if (isNaN(gap) || gap < 0 || gap > 3000) {
    return { ok: false, error: "gapsMs must be a number between 0 and 3000.", code: "INVALID_GAP_MS", status: 400 };
  }

  // 2. Fetch project and scene
  const project = await store.getProject(projectId);
  if (!project) {
    return { ok: false, error: "Project was not found.", code: "MISSING_PROJECT", status: 404 };
  }

  const scene = await store.getScene(sceneId);
  if (!scene || scene.projectId !== projectId) {
    return { ok: false, error: "Scene was not found in project.", code: "MISSING_SCENE", status: 404 };
  }

  // 3. Retrieve selected takes manifest
  const manifest = await store.listSelectedTakes({ projectId, sceneId });
  const allTakes = await store.listTakes();

  const includedLines = [];
  const skippedLines = [];

  for (const line of scene.lines) {
    const takeId = manifest.selectedTakes?.[line.id];
    if (takeId) {
      const take = allTakes.find(t => t.id === takeId);
      if (!take) {
        skippedLines.push({
          lineId: line.id,
          speaker: line.speaker,
          code: "TAKE_NOT_FOUND",
          error: `Selected take "${takeId}" for line ${line.id} was not found in database.`
        });
        continue;
      }
      
      const remotePath = take.outputPath || take.remotePath;
      if (!remotePath) {
        skippedLines.push({
          lineId: line.id,
          speaker: line.speaker,
          code: "TAKE_NOT_FOUND",
          error: `Selected take for line ${line.id} does not have a valid audio path.`
        });
        continue;
      }

      // Check allowlist
      if (!isAllowedAudioPath(remotePath)) {
        return {
          ok: false,
          error: `Take audio path "${remotePath}" is not under allowlisted output root.`,
          code: "AUDIO_PATH_NOT_ALLOWED",
          status: 403
        };
      }

      includedLines.push({
        lineId: line.id,
        speaker: line.speaker,
        takeId,
        remotePath
      });
    } else {
      // No selected take
      skippedLines.push({
        lineId: line.id,
        speaker: line.speaker,
        code: "NO_SELECTED_TAKE",
        error: `Line ${line.id} has no selected take.`
      });
    }
  }

  if (mode === "fail-on-missing" && skippedLines.length > 0) {
    return {
      ok: false,
      error: `Strict mode failed. Missing selected takes for lines: ${skippedLines.map(l => l.lineId).join(", ")}.`,
      code: "NO_SELECTED_TAKE",
      status: 409,
      skipped: skippedLines
    };
  }

  // Check if we have any included takes
  if (includedLines.length === 0) {
    return {
      ok: false,
      error: "No selected takes are available for this scene.",
      code: "NO_SELECTED_TAKES",
      status: 409
    };
  }

  // 4. Generate unique output filename
  const config = getRemoteConfig();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const previewsDir = `${config.remoteOutputRoot}/previews`;
  const outputFilename = `scene-preview-${sceneId}-${timestamp}.wav`;
  const outputPath = `${previewsDir}/${outputFilename}`;

  // Validate output path
  if (!isAllowedAudioPath(outputPath)) {
    return {
      ok: false,
      error: `Preview output path "${outputPath}" is not under allowlisted output root.`,
      code: "AUDIO_PATH_NOT_ALLOWED",
      status: 403
    };
  }

  // 5. Assemble audio on BigMac
  const rand = Math.random().toString(36).substring(2, 8);
  const tempSilence = `/tmp/silence_${rand}.wav`;
  const tempConcat = `/tmp/concat_${rand}.txt`;

  // Build concat list text content
  const concatLines = [];
  const gapsSeconds = gap / 1000;

  for (let i = 0; i < includedLines.length; i++) {
    concatLines.push(`file '${includedLines[i].remotePath.replaceAll("'", "'\\''")}'`);
    if (i < includedLines.length - 1 && gap > 0) {
      concatLines.push(`file '${tempSilence}'`);
    }
  }
  const concatListContent = concatLines.join("\n") + "\n";

  // Build command chain on BigMac
  const remoteCmds = [
    `mkdir -p '${previewsDir.replaceAll("'", "'\\''")}'`,
    `FFMPEG_BIN=$(command -v ffmpeg) && FFPROBE_BIN=$(command -v ffprobe)`,
    `if [ -z "$FFMPEG_BIN" ] || [ -z "$FFPROBE_BIN" ]; then echo "PREVIEW_ASSEMBLY_UNAVAILABLE" >&2; exit 51; fi`
  ];

  if (gap > 0 && includedLines.length > 1) {
    remoteCmds.push(`$FFMPEG_BIN -nostdin -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${gapsSeconds} -c:a pcm_f32le '${tempSilence.replaceAll("'", "'\\''")}'`);
  }

  remoteCmds.push(`cat > '${tempConcat.replaceAll("'", "'\\''")}'`);
  remoteCmds.push(`$FFMPEG_BIN -nostdin -y -f concat -safe 0 -i '${tempConcat.replaceAll("'", "'\\''")}' -c:a pcm_f32le -ar 24000 -ac 1 '${outputPath.replaceAll("'", "'\\''")}'`);

  const mainCommand = remoteCmds.join(" && ");
  const fullCommand = `(${mainCommand}) ; RET=$? ; rm -f '${tempSilence.replaceAll("'", "'\\''")}' '${tempConcat.replaceAll("'", "'\\''")}' ; exit $RET`;

  const result = await runWithInputFn("ssh", ["westcat", fullCommand], concatListContent, { timeout: 120000 });

  if (!result.ok) {
    if (result.stderr.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || result.stdout.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || result.code === 51) {
      return {
        ok: false,
        error: "FFmpeg/FFprobe is not installed on the remote machine.",
        code: "PREVIEW_ASSEMBLY_UNAVAILABLE",
        status: 501
      };
    }
    return {
      ok: false,
      error: `Preview assembly failed: ${result.stderr || result.stdout || "Unknown error."}`,
      code: "PREVIEW_ASSEMBLY_FAILED",
      status: 500
    };
  }

  // 6. Retrieve duration using ffprobe
  const ffprobeCmd = `FFPROBE_BIN=$(command -v ffprobe) && if [ -n "$FFPROBE_BIN" ]; then $FFPROBE_BIN -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '${outputPath.replaceAll("'", "'\\''")}'; else echo "0"; fi`;
  const ffprobeResult = await runFn("ssh", ["westcat", ffprobeCmd]);
  let durationEstimateMs = 0;
  if (ffprobeResult.ok) {
    const parsedDuration = parseFloat(ffprobeResult.stdout.trim());
    if (!isNaN(parsedDuration)) {
      durationEstimateMs = Math.round(parsedDuration * 1000);
    }
  }

  // 7. Save preview record
  const lineTakeIds = includedLines.map(line => line.takeId);
  const skippedLineIds = skippedLines.map(line => line.lineId);

  const preview = await store.savePreview({
    projectId,
    sceneId,
    remotePath: outputPath,
    lineTakeIds,
    skippedLineIds,
    gapsMs: gap,
    format: "wav",
    durationEstimateMs
  });

  return {
    ok: true,
    projectId,
    sceneId,
    preview: {
      id: preview.id,
      remotePath: preview.remotePath,
      audioUrl: `/api/audio?path=${encodeURIComponent(preview.remotePath)}`,
      createdAt: preview.createdAt,
      durationEstimateMs: preview.durationEstimateMs,
      format: preview.format
    },
    summary: {
      lines: scene.lines.length,
      included: includedLines.length,
      skipped: skippedLines.length
    },
    skipped: skippedLines
  };
}
