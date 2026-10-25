// Board kit: injected into every AI tutor lecture (the generated lesson that
// runs in the sandboxed iframe), so those lectures get the same teacher's
// pointer as computed lessons.
//
// The lesson can call NL.point(element) for each sentence. Lessons that do not
// are still covered: when the host reports a new beat, the kit watches what the
// lesson changes on screen for a moment and points at the most likely focus.
// The kit never changes the lesson's own elements.
function nlBoardKit() {
  if (window.NL) return;
  const NS = 'http://www.w3.org/2000/svg', DIR = [0.55, 0.835];
  let layer = null, g = null, timers = [], beatAt = 0, pointedAt = 0, changed = [];
  const pt = (d, w) => `${(DIR[0] * d - DIR[1] * w).toFixed(1)},${(DIR[1] * d + DIR[0] * w).toFixed(1)}`;
  const poly = pairs => pairs.map(([d, w]) => pt(d, w)).join(' ');
  // The lesson's own CSS (for example "svg { background: #111 }") must never
  // restyle the pointer, so every property it relies on is set as !important.
  const lock = (el, styles) => { for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important'); return el; };
  const shape = (tag, attrs, fill, stroke) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return lock(e, { fill, stroke: stroke || 'none', 'stroke-width': '1', opacity: '1', filter: 'none', transition: 'none', animation: 'none', visibility: 'visible' });
  };
  function build() {
    if (layer || !document.body) return;
    layer = lock(document.createElementNS(NS, 'svg'), {
      position: 'fixed', left: '0', top: '0', right: 'auto', bottom: 'auto', width: '100vw', height: '100vh', margin: '0', padding: '0', border: '0',
      background: 'none', 'box-shadow': 'none', 'pointer-events': 'none', 'z-index': '2147483646', overflow: 'visible', display: 'block',
      opacity: '1', filter: 'none', transform: 'none', visibility: 'visible', 'max-width': 'none', 'max-height': 'none',
    });
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-nl-kit', '');
    g = lock(document.createElementNS(NS, 'g'), { transition: 'transform .6s cubic-bezier(.33,.9,.3,1), opacity .4s ease', animation: 'none', filter: 'none' });
    g.style.setProperty('opacity', '0', 'important'); g.style.setProperty('transform', 'translate(110vw, 110vh)', 'important');
    g.append(
      shape('polygon', { points: poly([[12, 2], [300, 6.5], [300, -6.5], [12, -2]]), transform: 'translate(6 8)' }, 'rgba(24,33,29,.14)'),
      shape('polygon', { points: poly([[9, 1.6], [230, 4.4], [230, -4.4], [9, -1.6]]) }, '#b5814c', '#7a532f'),
      shape('polygon', { points: poly([[230, 4.8], [300, 6.4], [300, -6.4], [230, -4.8]]) }, '#3b3834'),
      shape('circle', { cx: (DIR[0] * 5).toFixed(1), cy: (DIR[1] * 5).toFixed(1), r: '5' }, '#1f1d1b'));
    layer.append(g);
    document.body.append(layer);
  }
  const visible = r => r.width >= 4 && r.height >= 4 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  function aimAt(el) {
    const r = el.getBoundingClientRect();
    if (!visible(r)) return false;
    const x = r.left + r.width / 2 + Math.min(r.width * 0.3, 26), y = r.top + r.height / 2 + Math.min(r.height * 0.36, 26);
    g.style.setProperty('transform', `translate(${Math.min(innerWidth - 6, x)}px, ${Math.min(innerHeight - 6, y)}px)`, 'important');
    g.style.setProperty('opacity', '1', 'important');
    return true;
  }
  function point(target) {
    build(); if (!g) return;
    pointedAt = Date.now();
    timers.forEach(clearTimeout); timers = [];
    const els = (Array.isArray(target) ? target : [target]).map(t => (typeof t === 'string' ? document.querySelector(t) : t)).filter(e => e && e.getBoundingClientRect);
    if (!els.length) { g.style.setProperty('opacity', '0', 'important'); return; }
    els.slice(0, 6).forEach((el, i) => timers.push(setTimeout(() => aimAt(el), i * 800)));
  }
  // ---- fallback: point at what the lesson just changed ----
  const FOCUS = /active|highlight|current|focus|selected|\bhl\b|\bon\b|glow|pulse/i;
  const SHAPES = /^(circle|rect|ellipse|path|polygon|line|text|g|tspan)$/i;
  function score(el) {
    if (!(el instanceof Element) || !el.isConnected || layer?.contains(el) || el === document.body || el === document.documentElement) return -1;
    const r = el.getBoundingClientRect();
    if (!visible(r)) return -1;
    const area = r.width * r.height, screen = innerWidth * innerHeight;
    if (area > screen * 0.3) return -1;
    let s = 0;
    if (FOCUS.test(el.getAttribute('class') || '') || FOCUS.test(el.id || '')) s += 4;
    if (SHAPES.test(el.tagName)) s += 2;
    if (el.tagName.toLowerCase() === 'svg') s -= 3;
    if (area < screen * 0.0004) s -= 1;
    return s;
  }
  function pickFocus() {
    if (pointedAt >= beatAt) return;
    let best = null, bestScore = 0;
    for (let i = changed.length - 1; i >= 0 && i >= changed.length - 300; i--) {
      const el = changed[i].nodeType === 1 ? changed[i] : changed[i].parentElement, s = score(el);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    if (best) { build(); aimAt(best); }
  }
  const observer = new MutationObserver(list => {
    if (Date.now() - beatAt > 1800) return;
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(n => changed.push(n));
      else changed.push(m.target);
    }
    if (changed.length > 2000) changed = changed.slice(-600);
  });
  addEventListener('message', e => {
    const d = e.data;
    if (!d || d.type !== 'neuralelearn:kit') return;
    if (d.event === 'beat') { beatAt = Date.now(); changed = []; setTimeout(pickFocus, 700); setTimeout(pickFocus, 1500); }
    if (d.event === 'rest' && g) g.style.setProperty('opacity', '0', 'important');
  });
  // The pointer layer is only added when it is first needed, after the lesson
  // has built its own page, so the lesson's "first svg" is never ours.
  const start = () => {
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'fill', 'stroke', 'opacity', 'r', 'transform', 'cx', 'cy', 'x', 'y', 'width', 'height', 'd'] });
  };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
  window.NL = { point, rest() { if (g) g.style.setProperty('opacity', '0', 'important'); } };
}
