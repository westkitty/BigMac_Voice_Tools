const acronymMap = new Map([
  ["AI", "A I"],
  ["API", "A P I"],
  ["URL", "U R L"],
  ["UI", "U I"],
  ["UX", "U X"],
  ["CPU", "C P U"],
  ["GPU", "G P U"],
  ["TTS", "T T S"]
]);

export function tuneSyntaxForTts(input) {
  const notes = [];
  let text = String(input || "").replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  const before = text;

  text = text
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\bvs\.\b/gi, "versus")
    .replace(/\be\.g\.\b/gi, "for example")
    .replace(/\bi\.e\.\b/gi, "that is");

  for (const [from, to] of acronymMap) {
    text = text.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }

  text = text.replace(/([.!?])\s+/g, "$1\n");
  text = text.split("\n").map((sentence) => {
    if (sentence.length < 180) return sentence;
    return sentence.replace(/,\s+/g, ",\n");
  }).join("\n");

  if (text && !/[.!?"]$/.test(text)) {
    text += ".";
    notes.push("Added final punctuation");
  }
  if (text !== before) notes.push("Normalized pauses, dashes, and common acronyms");
  notes.push("Used line breaks as pause cues");
  return { text, notes };
}

export function checkParagraphs(input) {
  const text = String(input || "");
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const notes = [];
  if (!paragraphs.length) return ["No text to check"];
  const longParagraphs = paragraphs.filter((part) => part.length > 450).length;
  const longSentences = (text.match(/[^.!?]{180,}[.!?]/g) || []).length;
  const missingEnd = /[A-Za-z0-9)]$/.test(text.trim());
  notes.push(`${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`);
  if (longParagraphs) notes.push(`${longParagraphs} long paragraph${longParagraphs === 1 ? "" : "s"} should be split`);
  if (longSentences) notes.push(`${longSentences} long sentence${longSentences === 1 ? "" : "s"} may need commas or line breaks`);
  if (missingEnd) notes.push("Final punctuation missing");
  if (notes.length === 1) notes.push("Paragraph structure looks usable");
  return notes;
}

export function formatDocumentForSpeech(input) {
  const raw = String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ");
  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block
      .split("\n")
      .map((line) => line.trim().replace(/^[-*]\s+/, ""))
      .filter(Boolean)
      .join(" "))
    .filter(Boolean);

  const tuned = blocks.map((block) => tuneSyntaxForTts(block).text).join("\n\n");
  const notes = checkParagraphs(tuned);
  notes.push("Document formatted into speech-ready paragraphs");
  return { text: tuned, notes };
}

export function parseDialogue(input, characterNames = []) {
  const names = characterNames.map((name, index) => String(name || `Character ${index + 1}`).trim());
  const defaultName = names[0] || "Character 1";
  return String(input || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{1,42}):\s*(.+)$/);
      if (!match) return { speaker: defaultName, text: line };
      const found = names.find((name) => name.toLowerCase() === match[1].trim().toLowerCase());
      return { speaker: found || match[1].trim(), text: match[2].trim() };
    })
    .filter((turn) => turn.text);
}
