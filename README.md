# BigMac VoiceTools

BigMac VoiceTools is a local-only, production-grade audio scripting, speech synthesis, and preview compilation system for Audio Drama.

## Architecture

This application uses a split client-backend architecture optimized for local high-performance hardware:
- **Client (MacBook):** Serves as the control surface and hosts the browser-based UI, voice records database, and state management.
- **Backend (BigMac):** A remote Apple Silicon inference host that runs speech generation (Chatterbox), script parsing (Ollama), and audio preview processing (ffmpeg/ffprobe).

All communications to the backend run over local network tunnels and SSH connections (`ssh westcat`). There are **no cloud APIs, no telemetry, and no external SaaS calls**.

---

## Prerequisites & Tunnels

Ensure the following tunnels and SSH paths are verified before starting:
1. **SSH Connection:** Verify access to the inference server:
   ```sh
   ssh westcat 'whoami && hostname && pwd && sw_vers'
   ```
   *Expected output starts with:*
   ```text
   bigmac
   bigmac
   ```
2. **Ollama Parser Tunnel:** Ensure the Ollama port forwarding is active from MacBook to BigMac:
   ```sh
   curl -fsS http://127.0.0.1:11435/v1/models | jq -r '.data[].id'
   ```
3. **Audio Utilities:** Verify that ffmpeg and ffprobe are available on the remote backend:
   ```sh
   ssh westcat 'command -v ffmpeg || true; command -v ffprobe || true'
   ```

---

## How to Run

1. Navigate to the project directory:
   ```sh
   cd /Users/andrew/dex_voice_cloner
   ```
2. Start the local wrapper server:
   ```sh
   npm start
   ```
   To run on a custom port:
   ```sh
   PORT=7873 npm start
   ```
3. Access the dashboard:
   - Default URL: [http://127.0.0.1:7870](http://127.0.0.1:7870)
   - Custom Port URL: [http://127.0.0.1:7873](http://127.0.0.1:7873)

---

## V1 Audio Drama Workflow

1. **Voice Lab:** Add or import reference voices to establish the voice directory.
2. **Projects:** Create a project and bind character names to specific voices and synthesis engines.
3. **Script Input:** Paste script text formatted with dialogue tags.
4. **Parse Script:** Parse dialogue turns into scene lines using the Ollama backend.
5. **Preflight & Bindings:** Verify voice bindings are `Ready` and safe.
6. **Render Lines:** Queue and sequentially synthesize speech takes for all ready lines.
7. **Take Review:** Listen to and select the best takes for each line card.
8. **Preview Assembly:** Compile the selected takes into a single scene preview. Customize gaps, set per-line pause overrides, and configure fade-in/fade-out parameters.
9. **Export & Open:** Play, open in a new tab, copy the remote output path, or download the assembled preview.

---

## Safety & Git Hygiene

- **No Cloud Uploads:** Audio synthesis and script parsing are executed entirely on local hardware.
- **Access Restrictions:** The audio stream endpoint (`/api/audio`) blocks all paths outside of the configured Chatterbox output directory to protect filesystem integrity.
- **Git Ignore Safeguards:** Generated audio files (.wav), reference voices, and local configuration details (.env, state.json) are excluded from the repository.

---

## Verification & Testing

Verify system integrity using the following command suite:
```sh
# Run automated test suite
npm test

# Check syntax validity of code files
node --check server.js
find src -name '*.js' -print -exec node --check {} \;
node --check public/app.js
find public/modules -name '*.js' -print -exec node --check {} \;
```
