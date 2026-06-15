export async function drawWaveforms() {
  const canvases = [...document.querySelectorAll("canvas[data-waveform-src]")];
  await Promise.all(canvases.map(drawWaveform).slice(0, 24));
}

export async function drawWaveform(canvas) {
  const src = canvas.dataset.waveformSrc;
  if (!src || canvas.dataset.rendered === src) return;
  canvas.dataset.rendered = src;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 54;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(100, 231, 255, 0.08)";
  context.fillRect(0, 0, width, height);
  try {
    const arrayBuffer = await (await fetch(src)).arrayBuffer();
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const mid = height / 2;
    context.strokeStyle = "rgba(100, 231, 255, 0.92)";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 1) {
      let min = 1;
      let max = -1;
      const start = x * step;
      for (let i = 0; i < step && start + i < data.length; i += 1) {
        const value = data[start + i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      context.beginPath();
      context.moveTo(x, mid + min * mid * 0.88);
      context.lineTo(x, mid + max * mid * 0.88);
      context.stroke();
    }
    await audioContext.close();
  } catch {
    context.fillStyle = "rgba(255, 209, 102, 0.82)";
    context.font = "12px Avenir Next, sans-serif";
    context.fillText("Waveform unavailable", 12, 31);
  }
}
