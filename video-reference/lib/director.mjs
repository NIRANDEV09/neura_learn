// The lesson director. The split of responsibilities is the product:
//   - the tracer runs the algorithm and records every state (lib/tracers.mjs)
//   - this file cuts that trace into scenes, adds intro / misconception /
//     recap scenes and builds checkpoints whose answers come from the trace
//   - the AI only rewrites narration and, for interrupt questions, chooses
//     which real states to point at. Its output is validated and anything
//     that names values outside the computed facts is thrown away.
import { ALGORITHMS, LINEAR, runAlgorithm, treeValues, treePath, isBst, hasNode, leftOf, rightOf, graphNodes, adjacency, searchTreePath } from './tracers.mjs';
import { validateScenes, validateLesson, numbersIn, targetChecker } from './lessonSchema.mjs';

const list = a => `[${a.join(', ')}]`;
const andList = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Topic routing ----
const ROUTES = [
  ['bfs', /\b(bfs|breadth[\s-]?first)\b[^.?!]*\bgraphs?\b|\bgraphs?\b[^.?!]*\b(bfs|breadth[\s-]?first)\b/i],
  ['dfs', /\b(dfs|depth[\s-]?first)\b[^.?!]*\bgraphs?\b|\bgraphs?\b[^.?!]*\b(dfs|depth[\s-]?first)\b/i],
  ['levelorder', /\blevel[\s-]?order\b|\bbfs\b[^.?!]*\btree\b|\btree\b[^.?!]*\b(bfs|breadth[\s-]?first)\b|\bbreadth[\s-]?first\s+traversal\b/i],
  ['preorder', /\b(dfs|depth[\s-]?first)\b[^.?!]*\btrees?\b|\btrees?\b[^.?!]*\b(dfs|depth[\s-]?first)\b/i],
  ['inorder', /\bin-?order\b(?!\s+to\b)|\bin order traversal\b/i],
  ['preorder', /\bpre[\s-]?order\b/i],
  ['postorder', /\bpost[\s-]?order\b/i],
  ['binarysearch', /\bbinary\s+search\b(?!\s+trees?\b)|\bbinarysearch\b/i],
  ['bubblesort', /\bbubble\s*sort/i],
  ['insertionsort', /\binsertion\s*sort/i],
  ['selectionsort', /\bselection\s*sort/i],
  ['mergesort', /\bmerge\s*sort|\bmerging\s+(two\s+)?sorted\b/i],
  ['bfs', /\bbfs\b|\bbreadth[\s-]?first\b|\bgraph\s+(traversals?|search)\b/i],
  ['dfs', /\bdfs\b|\bdepth[\s-]?first\b/i],
  ['fibonacci', /\bfib(onacci)?\b|\brecursion\s+trees?\b|\brecursive\s+calls?\b|\bcall\s+trees?\b/i],
  ['stack', /\bstacks?\b|\bpush\b[^.?!]*\bpop\b|\blifo\b/i],
  ['queue', /\bqueues?\b|\benqueue\b|\bdequeue\b|\bfifo\b/i],
  ['inorder', /\b(binary\s+)?tree\s+traversals?\b|\btraversing\s+a\s+(binary\s+)?tree\b/i],
];
// Inputs for the newer visuals are written differently from a plain number list.
function matchGraph(topic) {
  const edges = [];
  let rest = topic.replace(/\[\s*(\d+)\s*,\s*(\d+)\s*\]|\b(\d+)\s*(?:<?-+>?|–|—)\s*(\d+)\b/g, (_, a, b, c, d) => { edges.push([Number(a ?? c), Number(b ?? d)]); return ' '; });
  const s = rest.match(/\b(?:from|start(?:ing)?(?:\s+(?:at|from))?|source)\s*(?:node|vertex)?\s*(?:=|:)?\s*(\d+)\b/i);
  return { data: edges.length ? edges : undefined, target: s ? Number(s[1]) : undefined };
}
function matchOps(topic, kind) {
  const ops = [...topic.matchAll(/\b(push|pop|peek|enqueue|dequeue)\b\s*\(?\s*(-?\d+(?:\.\d+)?)?/gi)].map(m => (m[2] === undefined ? m[1].toLowerCase() : `${m[1].toLowerCase()} ${m[2]}`));
  if (ops.length) return { data: ops };
  // A bare list of values: add them all, then remove them all.
  const nums = (topic.match(/\[([^\]]*)\]/)?.[1] || '').split(/[\s,]+/).filter(p => /^-?\d+(\.\d+)?$/.test(p));
  if (nums.length) { const { add, remove } = LINEAR[kind]; return { data: [...nums.map(v => `${add} ${v}`), ...nums.map(() => remove)] }; }
  return { data: undefined };
}
export function matchTopic(text) {
  const topic = String(text || '');
  const route = ROUTES.find(([, re]) => re.test(topic));
  if (!route) return null;
  const id = route[0];
  if (id === 'bfs' || id === 'dfs') return { id, ...matchGraph(topic) };
  if (id === 'stack' || id === 'queue') return { id, ...matchOps(topic, id) };
  if (id === 'fibonacci') { const n = topic.match(/\bfib(?:onacci)?\s*(?:\(\s*|of\s+|number\s+)?(\d+)|\bn\s*=\s*(\d+)/i); return { id, data: n ? [Number(n[1] ?? n[2])] : undefined }; }
  let rest = topic, data;
  const bracket = rest.match(/\[([^\]]*)\]/);
  const plain = rest.match(/(?:^|[^\d.-])(-?\d+(?:\s*,\s*(?:-?\d+|null))+)/i);
  const raw = bracket ? bracket[1] : plain ? plain[1] : null;
  if (raw !== null) {
    const parts = raw.split(/[\s,]+/).filter(Boolean);
    if (parts.length && parts.every(p => /^(-?\d+(\.\d+)?|null)$/i.test(p))) data = parts.map(p => (/^null$/i.test(p) ? null : Number(p)));
    rest = rest.replace(bracket ? bracket[0] : plain[1], ' ');
  }
  const t = rest.match(/\b(?:for|find|finding|target|key|search(?:ing)?\s+for|look(?:ing)?\s+for)\s*(?:=|:)?\s*(-?\d+(?:\.\d+)?)\b/i);
  return { id: route[0], data, target: t ? Number(t[1]) : undefined };
}

// ---- Helpers over a run ----
const stepWhere = (trace, pred, from = 0) => { for (let k = from; k < trace.steps.length; k++) if (pred(trace.steps[k], k)) return k; return -1; };
const lastStep = trace => trace.steps.length - 1;
const show = at => ({ op: 'show', ...(Number.isInteger(at) && at >= 0 ? { at } : {}) });
const step = index => ({ op: 'step', index });
const beat = (say, action) => ({ say, action });
// Deterministic option order so the answer is not always in the same slot.
function arrange(answer, distractors, seed) {
  const opts = [...new Set([answer, ...distractors].map(String))].slice(0, 3);
  const r = Math.abs(Math.round(seed)) % opts.length;
  return { options: [...opts.slice(r), ...opts.slice(0, r)], answer: String(answer) };
}
const seedOf = data => data.reduce((s, v) => s + (Number(v) || 0), 0);
const COMPUTED_NOTE = 'Every frame you are about to see is a real step recorded while running the algorithm on this exact input.';

// ---- Per-algorithm teaching templates. Every number comes from the run. ----
function treeTemplates(run) {
  const { id, visual: { data }, trace } = run;
  const root = data[0], out = trace.output, values = treeValues(data);
  const visitOf = v => stepWhere(trace, s => s.op === 'visit' && s.state.current === v);
  const kids = [leftOf(0), rightOf(0)].filter(k => hasNode(data, k)).map(k => data[k]);
  const recapEnd = [beat(`${run.name} printed ${list(out)}.`, step(lastStep(trace))),
    beat('Each node is reached once and printed once, so the traversal takes O(n) time for n nodes.', show(lastStep(trace)))];
  const dfsSpace = beat('The call stack holds one frame for each node on the current path, so it needs O(h) extra space for a tree of height h.', show(lastStep(trace)));
  const others = v => values.filter(x => x !== v);

  if (id === 'inorder') {
    const first = out[0], path = treePath(data, first), parent = path.length > 1 ? path[path.length - 2] : null;
    return {
      intro: [beat('Inorder traversal visits a binary tree in this order: the left subtree, then the node itself, then the right subtree.', show()),
        beat(`Here is our tree. Its root is ${root}.`, { op: 'pulse', target: root }),
        ...(isBst(data) && values.length > 2 ? [beat('This is a binary search tree, so inorder prints its values in sorted order.', { op: 'highlight', targets: values })] : []),
        beat(COMPUTED_NOTE, show())],
      misconception: [beat(`A common mistake is to print the root, ${root}, first.`, { op: 'pulse', target: root }),
        beat('Printing a node before its children is preorder, not inorder.', { op: 'pulse', target: root }),
        path.length > 1 ? beat(`Inorder prints a node only after its whole left subtree is done, so the first value printed is the leftmost node, ${first}.`, { op: 'traverse', path })
          : beat('This root has no left subtree, so here the root really is printed first.', { op: 'pulse', target: root })],
      checkpoint: { q: 'In an inorder traversal of this tree, which value is printed first?', ...arrange(first, [root, ...others(first).filter(v => v !== root)], seedOf(data)) },
      remedial: [beat('Think of inorder as: keep walking left until you cannot go any further.', path.length > 1 ? { op: 'traverse', path } : show()),
        beat(`${first} has no left child, so it is the first value printed.`, step(visitOf(first))),
        ...(parent !== null ? [beat(`Only then does the recursion return to ${parent} and print it.`, step(visitOf(parent)))] : [])],
      recap: [...recapEnd, dfsSpace],
    };
  }
  if (id === 'preorder') {
    const level = runAlgorithm('levelorder', data).trace.output;
    const third = out[Math.min(2, out.length - 1)];
    const pathThird = treePath(data, third);
    return {
      intro: [beat('Preorder traversal prints a node first, then its left subtree, then its right subtree.', show()),
        beat(`Here is our tree. Its root is ${root}, so ${root} is printed first.`, { op: 'pulse', target: root }), beat(COMPUTED_NOTE, show())],
      misconception: [beat('A common mistake is to think preorder prints the tree level by level.', kids.length ? { op: 'highlight', targets: [root, ...kids] } : show()),
        out.length > 2 && level[2] !== out[2]
          ? beat(`Level by level would print ${list(level.slice(0, 3))}, but preorder prints ${list(out.slice(0, 3))}: it goes deep on the left before it moves right.`, pathThird.length > 1 ? { op: 'traverse', path: pathThird } : show())
          : beat('Preorder is depth-first: it goes as deep as it can on the left before it moves right.', show())],
      checkpoint: out.length > 2
        ? { q: 'In a preorder traversal of this tree, which value is printed third?', ...arrange(out[2], [level[2], ...others(out[2])], seedOf(data)) }
        : { q: 'In a preorder traversal of this tree, which value is printed first?', ...arrange(root, others(root), seedOf(data)) },
      remedial: [beat('Preorder is depth-first: it dives down before it moves sideways.', pathThird.length > 1 ? { op: 'traverse', path: pathThird } : show()),
        beat(`First ${list(out.slice(0, 3))}: each node is printed the moment the recursion arrives at it.`, step(visitOf(third)))],
      recap: [...recapEnd, dfsSpace],
    };
  }
  if (id === 'postorder') {
    return {
      intro: [beat('Postorder traversal prints a node only after its left subtree and then its right subtree are finished.', show()),
        beat(`Here is our tree. Its root is ${root}.`, { op: 'pulse', target: root }), beat(COMPUTED_NOTE, show())],
      misconception: [beat('A common mistake is to print a node as soon as the recursion reaches it.', { op: 'pulse', target: root }),
        beat(`In postorder the root, ${root}, waits for both of its subtrees, so it is printed last.`, step(visitOf(root)))],
      checkpoint: { q: 'In a postorder traversal of this tree, which value is printed last?', ...arrange(root, [out[0], ...others(root).filter(v => v !== out[0])], seedOf(data)) },
      remedial: [beat(`Leaves come out first: ${out[0]} is the first value printed.`, step(visitOf(out[0]))),
        beat(`A parent is printed only after its children, so ${root}, at the top of the tree, must come last.`, step(visitOf(root)))],
      recap: [...recapEnd, dfsSpace],
    };
  }
  // levelorder
  const pre = runAlgorithm('preorder', data).trace.output;
  const n3 = Math.min(2, out.length - 1);
  return {
    intro: [beat('Level-order traversal, which is breadth-first search on a tree, prints the tree one level at a time, from left to right.', show()),
      beat(`Here is our tree. Its root is ${root}.`, { op: 'pulse', target: root }),
      beat('It uses a queue: take the node at the front, print it, and add its children to the back.', show()), beat(COMPUTED_NOTE, show())],
    misconception: [beat('A common mistake is to treat level order like a depth-first traversal.', show()),
      out.length > 2 && pre[2] !== out[2]
        ? beat(`Depth-first preorder would print ${list(pre.slice(0, 3))}, but level order prints ${list(out.slice(0, 3))}, because the queue serves nodes in the order they were added.`, { op: 'highlight', targets: out.slice(0, 3) })
        : beat('The queue serves nodes in the order they were added, so a whole level is printed before the next one starts.', show())],
    checkpoint: { q: `In level order, which value is printed ${n3 === 2 ? 'third' : n3 === 1 ? 'second' : 'first'}?`, ...arrange(out[n3], [pre[n3], ...others(out[n3])], seedOf(data)) },
    remedial: [kids.length === 2
      ? beat(`Watch the queue: ${kids[0]} and ${kids[1]} were both added when ${root} was dequeued.`, step(visitOf(root)))
      : beat('Watch the queue: nodes leave it in exactly the order they entered.', step(visitOf(root))),
      beat(`So ${out[n3]} is printed ${n3 === 2 ? 'third' : n3 === 1 ? 'second' : 'first'}.`, step(visitOf(out[n3])))],
    recap: [recapEnd[0], recapEnd[1], beat('The queue only ever holds about one level of the tree, so it needs O(w) extra space, where w is the widest level.', show(lastStep(trace)))],
  };
}

function arrayTemplates(run) {
  const { id, visual: { data, target }, trace } = run;
  const n = data.length, last = lastStep(trace), out = trace.output;
  const all = data.map((_, k) => k), max = Math.max(...data), min = Math.min(...data);
  const sortIntro = what => [beat(what, show()), beat(`We will sort ${list(data)}.`, { op: 'highlight', targets: all }), beat(COMPUTED_NOTE, show())];
  const sortedRecap = out ? [beat(`Sorted result: ${list(out)}.`, step(last))] : [];

  if (id === 'binarysearch') {
    const m = trace.steps[1]?.state.mid ?? 0, v = data[m], decide = trace.steps[2]?.op;
    const ans = decide === 'right' ? 'The right half' : decide === 'left' ? 'The left half' : 'Neither: we found it';
    const cmp = v < target ? 'is less than' : v > target ? 'is greater than' : 'equals';
    return {
      intro: [beat('Binary search finds a value in a sorted array by repeatedly halving the range that could still contain it.', show()),
        beat(`We are looking for ${target} in these ${n} sorted values.`, { op: 'highlight', targets: all }), beat(COMPUTED_NOTE, show())],
      misconception: [beat('A common mistake is to think binary search works on any array.', show(0)),
        beat('It only works because the array is sorted: when the middle value is smaller than the target, everything to its left is smaller too, so that half can be thrown away.', step(Math.min(2, last)))],
      checkpoint: { q: `The first middle value is ${v}. Which part of the array can still contain ${target}?`, ...arrange(ans, ['The left half', 'The right half', 'Neither: we found it'], seedOf(data)) },
      remedial: [beat(`Compare the middle value with the target: ${v} ${cmp} ${target}.`, step(1)),
        v === target ? beat('So the search ends right there.', step(Math.min(2, last)))
          : beat(`The array is sorted, so every value ${v < target ? 'left' : 'right'} of index ${m} is ${v < target ? 'smaller' : 'bigger'} than ${target} too. Only the ${v < target ? 'right' : 'left'} half can hold it.`, step(2))],
      recap: [trace.found >= 0 ? beat(`Found ${target} at index ${trace.found} after ${trace.iterations} comparisons.`, step(last)) : beat(`${target} is not in the array, and we knew it after ${trace.iterations} comparisons.`, step(last)),
        beat(`Each comparison halves the range, so binary search takes O(log n) time: for ${n} values that is at most ${Math.floor(Math.log2(n)) + 1} comparisons.`, show(last))],
    };
  }
  if (id === 'bubblesort') {
    const passEnd = stepWhere(trace, s => s.op === 'pass' || s.op === 'done');
    return {
      intro: sortIntro('Bubble sort walks through the array again and again, comparing neighbours and swapping them when they are out of order.'),
      misconception: [beat('A common mistake is to think one pass is enough to sort the array.', step(passEnd)),
        beat(`One pass only guarantees that the largest value, ${max}, reaches the end. The rest can still be out of order.`, { op: 'pulse', target: n - 1, at: passEnd })],
      checkpoint: { q: 'After the first pass, which value is guaranteed to be in its final position?', ...arrange(max, [min, data[0], ...data].filter(x => x !== max), seedOf(data)) },
      remedial: [beat('Follow the largest value: once a pass reaches it, every comparison carries it one place to the right.', step(passEnd)),
        beat(`That is why ${max} sits at the end after pass 1 and never moves again.`, { op: 'pulse', target: n - 1, at: passEnd })],
      recap: [...sortedRecap, beat(`This run made ${trace.comparisons} comparisons and ${trace.swaps} swaps.`, show(last)),
        beat('Bubble sort takes O(n²) time in the worst case. Stopping after a pass with no swaps makes it O(n) on an array that is already sorted.', show(last))],
    };
  }
  if (id === 'insertionsort') {
    const [a0, a1] = data, pair = a1 < a0 ? [a1, a0] : [a0, a1];
    const firstShift = stepWhere(trace, s => s.op === 'shift');
    const place1 = stepWhere(trace, s => s.op === 'place');
    const opt = p => list(p);
    return {
      intro: sortIntro('Insertion sort grows a sorted part on the left, one value at a time, by sliding each new value left past bigger values.'),
      misconception: [beat('A common mistake is to think insertion sort swaps values that are far apart.', show()),
        beat('It only moves the new value past its bigger neighbours, one place at a time, so the part on its left stays sorted.', firstShift >= 0 ? step(firstShift) : show())],
      checkpoint: { q: 'After the second value is inserted, what are the first two values?', ...arrange(opt(pair), [opt([a0, a1]), opt([a1, a0]), opt([data[1], data[2] ?? data[0]])], seedOf(data)) },
      remedial: [beat(`Look at just the first two values, ${a0} and ${a1}.`, { op: 'highlight', targets: [0, 1] }),
        a1 < a0 ? beat(`${a1} is smaller, so it slides in front of ${a0}, giving ${list(pair)}.`, step(place1))
          : beat(`${a1} is not smaller than ${a0}, so it stays where it is: ${list(pair)}.`, step(place1))],
      recap: [...sortedRecap, beat(`This run made ${trace.comparisons} comparisons and ${trace.moves} moves.`, show(last)),
        beat('Insertion sort takes O(n²) time in the worst case, but only O(n) when the input is already sorted.', show(last))],
    };
  }
  if (id === 'selectionsort') {
    const pass1End = stepWhere(trace, s => s.op === 'swap' || s.op === 'stay');
    return {
      intro: sortIntro('Selection sort repeatedly finds the smallest value in the unsorted part and swaps it into the next position.'),
      misconception: [beat('A common mistake is to think selection sort finishes early when the array is already sorted.', show()),
        beat(`It does not: every pass scans the whole unsorted part, so it always makes n(n − 1) / 2 comparisons. Here that is ${trace.comparisons}.`, show(last))],
      checkpoint: { q: 'Which value ends up at index 0 after the first pass?', ...arrange(min, [data[0], max, ...data].filter(x => x !== min), seedOf(data)) },
      remedial: [beat(`The first pass looks at every value from index 0 to ${n - 1} and remembers the smallest one.`, step(Math.max(0, pass1End - 1))),
        beat(`The smallest is ${min}, so it goes to index 0.`, step(pass1End))],
      recap: [...sortedRecap, beat(`This run made ${trace.comparisons} comparisons and ${trace.swaps} swaps.`, show(last)),
        beat('Selection sort always makes O(n²) comparisons, but it never needs more than n − 1 swaps.', show(last))],
    };
  }
  // mergesort
  const fm = (() => { let k = -1; trace.steps.forEach((s, i) => { if (s.op === 'merge') k = i; }); return k; })();
  const L = trace.steps[fm].state.left, R = trace.steps[fm].state.right, firstTaken = Math.min(L[0], R[0]);
  return {
    intro: sortIntro('Merge sort splits the array in half, sorts each half, and then merges the two sorted halves.'),
    misconception: [beat('A common mistake is to think merging compares every value with every other value.', step(fm)),
      beat('Merging only ever compares the front values of the two sorted runs, so merging n values takes at most n − 1 comparisons.', step(fm + 1))],
    checkpoint: { q: `In the final merge of ${list(L)} and ${list(R)}, which value is taken first?`, ...arrange(firstTaken, [L[0], R[0], max, ...data].filter(x => x !== firstTaken), seedOf(data)) },
    remedial: [beat('Both runs are already sorted, so the smallest remaining value is always at the front of one of them.', step(fm)),
      beat(`Compare ${L[0]} and ${R[0]}: the smaller one, ${firstTaken}, is taken first.`, step(fm + 1))],
    recap: [...sortedRecap, beat(`This run made ${trace.comparisons} comparisons.`, show(last)),
      beat('Merge sort takes O(n log n) time and needs O(n) extra space for merging.', show(last))],
  };
}

const lastWhere = (trace, pred) => { for (let k = trace.steps.length - 1; k >= 0; k--) if (pred(trace.steps[k], k)) return k; return -1; };
const ordinal = k => ['first', 'second', 'third'][k];

function graphTemplates(run) {
  const { id, visual: { data, start }, trace } = run;
  const out = trace.output, nodes = graphNodes(data), V = nodes.length, E = data.length, last = lastStep(trace);
  const nb = adjacency(data).get(start), seed = seedOf(data.flat());
  const visitOf = v => stepWhere(trace, s => s.op === 'visit' && s.state.current === v);
  const other = runAlgorithm(id === 'bfs' ? 'dfs' : 'bfs', data, start).trace.output;
  const n3 = Math.min(2, out.length - 1), nth = ordinal(n3), differs = out.length > 2 && other[2] !== out[2];
  const pathTo = v => searchTreePath(trace.steps[last].state.treeEdges, start, v);
  const walk = v => (pathTo(v).length > 1 ? { op: 'traverse', path: pathTo(v) } : { op: 'pulse', target: v });
  const checkpoint = { q: `In ${id.toUpperCase()} from ${start}, which node is visited ${nth}?`, ...arrange(out[n3], [other[n3], ...nodes.filter(v => v !== out[n3])], seed) };
  const graphIntro = [beat(`Here is our graph: ${V} nodes and ${E} edges. We start at ${start}.`, { op: 'pulse', target: start }),
    beat('When a node has several neighbours, we check them in increasing order.', { op: 'highlight', targets: [start, ...nb] })];
  if (id === 'bfs') {
    const dist = trace.distance, far = Math.max(...Object.values(dist)), farNode = nodes.find(v => dist[v] === far);
    return {
      intro: [beat('Breadth-first search explores a graph in rings: first the start node, then every node one edge away, then every node two edges away, and so on.', show()),
        ...graphIntro,
        beat('It keeps a queue of nodes waiting to be visited, and marks a node visited the moment it joins the queue, so no node is added twice.', show()),
        beat(COMPUTED_NOTE, show())],
      misconception: [beat('A common mistake is to think BFS follows one path as deep as it can.', show()),
        differs ? beat(`That is depth-first search, which would visit ${list(other.slice(0, 3))} first. BFS visits ${list(out.slice(0, 3))}: every neighbour of ${start} comes before anything farther away.`, { op: 'highlight', targets: out.slice(0, 3) })
          : beat(`BFS finishes every neighbour of ${start} before it looks at anything farther away.`, { op: 'highlight', targets: [start, ...nb] })],
      checkpoint,
      remedial: [beat(`Watch the queue: while ${start} is being visited, its neighbours ${list(nb)} all join the queue.`, step(lastWhere(trace, s => s.op === 'discover' && s.state.current === start))),
        beat(`The queue hands out nodes in the order they joined, so ${out[n3]} is visited ${nth}.`, step(visitOf(out[n3])))],
      recap: [beat(`BFS from ${start} visited ${list(out)}.`, step(last)),
        beat(`The blue edges are the ones BFS used to discover each node. Following them from ${start} gives a path with the fewest possible edges: ${farNode} is the farthest node, ${far} ${far === 1 ? 'edge' : 'edges'} away.`, walk(farNode)),
        beat(`Each node joins the queue once and each edge is checked from both ends, so BFS takes O(V + E) time. Here V is ${V} and E is ${E}.`, show(last)),
        beat('The queue and the visited set need O(V) extra space.', show(last))],
    };
  }
  const deepest = Math.max(...trace.steps.map(s => s.state.stack.length));
  const firstBack = stepWhere(trace, s => s.op === 'return');
  const stuck = trace.steps[firstBack - 1]?.state.current ?? trace.steps[firstBack].state.current;
  return {
    intro: [beat('Depth-first search follows one path as deep as it can, then backs up to the most recent node that still has an unvisited neighbour.', show()),
      ...graphIntro,
      beat('Here it is written recursively, so the call stack remembers the way back.', show()),
      beat(COMPUTED_NOTE, show())],
    misconception: [beat(`A common mistake is to think DFS visits all the neighbours of ${start} first.`, { op: 'highlight', targets: [start, ...nb] }),
      differs ? beat(`That is breadth-first search, which would visit ${list(other.slice(0, 3))} first. DFS visits ${list(out.slice(0, 3))}: it dives straight from ${start} down to ${out[2]}.`, walk(out[2]))
        : beat('DFS dives into the first unvisited neighbour right away, and only comes back when it is stuck.', walk(out[n3]))],
    checkpoint,
    remedial: [beat('Follow the dive: each new node is entered the moment it is found, before any of its siblings.', walk(out[n3])),
      beat(`So ${out[n3]} is the ${nth} node visited.`, step(visitOf(out[n3]))),
      beat(`Only when it gets stuck at ${stuck} does it back up.`, step(firstBack))],
    recap: [beat(`DFS from ${start} visited ${list(out)}.`, step(last)),
      beat(`Each node is visited once and each edge is checked from both ends, so DFS takes O(V + E) time. Here V is ${V} and E is ${E}.`, show(last)),
      beat(`The call stack holds the current path, so DFS needs O(V) extra space in the worst case. On this graph it grew to ${deepest} calls.`, show(last))],
  };
}

function linearTemplates(run) {
  const { id: kind, visual: { data }, trace } = run, { add, remove, end } = LINEAR[kind];
  const isStack = kind === 'stack', last = lastStep(trace), all = data.map((_, k) => k);
  const values = data.filter(op => op.startsWith(add)).map(op => Number(op.split(' ')[1]));
  // The same operations run on the other structure: what the student might wrongly expect.
  const swap = { push: 'enqueue', pop: 'dequeue', enqueue: 'push', dequeue: 'pop', peek: 'peek' };
  const other = runAlgorithm(isStack ? 'queue' : 'stack', data.map(op => op.replace(/^[a-z]+/, v => swap[v]))).trace;
  const firstRem = stepWhere(trace, s => s.op === 'remove'), underflow = stepWhere(trace, s => s.op === 'underflow');
  const final = trace.final, endVal = isStack ? final[final.length - 1] : final[0];
  const nothing = `Nothing: the ${kind} is empty`;
  const intro = [beat(isStack ? 'A stack is last in, first out: push puts a value on the top, and pop takes the value off the top.'
    : 'A queue is first in, first out: enqueue adds a value at the back, and dequeue removes the value at the front.', show()),
  beat(`We will run these ${data.length} operations in order.`, { op: 'highlight', targets: all }), beat(COMPUTED_NOTE, show())];
  const recapTail = isStack
    ? [beat('Push, pop and peek only touch the top, so each one takes O(1) time.', show(last)), beat('Stacks power function calls, undo buttons and depth-first search.', show(last))]
    : [beat('Enqueue, dequeue and peek only touch the two ends, so each one takes O(1) time with a linked list or a circular buffer.', show(last)), beat('Queues power breadth-first search, printer queues and task schedulers.', show(last))];
  const recap = [trace.output.length ? beat(`The values came out in the order ${list(trace.output)}.`, step(last)) : beat(`At the end the ${kind} holds ${list(final)}.`, step(last)),
    ...(underflow >= 0 ? [beat(`One ${trace.steps[underflow].fact.startsWith('peek') ? 'peek' : remove} found the ${kind} empty. Real code must check for that before it removes or reads anything.`, step(underflow))] : []),
    ...recapTail];
  if (firstRem >= 0) {
    const s = trace.steps[firstRem].state, r = s.result, wrong = other.steps[firstRem]?.state.result;
    const plain = isStack ? 'the most recent value still on the stack' : 'the oldest value still in the queue';
    return {
      intro,
      misconception: [beat(isStack ? 'A common mistake is to think pop removes the value that was pushed first.' : 'A common mistake is to think dequeue removes the value that was added last.', show()),
        wrong !== null && wrong !== undefined && wrong !== r
          ? beat(`${upperFirst(remove)} always takes ${plain}. The first ${remove} returns ${r}, not ${wrong}.`, step(firstRem))
          : beat(`${upperFirst(remove)} always takes ${plain}. Here the first ${remove} returns ${r}.`, step(firstRem))],
      checkpoint: { q: `What does the first ${remove} return?`, ...arrange(r, [wrong, ...values, nothing].filter(v => v !== null && v !== undefined && v !== r), seedOf(values)) },
      remedial: [beat(`Here ${add}(${r}) puts ${r} ${isStack ? 'on the top' : 'at the back'}.`, step(s.removed)),
        beat(`When the first ${remove} runs, ${r} is ${plain}, so it is the value ${remove} takes.`, step(firstRem))],
      recap,
    };
  }
  const otherEnd = isStack ? final[0] : final[final.length - 1];
  return {
    intro,
    misconception: [beat(isStack ? 'A common mistake is to think the first value pushed ends up on top.' : 'A common mistake is to think the last value added ends up at the front.', show()),
      beat(`The ${end} is ${endVal}: ${isStack ? 'the most recent value pushed' : 'the oldest value still waiting'}.`, step(last))],
    checkpoint: { q: `After all the operations, which value is at the ${end}?`, ...arrange(endVal, [otherEnd, ...values, nothing].filter(v => v !== endVal), seedOf(values)) },
    remedial: [beat(`Look at the ${kind} after the last operation.`, step(last)), beat(`${endVal} is at the ${end}.`, step(last))],
    recap,
  };
}

function recursionTemplates(run) {
  const { visual: { data }, trace } = run, n = data[0], calls = trace.calls, last = lastStep(trace);
  const callStep = cid => stepWhere(trace, s => s.state.current === cid);
  const deepest = Math.max(...trace.steps.map(s => s.state.stack.length));
  const intro = [beat('A recursive function solves a problem by calling itself on smaller inputs. fib(n) returns fib(n − 1) + fib(n − 2), and fib(1) = 1 and fib(0) = 0 are the base cases.', show()),
    beat(`We will compute fib(${n}). Each box is one real call, drawn the moment it is made.`, show()),
    beat(COMPUTED_NOTE, show())];
  const recap = [beat(`fib(${n}) = ${trace.output}, and computing it took ${calls.length} calls.`, step(last)),
    beat('The number of calls grows roughly like 1.6 to the power n, so plain recursive fib takes exponential time.', show(last)),
    beat(`At most ${deepest} calls are waiting on the stack at once, so it needs O(n) extra space.`, show(last)),
    beat('Saving each answer the first time it is computed, called memoization, cuts the work to O(n) time.', show(last))];
  if (n === 2) {
    return {
      intro,
      misconception: [beat('A common mistake is to think both recursive calls run at the same time.', show()),
        beat('They run one after the other: fib(1) returns before fib(0) is even called.', step(callStep(2)))],
      checkpoint: { q: 'Which call returns first?', ...arrange('fib(1)', ['fib(0)', 'fib(2)'], n) },
      remedial: [beat('fib(2) calls fib(1) first, and fib(1) is a base case.', step(callStep(1))), beat('Only after it returns does fib(0) get called.', step(callStep(2)))],
      recap,
    };
  }
  const twos = calls.filter(c => c.arg === 2).map(c => c.id), c2 = twos.length;
  return {
    intro,
    misconception: [beat(`A common mistake is to think fib(${n}) works out each smaller Fibonacci number only once.`, show()),
      beat(`The calls do not share answers, so the same work is repeated: fib(2) is called ${c2} times while computing fib(${n}).`, { op: 'highlight', targets: twos, at: last })],
    checkpoint: { q: `How many times is fib(2) called while computing fib(${n})?`, ...arrange(c2, [1, c2 + 1, n].filter(x => x !== c2), seedOf(data)) },
    remedial: [...twos.slice(0, 3).map((cid, k) => beat(k === 0 ? `Here is the first call to fib(2), made by fib(${calls[calls[cid].parent].arg}).` : `Here fib(2) is called again, by fib(${calls[calls[cid].parent].arg}), and it redoes exactly the same work.`, step(callStep(cid)))),
      beat(`That makes ${c2} calls to fib(2).`, { op: 'highlight', targets: twos, at: last })],
    recap,
  };
}

// Scene titles for trace phases.
function phaseLabel(run, phase, steps) {
  const { id, visual: { data }, trace } = run, root = data[0];
  const s0 = trace.steps[steps[0]];
  if (run.visual.type === 'tree') {
    if (phase === 'root') return s0.op === 'visit' ? `Print the root ${root}` : `Start at the root ${root}`;
    if (phase === 'left') return `The left subtree of ${root}`;
    if (phase === 'right') return `The right subtree of ${root}`;
    if (phase.startsWith('level-')) return `Level ${phase.slice(6)}`;
  }
  if (id === 'binarysearch') return phase === 'iter-0' ? 'Set up lo and hi' : `Iteration ${phase.slice(5)}`;
  if (id === 'bubblesort' || id === 'selectionsort') return `Pass ${phase.slice(5)}`;
  if (id === 'insertionsort') return `Insert ${s0.state.arr[s0.state.key]}`;
  if (id === 'mergesort') return { root: 'Split the whole array', left: 'Sort the left half', right: 'Sort the right half', final: 'The final merge' }[phase] || phase;
  const group = steps.map(k => trace.steps[k]);
  if (id === 'bfs') { const d = Number(phase.slice(6)); return d === 0 ? `Start at ${run.visual.start}` : d === 1 ? `Visit the neighbours of ${run.visual.start}` : `Visit the nodes ${d} edges from ${run.visual.start}`; }
  if (id === 'dfs') {
    if (phase.startsWith('dive')) return `Dive: visit ${andList(group.filter(s => s.op === 'visit').map(s => s.state.current))}`;
    const to = group[group.length - 1].state.current;
    return to === null ? 'Back up and finish' : `Back up to ${to}`;
  }
  if (id === 'stack' || id === 'queue') {
    const ops = steps.map(k => run.visual.data[k]), verb = ops[0].split(' ')[0];
    if (verb === LINEAR[id].add) return `${upperFirst(verb)} ${andList(ops.map(op => op.split(' ')[1]))}`;
    return `${upperFirst(verb)} ${ops.length === 1 ? 'once' : `${ops.length} times`}`;
  }
  if (id === 'fibonacci') {
    const n = data[0];
    if (phase === 'root') return s0.op === 'return' ? `fib(${n}) returns ${trace.output}` : `Call fib(${n})`;
    return phase === 'left' ? `The left call: fib(${n - 1})` : `The right call: fib(${n - 2})`;
  }
  return phase;
}
function traceScenes(run) {
  const groups = [];
  run.trace.steps.forEach((s, k) => {
    const g = groups[groups.length - 1];
    if (g && g.phase === s.phase) g.steps.push(k); else groups.push({ phase: s.phase, steps: [k] });
  });
  groups.forEach(g => { g.title = phaseLabel(run, g.phase, g.steps); });
  // Fold one-step groups into a neighbour so no scene is a single sentence.
  for (let i = 0; i < groups.length && groups.length > 1; i++) {
    const g = groups[i];
    if (g.steps.length !== 1) continue;
    if (i + 1 < groups.length) { const nx = groups[i + 1]; nx.steps.unshift(...g.steps); nx.title = `${g.title}, then ${lowerFirst(nx.title)}`; }
    else { const pv = groups[i - 1]; pv.steps.push(...g.steps); pv.title = `${pv.title}, then ${lowerFirst(g.title)}`; }
    groups.splice(i, 1); i--;
  }
  return groups.map((g, i) => ({ id: `t${i + 1}`, kind: 'trace', title: g.title.slice(0, 90), beats: g.steps.map(k => beat(run.trace.steps[k].fact, step(k))) }));
}

export function buildLesson(match) {
  const run = runAlgorithm(match.id, match.data, match.target);
  const type = run.visual.type;
  const T = ({ tree: treeTemplates, graph: graphTemplates, stack: linearTemplates, queue: linearTemplates, recursion: recursionTemplates }[type] || arrayTemplates)(run);
  const visual = { type, data: run.visual.data };
  const introTitle = { stack: 'How a stack works', queue: 'How a queue works', recursion: 'How recursion builds a call tree' }[type] || `What ${lowerFirst(run.name)} does`;
  const scenes = [
    { id: 'intro', kind: 'intro', title: introTitle, beats: T.intro },
    ...traceScenes(run),
    { id: 'mistake', kind: 'misconception', title: 'A common mistake', beats: T.misconception, checkpoint: { ...T.checkpoint, onWrong: 'remedial' } },
    { id: 'remedial', kind: 'remedial', title: 'Another way to see it', beats: T.remedial },
    { id: 'recap', kind: 'recap', title: 'Recap', beats: T.recap },
  ].map(s => ({ ...s, visual, beats: s.beats.map((b, j) => ({ id: `${s.id}.${j}`, ...b })) }));
  const d = run.visual.data;
  const title = {
    tree: () => `${run.name} of this tree`,
    graph: () => `${run.name} from node ${run.visual.start}`,
    stack: () => `Stack: ${d.length} operations`,
    queue: () => `Queue: ${d.length} operations`,
    recursion: () => `Recursion tree of fib(${d[0]})`,
  }[type]?.() ?? `${run.name} ${run.id === 'binarysearch' ? `for ${run.visual.target}` : `of ${list(d)}`}`;
  const key = type === 'tree' || type === 'array' ? d.join('_') : JSON.stringify(d).replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '');
  const lesson = {
    lessonId: `${run.id}-${key}${run.visual.target !== undefined ? `-t${run.visual.target}` : ''}${run.visual.start !== undefined ? `-s${run.visual.start}` : ''}`,
    title, level: 'beginner', algorithm: run.id, visual: run.visual,
    trace: { initial: run.trace.initial, steps: run.trace.steps }, scenes, notes: run.notes,
  };
  const errors = validateLesson(lesson);
  if (errors.length) throw new Error(`Internal lesson template is invalid: ${errors.join(' ')}`);
  return lesson;
}

// ---- AI narration: rewrites lines, guarded so no computed fact can change ----
function parseModelJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch {
    const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1));
    throw new Error('The model did not return JSON.');
  }
}
export function guardLine(candidate, template) {
  if (typeof candidate !== 'string') return null;
  const text = candidate.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 320 || /[<>{}`#*]/.test(text)) return null;
  if ((text.match(/[.!?](\s|$)/g) || []).length > 3) return null;
  const allowed = new Set(numbersIn(template));
  if (numbersIn(text).some(n => !allowed.has(n))) return null;
  return text;
}
const NARRATE_SYSTEM = `You are the narrator for NeuraLearn, a tutor for data structures and algorithms. The animation is produced by actually running the algorithm, and each line below is attached to one computed frame. Rewrite each line so it sounds like a clear, warm professor talking to a beginner engineering student.
Rules:
- Keep exactly the same meaning and facts. You may add a short reason why.
- Never mention a number that is not already in that line. Never change a value, an index or an order.
- At most 2 sentences and 40 words per line. Plain spoken English, no markdown, no lists.
Return JSON only: {"lines": {"<id>": "<rewritten line>", ...}} with every id.`;
export async function narrateLesson(lesson, modelCall) {
  const beats = lesson.scenes.flatMap(s => s.beats.map(b => ({ b, kind: s.kind })));
  const user = `Lesson: ${lesson.title}\nInput: ${JSON.stringify(lesson.visual)}\n\nLines (id | scene kind | line):\n${beats.map(({ b, kind }) => `${b.id} | ${kind} | ${b.say}`).join('\n')}`;
  const raw = await modelCall(NARRATE_SYSTEM, user, true, 4000);
  const lines = parseModelJson(raw)?.lines || {};
  let replaced = 0, rejected = 0;
  for (const { b } of beats) {
    const safe = guardLine(lines[b.id], b.say);
    if (safe) { b.say = safe; replaced++; } else rejected++;
  }
  return { lesson, replaced, rejected };
}

// ---- Interrupt the professor: 1-3 new scenes built from the same trace ----
const ASK_SYSTEM = `You are NeuraLearn, a professor teaching data structures and algorithms with computed animations. A student paused the lesson to ask a question. Answer it with 1 to 3 short animated scenes (2 to 5 beats each) that will be inserted at this point of the lesson.
You do not draw anything. Each beat has a spoken line ("say", at most 2 sentences) and an action that points at the real recorded execution:
- {"op":"step","index":k} shows trace step k exactly as it happened. Prefer this: replaying real steps is the strongest explanation.
- {"op":"pulse","target":t} pulses one element; {"op":"highlight","targets":[...]} highlights several; {"op":"traverse","path":[...]} moves a pointer along connected elements; {"op":"show"} shows the starting state. Add "at":k to any of these to draw them on top of step k.
- The "Targets" line below says what a target is for this lesson. Trees and graphs: node values, and a traverse path must follow real edges. Arrays: indices. Stacks and queues: operation indices (pointing at the value that operation added); traverse is not available. Recursion trees: call ids, and a traverse path must go from a call to the calls it made.
Only use values and steps that exist in the trace. Be correct, concrete and brief; answer exactly what was asked.
Return JSON only: {"scenes":[{"title":"...","beats":[{"say":"...","action":{...}}]}]}`;
function interruptFallback(run, k) {
  const facts = run.trace.steps;
  const beats = [];
  if (k > 0) beats.push(beat(`Just before this: ${facts[k - 1].fact}`, step(k - 1)));
  beats.push(beat(`At this step: ${facts[k].fact}`, step(k)));
  if (k + 1 < facts.length) beats.push(beat(`Next: ${facts[k + 1].fact}`, step(k + 1)));
  return [{ title: 'Replaying this moment', beats }];
}
export async function answerInterrupt({ algorithm, data, target, stepIndex, question, sceneTitle }, modelCall) {
  if (!ALGORITHMS[algorithm]) throw Object.assign(new Error('Unknown algorithm.'), { status: 400 });
  // Recompute the trace on the server; the client's copy is never trusted.
  const run = runAlgorithm(algorithm, data, target);
  if (JSON.stringify(run.visual.data) !== JSON.stringify(data)) throw Object.assign(new Error('Lesson input is invalid.'), { status: 400 });
  const steps = run.trace.steps, k = Math.max(0, Math.min(steps.length - 1, Number.isInteger(stepIndex) ? stepIndex : 0));
  const visual = { type: run.visual.type, data: run.visual.data };
  const ctx = { visual, traceLength: steps.length };
  const calls = run.visual.calls || [];
  const allowedNumbers = new Set([...numbersIn(JSON.stringify(run.visual.data)), ...run.visual.data.map((_, i) => i), ...[run.visual.target, run.visual.start].filter(v => v !== undefined), ...calls.map(c => c.id), ...steps.flatMap(s => numbersIn(s.fact))]);
  // Spell out what each target names, so the model can point at the right thing.
  const legend = run.visual.type === 'recursion' ? `\nCalls (id: call): ${calls.map(c => `${c.id}: fib(${c.arg})`).join(', ')}`
    : run.visual.type === 'stack' || run.visual.type === 'queue' ? `\nOperations (index: operation): ${run.visual.data.map((op, i) => `${i}: ${op}`).join(', ')}`
      : run.visual.type === 'graph' ? `\nEdges: ${run.visual.data.map(([a, b]) => `${a}–${b}`).join(', ')}; start node ${run.visual.start}` : '';
  const targets = `Targets: ${targetChecker(visual).describe}${legend}`;
  const wrap = raw => (Array.isArray(raw?.scenes) ? raw.scenes : []).slice(0, 3).map((s, i) => ({
    id: `ask-${Date.now().toString(36)}-${i}`, kind: 'answer', title: String(s?.title || 'Your question').slice(0, 90), visual,
    beats: (Array.isArray(s?.beats) ? s.beats : []).slice(0, 6).map((b, j) => ({ id: `ask${i}.${j}`, say: typeof b?.say === 'string' ? b.say.trim() : '', action: b?.action })),
  }));
  const check = scenes => {
    const errors = validateScenes(scenes, ctx);
    if (scenes.length > 3) errors.push('At most 3 scenes.');
    scenes.forEach((s, i) => s.beats.forEach((b, j) => { if (numbersIn(b.say).some(n => !allowedNumbers.has(n))) errors.push(`scene ${i + 1}, beat ${j + 1}: mentions a number that is not in the trace.`); }));
    return errors;
  };
  const { calls: _calls, ...shown } = run.visual;
  const user = `Algorithm: ${run.name}\nInput: ${JSON.stringify(shown)}\n${targets}\nCurrent scene: ${String(sceneTitle || '').slice(0, 90)}\nThe student paused at step ${k}: ${steps[k].fact}\n\nFull execution trace (step | fact):\n${steps.map((s, i) => `${i} | ${s.fact}`).join('\n')}\n\nStudent question: ${String(question).slice(0, 600)}`;
  let lastErrors = [];
  if (modelCall) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt = attempt === 0 ? user : `${user}\n\nYour previous answer was rejected for these reasons, fix them:\n- ${lastErrors.slice(0, 8).join('\n- ')}`;
        const scenes = wrap(parseModelJson(await modelCall(ASK_SYSTEM, prompt, true, 3000)));
        const errors = check(scenes);
        if (!errors.length) return { scenes, source: 'ai', stepIndex: k, attempts: attempt + 1 };
        lastErrors = errors;
      } catch (e) { lastErrors = [e.message]; if (e.status === 503) break; }
    }
  }
  const scenes = interruptFallback(run, k).map((s, i) => ({ id: `ask-${Date.now().toString(36)}-${i}`, kind: 'answer', visual, ...s, beats: s.beats.map((b, j) => ({ id: `ask${i}.${j}`, ...b })) }));
  return { scenes, source: 'replay', stepIndex: k, reason: lastErrors[0] || (modelCall ? 'no usable answer' : 'AI disabled') };
}
