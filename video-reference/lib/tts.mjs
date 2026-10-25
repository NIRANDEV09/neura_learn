// Natural narration voice. Lesson lines are read aloud by a Gemini TTS voice
// instead of the browser's built-in speech engine, which sounds robotic on
// most Windows machines. The client falls back to the browser voice whenever
// this is unavailable (no key, quota used up, offline).
//
// A whole scene is synthesised in one request (the free tier allows only a few
// requests a minute), with a paragraph break between lines. The pauses in the
// audio are then found so each line can be played on its own, in step with its
// frame on the board.
//
// Uses the Interactions API: POST {base}/interactions with a TTS model. Unary
// responses carry a complete WAV file (24 kHz, mono, 16-bit) as base64.

// Prebuilt Gemini voices that suit teaching, with Google's own description of each.
export const VOICES = [
  ['Kore', 'Firm'], ['Charon', 'Informative'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm'],
  ['Achird', 'Friendly'], ['Iapetus', 'Clear'], ['Vindemiatrix', 'Gentle'], ['Gacrux', 'Mature'],
  ['Schedar', 'Even'], ['Puck', 'Upbeat'], ['Aoede', 'Breezy'], ['Rasalgethi', 'Informative'],
].map(([id, description]) => ({ id, description }));
const PAUSE = ' Pause briefly between paragraphs.';
export const STYLES = {
  professor: { label: 'Patient professor', text: 'A warm, patient university professor explaining an algorithm to one student at a whiteboard. Clear, unhurried and friendly.' + PAUSE },
  indian: { label: 'Indian English professor', text: 'A warm, articulate professor speaking clear Indian English, explaining an algorithm to an engineering student at a whiteboard. Unhurried and encouraging.' + PAUSE },
  energetic: { label: 'Energetic tutor', text: 'An energetic, encouraging tutor who sounds genuinely excited about the idea. Brisk but always clear.' + PAUSE },
  calm: { label: 'Calm and slow', text: 'A calm teacher speaking slowly and very clearly to a beginner, with generous pauses after each idea.' + PAUSE },
};
const MAX_LINE = 420, MAX_LINES = 14, MAX_TOTAL = 2400;
const cache = new Map(); // key -> Promise<{wav, segments}>, most recent last
const CACHE_SIZE = 200;

export function ttsConfig(env = process.env) {
  const provider = (env.LLM_PROVIDER || 'ollama').toLowerCase();
  const key = env.GEMINI_API_KEY || '';
  return {
    enabled: env.TTS_PROVIDER !== 'off' && !!key && (provider === 'gemini' || env.TTS_PROVIDER === 'gemini'),
    key,
    base: (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    model: env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
    voice: env.GEMINI_TTS_VOICE || 'Kore',
    rpm: Math.max(1, Number(env.GEMINI_TTS_RPM) || 3),
  };
}

// Finds the base64 audio in either response shape the API documents.
function audioFrom(data) {
  if (data?.output_audio?.data) return data.output_audio.data;
  for (const step of [...(data?.steps || [])].reverse()) {
    if (step.type !== 'model_output') continue;
    const audio = [...(step.content || [])].reverse().find(c => c.type === 'audio' && c.data);
    if (audio) return audio.data;
  }
  return null;
}

// Raw 16-bit PCM gets a WAV header so every browser can play it.
function asWav(buf) {
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return buf;
  const h = Buffer.alloc(44), rate = 24000;
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}

function pcmOf(wav) {
  let off = 12, rate = 24000;
  while (off + 8 <= wav.length) {
    const id = wav.toString('ascii', off, off + 4), size = wav.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = wav.readUInt32LE(off + 12);
    if (id === 'data') { const start = off + 8; return { start, samples: Math.floor(Math.min(size, wav.length - start) / 2), rate }; }
    off += 8 + size + (size % 2);
  }
  return { start: 44, samples: Math.floor((wav.length - 44) / 2), rate };
}

// Splits the audio of several lines into one [start, end] (seconds) per line.
// Expected boundaries come from each line's share of the text; each one then
// snaps to the nearest real pause in the audio, so lines are not cut mid-word.
export function segment(wav, lines) {
  const { start, samples, rate } = pcmOf(wav), dur = samples / rate;
  if (lines.length < 2) return [[0, dur]];
  const win = Math.max(1, Math.round(rate * 0.02)), energy = [];
  for (let i = 0; i + win <= samples; i += win) {
    let sum = 0;
    for (let j = 0; j < win; j++) { const v = wav.readInt16LE(start + 2 * (i + j)); sum += v * v; }
    energy.push(Math.sqrt(sum / win));
  }
  const sorted = [...energy].sort((a, b) => a - b), loud = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const quiet = Math.max(120, loud * 0.05), step = win / rate;
  const pauses = []; let s = -1;
  energy.forEach((e, k) => {
    if (e < quiet) { if (s < 0) s = k; }
    else if (s >= 0) { if (k - s >= 7) pauses.push((s + k) / 2 * step); s = -1; }
  });
  const weights = lines.map(l => l.length + 14), total = weights.reduce((a, b) => a + b, 0);
  const cuts = []; let acc = 0, prev = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    acc += weights[i];
    const expected = dur * acc / total, reach = Math.max(1.2, dur * weights[i] / total * 0.45);
    const near = pauses.filter(p => p > prev + 0.3 && Math.abs(p - expected) <= reach).sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
    prev = near ?? Math.max(expected, prev + 0.3);
    cuts.push(prev);
  }
  return [0, ...cuts].map((c, i) => [Number(c.toFixed(3)), Number((i < cuts.length ? cuts[i] : dur).toFixed(3))]);
}

// lines: one or more lesson lines. Resolves to { wav, segments }.
// options: { voice, style } chosen by the student; anything unknown falls back to the defaults.
export async function synthesize(lines, config = ttsConfig(), fetchImpl = fetch, options = {}) {
  const voice = VOICES.some(v => v.id === options.voice) ? options.voice : config.voice;
  const style = STYLES[options.style] ? options.style : 'professor';
  const list = (Array.isArray(lines) ? lines : [lines]).map(l => String(l ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!list.length) throw Object.assign(new Error('Text is required.'), { status: 400 });
  if (list.length > MAX_LINES || list.some(l => l.length > MAX_LINE) || list.join(' ').length > MAX_TOTAL) throw Object.assign(new Error(`Too much text for one request (up to ${MAX_LINES} lines of ${MAX_LINE} characters).`), { status: 413 });
  if (!config.enabled) throw Object.assign(new Error('Natural voice needs LLM_PROVIDER=gemini and a GEMINI_API_KEY.'), { status: 503 });
  const key = `${config.model}|${voice}|${style}|${list.join('\n')}`;
  if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
  const job = (async () => {
    let r;
    try {
      r = await fetchImpl(`${config.base}/interactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
        body: JSON.stringify({
          model: config.model,
          input: [{ type: 'user_input', content: [{ type: 'text', text: list.join('\n\n'), annotations: [{ type: 'speech_metadata', style: STYLES[style].text }] }] }],
          response_format: { type: 'audio', mime_type: 'audio/wav' },
          generation_config: { speech_config: [{ voice }] },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) { throw Object.assign(new Error(`Voice request failed: ${e.message}`), { status: 503 }); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data.error?.message || `HTTP ${r.status}`;
      if (r.status === 429) {
        const wait = Number((msg.match(/retry in (\d+(?:\.\d+)?)s/i) || [])[1]) || 30;
        throw Object.assign(new Error(/per day|daily/i.test(msg) ? 'The natural voice daily quota is used up.' : 'The natural voice is rate limited for a moment.'), { status: 429, retryAfter: Math.ceil(wait), daily: /per day|daily/i.test(msg) });
      }
      throw Object.assign(new Error(`The voice service refused the request: ${msg}`), { status: 502 });
    }
    const b64 = audioFrom(data);
    if (!b64) throw Object.assign(new Error('The voice service returned no audio.'), { status: 502 });
    const wav = asWav(Buffer.from(b64, 'base64'));
    return { wav, segments: segment(wav, list) };
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return job;
}
