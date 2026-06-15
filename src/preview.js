import { getRemoteConfig, isAllowedAudioPath } from "./config.js";
import { run, runWithInput } from "./system.js";

export async function assembleScenePreview({
  projectId,
  sceneId,
  mode = "skip-missing",
  gapsMs = 350,
  fadeInMs = 0,
  fadeOutMs = 0,
  lineTiming = {},
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
  if (isNaN(gap) || gap < 0 || gap > 3000 || !Number.isInteger(gap)) {
    return { ok: false, error: "gapsMs must be an integer between 0 and 3000.", code: "INVALID_GAP_MS", status: 400 };
  }

  const fadeIn = Number(fadeInMs);
  if (isNaN(fadeIn) || fadeIn < 0 || fadeIn > 500 || !Number.isInteger(fadeIn)) {
    return { ok: false, error: "fadeInMs must be an integer between 0 and 500.", code: "INVALID_FADE_IN_MS", status: 400 };
  }

  const fadeOut = Number(fadeOutMs);
  if (isNaN(fadeOut) || fadeOut < 0 || fadeOut > 500 || !Number.isInteger(fadeOut)) {
    return { ok: false, error: "fadeOutMs must be an integer between 0 and 500.", code: "INVALID_FADE_OUT_MS", status: 400 };
  }

  // Validate lineTiming
  if (lineTiming !== undefined && lineTiming !== null) {
    if (typeof lineTiming !== "object" || Array.isArray(lineTiming)) {
      return { ok: false, error: "lineTiming must be an object.", code: "INVALID_LINE_TIMING", status: 400 };
    }
    for (const [lineId, timing] of Object.entries(lineTiming)) {
      if (timing !== null && typeof timing === "object") {
        if (timing.pauseAfterMs !== undefined && timing.pauseAfterMs !== null && timing.pauseAfterMs !== "") {
          const pause = Number(timing.pauseAfterMs);
          if (isNaN(pause) || pause < 0 || pause > 3000 || !Number.isInteger(pause)) {
            return { ok: false, error: "pauseAfterMs must be an integer between 0 and 3000.", code: "INVALID_PAUSE_AFTER_MS", status: 400 };
          }
        }
      } else if (timing !== undefined && timing !== null) {
        return { ok: false, error: "timing overrides must be objects.", code: "INVALID_LINE_TIMING", status: 400 };
      }
    }
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

  // Merge timing overrides from scene line structures and incoming request body
  const mergedLineTiming = {};
  for (const line of scene.lines) {
    if (line.timing?.pauseAfterMs !== undefined && line.timing?.pauseAfterMs !== null && line.timing?.pauseAfterMs !== "") {
      mergedLineTiming[line.id] = { pauseAfterMs: Number(line.timing.pauseAfterMs) };
    }
  }
  if (lineTiming) {
    for (const [lineId, timing] of Object.entries(lineTiming)) {
      if (timing?.pauseAfterMs !== undefined && timing?.pauseAfterMs !== null && timing?.pauseAfterMs !== "") {
        mergedLineTiming[lineId] = { pauseAfterMs: Number(timing.pauseAfterMs) };
      }
    }
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

  // 5. Probe durations on BigMac sequentially in a single SSH session
  const probeFiles = includedLines.map(line => line.remotePath);
  const probeCmd = `FFPROBE_BIN=$(command -v ffprobe) && if [ -z "$FFPROBE_BIN" ]; then echo "PREVIEW_ASSEMBLY_UNAVAILABLE" >&2; exit 51; fi && ` +
    probeFiles.map(f => `$FFPROBE_BIN -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '${f.replaceAll("'", "'\\''")}'`).join(" && ");

  const probeResult = await runFn("ssh", ["westcat", probeCmd]);
  if (!probeResult.ok) {
    if (probeResult.stderr.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || probeResult.stdout.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || probeResult.code === 51) {
      return {
        ok: false,
        error: "FFmpeg/FFprobe is not installed on the remote machine.",
        code: "PREVIEW_ASSEMBLY_UNAVAILABLE",
        status: 501
      };
    }
    return {
      ok: false,
      error: `Probing take durations failed: ${probeResult.stderr || probeResult.stdout || "Unknown error."}`,
      code: "PREVIEW_ASSEMBLY_FAILED",
      status: 500
    };
  }

  const durationStrings = probeResult.stdout.trim().split(/\r?\n/).filter(Boolean);
  const durations = durationStrings.map(d => parseFloat(d));

  for (let i = 0; i < includedLines.length; i++) {
    includedLines[i].duration = isNaN(durations[i]) ? 0 : durations[i];
  }

  // 6. Assemble audio on BigMac
  const rand = Math.random().toString(36).substring(2, 8);
  const tempDir = `/tmp/bvt-preview-${rand}`;
  const tempConcat = `${tempDir}/concat.txt`;

  // Build commands
  const remoteCmds = [
    `mkdir -p '${previewsDir.replaceAll("'", "'\\''")}'`,
    `mkdir -p '${tempDir}'`,
    `FFMPEG_BIN=$(command -v ffmpeg)`,
    `if [ -z "$FFMPEG_BIN" ]; then echo "PREVIEW_ASSEMBLY_UNAVAILABLE" >&2; exit 51; fi`
  ];

  // Fades
  const fadeInSeconds = fadeIn / 1000;
  const fadeOutSeconds = fadeOut / 1000;

  for (let i = 0; i < includedLines.length; i++) {
    const line = includedLines[i];
    const duration = line.duration;

    let activeFadeIn = fadeInSeconds;
    let activeFadeOut = fadeOutSeconds;

    if (activeFadeIn + activeFadeOut > duration) {
      const sum = activeFadeIn + activeFadeOut;
      if (sum > 0) {
        activeFadeIn = (activeFadeIn / sum) * duration;
        activeFadeOut = (activeFadeOut / sum) * duration;
      } else {
        activeFadeIn = 0;
        activeFadeOut = 0;
      }
    }

    const fadeOutStart = duration - activeFadeOut;
    const filters = [];
    if (activeFadeIn > 0) {
      filters.push(`afade=t=in:st=0:d=${activeFadeIn.toFixed(4)}`);
    }
    if (activeFadeOut > 0 && fadeOutStart >= 0) {
      filters.push(`afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${activeFadeOut.toFixed(4)}`);
    }

    const filterArg = filters.length > 0 ? `-af "${filters.join(",")}"` : "";
    const fadedPath = `${tempDir}/faded_${i}.wav`;

    remoteCmds.push(`$FFMPEG_BIN -nostdin -y -i '${line.remotePath.replaceAll("'", "'\\''")}' ${filterArg} -c:a pcm_f32le -ar 24000 -ac 1 '${fadedPath}'`);
  }

  // Silence files and concat manifest
  const usedGaps = [];
  const concatLines = [];

  for (let i = 0; i < includedLines.length; i++) {
    const line = includedLines[i];
    const fadedPath = `${tempDir}/faded_${i}.wav`;
    concatLines.push(`file '${fadedPath}'`);

    if (i < includedLines.length - 1) {
      const lineGapMs = (mergedLineTiming && mergedLineTiming[line.lineId]?.pauseAfterMs !== undefined)
        ? Number(mergedLineTiming[line.lineId].pauseAfterMs)
        : gap;

      if (lineGapMs > 0) {
        usedGaps.push(lineGapMs);
        const silencePath = `${tempDir}/silence_${lineGapMs}.wav`;
        concatLines.push(`file '${silencePath}'`);
      }
    }
  }

  const uniqueGaps = [...new Set(usedGaps)].filter(g => g > 0);
  for (const gapVal of uniqueGaps) {
    const silencePath = `${tempDir}/silence_${gapVal}.wav`;
    const silenceSecs = gapVal / 1000;
    remoteCmds.push(`$FFMPEG_BIN -nostdin -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${silenceSecs.toFixed(4)} -c:a pcm_f32le '${silencePath}'`);
  }

  const concatListContent = concatLines.join("\n") + "\n";

  remoteCmds.push(`cat > '${tempConcat}'`);
  remoteCmds.push(`$FFMPEG_BIN -nostdin -y -f concat -safe 0 -i '${tempConcat}' -c:a pcm_f32le -ar 24000 -ac 1 '${outputPath.replaceAll("'", "'\\''")}'`);

  const mainCommand = remoteCmds.join(" && ");
  const fullCommand = `(${mainCommand}) ; RET=$? ; rm -rf '${tempDir}' ; exit $RET`;

  const result = await runWithInputFn("ssh", ["westcat", fullCommand], concatListContent, { timeout: 120000 });

  if (!result.ok) {
    if (result.stderr.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || result.stdout.includes("PREVIEW_ASSEMBLY_UNAVAILABLE") || result.code === 51) {
      return {
        ok: false,
        error: "FFmpeg is not installed on the remote machine.",
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

  // 7. Retrieve duration using ffprobe
  const ffprobeCmd = `FFPROBE_BIN=$(command -v ffprobe) && if [ -n "$FFPROBE_BIN" ]; then $FFPROBE_BIN -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '${outputPath.replaceAll("'", "'\\''")}'; else echo "0"; fi`;
  const ffprobeResult = await runFn("ssh", ["westcat", ffprobeCmd]);
  let durationEstimateMs = 0;
  if (ffprobeResult.ok) {
    const parsedDuration = parseFloat(ffprobeResult.stdout.trim());
    if (!isNaN(parsedDuration)) {
      durationEstimateMs = Math.round(parsedDuration * 1000);
    }
  }

  // 8. Save preview record
  const lineTakeIds = includedLines.map(line => line.takeId);
  const skippedLineIds = skippedLines.map(line => line.lineId);

  const preview = await store.savePreview({
    projectId,
    sceneId,
    remotePath: outputPath,
    lineTakeIds,
    includedLineIds: includedLines.map(l => l.lineId),
    skippedLineIds,
    gapsMs: gap,
    fadeInMs: fadeIn,
    fadeOutMs: fadeOut,
    lineTiming: mergedLineTiming,
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
