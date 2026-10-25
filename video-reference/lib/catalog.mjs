// The curriculum: how computed lessons are grouped, described and fed input.
// The app's library, topic pages and input editor are all driven from here, so
// adding an algorithm means: a tracer in tracers.mjs, templates in
// director.mjs, and one entry below.
import { ALGORITHMS, LINEAR } from './tracers.mjs';

// Modules in teaching order: each one builds on the ones before it.
export const MODULES = [
  { id: 'linear', name: 'Stacks and queues', blurb: 'The two simplest containers, and the order they hand values back.', topics: ['stack', 'queue'] },
  { id: 'recursion', name: 'Recursion', blurb: 'Functions that call themselves, drawn as the tree of calls they make.', topics: ['fibonacci'] },
  { id: 'searching', name: 'Searching', blurb: 'Find a value without looking at every element.', topics: ['binarysearch'] },
  { id: 'sorting', name: 'Sorting', blurb: 'Four ways to put an array in order, and what each one costs.', topics: ['bubblesort', 'insertionsort', 'selectionsort', 'mergesort'] },
  { id: 'trees', name: 'Binary trees', blurb: 'Visit every node of a tree in the four classic orders.', topics: ['inorder', 'preorder', 'postorder', 'levelorder'] },
  { id: 'graphs', name: 'Graphs', blurb: 'Explore a network breadth first and depth first.', topics: ['bfs', 'dfs'] },
];

// How each kind of input is typed in the editor.
const INPUTS = {
  tree: { label: 'Tree, level by level', placeholder: '4, 2, 6, 1, 3, 5, 7', help: 'Values row by row from the root, left to right. Write null for an empty spot. Up to 15 positions.' },
  array: { label: 'Array', placeholder: '5, 1, 4, 2, 8', help: '2 to 12 numbers separated by commas.' },
  sorted: { label: 'Sorted array', placeholder: '2, 5, 8, 12, 16, 23', help: '2 to 12 numbers. Unsorted input is sorted first.', target: 'Search for' },
  graph: { label: 'Edges', placeholder: '1-2, 1-3, 2-4, 2-5, 3-6, 5-6', help: 'Undirected edges written a-b, nodes 0 to 99, up to 10 nodes. The graph must be connected.', target: 'Start node' },
  stack: { label: 'Operations', placeholder: 'push 3, push 7, pop, peek', help: 'push x, pop and peek, separated by commas. Up to 12 operations.' },
  queue: { label: 'Operations', placeholder: 'enqueue 3, enqueue 7, dequeue', help: 'enqueue x, dequeue and peek, separated by commas. Up to 12 operations.' },
  n: { label: 'n', placeholder: '4', help: 'A whole number from 2 to 6, so the full call tree fits on the board.' },
};

export const TOPICS = {
  stack: { input: 'stack', level: 'Beginner', time: 'O(1) per operation', space: 'O(n)', blurb: 'Last in, first out: push and pop both work on the top.',
    examples: [{ label: 'Push and pop', text: 'push 3, push 7, push 5, pop, push 9, pop, pop' }, { label: 'Underflow', text: 'push 2, pop, pop' }, { label: 'Peek', text: 'push 4, push 8, peek, pop' }] },
  queue: { input: 'queue', level: 'Beginner', time: 'O(1) per operation', space: 'O(n)', prereq: ['stack'], blurb: 'First in, first out: add at the back, remove from the front.',
    examples: [{ label: 'Enqueue and dequeue', text: 'enqueue 3, enqueue 7, enqueue 5, dequeue, enqueue 9, dequeue, dequeue' }, { label: 'Empty queue', text: 'enqueue 1, dequeue, dequeue' }] },
  fibonacci: { input: 'n', level: 'Beginner', time: 'O(2ⁿ)', space: 'O(n)', prereq: ['stack'], blurb: 'Watch fib(n) build its call tree, and see the same work done twice.',
    examples: [{ label: 'fib(4)', text: '4' }, { label: 'fib(5)', text: '5' }, { label: 'fib(6)', text: '6' }] },
  binarysearch: { input: 'sorted', level: 'Beginner', time: 'O(log n)', space: 'O(1)', blurb: 'Halve the range on every comparison until the value is found.',
    examples: [{ label: 'Found', text: '2, 5, 8, 12, 16, 23, 38, 56, 72, 91', target: '23' }, { label: 'Not found', text: '2, 5, 8, 12, 16, 23, 38, 56, 72, 91', target: '40' }, { label: 'First element', text: '1, 3, 7, 9', target: '1' }] },
  bubblesort: { input: 'array', level: 'Beginner', time: 'O(n²)', space: 'O(1)', blurb: 'Swap neighbours that are out of order until a pass makes no swaps.',
    examples: [{ label: 'Classic', text: '5, 1, 4, 2, 8' }, { label: 'Already sorted', text: '1, 2, 3, 4, 5' }, { label: 'Reversed', text: '5, 4, 3, 2, 1' }] },
  insertionsort: { input: 'array', level: 'Beginner', time: 'O(n²)', space: 'O(1)', prereq: ['bubblesort'], blurb: 'Grow a sorted part on the left, sliding each new value into place.',
    examples: [{ label: 'Classic', text: '5, 2, 4, 1, 3' }, { label: 'Nearly sorted', text: '1, 2, 4, 3, 5' }] },
  selectionsort: { input: 'array', level: 'Beginner', time: 'O(n²)', space: 'O(1)', prereq: ['bubblesort'], blurb: 'Find the smallest remaining value and swap it into the next slot.',
    examples: [{ label: 'Classic', text: '29, 10, 14, 37, 13' }, { label: 'Already sorted', text: '1, 2, 3, 4' }] },
  mergesort: { input: 'array', level: 'Intermediate', time: 'O(n log n)', space: 'O(n)', prereq: ['fibonacci', 'insertionsort'], blurb: 'Split in half, sort each half, and merge the two sorted runs.',
    examples: [{ label: 'Four values', text: '38, 27, 43, 3' }, { label: 'Six values', text: '6, 5, 3, 1, 8, 7' }] },
  inorder: { input: 'tree', level: 'Beginner', time: 'O(n)', space: 'O(h)', prereq: ['stack', 'fibonacci'], blurb: 'Left subtree, node, right subtree. On a BST this prints sorted order.',
    examples: [{ label: 'Full tree', text: '4, 2, 6, 1, 3, 5, 7' }, { label: 'With gaps', text: '8, 3, 10, 1, 6, null, 14' }] },
  preorder: { input: 'tree', level: 'Beginner', time: 'O(n)', space: 'O(h)', prereq: ['inorder'], blurb: 'Node first, then the left and right subtrees.',
    examples: [{ label: 'Full tree', text: '4, 2, 6, 1, 3, 5, 7' }, { label: 'Lopsided', text: '1, 2, null, 3' }] },
  postorder: { input: 'tree', level: 'Beginner', time: 'O(n)', space: 'O(h)', prereq: ['inorder'], blurb: 'Both subtrees first; a node is printed only after its children.',
    examples: [{ label: 'Full tree', text: '4, 2, 6, 1, 3, 5, 7' }, { label: 'With gaps', text: '8, 3, 10, 1, 6, null, 14' }] },
  levelorder: { input: 'tree', level: 'Intermediate', time: 'O(n)', space: 'O(w)', prereq: ['queue', 'inorder'], blurb: 'One level at a time, using a queue.',
    examples: [{ label: 'Full tree', text: '4, 2, 6, 1, 3, 5, 7' }, { label: 'With gaps', text: '8, 3, 10, 1, 6, null, 14' }] },
  bfs: { input: 'graph', level: 'Intermediate', time: 'O(V + E)', space: 'O(V)', prereq: ['queue', 'levelorder'], blurb: 'Explore in rings around the start node, using a queue.',
    examples: [{ label: 'Six nodes', text: '1-2, 1-3, 2-4, 2-5, 3-6, 5-6', target: '1' }, { label: 'Cycle with a tail', text: '0-1, 1-2, 2-3, 3-0, 2-4', target: '2' }, { label: 'Star', text: '1-2, 1-3, 1-4, 1-5', target: '1' }] },
  dfs: { input: 'graph', level: 'Intermediate', time: 'O(V + E)', space: 'O(V)', prereq: ['stack', 'preorder'], blurb: 'Dive down one path, then back up and try the next.',
    examples: [{ label: 'Six nodes', text: '1-2, 1-3, 2-4, 2-5, 3-6, 5-6', target: '1' }, { label: 'Cycle with a tail', text: '0-1, 1-2, 2-3, 3-0, 2-4', target: '2' }, { label: 'Path', text: '1-2, 2-3, 3-4', target: '4' }] },
};

const split = text => String(text ?? '').split(/[\s,;]+/).filter(Boolean);

// Turns what the student typed into the tracer's data. Returns { data } with
// data undefined when nothing was typed (the tracer then uses its default), or
// { error } when the text cannot be read. Range checks stay in runAlgorithm,
// which reports them as notes and falls back to the default input.
export function parseInput(id, text) {
  const topic = TOPICS[id];
  if (!topic) return { error: 'Unknown algorithm.' };
  const raw = String(text ?? '').trim();
  if (!raw) return { data: undefined };
  const kind = topic.input;
  if (kind === 'tree' || kind === 'array' || kind === 'sorted') {
    const parts = split(raw.replace(/^\[|\]$/g, ''));
    const bad = parts.find(p => !/^-?\d+(\.\d+)?$/.test(p) && !(kind === 'tree' && /^(null|-|_)$/i.test(p)));
    if (bad) return { error: `"${bad}" is not a number${kind === 'tree' ? ' or null' : ''}.` };
    return { data: parts.map(p => (/^(null|-|_)$/i.test(p) ? null : Number(p))) };
  }
  if (kind === 'graph') {
    const parts = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const edges = [];
    for (const p of parts) {
      const m = p.match(/^(\d+)\s*(?:<?-+>?|–|—|\s)\s*(\d+)$/);
      if (!m) return { error: `"${p}" is not an edge. Write edges like 1-2.` };
      edges.push([Number(m[1]), Number(m[2])]);
    }
    return { data: edges };
  }
  if (kind === 'stack' || kind === 'queue') {
    const ops = raw.split(/[,;\n]+/).map(s => s.trim().toLowerCase().replace(/\s*\(\s*(-?\d*\.?\d*)\s*\)\s*$/, (_, v) => (v ? ` ${v}` : ''))).filter(Boolean);
    const { add, remove } = LINEAR[kind];
    const ok = new RegExp(`^(${add} -?\\d+(\\.\\d+)?|${remove}|peek)$`);
    const bad = ops.find(op => !ok.test(op.replace(/\s+/g, ' ')));
    if (bad) return { error: `"${bad}" is not a ${kind} operation. Use ${add} x, ${remove} or peek.` };
    return { data: ops.map(op => op.replace(/\s+/g, ' ')) };
  }
  if (!/^\d+$/.test(raw)) return { error: 'n must be a whole number.' };
  return { data: [Number(raw)] };
}

// The reverse: the text the editor shows for a lesson's input.
export function formatInput(visual) {
  const d = visual.data;
  const text = visual.type === 'graph' ? d.map(([a, b]) => `${a}-${b}`).join(', ')
    : visual.type === 'tree' ? d.map(v => (v === null ? 'null' : v)).join(', ')
      : visual.type === 'recursion' ? String(d[0]) : d.join(', ');
  const target = visual.start ?? visual.target;
  return { text, ...(target !== undefined ? { target: String(target) } : {}) };
}

// What the library screen needs, in one response.
export function catalog() {
  return {
    modules: MODULES.map(m => ({
      ...m,
      topics: m.topics.map(id => ({ id, name: ALGORITHMS[id].name, visual: ALGORITHMS[id].visual, ...TOPICS[id], prereq: TOPICS[id].prereq || [], input: { kind: TOPICS[id].input, ...INPUTS[TOPICS[id].input] } })),
    })),
  };
}
