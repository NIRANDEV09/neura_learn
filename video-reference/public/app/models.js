// AI model choice. Every request to the app's own API carries the model the
// student picked (x-model). If that model is busy the server answers with the
// next one and says so (x-model-used, x-model-skipped); this file turns that
// into a "model:used" event the shell shows to the student.
(() => {
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  let choice = pref('nl.model') || '';
  const plain = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const ours = /^(\/|https?:\/\/[^/]+\/)api\//.test(url) && (url.startsWith('/') || url.startsWith(location.origin));
    if (ours && choice) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('x-model', choice);
      init = { ...init, headers };
    }
    const req = plain(input, init);
    if (!ours) return req;
    return req.then(r => {
      const used = r.headers.get('x-model-used');
      if (used) document.dispatchEvent(new CustomEvent('model:used', { detail: { used, skipped: (r.headers.get('x-model-skipped') || '').split(',').filter(Boolean) } }));
      // Token counts for the token counter (usage.js).
      try { const u = JSON.parse(r.headers.get('x-usage') || 'null'); if (u) document.dispatchEvent(new CustomEvent('usage', { detail: u })); } catch { /* not reported */ }
      return r;
    });
  };
  window.Models = {
    get choice() { return choice; },
    set(id) { choice = id || ''; pref('nl.model', choice); document.dispatchEvent(new CustomEvent('model:choice', { detail: { id: choice } })); },
  };
})();
