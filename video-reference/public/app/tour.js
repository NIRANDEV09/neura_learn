// Guided tours, one per page. The same wooden pointer the lessons use flies
// to each part of the screen and taps it, a spotlight dims everything else,
// and a card says what that part does and how to use it. Each page's tour
// starts by itself the first time a student opens that page (Tour.maybeStart,
// called by shell.js) and replays from the ? button in the top bar or the
// profile menu. Seen: nl.tour.<page> (nl.tourDone is the old Home flag).
(() => {
  const $ = id => document.getElementById(id);
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  // On screen, not just laid out: the phone sidebar sits off-canvas until opened.
  const visible = n => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; };
  const name = () => (pref('nl.name') || '').trim();

  // Each step: a target (the first one on screen, so phone layouts fall back
  // to the menu button; an id, or a CSS selector), a title and the text.
  // optional steps are left out when their target is not on screen.
  // demo types example text into a box. finish: the last button's label, and
  // go: a link on the page to follow when it is pressed.
  const TOURS = {
    home: { finish: { label: 'Start learning', go: '#homeRecommend a, #homeContinue a' }, steps: [
      { title: () => `Welcome${name() ? `, ${name()}` : ''}!`, text: 'I\'m your guide. In under a minute I\'ll show you around NeuraLearn. Use the arrow keys or the buttons, and skip any time.' },
      { target: ['homeSearch'], title: 'Start here: ask anything', text: 'Type an algorithm with your own input, like "merge sort [6, 5, 3, 1]", and you get a lesson computed from the real run. Any other topic goes to the AI tutor.', demo: { input: 'homeQuery', text: 'BFS on graph 1-2, 1-3, 2-4 from 1' } },
      { target: ['homeSuggest'], title: 'Not sure what to try?', text: 'Tap one of these examples to start a lesson straight away.' },
      { target: ['homeStats'], title: 'Your progress and streak', text: 'Lessons finished, checkpoints passed and your daily learning streak. Finish one lesson a day to keep the flame going.' },
      { target: ['homeRecommend'], title: 'Recommended next', text: 'Lessons picked for you in teaching order, the ones whose basics you already know first. Each card shows its level and time.' },
      { target: ['[data-nav="library"]', 'menuBtn'], title: 'The full library', text: 'Six modules from stacks and queues to graphs. Every frame on the board is a step the algorithm actually took, never a drawing an AI made up.' },
      { target: ['[data-nav="pdf"]', 'menuBtn'], title: 'Learn from your own PDF', text: 'Attach notes or a textbook chapter. It is read in your browser, split into sections, and each section becomes a short visual lecture.' },
      { target: ['modelPill'], title: 'Choose the AI model', text: 'Pick the model that answers. If one is busy, NeuraLearn switches to another by itself. Instant mode here works with no AI at all.' },
      { target: ['bellBtn'], title: 'Notifications', text: 'Lesson results, fact-check alerts and model switches show up here.' },
      { target: ['helpBtn'], title: 'Help on every page', text: 'Each page has its own short guide. It plays the first time you open the page, and this ? button plays it again whenever you need it.' },
      { title: 'You\'re ready', text: 'Start with a recommended lesson, or ask the tutor anything. Inside a lesson, the pointer walks you through every step and you can pause to ask a question.' },
    ] },
    tutor: { steps: [
      { title: 'Meet your AI tutor', text: 'Ask about any topic, not only algorithms. You get a written answer straight away, then a drawn lecture with a voice, subtitles and the teacher\'s pointer.' },
      { target: ['chatForm'], title: 'Ask here', text: 'Type a question or a topic and press Enter or Ask. Follow-up questions remember the conversation, so you can say "explain that step again".', demo: { input: 'chatInput', text: 'How does the TCP three-way handshake work?' } },
      { target: ['#welcome .samplechips'], optional: true, title: 'Or start with an example', text: 'Tap one of these to see what a lesson looks like.' },
      { target: ['.verifyrow'], title: 'Verified mode', text: 'On: every answer is fact-checked in the background, and doubtful sentences are highlighted with the correction. Turn it off when you only want speed.' },
      { target: ['board'], title: 'The board', text: 'Key points appear first, then the lecture is drawn part by part while the next part is prepared, so you never wait for the whole thing.' },
      { target: ['.tabs'], title: 'Whiteboard, Code and Notes', text: 'Switch views here. Notes keeps the key points, and your own notes are saved in this browser.' },
      { target: ['toolRail'], optional: true, title: 'Draw on the board', text: 'Pen, eraser, text and circle tools for your own marks. With Select, click any part of the board to ask about it.' },
      { target: ['.player'], title: 'Control the lecture', text: 'Play or pause, go back or forward a line (the arrow keys work too), change the speed and pick a voice.' },
      { target: ['pdfRow'], title: 'Learn from a PDF', text: 'Attach a document and each section becomes its own lecture.' },
      { target: ['newChatBtn'], title: 'Start fresh', text: 'A new chat clears the conversation. The sliders button next to it opens the voice settings.' },
    ] },
    pdf: { steps: [
      { title: 'PDF tutor', text: 'Turn your notes, slides or a textbook chapter into a set of short visual lectures.' },
      { target: ['pdfRow'], title: 'Attach your PDF', text: 'Text PDFs up to 40 MB. The file is read in your browser and never uploaded. Scanned PDFs (photos of pages) can\'t be read yet.' },
      { target: ['board'], title: 'How it is taught', text: 'First a summary of the whole document, then every section of about 800 words gets its own lecture, in order, covering every idea in it.' },
      { target: ['chatForm'], title: 'Ask about the document', text: 'Stuck on a part? Ask here at any time.' },
      { target: ['.verifyrow'], title: 'Keep it accurate', text: 'Verified mode checks the lectures in the background and highlights anything doubtful.' },
      { target: ['.player'], title: 'Move through sections', text: 'Pause, replay or skip ahead. The document isn\'t saved, so keep the tab open until you finish.' },
    ] },
    library: { steps: [
      { title: 'Your library', text: 'Every algorithm lesson, in teaching order. Here is how to get the most out of it.' },
      { target: ['.progresswrap'], optional: true, title: 'Overall progress', text: 'How much of the course you have finished.' },
      { target: ['#libModules .modulehead'], title: 'Go module by module', text: 'Start with module 1: each module builds on the one before. The counter shows how many of its lessons you have done.' },
      { target: ['#libModules .topiccards a'], title: 'Open a lesson', text: 'Each card shows the level, time, cost and your status: Not started, In progress, Checkpoint missed or Completed. Open one to set up your own input.' },
      { title: 'Use it to your advantage', text: '1. Go in order. 2. Re-run lessons with tricky inputs: duplicates, already sorted, a single item. 3. Answer the checkpoint to master a lesson. 4. Pause and ask the professor whenever a step surprises you.' },
    ] },
    progress: { steps: [
      { title: 'What Progress tells you', text: 'What you have learned, what needs another look, and where to go next.' },
      { target: ['progStats'], title: 'Your numbers', text: 'Lessons completed and mastered, time spent, your current and longest streak, and how often you get checkpoints right.' },
      { target: ['.progactivity .heatwrap'], title: 'Activity calendar', text: 'Each square is a day; darker means more lessons. Hover a square to see what you did that day.' },
      { target: ['progWeek'], title: 'This week', text: 'A bar per day, and how this week compares with last week.' },
      { target: ['progReview'], title: 'Needs review', text: 'Lessons where you missed the checkpoint. Press Retry to go again with a new input.' },
      { target: ['progModules'], title: 'By module', text: 'The dark bar is mastered, the light bar finished. Tap any lesson chip to open it.' },
      { target: ['progHistory'], title: 'Recent activity', text: 'Every run with its result and time. Hover one to see the input you used.' },
      { target: ['progExport'], title: 'Your data', text: 'Export every run as a spreadsheet, or reset your progress and start fresh. Signed in, it is saved to your account.' },
    ] },
    topic: { steps: [
      { target: ['topicForm'], title: '1. Choose the input', text: 'Use your own values or tap an example. If the input can\'t be used, you are told why before you start.' },
      { target: ['topicPlan'], title: '2. Check the plan', text: 'The scenes this lesson will go through, computed from your input.' },
      { target: ['.previewcard'], optional: true, title: 'Preview', text: 'The starting state the lesson will animate.' },
      { target: ['#screenTopic .settingrow'], title: 'AI narration', text: 'On: a model rewrites the spoken lines more naturally, and a check rejects any line that changes a value. Off: the computed sentences are read as they are.' },
      { target: ['topicStart'], title: '3. Start', text: 'Start the lesson. You can come back and try another input any time.' },
    ] },
    lesson: { steps: [
      { target: ['board'], title: 'Computed from the real run', text: 'Every frame is a step the algorithm actually took on your input. The pointer shows what changes, and the subtitles follow the voice.' },
      { target: ['.player'], title: 'Go at your pace', text: 'Play or pause, step one line at a time with the arrow keys, drag to any point, and change the speed or voice.' },
      { target: ['tracePanel'], optional: true, title: 'Every step, listed', text: 'The full list of recorded operations. Click one to jump to it.' },
      { target: ['.tabs'], title: 'See the code', text: 'The Code tab highlights the Python line the current step runs. Notes has the key points and your own notes.' },
      { target: ['chatForm'], title: 'Ask the professor', text: 'Ask "why did it go left here?" and the lesson pauses, answers with new scenes at this exact step, then carries on.' },
      { target: ['toolRail'], optional: true, title: 'Mark it up', text: 'Draw on the board to work things out for yourself.' },
      { title: 'Checkpoints', text: 'Questions appear along the way. Answer right to master the lesson; a wrong answer gets a short extra explanation first.' },
    ] },
    new: { steps: [
      { target: ['newQuery'], title: 'Describe your lesson', text: 'Name an algorithm and add your own input, like "binary search for 40 in [10, 20, 40, 80]".', demo: { input: 'newQuery', text: 'merge sort [6, 5, 3, 1, 8, 7]' } },
      { target: ['#screenNew .topiccards'], optional: true, title: 'Or pick one', text: 'Choose any lesson to open its setup page.' },
      { target: ['#screenNew .tutorcta'], optional: true, title: 'Something else?', text: 'For topics outside algorithms, open the AI tutor.' },
    ] },
  };

  let i = 0, page = 'home', steps = [], tour = TOURS.home, root, hole, card, ptr, timers = [], typed = null, lastFocus = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const findTarget = step => (step.target || []).map(t => /^[#.[]/.test(t) ? document.querySelector(t) : $(t)).find(visible) || null;
  const seen = p => pref(`nl.tour.${p}`) || (p === 'home' && pref('nl.tourDone'));

  function build() {
    root = document.createElement('div');
    root.className = 'tour';
    hole = document.createElement('div'); hole.className = 'tourhole';
    // The pointer: same shape and colours as the lesson pointer (styles .tp*).
    const svg = svgEl('svg', { class: 'tourptr', 'aria-hidden': 'true' });
    const DIR = [0.55, 0.835];
    const pt = (d, w) => `${(DIR[0] * d - DIR[1] * w).toFixed(1)},${(DIR[1] * d + DIR[0] * w).toFixed(1)}`;
    const poly = pairs => pairs.map(([d, w]) => pt(d, w)).join(' ');
    ptr = svgEl('g', { class: 'tpointer rest' });
    const stick = svgEl('g', { class: 'tpstick' });
    stick.append(
      svgEl('polygon', { class: 'tpshadow', points: poly([[12, 2], [320, 7], [320, -7], [12, -2]]), transform: 'translate(7 9)' }),
      svgEl('polygon', { class: 'tprod', points: poly([[9, 1.8], [250, 4.8], [250, -4.8], [9, -1.8]]) }),
      svgEl('polygon', { class: 'tpgrip', points: poly([[250, 5.2], [330, 7], [330, -7], [250, -5.2]]) }),
      svgEl('circle', { class: 'tptip', cx: (DIR[0] * 5).toFixed(1), cy: (DIR[1] * 5).toFixed(1), r: 5.5 }));
    ptr.append(svgEl('circle', { class: 'tpripple', r: 10 }), stick);
    svg.append(ptr);
    card = document.createElement('section');
    card.className = 'tourcard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tourTitle');
    card.innerHTML = `<p class="tourstep" id="tourCount"></p><h2 id="tourTitle"></h2><p id="tourText"></p>
      <div class="tourdots" id="tourDots" aria-hidden="true"></div>
      <div class="touractions"><button type="button" class="textlink tourskip" id="tourSkip">Skip tour</button>
      <span><button type="button" class="ghostbtn small" id="tourBack">Back</button>
      <button type="button" class="primarybtn small" id="tourNext">Next</button></span></div>`;
    root.append(hole, svg, card);
    document.body.append(root);
    $('tourDots').append(...steps.map(() => document.createElement('i')));
    $('tourNext').addEventListener('click', () => (i === steps.length - 1 ? finish(true) : show(i + 1)));
    $('tourBack').addEventListener('click', () => show(i - 1));
    $('tourSkip').addEventListener('click', () => finish(false));
    // Clicks outside the card do nothing, so the app can't change under the tour.
    root.addEventListener('click', e => { if (!card.contains(e.target)) e.stopPropagation(); });
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('tourNext').click(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Tab') { // keep focus inside the card
      const f = [...card.querySelectorAll('button:not([hidden])')];
      const k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function stopDemo() {
    if (!typed) return;
    const box = $(typed.input); if (box) box.value = typed.before;
    typed = null;
  }
  function runDemo(demo) {
    const box = $(demo.input); if (!box) return;
    typed = { input: demo.input, before: box.value };
    box.value = '';
    [...demo.text].forEach((ch, n) => later(() => { box.value += ch; }, 900 + n * 45));
  }

  // Place the spotlight, the pointer and the card around the target.
  function layout() {
    const step = steps[i], target = findTarget(step);
    const vw = innerWidth, vh = innerHeight, pad = 8;
    const cw = Math.min(360, vw - 32);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight;
    if (!target) {
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      ptr.classList.add('rest');
      card.style.left = `${(vw - cw) / 2}px`;
      card.style.top = `${Math.max(16, (vh - ch) / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    // Pointer tip on the target's left part, rod going down and to the right.
    const tx = r.left + Math.min(48, r.width / 2), ty = r.top + Math.min(r.height / 2, 40);
    ptr.classList.remove('rest');
    ptr.style.transform = `translate(${tx}px, ${ty}px)`;
    later(() => { ptr.classList.remove('tap'); void ptr.getBBox(); ptr.classList.add('tap'); }, 650);
    // Card below the target if it fits, else above, else beside, kept on screen.
    let top = r.bottom + pad + 14;
    if (top + ch > vh - 16) top = r.top - pad - 14 - ch;
    if (top < 16) top = Math.min(vh - ch - 16, Math.max(16, r.top));
    // The rod leans down and to the right, so the card sits left of the tip.
    let left = Math.min(Math.max(16, tx - cw + 40), vw - cw - 16);
    if (top === Math.max(16, r.top) && r.right + cw + 32 < vw) left = r.right + pad + 18;
    // Phones: the card docks at the bottom (or top) edge, clear of the target.
    if (vw < 600) { left = (vw - cw) / 2; top = r.top + r.height / 2 < vh / 2 ? vh - ch - 16 : 16; }
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(16, top)}px`;
  }

  function show(n) {
    timers.forEach(clearTimeout); timers = [];
    stopDemo();
    i = Math.max(0, Math.min(steps.length - 1, n));
    const step = steps[i], text = s => (typeof s === 'function' ? s() : s);
    $('tourCount').textContent = `Step ${i + 1} of ${steps.length}`;
    $('tourTitle').textContent = text(step.title);
    $('tourText').textContent = text(step.text) + (findTarget(step)?.id === 'menuBtn' ? ' Find it in the ☰ menu.' : '');
    [...$('tourDots').children].forEach((d, k) => d.classList.toggle('on', k === i));
    $('tourBack').hidden = i === 0;
    const last = i === steps.length - 1;
    $('tourNext').textContent = last ? (tour.finish?.label || 'Got it') : i === 0 && steps.length > 3 ? 'Show me around' : 'Next';
    $('tourSkip').textContent = steps.length > 3 ? 'Skip tour' : 'Close';
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    const target = findTarget(step);
    if (target) {
      const r = target.getBoundingClientRect(), behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      // Phones: bring the target up under the top bar, leaving room for the card below.
      if (innerWidth < 600) { if (Math.abs(r.top - 84) > 8 && getComputedStyle(target).position !== 'fixed') scrollBy({ top: r.top - 84, behavior }); }
      else if (r.top < 70 || r.bottom > innerHeight - 40) target.scrollIntoView({ block: 'center', behavior });
    }
    later(layout, target ? 320 : 0);
    layout();
    if (step.demo) runDemo(step.demo);
    $('tourNext').focus({ preventScroll: true });
  }

  function finish(startLearning) {
    timers.forEach(clearTimeout); timers = [];
    stopDemo();
    pref(`nl.tour.${page}`, '1');
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', layout);
    removeEventListener('scroll', layout, true);
    root.classList.add('out');
    const r = root; root = null;
    setTimeout(() => r.remove(), 250);
    const go = startLearning && tour.finish?.go && document.querySelector(tour.finish.go);
    if (go) location.hash = go.getAttribute('href');
    else if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  function start(p = page) {
    if (root || !TOURS[p]) return;
    page = p; tour = TOURS[p];
    steps = tour.steps.filter(s => !s.optional || findTarget(s));
    // A lesson that is playing waits while the tour talks about it.
    if (window.Computed && Computed.playing && Computed.playing()) Computed.pause();
    document.body.classList.remove('navopen');
    lastFocus = document.activeElement;
    build();
    addEventListener('keydown', onKey, true);
    addEventListener('resize', layout);
    addEventListener('scroll', layout, true);
    show(0);
    requestAnimationFrame(() => root && root.classList.add('on'));
  }

  // Called by shell.js each time a page has rendered: remembers the page for
  // the ? button, and plays its tour once, after a moment so it has settled.
  // (When accounts arrive, call it for Home after the first sign-in.)
  let pending = 0;
  function maybeStart(p) {
    page = p;
    clearTimeout(pending);
    if (seen(p) || root) return;
    pending = setTimeout(() => { if (page === p && !seen(p)) start(p); }, 800);
  }

  window.Tour = { start, maybeStart, get page() { return page; } };
})();
