// Lesson narration voice.
//
// The student picks one voice in any voice menu (they all stay in sync):
//   natural:<id>  a Gemini TTS voice from /api/tts. A whole scene is requested
//                 at once (the free tier allows 3 requests a minute), ahead of
//                 time, and the server says where each line starts and ends so
//                 a line plays in step with its frame.
//   device:<name> one of the browser's own voices, read one sentence at a time.
//   off           no voice; subtitles only.
// The natural voice falls back to the best device voice by itself when the
// server has no voice, the quota runs out, or a scene is not ready in time.
(() => {
  const $ = id => document.getElementById(id);
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const V = {
    choice: pref('nl.voiceChoice') || 'natural:Kore', style: pref('nl.voiceStyle') || 'professor',
    natural: null, reason: '', rpm: 3,
    voices: [{ id: 'Kore', description: 'Firm' }], styles: [{ id: 'professor', label: 'Patient professor' }],
    chunks: new Map(), byLine: new Map(), queue: [], sent: [], holdUntil: 0, timer: 0, current: null,
  };
  const WAIT_FIRST = 14000, WAIT_NEXT = 9000, MAX_CHUNKS = 40;
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const kind = () => V.choice.split(':')[0];
  const naturalVoice = () => (kind() === 'natural' ? V.choice.slice(8) : null);
  const naturalOn = () => kind() === 'natural' && V.natural !== false;

  // ---------- saved voice lines ----------
  // Every scene of natural voice is kept in this browser (IndexedDB), so a
  // replay, a saved lecture or a repeated lesson plays it without asking the
  // server again and without using the daily voice quota. Oldest go first
  // past KEEP scenes.
  const KEEP = 80; // about 1 MB of audio per scene
  const store = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open('nl-voice', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('scenes');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('scenes', mode), q = fn(t.objectStore('scenes'));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    function prune() {
      return run('readwrite', s => {
        const all = [];
        const c = s.openCursor();
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) { all.push([cur.key, cur.value.at || 0]); cur.continue(); return; }
          if (all.length > KEEP) all.sort((a, b) => a[1] - b[1]).slice(0, all.length - KEEP).forEach(([k]) => s.delete(k));
        };
      }).catch(() => {});
    }
    let writes = 0;
    return {
      get: key => run('readonly', s => s.get(key)).catch(() => null),
      put: (key, blob, segments) => run('readwrite', s => s.put({ blob, segments, at: Date.now() }, key)).then(() => { if (++writes % 10 === 1) prune(); }).catch(() => {}),
    };
  })();

  // ---------- natural voice: scene audio, paced to the plan's rate limit ----------
  function schedule() {
    clearTimeout(V.timer);
    if (!V.queue.length || V.natural === false) return;
    const now = Date.now();
    V.sent = V.sent.filter(t => now - t < 60000);
    const wait = Math.max(V.holdUntil - now, V.sent.length >= V.rpm ? V.sent[0] + 60500 - now : 0);
    if (wait > 0) { V.timer = setTimeout(schedule, wait); return; }
    send(V.queue.shift());
    schedule();
  }
  function send(chunk) {
    V.sent.push(Date.now()); chunk.state = 'loading';
    fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: chunk.lines, voice: chunk.voice, style: chunk.style }) })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw Object.assign(new Error(e.error || `Voice failed (${r.status})`), { status: r.status, retryAfter: e.retryAfter, daily: e.daily }); }
        const segments = JSON.parse(r.headers.get('x-segments') || '[]'), blob = await r.blob();
        store.put(chunk.key, blob, segments);
        return { url: URL.createObjectURL(blob), segments };
      })
      .then(res => { chunk.state = 'ready'; chunk.resolve(res); }, e => {
        if (e.status === 429 && !e.daily) {
          // Rate limited: wait as told, then try this scene again.
          V.holdUntil = Date.now() + (e.retryAfter || 30) * 1000;
          chunk.state = 'queued'; V.queue.unshift(chunk); schedule();
          return;
        }
        if ([429, 503, 413].includes(e.status)) { V.natural = false; V.reason = e.message.replace(/\.$/, ''); status(`Using this device's voice: ${V.reason}.`); sync(); }
        chunk.state = 'failed'; chunk.reject(e);
      });
  }
  // Asks for the audio of upcoming groups of lines (usually scenes), most
  // urgent first. Cheap to call often; a group already requested is skipped.
  function prefetch(groups) {
    if (!naturalOn() || V.natural === null) return;
    const voice = naturalVoice(), style = V.style;
    groups.map(g => g.map(norm).filter(Boolean)).filter(g => g.length).forEach((lines, order) => {
      for (let i = 0; i < lines.length; i += 12) {
        const part = lines.slice(i, i + 12), key = `${voice}|${style}|${part.join('␞')}`;
        let chunk = V.chunks.get(key);
        if (!chunk) {
          chunk = { key, lines: part, voice, style, state: 'checking' };
          chunk.promise = new Promise((resolve, reject) => { chunk.resolve = resolve; chunk.reject = reject; });
          chunk.promise.catch(() => {});
          V.chunks.set(key, chunk);
          part.forEach((text, index) => V.byLine.set(`${voice}|${style}|${text}`, { key, index }));
          const urgent = order === 0 && i === 0;
          store.get(key).then(hit => {
            if (hit && hit.blob) { chunk.state = 'ready'; chunk.saved = true; chunk.resolve({ url: URL.createObjectURL(hit.blob), segments: hit.segments || [] }); return; }
            chunk.state = 'queued';
            if (urgent) V.queue.unshift(chunk); else V.queue.push(chunk);
            schedule();
          });
        }
        // The scene playing now jumps the queue.
        if (order === 0 && i === 0 && chunk.state === 'queued') V.queue = [chunk, ...V.queue.filter(c => c !== chunk)];
      }
    });
    while (V.chunks.size > MAX_CHUNKS) {
      const [k, old] = V.chunks.entries().next().value;
      V.chunks.delete(k); old.promise.then(r => URL.revokeObjectURL(r.url)).catch(() => {});
    }
    schedule();
  }
  const hasLine = text => naturalOn() && V.byLine.has(`${naturalVoice()}|${V.style}|${norm(text)}`);

  function playSegment(res, index, rate, onProgress) {
    const [from, to] = res.segments[index] || [0, Infinity];
    return new Promise(resolve => {
      const a = new Audio(res.url);
      a.playbackRate = rate; a.preservesPitch = true;
      let ended = false, raf = 0;
      const fin = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); a.pause(); onProgress(1); V.current = null; resolve(); };
      const watch = () => {
        if (ended) return;
        const end = Math.min(to, a.duration || to);
        if (a.currentTime >= end - 0.02) return fin();
        onProgress((a.currentTime - from) / Math.max(0.1, end - from));
        raf = requestAnimationFrame(watch);
      };
      V.current = { stop: fin, pause() { a.pause(); cancelAnimationFrame(raf); }, resume() { a.play().then(watch, fin); } };
      a.onended = fin; a.onerror = fin;
      a.addEventListener('loadedmetadata', () => { a.currentTime = from; a.play().then(watch, fin); }, { once: true });
    });
  }

  // ---------- device voice ----------
  const QUALITY = [/natural/i, /neural/i, /premium|enhanced/i, /^google/i, /samantha|daniel|karen|moira|serena|rishi|veena/i];
  const ROBOTIC = /microsoft (david|zira|mark|hazel|george|ravi|heera)|espeak|desktop/i;
  function rank(v) {
    let s = 0;
    QUALITY.forEach((re, i) => { if (re.test(v.name)) s += 50 - i * 6; });
    if (ROBOTIC.test(v.name)) s -= 40;
    if (/^en-(IN|GB|US|AU)/i.test(v.lang)) s += 12; else if (/^en/i.test(v.lang)) s += 6; else s -= 100;
    if (/^en-IN/i.test(v.lang)) s += 4;
    if (!v.localService) s += 5;
    return s;
  }
  function deviceVoices() { return synth ? synth.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => rank(b) - rank(a)) : []; }
  function deviceVoice() { const vs = deviceVoices(), name = kind() === 'device' ? V.choice.slice(7) : ''; return vs.find(v => v.name === name) || vs[0] || null; }
  const sentences = text => (String(text).match(/[^.!?]+[.!?]*(\s+|$)/g) || [text]).map(s => s.trim()).filter(Boolean);

  function speakDevice(text, rate, onProgress) {
    return new Promise(resolve => {
      if (!synth) return resolve();
      const parts = sentences(text), total = text.length || 1, voice = deviceVoice();
      let done = 0, i = 0, stopped = false;
      V.current = { stop() { stopped = true; try { synth.cancel(); } catch {} resolve(); }, pause() { try { synth.pause(); } catch {} }, resume() { try { synth.resume(); } catch {} } };
      try { synth.cancel(); } catch {}
      const next = () => {
        if (stopped) return;
        if (i >= parts.length) { onProgress(1); V.current = null; return resolve(); }
        const part = parts[i++], u = new SpeechSynthesisUtterance(part);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = Math.max(0.6, Math.min(1.6, rate * 0.96)); u.pitch = 1;
        u.onboundary = e => onProgress((done + (e.charIndex || 0)) / total);
        u.onend = () => { done += part.length + 1; onProgress(done / total); setTimeout(next, 140); };
        u.onerror = () => { done += part.length + 1; next(); };
        synth.speak(u);
      };
      next();
    });
  }

  // ---------- public ----------
  // Resolves when the line has been spoken (or stopped).
  async function speak(text, { rate = 1, onProgress = () => {}, onWait = () => {} } = {}) {
    stop();
    if (V.choice === 'off') return;
    const where = naturalOn() && V.byLine.get(`${naturalVoice()}|${V.style}|${norm(text)}`), chunk = where && V.chunks.get(where.key);
    if (chunk && chunk.state !== 'failed') {
      if (chunk.state !== 'ready') onWait(true);
      let res = null;
      try { res = await Promise.race([chunk.promise, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), where.index === 0 ? WAIT_FIRST : WAIT_NEXT))]); } catch {}
      onWait(false);
      if (res) return playSegment(res, where.index, rate, onProgress);
    }
    return speakDevice(text, rate, onProgress);
  }
  function stop() { if (V.current) { const c = V.current; V.current = null; c.stop(); } }
  function pause() { V.current?.pause?.(); }
  function resume() { V.current?.resume?.(); }
  const status = t => { if (typeof chatStatus === 'function') chatStatus(t); document.dispatchEvent(new CustomEvent('nl:notify', { detail: { text: t, kind: 'warn' } })); };

  // ---------- voice menus ----------
  function setChoice(choice) {
    V.choice = choice || 'natural:Kore'; pref('nl.voiceChoice', V.choice);
    const t = $('voiceToggle'); if (t) t.checked = V.choice !== 'off';
    stop(); sync();
  }
  function setStyle(style) { V.style = style; pref('nl.voiceStyle', style); sync(); }
  const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });
  function fillPick(sel) {
    const nat = document.createElement('optgroup');
    nat.label = V.natural === false ? `Natural voices (unavailable: ${V.reason || 'not configured'})` : 'Natural voices (Gemini)';
    V.voices.forEach(v => nat.append(option(`natural:${v.id}`, `${v.id}: ${v.description.toLowerCase()}`)));
    const dev = document.createElement('optgroup'); dev.label = 'Voices on this device';
    deviceVoices().forEach(v => dev.append(option(`device:${v.name}`, v.name.replace(/^Microsoft |^Google /, m => m) + ` (${v.lang})`)));
    const off = document.createElement('optgroup'); off.label = 'No voice';
    off.append(option('off', 'Subtitles only'));
    sel.replaceChildren(nat, ...(dev.childElementCount ? [dev] : []), off);
    sel.value = V.choice;
    if (sel.value !== V.choice) sel.value = `natural:${V.voices[0].id}`;
  }
  function sync() {
    document.querySelectorAll('select.voice-pick').forEach(fillPick);
    document.querySelectorAll('select.voice-style').forEach(sel => { sel.replaceChildren(...V.styles.map(s => option(s.id, s.label))); sel.value = V.style; });
    const t = $('voiceToggle'); if (t) t.checked = V.choice !== 'off';
    const n = $('voiceNote');
    if (n) n.textContent = V.natural === false ? `Natural voices are unavailable right now (${V.reason || 'the server has no voice configured'}). The best voice on this device is used instead.`
      : V.natural ? `Natural voices are ready. Your plan allows ${V.rpm} voice requests a minute; each scene uses one.` : 'Checking the natural voices…';
  }
  function sample() {
    const text = 'Hello. Let us trace this algorithm together, one step at a time.';
    if (naturalOn() && V.natural) { prefetch([[text]]); }
    speak(text, { rate: Number($('speed')?.value) || 1 });
  }

  fetch('/api/health').then(r => r.json()).then(h => {
    V.natural = !!h.voice; V.rpm = Number(h.voiceRpm) || 3;
    if (Array.isArray(h.voices) && h.voices.length) V.voices = h.voices;
    if (Array.isArray(h.styles) && h.styles.length) V.styles = h.styles;
    if (!h.voice) V.reason = 'the server has no voice configured';
  }).catch(() => { V.natural = false; V.reason = 'the server could not be reached'; }).finally(sync);
  if (synth) synth.onvoiceschanged = sync;
  document.addEventListener('change', e => {
    if (e.target.matches?.('select.voice-pick')) setChoice(e.target.value);
    else if (e.target.matches?.('select.voice-style')) setStyle(e.target.value);
    else if (e.target.id === 'voiceToggle') { if (!e.target.checked) setChoice('off'); else if (V.choice === 'off') setChoice(`natural:${V.voices[0].id}`); }
  });
  document.addEventListener('DOMContentLoaded', () => { sync(); $('voiceTest')?.addEventListener('click', sample); });
  window.Voice = {
    speak, stop, pause, resume, prefetch, hasLine, setChoice, sync, bestDeviceVoice: deviceVoice,
    get choice() { return V.choice; }, get naturalReady() { return V.natural; },
  };
})();
