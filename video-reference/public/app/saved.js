// Saved lectures: every AI lecture that finishes drawing is saved to the
// signed-in student's Supabase account (account.js, table saved_lectures) and
// listed on the My Library page, where it replays instantly with no AI calls.
// Guests are told once that signing in keeps their lectures.
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const notify = (text, kind = '') => document.dispatchEvent(new CustomEvent('nl:notify', { detail: { text, kind } }));
  const chatNote = text => { if (typeof window.addChat === 'function') { const m = window.addChat('bot', text); if (m) m.classList.add('savednote'); } };
  const signedIn = () => !!(window.Account && Account.enabled && Account.user);
  let hinted = false, cache = null;

  async function save(lec) {
    if (!signedIn()) {
      if (!hinted && window.Account && Account.enabled) { hinted = true; chatNote('Sign in to keep your lectures: finished ones are saved to My Library automatically.'); }
      return;
    }
    try {
      await Account.saveLecture(lec);
      cache = null;
      chatNote(`Saved to My Library: “${lec.title.slice(0, 80)}”`);
      notify(`Lecture saved: ${lec.title.slice(0, 60)}`, 'ok');
      if (!$('screenLibrary').hidden) render();
    } catch (e) {
      const missing = /saved_lectures|schema cache|does not exist/i.test(e.message);
      notify(missing ? 'Saving lectures needs one more database step (supabase/002_saved_lectures.sql).' : `Could not save the lecture: ${e.message}`);
    }
  }

  const when = iso => {
    const d = new Date(iso), today = new Date();
    return d.toDateString() === today.toDateString() ? `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  };

  function card(row) {
    const c = el('article', 'savedcard');
    const top = el('div', 'savedtop');
    top.append(el('span', `ltag ${row.kind === 'doc' ? 'teal' : 'vio'}`, row.kind === 'doc' ? 'PDF lecture' : 'AI lecture'), el('span', 'hint', when(row.created_at)));
    const h = el('h3', '', row.title);
    const meta = el('p', 'hint', `${row.part_count} ${row.part_count === 1 ? 'part' : 'parts'}${row.model ? ` · ${row.model}` : ''}`);
    const actions = el('div', 'savedactions');
    const play = el('button', 'primarybtn small', '▶ Play'); play.type = 'button';
    const dl = el('button', 'ghostbtn small', '⬇ Download'); dl.type = 'button'; dl.title = 'Download as a file that plays offline';
    const del = el('button', 'ghostbtn small', 'Delete'); del.type = 'button';
    play.addEventListener('click', () => open(row.id, play));
    dl.addEventListener('click', () => download(row.id, dl));
    del.addEventListener('click', () => remove(row, del));
    actions.append(play, dl, del);
    c.append(top, h, meta, actions);
    return c;
  }

  async function render() {
    const shelf = $('savedLectures'), list = $('savedList'); if (!shelf) return;
    if (!(window.Account && Account.enabled)) { shelf.hidden = true; return; }
    shelf.hidden = false; list.replaceChildren();
    if (!Account.user) {
      const p = el('div', 'savedempty');
      p.append(el('p', '', 'Sign in and every AI lecture you watch is saved here, ready to replay any time.'));
      const a = el('a', 'primarybtn small', 'Sign in'); a.href = '#/login'; p.append(a);
      list.append(p); $('savedCount').textContent = ''; return;
    }
    list.append(el('p', 'hint', 'Loading your saved lectures…'));
    try {
      cache = cache || await Account.listLectures();
      list.replaceChildren();
      $('savedCount').textContent = cache.length ? `${cache.length} saved` : '';
      if (!cache.length) {
        const p = el('div', 'savedempty');
        p.append(el('p', '', 'No saved lectures yet. Ask the AI tutor anything: each lecture is saved here when it finishes drawing.'));
        const a = el('a', 'ghostbtn small', 'Open the AI tutor'); a.href = '#/tutor'; p.append(a);
        list.append(p); return;
      }
      cache.forEach(row => list.append(card(row)));
    } catch (e) {
      list.replaceChildren(el('p', 'formmsg error', /saved_lectures|schema cache/i.test(e.message)
        ? 'Saved lectures need one more database step: run supabase/002_saved_lectures.sql in the Supabase SQL editor.'
        : `Could not load your saved lectures: ${e.message}`));
    }
  }

  async function open(id, btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Opening…';
    try {
      const lec = await Account.getLecture(id);
      if (!/^#\/tutor/.test(location.hash)) location.hash = '#/tutor';
      // Wait for the tutor screen to be shown, then play.
      for (let t = 0; t < 40 && $('screenLesson').hidden; t++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 60));
      window.playSavedLecture(lec);
    } catch (e) { notify(`Could not open the lecture: ${e.message}`); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  async function download(id, btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    try { window.Download.file(await Account.getLecture(id)); }
    catch (e) { notify(`Could not download the lecture: ${e.message}`); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  async function remove(row, btn) {
    if (!confirm(`Delete “${row.title}” from your saved lectures? This can't be undone.`)) return;
    btn.disabled = true;
    try { await Account.deleteLecture(row.id); cache = cache && cache.filter(r => r.id !== row.id); render(); }
    catch (e) { btn.disabled = false; notify(`Could not delete the lecture: ${e.message}`); }
  }

  document.addEventListener('account:change', () => { cache = null; hinted = false; });
  window.Saved = { save, render };
})();
