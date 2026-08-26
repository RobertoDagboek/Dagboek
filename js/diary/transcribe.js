import { settings, openAIKey } from '../core/config.js';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI audio upload limit

// The steering text. This is the single most important part for a South
// African speaker mixing Afrikaans and English in one sentence: the model
// copies the *style* of this text, so it is deliberately written the way a
// real entry sounds, code-switching and all.
const STEER_AF = [
  "Persoonlike dagboekinskrywing uit Suid-Afrika.",
  "Die spreker praat Afrikaans en Engels deurmekaar in dieselfde sin, met 'n Suid-Afrikaanse aksent.",
  "Skryf woordeliks neer in die taal waarin dit gese is - moet niks vertaal nie.",
  "Voorbeeld van die styl: Vandag was 'n lang dag by die werk, ek het die whole morning aan die tekeninge gewerk, toe moes ek nog gou by die hardware store stop.",
].join(' ');

/** Build the model hint: house style + the user's own names and words. */
function buildPrompt(vocab) {
  const words = (vocab || '')
    .split(/[,\n]/)
    .map(w => w.trim())
    .filter(Boolean);
  let prompt = STEER_AF;
  if (words.length) {
    prompt += ` Eiename en woorde wat in hierdie opname kan voorkom: ${words.join(', ')}.`;
  }
  // whisper-1 only reads ~224 tokens of prompt; keep it well inside that.
  return prompt.slice(0, 850);
}

/**
 * Send a recorded blob to OpenAI and get text back.
 * @param {Blob} blob   audio from the Recorder
 * @param {string} ext  file extension matching the blob's container
 * @returns {Promise<string>}
 */
export async function transcribe(blob, ext = 'webm') {
  const s = settings();
  const apiKey = openAIKey();
  if (!apiKey) {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }
  if (blob.size > MAX_BYTES) {
    throw new Error('Die opname is te groot (>25MB). Neem korter stukke op.');
  }

  const form = new FormData();
  form.append('file', new File([blob], `dagboek.${ext}`, { type: blob.type || 'audio/webm' }));
  form.append('model', s.model || 'gpt-4o-transcribe');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  form.append('prompt', buildPrompt(s.vocab));
  // No `language` field when set to auto - forcing one language is what breaks
  // Afrikaans/English code-switching.
  if (s.sttLang) form.append('language', s.sttLang);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message || detail;
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }

  const data = await res.json();
  return (data.text || '').trim();
}
