# Anti-Gravity Unpack Prompt — Studio Workspace UI Shell v2

You are applying a prepared Studio Workspace UI shell v2 patch for the local-only BigMac VoiceTools project.

Target project path:

`/Users/andrew/dex_voice_cloner`

Patch zip path:

`[replace with the downloaded path to bigmac_voicetools_studio_workspace_ui_shell_v2.zip]`

## Task

Unpack the zip, overlay the contained `dex_voice_cloner/` directory onto `/Users/andrew/dex_voice_cloner`, validate the app, then stage, commit, and push if validation passes.

## Scope

This patch applies the 20-point critique response to the Studio Workspace UI shell. It adds:

- degraded stack banner
- data-driven workflow readiness model
- active Drama Studio step switching
- functional inspector summary
- activity drawer live status target
- relaunch command copy controls
- preview/export panel polish
- guarded frontend event binding
- inline recent-preview error states
- responsive/accessibility rules
- UI shell smoke tests
- critique response documentation

## Hard rules

- Back up the current project before overlaying.
- Do not overwrite or replace `.git`.
- Do not delete local/generated files.
- Do not stage generated audio, reference voices, local state, logs, `.env`, zips, app bundles, scratch files, or `node_modules`.
- Preserve the canonical launch doctrine:
  - normal URL: `http://127.0.0.1:7870`
  - Chatterbox tunnel: `127.0.0.1:7860`
  - Ollama tunnel: `127.0.0.1:11435`
  - normal launcher: Dock icon or `/Users/andrew/bin/bigmac-voicetools-launch`
  - do not use `PORT=7873 npm start` except for debugging.

## Install commands

```sh
set -euo pipefail

PROJECT="/Users/andrew/dex_voice_cloner"
ZIP="[replace with the downloaded path to bigmac_voicetools_studio_workspace_ui_shell_v2.zip]"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/Users/andrew/dex_voice_cloner_backups/dex_voice_cloner_before_ui_shell_v2_${STAMP}.tar.gz"
WORKDIR="/tmp/bvt-ui-shell-v2-${STAMP}"

mkdir -p /Users/andrew/dex_voice_cloner_backups

cd "$PROJECT"
pwd
git status --short
git log --oneline -5
git remote -v

tar --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='logs' \
  --exclude='results' \
  -czf "$BACKUP" \
  -C /Users/andrew dex_voice_cloner

mkdir -p "$WORKDIR"
unzip -q "$ZIP" -d "$WORKDIR"

rsync -av \
  --exclude='.git/' \
  --exclude='.git.broken.20260615-003452/' \
  --exclude='node_modules/' \
  --exclude='data/' \
  --exclude='logs/' \
  --exclude='results/' \
  --exclude='.env' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX/' \
  "$WORKDIR/dex_voice_cloner/" "$PROJECT/"

cd "$PROJECT"

node --check public/app.js
find public/modules -name '*.js' -print -exec node --check {} \;
node --check server.js
find src -name '*.js' -print -exec node --check {} \;

npm test
```

## Real BigMac validation

```sh
ssh westcat 'whoami && hostname && pwd && sw_vers'
curl -fsS http://127.0.0.1:11435/v1/models | jq -r '.data[].id'
"/Users/andrew/Applications/BigMac Voice Tools.app/Contents/MacOS/launcher"
sleep 8
curl -fsS http://127.0.0.1:7870/api/health | jq .
lsof -nP -iTCP:7860 -iTCP:7870 -sTCP:LISTEN || true
lsof -nP -iTCP:7873 -sTCP:LISTEN || true
curl -i "http://127.0.0.1:7870/api/audio?path=/tmp/not-allowed.wav"
```

Expected:

- SSH first two lines are `bigmac` and `bigmac`.
- `7870` wrapper is healthy.
- `7860` Chatterbox tunnel is listening.
- `7873` is not required for normal use.
- Bad audio path returns `403`.

## Manual browser validation

Open:

`http://127.0.0.1:7870`

Check:

1. Command Center appears first.
2. Degraded stack banner appears only when health is degraded.
3. Copy relaunch command works.
4. Left sidebar navigation works.
5. Drama Studio workflow stepper switches active steps.
6. Workflow readiness cards update.
7. Right inspector shows project/scene/take readiness context.
8. Activity drawer shows current state/errors.
9. Voice Library still saves voices.
10. Test voice render still works.
11. Drama Studio still parses, binds, renders, reviews, previews, and exports.
12. Bulk take deletion still works.
13. Recent previews still load or fail softly inline.
14. Preview open/download/copy still works.
15. `/api/audio?path=/tmp/not-allowed.wav` returns `403`.

## Stage and commit

Stage only intentional files:

```sh
git status --short
git diff --stat
git diff --name-only

git add \
  public/index.html \
  public/app.js \
  public/modules/dashboardView.js \
  public/modules/navigation.js \
  public/modules/state.js \
  public/modules/healthView.js \
  public/modules/audioDramaView.js \
  public/modules/audioDrama/previewAssembly.js \
  public/styles.css \
  tests/uiShell.test.js \
  UI_REWORK_PATCH_SUMMARY.md \
  UI_REWORK_CRITIQUE_APPLIED.md \
  NEXT_ANTIGRAVITY_UNPACK_PROMPT.md

git commit -m "Apply Studio Workspace UI critique pass"
git push origin "$(git branch --show-current)"
```

## Report back

Report:

1. Backup path.
2. Files changed.
3. Syntax check results.
4. Test results.
5. BigMac SSH route result.
6. Ollama tunnel result.
7. Launcher result.
8. Browser validation result.
9. `/api/audio` allowlist result.
10. Commit hash and push result.
11. Any blockers.
