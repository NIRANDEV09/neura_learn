// Shows the background fact check of the AI tutor's answers.
//
// After an explanation appears, it is sent to /api/factcheck without blocking
// anything. The result is attached under the answer: how many claims were
// checked, and every claim that is wrong or doubtful, with a correction.
// Flagged sentences are marked in the answer. In the lecture, a line that
// repeats a claim marked wrong is held back: the correction is said and shown
// instead. The review is done by a different model from the one that wrote
// the answer (the server picks it from the writer, sent as "writer").
(() => {
  const $ = id => document.getElementById(id);
  const F = { flags: [], writer: '' };
  // The model that wrote the latest answer (models.js and the stream report it).
  document.addEventListener('model:used', e => { if (e.detail && e.detail.used) F.writer = e.detail.used; });
  // Compare on words only: answers are markdown, quotes are plain text.
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const instant = () => !!$('instantToggle')?.checked;
  // Verified mode (the default) runs the fact check; Unverified skips it: fewer AI calls, nothing flagged.
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const enabled = () => pref('nl.verify') !== '0';
  function syncToggle() {
    const on = enabled(), t = $('verifyToggle'); if (!t) return;
    t.checked = on;
    $('verifyLabel').textContent = on ? 'Verified' : 'Unverified';
    $('verifyHint').textContent = on ? 'AI answers are fact-checked in the background' : 'Fact check is off: faster, but answers are not cross-checked';
    t.closest('.verifyrow')?.classList.toggle('off', !on);
  }
  document.addEventListener('DOMContentLoaded', () => {
    syncToggle();
    $('verifyToggle')?.addEventListener('change', e => {
      pref('nl.verify', e.target.checked ? '1' : '0'); syncToggle();
      if (!e.target.checked) F.flags = [];
      document.dispatchEvent(new CustomEvent('nl:notify', { detail: { text: e.target.checked ? 'Verified mode on: new AI answers are fact-checked.' : 'Unverified mode: AI answers are no longer fact-checked.', kind: e.target.checked ? 'ok' : 'warn' } }));
    });
  });

  async function post(body) {
    const r = await fetch('/api/factcheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Fact check failed (${r.status})`);
    return data;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  function render(box, res) {
    const bad = res.claims.filter(c => c.verdict !== 'ok'), n = res.counts.checked;
    box.replaceChildren();
    box.className = `factcheck ${bad.length ? (res.counts.wrong ? 'fc-wrong' : 'fc-doubt') : 'fc-ok'}`;
    const head = el('summary');
    // The rules only report problems; only the model review counts every claim.
    const rulesOnly = /^rules only/.test(res.reviewed);
    const title = rulesOnly
      ? (bad.length ? `Fact check: the rule checks found ${bad.length} ${bad.length === 1 ? 'problem' : 'problems'}` : 'Fact check: the rule checks found no problems')
      : !n ? 'Fact check: no checkable claims found' : bad.length ? `Fact check: ${bad.length} of ${n} claims need attention` : `Fact check: ${n} claims checked, none flagged`;
    head.append(el('span', 'fcmark', bad.length ? '!' : '✓'), el('span', '', title));
    box.append(head);
    const list = el('ul');
    bad.forEach(c => {
      const li = el('li');
      li.append(el('span', `fctag ${c.verdict}`, c.verdict === 'wrong' ? 'Wrong' : 'Check this'), el('q', '', c.quote));
      if (c.fix) li.append(el('p', 'fcfix', c.fix));
      if (c.why) li.append(el('p', 'fcwhy', c.why));
      list.append(li);
    });
    if (bad.length) box.append(list);
    box.append(el('p', 'fcnote', rulesOnly
      ? `Only the rule checks ran (arithmetic, known complexities, numbers in the lecture)${/failed/.test(res.reviewed) ? `: ${res.reviewed.replace(/^rules only \(|\)$/g, '')}` : instant() ? ', because Instant mode is on' : ''}. The AI review runs when a model is available.`
      : `Checked with ${res.reviewed}${res.reviewer ? ` by ${res.reviewer}${res.writer && res.writer !== res.reviewer ? `, a different model from the one that wrote the answer (${res.writer})` : ''}` : ''}. A claim is only marked wrong when two independent checks agree, or a rule proves it. Lecture lines marked wrong are replaced by the correction.`));
    if (bad.length) box.open = true;
  }
  // Marks flagged sentences inside the answer bubble.
  function mark(bubble, claims) {
    const parts = [...bubble.querySelectorAll('.sent, p, li')];
    claims.forEach(c => {
      const q = key(c.quote), hit = parts.find(p => key(p.textContent).includes(q)) || parts.find(p => key(p.textContent).length > 20 && q.includes(key(p.textContent)));
      if (hit) { hit.classList.add('fc-flagged', `fc-${c.verdict}`); hit.title = c.fix ? `Fact check: ${c.fix}` : 'Fact check: check this claim'; }
    });
  }

  async function run(topic, text, bubble) {
    if (!bubble || !text || !enabled()) return;
    const box = el('details', 'factcheck fc-running');
    box.append(el('summary', '', 'Checking the facts in the background…'));
    bubble.after(box);
    try {
      const res = await post({ topic, text, rulesOnly: instant(), writer: F.writer || undefined });
      F.flags = res.claims.filter(c => c.verdict !== 'ok');
      render(box, res);
      mark(bubble, F.flags);
      if (F.flags.length) document.dispatchEvent(new CustomEvent('nl:notify', { detail: { text: `Fact check flagged ${F.flags.length} ${F.flags.length === 1 ? 'claim' : 'claims'} in the answer about “${String(topic).slice(0, 60)}”.`, kind: 'warn' } }));
    } catch (e) {
      box.className = 'factcheck fc-doubt';
      box.replaceChildren(el('summary', '', `Fact check could not run: ${e.message}`));
    }
  }
  // The lecture should say what the checked explanation says (or, for a PDF
  // lecture, what the document section says); rules only, no model call.
  async function checkLecture(explanation, lines, { source = false } = {}) {
    if (!explanation || !lines.length || !enabled()) return;
    try {
      const res = await post({ text: explanation, lines, rulesOnly: true, source });
      const extra = res.claims.filter(c => c.line && c.verdict !== 'ok');
      F.flags.push(...extra);
      if (!extra.length || typeof addChat !== 'function') return;
      const wrong = extra.filter(c => c.verdict === 'wrong').length, doubt = extra.length - wrong;
      const parts = [];
      if (wrong) parts.push(`${wrong} ${wrong === 1 ? 'line is' : 'lines are'} wrong and will be replaced by the correction as ${wrong === 1 ? 'it plays' : 'they play'}`);
      if (doubt) parts.push(`${doubt} ${doubt === 1 ? 'line is' : 'lines are'} marked "check this" in the subtitles${source ? ' (not found in your document)' : ''}`);
      addChat('bot', `Fact check on this lecture part: ${parts.join('; ')}.`);
    } catch {}
  }
  // The flag for a line, if that line repeats a flagged claim: { verdict, fix }.
  function flagFor(line) {
    if (!enabled()) return null;
    const l = key(line);
    const f = F.flags.find(c => { const q = key(c.quote); return q && (l.includes(q) || q.includes(l)); });
    return f ? { verdict: f.verdict, fix: f.fix || 'Check this line.' } : null;
  }
  window.FactCheck = { run, checkLecture, flagFor, get enabled() { return enabled(); } };
})();
