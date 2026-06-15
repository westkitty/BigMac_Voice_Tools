import assert from "node:assert/strict";
import test from "node:test";

import { checkParagraphs, formatDocumentForSpeech, parseDialogue, tuneSyntaxForTts } from "../src/scriptTools.js";

test("syntax tuning expands acronyms and inserts pause-friendly line breaks", () => {
  const result = tuneSyntaxForTts("The API is ready — use the URL now");
  assert.match(result.text, /A P I/);
  assert.match(result.text, /U R L/);
  assert.match(result.text, /,/);
  assert.match(result.text, /\.$/);
});

test("paragraph check reports missing final punctuation", () => {
  const notes = checkParagraphs("This line has no period");
  assert(notes.includes("Final punctuation missing"));
});

test("document formatter converts blocks into speech-ready paragraphs", () => {
  const result = formatDocumentForSpeech("- First bullet about API\n- Second bullet\n\nNext paragraph");
  assert.match(result.text, /First bullet about A P I/);
  assert.match(result.text, /\n\n/);
  assert(result.notes.includes("Document formatted into speech-ready paragraphs"));
});

test("dialogue parser supports named speakers and fallback narration", () => {
  const turns = parseDialogue("Ava: Hello.\nBen: Hi.\nNo label here.", ["Ava", "Ben"]);
  assert.deepEqual(turns.map((turn) => turn.speaker), ["Ava", "Ben", "Ava"]);
  assert.equal(turns[2].text, "No label here.");
});
