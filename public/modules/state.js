export const SPEAKER_COLORS = [
  { css: "var(--violet)", hex: "#b28cff" },
  { css: "var(--cyan)", hex: "#64e7ff" },
  { css: "var(--green)", hex: "#7dffa8" },
  { css: "var(--amber)", hex: "#ffd166" }
];

export const state = {
  voices: [],
  takes: [],
  projects: [],
  characters: [],
  scenes: [],
  parsedScript: null,
  parserModels: [],
  parserModel: "auto",
  currentSceneId: "",
  selectedVoiceId: null,
  advanced: false,
  captureMode: "upload",
  speakerCount: 2,
  showPreview: false,
  recorder: null,
  recordedBlob: null,
  recordStream: null,
  selectedTakeIds: new Set(),
  activeView: "dashboardView",
  activeDramaStep: "script",
  uiErrors: [],
  lastHealth: null,
  lastParser: null,
  lastQueueSummary: null
};

export const helpContent = {
  global: {
    title: "Studio help",
    body: [
      "Save or record voices in the right rail, write or import a script on the left, then generate either a single take or a multi-character conversation.",
      "Use Tune syntax before generation when text came from a document, notes app, or copy-paste source. It adds pause-friendly line breaks and expands common acronyms."
    ]
  },
  script: {
    title: "Script tips",
    body: [
      "Short sentences and clear punctuation usually produce cleaner timing.",
      "Use Name: dialogue lines for conversations, such as Ava: Hello there.",
      "Use Format document after uploading plain text or Markdown to collapse messy line breaks into speech-ready paragraphs."
    ]
  },
  voice: {
    title: "Voice capture tips",
    body: [
      "Upload works best with a clean WAV, MP3, M4A, or FLAC sample.",
      "Record works directly in the browser. Keep the sample short, close-mic, and mostly free of room noise."
    ]
  },
  characters: {
    title: "Conversation voices",
    body: [
      "Set one to four character slots. Each slot has a speaker name and a saved voice.",
      "Conversation generation uses lines like Ava: Text here. Lines without a name use the first character."
    ]
  },
  outputs: {
    title: "Outputs",
    body: [
      "Each generated take gets a card with a waveform, audio player, copy-path action, and delete action.",
      "Open Big Mac output folder opens the actual Chatterbox output directory on Big Mac."
    ]
  }
};

export function $(id) {
  return document.getElementById(id);
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function pushUiError(source, error) {
  const message = error?.message || String(error || "Unknown error");
  state.uiErrors = [{ source, message, createdAt: new Date().toISOString() }, ...state.uiErrors].slice(0, 10);
}

export function setMessage(text, type = "") {
  const element = $("message");
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

export function setDramaStatus(value) {
  const element = $("dramaStatus");
  if (!element) return;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  element.textContent = text;
}
