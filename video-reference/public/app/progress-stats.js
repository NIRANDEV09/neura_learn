// Progress numbers for the Progress page, computed from the run log (nl.runs:
// one entry per finished lesson) and the per-lesson records (nl.progress).
// Pure functions with no page access, so tests can run them directly.
// Days are local calendar days (YYYY-MM-DD), so a streak follows the student's
// own midnight.
(function (root) {
  const DAY = 86400000;
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // Steps one calendar day; setDate copes with daylight-saving changes.
  const shift = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

  // Every day with a finished lesson: from runs, saved streak days, and older
  // per-lesson records that only kept their last date.
  function activeDays(runs = [], days = [], progress = {}) {
    const set = new Set(days);
    runs.forEach(r => r.at && set.add(dayKey(r.at)));
    Object.values(progress).forEach(p => p && p.done && p.at && set.add(dayKey(p.at)));
    return set;
  }

  // Current streak counts back from today, or from yesterday when nothing is
  // finished yet today (the streak isn't lost before the day ends).
  function streaks(daySet, now = Date.now()) {
    let current = 0, t = startOfDay(now);
    if (!daySet.has(dayKey(t))) t = shift(t, -1);
    while (daySet.has(dayKey(t))) { current++; t = shift(t, -1); }
    const sorted = [...daySet].sort();
    let longest = 0, run = 0, prev = null;
    for (const d of sorted) {
      const ts = new Date(`${d}T12:00:00`).getTime();
      run = prev != null && dayKey(shift(prev, 1)) === d ? run + 1 : 1;
      longest = Math.max(longest, run); prev = ts;
    }
    return { current, longest: Math.max(longest, current) };
  }

  // The activity calendar: `weeks` columns of 7 days ending this week, Monday
  // first. Each cell: day, lessons finished, time spent, and a level 0-4.
  function activity(runs = [], daySet = new Set(), now = Date.now(), weeks = 17) {
    const byDay = new Map();
    runs.forEach(r => { if (!r.at) return; const k = dayKey(r.at), e = byDay.get(k) || { count: 0, ms: 0 }; e.count++; e.ms += r.ms || 0; byDay.set(k, e); });
    const today = startOfDay(now), dow = (new Date(today).getDay() + 6) % 7; // 0 = Monday
    const end = shift(today, 6 - dow), start = shift(end, -(weeks * 7 - 1));
    const cells = [];
    for (let t = start; t <= end; t = shift(t, 1)) {
      const k = dayKey(t), e = byDay.get(k) || { count: daySet.has(k) ? 1 : 0, ms: 0 };
      cells.push({ day: k, count: e.count, ms: e.ms, future: t > today });
    }
    const max = Math.max(1, ...cells.map(c => c.count));
    cells.forEach(c => { c.level = c.count ? Math.min(4, Math.ceil((c.count / max) * 4)) : 0; });
    return cells;
  }

  // This week (Monday to today) against last week, and a bar per day.
  function week(runs = [], now = Date.now()) {
    const today = startOfDay(now), dow = (new Date(today).getDay() + 6) % 7, monday = shift(today, -dow), lastMonday = shift(monday, -7);
    const sum = (from, to) => runs.filter(r => r.at >= from && r.at < to).reduce((a, r) => ({ lessons: a.lessons + 1, ms: a.ms + (r.ms || 0) }), { lessons: 0, ms: 0 });
    const days = [];
    for (let i = 0; i < 7; i++) {
      const from = shift(monday, i), to = shift(monday, i + 1), s = sum(from, to);
      days.push({ day: dayKey(from), label: new Date(from).toLocaleDateString('en', { weekday: 'short' }), ...s, future: from > today });
    }
    return { thisWeek: sum(monday, shift(today, 1)), lastWeek: sum(lastMonday, monday), days };
  }

  // Checkpoint accuracy from runs that had checkpoints.
  function accuracy(runs = []) {
    const withChecks = runs.filter(r => r.checks > 0);
    const checks = withChecks.reduce((n, r) => n + r.checks, 0), correct = withChecks.reduce((n, r) => n + Math.min(r.correct || 0, r.checks), 0);
    return { checks, correct, pct: checks ? Math.round((correct / checks) * 100) : null };
  }

  // Lessons to look at again: finished but the checkpoint was never right,
  // most recently tried first.
  function needsReview(progress = {}, order = []) {
    return order.filter(id => progress[id] && progress[id].done && !progress[id].right).sort((a, b) => (progress[b].at || 0) - (progress[a].at || 0));
  }

  // One row per run, for spreadsheets. Quotes are doubled and fields quoted.
  function csv(runs = [], names = {}) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['date', 'time', 'lesson', 'minutes', 'checkpoints', 'correct', 'input']];
    [...runs].sort((a, b) => a.at - b.at).forEach(r => {
      const d = new Date(r.at);
      rows.push([dayKey(r.at), d.toTimeString().slice(0, 5), names[r.algo] || r.algo, ((r.ms || 0) / 60000).toFixed(1), r.checks || 0, r.correct || 0, r.input || '']);
    });
    return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  const api = { DAY, dayKey, activeDays, streaks, activity, week, accuracy, needsReview, csv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProgressStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
