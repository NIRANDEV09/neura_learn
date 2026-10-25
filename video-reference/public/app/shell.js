// App shell: the sidebar, the top bar, and the route between screens.
//
//   #/              Home: greeting, quick start, stats, continue, recommended
//   #/new           New lesson: search or pick any algorithm
//   #/library       My library: the curriculum by module
//   #/progress      Progress: stats, modules and recent lessons
//   #/pdf           PDF tutor (the AI tutor, ready for a PDF)
//   #/learn/<id>    Topic page: choose the input, check the plan, preview, start
//   #/lesson/<id>   Lesson player (computed.js) with the ask-a-question panel
//   #/done/<id>     Summary: checkpoint result, key points, what to do next
//   #/tutor         AI tutor for any other topic (app.js)
//
// The shell only arranges screens. Lessons are built by the server
// (/api/computed-lesson) and played by computed.js; nothing here draws frames.
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const icon = (name, cls = 'ic') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', cls); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `#i-${name}`); s.append(u); return s; };
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
  const S = { catalog: null, topics: new Map(), order: [], module: new Map(), lesson: null, request: null, pending: null, startPending: false, replayPending: false, done: null, build: 0, health: null, notes: [] };

  // ---------- per-browser progress ----------
  const progress = {
    all() { try { return JSON.parse(pref('nl.progress') || '{}'); } catch { return {}; } },
    save(id, rec) { const all = progress.all(); all[id] = { ...(all[id] || {}), ...rec }; pref('nl.progress', JSON.stringify(all)); if (window.Account) Account.pushProgress(id); },
  };
  const status = id => { const p = progress.all()[id]; return !p ? null : p.done ? (p.right ? 'mastered' : 'review') : 'started'; };
  const STATUS_TEXT = { mastered: 'Completed', review: 'Checkpoint missed', started: 'In progress' };
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const savedDays = () => { try { return JSON.parse(pref('nl.days') || '[]'); } catch { return []; } };
  function addDay(t) {
    const day = dayKey(t), days = savedDays();
    if (days.includes(day)) return;
    pref('nl.days', JSON.stringify([...days, day].sort()));
    if (window.Account) Account.pushDay(day);
  }
  // The run log: one entry per finished lesson (newest 1000), for the Progress
  // page's calendar, weekly totals, accuracy and recent activity.
  const runsLog = () => { try { return JSON.parse(pref('nl.runs') || '[]'); } catch { return []; } };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  function logRun(r) {
    const run = { id: newId(), at: Date.now(), algo: r.algo, ms: Math.max(0, Math.round(r.ms || 0)), checks: r.checks || 0, correct: r.correct || 0, input: r.input == null ? undefined : String(r.input).slice(0, 500) };
    pref('nl.runs', JSON.stringify([...runsLog(), run].slice(-1000)));
    if (window.Account) Account.pushRun(run);
  }
  function streak() { const PS = window.ProgressStats; return PS ? PS.streaks(PS.activeDays(runsLog(), savedDays(), progress.all())).current : 0; }

  const minutes = ms => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);

  async function loadCatalog() {
    if (S.catalog) return S.catalog;
    const r = await fetch('/api/catalog');
    if (!r.ok) throw new Error(`Could not load the curriculum (${r.status}).`);
    S.catalog = await r.json();
    S.catalog.modules.forEach(m => m.topics.forEach(t => { S.topics.set(t.id, t); S.module.set(t.id, m); S.order.push(t.id); }));
    return S.catalog;
  }

  // ---------- routing ----------
  const videoEmbedParentOrigin = new URLSearchParams(location.search).get('parentOrigin');
  if (new URLSearchParams(location.search).get('embed') === 'video' && ['http://localhost:3003','http://localhost:3004'].includes(videoEmbedParentOrigin)) document.documentElement.classList.add('video-embed');
  const SCREENS = ['screenHome', 'screenNew', 'screenLibrary', 'screenProgress', 'screenTopic', 'screenLesson', 'screenDone', 'screenLogin'];
  function show(screen, nav) {
    SCREENS.forEach(id => { $(id).hidden = id !== screen; });
    document.body.classList.toggle('authscreen', screen === 'screenLogin');
    document.querySelectorAll('.snav [data-nav]').forEach(a => { a.classList.toggle('on', a.dataset.nav === nav); a.toggleAttribute('aria-current', a.dataset.nav === nav); });
    document.body.classList.remove('navopen'); $('scrim').hidden = true;
    window.scrollTo(0, 0);
    // The page's guided tour (tour.js): plays on the first visit, and the ? button replays it.
    const tour = { screenHome: 'home', screenNew: 'new', screenLibrary: 'library', screenProgress: 'progress', screenTopic: 'topic', screenLesson: nav === 'pdf' ? 'pdf' : nav === 'new' ? 'tutor' : 'lesson' }[screen];
    if (window.Tour && tour && !document.documentElement.classList.contains('video-embed')) Tour.maybeStart(tour);
  }
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
  async function route() {
    const [, name = '', id = ''] = (location.hash || '#/').match(/^#\/([a-z]*)\/?([a-z]*)/) || [];
    // Accounts set up: a signed-out student who hasn't chosen to stay a guest signs in first.
    if (name === 'login' || (window.Account && Account.enabled && Account.recovering)) return openLogin();
    if (window.Account && Account.enabled && !Account.user && !pref('nl.guest')) return go('#/login');
    if (name !== 'lesson' && window.Computed && Computed.playing()) Computed.pause();
    try { await loadCatalog(); } catch (e) { if (!['tutor', 'pdf'].includes(name)) return showLoadError(e); }
    if (name === 'learn' && S.topics.has(id)) return openTopicPage(id);
    if (name === 'lesson' && S.topics.has(id)) return openLesson(id);
    if (name === 'done' && S.topics.has(id) && S.done) return openDone(id);
    if (name === 'done' || name === 'lesson') return go(`#/learn/${id}`);
    if (name === 'tutor' || name === 'pdf') return openTutor(name);
    if (name === 'new') return openNew();
    if (name === 'library') return openLibrary();
    if (name === 'progress') return openProgress();
    return openHome();
  }
  function showLoadError(e) {
    show('screenHome', 'home');
    $('homeRecommend').replaceChildren(el('p', 'formmsg error', `${e.message} Check that the server is running, then reload.`));
  }

  // ---------- shared pieces ----------
  function topicCard(t) {
    const st = status(t.id);
    const a = el('a', `topiccard${st ? ` st-${st}` : ''}`); a.href = `#/learn/${t.id}`;
    const top = el('div', 'tctop');
    top.append(el('span', 'tcicon'), el('strong', '', t.name), el('span', `tcstatus${st ? '' : ' none'}`, st ? STATUS_TEXT[st] : 'Not started'));
    top.firstChild.append(icon(t.visual === 'array' || t.visual === 'stack' || t.visual === 'queue' ? 'list' : 'tree'));
    const meta = el('div', 'tcmeta');
    meta.append(el('span', 'tag', S.module.get(t.id).name), el('span', 'tag', t.level), el('span', 'mono', t.time));
    a.append(top, el('p', '', t.blurb), meta);
    return a;
  }
  function statTiles(box) {
    const all = progress.all(), done = S.order.filter(id => all[id]?.done).length, mastered = S.order.filter(id => all[id]?.right).length;
    const ms = Object.values(all).reduce((n, p) => n + (p.ms || 0), 0), days = streak();
    box.replaceChildren();
    [['book', String(done), 'lessons completed'], ['target', String(mastered), 'checkpoints answered right'], ['clock', minutes(ms), 'spent learning'], ['flame', `${days} ${days === 1 ? 'day' : 'days'}`, 'learning streak']]
      .forEach(([ic, v, k]) => { const s = el('div', 'stattile'); const i = el('span', 'stic'); i.append(icon(ic)); s.append(i, el('b', '', v), el('span', 'hint', k)); box.append(s); });
  }
  const greeting = () => { const h = new Date().getHours(), name = pref('nl.name'); return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${name ? `, ${name}` : ''}`; };

  // ---------- home ----------
  const SUGGEST = ['BFS on graph 1-2, 1-3, 2-4, 3-4 from 1', 'binary search for 40', 'stack push 3 push 7 pop pop', 'fib(5)', 'merge sort [6, 5, 3, 1, 8, 7]'];
  function openHome() {
    show('screenHome', 'home');
    $('homeGreeting').textContent = greeting();
    const sug = $('homeSuggest');
    if (sug.childElementCount < 2) SUGGEST.forEach(q => { const b = el('button', 'chip', q); b.type = 'button'; b.addEventListener('click', () => search(q, $('homeGo'), $('homeHint'))); sug.append(b); });
    statTiles($('homeStats'));
    const all = progress.all();
    // Continue where the student left off: the most recent lesson, or the one after it.
    const recent = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0];
    const cont = $('homeContinue'); cont.replaceChildren();
    if (recent && S.topics.has(recent[0])) {
      const [rid, rec] = recent, next = rec.done && rec.right ? nextTopic(rid) : rid;
      const t = S.topics.get(next || rid);
      const card = el('a', 'continuecard'); card.href = `#/learn/${t.id}`;
      const txt = el('div');
      txt.append(el('span', 'eyebrow', next && next !== rid ? 'UP NEXT' : 'CONTINUE'), el('strong', '', t.name), el('span', 'hint', next && next !== rid ? `You finished ${S.topics.get(rid).name}. This builds on it.` : rec.done ? 'You missed the checkpoint last time. Try it again.' : 'Pick up where you left off.'));
      const go2 = el('span', 'arrow'); go2.append(icon('right'));
      card.append(txt, go2); cont.append(card); cont.hidden = false;
    } else cont.hidden = true;
    // Recommended: the next lessons not yet mastered, those whose prerequisites are done first.
    const ready = id => S.topics.get(id).prereq.every(p => all[p]?.done);
    const open = S.order.filter(id => !all[id]?.right);
    const picks = [...open.filter(ready), ...open.filter(id => !ready(id))].slice(0, 3);
    const rec = $('homeRecommend'); rec.replaceChildren(...(picks.length ? picks.map(id => topicCard(S.topics.get(id))) : [el('p', 'hint', 'You have mastered every lesson. Try them again with harder inputs.')]));
  }
  async function search(text, btn, hint) {
    const q = String(text || '').trim(); if (!q) return;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const r = await api('/api/computed-lesson', { topic: q, narrate: 'template' }, 20000);
      if (r.supported) return openTopic(r);
      go('#/tutor');
      if (typeof submitChat === 'function') submitChat(q);
    } catch (e) {
      if (hint) hint.textContent = `Could not open that: ${e.message}`; else notify(`Could not open “${q}”: ${e.message}`, 'warn');
    } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  // ---------- new lesson ----------
  function openNew() {
    show('screenNew', 'new');
    const box = $('newTopics'); box.replaceChildren();
    S.catalog.modules.forEach(m => {
      const sec = el('section', 'newmod');
      sec.append(el('h3', '', m.name), el('p', 'hint', m.blurb));
      const row = el('div', 'newlist');
      m.topics.forEach(t => {
        const a = el('a', 'newtopic'); a.href = `#/learn/${t.id}`;
        const st = status(t.id);
        a.append(el('strong', '', t.name), el('span', 'hint', `${t.level} · ${t.time}`));
        if (st) a.append(el('span', `tag st-${st}`, STATUS_TEXT[st]));
        row.append(a);
      });
      sec.append(row); box.append(sec);
    });
    setTimeout(() => $('newQuery').focus(), 50);
  }

  // ---------- library ----------
  function openLibrary() {
    show('screenLibrary', 'library');
    if (window.Saved) Saved.render();
    const all = progress.all(), done = S.order.filter(id => all[id]?.done).length;
    $('libProgress').textContent = `${done} of ${S.order.length} lessons completed`;
    $('libProgressFill').style.width = `${(done / S.order.length) * 100}%`;
    const mods = $('libModules'); mods.replaceChildren();
    S.catalog.modules.forEach((m, i) => {
      const sec = el('section', 'module');
      const head = el('div', 'modulehead');
      const doneHere = m.topics.filter(t => all[t.id]?.done).length;
      head.append(el('span', 'modno', String(i + 1)), el('div'));
      head.lastChild.append(el('h3', '', m.name), el('p', 'hint', m.blurb));
      head.append(el('span', 'hint modcount', `${doneHere}/${m.topics.length}`));
      const grid = el('div', 'topiccards');
      m.topics.forEach(t => grid.append(topicCard(t)));
      sec.append(head, grid); mods.append(sec);
    });
  }

  // ---------- progress ----------
  function openProgress() {
    show('screenProgress', 'progress');
    renderProgress();
  }
  // The Progress page, drawn from nl.progress (one record per lesson), nl.runs
  // (one entry per finished lesson) and nl.days (streak days); numbers come
  // from progress-stats.js.
  function renderProgress() {
    const PS = window.ProgressStats, all = progress.all(), runs = runsLog().filter(r => r && r.at);
    const days = PS.activeDays(runs, savedDays(), all), st = PS.streaks(days), acc = PS.accuracy(runs);
    const done = S.order.filter(id => all[id]?.done).length, mastered = S.order.filter(id => all[id]?.right).length;
    const ms = Object.values(all).reduce((n, p) => n + (p.ms || 0), 0), started = S.order.filter(id => all[id]).length;
    const A = window.Account, synced = !!(A && A.enabled && A.user);
    $('progLead').textContent = synced ? `Saved to your account (${A.user.email}) and kept in step on every device.` : A && A.enabled ? 'Saved in this browser only. Sign in to keep it on every device.' : 'Saved in this browser. Finish a lesson and answer its checkpoint to master it.';
    const empty = !started && !runs.length;
    $('progEmpty').hidden = !empty; $('progExport').disabled = !runs.length; $('progReset').disabled = empty;
    // Six tiles.
    const box = $('progStats'); box.replaceChildren();
    [['book', String(done), 'lessons completed', ''],
     ['target', `${mastered}`, 'mastered', 'checkpoint answered right'],
     ['clock', minutes(ms), 'time spent learning', runs.length ? `over ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : ''],
     ['flame', `${st.current} ${st.current === 1 ? 'day' : 'days'}`, 'current streak', st.current && !days.has(PS.dayKey(Date.now())) ? 'finish a lesson today to keep it' : ''],
     ['spark', `${st.longest} ${st.longest === 1 ? 'day' : 'days'}`, 'longest streak', ''],
     ['check', acc.pct == null ? '–' : `${acc.pct}%`, 'checkpoint accuracy', acc.checks ? `${acc.correct} of ${acc.checks} right` : 'no checkpoints yet']]
      .forEach(([ic, v, k, sub]) => { const s = el('div', 'stattile'); const i = el('span', 'stic'); i.append(icon(ic)); s.append(i, el('b', '', v), el('span', 'hint', k)); if (sub) s.append(el('small', 'tilesub', sub)); box.append(s); });
    // Activity calendar (17 weeks) and month labels.
    const cells = PS.activity(runs, days), heat = $('progHeat'); heat.replaceChildren();
    const fmt = d => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    cells.forEach(c => {
      const i = el('i', `l${c.level}${c.future ? ' future' : ''}`);
      const what = c.future ? '' : c.count ? `${c.count} ${c.count === 1 ? 'lesson' : 'lessons'}${c.ms ? `, ${minutes(c.ms)}` : ''}` : 'no lessons';
      i.title = c.future ? fmt(c.day) : `${fmt(c.day)}: ${what}`;
      heat.append(i);
    });
    const activeCount = cells.filter(c => c.count).length;
    heat.setAttribute('aria-label', `Activity over the last 17 weeks: lessons on ${activeCount} ${activeCount === 1 ? 'day' : 'days'}.`);
    const months = $('progMonths'); months.replaceChildren();
    for (let w = 0; w < cells.length / 7; w++) {
      const first = cells[w * 7], d = new Date(`${first.day}T12:00:00`), label = el('span');
      if (w === 0 || d.getDate() <= 7) label.textContent = d.toLocaleDateString([], { month: 'short' });
      months.append(label);
    }
    $('progHeatHint').textContent = activeCount ? `${activeCount} active ${activeCount === 1 ? 'day' : 'days'} in 17 weeks` : 'Last 17 weeks';
    // This week, a bar per day, against last week.
    const wk = PS.week(runs), wbox = $('progWeek'), top = Math.max(1, ...wk.days.map(d => d.ms || d.lessons * 60000));
    wbox.replaceChildren();
    wk.days.forEach(d => {
      const col = el('div', `wbar${d.future ? ' future' : ''}${d.day === PS.dayKey(Date.now()) ? ' today' : ''}`), bar = el('span', 'wfill');
      bar.style.height = `${Math.round(((d.ms || d.lessons * 60000) / top) * 100)}%`;
      col.title = `${d.label}: ${d.lessons} ${d.lessons === 1 ? 'lesson' : 'lessons'}${d.ms ? `, ${minutes(d.ms)}` : ''}`;
      col.append(el('span', 'wval', d.lessons ? String(d.lessons) : ''), el('span', 'wtrack'), el('span', 'wlab', d.label));
      col.querySelector('.wtrack').append(bar); wbox.append(col);
    });
    const tw = wk.thisWeek, lw = wk.lastWeek, diff = tw.lessons - lw.lessons;
    $('progWeekSum').textContent = `${tw.lessons} ${tw.lessons === 1 ? 'lesson' : 'lessons'}${tw.ms ? ` · ${minutes(tw.ms)}` : ''} · ${lw.lessons ? (diff > 0 ? `${diff} more than last week` : diff < 0 ? `${-diff} fewer than last week` : 'same as last week') : 'first week of tracking'}`;
    // Needs review: checkpoint missed, with a retry.
    const rev = PS.needsReview(all, S.order), rlist = $('progReview'); rlist.replaceChildren();
    $('progReviewCount').textContent = rev.length ? `${rev.length} ${rev.length === 1 ? 'lesson' : 'lessons'}` : '';
    if (!rev.length) rlist.append(el('li', 'hint', done ? 'Nothing to review: every finished lesson has its checkpoint right.' : 'Lessons whose checkpoint you miss will show up here.'));
    rev.forEach(id => {
      const t = S.topics.get(id), p = all[id], li = el('li');
      const txt = el('div'); txt.append(el('strong', '', t.name), el('span', 'hint', `Checkpoint missed · tried ${p.runs || 1} ${(p.runs || 1) === 1 ? 'time' : 'times'}${p.at ? ` · last on ${new Date(p.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''}`));
      const go2 = el('a', 'ghostbtn small', 'Retry'); go2.href = `#/learn/${id}`; go2.setAttribute('aria-label', `Retry ${t.name}`);
      li.append(txt, go2); rlist.append(li);
    });
    // Modules, with a chip per lesson.
    const bars = $('progModules'); bars.replaceChildren();
    S.catalog.modules.forEach(m => {
      const mdone = m.topics.filter(t => all[t.id]?.done).length, right = m.topics.filter(t => all[t.id]?.right).length;
      const row = el('div', 'modbar');
      const topRow = el('div', 'mbtop'); topRow.append(el('strong', '', m.name), el('span', 'hint', `${mdone} of ${m.topics.length} done · ${right} mastered`));
      const bar = el('div', 'minibar dual'); const f1 = el('div', 'fdone'), f2 = el('div', 'fright');
      f1.style.width = `${(mdone / m.topics.length) * 100}%`; f2.style.width = `${(right / m.topics.length) * 100}%`; bar.append(f1, f2);
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${m.name}: ${mdone} of ${m.topics.length} done, ${right} mastered`);
      const chips = el('div', 'modchips');
      m.topics.forEach(t => { const s = status(t.id), c = el('a', `modchip${s ? ` st-${s}` : ''}`, t.name); c.href = `#/learn/${t.id}`; c.title = s ? STATUS_TEXT[s] : 'Not started'; chips.append(c); });
      row.append(topRow, bar, chips); bars.append(row);
    });
    // Recent activity: runs first; lessons only started (no run yet) after.
    const hist = $('progHistory'); hist.replaceChildren();
    const recent = [...runs].sort((x, y) => y.at - x.at).slice(0, 12);
    if (!recent.length) {
      const items = Object.entries(all).filter(([id, p]) => S.topics.has(id) && p.at).sort((x, y) => y[1].at - x[1].at).slice(0, 12);
      if (!items.length) hist.append(el('li', 'hint', 'No lessons yet. Start one from the library.'));
      items.forEach(([id, p]) => { const li = el('li'); const a2 = el('a', '', S.topics.get(id).name); a2.href = `#/learn/${id}`; const s = status(id); li.append(a2, el('span', `tag st-${s}`, STATUS_TEXT[s]), el('span', 'hint', `${new Date(p.at).toLocaleDateString()}${p.ms ? ` · ${minutes(p.ms)}` : ''}`)); hist.append(li); });
    }
    recent.forEach(r => {
      const t = S.topics.get(r.algo); if (!t) return;
      const li = el('li'), a2 = el('a', '', t.name); a2.href = `#/learn/${r.algo}`;
      const res = r.checks ? (r.correct === r.checks ? ['mastered', 'Checkpoint right'] : ['review', `${r.correct}/${r.checks} right`]) : ['started', 'Finished'];
      const when = new Date(r.at), today = PS.dayKey(Date.now()) === PS.dayKey(r.at);
      li.append(a2, el('span', `tag st-${res[0]}`, res[1]), el('span', 'hint', `${today ? `Today, ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : when.toLocaleDateString([], { day: 'numeric', month: 'short' })}${r.ms ? ` · ${minutes(r.ms)}` : ''}`));
      if (r.input) li.title = `Input: ${r.input}`;
      hist.append(li);
    });
  }
  // Export: every run as a CSV file.
  $('progExport').addEventListener('click', () => {
    const names = Object.fromEntries([...S.topics.values()].map(t => [t.id, t.name]));
    const blob = new Blob([window.ProgressStats.csv(runsLog(), names)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `neuralearn-progress-${window.ProgressStats.dayKey(Date.now())}.csv`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    notify('Progress exported as a CSV file.', 'ok');
  });
  // Reset: a confirmation dialog, then the browser copy and (when signed in) the account copy.
  $('progReset').addEventListener('click', () => {
    const A = window.Account, synced = !!(A && A.enabled && A.user);
    $('resetText').textContent = `This clears completed lessons, checkpoints, your streak and the activity log${synced ? ' from your account and this browser' : ' from this browser'}. Your notes and saved lectures stay.`;
    $('resetConfirm').checked = false; $('resetGo').disabled = true;
    $('resetDialog').showModal();
  });
  $('resetConfirm').addEventListener('change', e => { $('resetGo').disabled = !e.target.checked; });
  $('resetDialog').addEventListener('close', async () => {
    if ($('resetDialog').returnValue !== 'reset') return;
    try {
      if (window.Account && Account.user) await Account.resetProgress();
      ['nl.progress', 'nl.runs', 'nl.days'].forEach(k => pref(k, null));
      notify('Progress reset.', 'ok');
    } catch (e) { notify(`Could not reset your account's progress: ${e.message}`); }
    renderProgress();
  });

  // ---------- topic page ----------
  // Opens the topic page with a lesson the server already built from free text.
  function openTopic(data) { S.pending = data; go(`#/learn/${data.lesson.algorithm}`); }
  function crumbs(node, id, extra) {
    const m = S.module.get(id), t = S.topics.get(id);
    node.replaceChildren();
    const a = el('a', '', 'Library'); a.href = '#/library'; node.append(a, el('span', 'sep', '›'), el('span', '', m.name), el('span', 'sep', '›'));
    if (extra) { const b = el('a', '', t.name); b.href = `#/learn/${id}`; node.append(b, el('span', 'sep', '›'), el('span', '', extra)); }
    else node.append(el('span', 'here', t.name));
  }
  function openTopicPage(id) {
    const t = S.topics.get(id);
    show('screenTopic', 'library');
    crumbs($('topicCrumbs'), id);
    $('topicName').textContent = t.name;
    $('topicBlurb').textContent = t.blurb;
    const meta = $('topicMeta'); meta.replaceChildren(el('span', 'tag', t.level), el('span', 'tag mono', `Time ${t.time}`), el('span', 'tag mono', `Space ${t.space}`));
    const st = status(id); if (st) meta.append(el('span', `tag st-${st}`, STATUS_TEXT[st]));
    const pre = $('topicPrereq'); pre.replaceChildren();
    if (t.prereq.length) {
      pre.append('Helps to know first: ');
      t.prereq.forEach((p, i) => { const a = el('a', '', S.topics.get(p).name); a.href = `#/learn/${p}`; pre.append(a); if (i < t.prereq.length - 1) pre.append(', '); });
    }
    const inp = t.input;
    $('topicDataLabel').textContent = inp.label; $('topicData').placeholder = inp.placeholder;
    $('topicHelp').textContent = inp.help;
    $('topicTargetRow').hidden = !inp.target; if (inp.target) $('topicTargetLabel').textContent = inp.target;
    const ex = $('topicExamples'); ex.replaceChildren();
    t.examples.forEach(e => {
      const b = el('button', 'chip', e.label); b.type = 'button';
      b.addEventListener('click', () => { $('topicData').value = e.text; $('topicTarget').value = e.target || ''; build(id); });
      ex.append(b);
    });
    $('topicAi').checked = !$('instantToggle').checked;
    if (window.Voice) Voice.sync();
    // Input: what the student just searched for, else their last input, else the first example.
    const pending = S.pending && S.pending.lesson.algorithm === id ? S.pending : null; S.pending = null;
    const last = progress.all()[id];
    const start = pending ? pending.input : last?.input !== undefined ? { text: last.input, target: last.target } : { text: t.examples[0].text, target: t.examples[0].target };
    $('topicData').value = start.text || ''; $('topicTarget').value = start.target || '';
    if (pending) showBuilt(id, pending, { algorithm: id, input: pending.input.text, target: pending.input.target });
    else build(id);
  }
  let buildTimer = null;
  async function build(id) {
    const seq = ++S.build, request = { algorithm: id, input: $('topicData').value, target: $('topicTarget').value };
    $('topicStart').disabled = true;
    try {
      const r = await api('/api/computed-lesson', { ...request, narrate: 'template' }, 20000);
      if (seq === S.build) showBuilt(id, r, request);
    } catch (e) {
      if (seq !== S.build) return;
      S.lesson = null;
      message(e.message, 'error');
    }
  }
  function message(text, kind) { const m = $('topicMsg'); m.textContent = text || ''; m.className = `formmsg ${kind || ''}`; m.hidden = !text; }
  const words = s => s.split(/\s+/).filter(Boolean).length;
  const seconds = beats => beats.reduce((n, b) => n + words(b.say) / 2.6 + 0.6, 0);
  const KIND = { intro: 'Introduction', trace: 'Walkthrough', misconception: 'Common mistake', remedial: 'Second explanation', recap: 'Recap' };
  const lessonMinutes = L => Math.max(1, Math.round(L.scenes.filter(s => s.kind !== 'remedial').reduce((n, s) => n + seconds(s.beats), 0) / 60));
  function showBuilt(id, r, request) {
    S.lesson = r.lesson; S.request = request;
    const L = r.lesson;
    message(L.notes.length ? L.notes.join(' ') : '', L.notes.length ? 'warn' : '');
    if (L.notes.length) { $('topicData').value = r.input.text; $('topicTarget').value = r.input.target || ''; S.request = { algorithm: id, input: r.input.text, target: r.input.target }; }
    $('previewCaption').textContent = window.Computed ? Computed.preview($('previewSvg'), L) : '';
    $('previewStats').textContent = `${L.trace.steps.length} recorded steps from running ${L.title.charAt(0).toLowerCase() + L.title.slice(1)}.`;
    const plan = $('topicPlan'); plan.replaceChildren();
    L.scenes.forEach(sc => {
      const optional = sc.kind === 'remedial', secs = seconds(sc.beats);
      const li = el('li', `k-${sc.kind}${optional ? ' optional' : ''}`);
      const txt = el('div');
      txt.append(el('strong', '', sc.title), el('span', 'hint', `${KIND[sc.kind] || sc.kind}${sc.checkpoint ? ' · ends with a checkpoint question' : ''}${optional ? ' · only if you miss the checkpoint' : ''}`));
      li.append(txt, el('span', 'hint mono', `${Math.max(1, Math.round(secs))} s`));
      plan.append(li);
    });
    $('planTime').textContent = `About ${lessonMinutes(L)} min at normal speed`;
    $('topicStart').disabled = false;
    // Start preparing the first lines while the student reads the plan.
    clearTimeout(S.warm);
    S.warm = setTimeout(() => { if (window.Voice && $('topicVoice').value.startsWith('natural:') && S.lesson === L) Voice.prefetch([L.scenes[0].beats.map(b => b.say)]); }, 1200);
  }
  $('topicForm').addEventListener('submit', e => { e.preventDefault(); });
  ['topicData', 'topicTarget'].forEach(fid => $(fid).addEventListener('input', () => {
    const id = currentId(); if (!id) return;
    clearTimeout(buildTimer); buildTimer = setTimeout(() => build(id), 350);
  }));
  ['topicData', 'topicTarget'].forEach(fid => $(fid).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!$('topicStart').disabled) $('topicStart').click(); } }));
  const currentId = () => ((location.hash || '').match(/^#\/(?:learn|lesson|done)\/([a-z]+)/) || [])[1];
  $('topicStart').addEventListener('click', () => {
    const id = currentId(); if (!S.lesson || !id) return;
    $('instantToggle').checked = !$('topicAi').checked;
    pref('nl.instant', $('instantToggle').checked ? '1' : '0');
    if (window.Voice) Voice.setChoice($('topicVoice').value);
    progress.save(id, { input: S.request.input, target: S.request.target, at: Date.now() });
    S.startPending = true;
    go(`#/lesson/${id}`);
  });

  // ---------- lesson ----------
  // The side panel answers questions about the lesson, or acts as the general tutor.
  function panelFor(mode) {
    document.querySelector('.chatpanel h2').textContent = mode === 'lesson' ? 'Ask the professor' : 'AI Tutor';
    $('tutorSub').textContent = mode === 'lesson' ? 'Questions pause the lesson at this step' : 'Chat & learn';
  }
  function lessonHeader(id, L) {
    const t = S.topics.get(id);
    $('lessonLead').textContent = t.blurb;
    const tags = $('lessonTags'); tags.replaceChildren();
    const tag = (cls, ic, text) => { const s = el('span', `ltag ${cls}`); s.append(icon(ic, 'ic sm'), text); tags.append(s); };
    tag('vio', 'book', S.module.get(id).name);
    tag('teal', 'tree', 'Computed visual');
    tag('', 'clock', `~${lessonMinutes(L)} min`);
  }
  function openLesson(id) {
    const ready = S.lesson && S.lesson.algorithm === id;
    if (S.startPending && ready) {
      S.startPending = false;
      show('screenLesson', 'library');
      crumbs($('lessonCrumbs'), id, 'Lesson'); panelFor('lesson'); lessonHeader(id, S.lesson);
      Computed.start(structuredClone(S.lesson), S.request);
      return;
    }
    if (!window.Computed || !Computed.active()) return go(`#/learn/${id}`);
    show('screenLesson', 'library');
    crumbs($('lessonCrumbs'), id, 'Lesson'); panelFor('lesson');
    if (S.replayPending) { S.replayPending = false; Computed.replay(); }
  }
  document.addEventListener('computed:finish', e => {
    const d = e.detail, id = d.lesson.algorithm;
    if (!S.topics.has(id)) return;
    const right = d.checkpoints.length > 0 && d.checkpoints.every(c => c.right);
    const prev = progress.all()[id] || {};
    progress.save(id, { done: true, right: right || !!prev.right, at: Date.now(), ms: (prev.ms || 0) + d.ms, runs: (prev.runs || 0) + 1 });
    addDay(Date.now());
    logRun({ algo: id, ms: d.ms, checks: d.checkpoints.length, correct: d.checkpoints.filter(c => c.right).length, input: S.request?.input });
    S.done = d;
    notify(`${S.topics.get(id).name}: lesson complete${d.checkpoints.length ? (right ? ', checkpoint correct' : ', checkpoint missed') : ''}.`, right ? 'ok' : '');
    setTimeout(() => { if (currentId() === id && /^#\/lesson\//.test(location.hash)) go(`#/done/${id}`); }, 1400);
  });

  // ---------- summary ----------
  const nextTopic = id => S.order[S.order.indexOf(id) + 1] || null;
  const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function openDone(id) {
    const d = S.done, L = d.lesson, t = S.topics.get(id);
    show('screenDone', 'library');
    $('doneTitle').textContent = L.title;
    const stats = $('doneStats'); stats.replaceChildren();
    [[L.trace.steps.length, 'recorded steps'], [L.scenes.filter(s => s.kind !== 'remedial' || d.checkpoints.some(c => !c.right)).length, 'scenes'], [d.questions, d.questions === 1 ? 'question asked' : 'questions asked'], [clock(d.ms), 'time']]
      .forEach(([v, k]) => { const b = el('div', 'stat'); b.append(el('b', '', String(v)), el('span', 'hint', k)); stats.append(b); });
    const chk = $('doneCheck'); chk.replaceChildren();
    if (!d.checkpoints.length) chk.append(el('p', 'hint', 'You did not answer the checkpoint this time.'));
    d.checkpoints.forEach(c => {
      const row = el('div', `cprow ${c.right ? 'right' : 'wrong'}`);
      row.append(el('span', 'cpmark', c.right ? '✓' : '✗'));
      const txt = el('div'); txt.append(el('strong', '', c.q), el('span', 'hint', c.right ? `You answered ${c.answer}. Correct.` : `You answered ${c.chosen}. The answer is ${c.answer}, read from the recorded trace.`));
      row.append(txt); chk.append(row);
    });
    const pts = $('donePoints'); pts.replaceChildren();
    (L.scenes.find(s => s.kind === 'recap')?.beats || []).forEach(b => pts.append(el('li', '', b.say)));
    pts.append(el('li', '', `Cost: time ${t.time}, extra space ${t.space}.`));
    const nx = nextTopic(id), next = $('doneNext');
    if (nx) { next.href = `#/learn/${nx}`; next.textContent = `Next: ${S.topics.get(nx).name} →`; } else { next.href = '#/library'; next.textContent = 'Back to the library'; }
  }
  $('doneRetry').addEventListener('click', () => { const id = currentId(); if (id) go(`#/learn/${id}`); });
  $('doneReplay').addEventListener('click', () => { const id = currentId(); if (!id) return; S.replayPending = true; go(`#/lesson/${id}`); });
  $('doneAsk').addEventListener('click', () => { const id = currentId(); if (!id) return; go(`#/lesson/${id}`); setTimeout(() => $('chatInput')?.focus(), 50); });

  // ---------- AI tutor and PDF tutor ----------
  const welcomeHtml = $('welcome').innerHTML;
  function openTutor(mode) {
    show('screenLesson', mode === 'pdf' ? 'pdf' : 'new'); panelFor('tutor');
    if (window.Computed && Computed.active()) Computed.deactivate();
    if (window.BoardTools) BoardTools.reset();
    const nav = $('lessonCrumbs'); nav.replaceChildren();
    const a = el('a', '', 'Home'); a.href = '#/'; nav.append(a, el('span', 'sep', '›'), el('span', 'here', mode === 'pdf' ? 'PDF tutor' : 'AI tutor'));
    const tags = $('lessonTags'); tags.replaceChildren();
    [['vio', 'spark', 'Generated visual'], ['teal', 'check', 'Background fact check']].forEach(([c, ic, t]) => { const s = el('span', `ltag ${c}`); s.append(icon(ic, 'ic sm'), t); tags.append(s); });
    $('pdfRow').classList.toggle('pulse', mode === 'pdf');
    if ($('sceneSvg').hidden && $('lessonFrame').hidden) {
      $('welcome').hidden = false;
      $('welcome').innerHTML = mode === 'pdf'
        ? '<h2>Learn from your PDF</h2><p>Attach notes, a chapter or a paper with the button on the right. The tutor explains it section by section and draws a visual for each part, with a background fact check.</p>'
        : welcomeHtml;
      if (mode !== 'pdf') $('welcome').querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => typeof submitChat === 'function' && submitChat(b.dataset.topic)));
      $('lessonTitle').textContent = mode === 'pdf' ? 'PDF Tutor' : 'AI Tutor';
      $('lessonLead').textContent = mode === 'pdf' ? 'Section-by-section explanations of your own document.' : 'Ask about any topic. Algorithm topics open a computed lesson instead.';
      $('sceneCounter').textContent = 'Ready';
      $('sceneKind').textContent = mode === 'pdf' ? 'PDF TUTOR' : 'AI TUTOR';
    }
  }

  // ---------- top bar ----------
  function closePops(except) { document.querySelectorAll('.popover').forEach(p => { if (p !== except) { p.hidden = true; p.previousElementSibling?.setAttribute('aria-expanded', 'false'); } }); }
  function popToggle(btn, pop) {
    btn.addEventListener('click', e => { e.stopPropagation(); const open = pop.hidden; closePops(pop); pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open && pop === $('bellMenu')) { $('bellDot').hidden = true; } });
    pop.addEventListener('click', e => e.stopPropagation());
  }
  popToggle($('modelPill'), $('modelMenu'));
  popToggle($('bellBtn'), $('bellMenu'));
  popToggle($('avatarBtn'), $('profileMenu'));
  document.addEventListener('click', () => closePops());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });

  $('topSearch').addEventListener('submit', e => { e.preventDefault(); search($('topQuery').value, null, null); $('topQuery').value = ''; });
  $('homeSearch').addEventListener('submit', e => { e.preventDefault(); search($('homeQuery').value, $('homeGo'), $('homeHint')); });
  $('newSearch').addEventListener('submit', e => { e.preventDefault(); search($('newQuery').value, e.target.querySelector('button'), null); });

  // Light by default; the moon button switches to dark mode and is remembered.
  function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    const dark = theme === 'dark';
    $('themeBtn').replaceChildren(icon(dark ? 'sun' : 'moon'));
    $('themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  $('themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    pref('nl.theme', dark ? 'light' : 'dark'); applyTheme(dark ? 'light' : 'dark');
  });
  applyTheme(pref('nl.theme'));

  // Profile: a name for greetings, kept in this browser.
  function applyName() { const n = pref('nl.name') || ''; $('avatarBtn').textContent = (n.trim()[0] || 'S').toUpperCase(); $('profileName').value = n; }
  let nameTimer = 0;
  $('profileName').addEventListener('input', e => {
    pref('nl.name', e.target.value.trim()); applyName(); if (!$('screenHome').hidden) $('homeGreeting').textContent = greeting();
    clearTimeout(nameTimer); nameTimer = setTimeout(() => window.Account && Account.pushName(pref('nl.name') || ''), 600);
  });
  applyName();

  // Notifications: lesson results, fact checks, model and voice changes.
  function notify(text, kind = '') {
    S.notes.unshift({ text, kind, at: Date.now() }); S.notes = S.notes.slice(0, 20);
    if (window.Account) Account.pushNotification({ text, kind });
    renderBell();
    if ($('bellMenu').hidden) $('bellDot').hidden = false;
  }
  function renderBell() {
    const list = $('bellList'); list.replaceChildren();
    if (!S.notes.length) list.append(el('li', 'hint', 'Nothing yet. Lesson results, fact checks and voice changes show up here.'));
    const today = dayKey(Date.now());
    S.notes.forEach(n => { const li = el('li', `bn ${n.kind}`); li.append(el('span', '', n.text), el('time', 'hint', new Date(n.at).toLocaleString([], dayKey(n.at) === today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))); list.append(li); });
  }
  document.addEventListener('account:notifications', e => { S.notes = e.detail.slice(0, 20); renderBell(); });
  document.addEventListener('nl:notify', e => notify(e.detail.text, e.detail.kind));

  // Configured providers can be selected; unavailable providers stay visible
  // with the Netlify key they need. The server only falls back to configured ones.
  const modelLabel = id => (S.health?.models || []).find(m => m.id === id)?.label || id;
  function renderModels() {
    const h = S.health; if (!h) return;
    const list = h.models || [], configured = list.filter(m => m.configured !== false);
    const requested = (window.Models && Models.choice) || '';
    const chosen = configured.some(m => m.id === requested) ? requested : configured[0]?.id;
    $('modelName').textContent = chosen ? modelLabel(chosen) : h.provider === 'ollama' ? 'Local AI' : 'AI model';
    $('modelInfo').replaceChildren();
    if (list.length) {
      const box = el('div', 'modellist');
      list.forEach(m => {
        const available = m.configured !== false;
        const b = el('button', `modelopt${m.id === chosen ? ' on' : ''}${available ? '' : ' unavailable'}`); b.type = 'button'; b.disabled = !available;
        const status = !available ? `Add ${m.keyName} in Netlify` : S.busy?.[m.id] && Date.now() - S.busy[m.id] < 180000 ? 'Busy a moment ago' : m.note;
        b.append(el('strong', '', m.label), el('span', 'hint', status));
        if (available) b.addEventListener('click', () => { Models.set(m.id); renderModels(); notify(`Now using ${m.label}. If it is busy, the next model answers.`); });
        box.append(b);
      });
      $('modelInfo').append(box, el('p', 'hint', configured.length > 1 ? 'If a model is busy, the next configured model answers automatically.' : 'Add another provider key in Netlify to enable more models and automatic fallback.'));
    } else $('modelInfo').append(el('p', 'hint', h.configured ? `${h.provider} · ${h.model}` : 'No AI model is configured. Computed lessons still work in Instant mode.'));
    $('voiceInfo').textContent = h.voice ? `Natural voice available (${h.voiceRpm} requests a minute).` : 'Natural voice unavailable: the device voice is used.';
  }
  const modelName = el('span', 'modelname'); modelName.id = 'modelName'; modelName.textContent = 'AI model';
  $('modelPill').insertBefore(modelName, $('modelPill').querySelector('.ic'));
  document.addEventListener('model:used', e => {
    const { used, skipped } = e.detail;
    S.busy = S.busy || {}; skipped.forEach(id => { S.busy[id] = Date.now(); });
    if (skipped.length) notify(`${skipped.map(modelLabel).join(' and ')} ${skipped.length === 1 ? 'was' : 'were'} busy, so ${modelLabel(used)} answered.`, 'warn');
    renderModels();
  });
  function sideStatus() {
    const h = S.health;
    $('sideDot').className = `sdot ${h ? (h.configured ? 'ok' : 'off') : 'bad'}`;
    $('sideState').textContent = h ? (h.configured ? 'Online' : 'Offline mode') : 'Server unreachable';
    $('sideModel').textContent = h ? (h.configured ? 'Model connected' : 'Computed lessons still work') : 'Start the server and reload';
  }
  fetch('/api/health').then(r => r.json()).then(h => { S.health = h; }).catch(() => { S.health = null; }).finally(() => { renderModels(); sideStatus(); });

  // Small screens: the sidebar slides in.
  $('menuBtn').addEventListener('click', () => { document.body.classList.add('navopen'); $('scrim').hidden = false; });
  $('scrim').addEventListener('click', () => { document.body.classList.remove('navopen'); $('scrim').hidden = true; });
  $('pdfRow').addEventListener('click', () => $('pdfInput').click());
  $('chatSettings').addEventListener('click', () => $('settingsDialog').showModal());

  window.Shell = { openTopic, notify, topicInfo: id => S.topics.get(id) || null };
  $('tourReplay').addEventListener('click', () => { $('profileMenu').hidden = true; $('avatarBtn').setAttribute('aria-expanded', 'false'); if (window.Tour) Tour.start(); });
  $('helpBtn').addEventListener('click', () => window.Tour && Tour.start());
  // Settings: forget which guides were seen (handy before a demo), then play this page's.
  $('resetTours').addEventListener('click', () => {
    try { Object.keys(localStorage).filter(k => k.startsWith('nl.tour')).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ }
    $('settingsDialog').close();
    if (window.Tour) Tour.start();
  });
  // ---------- accounts (account.js) ----------
  let loginMode = 'in';
  function setLoginMode(mode) {
    loginMode = mode;
    const recover = mode === 'reset';
    $('loginTitle').textContent = mode === 'up' ? 'Create your account' : recover ? 'Set a new password' : 'Welcome back';
    $('loginLead').textContent = mode === 'up' ? 'Save your progress, notes and streak, and pick up on any device.' : recover ? 'Choose a new password for your account.' : 'Sign in to keep your progress, notes and streak on every device.';
    $('tabSignIn').classList.toggle('on', mode === 'in'); $('tabSignIn').setAttribute('aria-selected', String(mode === 'in'));
    $('tabSignUp').classList.toggle('on', mode === 'up'); $('tabSignUp').setAttribute('aria-selected', String(mode === 'up'));
    $('loginTabs').hidden = recover;
    $('loginNameRow').hidden = mode !== 'up';
    $('loginEmailRow').hidden = recover;
    $('loginEmail').required = !recover;
    $('loginPassword').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    $('loginGo').textContent = mode === 'up' ? 'Create account' : recover ? 'Save password' : 'Sign in';
    $('loginForgot').hidden = mode !== 'in';
    $('loginGuestRow').hidden = recover;
    loginMsg('');
  }
  function loginMsg(text, kind = 'error') { const m = $('loginMsg'); m.textContent = text; m.className = `formmsg ${text ? kind : ''}`; m.hidden = !text; }
  function openLogin() {
    if (window.Account && Account.user && !Account.recovering) return go('#/');
    show('screenLogin', '');
    if (!(window.Account && Account.enabled)) { setLoginMode('in'); loginMsg('Accounts are not set up on this server yet, so your progress stays in this browser.', 'info'); $('loginForm').hidden = true; $('loginTabs').hidden = true; return; }
    $('loginForm').hidden = false;
    setLoginMode(Account.recovering ? 'reset' : loginMode === 'reset' ? 'in' : loginMode);
    setTimeout(() => (Account.recovering ? $('loginPassword') : loginMode === 'up' ? $('loginName') : $('loginEmail')).focus(), 50);
  }
  $('tabSignIn').addEventListener('click', () => setLoginMode('in'));
  $('tabSignUp').addEventListener('click', () => setLoginMode('up'));
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('loginEmail').value.trim(), password = $('loginPassword').value, name = $('loginName').value.trim();
    if (loginMode !== 'reset' && !/^\S+@\S+\.\S+$/.test(email)) return loginMsg('Enter a valid email address.');
    if (password.length < 8) return loginMsg('Use a password of at least 8 characters.');
    const btn = $('loginGo'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      if (loginMode === 'up') {
        const ready = await Account.signUp(email, password, name);
        if (!ready) { setLoginMode('in'); $('loginEmail').value = email; loginMsg(`Almost there: we sent a confirmation link to ${email}. Open it, then sign in here.`, 'ok'); }
      } else if (loginMode === 'reset') {
        await Account.setPassword(password);
        go('#/');
      } else await Account.signIn(email, password);
      $('loginPassword').value = '';
    } catch (err) { loginMsg(err.message); }
    finally { btn.disabled = false; if (btn.textContent === 'Please wait…') btn.textContent = label; }
  });
  $('loginForgot').addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return loginMsg('Type your email above first, then press "Forgot password?" again.');
    try { await Account.resetPassword(email); loginMsg(`If ${email} has an account, a link to reset the password is on its way.`, 'ok'); }
    catch (err) { loginMsg(err.message); }
  });
  $('loginGuest').addEventListener('click', () => { pref('nl.guest', '1'); go('#/'); });
  // The profile menu says who is signed in, or offers to sign in.
  function renderAccount() {
    const box = $('accountBox'); box.replaceChildren();
    const A = window.Account;
    if (!A || !A.enabled) { box.append(el('p', 'hint', 'Progress is saved in this browser only.')); return; }
    if (A.user) {
      box.append(el('p', 'accountwho', A.user.email || 'Signed in'), el('p', 'hint', 'Progress, notes, streak and notifications are saved to your account.'));
      const out = el('button', 'ghostbtn small', 'Sign out'); out.type = 'button';
      out.addEventListener('click', async () => { $('profileMenu').hidden = true; await A.signOut(); });
      box.append(out);
    } else {
      box.append(el('p', 'hint', 'You are using NeuraLearn as a guest: progress stays in this browser.'));
      const inBtn = el('a', 'primarybtn small', 'Sign in or create an account'); inBtn.href = '#/login';
      inBtn.addEventListener('click', () => { $('profileMenu').hidden = true; });
      box.append(inBtn);
    }
  }
  document.addEventListener('account:change', e => {
    renderAccount(); applyName();
    if (e.detail.user) { pref('nl.guest', null); go(/^#\/login/.test(location.hash) ? '#/' : location.hash || '#/'); }
    else { S.notes = []; renderBell(); go('#/login'); }
  });
  document.addEventListener('account:synced', () => { if (!$('screenProgress').hidden) renderProgress(); applyName(); if (!/^#\/(lesson|login)/.test(location.hash)) route(); });
  document.addEventListener('account:recovery', () => go('#/login'));

  window.addEventListener('message', e => {
    if (!document.documentElement.classList.contains('video-embed') || e.source !== parent || e.origin !== videoEmbedParentOrigin) return;
    const d = e.data || {};
    if (d.type === 'neuralelearn:save-bookmark') {
      const users = [...document.querySelectorAll('#chatThread .chatmsg.user')];
      const prompt = users.at(-1)?.textContent?.trim() || '';
      const notes = [...document.querySelectorAll('#chatThread .chatmsg')].map(n => n.textContent.trim()).filter(Boolean).join('\n\n');
      parent.postMessage({ type:'neuralelearn:bookmark-data', title:document.querySelector('#lessonTitle')?.textContent?.trim() || prompt, prompt, notes }, videoEmbedParentOrigin);
    }
    if (d.type === 'neuralelearn:open-bookmark' && typeof d.prompt === 'string') { const input = document.querySelector('#chatInput'); if (input) { input.value=d.prompt; input.focus(); } }
  });
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/');
  // Wait briefly for the account, so the first page shows synced data and the
  // right screen (sign-in or home); never longer than 2.5 s.
  Promise.race([window.Account ? Account.ready : null, new Promise(r => setTimeout(r, 2500))]).finally(() => { renderAccount(); applyName(); route(); });
})();
