export async function drawWaveforms() {
  const canvases = [...document.querySelectorAll("canvas[data-waveform-src]")];
  await Promise.all(canvases.slice(0, 24).map(drawWaveform));
}

export async function drawWaveform(canvas) {
  const src = canvas.dataset.waveformSrc;
  if (!src || canvas.dataset.rendered === src) return;
  canvas.dataset.rendered = src;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 58;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const mid = height / 2;

  try {
    const arrayBuffer = await (await fetch(src)).arrayBuffer();
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const data = buffer.getChannelData(0);

    // Discrete glowing bars, mirrored around the centre line.
    const barWidth = 2;
    const slot = barWidth + 1;
    const bars = Math.max(1, Math.floor(width / slot));
    const step = Math.max(1, Math.floor(data.length / bars));

    // Faint baseline for a calibrated, instrument-like feel.
    context.strokeStyle = "rgba(100, 231, 255, 0.12)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, mid);
    context.lineTo(width, mid);
    context.stroke();

    // Vertical cyan→violet gradient with a soft outer glow.
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(126, 240, 255, 0.95)");
    gradient.addColorStop(0.5, "rgba(100, 231, 255, 0.82)");
    gradient.addColorStop(1, "rgba(178, 140, 255, 0.92)");
    context.fillStyle = gradient;
    context.shadowColor = "rgba(100, 231, 255, 0.55)";
    context.shadowBlur = 6;

    const radius = Math.min(barWidth / 2, 1);
    for (let b = 0; b < bars; b += 1) {
      let peak = 0;
      const start = b * step;
      for (let i = 0; i < step && start + i < data.length; i += 1) {
        const value = Math.abs(data[start + i]);
        if (value > peak) peak = value;
      }
      const amp = Math.max(1.4, peak * mid * 0.92);
      const x = b * slot;
      context.beginPath();
      if (context.roundRect) {
        context.roundRect(x, mid - amp, barWidth, amp * 2, radius);
      } else {
        context.rect(x, mid - amp, barWidth, amp * 2);
      }
      context.fill();
    }

    context.shadowBlur = 0;
    await audioContext.close();
  } catch {
    context.fillStyle = "rgba(255, 209, 102, 0.85)";
    context.font = "12px ui-monospace, Menlo, monospace";
    context.fillText("Waveform unavailable", 12, mid + 4);
  }
}
