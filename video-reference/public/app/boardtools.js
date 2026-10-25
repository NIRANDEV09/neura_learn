// Board tools around the lesson player: the Whiteboard / Code / Notes tabs,
// zoom and full screen, the drawing tools, the steps panel and key points,
// the timeline (elapsed / total, seek) and the scene arrows.
// Everything here follows the computed player through its events
// (computed:load, computed:beat, computed:checkpoint) and never draws frames.
(() => {
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const B = { lesson: null, si: 0, bi: 0, idx: null, tab: 'board', tool: 'select', color: '#5b5bf0', beatAt: 0, timeline: null };
  const topic = id => (window.Shell && Shell.topicInfo ? Shell.topicInfo(id) : null);

  // ---------- buttons other scripts relabel with text get icons ----------
  function iconize(btn, pick) {
    if (!btn) return;
    const draw = () => {
      if (btn.querySelector('.ic')) return;
      const label = btn.textContent.trim();
      btn.setAttribute('aria-label', label.replace(/^[^A-Za-z]+/, '') || 'Play');
      btn.title = btn.getAttribute('aria-label');
      btn.innerHTML = `<svg class="ic"><use href="#i-${pick(label)}"/></svg>`;
    };
    new MutationObserver(draw).observe(btn, { childList: true, characterData: true, subtree: true });
    draw();
  }
  iconize($('playBtn'), l => (/pause|Ⅱ/i.test(l) ? 'pause' : /replay|↺/i.test(l) ? 'replay' : 'play'));
  iconize($('chatSend'), l => (l === '…' ? 'clock' : 'send'));

  // ---------- tabs ----------
  function setTab(tab) {
    B.tab = tab;
    document.querySelectorAll('.tabs [data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    $('toolRail').hidden = tab !== 'board';
    if (tab === 'code') renderCode();
    if (tab === 'notes') renderNotes();
  }
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ---------- zoom and full screen ----------
  function setZoom(z) {
    $('zoomSel').value = String(z);
    $('board').style.width = `${z * 100}%`;
    $('boardWrap').classList.toggle('zoomed', z > 1);
  }
  $('zoomSel').addEventListener('change', e => setZoom(Number(e.target.value)));
  $('zoomBtn').addEventListener('click', () => { const steps = [0.75, 1, 1.25, 1.5], i = steps.indexOf(Number($('zoomSel').value)); setZoom(steps[(i + 1) % steps.length]); });
  $('fullBtn').addEventListener('click', () => {
    const card = $('boardCard');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (card.requestFullscreen) card.requestFullscreen().catch(() => {});
  });

  // ---------- drawing tools ----------
  const ink = $('inkLayer');
  let shape = null, start = null, typing = null;
  const point = e => { const p = ink.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(ink.getScreenCTM().inverse()); };
  function setTool(tool) {
    commitText();
    B.tool = tool;
    document.querySelectorAll('#toolRail [data-tool]').forEach(b => { const on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    ink.classList.toggle('active', tool !== 'select');
    ink.dataset.tool = tool;
    // Drawing on a moving board is hard: pause the lesson while a tool is out.
    if (tool !== 'select' && window.Computed && Computed.playing()) Computed.pause();
  }
  document.querySelectorAll('#toolRail [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('#toolRail [data-color]').forEach(b => b.addEventListener('click', () => {
    B.color = b.dataset.color;
    document.querySelectorAll('#toolRail [data-color]').forEach(x => x.classList.toggle('on', x === b));
    if (B.tool === 'select' || B.tool === 'eraser') setTool('pen');
  }));
  $('inkClear').addEventListener('click', () => { commitText(); ink.replaceChildren(); });
  const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  function eraseAt(e) {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (hit && hit !== ink && ink.contains(hit)) hit.remove();
  }
  ink.addEventListener('pointerdown', e => {
    if (B.tool === 'select') return;
    e.preventDefault();
    const p = point(e); start = p;
    if (B.tool === 'pen') { shape = svg('path', { d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`, class: 'inkstroke', stroke: B.color }); ink.append(shape); }
    else if (B.tool === 'circle') { shape = svg('ellipse', { cx: p.x, cy: p.y, rx: 0, ry: 0, class: 'inkstroke', stroke: B.color }); ink.append(shape); }
    else if (B.tool === 'eraser') eraseAt(e);
    else if (B.tool === 'text') { startText(e, p); return; }
    ink.setPointerCapture(e.pointerId);
  });
  ink.addEventListener('pointermove', e => {
    if (!start) return;
    if (B.tool === 'eraser') { eraseAt(e); return; }
    if (!shape) return;
    const p = point(e);
    if (B.tool === 'pen') shape.setAttribute('d', `${shape.getAttribute('d')} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    else if (B.tool === 'circle') {
      shape.setAttribute('cx', (start.x + p.x) / 2); shape.setAttribute('cy', (start.y + p.y) / 2);
      shape.setAttribute('rx', Math.abs(p.x - start.x) / 2); shape.setAttribute('ry', Math.abs(p.y - start.y) / 2);
    }
  });
  const end = () => { start = null; if (shape && shape.tagName === 'ellipse' && Number(shape.getAttribute('rx')) < 3) shape.remove(); shape = null; };
  ink.addEventListener('pointerup', end); ink.addEventListener('pointercancel', end);
  function startText(e, p) {
    commitText();
    const box = $('board').getBoundingClientRect(), input = el('input', 'inktext');
    input.type = 'text'; input.maxLength = 80; input.placeholder = 'Type, then press Enter';
    input.style.left = `${e.clientX - box.left}px`; input.style.top = `${e.clientY - box.top}px`; input.style.color = B.color;
    $('board').append(input); input.focus();
    typing = { input, p };
    input.addEventListener('keydown', k => { if (k.key === 'Enter') { k.preventDefault(); commitText(); } else if (k.key === 'Escape') { typing = null; input.remove(); } });
    input.addEventListener('blur', () => setTimeout(commitText, 0));
  }
  function commitText() {
    if (!typing) return;
    const { input, p } = typing; typing = null;
    const text = input.value.trim(); input.remove();
    if (text) { const t = svg('text', { x: p.x, y: p.y + 8, class: 'inklabel', fill: B.color }); t.textContent = text; ink.append(t); }
  }

  // ---------- steps panel, key points, code, notes ----------
  const COLORS = ['#5b5bf0', '#0ea5a4', '#3b82f6', '#f59e0b', '#ec4899', '#22a55b', '#8b5cf6', '#ef4444'];
  function resultLine(L, idx) {
    const st = idx === null || idx === undefined ? L.trace.initial : L.trace.steps[idx].state;
    if (Array.isArray(st.output) && st.output.length && typeof st.output[0] !== 'object') return ['Output so far', st.output.join('  ')];
    if (Array.isArray(st.arr)) return ['Array now', st.arr.join('  ')];
    if (Array.isArray(st.items)) return [L.visual.type === 'stack' ? 'Stack, bottom to top' : 'Queue, front to back', st.items.length ? st.items.map(i => i.v).join('  ') : 'empty'];
    if (Array.isArray(st.ret)) return ['Calls made', String(st.made)];
    return null;
  }
  function renderTrace() {
    const L = B.lesson; if (!L) return;
    const sc = L.scenes[B.si], t = topic(L.algorithm);
    $('traceTitle').textContent = t ? t.name : L.title;
    $('traceSub').textContent = sc.title;
    const list = $('traceList'); list.replaceChildren();
    sc.beats.forEach((b, j) => {
      const li = el('li', j === B.bi ? 'now' : j < B.bi ? 'past' : '');
      const n = el('span', 'tnum', String(j + 1)); n.style.setProperty('--c', COLORS[j % COLORS.length]);
      const btn = el('button', 'tline', b.say); btn.type = 'button';
      btn.addEventListener('click', () => window.Computed && Computed.jump(B.si, j));
      li.append(n, btn); list.append(li);
    });
    list.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
    const res = resultLine(L, B.idx), box = $('traceResult');
    box.hidden = !res;
    if (res) { box.replaceChildren(el('span', '', `${res[0]}:`), el('strong', 'mono', res[1])); }
  }
  function recapPoints(L) { return (L.scenes.find(s => s.kind === 'recap')?.beats || []).map(b => b.say); }
  function renderKeyPoints() {
    const L = B.lesson, t = topic(L.algorithm), list = $('keyList');
    list.replaceChildren();
    const pts = recapPoints(L).slice(1, 3);
    if (t) pts.push(`Time complexity: ${t.time}. Space complexity: ${t.space}.`);
    pts.forEach(p => list.append(el('li', '', p)));
    $('keyPoints').hidden = !pts.length;
  }
  function renderCode() {
    const view = $('codeView'); view.replaceChildren();
    const L = B.lesson, sample = L && window.CODE_SAMPLES && CODE_SAMPLES[L.algorithm];
    if (!sample) {
      $('codeNote').textContent = 'The Code tab follows library lessons, where every step comes from running real code.';
      view.append(el('span', 'hint', L ? 'No code is available for this lesson.' : 'Start a lesson from the library to see its code here.'));
      return;
    }
    const step = B.idx === null || B.idx === undefined ? null : L.trace.steps[B.idx];
    const raw = step ? sample.ops[step.op] : null, hl = new Set(raw === undefined || raw === null ? [] : [].concat(raw));
    $('codeNote').textContent = step ? `Step ${B.idx + 1}: ${step.fact}` : 'Play the lesson: the highlighted line is the code the current step runs.';
    sample.lines.forEach((line, i) => {
      const row = el('span', `cl${hl.has(i) ? ' hl' : ''}`);
      row.append(el('span', 'ln', String(i + 1)), el('span', 'lc', line || ' '));
      view.append(row);
    });
    view.querySelector('.hl')?.scrollIntoView({ block: 'nearest' });
  }
  function renderNotes() {
    const L = B.lesson, t = L && topic(L.algorithm);
    const pts = $('notesPoints'); pts.replaceChildren();
    (L ? recapPoints(L) : ['Start a lesson to collect its key points here.']).forEach(p => pts.append(el('li', '', p)));
    $('notesCost').textContent = t ? `Time ${t.time}, extra space ${t.space}.` : 'Shown for library lessons.';
    const key = `nl.notes.${L ? L.algorithm : 'tutor'}`;
    $('myNotes').value = pref(key) || '';
    $('myNotes').dataset.key = key;
  }
  let saveTimer = 0;
  $('myNotes').addEventListener('input', e => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const key = e.target.dataset.key || 'nl.notes.tutor', synced = !!(window.Account && Account.user);
      pref(key, e.target.value);
      if (synced) Account.pushNote(key.slice(9), e.target.value);
      $('myNotesSaved').textContent = synced ? 'Saved to your account.' : 'Saved in this browser.';
    }, 400);
  });
  document.addEventListener('computed:checkpoint', e => {
    const c = e.detail;
    $('notesCheck').textContent = c.right ? `You answered ${c.answer}. Correct.` : `You answered ${c.chosen}. The answer is ${c.answer}.`;
  });

  // ---------- timeline: elapsed / total, seek, scene arrows ----------
  const words = s => String(s).split(/\s+/).filter(Boolean).length;
  const secs = say => words(say) / 2.6 + 0.6;
  const clock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function buildTimeline() {
    const L = B.lesson, rate = Number($('speed').value) || 1, beats = [];
    let t = 0;
    (window.Computed ? Computed.playable() : []).forEach(si => L.scenes[si].beats.forEach((b, bi) => { const d = secs(b.say) / rate; beats.push({ si, bi, at: t, d }); t += d; }));
    B.timeline = { beats, total: t };
  }
  function showTime(extra = 0) {
    const tl = B.timeline; if (!tl || !tl.beats.length) return;
    const cur = tl.beats.find(b => b.si === B.si && b.bi === B.bi) || tl.beats[0];
    const now = Math.min(cur.at + Math.min(extra, cur.d), tl.total);
    $('timeNow').textContent = clock(now); $('timeTotal').textContent = clock(tl.total);
    if (!B.seeking) $('seek').value = String(Math.round((now / tl.total) * 1000));
  }
  setInterval(() => { if (B.lesson && window.Computed && Computed.playing()) showTime((performance.now() - B.beatAt) / 1000); }, 500);
  $('seek').addEventListener('input', () => {
    B.seeking = true;
    const tl = B.timeline; if (!tl) return;
    $('timeNow').textContent = clock((Number($('seek').value) / 1000) * tl.total);
  });
  $('seek').addEventListener('change', () => {
    B.seeking = false;
    const tl = B.timeline; if (!tl || !window.Computed) return;
    const t = (Number($('seek').value) / 1000) * tl.total;
    const b = [...tl.beats].reverse().find(x => x.at <= t) || tl.beats[0];
    Computed.jump(b.si, b.bi);
  });
  $('speed').addEventListener('change', () => { if (B.lesson) { buildTimeline(); showTime(); } });
  function sceneStep(dir) {
    if (!window.Computed || !B.lesson) return;
    const list = Computed.playable(), at = list.indexOf(B.si), next = list[at + dir];
    if (next !== undefined) Computed.jump(next, 0);
  }
  $('prevScene').addEventListener('click', () => sceneStep(-1));
  $('nextScene').addEventListener('click', () => sceneStep(1));

  // ---------- voice on/off button ----------
  function syncMute() {
    const on = $('voiceToggle').checked;
    $('muteBtn').innerHTML = `<svg class="ic"><use href="#i-${on ? 'vol' : 'mute'}"/></svg>`;
    $('muteBtn').setAttribute('aria-label', on ? 'Mute voice' : 'Turn voice on');
  }
  $('muteBtn').addEventListener('click', () => { const t = $('voiceToggle'); t.checked = !t.checked; t.dispatchEvent(new Event('change', { bubbles: true })); syncMute(); });
  $('voiceToggle').addEventListener('change', syncMute);
  document.addEventListener('change', e => { if (e.target.matches?.('select.voice-pick')) setTimeout(syncMute, 0); });
  setTimeout(syncMute, 300);

  // ---------- follow the player ----------
  document.addEventListener('computed:load', e => {
    B.lesson = e.detail.lesson; B.si = 0; B.bi = 0; B.idx = null;
    ink.replaceChildren();
    $('tracePanel').hidden = false; $('seek').disabled = false;
    ['prevScene', 'nextScene'].forEach(id => { $(id).disabled = false; });
    renderKeyPoints(); buildTimeline();
    if (B.tab === 'notes') renderNotes();
  });
  document.addEventListener('computed:beat', e => {
    const d = e.detail;
    const sceneCount = B.lesson ? Computed.playable().length : 0;
    B.lesson = d.lesson; B.si = d.si; B.bi = d.bi; B.idx = d.idx; B.beatAt = performance.now();
    if (Computed.playable().length !== sceneCount || !B.timeline) buildTimeline();
    renderTrace(); showTime();
    if (B.tab === 'code') renderCode();
  });
  // The AI tutor's lectures have no recorded trace: hide what only computed lessons have.
  function reset() {
    B.lesson = null; B.timeline = null;
    $('tracePanel').hidden = true; $('keyPoints').hidden = true; $('seek').disabled = true; $('seek').value = '0';
    $('timeNow').textContent = '0:00'; $('timeTotal').textContent = '0:00';
    ['prevScene', 'nextScene'].forEach(id => { $(id).disabled = true; });
    if (B.tab === 'code') renderCode();
    if (B.tab === 'notes') renderNotes();
  }
  window.BoardTools = { reset, setTab };
})();
