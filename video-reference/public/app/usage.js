// Token counter. Every API answer that used a model reports its token counts
// and server time (the x-usage header, or the last line of a streamed answer);
// models.js and app.js turn those into "usage" events. One question can take
// several requests (the answer, each lecture part, the fact check), so they
// are added up under the message that started them, and into a total for this
// browser tab.
(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'nl.usage.session';
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode */ } };
  const blank = () => ({ calls: 0, in: 0, out: 0, think: 0, ms: 0, answers: 0 });
  let session = { ...blank(), ...load() }, current = null;

  const n = v => Math.round(v).toLocaleString();
  const secs = ms => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
  const total = u => u.in + u.out + u.think;

  function renderLine() {
    if (!current) return;
    const u = current, line = u.line;
    const parts = [`${n(total(u))} tokens`, `${n(u.in)} in`, `${n(u.out)} out`];
    if (u.think) parts.push(`${n(u.think)} thinking`);
    const time = [];
    if (u.first != null) time.push(`first text ${secs(u.first)}`);
    if (u.last != null) time.push(`${secs(u.last)} total`);
    line.textContent = '';
    const tok = document.createElement('span'); tok.textContent = parts.join(' · ');
    const tm = document.createElement('span'); tm.textContent = time.join(' · ');
    line.append(tok);
    if (time.length) line.append(tm);
    line.title = `${u.calls} model ${u.calls === 1 ? 'call' : 'calls'} for this message (answer, lecture parts and fact check). Model time added up: ${secs(u.ms)} (requests run in parallel, so this can be longer than the total).`;
    line.hidden = false;
  }
  function renderTotal() {
    const box = $('usageTotal'); if (!box) return;
    if (!session.calls) { box.hidden = true; return; }
    box.textContent = `This session: ${n(total(session))} tokens (${n(session.in)} in, ${n(session.out)} out${session.think ? `, ${n(session.think)} thinking` : ''}) · ${session.answers} ${session.answers === 1 ? 'answer' : 'answers'} · ${secs(session.ms)} of model time`;
    box.hidden = false;
  }

  // A new question: its counts go under the bot message element el.
  function begin(el) {
    if (!el) { current = null; return; }
    const line = document.createElement('div');
    line.className = 'usageline'; line.hidden = true;
    el.after(line);
    current = { ...blank(), el, line, t0: performance.now(), first: null, last: null };
    session.answers += 1; save(); renderTotal();
  }
  function firstText() {
    if (current && current.first == null) { current.first = performance.now() - current.t0; renderLine(); }
  }
  function add(u) {
    if (!u || !u.calls) return;
    for (const k of ['calls', 'in', 'out', 'think', 'ms']) session[k] += +u[k] || 0;
    save(); renderTotal();
    if (!current || !current.line.isConnected) return;
    for (const k of ['calls', 'in', 'out', 'think', 'ms']) current[k] += +u[k] || 0;
    current.last = performance.now() - current.t0;
    renderLine();
  }
  function reset() { session = blank(); save(); renderTotal(); }

  document.addEventListener('usage', e => add(e.detail));
  document.addEventListener('DOMContentLoaded', renderTotal);
  window.Usage = { begin, firstText, add, reset, get session() { return { ...session }; } };
})();
