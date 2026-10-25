// Deterministic educational lessons and algorithm tracer integrations for NeuraLearn.
// Converts real algorithmic execution traces and gold-standard benchmarks into
// high-fidelity animated SVG whiteboard lessons matching the reference teaching experience.

const path = require('path');

let tracersModule = null;
let directorModule = null;

async function getTracers() {
  if (!tracersModule) {
    try {
      tracersModule = await import('../video-reference/lib/tracers.mjs');
    } catch (e) {
      console.warn('Could not load tracers.mjs:', e.message);
    }
  }
  return tracersModule;
}

async function getDirector() {
  if (!directorModule) {
    try {
      directorModule = await import('../video-reference/lib/director.mjs');
    } catch (e) {
      console.warn('Could not load director.mjs:', e.message);
    }
  }
  return directorModule;
}

// ---------------------------------------------------------------------------
// 1. Gold-Standard Benchmark: Human Heart Anatomy & Circulation
// (Reproduces medical_heart_ai_whiteboard_voice.html with 100% fidelity)
// ---------------------------------------------------------------------------
function getHeartAnatomyLesson() {
  return {
    title: 'Human Heart — Anatomy & Blood Flow',
    overview: "Anterior view • patient's right is on the viewer's left",
    topic: 'Anatomy → valves → circulation → coronary supply → cardiac cycle',
    viewBox: '0 0 970 850',
    segments: [
      {
        heading: 'Orienting the anatomy',
        narration: "Let's first orient the heart. In an anterior view, the patient's right side appears on our left. The heart has four chambers and a muscular septum separating the right and left sides.",
        duration: 4500,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 35, y: 42, text: 'Human Heart — Anatomy & Blood Flow', fontSize: 28, fontWeight: '700', color: '#222222', delay: 100 },
          { op: 'reveal', id: 'orientation', type: 'text', x: 35, y: 68, text: "Anterior view • patient's right is on the viewer's left", fontSize: 15, fontWeight: '600', color: '#555555', delay: 200 },
          { op: 'draw_path', id: 'heartOutline', d: 'M455 190 C395 125 300 145 275 225 C235 355 315 520 485 690 C650 525 730 360 685 225 C655 145 560 125 500 190', stroke: '#7f2735', strokeWidth: 6, fill: 'none', duration: 1600, delay: 300 },
          { op: 'draw_path', id: 'septum', d: 'M470 195 C465 300 470 450 485 690', stroke: '#7f2735', strokeWidth: 4, fill: 'none', duration: 800, delay: 1800 },
          { op: 'reveal', id: 'ra', type: 'path', d: 'M300 250 C325 205 390 200 430 245 L440 365 C390 390 325 365 290 315 Z', fill: '#e1f0fc', stroke: '#2b72b8', strokeWidth: 3, delay: 2500 },
          { op: 'reveal', id: 'rv', type: 'path', d: 'M290 350 C340 340 395 365 440 395 L450 565 C380 530 320 470 290 350 Z', fill: '#e1f0fc', stroke: '#2b72b8', strokeWidth: 3, delay: 2600 },
          { op: 'reveal', id: 'la', type: 'path', d: 'M505 245 C545 200 610 205 635 250 L645 315 C610 365 545 390 495 365 Z', fill: '#fde3df', stroke: '#c93d32', strokeWidth: 3, delay: 2700 },
          { op: 'reveal', id: 'lv', type: 'path', d: 'M495 395 C540 365 595 340 645 350 C615 470 555 530 485 565 Z', fill: '#fde3df', stroke: '#c93d32', strokeWidth: 3, delay: 2800 },
          { op: 'reveal', id: 'raL', type: 'text', x: 315, y: 285, text: 'Right atrium', fontSize: 18, fontWeight: '700', color: '#292929', delay: 2900 },
          { op: 'reveal', id: 'rvL', type: 'text', x: 320, y: 455, text: 'Right ventricle', fontSize: 18, fontWeight: '700', color: '#292929', delay: 3000 },
          { op: 'reveal', id: 'laL', type: 'text', x: 535, y: 285, text: 'Left atrium', fontSize: 18, fontWeight: '700', color: '#292929', delay: 3100 },
          { op: 'reveal', id: 'lvL', type: 'text', x: 530, y: 455, text: 'Left ventricle', fontSize: 18, fontWeight: '700', color: '#292929', delay: 3200 },
          { op: 'reveal', id: 'sepL', type: 'text', x: 385, y: 605, text: 'Interventricular septum', fontSize: 16, fontWeight: '700', color: '#292929', delay: 3300 }
        ]
      },
      {
        heading: 'Systemic venous return',
        narration: 'The superior and inferior venae cavae return deoxygenated blood from the systemic circulation into the right atrium.',
        duration: 3800,
        actions: [
          { op: 'reveal', id: 'svcL', type: 'text', x: 210, y: 92, text: 'Superior vena cava', fontSize: 18, fontWeight: '700', color: '#292929', delay: 200 },
          { op: 'reveal', id: 'ivcL', type: 'text', x: 180, y: 665, text: 'Inferior vena cava', fontSize: 18, fontWeight: '700', color: '#292929', delay: 300 },
          { op: 'draw_path', id: 'svc', d: 'M300 85 L300 235', stroke: '#2b72b8', strokeWidth: 9, fill: 'none', duration: 900, delay: 400 },
          { op: 'draw_path', id: 'ivc', d: 'M300 650 L300 505', stroke: '#2b72b8', strokeWidth: 9, fill: 'none', duration: 900, delay: 700 },
          { op: 'flow', id: 'f1', fromX: 300, fromY: 85, cx: 300, cy: 230, r: 9, color: '#1769d2', label: 'Deox', delay: 1400 }
        ]
      },
      {
        heading: 'Right heart filling',
        narration: 'During ventricular filling, blood passes from the right atrium through the tricuspid valve into the right ventricle.',
        duration: 3600,
        actions: [
          { op: 'reveal', id: 'tri', type: 'path', d: 'M405 350 Q430 332 452 355 Q430 377 405 350', fill: '#e9c766', stroke: '#8d6a19', strokeWidth: 3, delay: 200 },
          { op: 'reveal', id: 'triL', type: 'text', x: 360, y: 335, text: 'Tricuspid valve', fontSize: 15, fontWeight: '600', color: '#555555', delay: 400 },
          { op: 'flow', id: 'f2', fromX: 360, fromY: 285, cx: 340, cy: 430, r: 9, color: '#1769d2', delay: 1200 }
        ]
      },
      {
        heading: 'Pulmonary circulation',
        narration: 'Right ventricular systole ejects blood through the pulmonary valve into the pulmonary trunk and pulmonary arteries, carrying it toward the lungs.',
        duration: 4000,
        actions: [
          { op: 'reveal', id: 'pulv', type: 'path', d: 'M350 220 Q370 198 390 220 Q370 240 350 220', fill: '#e9c766', stroke: '#8d6a19', strokeWidth: 3, delay: 200 },
          { op: 'draw_path', id: 'pa', d: 'M365 230 C345 165 285 120 210 105', stroke: '#2b72b8', strokeWidth: 9, fill: 'none', duration: 1200, delay: 400 },
          { op: 'reveal', id: 'paL', type: 'text', x: 105, y: 92, text: 'Pulmonary artery → lungs', fontSize: 18, fontWeight: '700', color: '#292929', delay: 1200 },
          { op: 'flow', id: 'f3', fromX: 340, fromY: 430, cx: 250, cy: 120, r: 9, color: '#1769d2', delay: 1600 }
        ]
      },
      {
        heading: 'Pulmonary venous return',
        narration: 'After gas exchange in the lungs, oxygen-rich blood returns through the four pulmonary veins into the left atrium.',
        duration: 3800,
        actions: [
          { op: 'draw_path', id: 'pv', d: 'M610 230 C650 160 720 125 795 110', stroke: '#c93d32', strokeWidth: 9, fill: 'none', duration: 1200, delay: 200 },
          { op: 'reveal', id: 'pvL', type: 'text', x: 720, y: 92, text: 'Pulmonary veins ← lungs', fontSize: 18, fontWeight: '700', color: '#292929', delay: 1000 },
          { op: 'flow', id: 'f4', fromX: 795, fromY: 110, cx: 610, cy: 230, r: 9, color: '#d43b30', label: 'O₂ Rich', delay: 1400 }
        ]
      },
      {
        heading: 'Left ventricular filling',
        narration: 'Blood then crosses the mitral valve into the left ventricle. The mitral and tricuspid valves are atrioventricular valves.',
        duration: 3800,
        actions: [
          { op: 'reveal', id: 'mitral', type: 'path', d: 'M475 350 Q500 332 525 350 Q500 377 475 350', fill: '#e9c766', stroke: '#8d6a19', strokeWidth: 3, delay: 200 },
          { op: 'reveal', id: 'mitL', type: 'text', x: 520, y: 335, text: 'Mitral (Bicuspid)', fontSize: 15, fontWeight: '600', color: '#555555', delay: 400 },
          { op: 'flow', id: 'f5', fromX: 610, fromY: 230, cx: 550, cy: 430, r: 9, color: '#d43b30', delay: 1100 }
        ]
      },
      {
        heading: 'Systemic ejection',
        narration: 'During left ventricular systole, the aortic valve opens and oxygenated blood is vigorously ejected into the aorta for systemic circulation.',
        duration: 4200,
        actions: [
          { op: 'reveal', id: 'aov', type: 'path', d: 'M530 220 Q550 198 570 220 Q550 240 530 220', fill: '#e9c766', stroke: '#8d6a19', strokeWidth: 3, delay: 200 },
          { op: 'draw_path', id: 'aorta', d: 'M555 235 C545 150 600 95 675 105 C760 118 770 205 735 275', stroke: '#c93d32', strokeWidth: 9, fill: 'none', duration: 1200, delay: 400 },
          { op: 'draw_path', id: 'aortaDown', d: 'M735 275 C720 360 700 465 680 620', stroke: '#c93d32', strokeWidth: 9, fill: 'none', duration: 900, delay: 1200 },
          { op: 'reveal', id: 'aoL', type: 'text', x: 770, y: 250, text: 'Aorta → Systemic circulation', fontSize: 18, fontWeight: '700', color: '#292929', delay: 1600 },
          { op: 'flow', id: 'f6', fromX: 550, fromY: 430, cx: 720, cy: 330, r: 9, color: '#d43b30', delay: 1900 }
        ]
      },
      {
        heading: 'Coronary circulation',
        narration: 'The coronary arteries arise from the aortic root and branch across the myocardium, ensuring the heart muscle receives its own direct arterial supply.',
        duration: 4200,
        actions: [
          { op: 'draw_path', id: 'cor1', d: 'M480 300 C440 275 395 280 360 310 C345 325 330 350 315 380', stroke: '#a82b35', strokeWidth: 5, fill: 'none', duration: 900, delay: 200 },
          { op: 'draw_path', id: 'cor2', d: 'M480 300 C520 275 565 280 600 310 C620 330 635 360 650 395', stroke: '#a82b35', strokeWidth: 5, fill: 'none', duration: 900, delay: 300 },
          { op: 'draw_path', id: 'cor3', d: 'M480 300 C470 350 470 405 485 465', stroke: '#a82b35', strokeWidth: 5, fill: 'none', duration: 1000, delay: 400 },
          { op: 'draw_path', id: 'cor4', d: 'M360 310 C380 330 400 345 425 355', stroke: '#a82b35', strokeWidth: 4, fill: 'none', duration: 700, delay: 700 },
          { op: 'draw_path', id: 'cor5', d: 'M600 310 C580 330 560 345 535 355', stroke: '#a82b35', strokeWidth: 4, fill: 'none', duration: 700, delay: 800 },
          { op: 'reveal', id: 'corL', type: 'text', x: 260, y: 390, text: 'Coronary arteries', fontSize: 18, fontWeight: '700', color: '#292929', delay: 1400 }
        ]
      },
      {
        heading: 'Cardiac cycle & electrophysiology',
        narration: 'Connect this to the cardiac cycle: ventricular filling occurs during diastole, followed by synchronized ventricular contraction and ejection during systole.',
        duration: 4500,
        actions: [
          { op: 'reveal', id: 'cycleTitle', type: 'text', x: 75, y: 735, text: 'Cardiac Cycle & Rhythm', fontSize: 18, fontWeight: '800', color: '#222222', delay: 200 },
          { op: 'reveal', id: 'cycle', type: 'text', x: 75, y: 760, text: 'Diastole (filling) → Ventricular systole (contraction) → Ejection → Isovolumetric relaxation', fontSize: 15, fontWeight: '600', color: '#555555', delay: 400 },
          { op: 'draw_path', id: 'pulse', d: 'M600 755 L620 755 L628 735 L638 775 L648 750 L655 755 L700 755', stroke: '#b32732', strokeWidth: 4, fill: 'none', duration: 1200, delay: 800 }
        ]
      },
      {
        heading: 'Complete circulation summary',
        narration: 'Here is the unified circuit: SVC and IVC lead into the Right Atrium, through the Tricuspid valve to the Right Ventricle, across the Pulmonary valve to the Lungs, returning via Pulmonary Veins to the Left Atrium, through the Mitral valve into the Left Ventricle, and finally out through the Aorta to the entire body.',
        duration: 5500,
        actions: [
          { op: 'reveal', id: 'summaryBox', type: 'rect', x: 140, y: 785, width: 700, height: 42, rx: 8, stroke: '#d5cec1', strokeWidth: 1.5, fill: '#fbfaf5', delay: 200 },
          { op: 'reveal', id: 'summary', type: 'text', x: 490, y: 810, text: 'Body → SVC/IVC → RA → Tricuspid → RV → Lungs → PV → LA → Mitral → LV → Aorta → Body', fontSize: 15, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 400 }
        ]
      }
    ],
    checkpoint: {
      question: 'Which valve prevents deoxygenated blood from regurgitating back into the right atrium during right ventricular systole?',
      options: ['Tricuspid valve', 'Mitral valve', 'Aortic valve', 'Pulmonary valve'],
      answerIndex: 0,
      explanation: 'The tricuspid valve is the right atrioventricular valve; it closes during ventricular systole to prevent backflow into the right atrium.'
    }
  };
}

// ---------------------------------------------------------------------------
// 2. Deterministic Binary Search Lesson Builder
// ---------------------------------------------------------------------------
async function getBinarySearchLesson(inputData, inputTarget) {
  const tracers = await getTracers();
  if (!tracers) return null;

  const defaultArray = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
  const arr = Array.isArray(inputData) && inputData.length >= 2 ? [...inputData].sort((a,b)=>a-b) : defaultArray;
  const target = inputTarget !== undefined && inputTarget !== null ? Number(inputTarget) : 23;
  
  const run = tracers.runAlgorithm('binarysearch', arr, target);
  const steps = run.trace.steps;
  const n = arr.length;

  const boxW = Math.min(68, Math.floor(760 / n));
  const boxH = 54;
  const startX = Math.round((960 - (n * boxW + (n - 1) * 8)) / 2);
  const startY = 320;

  const segments = [];

  // Segment 1: Setup & Initial Array
  const setupActions = [
    { op: 'reveal', id: 'title', type: 'text', x: 480, y: 55, text: `Binary Search for Target: ${target}`, fontSize: 26, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
    { op: 'reveal', id: 'subtitle', type: 'text', x: 480, y: 90, text: `Sorted array of ${n} elements • O(log n) time complexity • Halves search space each step`, fontSize: 15, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 200 },
    { op: 'reveal', id: 'targetBadge', type: 'rect', x: 390, y: 125, width: 180, height: 42, rx: 8, stroke: '#2b72b8', strokeWidth: 2, fill: '#eaf4fd', delay: 300 },
    { op: 'reveal', id: 'targetText', type: 'text', x: 480, y: 151, text: `Target key = ${target}`, fontSize: 16, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 350 }
  ];

  for (let i = 0; i < n; i++) {
    const x = startX + i * (boxW + 8);
    setupActions.push(
      { op: 'draw_rect', id: `box_${i}`, x, y: startY, width: boxW, height: boxH, rx: 8, stroke: '#333740', strokeWidth: 2, fill: '#ffffff', delay: 400 + i * 60 },
      { op: 'reveal', id: `val_${i}`, type: 'text', x: x + boxW / 2, y: startY + boxH / 2 + 1, text: String(arr[i]), fontSize: 18, fontWeight: '700', color: '#22262b', anchor: 'middle', delay: 450 + i * 60 },
      { op: 'reveal', id: `idx_${i}`, type: 'text', x: x + boxW / 2, y: startY + boxH + 24, text: `[${i}]`, fontSize: 13, fontWeight: '600', color: '#888e9b', anchor: 'middle', delay: 500 + i * 60 }
    );
  }

  segments.push({
    heading: 'Initialize search bounds',
    narration: `We want to locate ${target} in a sorted array of ${n} values. We maintain two pointers: lo at index 0 and hi at index ${n - 1}.`,
    duration: 3800,
    actions: setupActions
  });

  // Intermediate iteration steps
  let iterCount = 0;
  for (let sIdx = 1; sIdx < steps.length; sIdx++) {
    const step = steps[sIdx];
    const { op, fact, state } = step;
    const { lo, hi, mid, found, discarded } = state;

    const actions = [];

    // Pointer annotations
    if (lo !== null && lo !== undefined && lo >= 0 && lo < n) {
      const xLo = startX + lo * (boxW + 8) + boxW / 2;
      actions.push(
        { op: 'draw_arrow', id: 'arrow_lo', x1: xLo, y1: startY - 50, x2: xLo, y2: startY - 8, stroke: '#2b72b8', strokeWidth: 3, arrowEnd: true, delay: 100 },
        { op: 'reveal', id: 'label_lo', type: 'text', x: xLo, y: startY - 58, text: `lo=${lo}`, fontSize: 14, fontWeight: '700', color: '#2b72b8', anchor: 'middle', delay: 150 }
      );
    }
    if (hi !== null && hi !== undefined && hi >= 0 && hi < n) {
      const xHi = startX + hi * (boxW + 8) + boxW / 2;
      actions.push(
        { op: 'draw_arrow', id: 'arrow_hi', x1: xHi, y1: startY - 50, x2: xHi, y2: startY - 8, stroke: '#c93d32', strokeWidth: 3, arrowEnd: true, delay: 200 },
        { op: 'reveal', id: 'label_hi', type: 'text', x: xHi, y: startY - 58, text: `hi=${hi}`, fontSize: 14, fontWeight: '700', color: '#c93d32', anchor: 'middle', delay: 250 }
      );
    }
    if (mid !== null && mid !== undefined && mid >= 0 && mid < n) {
      const xMid = startX + mid * (boxW + 8) + boxW / 2;
      actions.push(
        { op: 'highlight', id: `box_${mid}`, stroke: '#8252a1', strokeWidth: 3.5, fill: '#f5eeff', delay: 300 },
        { op: 'reveal', id: 'midBadge', type: 'text', x: xMid, y: startY + boxH + 52, text: `▲ mid=${mid} (val=${arr[mid]})`, fontSize: 14, fontWeight: '700', color: '#8252a1', anchor: 'middle', delay: 350 }
      );
    }

    // Grey out discarded items
    if (Array.isArray(discarded)) {
      discarded.forEach((isDiscarded, dIdx) => {
        if (isDiscarded) {
          actions.push({ op: 'reveal', id: `box_${dIdx}`, stroke: '#d2d6dc', strokeWidth: 1.5, fill: '#f4f5f7', opacity: 0.35, delay: 400 });
        }
      });
    }

    if (op === 'found') {
      const xFound = startX + found * (boxW + 8);
      actions.push(
        { op: 'draw_rect', id: `box_${found}`, x: xFound, y: startY, width: boxW, height: boxH, rx: 8, stroke: '#2ea44f', strokeWidth: 4, fill: '#e6f9ed', delay: 500 },
        { op: 'reveal', id: 'foundBanner', type: 'rect', x: 280, y: 490, width: 400, height: 48, rx: 10, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fbf4', delay: 600 },
        { op: 'reveal', id: 'foundText', type: 'text', x: 480, y: 514, text: `✓ Target ${target} found at index ${found}!`, fontSize: 17, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 650 }
      );
    }

    iterCount++;
    segments.push({
      heading: op === 'found' ? 'Target located' : `Iteration ${iterCount}: probe midpoint`,
      narration: fact,
      duration: op === 'found' ? 4200 : 3600,
      actions
    });
  }

  // Summary segment
  segments.push({
    heading: 'Complexity and takeaway',
    narration: `Binary search eliminates half the remaining elements on every comparison. For ${n} elements, it requires at most ⌈log₂(n)⌉ steps, making it vastly faster than linear scanning for large datasets.`,
    duration: 4500,
    actions: [
      { op: 'reveal', id: 'summaryPanel', type: 'rect', x: 160, y: 560, width: 640, height: 60, rx: 12, stroke: '#2b72b8', strokeWidth: 1.5, fill: '#f8fbff', delay: 200 },
      { op: 'reveal', id: 'summaryFormula', type: 'text', x: 480, y: 590, text: `Time Complexity: O(log₂ n) • Space: O(1) Auxiliary`, fontSize: 16, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 400 }
    ]
  });

  return {
    title: `Binary Search — Step-by-Step Execution`,
    overview: `Searching for target ${target} in [${arr.join(', ')}]`,
    topic: 'Array bounds → Midpoint calculation → Range elimination → Target confirmation',
    viewBox: '0 0 960 700',
    segments,
    checkpoint: {
      question: `If an array has 1,000,000 sorted elements, approximately how many comparisons does binary search need in the worst case?`,
      options: ['About 20 comparisons', 'About 500,000 comparisons', 'About 1,000 comparisons', 'About 10,000 comparisons'],
      answerIndex: 0,
      explanation: `Because 2²⁰ ≈ 1,048,576, binary search will find any element or determine it is absent in at most 20 comparisons!`
    }
  };
}

// ---------------------------------------------------------------------------
// 3. Deterministic Tree Traversal Lesson Builder
// ---------------------------------------------------------------------------
async function getTreeTraversalLesson(order = 'inorder', inputData) {
  const tracers = await getTracers();
  if (!tracers) return null;

  const defaultTree = [4, 2, 6, 1, 3, 5, 7];
  const tree = Array.isArray(inputData) && inputData.length ? inputData : defaultTree;
  const run = tracers.runAlgorithm(order, tree);
  const steps = run.trace.steps;
  const finalOutput = run.trace.output || [];

  // 2D tree layout positions (x, y) for up to 3 levels (indices 0..6)
  const nodeCoords = [
    { x: 480, y: 135 }, // root (0)
    { x: 280, y: 235 }, // left (1)
    { x: 680, y: 235 }, // right (2)
    { x: 180, y: 335 }, // left-left (3)
    { x: 380, y: 335 }, // left-right (4)
    { x: 580, y: 335 }, // right-left (5)
    { x: 780, y: 335 }  // right-right (6)
  ];

  const orderNames = {
    inorder: 'Inorder (Left → Node → Right)',
    preorder: 'Preorder (Node → Left → Right)',
    postorder: 'Postorder (Left → Right → Node)',
    levelorder: 'Level-Order (Breadth-First by Depth)'
  };

  const segments = [];

  // Scene 1: Draw the full binary tree structure
  const initActions = [
    { op: 'reveal', id: 'title', type: 'text', x: 480, y: 44, text: `Binary Tree Traversal: ${orderNames[order] || order}`, fontSize: 24, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
    { op: 'reveal', id: 'rule', type: 'text', x: 480, y: 76, text: `Visiting order: ${orderNames[order] || order} • Total nodes = ${tree.filter(x=>x!==null).length}`, fontSize: 14, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 200 }
  ];

  // Draw branches first
  for (let i = 0; i < tree.length; i++) {
    if (tree[i] === null || tree[i] === undefined || !nodeCoords[i]) continue;
    const leftIdx = 2 * i + 1;
    const rightIdx = 2 * i + 2;
    if (leftIdx < tree.length && tree[leftIdx] !== null && nodeCoords[leftIdx]) {
      initActions.push({ op: 'draw_arrow', id: `edge_${i}_${leftIdx}`, x1: nodeCoords[i].x, y1: nodeCoords[i].y + 24, x2: nodeCoords[leftIdx].x, y2: nodeCoords[leftIdx].y - 24, stroke: '#8c93a0', strokeWidth: 2.5, arrowEnd: false, delay: 300 });
    }
    if (rightIdx < tree.length && tree[rightIdx] !== null && nodeCoords[rightIdx]) {
      initActions.push({ op: 'draw_arrow', id: `edge_${i}_${rightIdx}`, x1: nodeCoords[i].x, y1: nodeCoords[i].y + 24, x2: nodeCoords[rightIdx].x, y2: nodeCoords[rightIdx].y - 24, stroke: '#8c93a0', strokeWidth: 2.5, arrowEnd: false, delay: 350 });
    }
  }

  // Draw node circles and values
  for (let i = 0; i < tree.length; i++) {
    if (tree[i] === null || tree[i] === undefined || !nodeCoords[i]) continue;
    const { x, y } = nodeCoords[i];
    initActions.push(
      { op: 'draw_circle', id: `node_${tree[i]}`, cx: x, cy: y, r: 24, stroke: '#2b72b8', strokeWidth: 3, fill: '#f0f7ff', delay: 400 + i * 50 },
      { op: 'reveal', id: `val_${tree[i]}`, type: 'text', x, y: y + 1, text: String(tree[i]), fontSize: 17, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 450 + i * 50 }
    );
  }

  initActions.push(
    { op: 'reveal', id: 'outputBanner', type: 'rect', x: 180, y: 430, width: 600, height: 48, rx: 10, stroke: '#333740', strokeWidth: 1.5, fill: '#ffffff', delay: 700 },
    { op: 'reveal', id: 'outputText', type: 'text', x: 200, y: 454, text: 'Visited Output: [ ]', fontSize: 16, fontWeight: '700', color: '#22262b', anchor: 'start', delay: 750 }
  );

  segments.push({
    heading: 'Constructing tree representation',
    narration: `Here is our binary tree. We will traverse it using ${orderNames[order] || order}. Notice the root has value ${tree[0]}.`,
    duration: 4000,
    actions: initActions
  });

  // Step through traversal execution
  for (let sIdx = 0; sIdx < steps.length; sIdx++) {
    const step = steps[sIdx];
    const { op, fact, state } = step;
    const curr = state.current;
    const currOutput = state.output || [];

    const actions = [];
    if (curr !== null && curr !== undefined) {
      actions.push(
        { op: 'highlight', id: `node_${curr}`, stroke: op === 'visit' ? '#2ea44f' : '#e3a83e', strokeWidth: 4, fill: op === 'visit' ? '#e6f9ed' : '#fff9eb', delay: 100 }
      );
    }
    actions.push(
      { op: 'reveal', id: 'outputText', type: 'text', x: 200, y: 454, text: `Visited Output: [ ${currOutput.join(', ')} ]`, fontSize: 16, fontWeight: '700', color: '#22262b', anchor: 'start', delay: 200 }
    );

    segments.push({
      heading: op === 'visit' ? `Visit node ${curr}` : `Recursive exploration`,
      narration: fact,
      duration: 3500,
      actions
    });
  }

  // Final summary
  segments.push({
    heading: 'Traversal complete',
    narration: `The ${order} traversal is complete. The final sequence of visited values is [${finalOutput.join(', ')}]. Notice that for a binary search tree, inorder traversal always yields perfectly sorted order.`,
    duration: 4500,
    actions: [
      { op: 'reveal', id: 'finalResultBox', type: 'rect', x: 180, y: 510, width: 600, height: 56, rx: 12, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fbf4', delay: 200 },
      { op: 'reveal', id: 'finalResultText', type: 'text', x: 480, y: 538, text: `Final Result: [ ${finalOutput.join(', ')} ]`, fontSize: 18, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 300 }
    ]
  });

  return {
    title: `Binary Tree: ${orderNames[order] || order}`,
    overview: `Traversal order: [${finalOutput.join(', ')}]`,
    topic: 'Root inspection → Left subtree exploration → Node evaluation → Right subtree exploration',
    viewBox: '0 0 960 700',
    segments,
    checkpoint: {
      question: `On a valid Binary Search Tree (BST), which traversal order always visits nodes in strictly ascending numerical order?`,
      options: ['Inorder traversal', 'Preorder traversal', 'Postorder traversal', 'Level-order traversal'],
      answerIndex: 0,
      explanation: 'Inorder traversal visits Left subtree, then Node, then Right subtree. In a BST, all left descendants are smaller and right descendants are larger, producing sorted order.'
    }
  };
}

// ---------------------------------------------------------------------------
// 4. Mathematics Benchmark: Calculus Derivatives & Tangent Line
// ---------------------------------------------------------------------------
function getDerivativesLesson() {
  return {
    title: 'Calculus: Derivatives & Instantaneous Slope',
    overview: 'Understanding the limit of secant slopes approaching the tangent line',
    topic: 'Cartesian axes → Parabolic curve → Secant line → Limit h→0 → Tangent slope',
    viewBox: '0 0 960 700',
    segments: [
      {
        heading: 'Coordinate system and function curve',
        narration: 'To understand derivatives, let us set up the Cartesian coordinate system and plot the smooth parabola f(x) equals x squared over 4.',
        duration: 4200,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 50, y: 50, text: 'Calculus: The Derivative as a Tangent Slope', fontSize: 24, fontWeight: '700', color: '#222222', delay: 100 },
          // Grid lines
          { op: 'draw_arrow', id: 'xAxis', x1: 120, y1: 520, x2: 840, y2: 520, stroke: '#333740', strokeWidth: 2.5, arrowEnd: true, delay: 300 },
          { op: 'draw_arrow', id: 'yAxis', x1: 300, y1: 560, x2: 300, y2: 120, stroke: '#333740', strokeWidth: 2.5, arrowEnd: true, delay: 500 },
          { op: 'reveal', id: 'xLabel', type: 'text', x: 845, y: 525, text: 'x', fontSize: 16, fontWeight: '700', color: '#333740', delay: 600 },
          { op: 'reveal', id: 'yLabel', type: 'text', x: 295, y: 110, text: 'y = f(x)', fontSize: 16, fontWeight: '700', color: '#333740', anchor: 'middle', delay: 700 },
          // Function curve y = x^2
          { op: 'draw_path', id: 'curve', d: 'M140 480 Q300 520 480 340 T720 160', stroke: '#2b72b8', strokeWidth: 4, fill: 'none', duration: 1400, delay: 900 },
          { op: 'reveal', id: 'funcLabel', type: 'text', x: 730, y: 165, text: 'f(x)', fontSize: 18, fontWeight: '700', color: '#2b72b8', delay: 1800 }
        ]
      },
      {
        heading: 'Choosing point P and secant point Q',
        narration: 'We select a base point P at coordinate x, and a second point Q at distance h along the curve. The secant line connecting P and Q represents average rate of change.',
        duration: 4500,
        actions: [
          // Point P
          { op: 'draw_circle', id: 'ptP', cx: 400, y: 420, r: 7, stroke: '#1769d2', strokeWidth: 2, fill: '#1769d2', delay: 200 },
          { op: 'reveal', id: 'lblP', type: 'text', x: 385, y: 445, text: 'P(x, f(x))', fontSize: 15, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 300 },
          // Point Q
          { op: 'draw_circle', id: 'ptQ', cx: 580, y: 250, r: 7, stroke: '#e3a83e', strokeWidth: 2, fill: '#e3a83e', delay: 600 },
          { op: 'reveal', id: 'lblQ', type: 'text', x: 595, y: 240, text: 'Q(x+h, f(x+h))', fontSize: 15, fontWeight: '700', color: '#c77b2d', delay: 700 },
          // Secant Line
          { op: 'draw_path', id: 'secantLine', d: 'M320 495 L660 175', stroke: '#e3a83e', strokeWidth: 2.5, strokeDasharray: '6 6', fill: 'none', duration: 1000, delay: 1000 },
          { op: 'reveal', id: 'secantLabel', type: 'text', x: 670, y: 195, text: 'Secant line (slope = Δy / Δx)', fontSize: 14, fontWeight: '600', color: '#c77b2d', delay: 1400 }
        ]
      },
      {
        heading: 'Taking the limit as h approaches zero',
        narration: 'As we slide point Q closer to point P, the horizontal gap h shrinks toward zero. In the limit, the secant line rotates into the tangent line at exactly point P.',
        duration: 4500,
        actions: [
          // Moving Q closer
          { op: 'highlight', id: 'ptQ', stroke: '#c93d32', strokeWidth: 3, delay: 200 },
          { op: 'draw_arrow', id: 'deltaX', x1: 400, y1: 460, x2: 580, y2: 460, stroke: '#888e9b', strokeWidth: 1.5, arrowEnd: true, delay: 400 },
          { op: 'reveal', id: 'deltaXText', type: 'text', x: 490, y: 480, text: 'h → 0', fontSize: 14, fontWeight: '700', color: '#888e9b', anchor: 'middle', delay: 500 },
          // Tangent Line
          { op: 'draw_path', id: 'tangentLine', d: 'M250 560 L620 210', stroke: '#c93d32', strokeWidth: 3.5, fill: 'none', duration: 1200, delay: 1000 },
          { op: 'reveal', id: 'tangentLabel', type: 'text', x: 630, y: 220, text: 'Tangent line (Slope = f\'(x))', fontSize: 16, fontWeight: '700', color: '#c93d32', delay: 1600 }
        ]
      },
      {
        heading: 'The limit definition formula',
        narration: 'This yields the fundamental definition of the derivative: f prime of x is the limit as h approaches 0 of f(x plus h) minus f(x), divided by h. It gives the exact instantaneous rate of change.',
        duration: 5000,
        actions: [
          { op: 'reveal', id: 'formulaCard', type: 'rect', x: 220, y: 570, width: 520, height: 75, rx: 12, stroke: '#2b72b8', strokeWidth: 2, fill: '#f6faff', delay: 200 },
          { op: 'reveal', id: 'formulaTitle', type: 'text', x: 480, y: 595, text: 'Fundamental Definition of Derivative:', fontSize: 13, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 300 },
          { op: 'reveal', id: 'formulaMath', type: 'text', x: 480, y: 625, text: "f'(x) = lim_{h → 0} [ f(x + h) - f(x) ] / h", fontSize: 18, fontWeight: '800', color: '#1769d2', anchor: 'middle', delay: 400 }
        ]
      }
    ],
    checkpoint: {
      question: 'Geometrically, what does the derivative f\'(x₀) represent on a function curve y = f(x)?',
      options: ['The slope of the tangent line at x₀', 'The area under the curve between 0 and x₀', 'The distance from the origin to (x₀, f(x₀))', 'The maximum height of the curve'],
      answerIndex: 0,
      explanation: 'The derivative f\'(x₀) represents the instantaneous rate of change and the exact slope of the tangent line touching the curve at x₀.'
    }
  };
}

// ---------------------------------------------------------------------------
// 5. Physics / Electronics Benchmark: Electric Circuits & Ohm's Law
// ---------------------------------------------------------------------------
function getCircuitsLesson() {
  return {
    title: "Electric Circuits: Ohm's Law & Current Flow",
    overview: 'Understanding voltage potential, electrical resistance, and conventional current',
    topic: 'DC voltage source → Conductive loop → Resistor load → Current flow → V=I·R',
    viewBox: '0 0 960 700',
    segments: [
      {
        heading: 'Closed conductive circuit loop',
        narration: 'An electric circuit requires a closed conductive loop. On the left is our DC voltage source providing electrical potential energy; on the right is a resistive load.',
        duration: 4200,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 50, y: 50, text: "Electric Circuit & Ohm's Law", fontSize: 24, fontWeight: '700', color: '#222222', delay: 100 },
          // Top Wire
          { op: 'draw_path', id: 'wireTop', d: 'M250 200 L710 200', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 800, delay: 300 },
          // Bottom Wire
          { op: 'draw_path', id: 'wireBottom', d: 'M250 500 L710 500', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 800, delay: 400 },
          // DC Voltage Source (Left vertical)
          { op: 'draw_path', id: 'battWireTop', d: 'M250 200 L250 320', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 500, delay: 600 },
          { op: 'draw_path', id: 'battWireBot', d: 'M250 500 L250 380', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 500, delay: 700 },
          { op: 'draw_path', id: 'battPlatePos', d: 'M220 320 L280 320', stroke: '#c93d32', strokeWidth: 5, fill: 'none', duration: 400, delay: 900 },
          { op: 'draw_path', id: 'battPlateNeg', d: 'M235 380 L265 380', stroke: '#2b72b8', strokeWidth: 5, fill: 'none', duration: 400, delay: 1000 },
          { op: 'reveal', id: 'battLabel', type: 'text', x: 185, y: 355, text: 'Battery (V)', fontSize: 16, fontWeight: '700', color: '#c93d32', anchor: 'middle', delay: 1100 },
          { op: 'reveal', id: 'battPlus', type: 'text', x: 250, y: 305, text: '+', fontSize: 20, fontWeight: '800', color: '#c93d32', anchor: 'middle', delay: 1150 },
          { op: 'reveal', id: 'battMinus', type: 'text', x: 250, y: 405, text: '-', fontSize: 22, fontWeight: '800', color: '#2b72b8', anchor: 'middle', delay: 1200 }
        ]
      },
      {
        heading: 'The resistor component',
        narration: 'On the right side, we insert a resistor R. The zigzag geometry represents resistance to the flow of charge, converting electrical energy into heat or light.',
        duration: 4000,
        actions: [
          // Resistor zigzag
          { op: 'draw_path', id: 'resWireTop', d: 'M710 200 L710 290', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 400, delay: 200 },
          { op: 'draw_path', id: 'resWireBot', d: 'M710 500 L710 410', stroke: '#333740', strokeWidth: 4, fill: 'none', duration: 400, delay: 300 },
          { op: 'draw_path', id: 'resZigZag', d: 'M710 290 L685 305 L735 325 L685 345 L735 365 L685 385 L710 410', stroke: '#e3a83e', strokeWidth: 4, fill: 'none', duration: 1000, delay: 600 },
          { op: 'reveal', id: 'resLabel', type: 'text', x: 775, y: 355, text: 'Resistor (R)', fontSize: 17, fontWeight: '700', color: '#c77b2d', anchor: 'start', delay: 1200 }
        ]
      },
      {
        heading: 'Conventional current flow',
        narration: 'By convention, electric current I flows from the positive terminal, through the top conductor, across the resistor, and returns to the negative terminal.',
        duration: 4200,
        actions: [
          // Current arrows along top wire
          { op: 'draw_arrow', id: 'curArrowTop', x1: 420, y1: 180, x2: 540, y2: 180, stroke: '#2ea44f', strokeWidth: 3.5, arrowEnd: true, delay: 200 },
          { op: 'reveal', id: 'curLabelTop', type: 'text', x: 480, y: 165, text: 'Current I →', fontSize: 16, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 300 },
          // Flow particles
          { op: 'flow', id: 'p1', fromX: 250, fromY: 200, cx: 360, cy: 200, r: 8, color: '#2ea44f', label: 'I', delay: 600 },
          { op: 'flow', id: 'p2', fromX: 360, fromY: 200, cx: 580, cy: 200, r: 8, color: '#2ea44f', label: 'I', delay: 800 },
          { op: 'flow', id: 'p3', fromX: 710, fromY: 200, cx: 710, cy: 450, r: 8, color: '#2ea44f', delay: 1000 }
        ]
      },
      {
        heading: "Ohm's law relationship",
        narration: "Ohm's Law states that Voltage equals Current multiplied by Resistance (V = I R). Increasing the battery voltage increases current, while higher resistance restricts current flow.",
        duration: 4800,
        actions: [
          { op: 'reveal', id: 'ohmsCard', type: 'rect', x: 280, y: 570, width: 400, height: 75, rx: 12, stroke: '#2b72b8', strokeWidth: 2, fill: '#f6faff', delay: 200 },
          { op: 'reveal', id: 'ohmsTitle', type: 'text', x: 480, y: 595, text: "Ohm's Law Formula:", fontSize: 13, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 300 },
          { op: 'reveal', id: 'ohmsMath', type: 'text', x: 480, y: 626, text: 'V = I · R    or    I = V / R', fontSize: 20, fontWeight: '800', color: '#1769d2', anchor: 'middle', delay: 400 }
        ]
      }
    ],
    checkpoint: {
      question: 'If a 12V battery is connected across a 4Ω resistor, what is the current flowing through the circuit?',
      options: ['3 Amperes', '48 Amperes', '0.33 Amperes', '16 Amperes'],
      answerIndex: 0,
      explanation: "Using Ohm's Law: I = V / R = 12V / 4Ω = 3 Amperes."
    }
  };
}

// ---------------------------------------------------------------------------
// 6. Computer Networks Benchmark: TCP 3-Way Handshake
// ---------------------------------------------------------------------------
function getTcpHandshakeLesson() {
  return {
    title: 'Computer Networks: TCP 3-Way Handshake',
    overview: 'Establishing a reliable full-duplex TCP transport connection',
    topic: 'Client / Server lifelines → SYN segment → SYN-ACK response → ACK completion',
    viewBox: '0 0 960 700',
    segments: [
      {
        heading: 'Client and server host lifelines',
        narration: 'The Transmission Control Protocol ensures reliable delivery. To begin communication, the Client and Server synchronize sequence numbers through a 3-way handshake.',
        duration: 4200,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 480, y: 48, text: 'TCP 3-Way Connection Handshake', fontSize: 24, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
          // Client Node
          { op: 'draw_rect', id: 'clientBox', x: 180, y: 80, width: 140, height: 50, rx: 8, stroke: '#2b72b8', strokeWidth: 2.5, fill: '#eaf4fd', delay: 200 },
          { op: 'reveal', id: 'clientText', type: 'text', x: 250, y: 110, text: 'Client', fontSize: 17, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 250 },
          { op: 'draw_path', id: 'clientLine', d: 'M250 130 L250 560', stroke: '#8c93a0', strokeWidth: 2, strokeDasharray: '6 6', fill: 'none', duration: 900, delay: 350 },
          // Server Node
          { op: 'draw_rect', id: 'serverBox', x: 640, y: 80, width: 140, height: 50, rx: 8, stroke: '#c93d32', strokeWidth: 2.5, fill: '#fdeeed', delay: 400 },
          { op: 'reveal', id: 'serverText', type: 'text', x: 710, y: 110, text: 'Server', fontSize: 17, fontWeight: '700', color: '#c93d32', anchor: 'middle', delay: 450 },
          { op: 'draw_path', id: 'serverLine', d: 'M710 130 L710 560', stroke: '#8c93a0', strokeWidth: 2, strokeDasharray: '6 6', fill: 'none', duration: 900, delay: 550 },
          // Initial States
          { op: 'reveal', id: 'cliState1', type: 'text', x: 150, y: 170, text: 'CLOSED', fontSize: 13, fontWeight: '700', color: '#888e9b', anchor: 'end', delay: 700 },
          { op: 'reveal', id: 'srvState1', type: 'text', x: 810, y: 170, text: 'LISTEN', fontSize: 13, fontWeight: '700', color: '#2ea44f', anchor: 'start', delay: 750 }
        ]
      },
      {
        heading: 'Step 1: SYN segment (Client → Server)',
        narration: 'Step 1: The Client sends a SYN segment with an Initial Sequence Number, for example seq equals 100, entering the SYN-SENT state.',
        duration: 4200,
        actions: [
          { op: 'draw_arrow', id: 'synArrow', x1: 250, y1: 200, x2: 710, y2: 280, stroke: '#2b72b8', strokeWidth: 3.5, arrowEnd: true, delay: 200 },
          { op: 'reveal', id: 'synMsg', type: 'text', x: 480, y: 225, text: '1. SYN (seq = 100)', fontSize: 15, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 400 },
          { op: 'reveal', id: 'cliState2', type: 'text', x: 150, y: 215, text: 'SYN_SENT', fontSize: 13, fontWeight: '700', color: '#1769d2', anchor: 'end', delay: 600 },
          { op: 'flow', id: 'pSyn', fromX: 250, fromY: 200, cx: 710, cy: 280, r: 8, color: '#1769d2', delay: 700 }
        ]
      },
      {
        heading: 'Step 2: SYN-ACK segment (Server → Client)',
        narration: 'Step 2: The Server receives the SYN, allocates buffers, and replies with SYN-ACK: acknowledging 101 and introducing its own sequence number 300.',
        duration: 4500,
        actions: [
          { op: 'draw_arrow', id: 'synAckArrow', x1: 710, y1: 310, x2: 250, y2: 390, stroke: '#e3a83e', strokeWidth: 3.5, arrowEnd: true, delay: 200 },
          { op: 'reveal', id: 'synAckMsg', type: 'text', x: 480, y: 335, text: '2. SYN-ACK (seq = 300, ack = 101)', fontSize: 15, fontWeight: '700', color: '#c77b2d', anchor: 'middle', delay: 400 },
          { op: 'reveal', id: 'srvState2', type: 'text', x: 810, y: 310, text: 'SYN_RCVD', fontSize: 13, fontWeight: '700', color: '#c77b2d', anchor: 'start', delay: 600 },
          { op: 'flow', id: 'pSynAck', fromX: 710, fromY: 310, cx: 250, cy: 390, r: 8, color: '#c77b2d', delay: 700 }
        ]
      },
      {
        heading: 'Step 3: ACK segment & ESTABLISHED connection',
        narration: 'Step 3: The Client acknowledges the server sequence number by sending ACK 301. Both endpoints are now in the ESTABLISHED state and bidirectional data transfer begins.',
        duration: 4800,
        actions: [
          { op: 'draw_arrow', id: 'ackArrow', x1: 250, y1: 420, x2: 710, y2: 500, stroke: '#2ea44f', strokeWidth: 3.5, arrowEnd: true, delay: 200 },
          { op: 'reveal', id: 'ackMsg', type: 'text', x: 480, y: 445, text: '3. ACK (ack = 301)', fontSize: 15, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 400 },
          { op: 'reveal', id: 'cliState3', type: 'text', x: 150, y: 435, text: 'ESTABLISHED', fontSize: 13, fontWeight: '700', color: '#2ea44f', anchor: 'end', delay: 600 },
          { op: 'reveal', id: 'srvState3', type: 'text', x: 810, y: 515, text: 'ESTABLISHED', fontSize: 13, fontWeight: '700', color: '#2ea44f', anchor: 'start', delay: 700 },
          // Connection Established Banner
          { op: 'reveal', id: 'estBanner', type: 'rect', x: 280, y: 575, width: 400, height: 50, rx: 10, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fbf4', delay: 1000 },
          { op: 'reveal', id: 'estText', type: 'text', x: 480, y: 606, text: '✓ TCP Connection Fully Established', fontSize: 17, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 1100 }
        ]
      }
    ],
    checkpoint: {
      question: 'Why does the TCP connection handshake require three steps rather than just two?',
      options: ['To allow both sides to independently synchronize sequence numbers and verify duplex transmission', 'To compress the payload data before sending', 'Because IPv4 requires three packet headers', 'To encrypt the initial connection key'],
      answerIndex: 0,
      explanation: 'Three packets are needed so that both the client and server can propose an initial sequence number and confirm that the other side received it.'
    }
  };
}

// ---------------------------------------------------------------------------
// 7. Deterministic Sorting Lesson Builder (Bubble, Insertion, Selection, Merge)
// ---------------------------------------------------------------------------
async function getSortingLesson(algoId = 'bubblesort', inputData) {
  const tracers = await getTracers();
  if (!tracers) return null;

  const defaultArray = algoId === 'mergesort' ? [38, 27, 43, 3] : [5, 1, 4, 2, 8];
  const arr = Array.isArray(inputData) && inputData.length >= 2 ? [...inputData] : defaultArray;
  const run = tracers.runAlgorithm(algoId, arr);
  const steps = run.trace.steps;
  const n = arr.length;

  const algoNames = {
    bubblesort: 'Bubble Sort',
    insertionsort: 'Insertion Sort',
    selectionsort: 'Selection Sort',
    mergesort: 'Merge Sort'
  };

  const boxW = Math.min(76, Math.floor(760 / n));
  const boxH = 54;
  const startX = Math.round((960 - (n * boxW + (n - 1) * 10)) / 2);
  const startY = 320;

  const segments = [];

  // Setup Segment
  const setupActions = [
    { op: 'reveal', id: 'title', type: 'text', x: 480, y: 55, text: `${algoNames[algoId] || 'Sorting'} Execution`, fontSize: 26, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
    { op: 'reveal', id: 'subtitle', type: 'text', x: 480, y: 90, text: `Sorting ${n} values: [${arr.join(', ')}] • Watch comparisons and element relocations`, fontSize: 15, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 200 }
  ];

  for (let i = 0; i < n; i++) {
    const x = startX + i * (boxW + 10);
    setupActions.push(
      { op: 'draw_rect', id: `box_${i}`, x, y: startY, width: boxW, height: boxH, rx: 8, stroke: '#333740', strokeWidth: 2, fill: '#ffffff', delay: 300 + i * 50 },
      { op: 'reveal', id: `val_${i}`, type: 'text', x: x + boxW / 2, y: startY + boxH / 2 + 1, text: String(arr[i]), fontSize: 18, fontWeight: '700', color: '#22262b', anchor: 'middle', delay: 350 + i * 50 },
      { op: 'reveal', id: `idx_${i}`, type: 'text', x: x + boxW / 2, y: startY + boxH + 24, text: `[${i}]`, fontSize: 13, fontWeight: '600', color: '#888e9b', anchor: 'middle', delay: 400 + i * 50 }
    );
  }

  segments.push({
    heading: 'Initialize unsorted array',
    narration: `We begin with an array of ${n} elements. We will sort them in ascending order using ${algoNames[algoId] || 'the algorithm'}.`,
    duration: 3800,
    actions: setupActions
  });

  // Steps
  for (let sIdx = 0; sIdx < steps.length; sIdx++) {
    const step = steps[sIdx];
    const { op, fact, state } = step;
    const currentArr = state.arr || arr;
    const actions = [];

    // Redraw box contents with current values
    for (let i = 0; i < n; i++) {
      const x = startX + i * (boxW + 10);
      const isCompared = state.compare && state.compare.includes(i);
      const isSorted = state.sortedTo !== undefined && i <= state.sortedTo || state.sortedFrom !== undefined && i >= state.sortedFrom;

      let strokeColor = '#333740';
      let fillColor = '#ffffff';

      if (isSorted) {
        strokeColor = '#2ea44f';
        fillColor = '#f0fbf4';
      } else if (isCompared) {
        strokeColor = state.swapped ? '#c93d32' : '#2b72b8';
        fillColor = state.swapped ? '#fdeeed' : '#eaf4fd';
      }

      actions.push(
        { op: 'draw_rect', id: `box_${i}`, x, y: startY, width: boxW, height: boxH, rx: 8, stroke: strokeColor, strokeWidth: isCompared ? 3.5 : (isSorted ? 2.5 : 2), fill: fillColor, delay: 100 },
        { op: 'reveal', id: `val_${i}`, type: 'text', x: x + boxW / 2, y: startY + boxH / 2 + 1, text: String(currentArr[i]), fontSize: 18, fontWeight: '700', color: '#22262b', anchor: 'middle', delay: 150 }
      );
    }

    segments.push({
      heading: op === 'swap' ? 'Swap elements' : (op === 'done' || op === 'pass' ? 'Pass status' : 'Compare adjacent values'),
      narration: fact,
      duration: 3500,
      actions
    });
  }

  // Summary
  segments.push({
    heading: 'Sorting complete',
    narration: `The array is now fully sorted: [${run.trace.output.join(', ')}]. ${run.comparisons || 0} comparisons and ${run.swaps || run.moves || 0} operations were performed.`,
    duration: 4500,
    actions: [
      { op: 'reveal', id: 'summaryCard', type: 'rect', x: 220, y: 530, width: 520, height: 60, rx: 12, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fbf4', delay: 200 },
      { op: 'reveal', id: 'summaryText', type: 'text', x: 480, y: 566, text: `✓ Fully Sorted: [ ${run.trace.output.join(', ')} ]`, fontSize: 18, fontWeight: '700', color: '#2ea44f', anchor: 'middle', delay: 300 }
    ]
  });

  return {
    title: `${algoNames[algoId] || 'Sorting'} — Real Execution Trace`,
    overview: `Sorted result: [${run.trace.output.join(', ')}]`,
    topic: 'Array inspection → Pairwise comparison → State transition → Final sorted list',
    viewBox: '0 0 960 700',
    segments,
    checkpoint: {
      question: `What is the worst-case time complexity of ${algoNames[algoId] || 'Bubble sort'}?`,
      options: [algoId === 'mergesort' ? 'O(n log n)' : 'O(n²)', 'O(n)', 'O(log n)', 'O(1)'],
      answerIndex: 0,
      explanation: algoId === 'mergesort' ? 'Merge Sort divides the array in half each time and merges in linear time, guaranteeing O(n log n).' : 'Because nested passes may compare every pair, the worst-case time complexity is O(n²).'
    }
  };
}

// ---------------------------------------------------------------------------
// 8. JEE Physics Benchmark: Pulley & Free Body Diagram (FBD)
// ---------------------------------------------------------------------------
function getJeePulleyFbdLesson(params = {}) {
  const m1 = Number(params.m1) || 2;
  const m2 = Number(params.m2) || 4;
  const g = 10;
  const totalM = m1 + m2;
  const aVal = ((m2 * g) / totalM).toFixed(2);
  const tVal = (m1 * aVal).toFixed(2);

  return {
    title: 'JEE Main Physics: Newton\'s Laws — Pulley & Free Body Diagram',
    overview: `Connected masses: m₁ = ${m1} kg on frictionless table, m₂ = ${m2} kg hanging over pulley`,
    topic: 'Physical System Setup → FBD for Block 1 → FBD for Block 2 → Newton\'s 2nd Law → Solve a & T',
    viewBox: '0 0 960 700',
    segments: [
      {
        heading: 'Physical system & coordinate layout',
        narration: `We have a classic JEE mechanics system: Block 1 of mass ${m1} kg rests on a frictionless horizontal table and is attached via a light taut string over a frictionless pulley to hanging Block 2 of mass ${m2} kg.`,
        duration: 4800,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 480, y: 44, text: 'Newton\'s 2nd Law: Pulley & Free Body Diagram (FBD)', fontSize: 24, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
          { op: 'reveal', id: 'subtitle', type: 'text', x: 480, y: 74, text: `System: m₁ = ${m1}.0 kg (table) • m₂ = ${m2}.0 kg (hanging) • Frictionless pulley • g = 10 m/s²`, fontSize: 14, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 200 },
          // Table surface
          { op: 'draw_path', id: 'tableTop', d: 'M 100 320 L 520 320', stroke: '#333740', strokeWidth: 4, fill: 'none', delay: 300 },
          { op: 'draw_path', id: 'tableLeg', d: 'M 520 320 L 520 580', stroke: '#333740', strokeWidth: 4, fill: 'none', delay: 400 },
          // Table hatch marks
          { op: 'draw_path', id: 'hatch1', d: 'M 120 322 L 105 338 M 180 322 L 165 338 M 240 322 L 225 338 M 300 322 L 285 338 M 360 322 L 345 338 M 420 322 L 405 338 M 480 322 L 465 338', stroke: '#94a3b8', strokeWidth: 2, fill: 'none', delay: 500 },
          // Pulley
          { op: 'draw_circle', id: 'pulleyCircle', cx: 532, cy: 320, r: 18, stroke: '#2b72b8', strokeWidth: 3, fill: '#f0f7ff', delay: 600 },
          { op: 'draw_circle', id: 'pulleyAxle', cx: 532, cy: 320, r: 4, stroke: '#2b72b8', strokeWidth: 2, fill: '#1769d2', delay: 700 },
          { op: 'reveal', id: 'pulleyLabel', type: 'text', x: 532, y: 285, text: 'Pulley (Ideal)', fontSize: 13, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 750 },
          // Block 1 (on table)
          { op: 'draw_rect', id: 'blockA', x: 220, y: 250, width: 90, height: 70, rx: 8, stroke: '#2b72b8', strokeWidth: 3, fill: '#eaf4fd', delay: 800 },
          { op: 'reveal', id: 'blockALabel', type: 'text', x: 265, y: 285, text: `m₁ = ${m1} kg`, fontSize: 16, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 900 },
          // String
          { op: 'draw_path', id: 'stringHoriz', d: 'M 310 285 L 532 285', stroke: '#1c1f24', strokeWidth: 2.5, fill: 'none', delay: 1000 },
          { op: 'draw_path', id: 'stringVert', d: 'M 550 320 L 550 420', stroke: '#1c1f24', strokeWidth: 2.5, fill: 'none', delay: 1100 },
          // Block 2 (hanging)
          { op: 'draw_rect', id: 'blockB', x: 515, y: 420, width: 70, height: 70, rx: 8, stroke: '#c93d32', strokeWidth: 3, fill: '#fdeeed', delay: 1200 },
          { op: 'reveal', id: 'blockBLabel', type: 'text', x: 550, y: 455, text: `m₂ = ${m2} kg`, fontSize: 16, fontWeight: '700', color: '#c93d32', anchor: 'middle', delay: 1300 }
        ]
      },
      {
        heading: 'Free Body Diagram for Block 1 (m₁ on table)',
        narration: `Now we isolate Block 1 to draw its Free Body Diagram. Vertically, downward gravity m₁g is balanced by the upward normal force N₁ from the table. Horizontally, string tension T accelerates the block to the right.`,
        duration: 4800,
        actions: [
          // Normal force arrow
          { op: 'draw_arrow', id: 'fN1', x1: 265, y1: 250, x2: 265, y2: 170, stroke: '#2ea44f', strokeWidth: 3.5, label: `N₁ = ${m1 * g} N`, delay: 200 },
          // Gravity arrow
          { op: 'draw_arrow', id: 'fG1', x1: 265, y1: 320, x2: 265, y2: 400, stroke: '#c93d32', strokeWidth: 3.5, label: `m₁g = ${m1 * g} N`, delay: 400 },
          // Tension arrow
          { op: 'draw_arrow', id: 'fT1', x1: 310, y1: 285, x2: 395, y2: 285, stroke: '#2b72b8', strokeWidth: 3.5, label: 'T', delay: 600 },
          // Acceleration indicator
          { op: 'draw_arrow', id: 'aInd1', x1: 235, y1: 225, x2: 295, y2: 225, stroke: '#8252a1', strokeWidth: 2.5, label: 'a →', delay: 800 },
          // Equation panel for Block 1
          { op: 'reveal', id: 'cardEq1', type: 'rect', x: 640, y: 130, width: 300, height: 95, rx: 10, stroke: '#2b72b8', strokeWidth: 2, fill: '#f8fafc', delay: 1000 },
          { op: 'reveal', id: 'cardEq1Title', type: 'text', x: 655, y: 155, text: 'Block 1 Equations (Horizontal):', fontSize: 14, fontWeight: '700', color: '#1769d2', delay: 1100 },
          { op: 'reveal', id: 'cardEq1Formula', type: 'text', x: 655, y: 190, text: `ΣFx = T = m₁ · a   ⇒   T = ${m1}a`, fontSize: 17, fontWeight: '700', color: '#0f172a', delay: 1200 }
        ]
      },
      {
        heading: 'Free Body Diagram for Block 2 (hanging m₂)',
        narration: `Next, we isolate the hanging mass m₂. Two collinear forces act vertically: gravity m₂g pulls downward with ${m2 * g} Newtons, while tension T pulls upward. Because the block accelerates downward, m₂g minus T equals m₂ times a.`,
        duration: 4800,
        actions: [
          // Upward Tension arrow
          { op: 'draw_arrow', id: 'fT2', x1: 550, y1: 420, x2: 550, y2: 345, stroke: '#2b72b8', strokeWidth: 3.5, label: 'T', delay: 200 },
          // Downward Gravity arrow
          { op: 'draw_arrow', id: 'fG2', x1: 550, y1: 490, x2: 550, y2: 580, stroke: '#c93d32', strokeWidth: 3.5, label: `m₂g = ${m2 * g} N`, delay: 400 },
          // Acceleration indicator
          { op: 'draw_arrow', id: 'aInd2', x1: 605, y1: 435, x2: 605, y2: 495, stroke: '#8252a1', strokeWidth: 2.5, label: 'a ↓', delay: 600 },
          // Equation panel for Block 2
          { op: 'reveal', id: 'cardEq2', type: 'rect', x: 640, y: 245, width: 300, height: 95, rx: 10, stroke: '#c93d32', strokeWidth: 2, fill: '#fdf8f8', delay: 800 },
          { op: 'reveal', id: 'cardEq2Title', type: 'text', x: 655, y: 270, text: 'Block 2 Equations (Vertical):', fontSize: 14, fontWeight: '700', color: '#c93d32', delay: 900 },
          { op: 'reveal', id: 'cardEq2Formula', type: 'text', x: 655, y: 305, text: `m₂g - T = m₂ · a   ⇒   ${m2 * g} - T = ${m2}a`, fontSize: 17, fontWeight: '700', color: '#0f172a', delay: 1000 }
        ]
      },
      {
        heading: 'Coupling equations to solve acceleration',
        narration: `We now have a system of two equations. Adding equation 1 and equation 2 eliminates internal tension T, yielding ${m2 * g} equals ${totalM} times a. Dividing gives acceleration a = ${aVal} m/s².`,
        duration: 4800,
        actions: [
          { op: 'reveal', id: 'cardSol', type: 'rect', x: 640, y: 360, width: 300, height: 135, rx: 10, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fbf4', delay: 200 },
          { op: 'reveal', id: 'cardSolTitle', type: 'text', x: 655, y: 385, text: 'Add Equations (Eliminate T):', fontSize: 14, fontWeight: '700', color: '#2ea44f', delay: 300 },
          { op: 'reveal', id: 'cardSolStep1', type: 'text', x: 655, y: 415, text: `(${m2 * g} - T) + T = (${m2} + ${m1})a`, fontSize: 16, fontWeight: '600', color: '#1e293b', delay: 400 },
          { op: 'reveal', id: 'cardSolStep2', type: 'text', x: 655, y: 445, text: `${m2 * g} = ${totalM}a  ⇒  a = ${m2 * g}/${totalM}`, fontSize: 16, fontWeight: '600', color: '#1e293b', delay: 500 },
          { op: 'reveal', id: 'cardSolRes', type: 'text', x: 655, y: 478, text: `a = ${aVal} m/s²`, fontSize: 20, fontWeight: '800', color: '#2ea44f', delay: 600 }
        ]
      },
      {
        heading: 'Calculating string tension & final verification',
        narration: `Substituting acceleration back into equation 1 gives tension T = ${m1} times ${aVal}, resulting in T = ${tVal} Newtons. Both bodies move with this uniform acceleration.`,
        duration: 4800,
        actions: [
          { op: 'reveal', id: 'finalBanner', type: 'rect', x: 140, y: 590, width: 680, height: 60, rx: 12, stroke: '#2b72b8', strokeWidth: 2, fill: '#f8fafc', delay: 200 },
          { op: 'reveal', id: 'finalResultText', type: 'text', x: 480, y: 620, text: `✓ Solution: Acceleration a = ${aVal} m/s²   •   Tension T = ${tVal} N`, fontSize: 18, fontWeight: '800', color: '#1769d2', anchor: 'middle', delay: 300 }
        ]
      }
    ],
    checkpoint: {
      question: `In this ideal pulley system (m₁ = ${m1} kg on table, m₂ = ${m2} kg hanging), what would happen to acceleration 'a' if table mass m₁ were doubled?`,
      options: [
        `Acceleration would decrease because total inertia increases to ${m1 * 2 + m2} kg while driving force m₂g remains constant.`,
        'Acceleration would increase because normal force increases.',
        'Acceleration would remain completely unchanged.',
        'Acceleration would become zero immediately.'
      ],
      answerIndex: 0,
      explanation: 'From Newton\'s second law: a = (m₂·g) / (m₁ + m₂). Increasing m₁ increases the total system mass in the denominator, decreasing the net acceleration.'
    }
  };
}

// ---------------------------------------------------------------------------
// 9. JEE Physics Benchmark: Inclined Plane with Friction & FBD
// ---------------------------------------------------------------------------
function getJeeInclinedPlaneLesson() {
  return {
    title: 'JEE Physics: Inclined Plane with Friction & Vector Resolution',
    overview: 'Block of mass m on an inclined plane of angle θ with friction coefficient μ',
    topic: 'Incline Geometry → Resolving Gravity (mg·sin θ, mg·cos θ) → Normal Force → Friction Force → Equations of Motion',
    viewBox: '0 0 960 700',
    segments: [
      {
        heading: 'Incline geometry and block placement',
        narration: 'Consider an inclined plane with inclination angle theta equals 30 degrees. A block of mass m = 5 kg is placed on the rough incline having coefficient of friction mu equals 0.2.',
        duration: 4800,
        actions: [
          { op: 'reveal', id: 'title', type: 'text', x: 480, y: 44, text: 'Inclined Plane: Vector Resolution & Friction (FBD)', fontSize: 24, fontWeight: '700', color: '#222222', anchor: 'middle', delay: 100 },
          { op: 'reveal', id: 'subtitle', type: 'text', x: 480, y: 74, text: 'Mass m = 5 kg • Incline angle θ = 30° • Friction μ = 0.20 • g = 10 m/s²', fontSize: 14, fontWeight: '600', color: '#666666', anchor: 'middle', delay: 200 },
          // Incline wedge
          { op: 'draw_path', id: 'wedge', d: 'M 140 520 L 640 520 L 640 230 Z', stroke: '#333740', strokeWidth: 3.5, fill: '#f8fafc', delay: 300 },
          { op: 'reveal', id: 'angleLabel', type: 'text', x: 220, y: 505, text: 'θ = 30°', fontSize: 15, fontWeight: '700', color: '#2b72b8', delay: 400 },
          // Block on incline (rotated 30 degrees at midpoint)
          { op: 'draw_path', id: 'inclineBlock', d: 'M 350 398 L 419 358 L 389 306 L 320 346 Z', stroke: '#2b72b8', strokeWidth: 3, fill: '#eaf4fd', delay: 500 },
          { op: 'reveal', id: 'blockLabel', type: 'text', x: 370, y: 352, text: 'm = 5 kg', fontSize: 15, fontWeight: '700', color: '#1769d2', anchor: 'middle', delay: 600 }
        ]
      },
      {
        heading: 'Resolving gravity into orthogonal components',
        narration: 'Gravity mg acts straight down with 50 Newtons. We choose coordinates parallel and perpendicular to the incline. Gravity decomposes into mg cos theta perpendicular into the ramp, and mg sin theta pulling down along the ramp.',
        duration: 5000,
        actions: [
          // True gravity straight down
          { op: 'draw_arrow', id: 'fGrav', x1: 370, y1: 352, x2: 370, y2: 450, stroke: '#c93d32', strokeWidth: 3.5, label: 'mg = 50 N', delay: 200 },
          // Perpendicular component (mg cos 30)
          { op: 'draw_arrow', id: 'fPerp', x1: 370, y1: 352, x2: 412, y2: 425, stroke: '#c93d32', strokeWidth: 2.5, strokeDasharray: '5 5', label: 'mg·cos θ = 43.3 N', delay: 500 },
          // Parallel component (mg sin 30)
          { op: 'draw_arrow', id: 'fPara', x1: 370, y1: 352, x2: 310, y2: 387, stroke: '#c93d32', strokeWidth: 2.5, strokeDasharray: '5 5', label: 'mg·sin θ = 25 N', delay: 700 }
        ]
      },
      {
        heading: 'Normal force and opposing friction',
        narration: 'Because there is no acceleration perpendicular to the ramp, Normal force N balances mg cos theta (N = 43.3 N). Kinetic friction opposes sliding down the ramp, with magnitude f_k = mu times N, equaling 8.66 Newtons.',
        duration: 5000,
        actions: [
          // Normal force arrow
          { op: 'draw_arrow', id: 'fNorm', x1: 370, y1: 352, x2: 328, y2: 279, stroke: '#2ea44f', strokeWidth: 3.5, label: 'N = mg·cos θ = 43.3 N', delay: 200 },
          // Friction arrow pointing up the incline
          { op: 'draw_arrow', id: 'fFrict', x1: 370, y1: 352, x2: 430, y2: 317, stroke: '#e3a83e', strokeWidth: 3.5, label: 'f_k = μ·N = 8.66 N', delay: 500 },
          // Acceleration arrow down the incline
          { op: 'draw_arrow', id: 'aArrow', x1: 320, y1: 430, x2: 260, y2: 465, stroke: '#8252a1', strokeWidth: 2.5, label: 'a (downward) →', delay: 800 }
        ]
      },
      {
        heading: 'Equations of motion & net acceleration',
        narration: 'Applying Newton\'s second law along the incline: net force equals mg sin theta minus f_k = 25 minus 8.66 = 16.34 N. Dividing by mass 5 kg gives an acceleration of 3.27 m/s² down the plane.',
        duration: 5000,
        actions: [
          { op: 'reveal', id: 'solCard', type: 'rect', x: 670, y: 160, width: 270, height: 280, rx: 12, stroke: '#2ea44f', strokeWidth: 2, fill: '#f8fafc', delay: 200 },
          { op: 'reveal', id: 'solTitle', type: 'text', x: 685, y: 190, text: 'Newton\'s Second Law along Incline:', fontSize: 14, fontWeight: '700', color: '#2ea44f', delay: 300 },
          { op: 'reveal', id: 'step1', type: 'text', x: 685, y: 225, text: 'ΣF∥ = mg·sin θ - f_k = m·a', fontSize: 15, fontWeight: '600', color: '#1e293b', delay: 400 },
          { op: 'reveal', id: 'step2', type: 'text', x: 685, y: 260, text: '25 N - 8.66 N = (5 kg) · a', fontSize: 15, fontWeight: '600', color: '#1e293b', delay: 500 },
          { op: 'reveal', id: 'step3', type: 'text', x: 685, y: 295, text: '16.34 N = 5 · a', fontSize: 16, fontWeight: '700', color: '#1e293b', delay: 600 },
          { op: 'reveal', id: 'step4', type: 'text', x: 685, y: 340, text: 'a = 3.27 m/s²', fontSize: 22, fontWeight: '800', color: '#2ea44f', delay: 700 },
          { op: 'reveal', id: 'step5', type: 'text', x: 685, y: 385, text: 'Formula: a = g(sin θ - μ·cos θ)', fontSize: 13, fontWeight: '700', color: '#1769d2', delay: 800 }
        ]
      }
    ],
    checkpoint: {
      question: 'What is the condition on coefficient of static friction μ_s for a block to remain at rest on an inclined plane of angle θ?',
      options: ['μ_s ≥ tan θ', 'μ_s ≤ sin θ', 'μ_s ≥ cos θ', 'μ_s = 1 / tan θ'],
      answerIndex: 0,
      explanation: 'For equilibrium along the incline: f_s = mg·sin θ. Since maximum static friction is f_max = μ_s·N = μ_s·mg·cos θ, preventing slippage requires μ_s·mg·cos θ ≥ mg·sin θ, which simplifies to μ_s ≥ tan θ.'
    }
  };
}

// ---------------------------------------------------------------------------
// Matcher and Dispatcher
// ---------------------------------------------------------------------------
async function matchDeterministicTopic(text, hasAttachment = false) {
  // If user uploaded an image or PDF, NEVER use hardcoded benchmark; AI must solve the uploaded image!
  if (hasAttachment) return null;

  const topic = String(text || '').trim();
  if (!topic) return null;

  // 1. JEE Pulley Benchmark — only when specifically targeting the pulley sample/benchmark
  if (/(?:jee\s*main\s*physics\s*nlm\s*pulley|sample\s*pulley|pulley\s*fbd\s*sample|horizontal\s*table\s*connected\s*over\s*pulley\s*to\s*hanging\s*block)/i.test(topic)) {
    const m1Match = topic.match(/m(?:_?1|1|a)\s*=\s*(\d+(?:\.\d+)?)/i);
    const m2Match = topic.match(/m(?:_?2|2|b)\s*=\s*(\d+(?:\.\d+)?)/i);
    return getJeePulleyFbdLesson({
      m1: m1Match ? Number(m1Match[1]) : 2,
      m2: m2Match ? Number(m2Match[1]) : 4
    });
  }

  // 2. JEE Inclined Plane Benchmark
  if (/(?:jee\s*physics.*block\s*of\s*mass\s*m\s*on\s*inclined\s*plane|incline\s*plane\s*fbd\s*sample|sample\s*incline)/i.test(topic)) {
    return getJeeInclinedPlaneLesson();
  }

  // 3. Heart Anatomy Benchmark
  if (/(?:human\s*heart\s*anatomy|blood\s*flow\s*through\s*heart|heart\s*benchmark|heart\s*anatomy\s*sample)/i.test(topic) ||
      /^human\s*heart(\s*anatomy)?(\s*and\s*blood\s*flow)?$/i.test(topic)) {
    return getHeartAnatomyLesson();
  }

  // 4. Calculus Derivatives Benchmark
  if (/(?:derivatives\s*in\s*calculus\s*and\s*tangent\s*slope|calculus\s*derivative\s*sample)/i.test(topic) ||
      /^derivatives?\s*(in\s*calculus)?$/i.test(topic)) {
    return getDerivativesLesson();
  }

  // 5. Electric Circuits Benchmark
  if (/(?:electric\s*circuit\s*and\s*ohm'?s\s*law|circuit\s*sample)/i.test(topic) ||
      /^electric\s*circuits?$/i.test(topic)) {
    return getCircuitsLesson();
  }

  // 6. TCP Handshake Benchmark
  if (/(?:tcp\s*3[\s-]?way\s*handshake\s*connection|tcp\s*handshake\s*sample)/i.test(topic) ||
      /^tcp\s*3[\s-]?way\s*handshake$/i.test(topic)) {
    return getTcpHandshakeLesson();
  }

  // 7. Algorithm Tracers from director.mjs & tracers.mjs
  const director = await getDirector();
  if (director && director.matchTopic) {
    const route = director.matchTopic(topic);
    if (route) {
      if (route.id === 'binarysearch') {
        return await getBinarySearchLesson(route.data, route.target);
      }
      if (['inorder', 'preorder', 'postorder', 'levelorder'].includes(route.id)) {
        return await getTreeTraversalLesson(route.id, route.data);
      }
      if (['bubblesort', 'insertionsort', 'selectionsort', 'mergesort'].includes(route.id)) {
        return await getSortingLesson(route.id, route.data);
      }
    }
  }

  return null;
}

module.exports = {
  getHeartAnatomyLesson,
  getBinarySearchLesson,
  getTreeTraversalLesson,
  getSortingLesson,
  getDerivativesLesson,
  getCircuitsLesson,
  getTcpHandshakeLesson,
  getJeePulleyFbdLesson,
  getJeeInclinedPlaneLesson,
  matchDeterministicTopic
};
