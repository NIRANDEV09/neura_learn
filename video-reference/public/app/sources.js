// "Sources" under each AI tutor answer. In Verified mode the server first
// looks the question up on Wikipedia and the tutor answers from those
// passages, putting [n] after each sentence that uses one (lib/retrieve.mjs):
// the markers become numbers linking to the page and the exact passage read.
// (With GEMINI_SEARCH_GROUNDING=true, Gemini's Google Search says which pages
// back which sentences instead, lib/sources.mjs.) Each source is rated against the trusted list:
// Trusted (universities, official docs, standards, encyclopedias, journals),
// Reputable (well-known learning sites) or Not on the trusted list. Sentences
// get numbered markers; a sentence backed only by untrusted pages is marked.
// When the answer was written without searching (another provider answered),
// /api/sources looks for pages that back it afterwards.
(() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const LABEL = { trusted: 'Trusted', reputable: 'Reputable', other: 'Not on the trusted list' };
  // Citation markers ([1], [1][2]) after a space or punctuation, outside code.
  const MARK = /(?:(?<=[\s.,;:!?)"'’])|^)\[(\d{1,2})\]((?:\[\d{1,2}\])*)/g;
  const strip = text => String(text || '').split(/(```[\s\S]*?```|`[^`\n]*`)/).map((p, i) => (i % 2 ? p : p.replace(/[ \t]*(?:(?<=[\s.,;:!?)"'’])|^)\[(\d{1,2})\](?:\[\d{1,2}\])*/gm, ''))).join('');
  function citeLink(bubble, n, trust) {
    const a = el('a', '', String(n)); a.href = '#'; a.dataset.n = n;
    a.addEventListener('click', e => { e.preventDefault(); const box = placeBox(bubble); box.open = true; const item = box.querySelector(`[data-src="${n}"]`); if (item) { item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); item.classList.add('flash'); setTimeout(() => item.classList.remove('flash'), 1200); } });
    return a;
  }
  // Turns the [n] markers written by the tutor into numbered links.
  function linkMarkers(bubble, res) {
    const valid = new Set(res.sources.map(s => s.n)), nodes = [];
    const walk = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('pre,code,sup') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    while (walk.nextNode()) if (/\[\d{1,2}\]/.test(walk.currentNode.nodeValue)) nodes.push(walk.currentNode);
    nodes.forEach(node => {
      const text = node.nodeValue, frag = document.createDocumentFragment();
      let last = 0;
      text.replace(MARK, (m, first, more, at) => {
        const nums = [first, ...(more.match(/\d{1,2}/g) || [])].map(Number).filter(n => valid.has(n));
        frag.append(text.slice(last, at).replace(/\s+$/, ''));
        if (nums.length) { const sup = el('sup', 'cite t-trusted'); nums.forEach((n, i) => { sup.append(citeLink(bubble, n)); if (i < nums.length - 1) sup.append(','); }); sup.title = 'Where this came from: ' + nums.map(n => res.sources[n - 1]?.title || n).join(', '); frag.append(sup); }
        last = at + m.length; return m;
      });
      frag.append(text.slice(last)); node.replaceWith(frag);
    });
  }

  function placeBox(bubble) {
    let box = bubble.parentNode && [...bubble.parentNode.children].find(n => n.classList.contains('sourcesbox') && n.dataset.for === bubble.dataset.srcid);
    if (box) return box;
    bubble.dataset.srcid = bubble.dataset.srcid || String(Date.now() + Math.random());
    box = el('details', 'sourcesbox'); box.dataset.for = bubble.dataset.srcid;
    // After the answer and its token line, before the fact check.
    let after = bubble; while (after.nextElementSibling && after.nextElementSibling.classList.contains('usageline')) after = after.nextElementSibling;
    after.after(box);
    return box;
  }

  // Numbered markers on the sentences each source backs.
  function mark(bubble, res) {
    const sents = [...bubble.querySelectorAll('.sent, li, p')].filter(n => !n.querySelector('.sent'));
    res.claims.forEach(c => {
      const k = key(c.text); if (k.length < 12) return;
      const hit = sents.find(s => { const t = key(s.textContent); return t.length > 8 && (t.includes(k) || k.includes(t)); });
      if (!hit || hit.querySelector('.cite')) return;
      const sup = el('sup', `cite t-${c.trust}`);
      c.sources.slice(0, 3).forEach((n, i) => { const a = el('a', '', String(n)); a.href = '#'; a.dataset.n = n; a.addEventListener('click', e => { e.preventDefault(); const box = placeBox(bubble); box.open = true; box.querySelector(`[data-src="${n}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }); sup.append(a); if (i < Math.min(2, c.sources.length - 1)) sup.append(','); });
      sup.title = c.trust === 'other' ? 'Backed only by sources that are not on the trusted list' : `Backed by a ${c.trust} source`;
      hit.append(sup);
      if (c.trust === 'other') hit.classList.add('cite-weak');
    });
  }

  function sourceItem(s) {
    const li = el('li', `src t-${s.trust}`); li.dataset.src = s.n;
    const num = el('span', 'srcn', String(s.n));
    const body = el('div', 'srcbody');
    const a = el('a', 'srcdomain', s.excerpt ? `Wikipedia · ${s.title}` : (s.domain || s.title || 'source')); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer external';
    body.append(a);
    if (s.excerpt) { const d = el('details', 'srcpassage'); d.append(el('summary', '', 'The passage the tutor read'), el('blockquote', '', s.excerpt)); body.append(d); }
    else if (s.title && s.title !== s.domain) body.append(el('span', 'srctitle', s.title));
    li.append(num, body, el('span', `srcbadge t-${s.trust}`, LABEL[s.trust]));
    return li;
  }

  function render(bubble, res, opts = {}) {
    if (!bubble || !res) return;
    const box = placeBox(bubble); box.replaceChildren(); box.className = 'sourcesbox';
    const sum = el('summary');
    if (!res.sources || !res.sources.length) {
      const quota = res.reason === 'quota', nothing = res.reason === 'nothing-found';
      sum.append(el('span', 'srcmark none', '?'), el('span', '', quota ? 'Sources: the source search is not available right now' : nothing ? 'Sources: no matching trusted article was found' : opts.lookup ? 'Sources: no supporting pages were found' : 'Sources: this answer was not backed by a web search'));
      box.append(sum, el('p', 'srcnote', quota
        ? 'The Google Search quota for this API key is used up (the free tier allows very little; turning on billing for the Google project enables it). The answer was written without searching, so treat it as the tutor\'s own explanation. Verified mode still fact-checks it.'
        : nothing ? 'So this answer is the tutor\'s own explanation, with no outside source behind it. Verified mode still fact-checks it.'
        : 'Treat it as the tutor\'s own explanation. Verified mode still fact-checks it.'));
      return;
    }
    const c = res.counts, backed = res.claims.filter(x => x.trust !== 'other').length;
    if (res.mode === 'retrieved') {
      sum.append(el('span', `srcmark ${c.claims ? 'ok' : 'warn'}`, c.claims ? '✓' : '!'), el('span', '', `Sources: ${res.sources.filter(x => x.used !== false).length || res.sources.length} Wikipedia ${(res.sources.filter(x => x.used !== false).length || res.sources.length) === 1 ? 'article' : 'articles'} used · ${c.claims} of ${c.sentences} sentences say where they came from`));
      box.append(sum);
      const used = res.sources.filter(s => s.used !== false), unused = res.sources.filter(s => s.used === false);
      if (used.length) { const ul = el('ol', 'srclist'); used.forEach(s => ul.append(sourceItem(s))); box.append(ul); }
      if (unused.length) { const d = el('details', 'srcunused'); d.append(el('summary', '', `Also read, not used in the answer (${unused.length})`)); const ul = el('ol', 'srclist'); unused.forEach(s => ul.append(sourceItem(s))); d.append(ul); box.append(d); }
      box.append(el('p', 'srcnote', 'The tutor looked these up before answering and wrote from them. A number after a sentence shows which source it came from; sentences without a number are the tutor\'s own explanation or example. Wikipedia is on the trusted list; open a source to check the passage yourself.'));
      if (!c.claims) box.open = true;
      linkMarkers(bubble, res);
      return;
    }
    sum.append(el('span', `srcmark ${c.trusted ? 'ok' : 'warn'}`, c.trusted ? '✓' : '!'),
      el('span', '', `Sources: ${c.trusted} trusted${c.reputable ? `, ${c.reputable} reputable` : ''}${c.other ? `, ${c.other} other` : ''}${res.claims.length ? ` · ${backed} of ${res.claims.length} statements backed by trusted or reputable sources` : ''}`));
    box.append(sum);
    const good = res.sources.filter(s => s.trust !== 'other'), weak = res.sources.filter(s => s.trust === 'other');
    if (good.length) { const ul = el('ol', 'srclist'); good.forEach(s => ul.append(sourceItem(s))); box.append(ul); }
    if (weak.length) {
      const d = el('details', 'srcweak');
      d.append(el('summary', '', `${weak.length} ${weak.length === 1 ? 'source is' : 'sources are'} not on the trusted list`));
      const ul = el('ol', 'srclist'); weak.forEach(s => ul.append(sourceItem(s))); d.append(ul);
      d.append(el('p', 'srcnote', 'These pages were used, but they are not universities, official documentation, standards bodies, encyclopedias or journals. Statements backed only by them are underlined in the answer.'));
      box.append(d);
    }
    box.append(el('p', 'srcnote', opts.lookup
      ? 'This answer was written without a web search, so these pages were found afterwards to check it. Numbers in the answer link to the pages that back that sentence.'
      : 'Found by Google Search while the answer was written. Numbers in the answer link to the pages that back that sentence.'));
    // Google asks that its search suggestions be shown with grounded answers.
    if (res.widget) {
      const f = el('iframe', 'srcwidget'); f.title = 'Google Search suggestions'; f.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); f.setAttribute('referrerpolicy', 'no-referrer');
      f.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font-family:system-ui,sans-serif}</style>${res.widget}`;
      box.append(f);
    }
    if (!c.trusted && !c.reputable) box.open = true;
    mark(bubble, res);
  }

  async function lookup(topic, text, bubble) {
    if (!bubble || !text) return;
    const box = placeBox(bubble); box.className = 'sourcesbox running';
    box.replaceChildren(el('summary', '', 'Looking for trusted sources in the background…'));
    try {
      const r = await fetch('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, text }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      render(bubble, data, { lookup: true });
    } catch (e) {
      box.className = 'sourcesbox'; box.replaceChildren(el('summary', '', `Sources could not be looked up: ${e.message}`));
    }
  }

  window.Sources = { render, lookup, strip };
})();
