// Accounts and cloud sync (Supabase). The browser's localStorage stays the
// working copy, so every page reads its data instantly as before. When a
// student is signed in, each change is also saved to Supabase in the
// background, and on sign-in the saved data and the browser's data are merged
// (so progress made before signing up is kept). Without Supabase configured
// (/api/config returns accounts: null) this file does nothing and the app
// works in the browser only.
//
// Privacy comes from row level security in supabase/schema.sql: the public
// anon key only ever reads and writes the signed-in student's own rows.
(() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
  const json = (k, fallback) => { try { return JSON.parse(pref(k) || '') ?? fallback; } catch { return fallback; } };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const warn = (what, e) => console.warn(`[account] ${what}: ${e?.message || e}`);
  // Personal data kept in the browser; cleared on sign-out so the next person
  // on a shared computer starts clean.
  const PERSONAL = k => k === 'nl.progress' || k === 'nl.days' || k === 'nl.runs' || k === 'nl.name' || k.startsWith('nl.notes.');

  let client = null, user = null, enabled = false, recovering = false;

  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load the sign-in library.'));
    document.head.append(s);
  });

  async function init() {
    try {
      const cfg = (await (await fetch('/api/config')).json()).accounts;
      if (!cfg) return false;
      await loadScript(LIB);
      client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nl.auth' } });
      enabled = true;
      // Read the saved session first, so the INITIAL_SESSION event below is not
      // taken for a new sign-in (that would sync twice).
      const { data } = await client.auth.getSession();
      user = data.session?.user || null;
      client.auth.onAuthStateChange((event, session) => {
        const before = user?.id || null;
        user = session?.user || null;
        if (event === 'PASSWORD_RECOVERY') { recovering = true; setTimeout(() => emit('account:recovery'), 0); }
        // Work outside the callback, as the Supabase docs recommend.
        if ((user?.id || null) !== before) setTimeout(() => changed(before, user), 0);
      });
      if (user) await pull().catch(e => warn('sync', e));
      return true;
    } catch (e) { warn('start', e); enabled = false; return false; }
  }

  async function changed(before, now) {
    if (now) { await pull().catch(e => warn('sync', e)); emit('account:change', { user: now }); return; }
    if (before) { clearLocal(); emit('account:change', { user: null }); }
  }
  function clearLocal() {
    try { Object.keys(localStorage).filter(PERSONAL).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ }
  }

  // ---------- merging ----------
  const toLocal = r => ({ done: r.done, right: r.right, runs: r.runs, ms: Number(r.ms) || 0, input: r.input ?? undefined, target: r.target ?? undefined, at: r.at ? Date.parse(r.at) : undefined });
  const toRow = (id, p) => ({
    user_id: user.id, algorithm: id, done: !!p.done, right: !!p.right, runs: Math.max(0, p.runs | 0), ms: Math.max(0, Math.round(p.ms || 0)),
    input: p.input == null ? null : String(p.input).slice(0, 500), target: p.target == null ? null : String(p.target).slice(0, 20),
    at: p.at ? new Date(p.at).toISOString() : null, updated_at: new Date().toISOString(),
  });
  // A lesson finished on either side stays finished; counts take the larger
  // value; the input comes from whichever side was used last.
  function mergeRec(a = {}, b = {}) {
    const later = (b.at || 0) > (a.at || 0) ? b : a;
    return { ...a, ...b, done: !!(a.done || b.done), right: !!(a.right || b.right), runs: Math.max(a.runs || 0, b.runs || 0), ms: Math.max(a.ms || 0, b.ms || 0), at: Math.max(a.at || 0, b.at || 0) || undefined, input: later.input, target: later.target };
  }
  const same = (a, b) => ['done', 'right', 'runs', 'ms', 'at', 'input', 'target'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null));

  async function pull() {
    if (!client || !user) return;
    const q = (p, what) => p.then(({ data, error }) => { if (error) throw new Error(`${what}: ${error.message}`); return data; });
    const [rows, notes, days, notifs, profile] = await Promise.all([
      q(client.from('topic_progress').select('*'), 'progress'),
      q(client.from('notes').select('key,text'), 'notes'),
      q(client.from('streak_days').select('day'), 'streak'),
      q(client.from('notifications').select('kind,text,created_at').order('created_at', { ascending: false }).limit(20), 'notifications'),
      q(client.from('profiles').select('name,timezone').maybeSingle(), 'profile'),
    ]);
    // Progress: merge, keep the result locally, upload what the browser added.
    const local = json('nl.progress', {}), remote = Object.fromEntries(rows.map(r => [r.algorithm, toLocal(r)]));
    const merged = {}, upload = [];
    for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      merged[id] = mergeRec(local[id], remote[id]);
      if (!same(merged[id], remote[id])) upload.push(toRow(id, merged[id]));
    }
    pref('nl.progress', JSON.stringify(merged));
    if (upload.length) await q(client.from('topic_progress').upsert(upload, { onConflict: 'user_id,algorithm' }), 'save progress');
    // Notes: the saved note wins; notes only in this browser are uploaded.
    const savedKeys = new Set(notes.map(n => n.key));
    notes.forEach(n => pref(`nl.notes.${n.key}`, n.text));
    const localNotes = Object.keys(localStorage).filter(k => k.startsWith('nl.notes.')).map(k => ({ key: k.slice(9), text: pref(k) || '' })).filter(n => n.text && !savedKeys.has(n.key));
    if (localNotes.length) await q(client.from('notes').upsert(localNotes.map(n => ({ user_id: user.id, key: n.key.slice(0, 60), text: n.text.slice(0, 20000), updated_at: new Date().toISOString() })), { onConflict: 'user_id,key' }), 'save notes');
    // Streak days: the union of both.
    const savedDays = new Set(days.map(d => d.day)), localDays = json('nl.days', []);
    pref('nl.days', JSON.stringify([...new Set([...localDays, ...savedDays])].sort()));
    const newDays = localDays.filter(d => !savedDays.has(d));
    if (newDays.length) await q(client.from('streak_days').upsert(newDays.map(day => ({ user_id: user.id, day })), { onConflict: 'user_id,day', ignoreDuplicates: true }), 'save streak');
    // Profile: the saved name wins; otherwise keep the one typed in this browser.
    if (profile?.name) pref('nl.name', profile.name);
    else if (pref('nl.name') || !profile) pushName(pref('nl.name') || user.user_metadata?.name || '');
    await syncRuns().catch(e => warn('run log', e));
    emit('account:notifications', notifs.map(n => ({ kind: n.kind, text: n.text, at: Date.parse(n.created_at) })));
    emit('account:synced');
  }

  // ---------- lesson run log (supabase/003_lesson_runs.sql) ----------
  // Runs have ids made in the browser, so merging is a union by id: the
  // account's runs come down, runs only in this browser go up.
  const MAX_RUNS = 1000;
  const runToRow = r => ({ id: r.id, user_id: user.id, algorithm: String(r.algo).slice(0, 40), finished_at: new Date(r.at).toISOString(), ms: Math.max(0, Math.min(86399999, Math.round(r.ms || 0))), checkpoints: Math.max(0, Math.min(50, r.checks | 0)), correct: Math.max(0, Math.min(r.checks | 0, r.correct | 0)), input: r.input == null ? null : String(r.input).slice(0, 500) });
  const rowToRun = r => ({ id: r.id, algo: r.algorithm, at: Date.parse(r.finished_at), ms: Number(r.ms) || 0, checks: r.checkpoints, correct: r.correct, input: r.input ?? undefined });
  let runsReady = true;
  async function syncRuns() {
    const { data, error } = await client.from('lesson_runs').select('*').order('finished_at', { ascending: false }).limit(MAX_RUNS);
    if (error) { runsReady = false; throw new Error(error.message); }
    runsReady = true;
    const local = json('nl.runs', []), saved = new Set(data.map(r => r.id));
    const merged = new Map([...local, ...data.map(rowToRun)].map(r => [r.id, r]));
    pref('nl.runs', JSON.stringify([...merged.values()].sort((a, b) => a.at - b.at).slice(-MAX_RUNS)));
    const up = local.filter(r => r.id && !saved.has(r.id)).map(runToRow);
    for (let i = 0; i < up.length; i += 200) {
      const { error: e } = await client.from('lesson_runs').upsert(up.slice(i, i + 200), { onConflict: 'id', ignoreDuplicates: true });
      if (e) throw new Error(e.message);
    }
  }
  // Clears the student's progress, streak and run log from the account (notes
  // and saved lectures stay). The page clears the browser copy itself.
  async function resetProgress() {
    if (!client || !user) return;
    for (const t of ['topic_progress', 'streak_days', 'lesson_runs']) {
      const { error } = await client.from(t).delete().eq('user_id', user.id);
      if (error && !(t === 'lesson_runs' && !runsReady)) throw new Error(`${t}: ${error.message}`);
    }
  }

  // ---------- background saves (fire and forget; the next sign-in re-merges) ----------
  const save = (what, p) => { if (client && user) p().then(({ error }) => error && warn(what, error), e => warn(what, e)); };
  const pushProgress = id => save('save progress', () => client.from('topic_progress').upsert(toRow(id, json('nl.progress', {})[id] || {}), { onConflict: 'user_id,algorithm' }));
  const pushNote = (key, text) => save('save note', () => client.from('notes').upsert({ user_id: user.id, key: String(key).slice(0, 60), text: String(text || '').slice(0, 20000), updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }));
  const pushDay = day => save('save streak', () => client.from('streak_days').upsert({ user_id: user.id, day }, { onConflict: 'user_id,day', ignoreDuplicates: true }));
  const pushNotification = n => save('save notification', () => client.from('notifications').insert({ user_id: user.id, kind: String(n.kind || '').slice(0, 20), text: String(n.text).slice(0, 300) }));
  const pushRun = run => { if (runsReady) save('save run', () => client.from('lesson_runs').upsert(runToRow(run), { onConflict: 'id', ignoreDuplicates: true })); };
  const pushName = name => save('save name', () => client.from('profiles').upsert({ id: user.id, name: String(name || '').slice(0, 40), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', updated_at: new Date().toISOString() }));

  // ---------- sign in / up / out ----------
  const nice = e => {
    const m = e?.message || String(e);
    if (/invalid login/i.test(m)) return 'That email and password don\'t match an account.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
    if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Sign in instead.';
    if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    return m;
  };
  const appUrl = () => `${location.origin}/app/`;
  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(nice(error));
  }
  // Returns true when the account is ready, false when the email must be confirmed first.
  async function signUp(email, password, name) {
    if (name) pref('nl.name', name);
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: appUrl() } });
    if (error) throw new Error(nice(error));
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error(nice('already registered'));
    return !!data.session;
  }
  async function signOut() { await client.auth.signOut().catch(e => warn('sign out', e)); user = null; clearLocal(); emit('account:change', { user: null }); }
  async function resetPassword(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (error) throw new Error(nice(error));
  }
  async function setPassword(password) {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(nice(error));
    recovering = false;
  }

  // ---------- saved lectures (supabase/002_saved_lectures.sql) ----------
  const need = () => { if (!client || !user) throw new Error('Sign in to save lectures.'); };
  const rows = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  async function saveLecture(lec) {
    need();
    const parts = lec.parts.map(p => ({ title: String(p.title || '').slice(0, 200), kind: p.kind, text: String(p.text || '').slice(0, 20000), html: p.html, model: p.model || '', pages: p.pages || null }));
    if (JSON.stringify(parts).length > 5_800_000) throw new Error('This lecture is too large to save (over 6 MB).');
    const row = { title: String(lec.title || 'Lecture').slice(0, 200), kind: lec.kind === 'doc' ? 'doc' : 'chat', explanation: String(lec.explanation || '').slice(0, 40000), parts, part_count: parts.length, model: String(lec.model || '').slice(0, 80) };
    return rows(await client.from('saved_lectures').insert(row).select('id').single()).id;
  }
  // The list leaves out the parts (the heavy HTML); a lecture is fetched whole when played.
  const listLectures = async () => (need(), rows(await client.from('saved_lectures').select('id,title,kind,part_count,model,created_at').order('created_at', { ascending: false }).limit(100)));
  const getLecture = async id => (need(), rows(await client.from('saved_lectures').select('*').eq('id', id).single()));
  const deleteLecture = async id => { need(); rows(await client.from('saved_lectures').delete().eq('id', id)); };

  window.Account = {
    saveLecture, listLectures, getLecture, deleteLecture,
    ready: init(),
    get enabled() { return enabled; }, get user() { return user; }, get recovering() { return recovering; },
    signIn, signUp, signOut, resetPassword, setPassword, pull,
    pushProgress, pushNote, pushDay, pushNotification, pushName, pushRun, resetProgress, mergeRec,
    get runsReady() { return runsReady; },
  };
})();
