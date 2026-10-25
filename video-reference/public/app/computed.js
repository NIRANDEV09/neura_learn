// Computed-lesson player. Every frame drawn here is a state recorded by the
// server's tracer while it actually ran the algorithm; the AI only supplies the
// spoken lines. This file owns the board while a computed lesson is active and
// talks to app.js through a few globals (api, addChat, chatStatus, showError).
(() => {
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = String(text); return e; };
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const chat = (role, text) => (typeof addChat === 'function' ? addChat(role, text) : null);
  const status = t => { if (typeof chatStatus === 'function') chatStatus(t); };

  const C = { stats: { t0: 0, checkpoints: [], questions: 0 }, lesson: null, si: 0, bi: 0, playing: false, run: 0, load: 0, spoken: new Set(), answered: new Set(), unlocked: new Set(), asks: 0, cp: null, finishSpeak: null, view: null, firstFrame: null, t0: 0, narration: 'template' };

  // ---------- board ----------
  function takeBoard() {
    ['welcome', 'sceneSvg', 'lessonFrame'].forEach(id => { const e = $(id); if (e) e.hidden = true; });
    $('computedBoard').hidden = false; $('sceneStrip').hidden = false;
    const ts = $('tsub'); if (ts) ts.hidden = true;
  }
  function releaseBoard() { $('computedBoard').hidden = true; $('sceneStrip').hidden = true; hideCheckpoint(); }

  function frameFor(beat) {
    const a = beat.action || { op: 'show' }, steps = C.lesson.trace.steps;
    const idx = a.op === 'step' ? a.index : (Number.isInteger(a.at) ? a.at : null);
    return { idx, state: idx === null ? C.lesson.trace.initial : steps[idx].state, action: a, fact: idx === null ? null : steps[idx].fact };
  }
  // The last real step shown at or before the current beat (for interrupts).
  function stepAtCursor() {
    for (let s = C.si; s >= 0; s--) {
      const beats = C.lesson.scenes[s].beats;
      for (let b = s === C.si ? C.bi : beats.length - 1; b >= 0; b--) { const f = frameFor(beats[b]); if (f.idx !== null) return f.idx; }
    }
    return 0;
  }

  // ---------- tree view ----------
  function treeView(svg, lesson) {
    const data = lesson.visual.data, algo = lesson.algorithm;
    const pos = new Map();
    data.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const d = Math.floor(Math.log2(i + 1)), slot = i - (2 ** d - 1), span = 690 / 2 ** d;
      pos.set(v, { x: 30 + span * (slot + 0.5), y: 70 + d * 108 });
    });
    const gEdges = svgEl('g'), gNodes = svgEl('g'), gPanel = svgEl('g'), gOut = svgEl('g');
    svg.append(gEdges);
    const token = svgEl('g', { class: 'ctoken' }); token.append(svgEl('circle', { r: 38 })); svg.append(token);
    svg.append(gNodes, gPanel, gOut);
    const edges = [];
    data.forEach((v, i) => {
      if (i === 0 || v === null || v === undefined) return;
      const p = data[(i - 1) >> 1], a = pos.get(p), b = pos.get(v);
      const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'tedge' });
      gEdges.append(line); edges.push({ a: p, b: v, line });
    });
    const nodes = new Map();
    for (const [v, p] of pos) {
      const g = svgEl('g', { class: 'tn' }); g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const c = svgEl('circle', { r: 29 }), t = svgEl('text', { y: 8, 'text-anchor': 'middle' }, v);
      const badge = svgEl('g', { class: 'tbadge' }); badge.append(svgEl('circle', { cx: 24, cy: -24, r: 12 }), svgEl('text', { x: 24, y: -19.5, 'text-anchor': 'middle' }, ''));
      g.append(c, t, badge); gNodes.append(g); nodes.set(v, { g, c, badge });
    }
    let lastCurrent = null, anim = null;
    const place = (v) => { const p = pos.get(v); token.style.transform = `translate(${p.x}px, ${p.y}px)`; };
    function update(f) {
      const s = f.state, a = f.action;
      const stack = s.stack || [], out = s.output || [], queue = s.queue || null;
      const hl = new Set(a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : []);
      for (const [v, n] of nodes) {
        n.g.classList.toggle('cur', v === s.current);
        n.g.classList.toggle('onstack', stack.includes(v) && v !== s.current);
        n.g.classList.toggle('inqueue', !!queue && queue.includes(v));
        n.g.classList.toggle('done', out.includes(v));
        n.g.classList.toggle('hl', hl.has(v));
        const k = out.indexOf(v); n.badge.lastChild.textContent = k >= 0 ? k + 1 : '';
        n.c.classList.remove('pulse');
      }
      if (a.op === 'pulse' && nodes.has(a.target)) { const c = nodes.get(a.target).c; void c.getBBox(); requestAnimationFrame(() => c.classList.add('pulse')); }
      const onPath = new Set(stack.concat(s.current === null ? [] : [s.current]));
      const tpath = a.op === 'traverse' ? a.path : [];
      edges.forEach(e => {
        e.line.classList.toggle('path', onPath.has(e.a) && onPath.has(e.b));
        const ia = tpath.indexOf(e.a), ib = tpath.indexOf(e.b);
        e.line.classList.toggle('walk', ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1);
      });
      if (anim) { try { anim.cancel(); } catch {} anim = null; }
      if (a.op === 'traverse') {
        token.style.opacity = 1;
        const frames = a.path.map(v => ({ transform: `translate(${pos.get(v).x}px, ${pos.get(v).y}px)` }));
        place(a.path[a.path.length - 1]);
        try { anim = token.animate(frames, { duration: 650 * a.path.length, easing: 'ease-in-out' }); } catch {}
        lastCurrent = a.path[a.path.length - 1];
      } else if (s.current !== null && s.current !== undefined) {
        token.style.opacity = 1;
        if (lastCurrent === null) { token.style.transition = 'none'; place(s.current); void token.getBBox(); token.style.transition = ''; } else place(s.current);
        lastCurrent = s.current;
      } else { token.style.opacity = 0; }
      // side panel: call stack (DFS) or queue (BFS)
      gPanel.replaceChildren();
      const fname = { inorder: 'inorder', preorder: 'preorder', postorder: 'postorder' }[algo];
      gPanel.append(svgEl('text', { x: 772, y: 48, class: 'plabel' }, queue ? 'QUEUE (front first)' : 'CALL STACK (top first)'));
      const items = queue ? queue.map(v => `${v}`) : [...stack].reverse().map(v => `${fname}(${v})`);
      if (!items.length) gPanel.append(svgEl('text', { x: 772, y: 84, class: 'pempty' }, 'empty'));
      items.slice(0, 9).forEach((label, i) => {
        const g = svgEl('g', { class: `pitem${i === 0 ? ' top' : ''}` }); g.style.transform = `translate(772px, ${62 + i * 42}px)`;
        g.append(svgEl('rect', { width: 190, height: 34, rx: 8 }), svgEl('text', { x: 14, y: 23 }, label)); gPanel.append(g);
      });
      // output row
      gOut.replaceChildren();
      gOut.append(svgEl('text', { x: 30, y: 548, class: 'plabel' }, 'OUTPUT'));
      out.forEach((v, i) => {
        const g = svgEl('g', { class: `obox${i === out.length - 1 && f.action.op === 'step' && C.lesson.trace.steps[f.idx]?.op === 'visit' ? ' new' : ''}` });
        g.style.transform = `translate(${110 + i * 60}px, 520px)`;
        g.append(svgEl('rect', { width: 50, height: 44, rx: 9 }), svgEl('text', { x: 25, y: 29, 'text-anchor': 'middle' }, v)); gOut.append(g);
      });
      const at = v => { const p = pos.get(v); return p && { x: p.x, y: p.y, dx: 18, dy: 20 }; };
      return (a.op === 'pulse' ? [a.target] : a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : s.current !== null && s.current !== undefined ? [s.current] : []).map(at).filter(Boolean);
    }
    return { update };
  }

  // ---------- array view ----------
  function arrayView(svg, lesson) {
    const algo = lesson.algorithm, n = lesson.visual.data.length;
    const w = Math.min(130, 880 / n), x0 = (1000 - n * w) / 2, y0 = 200, fs = Math.round(Math.min(34, w * 0.32));
    const xOf = p => x0 + p * w;
    const gIdx = svgEl('g'), gCells = svgEl('g'), gPtr = svgEl('g'), gRuns = svgEl('g'), gInfo = svgEl('g');
    svg.append(gIdx, gCells, gPtr, gRuns, gInfo);
    for (let p = 0; p < n; p++) gIdx.append(svgEl('text', { x: xOf(p) + w / 2, y: y0 + w * 0.82 + 30, 'text-anchor': 'middle', class: 'aidx' }, p));
    const cells = new Map();
    const ensure = id => {
      if (cells.has(id)) return cells.get(id);
      const g = svgEl('g', { class: 'cell' }), r = svgEl('rect', { x: 3, y: 0, width: w - 6, height: w * 0.82, rx: 10 }), t = svgEl('text', { x: w / 2, y: w * 0.41 + fs * 0.36, 'text-anchor': 'middle', 'font-size': fs });
      g.append(r, t); gCells.append(g); const c = { g, r, t }; cells.set(id, c); return c;
    };
    const ptr = (p, label, cls, row = 0) => {
      const g = svgEl('g', { class: `aptr ${cls}` }); g.style.transform = `translate(${xOf(p) + w / 2}px, ${y0 - 14 - row * 32}px)`;
      g.append(svgEl('path', { d: 'M -8 -11 L 8 -11 L 0 0 Z' }), svgEl('text', { y: -17, 'text-anchor': 'middle' }, label)); gPtr.append(g);
    };
    function update(f) {
      const s = f.state, a = f.action, arr = s.arr, ids = s.ids || arr.map((_, p) => p);
      const hl = new Set(a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : []);
      cells.forEach(c => { c.seen = false; });
      arr.forEach((v, p) => {
        const c = ensure(ids[p]); c.seen = true; c.t.textContent = v;
        const lift = algo === 'insertionsort' && p === s.key ? -26 : 0;
        c.g.style.transform = `translate(${xOf(p)}px, ${y0 + lift}px)`;
        const cls = c.g.classList;
        const has = (k, on) => cls.toggle(k, !!on);
        has('dim', s.discarded && s.discarded[p]);
        has('mid', s.mid === p && algo === 'binarysearch');
        has('found', s.found === p);
        has('cmp', Array.isArray(s.compare) && s.compare.includes(p) || (algo === 'selectionsort' && s.scan === p && s.min !== p));
        has('swapped', s.swapped && Array.isArray(s.compare) && s.compare.includes(p));
        has('sorted', (algo === 'bubblesort' && p >= s.sortedFrom) || (algo === 'selectionsort' && p <= s.sortedTo) || (algo === 'mergesort' && (s.sorted || []).some(r => r[1] > r[0] && p >= r[0] && p <= r[1] && r[0] === 0 && r[1] === n - 1)));
        has('sortedpart', algo === 'insertionsort' && p <= s.sortedTo && p !== s.key);
        has('key', algo === 'insertionsort' && p === s.key);
        has('min', algo === 'selectionsort' && s.min === p);
        has('range', algo === 'mergesort' && s.range && p >= s.range[0] && p <= s.range[1]);
        has('run', algo === 'mergesort' && (s.sorted || []).some(r => r[1] > r[0] && p >= r[0] && p <= r[1]));
        has('write', algo === 'mergesort' && s.k === p && s.left);
        // Slots the merge has not written yet still hold old values: show them as stale.
        has('stale', algo === 'mergesort' && s.left && s.range && p > s.k && p <= s.range[1]);
        has('hl', hl.has(p));
        c.r.classList.remove('pulse');
      });
      cells.forEach(c => { c.g.style.opacity = c.seen ? '' : 0; });
      if (a.op === 'pulse') { const id = ids[a.target]; const c = cells.get(id); if (c) requestAnimationFrame(() => c.r.classList.add('pulse')); }
      gPtr.replaceChildren();
      if (algo === 'binarysearch') {
        const loRow = s.lo === s.mid ? 1 : 0, hiRow = s.hi === s.lo ? loRow + 1 : s.hi === s.mid ? 1 : 0;
        if (s.lo !== null && s.lo !== undefined && s.lo < n) ptr(s.lo, 'lo', 'lo', loRow);
        if (s.hi !== null && s.hi !== undefined && s.hi >= 0) ptr(s.hi, 'hi', 'hi', hiRow);
        if (s.mid !== null && s.mid !== undefined) ptr(s.mid, 'mid', 'midp', 0);
      }
      if (algo === 'selectionsort' && s.i !== null && s.i !== undefined) { ptr(s.i, 'i', 'lo', s.i === s.min ? 1 : 0); if (s.min !== null) ptr(s.min, 'min', 'midp', 0); }
      if (algo === 'insertionsort' && s.key !== null && s.key !== undefined) ptr(s.key, 'key', 'midp', 1);
      if (algo === 'mergesort' && s.left && s.k !== null) ptr(s.k, 'write', 'midp', 0);
      if (a.op === 'traverse') {
        const g = svgEl('g', { class: 'ctoken arr' }); g.append(svgEl('circle', { r: w * 0.5 })); gPtr.prepend(g);
        const at = p => `translate(${xOf(p) + w / 2}px, ${y0 + w * 0.41}px)`;
        g.style.transform = at(a.path[a.path.length - 1]);
        try { g.animate(a.path.map(p => ({ transform: at(p) })), { duration: 600 * a.path.length, easing: 'ease-in-out' }); } catch {}
      }
      // merge sort: the two sorted runs being merged, with their read pointers
      gRuns.replaceChildren();
      if (algo === 'mergesort' && s.left) {
        const rw = Math.min(64, w), ry = 400;
        [[s.left, s.li, 'LEFT RUN'], [s.right, s.ri, 'RIGHT RUN']].forEach(([run, ptrAt, label], side) => {
          const bx = side === 0 ? 500 - 30 - run.length * rw : 530;
          gRuns.append(svgEl('text', { x: bx, y: ry - 14, class: 'plabel' }, label));
          run.forEach((v, k) => {
            const g = svgEl('g', { class: `rcell${k < ptrAt ? ' used' : ''}${k === ptrAt ? ' front' : ''}` }); g.style.transform = `translate(${bx + k * rw}px, ${ry}px)`;
            g.append(svgEl('rect', { x: 2, width: rw - 4, height: rw * 0.8, rx: 8 }), svgEl('text', { x: rw / 2, y: rw * 0.4 + 7, 'text-anchor': 'middle' }, v)); gRuns.append(g);
          });
        });
      }
      gInfo.replaceChildren();
      if (algo === 'binarysearch') gInfo.append(svgEl('text', { x: 40, y: 60, class: 'atarget' }, `Target: ${lesson.visual.target}`));
      const at = p => (Number.isInteger(p) && p >= 0 && p < n ? { x: xOf(p) + w / 2, y: y0 + w * 0.41 + (algo === 'insertionsort' && p === s.key ? -26 : 0), dx: w * 0.22, dy: w * 0.3 } : null);
      const idx = a.op === 'pulse' ? [a.target] : a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path
        : s.found >= 0 ? [s.found] : Array.isArray(s.compare) ? s.compare : s.mid !== null && s.mid !== undefined ? [s.mid]
          : algo === 'insertionsort' && s.key !== null ? [s.key] : algo === 'selectionsort' && s.scan !== null ? [s.scan] : s.left && s.k !== null ? [s.k] : [];
      return idx.map(at).filter(Boolean);
    }
    return { update };
  }

  // Shared by the graph and recursion views: a labelled side panel and an output row.
  function drawPanel(g, label, items) {
    g.replaceChildren();
    g.append(svgEl('text', { x: 772, y: 48, class: 'plabel' }, label));
    if (!items.length) g.append(svgEl('text', { x: 772, y: 84, class: 'pempty' }, 'empty'));
    items.slice(0, 9).forEach((text, i) => {
      const it = svgEl('g', { class: `pitem${i === 0 ? ' top' : ''}` }); it.style.transform = `translate(772px, ${62 + i * 42}px)`;
      it.append(svgEl('rect', { width: 190, height: 34, rx: 8 }), svgEl('text', { x: 14, y: 23 }, text)); g.append(it);
    });
    if (items.length > 9) g.append(svgEl('text', { x: 772, y: 62 + 9 * 42 + 18, class: 'pempty' }, `+${items.length - 9} more`));
  }
  function drawOutput(g, label, values, popNew) {
    g.replaceChildren();
    g.append(svgEl('text', { x: 30, y: 548, class: 'plabel' }, label));
    const x0 = 30 + label.length * 10.5 + 16;
    values.forEach((v, i) => {
      const box = svgEl('g', { class: `obox${popNew && i === values.length - 1 ? ' new' : ''}` });
      box.style.transform = `translate(${x0 + i * 60}px, 520px)`;
      box.append(svgEl('rect', { width: 50, height: 44, rx: 9 }), svgEl('text', { x: 25, y: 29, 'text-anchor': 'middle' }, v)); g.append(box);
    });
  }
  const pulseLater = el => { if (el) { void el.getBBox(); requestAnimationFrame(() => el.classList.add('pulse')); } };
  // Moves a dashed ring along a path of points (traverse actions).
  function walkToken(token, points, msPerHop) {
    const at = p => `translate(${p.x}px, ${p.y}px)`;
    token.style.opacity = 1; token.style.transform = at(points[points.length - 1]);
    try { return token.animate(points.map(p => ({ transform: at(p) })), { duration: msPerHop * points.length, easing: 'ease-in-out' }); } catch { return null; }
  }

  // ---------- graph view (BFS / DFS) ----------
  function graphView(svg, lesson) {
    const edges = lesson.visual.data, start = lesson.visual.start, bfs = lesson.algorithm === 'bfs';
    // Layout only: rows by distance from the start node, ordered to keep edges short.
    // What is lit up in each frame comes entirely from the recorded state.
    const adj = new Map();
    edges.forEach(([a, b]) => { for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); } });
    const depth = new Map([[start, 0]]), order = [start];
    for (let i = 0; i < order.length; i++) for (const u of [...adj.get(order[i])].sort((x, y) => x - y)) if (!depth.has(u)) { depth.set(u, depth.get(order[i]) + 1); order.push(u); }
    const rows = []; order.forEach(v => (rows[depth.get(v)] ||= []).push(v));
    const rowH = Math.min(118, 400 / Math.max(1, rows.length - 1)), r = Math.max(17, Math.min(29, rowH * 0.3));
    const pos = new Map();
    rows.forEach((row, d) => {
      if (d > 0) {
        const bary = v => { const xs = adj.get(v).filter(u => depth.get(u) === d - 1).map(u => pos.get(u).x); return xs.reduce((s, x) => s + x, 0) / xs.length; };
        row.sort((a, b) => bary(a) - bary(b) || a - b);
      }
      const span = 690 / row.length;
      row.forEach((v, i) => pos.set(v, { x: 30 + span * (i + 0.5), y: 80 + d * rowH }));
    });
    const gEdges = svgEl('g'), gNodes = svgEl('g'), gPanel = svgEl('g'), gOut = svgEl('g');
    svg.append(gEdges);
    const token = svgEl('g', { class: 'ctoken' }); token.append(svgEl('circle', { r: r + 9 })); svg.append(token);
    svg.append(gNodes, gPanel, gOut);
    const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const lines = new Map();
    edges.forEach(([a, b]) => {
      const p = pos.get(a), q = pos.get(b);
      // Edges inside one row bend upwards so they never run through the nodes between.
      const d = p.y === q.y ? `M ${p.x} ${p.y} Q ${(p.x + q.x) / 2} ${p.y - Math.min(70, rowH * 0.6)} ${q.x} ${q.y}` : `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
      const line = svgEl('path', { d, class: 'tedge gedge' }); gEdges.append(line); lines.set(key(a, b), { a, b, line });
    });
    const nodes = new Map();
    for (const [v, p] of pos) {
      const g = svgEl('g', { class: `tn${v === start ? ' start' : ''}` }); g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const c = svgEl('circle', { r }), t = svgEl('text', { y: r * 0.28, 'text-anchor': 'middle' }, v); t.style.fontSize = `${Math.round(r * 0.72)}px`;
      const badge = svgEl('g', { class: 'tbadge' }); badge.append(svgEl('circle', { cx: r * 0.83, cy: -r * 0.83, r: 12 }), svgEl('text', { x: r * 0.83, y: -r * 0.83 + 4.5, 'text-anchor': 'middle' }, ''));
      g.append(c, t, badge); gNodes.append(g); nodes.set(v, { g, c, badge });
    }
    let lastCurrent = null, anim = null;
    const place = v => { const p = pos.get(v); token.style.transform = `translate(${p.x}px, ${p.y}px)`; };
    function update(f) {
      const s = f.state, a = f.action, out = s.output || [], visited = s.visited || [];
      const queue = bfs ? (s.queue || []) : null, stack = bfs ? [] : (s.stack || []);
      const hl = new Set(a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : []);
      for (const [v, n] of nodes) {
        n.g.classList.toggle('cur', v === s.current);
        n.g.classList.toggle('onstack', stack.includes(v) && v !== s.current);
        n.g.classList.toggle('inqueue', !!queue && queue.includes(v));
        n.g.classList.toggle('done', out.includes(v) && v !== s.current);
        n.g.classList.toggle('seen', visited.includes(v));
        n.g.classList.toggle('hl', hl.has(v));
        const k = out.indexOf(v); n.badge.lastChild.textContent = k >= 0 ? k + 1 : '';
        n.c.classList.remove('pulse');
      }
      if (a.op === 'pulse' && nodes.has(a.target)) pulseLater(nodes.get(a.target).c);
      const used = new Set((s.treeEdges || []).map(([x, y]) => key(x, y)));
      const checking = s.edge ? key(s.edge[0], s.edge[1]) : null;
      const tpath = a.op === 'traverse' ? a.path : [];
      lines.forEach((e, k) => {
        e.line.classList.toggle('path', used.has(k));
        e.line.classList.toggle('check', k === checking && !s.skipped);
        e.line.classList.toggle('skip', k === checking && !!s.skipped);
        const ia = tpath.indexOf(e.a), ib = tpath.indexOf(e.b);
        e.line.classList.toggle('walk', ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1);
      });
      if (anim) { try { anim.cancel(); } catch {} anim = null; }
      if (a.op === 'traverse') { anim = walkToken(token, a.path.map(v => pos.get(v)), 650); lastCurrent = a.path[a.path.length - 1]; }
      else if (s.current !== null && s.current !== undefined) {
        token.style.opacity = 1;
        if (lastCurrent === null) { token.style.transition = 'none'; place(s.current); void token.getBBox(); token.style.transition = ''; } else place(s.current);
        lastCurrent = s.current;
      } else { token.style.opacity = 0; lastCurrent = null; }
      drawPanel(gPanel, bfs ? 'QUEUE (front first)' : 'CALL STACK (top first)', bfs ? queue.map(String) : [...stack].reverse().map(v => `dfs(${v})`));
      drawOutput(gOut, 'VISIT ORDER', out, f.action.op === 'step' && C.lesson.trace.steps[f.idx]?.op === 'visit');
      const at = v => { const p = pos.get(v); return p && { x: p.x, y: p.y, dx: r * 0.62, dy: r * 0.7 }; };
      return (a.op === 'pulse' ? [a.target] : a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : s.current !== null && s.current !== undefined ? [s.current] : []).map(at).filter(Boolean);
    }
    return { update };
  }

  // ---------- stack / queue view ----------
  function linearView(svg, lesson) {
    const ops = lesson.visual.data, isStack = lesson.visual.type === 'stack', steps = lesson.trace.steps;
    const add = isStack ? 'push' : 'enqueue';
    const most = Math.max(1, ...steps.map(s => s.state.items.length));
    const gOps = svgEl('g'), gBox = svgEl('g'), gItems = svgEl('g'), gInfo = svgEl('g'), gOut = svgEl('g');
    svg.append(gOps, gBox, gItems, gInfo, gOut);
    // The program: every operation, in order. Targets are these indices.
    gOps.append(svgEl('text', { x: 40, y: 52, class: 'plabel' }, 'OPERATIONS'));
    const opH = Math.min(36, 400 / ops.length);
    const rows = ops.map((op, k) => {
      const [verb, arg] = op.split(' ');
      const g = svgEl('g', { class: 'oprow' }); g.style.transform = `translate(40px, ${64 + k * opH}px)`;
      g.append(svgEl('rect', { width: 200, height: opH - 6, rx: 8 }), svgEl('text', { x: 12, y: (opH - 6) / 2 + 5 }, `${k}`), svgEl('text', { x: 40, y: (opH - 6) / 2 + 5, class: 'opcode' }, `${verb}(${arg ?? ''})`));
      gOps.append(g); return g;
    });
    // The container. A stack is a tall box open at the top; a queue is a lane open at both ends.
    const cell = isStack ? Math.min(52, 330 / most) : Math.min(84, 520 / most);
    const geo = isStack
      ? { x: 480, w: 170, bottom: 470, top: 470 - most * cell - 12 }
      : { x: 330, y: 230, h: 76, w: Math.max(cell * most + 24, 460) };
    if (isStack) {
      gBox.append(svgEl('path', { d: `M ${geo.x} ${geo.top} L ${geo.x} ${geo.bottom} L ${geo.x + geo.w} ${geo.bottom} L ${geo.x + geo.w} ${geo.top}`, class: 'lbox' }));
      gBox.append(svgEl('text', { x: geo.x + geo.w / 2, y: geo.bottom + 26, 'text-anchor': 'middle', class: 'plabel' }, 'BOTTOM'));
    } else {
      gBox.append(svgEl('line', { x1: geo.x, y1: geo.y, x2: geo.x + geo.w, y2: geo.y, class: 'lbox' }), svgEl('line', { x1: geo.x, y1: geo.y + geo.h, x2: geo.x + geo.w, y2: geo.y + geo.h, class: 'lbox' }));
      gBox.append(svgEl('text', { x: geo.x, y: geo.y + geo.h + 30, class: 'plabel' }, 'FRONT (dequeue)'), svgEl('text', { x: geo.x + geo.w, y: geo.y + geo.h + 30, 'text-anchor': 'end', class: 'plabel' }, 'BACK (enqueue)'));
    }
    const slot = i => (isStack ? { x: geo.x + 8, y: geo.bottom - 6 - (i + 1) * cell } : { x: geo.x + 12 + i * cell, y: geo.y + 6 });
    const enter = isStack ? { x: geo.x + 8, y: geo.top - cell - 30 } : { x: geo.x + geo.w + 20, y: geo.y + 6 };
    const leave = isStack ? enter : { x: geo.x - cell - 20, y: geo.y + 6 };
    const iw = isStack ? geo.w - 16 : cell - 6, ih = isStack ? cell - 6 : geo.h - 12;
    // One element per value ever added, keyed by the operation that added it.
    const items = new Map();
    ops.forEach((op, k) => {
      if (!op.startsWith(add)) return;
      const g = svgEl('g', { class: 'litem' }); g.style.opacity = 0; g.style.transform = `translate(${enter.x}px, ${enter.y}px)`;
      const rect = svgEl('rect', { width: iw, height: ih, rx: 9 });
      g.append(rect, svgEl('text', { x: iw / 2, y: ih / 2 + Math.min(22, ih * 0.45) * 0.36, 'text-anchor': 'middle', 'font-size': Math.round(Math.min(22, ih * 0.45, iw * 0.4)) }, op.split(' ')[1]));
      gItems.append(g); items.set(k, { g, rect });
    });
    const endPtr = svgEl('g', { class: 'lptr' });
    endPtr.append(isStack ? svgEl('path', { d: 'M 0 0 L -12 -8 L -12 8 Z' }) : svgEl('path', { d: 'M 0 0 L -8 -12 L 8 -12 Z' }), isStack ? svgEl('text', { x: -18, y: 6, 'text-anchor': 'end' }, 'top') : svgEl('text', { y: -18, 'text-anchor': 'middle' }, 'front'));
    gInfo.append(endPtr);
    function update(f) {
      const s = f.state, a = f.action, cur = s.op;
      const hl = new Set(a.op === 'highlight' ? a.targets : []);
      rows.forEach((g, k) => {
        g.classList.toggle('cur', k === cur); g.classList.toggle('past', cur !== null && k < cur);
        g.classList.toggle('err', k === cur && !!s.error); g.classList.toggle('hl', hl.has(k));
        g.firstChild.classList.remove('pulse');
      });
      const present = new Map(s.items.map((it, i) => [it.id, i]));
      items.forEach((it, id) => {
        const i = present.get(id), cls = it.g.classList;
        let p;
        if (i !== undefined) { p = slot(i); it.g.style.opacity = 1; }
        else { p = cur !== null && id <= cur ? leave : enter; it.g.style.opacity = 0; }
        it.g.style.transform = `translate(${p.x}px, ${p.y}px)`;
        cls.toggle('fresh', id === cur);
        cls.toggle('end', i !== undefined && i === (isStack ? s.items.length - 1 : 0));
        cls.toggle('hl', hl.has(id));
        it.rect.classList.remove('pulse');
      });
      if (a.op === 'pulse') { pulseLater(rows[a.target]?.firstChild); if (present.has(a.target)) pulseLater(items.get(a.target).rect); }
      // Pointer to the end that pop / dequeue and peek work on.
      if (s.items.length) {
        const p = slot(isStack ? s.items.length - 1 : 0);
        endPtr.style.opacity = 1;
        endPtr.style.transform = isStack ? `translate(${geo.x - 10}px, ${p.y + ih / 2}px)` : `translate(${p.x + iw / 2}px, ${geo.y - 6}px)`;
      } else endPtr.style.opacity = 0;
      gInfo.querySelectorAll('.lresult').forEach(e => e.remove());
      const step = cur === null ? null : steps[f.idx];
      if (step && (step.op === 'remove' || step.op === 'peek' || step.op === 'underflow')) {
        const g = svgEl('g', { class: `lresult${s.error ? ' err' : ''}` }); g.style.transform = `translate(${isStack ? 720 : 620}px, ${isStack ? 200 : 380}px)`;
        g.append(svgEl('text', { y: -14, class: 'plabel' }, s.error ? 'ERROR' : step.op === 'peek' ? 'PEEK SEES' : 'RETURNED'));
        g.append(svgEl('rect', { width: s.error ? 210 : 90, height: 54, rx: 10 }), svgEl('text', { x: s.error ? 105 : 45, y: 35, 'text-anchor': 'middle' }, s.error ? 'underflow: empty' : s.result));
        gInfo.append(g);
      }
      drawOutput(gOut, isStack ? 'POPPED IN ORDER' : 'DEQUEUED IN ORDER', s.output || [], step?.op === 'remove');
      const row = k => ({ x: 210, y: 64 + k * opH + (opH - 6) / 2, dx: 10, dy: 8 });
      const item = id => { const i = present.get(id); if (i === undefined) return null; const q = slot(i); return { x: q.x + iw / 2, y: q.y + ih / 2, dx: iw * 0.3, dy: ih * 0.35 }; };
      if (a.op === 'pulse') return [item(a.target) || row(a.target)];
      if (a.op === 'highlight') return a.targets.map(row);
      if (!step) return [];
      if (step.op === 'add') return [item(cur)].filter(Boolean);
      if (step.op === 'remove') return [{ x: (isStack ? 720 : 620) + 45, y: (isStack ? 200 : 380) + 27, dx: 22, dy: 16 }];
      if (step.op === 'peek') return [item(s.items[isStack ? s.items.length - 1 : 0].id)].filter(Boolean);
      return [row(cur)];
    }
    return { update };
  }

  // ---------- recursion tree view (fib) ----------
  function recursionView(svg, lesson) {
    const calls = lesson.visual.calls, kids = calls.map(() => []);
    calls.forEach(c => { if (c.parent !== null) kids[c.parent].push(c.id); });
    // Tidy layout: leaves left to right in call order, each parent centred over its children.
    const xs = [], leaves = calls.filter(c => !kids[c.id].length).length, slotW = 700 / leaves;
    let nextLeaf = 0;
    (function place(id) { if (!kids[id].length) { xs[id] = 30 + slotW * (nextLeaf++ + 0.5); return; } kids[id].forEach(place); xs[id] = (xs[kids[id][0]] + xs[kids[id][kids[id].length - 1]]) / 2; })(0);
    const maxD = Math.max(...calls.map(c => c.depth)), rowH = Math.min(100, 400 / Math.max(1, maxD));
    const bw = Math.min(92, slotW - 6), bh = Math.min(44, rowH * 0.55), fs = Math.round(Math.min(18, bw / 3.4));
    const pos = calls.map(c => ({ x: xs[c.id], y: 78 + c.depth * rowH }));
    const gEdges = svgEl('g'), gNodes = svgEl('g'), gPanel = svgEl('g'), gInfo = svgEl('g');
    svg.append(gEdges);
    const token = svgEl('g', { class: 'ctoken' }); token.append(svgEl('rect', { x: -bw / 2 - 8, y: -bh / 2 - 8, width: bw + 16, height: bh + 16, rx: 14, class: 'tokrect' })); token.style.opacity = 0; svg.append(token);
    svg.append(gNodes, gPanel, gInfo);
    const edges = calls.filter(c => c.parent !== null).map(c => {
      const line = svgEl('line', { x1: pos[c.parent].x, y1: pos[c.parent].y, x2: pos[c.id].x, y2: pos[c.id].y, class: 'tedge' }); gEdges.append(line); return { a: c.parent, b: c.id, line };
    });
    const nodes = calls.map(c => {
      const g = svgEl('g', { class: 'rn' }); g.style.transform = `translate(${pos[c.id].x}px, ${pos[c.id].y}px)`;
      const rect = svgEl('rect', { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: 10 });
      const badge = svgEl('g', { class: 'tbadge' }); badge.append(svgEl('circle', { cx: bw / 2 - 2, cy: -bh / 2 - 2, r: 12 }), svgEl('text', { x: bw / 2 - 2, y: -bh / 2 + 2.5, 'text-anchor': 'middle' }, ''));
      g.append(rect, svgEl('text', { y: fs * 0.36, 'text-anchor': 'middle', 'font-size': fs }, `fib(${c.arg})`), badge); gNodes.append(g); return { g, rect, badge };
    });
    // A call whose argument an earlier call already worked on is repeated work.
    const repeat = calls.map(c => calls.some(o => o.id < c.id && o.arg === c.arg));
    let anim = null;
    function update(f) {
      const s = f.state, a = f.action, stack = s.stack || [];
      const hl = new Set(a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : []);
      nodes.forEach((n, id) => {
        const cls = n.g.classList, made = id < s.made, done = s.ret[id] !== null;
        cls.toggle('future', !made);
        cls.toggle('cur', id === s.current);
        cls.toggle('onstack', stack.includes(id) && id !== s.current);
        cls.toggle('done', done);
        cls.toggle('repeat', made && repeat[id]);
        cls.toggle('hl', hl.has(id));
        n.badge.lastChild.textContent = done ? s.ret[id] : '';
        n.rect.classList.remove('pulse');
      });
      edges.forEach(e => {
        e.line.classList.toggle('future', e.b >= s.made);
        e.line.classList.toggle('path', stack.includes(e.a) && stack.includes(e.b));
        const tp = a.op === 'traverse' ? a.path : [], ia = tp.indexOf(e.a), ib = tp.indexOf(e.b);
        e.line.classList.toggle('walk', ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1);
      });
      if (a.op === 'pulse' && nodes[a.target]) pulseLater(nodes[a.target].rect);
      if (anim) { try { anim.cancel(); } catch {} anim = null; }
      if (a.op === 'traverse') anim = walkToken(token, a.path.map(id => pos[id]), 600);
      else token.style.opacity = 0;
      drawPanel(gPanel, 'CALL STACK (top first)', [...stack].reverse().map(id => `fib(${calls[id].arg})`));
      gInfo.replaceChildren();
      gInfo.append(svgEl('text', { x: 30, y: 548, class: 'plabel' }, `CALLS MADE: ${s.made}`));
      if (s.ret[0] !== null) gInfo.append(svgEl('text', { x: 250, y: 550, class: 'rresult' }, `fib(${calls[0].arg}) = ${s.ret[0]}`));
      if (calls.some((c, id) => repeat[id] && id < s.made)) {
        const g = svgEl('g', { class: 'rlegend' }); g.style.transform = 'translate(560px, 543px)';
        g.append(svgEl('rect', { x: -14, y: -11, width: 28, height: 22, rx: 6 }), svgEl('text', { x: 24, y: 5, class: 'pempty' }, 'repeated work')); gInfo.append(g);
      }
      const at = id => (pos[id] && (id < s.made || a.op !== 'step') ? { x: pos[id].x, y: pos[id].y, dx: bw * 0.32, dy: bh * 0.42 } : null);
      return (a.op === 'pulse' ? [a.target] : a.op === 'highlight' ? a.targets : a.op === 'traverse' ? a.path : s.current !== null ? [s.current] : []).map(at).filter(Boolean);
    }
    return { update };
  }

  // ---------- the teacher's pointer ----------
  // A pointing stick that moves to whatever the current line is about, the way
  // a lecturer points at the board. It only ever points at elements the view
  // drew from the recorded state.
  function makePointer(svg) {
    const DIR = [0.55, 0.835]; // from the tip towards the handle: down and to the right
    const pt = (d, w) => `${(DIR[0] * d - DIR[1] * w).toFixed(1)},${(DIR[1] * d + DIR[0] * w).toFixed(1)}`;
    const poly = pairs => pairs.map(([d, w]) => pt(d, w)).join(' ');
    const g = svgEl('g', { class: 'tpointer rest' }), stick = svgEl('g', { class: 'tpstick' });
    stick.append(
      svgEl('polygon', { class: 'tpshadow', points: poly([[12, 2], [320, 7], [320, -7], [12, -2]]), transform: 'translate(7 9)' }),
      svgEl('polygon', { class: 'tprod', points: poly([[9, 1.8], [250, 4.8], [250, -4.8], [9, -1.8]]) }),
      svgEl('polygon', { class: 'tpgrip', points: poly([[250, 5.2], [330, 7], [330, -7], [250, -5.2]]) }),
      svgEl('circle', { class: 'tptip', cx: (DIR[0] * 5).toFixed(1), cy: (DIR[1] * 5).toFixed(1), r: 5.5 }));
    g.append(svgEl('circle', { class: 'tpripple', r: 10 }), stick);
    svg.append(g);
    let timers = [];
    const place = (x, y) => { g.style.transform = `translate(${x}px, ${y}px)`; };
    const tap = () => { g.classList.remove('tap'); void g.getBBox(); g.classList.add('tap'); };
    place(1010, 720);
    function aim(points, hopMs) {
      timers.forEach(clearTimeout); timers = [];
      if (!points.length) { g.classList.add('rest'); place(1010, 720); return; }
      g.classList.remove('rest');
      points.slice(0, 8).forEach((q, i) => timers.push(setTimeout(() => { place(q.x + q.dx, q.y + q.dy); timers.push(setTimeout(tap, 480)); }, i * hopMs)));
    }
    return { aim };
  }
  // Subtitles light up word by word as the line is spoken.
  function subtitle(text) {
    const box = $('csub'); box.replaceChildren();
    C.subText = text; C.words = []; C.wordEnds = [];
    const total = text.length || 1; let at = 0;
    text.split(/(\s+)/).forEach(w => {
      if (!w) return;
      at += w.length;
      if (/^\s+$/.test(w)) { box.append(w); return; }
      const sp = document.createElement('span'); sp.textContent = w; box.append(sp);
      C.words.push(sp); C.wordEnds.push(at / total);
    });
  }
  function spoken(p) { C.words.forEach((w, i) => { w.classList.toggle('said', C.wordEnds[i] <= p + 0.02); w.classList.toggle('now', C.wordEnds[i] > p + 0.02 && (i === 0 || C.wordEnds[i - 1] <= p + 0.02)); }); }
  function sceneCard(sc) {
    const card = $('cscene'); if (!card) return;
    card.replaceChildren(Object.assign(document.createElement('span'), { textContent: sc.kind === 'answer' ? 'Your question' : `Scene ${C.si + 1}` }), Object.assign(document.createElement('strong'), { textContent: sc.title }));
    card.hidden = false; card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    clearTimeout(C.cardTimer); C.cardTimer = setTimeout(() => { card.hidden = true; }, 1900);
  }

  const VIEWS = { tree: treeView, array: arrayView, graph: graphView, stack: linearView, queue: linearView, recursion: recursionView };

  // ---------- scene strip, subtitles, trace chip ----------
  // Scene cards under the player: icon, number and title, with done and now states.
  const SCENE_ICON = { intro: 'bulb', misconception: 'alert', remedial: 'replay', recap: 'list', answer: 'question' };
  const KIND_NAME = { intro: 'Introduction', trace: 'Walkthrough', misconception: 'Common mistake', remedial: 'Second explanation', recap: 'Recap', answer: 'Your question' };
  const useIcon = (name, cls = 'ic') => { const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', cls); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', `#i-${name}`); svg.append(u); return svg; };
  function renderStrip() {
    const strip = $('sceneStrip'); strip.replaceChildren();
    let n = 0;
    C.lesson.scenes.forEach((s, i) => {
      if (s.kind === 'remedial' && !C.unlocked.has(s.id)) return;
      n++;
      const b = document.createElement('button');
      const done = i < C.si || s.beats.every(bt => C.spoken.has(bt.id));
      b.type = 'button'; b.className = `schip scard k-${s.kind}${i === C.si ? ' on' : ''}${done && i !== C.si ? ' past' : ''}`;
      const icon = s.kind === 'trace' ? (C.lesson.visual.type === 'array' || C.lesson.visual.type === 'stack' || C.lesson.visual.type === 'queue' ? 'list' : 'tree') : SCENE_ICON[s.kind] || 'list';
      const title = document.createElement('span'); title.className = 'sctitle'; title.textContent = `${n}. ${s.title}`;
      const kind = document.createElement('span'); kind.className = 'sckind'; kind.textContent = KIND_NAME[s.kind] || s.kind;
      b.append(useIcon(icon, 'ic scicon'), title, kind);
      if (i === C.si) b.append(useIcon('play', 'ic scbadge now'));
      else if (done) b.append(useIcon('check', 'ic scbadge ok'));
      b.addEventListener('click', () => { pause(); C.si = i; C.bi = 0; play(); });
      strip.append(b);
    });
    const on = strip.querySelector('.on'); if (on) try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch {}
  }
  function showBeat() {
    const L = C.lesson, sc = L.scenes[C.si], beat = sc.beats[C.bi], f = frameFor(beat);
    const focus = C.view.update(f) || [];
    if (C.pointer) C.pointer.aim(focus, f.action.op === 'traverse' ? 650 : 850);
    if (C.bi === 0 && C.cardFor !== sc.id) { C.cardFor = sc.id; sceneCard(sc); }
    subtitle(beat.say);
    if (window.Voice && $('voiceToggle').checked) Voice.prefetch(upcoming());
    const N = L.trace.steps.length;
    $('ctrace').innerHTML = f.idx === null
      ? `<span class="ctag">COMPUTED TRACE</span><span>Starting state · ${N} recorded steps</span>`
      : `<span class="ctag">STEP ${f.idx + 1}/${N}</span><span></span>`;
    if (f.idx !== null) $('ctrace').lastChild.textContent = f.fact;
    $('lessonTitle').textContent = L.title;
    $('sceneCounter').textContent = `Step ${C.si + 1} of ${L.scenes.length}`;
    $('sceneKind').textContent = `Live lesson · ${KIND_NAME[sc.kind] || sc.kind}`;
    const total = L.scenes.length; $('progressFill').style.width = `${((C.si + (C.bi + 1) / sc.beats.length) / total) * 100}%`;
    renderStrip();
    document.dispatchEvent(new CustomEvent('computed:beat', { detail: { lesson: L, si: C.si, bi: C.bi, idx: f.idx } }));
    if (C.firstFrame === null) {
      C.firstFrame = Math.round(performance.now() - C.t0);
      chat('bot', `${L.title}: the tracer ran the algorithm and recorded ${N} real execution steps. Every frame on the board is one of them. First frame in ${C.firstFrame} ms.`);
      (L.notes || []).forEach(n => chat('bot', n));
    }
  }

  // ---------- speech ----------
  // The scenes this lesson will play next, as groups of lines, so the natural
  // voice can record each scene in one request before it is needed.
  function upcoming(scenes = 3) {
    const groups = [], L = C.lesson;
    for (let si = C.si, n = 0; si >= 0 && n < scenes; si = nextScene(si), n++) {
      const sc = L.scenes[si];
      groups.push(sc.beats.map(b => b.say));
      if (sc.checkpoint && !C.answered.has(sc.id)) { const cp = sc.checkpoint; groups.push([cp.q, `Correct: ${cp.answer}.`, `Not quite. The answer is ${cp.answer}. Let's look at it another way.`]); }
    }
    return groups;
  }
  function speak(text, run) {
    return new Promise(resolve => {
      const rate = Number($('speed').value) || 1;
      const voiceOn = !!window.Voice && $('voiceToggle').checked;
      const est = text.split(/\s+/).length * 60000 / (160 * rate) + 500;
      let done = false, raf = 0;
      const progress = p => { if (C.subText === text) spoken(p); };
      const fin = () => { if (done) return; done = true; clearTimeout(timer); cancelAnimationFrame(raf); C.finishSpeak = null; progress(1); resolve(); };
      // Safety net in case a voice never reports that it finished.
      const timer = setTimeout(fin, voiceOn ? est * 3 + 12000 : est);
      C.finishSpeak = fin;
      if (run !== C.run) return;
      if (!voiceOn) { const t0 = performance.now(); const tick = () => { if (done) return; progress((performance.now() - t0) / est); raf = requestAnimationFrame(tick); }; tick(); return; }
      Voice.speak(text, { rate, onProgress: progress, onWait: on => { $('csub').classList.toggle('waiting', on); } }).then(fin, fin);
    });
  }
  function silence() { if (window.Voice) Voice.stop(); if (C.finishSpeak) C.finishSpeak(); }

  // ---------- playback ----------
  const playBtn = t => { const b = $('playBtn'); if (b) { b.textContent = t; b.disabled = false; } const r = $('resetBtn'); if (r) r.disabled = false; };
  function nextScene(i) {
    for (let j = i + 1; j < C.lesson.scenes.length; j++) { const s = C.lesson.scenes[j]; if (s.kind !== 'remedial' || C.unlocked.has(s.id)) return j; }
    return -1;
  }
  async function play() {
    if (!C.lesson || C.playing) return;
    hideCheckpoint();
    C.playing = true; const run = ++C.run; playBtn('Ⅱ Pause');
    while (C.playing && run === C.run) {
      const sc = C.lesson.scenes[C.si], beat = sc.beats[C.bi];
      showBeat();
      await speak(beat.say, run);
      if (run !== C.run) return;
      C.spoken.add(beat.id);
      if (C.bi < sc.beats.length - 1) { C.bi++; continue; }
      if (sc.checkpoint && !C.answered.has(sc.id)) {
        const jump = await askCheckpoint(sc, run);
        if (run !== C.run) return;
        if (jump !== null) { C.si = jump; C.bi = 0; continue; }
      }
      const nx = nextScene(C.si);
      if (nx < 0) { C.playing = false; playBtn('↺ Replay lesson'); status('Lesson finished · ask a question or try another algorithm'); finished(); return; }
      C.si = nx; C.bi = 0;
    }
  }
  // Tells the app shell the lesson reached its end, with what the student did.
  function finished() {
    document.dispatchEvent(new CustomEvent('computed:finish', { detail: { lesson: C.lesson, checkpoints: [...C.stats.checkpoints], questions: C.stats.questions, ms: Math.round(performance.now() - C.stats.t0) } }));
  }
  function pause() { C.run++; C.playing = false; silence(); if (C.lesson) playBtn('▶ Resume'); }
  function toggle() { if (C.playing) pause(); else { if (C.si === C.lesson.scenes.length - 1 && C.bi === C.lesson.scenes[C.si].beats.length - 1 && C.spoken.has(C.lesson.scenes[C.si].beats[C.bi].id) && !C.cp) { C.si = 0; C.bi = 0; } play(); } }
  function replay() { pause(); C.si = 0; C.bi = 0; C.answered.clear(); C.unlocked = new Set(); C.stats = { t0: performance.now(), checkpoints: [], questions: 0 }; play(); }

  // ---------- checkpoints ----------
  function hideCheckpoint() { const b = $('ccheck'); if (b) { b.hidden = true; b.replaceChildren(); } }
  function askCheckpoint(sc, run) {
    return new Promise(resolve => {
      const cp = sc.checkpoint, box = $('ccheck');
      C.cp = { sc, resolve, run };
      box.replaceChildren();
      const q = document.createElement('p'); q.className = 'cq'; q.textContent = cp.q;
      const opts = document.createElement('div'); opts.className = 'copts';
      cp.options.forEach(o => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o;
        b.addEventListener('click', () => answer(o));
        opts.append(b);
      });
      const tag = document.createElement('span'); tag.className = 'ctag'; tag.textContent = 'CHECKPOINT · answer computed from the trace';
      box.append(tag, q, opts); box.hidden = false;
      subtitle(cp.q); if (C.pointer) C.pointer.aim([], 0);
      speak(cp.q, run);
    });
  }
  async function answer(option) {
    if (!C.cp) return;
    const { sc, resolve, run } = C.cp, cp = sc.checkpoint; C.cp = null;
    C.answered.add(sc.id);
    const right = option === cp.answer;
    C.stats.checkpoints.push({ q: cp.q, answer: cp.answer, chosen: option, right });
    document.dispatchEvent(new CustomEvent('computed:checkpoint', { detail: { q: cp.q, answer: cp.answer, chosen: option, right } }));
    chat('user', `Checkpoint: ${option}`);
    let jump = null;
    if (!right && cp.onWrong) {
      const j = C.lesson.scenes.findIndex(s => s.id === cp.onWrong);
      if (j >= 0) { jump = j; C.unlocked.add(cp.onWrong); }
    }
    const msg = right ? `Correct: ${cp.answer}.` : `Not quite. The answer is ${cp.answer}. Let's look at it another way.`;
    chat('bot', msg);
    const box = $('ccheck'); box.querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.toggle('right', b.textContent === cp.answer); b.classList.toggle('wrong', b.textContent === option && !right); });
    subtitle(msg);
    const stillPlaying = run === C.run && C.playing;
    await speak(msg, C.run);
    hideCheckpoint();
    if (stillPlaying && run === C.run) resolve(jump);
    else { // answered while paused: move there and resume
      if (jump !== null) { C.si = jump; C.bi = 0; } else { const nx = nextScene(C.si); if (nx >= 0) { C.si = nx; C.bi = 0; } }
      play();
    }
  }

  // ---------- interrupt the professor ----------
  async function ask(question) {
    const L = C.lesson, load = C.load;
    const sc = L.scenes[C.si], stepIndex = stepAtCursor();
    pause(); hideCheckpoint(); C.cp = null; C.stats.questions++;
    const thinking = chat('bot', `Pausing at step ${stepIndex + 1} to answer with new animated scenes…`); if (thinking) thinking.classList.add('thinking');
    status('Building answer scenes from the trace…');
    try {
      const res = await api('/api/interrupt', { algorithm: L.algorithm, data: L.visual.data, target: L.visual.start ?? L.visual.target, stepIndex, sceneTitle: sc.title, question, offline: instant() }, 60000);
      if (thinking) thinking.remove();
      if (load !== C.load) return;
      const inserted = res.scenes.map(s => ({ ...s, title: s.title }));
      // Split the current scene so the lesson resumes right after this beat.
      const cur = L.scenes[C.si], tail = cur.beats.slice(C.bi + 1), rest = [];
      if (tail.length) {
        const cont = { ...cur, id: `${cur.id}-cont${++C.asks}`, title: `${cur.title.replace(/ \(continued\)$/, '')} (continued)`, beats: tail };
        cur.beats = cur.beats.slice(0, C.bi + 1);
        if (cur.checkpoint) { cont.checkpoint = cur.checkpoint; delete cur.checkpoint; }
        if (C.unlocked.has(cur.id)) C.unlocked.add(cont.id);
        rest.push(cont);
      }
      L.scenes.splice(C.si + 1, 0, ...inserted, ...rest);
      C.si += 1; C.bi = 0;
      chat('bot', res.source === 'ai'
        ? `Inserted ${inserted.length} new ${inserted.length === 1 ? 'scene' : 'scenes'} at step ${res.stepIndex + 1}. They replay real recorded steps.`
        : `Replaying the recorded steps around step ${res.stepIndex + 1} (AI answer unavailable: ${res.reason}).`);
      status('Answer playing · the lesson resumes after it');
      play();
    } catch (e) {
      if (thinking) thinking.remove();
      chat('bot', `Could not answer that: ${e.message}`);
      if (typeof showError === 'function') showError(`Question failed: ${e.message}`);
    }
  }

  // ---------- lesson loading ----------
  const instant = () => { const t = $('instantToggle'); return !!(t && t.checked); };
  function load(lesson) {
    pause(); hideCheckpoint();
    C.lesson = lesson; C.si = 0; C.bi = 0; C.load++; C.spoken = new Set(); C.answered = new Set(); C.unlocked = new Set(); C.cp = null;
    C.stats = { t0: performance.now(), checkpoints: [], questions: 0 };
    const svg = $('csvg'); svg.replaceChildren();
    C.view = (VIEWS[lesson.visual.type] || arrayView)(svg, lesson);
    C.pointer = makePointer(svg); C.cardFor = null;
    document.dispatchEvent(new CustomEvent('computed:load', { detail: { lesson } }));
    ['prevBeat', 'nextBeat'].forEach(id => { const b = $(id); if (b) b.disabled = false; });
    takeBoard();
  }
  function mergeNarration(aiLesson) {
    const lines = new Map(aiLesson.scenes.flatMap(s => s.beats.map(b => [b.id, b.say])));
    const current = C.lesson.scenes[C.si]?.beats[C.bi]?.id;
    let n = 0;
    // Lines the natural voice has already recorded keep their wording, so voice and subtitle match.
    C.lesson.scenes.forEach(s => s.beats.forEach(b => { if (!C.spoken.has(b.id) && b.id !== current && lines.has(b.id) && !(window.Voice && Voice.hasLine(b.say))) { b.say = lines.get(b.id); n++; } }));
    return n;
  }
  // Plays a lesson the server already built. request is what built it ({topic}
  // or {algorithm, input, target}); it is sent again to fetch AI narration.
  function start(lesson, request, t0) {
    if (typeof leaveCodeMode === 'function') leaveCodeMode();
    C.firstFrame = null; C.t0 = t0 || performance.now();
    load(lesson);
    const conn = $('connection'); if (conn) { conn.className = 'status ok'; conn.innerHTML = '<i></i> Computed lesson · tracer'; }
    status('Lesson playing · type a question to pause and ask about this step');
    play();
    if (!instant()) {
      const myLoad = C.load;
      api('/api/computed-lesson', { ...request, narrate: 'ai' }, 60000).then(r => {
        if (myLoad !== C.load || !r.supported || r.lesson.lessonId !== C.lesson.lessonId) return;
        if (r.narration.source === 'ai') {
          const n = mergeNarration(r.lesson);
          if (conn) conn.innerHTML = `<i></i> Computed lesson · ${r.narration.model} narration`;
          status(`AI narration ready (${r.narration.ms} ms): ${n} upcoming lines updated, ${r.narration.rejected} rejected by the fact check.`);
        } else status(`Using template narration (${r.narration.reason || 'AI unavailable'}).`);
      }).catch(() => {});
    }
  }
  // Draws a lesson's starting picture into another SVG (the topic page preview).
  function preview(svg, lesson) {
    svg.replaceChildren();
    const steps = lesson.trace.steps, end = lesson.visual.type === 'recursion';
    const view = (VIEWS[lesson.visual.type] || arrayView)(svg, lesson);
    view.update(end ? { idx: steps.length - 1, state: steps[steps.length - 1].state, action: { op: 'show', at: steps.length - 1 }, fact: null } : { idx: null, state: lesson.trace.initial, action: { op: 'show' }, fact: null });
    return end ? 'The call tree this lesson builds' : 'Starting state';
  }

  // Entry point for every chat message. Returns 'lesson', 'answer' or false.
  // A supported topic starts a lesson, except a question about the lesson that
  // is already playing ("why does inorder go left here?"), which interrupts it.
  const active = () => !!C.lesson && !$('computedBoard').hidden;
  async function handle(text, beforeStart) {
    let data = null;
    C.t0 = performance.now();
    try { data = await api('/api/computed-lesson', { topic: text, narrate: 'template' }, 20000); }
    catch (e) { if (!active()) return false; }
    const isQuestion = /\?\s*$|^(why|how|what|when|where|which|who|can|could|does|do|did|is|are|should|wait|but)\b/i.test(text.trim());
    if (data && data.supported) {
      const sameLesson = active() && data.lesson.lessonId === C.lesson.lessonId;
      if (!(sameLesson && isQuestion)) {
        // A new topic opens its topic page, so the student can check the input first.
        if (window.Shell) { pause(); window.Shell.openTopic(data); return 'lesson'; }
        if (beforeStart) beforeStart();
        start(data.lesson, { topic: text }, C.t0); return 'lesson';
      }
    }
    if (active()) { await ask(text); return 'answer'; }
    return false;
  }
  function deactivate() { pause(); C.lesson = null; C.load++; releaseBoard(); ['prevBeat', 'nextBeat'].forEach(id => { const b = $(id); if (b) b.disabled = true; }); }

  // ---------- stepping, keyboard and click-to-ask ----------
  // Back and Next move one line at a time without speaking; Play resumes from there.
  function stepBeat(delta) {
    if (!C.lesson) return;
    pause(); hideCheckpoint(); C.cp = null;
    const scenes = C.lesson.scenes;
    if (delta > 0) {
      if (C.bi < scenes[C.si].beats.length - 1) C.bi++;
      else { const nx = nextScene(C.si); if (nx >= 0) { C.si = nx; C.bi = 0; } }
    } else if (C.bi > 0) C.bi--;
    else {
      let j = C.si - 1;
      while (j >= 0 && scenes[j].kind === 'remedial' && !C.unlocked.has(scenes[j].id)) j--;
      if (j >= 0) { C.si = j; C.bi = scenes[j].beats.length - 1; }
    }
    showBeat(); spoken(1);
  }
  $('prevBeat')?.addEventListener('click', () => stepBeat(-1));
  $('nextBeat')?.addEventListener('click', () => stepBeat(1));
  document.addEventListener('keydown', e => {
    const el = e.target instanceof Element ? e.target : document.body;
    if (!active() || $('screenLesson')?.hidden || el.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    // Space on a focused button presses that button, as usual.
    if ((e.key === ' ' && !el.closest('button')) || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepBeat(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBeat(-1); }
  });
  // Clicking anything on the board pauses the lesson and starts a question about it.
  $('csvg').addEventListener('click', e => {
    const hit = e.target.closest('.tn, .cell, .litem, .rn, .oprow');
    if (!hit || !C.lesson) return;
    const label = (hit.querySelector('.opcode') || hit.querySelector('text'))?.textContent?.trim();
    if (!label) return;
    pause();
    const input = $('chatInput'); if (!input) return;
    input.value = `What is happening with ${label} at this step?`;
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    status('Edit the question if you like, then press Enter to ask');
  });

  const t = $('instantToggle');
  if (t) { t.checked = pref('nl.instant') === '1'; t.addEventListener('change', () => pref('nl.instant', t.checked ? '1' : '0')); }
  // Shows one beat without speaking; Play resumes from there.
  function jump(si, bi = 0) {
    if (!C.lesson || !C.lesson.scenes[si]) return;
    pause(); hideCheckpoint(); C.cp = null;
    C.si = si; C.bi = Math.max(0, Math.min(bi, C.lesson.scenes[si].beats.length - 1));
    showBeat(); spoken(1);
  }
  // Scenes the student can reach now (the remedial scene only once unlocked).
  function playable() { return C.lesson ? C.lesson.scenes.map((s, i) => i).filter(i => C.lesson.scenes[i].kind !== 'remedial' || C.unlocked.has(C.lesson.scenes[i].id)) : []; }
  window.Computed = { handle, start, preview, toggle, replay, pause, deactivate, active, jump, playable, playing: () => C.playing, position: () => ({ si: C.si, bi: C.bi, lesson: C.lesson }) };
})();
