import { run } from "./system.js";

function state(ok, detail, extra = {}) {
  return { ok, detail, ...extra };
}

export async function getHealth() {
  const [route, localPort, remotePort, disk, rawGui] = await Promise.all([
    run("ssh", ["westcat", "whoami && hostname"], { timeout: 10000 }),
    run("lsof", ["-nP", "-iTCP:7860", "-sTCP:LISTEN"], { timeout: 5000 }),
    run("ssh", ["westcat", "lsof -nP -iTCP:7860 -sTCP:LISTEN || true"], { timeout: 10000 }),
    run("ssh", ["westcat", "df -h /Volumes/wc2tb | tail -1"], { timeout: 10000 }),
    run("curl", ["-fsSI", "-L", "--max-time", "5", "http://127.0.0.1:7860/"], { timeout: 7000 })
  ]);

  const routeLines = route.stdout.trim().split(/\r?\n/);
  const routeOk = route.ok && routeLines[0] === "bigmac" && routeLines[1] === "bigmac";
  const remoteListening = /127\.0\.0\.1:7860/.test(remotePort.stdout);
  const localListening = /127\.0\.0\.1:7860|\[::1\]:7860/.test(localPort.stdout);
  const diskLine = disk.stdout.trim();

  return {
    checkedAt: new Date().toISOString(),
    bigMac: state(routeOk, routeOk ? "ssh westcat -> bigmac/bigmac" : route.stderr || route.stdout || route.error),
    server: state(remoteListening, remoteListening ? "Chatterbox listening on Big Mac 127.0.0.1:7860" : "No tracked remote listener on 7860"),
    tunnel: state(localListening, localListening ? "MacBook tunnel listening on 127.0.0.1:7860" : "No MacBook listener on 7860"),
    disk: state(Boolean(diskLine), diskLine || disk.stderr || "wc2tb disk check failed"),
    rawGui: state(rawGui.ok, rawGui.ok ? "Raw Chatterbox GUI responds through tunnel" : rawGui.stderr || rawGui.error),
    wrapper: state(true, "Version A wrapper backend is running")
  };
}
