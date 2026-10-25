// Known facts for the rule-based fact check (lib/factcheck.mjs). Each entry is
// checked sentence by sentence, with no model call:
//   about:   the sentence must be about this (regex)
//   wrong:   ...and say this, which contradicts the fact (regex)
//   unless:  ...unless it also says this (a correct contrast, a negation)
//   verdict: 'wrong' when the contradiction is certain, 'doubt' when context
//            could make it right
//   fix:     the correction shown to the student
// To add a fact: add an entry and a case in tests/computed.test.mjs.
export const FACTS = [
  // Data structures
  { about: /\bstacks?\b/i, wrong: /\bFIFO\b|first[- ]in,?\s*first[- ]out/i, unless: /\bqueues?\b|\bnot\b|n't/i, verdict: 'wrong',
    fix: 'A stack is LIFO: last in, first out. The newest item comes off first.' },
  { about: /\bqueues?\b/i, wrong: /\bLIFO\b|last[- ]in,?\s*first[- ]out/i, unless: /\bstacks?\b|\bnot\b|n't|priority/i, verdict: 'wrong',
    fix: 'A queue is FIFO: first in, first out. The oldest item leaves first.' },
  { about: /\b(stack|queue)\b.*\b(push|pop|enqueue|dequeue)\b|\b(push|pop|enqueue|dequeue)\b.*\b(stack|queue)\b/i, wrong: /O\(\s*n\s*\)/i, unless: /\bsearch|find|look ?up|resize|copy|worst.*amortized|amortized|array[- ]based.*grow/i, verdict: 'doubt',
    fix: 'Push, pop, enqueue and dequeue take O(1) time.' },
  { about: /\barrays?\b/i, wrong: /\b(access|index(ing)?|look ?up) (an element |by index )?(takes|is|in) O\(\s*n\s*\)/i, unless: /linked/i, verdict: 'wrong',
    fix: 'Accessing an array element by index takes O(1) time.' },
  { about: /\blinked lists?\b/i, wrong: /\b(access|index(ing)?)\b[^.]{0,30}O\(\s*1\s*\)/i, unless: /\bhead\b|\bfirst\b|\binsert/i, verdict: 'doubt',
    fix: 'Reaching the k-th element of a linked list takes O(n) time: you walk from the head.' },
  { about: /\bhash ?(maps?|tables?)\b/i, wrong: /\b(average|expected|typical)[^.]{0,30}O\(\s*(n|log ?n)\s*\)|O\(\s*(n|log ?n)\s*\)[^.]{0,30}\b(average|expected|typical)/i, unless: /worst/i, verdict: 'wrong',
    fix: 'Hash table lookup, insert and delete take O(1) time on average (O(n) in the worst case).' },
  { about: /\b(balanced )?binary search trees?\b|\bBSTs?\b/i, wrong: /\binorder\b[^.]{0,60}\b(reverse|descending|unsorted|random)\b/i, unless: /\bnot\b|n't|right[- ]to[- ]left|mirror/i, verdict: 'wrong',
    fix: 'An inorder traversal of a binary search tree visits the keys in ascending (sorted) order.' },
  { about: /\bheaps?\b/i, wrong: /\b(find|get|peek)[- ]?(min|max)[^.]{0,30}O\(\s*(log ?n|n)\s*\)/i, unless: /\b(extract|remove|delete|pop)\b/i, verdict: 'wrong',
    fix: 'Peeking at the min (or max) of a heap takes O(1); removing it takes O(log n).' },
  // Algorithms
  { about: /\bbinary search\b(?!\s+trees?)/i, wrong: /\b(works|can be used) on (any|unsorted)\b|doesn't need (the|a) (array|list) to be sorted|does not need .{0,20}sorted/i, unless: /\bonly\b.*sorted|\bmust\b|requires/i, verdict: 'wrong',
    fix: 'Binary search only works on sorted data.' },
  { about: /\bmerge ?sort\b/i, wrong: /\bis (an )?in[- ]place\b|\bO\(\s*1\s*\) (extra|auxiliary) (space|memory)/i, unless: /\bnot\b|n't|linked list/i, verdict: 'doubt',
    fix: 'The usual merge sort is not in-place: merging needs O(n) extra space.' },
  { about: /\b(bubble|insertion|merge) ?sort\b/i, wrong: /\bis (an )?unstable\b|\bis not stable\b/i, unless: /quick|heap|selection/i, verdict: 'wrong',
    fix: 'Bubble, insertion and merge sort are stable: equal items keep their order.' },
  { about: /\bBFS\b|breadth[- ]first/i, wrong: /\buses? a stack\b/i, unless: /\bDFS\b|depth[- ]first|instead|unlike/i, verdict: 'wrong',
    fix: 'Breadth-first search uses a queue (depth-first search uses a stack or recursion).' },
  { about: /\bDFS\b|depth[- ]first/i, wrong: /\buses? a queue\b/i, unless: /\bBFS\b|breadth[- ]first|instead|unlike/i, verdict: 'wrong',
    fix: 'Depth-first search uses a stack (or recursion); breadth-first search uses a queue.' },
  { about: /\bBFS\b|breadth[- ]first/i, wrong: /shortest path[^.]{0,40}\bweighted\b/i, unless: /\bnot\b|n't|unweighted|dijkstra/i, verdict: 'wrong',
    fix: 'BFS finds shortest paths only in unweighted graphs; weighted graphs need Dijkstra or similar.' },
  { about: /\bdijkstra/i, wrong: /\bnegative (edge )?weights?\b[^.]{0,30}\b(works|handles|fine|correct)\b/i, unless: /\bnot\b|n't|bellman/i, verdict: 'wrong',
    fix: "Dijkstra's algorithm does not work with negative edge weights; use Bellman-Ford." },
  { about: /\bfibonacci\b/i, wrong: /\bnaive\b[^.]{0,40}\bO\(\s*n\s*\)/i, unless: /\bmemo|dynamic|iterative|bottom/i, verdict: 'wrong',
    fix: 'Naive recursive Fibonacci takes exponential time, about O(2^n); memoisation brings it to O(n).' },
  // Common topics outside DSA
  { about: /\bTCP\b/i, wrong: /\b(two|2|four|4)[- ]way handshake\b/i, unless: /\b(close|closing|termination|teardown|FIN)\b/i, verdict: 'wrong',
    fix: 'TCP opens a connection with a three-way handshake: SYN, SYN-ACK, ACK.' },
  { about: /\bUDP\b/i, wrong: /\b(guarantees?|ensures?|provides?) (reliable|ordered|in-order) delivery\b/i, unless: /\bnot\b|n't|TCP|unlike/i, verdict: 'wrong',
    fix: 'UDP does not guarantee delivery or ordering; TCP does.' },
  { about: /\bohm'?s law\b|\bV\s*=/i, wrong: /\bV\s*=\s*I\s*\/\s*R\b|\bI\s*=\s*V\s*[×x*]\s*R\b|\bR\s*=\s*V\s*[×x*]\s*I\b/, verdict: 'wrong',
    fix: "Ohm's law is V = I × R (so I = V / R and R = V / I)." },
  { about: /\bphotosynthesis\b/i, wrong: /\b(releases?|produces?|gives off) (carbon dioxide|CO2|CO₂)\b/i, unless: /\brespiration\b|\bnot\b|n't|absorbs?|takes in/i, verdict: 'wrong',
    fix: 'Photosynthesis takes in carbon dioxide and water and releases oxygen.' },
];

const sentences = text => (String(text).replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).map(s => s.trim()).filter(Boolean);

export function knownFacts(text) {
  const out = [];
  for (const s of sentences(text)) {
    const f = FACTS.find(f => f.about.test(s) && f.wrong.test(s) && !(f.unless && f.unless.test(s)));
    if (f) out.push({ quote: s, verdict: f.verdict, fix: f.fix, why: 'This contradicts a known fact.', source: 'rule' });
  }
  return out;
}
