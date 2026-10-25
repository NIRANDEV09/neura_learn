// Algorithm tracers. Each one RUNS the real algorithm and records one step per
// meaningful operation. These steps are the only source of animation frames, so
// what the learner sees is an actual execution state, never a model's drawing.
//
// A trace is { initial, steps } where every step is
//   { op, fact, phase, state }
// - op:    machine-readable operation name (visit, swap, compare, ...)
// - fact:  one plain-English sentence generated from the real values
// - phase: grouping key the director uses to cut the trace into scenes
// - state: a full snapshot, so any step can be rendered on its own (seek,
//          replay, scenes inserted mid-lesson)

const list = a => `[${a.join(', ')}]`;

// ---- Trees: level-order arrays; children of i are 2i+1 and 2i+2; null = empty ----
export const hasNode = (data, i) => i < data.length && data[i] !== null && data[i] !== undefined;
export const leftOf = i => 2 * i + 1;
export const rightOf = i => 2 * i + 2;
export const parentOf = i => (i - 1) >> 1;
export const treeValues = data => data.filter(v => v !== null && v !== undefined);
export function treeIndexOf(data, value) { return data.findIndex(v => v === value); }
export function isTreeEdge(data, a, b) {
  const ia = treeIndexOf(data, a), ib = treeIndexOf(data, b);
  if (ia < 0 || ib < 0) return false;
  return (ib > 0 && parentOf(ib) === ia) || (ia > 0 && parentOf(ia) === ib);
}
// Root-to-node path of values.
export function treePath(data, value) {
  let i = treeIndexOf(data, value); const path = [];
  while (i >= 0) { path.unshift(data[i]); if (i === 0) break; i = parentOf(i); }
  return path;
}
export function isBst(data) {
  const ok = (i, lo, hi) => !hasNode(data, i) || (data[i] > lo && data[i] < hi && ok(leftOf(i), lo, data[i]) && ok(rightOf(i), data[i], hi));
  return ok(0, -Infinity, Infinity);
}
export function validateTreeData(data) {
  if (!Array.isArray(data) || !data.length || data.length > 15) return 'Trees need 1 to 15 positions (up to 4 levels).';
  if (!hasNode(data, 0)) return 'The tree needs a root value.';
  const vals = treeValues(data);
  if (vals.some(v => !Number.isFinite(v))) return 'Tree values must be numbers.';
  if (new Set(vals).size !== vals.length) return 'Tree values must be unique so each node can be named.';
  for (let i = 1; i < data.length; i++) if (hasNode(data, i) && !hasNode(data, parentOf(i))) return `Value ${data[i]} has no parent node.`;
  return '';
}
// Which top-level subtree a node belongs to; used to group steps into scenes.
function side(i) { if (i === 0) return 'root'; while (parentOf(i) !== 0) i = parentOf(i); return i === 1 ? 'left' : 'right'; }

function treeDfs(data, order) {
  const steps = [], output = [], stack = [];
  const snap = current => ({ current, stack: [...stack], output: [...output] });
  const add = (op, fact, i) => steps.push({ op, fact, phase: side(i), state: snap(data[i]) });
  const L = i => hasNode(data, leftOf(i)) ? data[leftOf(i)] : null;
  const R = i => hasNode(data, rightOf(i)) ? data[rightOf(i)] : null;
  function rec(i) {
    const v = data[i], l = L(i), r = R(i);
    stack.push(v);
    if (order === 'preorder') {
      output.push(v);
      add('visit', `Call preorder(${v}): print ${v} immediately. Output: ${list(output)}.${l !== null ? ` Next, its left child ${l}.` : r !== null ? ` It has no left child, so next is its right child ${r}.` : ''}`, i);
    } else if (order === 'inorder') {
      add('enter', l !== null ? `Call inorder(${v}): before printing ${v}, go to its left child ${l}.` : `Call inorder(${v}): ${v} has no left child.`, i);
    } else {
      add('enter', l === null && r === null ? `Call postorder(${v}): ${v} has no children.` : `Call postorder(${v}): both subtrees of ${v} must finish before ${v} is printed.`, i);
    }
    if (l !== null) rec(leftOf(i));
    if (order === 'inorder') {
      output.push(v);
      add('visit', `${l !== null ? `The left subtree of ${v} is done, so print ${v}.` : `Print ${v}.`} Output: ${list(output)}.${r !== null ? ` Next, its right child ${r}.` : ''}`, i);
    }
    if (r !== null) rec(rightOf(i));
    if (order === 'postorder') {
      output.push(v);
      add('visit', `${l === null && r === null ? `${v} is a leaf, so print ${v}.` : `Both subtrees of ${v} are done, so print ${v}.`} Output: ${list(output)}.`, i);
    }
    stack.pop();
  }
  rec(0);
  return { initial: { current: null, stack: [], output: [] }, steps, output };
}

function treeLevelOrder(data) {
  const steps = [], output = [], queue = [data[0]];
  const depth = i => Math.floor(Math.log2(i + 1));
  steps.push({ op: 'enqueue', fact: `Put the root ${data[0]} in the queue.`, phase: 'level-0', state: { current: null, queue: [...queue], output: [] } });
  while (queue.length) {
    const v = queue.shift(), i = treeIndexOf(data, v);
    output.push(v);
    const kids = [leftOf(i), rightOf(i)].filter(k => hasNode(data, k)).map(k => data[k]);
    queue.push(...kids);
    const tail = kids.length ? ` Enqueue its ${kids.length === 1 ? 'child' : 'children'} ${kids.join(' and ')}.` : ' It has no children to enqueue.';
    steps.push({ op: 'visit', fact: `Dequeue ${v} and print it. Output: ${list(output)}.${tail}`, phase: `level-${depth(i)}`, state: { current: v, queue: [...queue], output: [...output] } });
  }
  return { initial: { current: null, queue: [], output: [] }, steps, output };
}

// ---- Arrays ----
function binarySearch(arr, target) {
  const steps = []; let lo = 0, hi = arr.length - 1, iter = 0, found = -1;
  const discarded = () => arr.map((_, k) => k < lo || k > hi);
  const snap = (mid, extra = {}) => ({ arr: [...arr], lo, hi, mid, found, discarded: discarded(), ...extra });
  steps.push({ op: 'init', fact: `Search for ${target} in a sorted array of ${arr.length} values: lo = 0 and hi = ${arr.length - 1}.`, phase: 'iter-0', state: snap(null) });
  while (lo <= hi) {
    iter++;
    const mid = Math.floor((lo + hi) / 2), phase = `iter-${iter}`;
    steps.push({ op: 'mid', fact: `mid = (${lo} + ${hi}) / 2, rounded down, = ${mid}; the value there is ${arr[mid]}.`, phase, state: snap(mid) });
    if (arr[mid] === target) {
      found = mid;
      steps.push({ op: 'found', fact: `${arr[mid]} equals ${target}: found it at index ${mid} after ${iter} ${iter === 1 ? 'comparison' : 'comparisons'}.`, phase, state: snap(mid) });
      break;
    }
    if (arr[mid] < target) { lo = mid + 1; steps.push({ op: 'right', fact: `${arr[mid]} is less than ${target}, so ${target} can only be to the right: lo = ${lo}.`, phase, state: snap(mid) }); }
    else { hi = mid - 1; steps.push({ op: 'left', fact: `${arr[mid]} is greater than ${target}, so ${target} can only be to the left: hi = ${hi}.`, phase, state: snap(mid) }); }
  }
  if (found < 0) steps.push({ op: 'missing', fact: `lo (${lo}) is now greater than hi (${hi}), so ${target} is not in the array.`, phase: `iter-${iter}`, state: snap(null) });
  return { initial: { arr: [...arr], lo: null, hi: null, mid: null, found: -1, discarded: arr.map(() => false) }, steps, found, iterations: iter };
}

function bubbleSort(input) {
  const arr = [...input], ids = arr.map((_, k) => k), n = arr.length, steps = [];
  let comparisons = 0, swaps = 0, sortedFrom = n;
  const snap = (compare, swapped) => ({ arr: [...arr], ids: [...ids], compare, swapped, sortedFrom });
  for (let pass = 1; pass < n; pass++) {
    let swappedAny = false;
    for (let j = 0; j < n - pass; j++) {
      comparisons++;
      const a = arr[j], b = arr[j + 1];
      if (a > b) {
        [arr[j], arr[j + 1]] = [b, a]; [ids[j], ids[j + 1]] = [ids[j + 1], ids[j]]; swaps++; swappedAny = true;
        steps.push({ op: 'swap', fact: `Compare ${a} and ${b}: ${a} is bigger, so swap them.`, phase: `pass-${pass}`, state: snap([j, j + 1], true) });
      } else {
        steps.push({ op: 'compare', fact: `Compare ${a} and ${b}: already in order, no swap.`, phase: `pass-${pass}`, state: snap([j, j + 1], false) });
      }
    }
    sortedFrom = n - pass;
    if (!swappedAny) {
      sortedFrom = 0;
      steps.push({ op: 'done', fact: `Pass ${pass} made no swaps, so the array is sorted: ${list(arr)}.`, phase: `pass-${pass}`, state: snap(null, false) });
      break;
    }
    if (sortedFrom === 1) sortedFrom = 0;
    steps.push({ op: 'pass', fact: sortedFrom === 0 ? `Pass ${pass} done: the array is fully sorted: ${list(arr)}.` : `Pass ${pass} done: ${arr[n - pass]} has bubbled to its final place.`, phase: `pass-${pass}`, state: snap(null, false) });
    if (sortedFrom === 0) break;
  }
  return { initial: { arr: [...input], ids: input.map((_, k) => k), compare: null, swapped: false, sortedFrom: n }, steps, output: arr, comparisons, swaps };
}

function insertionSort(input) {
  const arr = [...input], ids = arr.map((_, k) => k), n = arr.length, steps = [];
  let comparisons = 0, moves = 0;
  const snap = (key, sortedTo, compare) => ({ arr: [...arr], ids: [...ids], key, sortedTo, compare });
  for (let i = 1; i < n; i++) {
    const key = arr[i], phase = `insert-${i}`;
    let j = i;
    steps.push({ op: 'pick', fact: `Take ${key} and insert it into the sorted part ${list(arr.slice(0, i))} on its left.`, phase, state: snap(j, i - 1, null) });
    while (j > 0) {
      comparisons++;
      if (arr[j - 1] > key) {
        const big = arr[j - 1];
        [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]]; [ids[j - 1], ids[j]] = [ids[j], ids[j - 1]]; moves++; j--;
        steps.push({ op: 'shift', fact: `${big} is bigger than ${key}, so ${big} moves one place right.`, phase, state: snap(j, i, [j, j + 1]) });
      } else break;
    }
    steps.push({ op: 'place', fact: j === 0 ? `${key} reached the front: it goes at index 0. Sorted part: ${list(arr.slice(0, i + 1))}.` : `${arr[j - 1]} is not bigger than ${key}, so ${key} stays at index ${j}. Sorted part: ${list(arr.slice(0, i + 1))}.`, phase, state: snap(j, i, null) });
  }
  return { initial: { arr: [...input], ids: input.map((_, k) => k), key: null, sortedTo: 0, compare: null }, steps, output: arr, comparisons, moves };
}

function selectionSort(input) {
  const arr = [...input], ids = arr.map((_, k) => k), n = arr.length, steps = [];
  let comparisons = 0, swaps = 0;
  const snap = (i, min, scan) => ({ arr: [...arr], ids: [...ids], i, min, scan, sortedTo: i - 1 });
  for (let i = 0; i < n - 1; i++) {
    let min = i; const phase = `pass-${i + 1}`;
    steps.push({ op: 'start', fact: `Find the smallest value from index ${i} to ${n - 1}. Start with ${arr[i]}.`, phase, state: snap(i, min, i) });
    for (let j = i + 1; j < n; j++) {
      comparisons++;
      if (arr[j] < arr[min]) { min = j; steps.push({ op: 'newmin', fact: `${arr[j]} is smaller than the minimum so far, so ${arr[j]} is the new minimum.`, phase, state: snap(i, min, j) }); }
    }
    if (min !== i) {
      const a = arr[i], b = arr[min];
      [arr[i], arr[min]] = [arr[min], arr[i]]; [ids[i], ids[min]] = [ids[min], ids[i]]; swaps++;
      steps.push({ op: 'swap', fact: `Swap ${b} into index ${i}, moving ${a} to index ${min}.`, phase, state: { ...snap(i, i, null), sortedTo: i } });
    } else {
      steps.push({ op: 'stay', fact: `${arr[i]} is already the smallest, so it stays at index ${i}.`, phase, state: { ...snap(i, i, null), sortedTo: i } });
    }
  }
  const final = steps[steps.length - 1];
  if (final) final.state.sortedTo = n - 1;
  return { initial: { arr: [...input], ids: input.map((_, k) => k), i: null, min: null, scan: null, sortedTo: -1 }, steps, output: arr, comparisons, swaps };
}

function mergeSort(input) {
  const arr = [...input], n = arr.length, steps = [], sorted = [];
  let comparisons = 0;
  const snap = (extra) => ({ arr: [...arr], range: null, mid: null, left: null, right: null, li: null, ri: null, k: null, sorted: sorted.map(r => [...r]), ...extra });
  // Phase: which half of the top-level call the work belongs to.
  const phaseOf = (lo, hi) => (lo === 0 && hi === n - 1) ? 'final' : (hi <= Math.floor((n - 1) / 2) ? 'left' : 'right');
  function rec(lo, hi) {
    if (lo >= hi) return;
    const mid = Math.floor((lo + hi) / 2);
    steps.push({ op: 'split', fact: `Split ${list(arr.slice(lo, hi + 1))} into ${list(arr.slice(lo, mid + 1))} and ${list(arr.slice(mid + 1, hi + 1))}.`, phase: lo === 0 && hi === n - 1 ? 'root' : phaseOf(lo, hi), state: snap({ range: [lo, hi], mid }) });
    rec(lo, mid); rec(mid + 1, hi);
    const left = arr.slice(lo, mid + 1), right = arr.slice(mid + 1, hi + 1), phase = phaseOf(lo, hi);
    let i = 0, j = 0, k = lo;
    steps.push({ op: 'merge', fact: `Merge the sorted runs ${list(left)} and ${list(right)}.`, phase, state: snap({ range: [lo, hi], mid, left, right, li: 0, ri: 0, k: lo }) });
    while (i < left.length || j < right.length) {
      let fact;
      if (i < left.length && j < right.length) {
        comparisons++;
        if (left[i] <= right[j]) { fact = `Compare ${left[i]} and ${right[j]}: take ${left[i]}.`; arr[k] = left[i++]; }
        else { fact = `Compare ${left[i]} and ${right[j]}: take ${right[j]}.`; arr[k] = right[j++]; }
      } else if (i < left.length) { fact = `The right run is used up, so copy ${left[i]}.`; arr[k] = left[i++]; }
      else { fact = `The left run is used up, so copy ${right[j]}.`; arr[k] = right[j++]; }
      k++;
      const doneRun = k > hi;
      if (doneRun) { for (let s = sorted.length - 1; s >= 0; s--) if (sorted[s][0] >= lo && sorted[s][1] <= hi) sorted.splice(s, 1); sorted.push([lo, hi]); fact += ` Now ${list(arr.slice(lo, hi + 1))} is sorted.`; }
      steps.push({ op: 'take', fact, phase, state: snap({ range: [lo, hi], mid, left, right, li: i, ri: j, k: k - 1 }) });
    }
  }
  rec(0, n - 1);
  return { initial: snap({}), steps, output: arr, comparisons };
}

// ---- Graphs: undirected, given as an edge list [[a, b], ...]; node values are small integers ----
export const graphNodes = edges => [...new Set(edges.flat())].sort((a, b) => a - b);
export function isGraphEdge(edges, a, b) { return a !== b && edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }
// Neighbours in increasing order, so every run (and every lesson) is reproducible.
export function adjacency(edges) {
  const adj = new Map(graphNodes(edges).map(v => [v, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
  for (const nbrs of adj.values()) nbrs.sort((x, y) => x - y);
  return adj;
}
export function validateGraphData(edges) {
  if (!Array.isArray(edges) || !edges.length || edges.length > 15) return 'Graphs need 1 to 15 edges.';
  if (edges.some(e => !Array.isArray(e) || e.length !== 2 || e.some(v => !Number.isInteger(v) || v < 0 || v > 99))) return 'Each edge must join two whole numbers from 0 to 99.';
  if (edges.some(([a, b]) => a === b)) return 'An edge cannot join a node to itself.';
  const keys = edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
  if (new Set(keys).size !== keys.length) return 'Each edge can appear only once.';
  const nodes = graphNodes(edges);
  if (nodes.length > 10) return 'Graphs can have at most 10 nodes.';
  const adj = adjacency(edges), seen = new Set([nodes[0]]), todo = [nodes[0]];
  while (todo.length) for (const u of adj.get(todo.pop())) if (!seen.has(u)) { seen.add(u); todo.push(u); }
  if (seen.size !== nodes.length) return 'The graph must be connected so the search can reach every node.';
  return '';
}

function graphBfs(edges, start) {
  const adj = adjacency(edges), steps = [], output = [], queue = [start], visited = [start], treeEdges = [], dist = new Map([[start, 0]]);
  const snap = (current, edge = null, extra = {}) => ({ current, queue: [...queue], visited: [...visited], output: [...output], edge, skipped: false, treeEdges: treeEdges.map(e => [...e]), ...extra });
  steps.push({ op: 'start', fact: `Start at ${start}: mark it visited and put it in the queue.`, phase: 'level-0', state: snap(null) });
  while (queue.length) {
    const v = queue.shift(), phase = `level-${dist.get(v)}`;
    output.push(v);
    steps.push({ op: 'visit', fact: `Dequeue ${v} and visit it. Visit order so far: ${list(output)}. Now check its neighbours ${list(adj.get(v))}.`, phase, state: snap(v) });
    for (const u of adj.get(v)) {
      if (visited.includes(u)) {
        steps.push({ op: 'skip', fact: `Edge ${v}–${u}: ${u} is already visited, so skip it.`, phase, state: snap(v, [v, u], { skipped: true }) });
      } else {
        visited.push(u); queue.push(u); treeEdges.push([v, u]); dist.set(u, dist.get(v) + 1);
        steps.push({ op: 'discover', fact: `Edge ${v}–${u}: ${u} is new, so mark it visited and add it to the back of the queue. Queue: ${list(queue)}.`, phase, state: snap(v, [v, u]) });
      }
    }
  }
  return { initial: { current: null, queue: [], visited: [], output: [], edge: null, skipped: false, treeEdges: [] }, steps, output, distance: Object.fromEntries(dist) };
}

function graphDfs(edges, start) {
  const adj = adjacency(edges), steps = [], output = [], stack = [], visited = [], treeEdges = [], parent = new Map([[start, null]]);
  let mode = null, segment = 0;
  // A new phase starts whenever the search switches between diving deeper and backing up.
  const add = (op, fact, current, edge = null, extra = {}) => {
    const m = op === 'return' ? 'back' : 'dive';
    if (m !== mode && op !== 'skip') { mode = m; segment++; }
    steps.push({ op, fact, phase: `${mode}-${segment}`, state: { current, stack: [...stack], visited: [...visited], output: [...output], edge, skipped: false, treeEdges: treeEdges.map(e => [...e]), ...extra } });
  };
  function rec(v) {
    stack.push(v); visited.push(v); output.push(v);
    add('visit', `Call dfs(${v})${parent.get(v) === null ? ' on the start node' : ''}: mark ${v} visited. Visit order so far: ${list(output)}. Its neighbours are ${list(adj.get(v))}.`, v);
    for (const u of adj.get(v)) {
      if (visited.includes(u)) { add('skip', `Edge ${v}–${u}: ${u} is already visited, so skip it.`, v, [v, u], { skipped: true }); continue; }
      parent.set(u, v); treeEdges.push([v, u]);
      add('explore', `Edge ${v}–${u}: ${u} is not visited yet, so go deeper into ${u} right away.`, v, [v, u]);
      rec(u);
    }
    stack.pop();
    const up = parent.get(v);
    add('return', up === null ? `Every neighbour of ${v} is done, so dfs(${v}) returns and the search is finished.` : `Every neighbour of ${v} is done, so dfs(${v}) returns and we back up to ${up}.`, up === null ? null : up);
  }
  rec(start);
  return { initial: { current: null, stack: [], visited: [], output: [], edge: null, skipped: false, treeEdges: [] }, steps, output, parent: Object.fromEntries(parent) };
}
// Node values from the start to v along the edges the search actually used.
export function searchTreePath(treeEdges, start, v) {
  const up = new Map(treeEdges.map(([a, b]) => [b, a])), path = [v];
  while (path[0] !== start && up.has(path[0])) path.unshift(up.get(path[0]));
  return path;
}

// ---- Stacks and queues: data is a list of operations like 'push 3', 'pop', 'peek' ----
// Every value added becomes an item whose id is the index of the operation that
// added it, so the same value pushed twice is still two distinct items.
export const LINEAR = { stack: { add: 'push', remove: 'pop', end: 'top' }, queue: { add: 'enqueue', remove: 'dequeue', end: 'front' } };
export function parseOps(data, kind) {
  const { add, remove } = LINEAR[kind], ops = [];
  for (const raw of data) {
    const m = String(raw).trim().toLowerCase().match(/^([a-z]+)\s*\(?\s*(-?\d+(?:\.\d+)?)?\s*\)?$/);
    if (!m) return null;
    const verb = m[1], value = m[2] === undefined ? null : Number(m[2]);
    if (verb === add && value !== null) ops.push(`${add} ${value}`);
    else if (verb === remove && value === null) ops.push(remove);
    else if (verb === 'peek' && value === null) ops.push('peek');
    else return null;
  }
  return ops;
}
function linearRun(ops, kind) {
  const { add, remove, end } = LINEAR[kind], where = kind === 'stack' ? 'top' : 'back', order = kind === 'stack' ? 'bottom to top' : 'front to back';
  const items = [], steps = [], output = [];
  let segment = 0, lastVerb = null;
  const view = () => list(items.map(it => it.v));
  ops.forEach((op, k) => {
    const [verb, arg] = op.split(' ');
    if (verb !== lastVerb) { segment++; lastVerb = verb; }
    let fact, result = null, removed = null, error = false;
    if (verb === add) {
      items.push({ id: k, v: Number(arg) });
      fact = `${add}(${arg}): ${arg} goes on the ${where}. The ${kind} is now ${view()}, ${order}.`;
    } else if (verb === remove) {
      if (!items.length) { error = true; fact = `${remove}() on an empty ${kind}: there is nothing to remove, so this is an underflow error.`; }
      else {
        const it = kind === 'stack' ? items.pop() : items.shift();
        result = it.v; removed = it.id; output.push(it.v);
        fact = `${remove}() removes the ${end} value, ${it.v}, and returns it. The ${kind} is now ${items.length ? `${view()}, ${order}` : 'empty'}.`;
      }
    } else if (!items.length) { error = true; fact = `peek() on an empty ${kind}: there is no ${end} value to look at.`; }
    else { const it = kind === 'stack' ? items[items.length - 1] : items[0]; result = it.v; fact = `peek() looks at the ${end} value, ${it.v}, without removing it.`; }
    steps.push({ op: error ? 'underflow' : verb === add ? 'add' : verb === remove ? 'remove' : 'peek', fact, phase: `run-${segment}`, state: { items: items.map(it => ({ ...it })), op: k, result, removed, error, output: [...output] } });
  });
  return { initial: { items: [], op: null, result: null, removed: null, error: false, output: [] }, steps, output, final: items.map(it => it.v) };
}

// ---- Recursion tree: fib(n), drawn as the tree of calls it really makes ----
// Calls are numbered in the order they are made; that id is how scenes point at them.
export function recursionCalls(data) {
  const calls = [];
  (function rec(k, parent, depth) {
    const id = calls.length; calls.push({ id, arg: k, parent, depth });
    if (k >= 2) { rec(k - 1, id, depth + 1); rec(k - 2, id, depth + 1); }
  })(data[0], null, 0);
  return calls;
}
export function isCallEdge(calls, a, b) {
  const ca = calls[a], cb = calls[b];
  return !!ca && !!cb && (cb.parent === a || ca.parent === b);
}
function fibTrace(data) {
  const calls = recursionCalls(data), steps = [], stack = [], ret = calls.map(() => null);
  let made = 0;
  // Phase: which top-level call (the left fib(n-1) or the right fib(n-2)) the work is in.
  const branch = id => { if (id === 0) return 'root'; while (calls[id].parent !== 0) id = calls[id].parent; return id === 1 ? 'left' : 'right'; };
  const snap = current => ({ current, stack: [...stack], made, ret: [...ret] });
  function rec(k) {
    const id = made++;
    stack.push(id);
    if (k < 2) {
      ret[id] = k;
      steps.push({ op: 'base', fact: `Call fib(${k}): base case, so it returns ${k} straight away.`, phase: branch(id), state: snap(id) });
      stack.pop();
      return k;
    }
    steps.push({ op: 'call', fact: `Call fib(${k}): not a base case, so it needs fib(${k - 1}) + fib(${k - 2}). First it calls fib(${k - 1}).`, phase: branch(id), state: snap(id) });
    const a = rec(k - 1), b = rec(k - 2);
    ret[id] = a + b;
    steps.push({ op: 'return', fact: `Back in fib(${k}): fib(${k - 1}) = ${a} and fib(${k - 2}) = ${b}, so fib(${k}) returns ${a + b}.`, phase: branch(id), state: snap(id) });
    stack.pop();
    return a + b;
  }
  const value = rec(data[0]);
  return { initial: { current: null, stack: [], made: 0, ret: calls.map(() => null) }, steps, output: value, calls };
}

// ---- Registry ----
const DEFAULT_GRAPH = [[1, 2], [1, 3], [2, 4], [2, 5], [3, 6], [5, 6]];
const sortedCopy = a => [...a].sort((x, y) => x - y);
export const ALGORITHMS = {
  inorder:    { name: 'Inorder traversal',    visual: 'tree',  defaultData: [4, 2, 6, 1, 3, 5, 7], run: d => treeDfs(d, 'inorder') },
  preorder:   { name: 'Preorder traversal',   visual: 'tree',  defaultData: [4, 2, 6, 1, 3, 5, 7], run: d => treeDfs(d, 'preorder') },
  postorder:  { name: 'Postorder traversal',  visual: 'tree',  defaultData: [4, 2, 6, 1, 3, 5, 7], run: d => treeDfs(d, 'postorder') },
  levelorder: { name: 'Level-order traversal (BFS)', visual: 'tree', defaultData: [4, 2, 6, 1, 3, 5, 7], run: d => treeLevelOrder(d) },
  binarysearch: { name: 'Binary search', visual: 'array', defaultData: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], defaultTarget: 23, run: (d, t) => binarySearch(d, t) },
  bubblesort:   { name: 'Bubble sort',    visual: 'array', defaultData: [5, 1, 4, 2, 8], run: d => bubbleSort(d) },
  insertionsort:{ name: 'Insertion sort', visual: 'array', defaultData: [5, 2, 4, 1, 3], run: d => insertionSort(d) },
  selectionsort:{ name: 'Selection sort', visual: 'array', defaultData: [29, 10, 14, 37, 13], run: d => selectionSort(d) },
  mergesort:    { name: 'Merge sort',     visual: 'array', defaultData: [38, 27, 43, 3], run: d => mergeSort(d) },
  bfs: { name: 'Breadth-first search (BFS)', visual: 'graph', defaultData: DEFAULT_GRAPH, defaultStart: 1, run: (d, s) => graphBfs(d, s) },
  dfs: { name: 'Depth-first search (DFS)',   visual: 'graph', defaultData: DEFAULT_GRAPH, defaultStart: 1, run: (d, s) => graphDfs(d, s) },
  stack: { name: 'Stack (push and pop)',        visual: 'stack', defaultData: ['push 3', 'push 7', 'push 5', 'pop', 'push 9', 'pop', 'pop'], run: d => linearRun(d, 'stack') },
  queue: { name: 'Queue (enqueue and dequeue)', visual: 'queue', defaultData: ['enqueue 3', 'enqueue 7', 'enqueue 5', 'dequeue', 'enqueue 9', 'dequeue', 'dequeue'], run: d => linearRun(d, 'queue') },
  fibonacci: { name: 'Recursion tree of fib(n)', visual: 'recursion', defaultData: [4], run: d => fibTrace(d) },
};
export const VISUAL_TYPES = ['tree', 'array', 'graph', 'stack', 'queue', 'recursion'];

// Validates and normalises the input, then runs the algorithm.
export function runAlgorithm(id, data, target) {
  const algo = ALGORITHMS[id];
  if (!algo) throw Object.assign(new Error(`Unknown algorithm "${id}".`), { status: 400 });
  const notes = [];
  if (algo.visual === 'graph') {
    let d = Array.isArray(data) && data.length ? data.map(e => (Array.isArray(e) ? e.map(Number) : e)) : null;
    const problem = d ? validateGraphData(d) : '';
    if (!d || problem) { if (problem) notes.push(`${problem} Using the default graph instead.`); d = algo.defaultData.map(e => [...e]); }
    const nodes = graphNodes(d), fallback = !data || problem ? algo.defaultStart : d[0][0];
    let start = target === null || target === undefined || target === '' ? null : Number(target);
    if (!nodes.includes(start)) {
      if (start !== null) notes.push(`Node ${target} is not in the graph, so the search starts at ${fallback}.`);
      start = fallback;
    }
    return { id, name: algo.name, visual: { type: 'graph', data: d, start }, trace: algo.run(d, start), notes };
  }
  if (algo.visual === 'stack' || algo.visual === 'queue') {
    const { add, remove } = LINEAR[algo.visual];
    let d = Array.isArray(data) && data.length ? parseOps(data, algo.visual) : [...algo.defaultData];
    if (!d || d.length > 12 || !d.some(op => op.startsWith(add))) { notes.push(`Use 1 to 12 operations (${add} x, ${remove}, peek) with at least one ${add}. Using the default operations instead.`); d = [...algo.defaultData]; }
    return { id, name: algo.name, visual: { type: algo.visual, data: d }, trace: algo.run(d), notes };
  }
  if (algo.visual === 'recursion') {
    let d = Array.isArray(data) && data.length ? [Number(data[0])] : [...algo.defaultData];
    if (!Number.isInteger(d[0]) || d[0] < 2 || d[0] > 6) { notes.push('Use n from 2 to 6 so the whole call tree fits on the board. Using fib(4) instead.'); d = [...algo.defaultData]; }
    const trace = algo.run(d);
    return { id, name: algo.name, visual: { type: 'recursion', data: d, calls: trace.calls }, trace, notes };
  }
  let d = Array.isArray(data) && data.length ? data.map(v => (v === null ? null : Number(v))) : [...algo.defaultData];
  if (algo.visual === 'tree') {
    const problem = validateTreeData(d);
    if (problem) { notes.push(`${problem} Using the default tree instead.`); d = [...algo.defaultData]; }
  } else {
    if (d.some(v => v === null || !Number.isFinite(v)) || d.length < 2 || d.length > 12) { notes.push('Arrays need 2 to 12 numbers. Using the default array instead.'); d = [...algo.defaultData]; }
    if (id === 'binarysearch') {
      const s = sortedCopy(d);
      if (s.some((v, k) => v !== d[k])) { notes.push('Binary search needs a sorted array, so the values were sorted first.'); d = s; }
      if (new Set(d).size !== d.length) { notes.push('Duplicate values were removed.'); d = [...new Set(d)]; }
    }
  }
  let t = null;
  if (id === 'binarysearch') t = Number.isFinite(Number(target)) && target !== null && target !== '' ? Number(target) : (d.includes(algo.defaultTarget) ? algo.defaultTarget : d[Math.floor(d.length * 0.6)]);
  const trace = algo.run(d, t);
  return { id, name: algo.name, visual: { type: algo.visual, data: d, ...(t !== null ? { target: t } : {}) }, trace, notes };
}
