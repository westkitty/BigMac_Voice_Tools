import { $, escapeHtml, state } from "../state.js";
import { api } from "../api.js";

// Determine status of a speaker name
export function getSpeakerStatus(speaker) {
  const mappedCharId = state.speakerMappings?.[speaker];
  let character = null;
  if (mappedCharId) {
    character = state.characters.find(c => c.id === mappedCharId);
  } else {
    // Exact or case-insensitive name match
    character = state.characters.find(c => c.name.toLowerCase() === speaker.toLowerCase());
  }

  if (character) {
    const voice = state.voices.find(v => v.id === character.voiceId);
    if (voice) {
      return { status: "Ready", character, voice };
    } else {
      return { status: "Missing voice", character, voice: null };
    }
  }

  if (speaker.toUpperCase() === "UNKNOWN") {
    return { status: "Unknown speaker", character: null, voice: null };
  }

  return { status: "Missing character", character: null, voice: null };
}

// Render the Speaker Voice Binding table/list
export function renderSpeakerMapping(onMappingChanged) {
  const container = $("speakerMappingList");
  if (!container) return;

  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene || !scene.lines || !scene.lines.length) {
    container.innerHTML = "No parsed lines yet.";
    container.classList.add("empty-state");
    return;
  }

  container.classList.remove("empty-state");
  const uniqueSpeakers = [...new Set(scene.lines.map(line => line.speaker.trim()))].filter(Boolean);

  if (!state.speakerMappings) {
    state.speakerMappings = {};
  }

  // Populate speakerMappings from scene lines if not already mapped
  for (const line of scene.lines) {
    if (line.characterId && line.speaker && !state.speakerMappings[line.speaker]) {
      state.speakerMappings[line.speaker] = line.characterId;
    }
  }

  container.innerHTML = `
    <table class="speaker-mapping-table">
      <thead>
        <tr>
          <th>Parsed Speaker</th>
          <th>Mapped Character</th>
          <th>Reference Voice</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${uniqueSpeakers.map((speaker) => {
          const { status, character, voice } = getSpeakerStatus(speaker);
          
          let badgeClass = "badge-error";
          if (status === "Ready") badgeClass = "badge-success";
          else if (status === "Missing voice") badgeClass = "badge-warning";
          else if (status === "Missing character") badgeClass = "badge-warning";

          const dropdownOptions = `
            <option value="">(Select character...)</option>
            <option value="CREATE_NEW">[Create character "${escapeHtml(speaker)}"]</option>
            ${state.characters.map((c) => {
              const vName = state.voices.find(v => v.id === c.voiceId)?.name || "no voice";
              const isSelected = character && character.id === c.id;
              return `<option value="${escapeHtml(c.id)}" ${isSelected ? "selected" : ""}>
                ${escapeHtml(c.name)} (Voice: ${escapeHtml(vName)})
              </option>`;
            }).join("")}
          `;

          const voiceName = voice ? voice.name : (character ? "<span class='warning-text'>No voice</span>" : "-");

          return `
            <tr data-speaker="${escapeHtml(speaker)}">
              <td><strong>${escapeHtml(speaker)}</strong></td>
              <td>
                <select class="speaker-char-select reactive-select" data-speaker="${escapeHtml(speaker)}">
                  ${dropdownOptions}
                </select>
              </td>
              <td>${voiceName}</td>
              <td><span class="status-badge ${badgeClass}">${status}</span></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  // Bind change events to the dropdowns
  container.querySelectorAll(".speaker-char-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const speaker = event.target.dataset.speaker;
      const val = event.target.value;
      if (val === "CREATE_NEW") {
        await handleQuickCreateCharacter(speaker, onMappingChanged);
      } else {
        state.speakerMappings[speaker] = val;
        // propagate voiceId and characterId to lines in active parsedScript or scene
        propagateMappingsToLines();
        if (onMappingChanged) await onMappingChanged();
      }
    });
  });
}

// Help create character inline and map it
async function handleQuickCreateCharacter(speaker, onMappingChanged) {
  const projectId = $("projectSelect").value;
  if (!projectId) return;

  const defaultVoiceId = $("characterVoice").value || "";
  try {
    const { character } = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        name: speaker,
        voiceId: defaultVoiceId,
        preferredEngine: "chatterbox",
        delivery: ""
      })
    });

    state.speakerMappings[speaker] = character.id;
    propagateMappingsToLines();
    if (onMappingChanged) await onMappingChanged();
  } catch (error) {
    console.error("Failed to quick create character", error);
  }
}

export function propagateMappingsToLines() {
  const scene = state.parsedScript?.scenes?.[0] || state.scenes?.[0];
  if (!scene || !scene.lines) return;

  for (const line of scene.lines) {
    const { character, voice } = getSpeakerStatus(line.speaker);
    if (character) {
      line.characterId = character.id;
      line.voiceId = character.voiceId || "";
    } else {
      line.characterId = "";
      line.voiceId = "";
    }
  }
}
