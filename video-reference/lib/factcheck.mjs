// Background fact check for AI-written teaching content (the AI tutor's
// explanations and the lecture lines built from them).
//
// Three layers, cheapest first:
//   1. Rules that need no model: arithmetic written as "a op b = c", time
//      complexities stated for well-known algorithms, known facts
//      (lib/facts.mjs), lecture lines that mention numbers the checked
//      explanation never mentions, and, for PDF lectures, lines whose words
//      are mostly not in the document section.
//   2. An independent reviewer: a separate model call with a fact-checker's
//      instructions lists the checkable claims and judges each one. Claims
//      must be quoted word for word from the text, or they are dropped.
//   3. A second opinion: every claim the reviewer calls wrong is checked again
//      on its own. It stays "wrong" only if both passes agree; otherwise it is
//      downgraded to "doubt". A rule result always beats a model opinion.
import { numbersIn } from './lessonSchema.mjs';
import { knownFacts } from './facts.mjs';

const sentencesOf = text => (String(text).replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).map(s => s.trim()).filter(Boolean);

// ---- 1a. arithmetic ----
const NUM = '-?\\d+(?:\\.\\d+)?';
const ARITH = new RegExp(`(${NUM})\\s*([+\\-×x*/÷^])\\s*(${NUM})\\s*=\\s*(${NUM})(?!\\d|\\.\\d)`, 'g');
function arithmetic(text) {
  const out = [];
  for (const m of String(text).matchAll(ARITH)) {
    const [quote, a, op, b, c] = m, x = Number(a), y = Number(b), z = Number(c);
    const v = { '+': x + y, '-': x - y, '×': x * y, x: x * y, '*': x * y, '/': x / y, '÷': x / y, '^': x ** y }[op];
    if (!Number.isFinite(v)) continue;
    const ok = Math.abs(v - z) <= Math.max(1e-9, Math.abs(v) * 0.005);
    if (!ok) out.push({ quote, verdict: 'wrong', fix: `${a} ${op} ${b} = ${Number.isInteger(v) ? v : Number(v.toFixed(4))}`, why: 'The arithmetic does not work out.', source: 'rule' });
  }
  return out;
}

// ---- 1b. time complexity of well-known algorithms ----
const norm = s => s.toLowerCase().replace(/²/g, '^2').replace(/\s+/g, '').replace(/\*/g, '').replace(/n\^?2|n\.n/g, 'n^2').replace(/lg|log2|log_2/g, 'log').replace(/nlogn/g, 'nlog n').replace(/\s/g, '');
const C = (...xs) => xs.map(x => norm(x));
const KNOWN = [
  { names: /\bbubble\s*sort/i, any: C('n^2', 'n'), worst: C('n^2'), best: C('n'), label: 'O(n²) worst and average, O(n) best with the early-exit check' },
  { names: /\binsertion\s*sort/i, any: C('n^2', 'n'), worst: C('n^2'), best: C('n'), label: 'O(n²) worst and average, O(n) best' },
  { names: /\bselection\s*sort/i, any: C('n^2'), worst: C('n^2'), best: C('n^2'), label: 'O(n²) in every case' },
  { names: /\bmerge\s*sort/i, any: C('nlog n'), worst: C('nlog n'), best: C('nlog n'), label: 'O(n log n) in every case' },
  { names: /\bheap\s*sort/i, any: C('nlog n'), worst: C('nlog n'), best: C('nlog n', 'n'), label: 'O(n log n)' },
  { names: /\bquick\s*sort/i, any: C('nlog n', 'n^2'), worst: C('n^2'), best: C('nlog n'), label: 'O(n log n) average, O(n²) worst' },
  { names: /\bbinary\s+search\b(?!\s+trees?)/i, any: C('log n', '1'), worst: C('log n'), best: C('1'), label: 'O(log n), O(1) best case' },
  { names: /\blinear\s+search/i, any: C('n', '1'), worst: C('n'), best: C('1'), label: 'O(n), O(1) best case' },
  { names: /\b(bfs|dfs|breadth[\s-]first|depth[\s-]first)\b/i, any: C('v+e', 'n+m', 'n', 'v'), worst: C('v+e', 'n+m'), best: C('v+e', 'n+m', 'n', 'v'), label: 'O(V + E)' },
];
function complexities(text) {
  const out = [];
  for (const s of sentencesOf(text)) {
    if (/\b(space|memory|stack depth|auxiliary)\b/i.test(s)) continue;
    const algos = KNOWN.filter(k => k.names.test(s));
    if (algos.length !== 1) continue; // comparisons between algorithms are left to the reviewer
    const k = algos[0], claims = [...s.matchAll(/O\(([^)]{1,20})\)/g)].map(m => norm(m[1]));
    if (!claims.length) continue;
    // A sentence that names one case is held to that case; one that names several, to any of them.
    const worst = /\bworst/i.test(s), best = /\bbest/i.test(s);
    const allowed = worst && !best ? k.worst : best && !worst ? k.best : k.any;
    const bad = claims.find(c => !allowed.includes(c));
    if (bad) out.push({ quote: s, verdict: 'wrong', fix: `The time complexity is ${k.label}.`, why: 'This does not match the known time complexity.', source: 'rule' });
  }
  return out;
}

// ---- 1c. lecture lines must not bring in new numbers ----
function lectureNumbers(text, lines) {
  const allowed = new Set(numbersIn(text));
  return (lines || []).filter(l => numbersIn(l).some(n => !allowed.has(n) && !(Number.isInteger(n) && n >= 0 && n <= 2)))
    .map(l => ({ quote: l, verdict: 'doubt', fix: 'This lecture line uses a number that the checked explanation does not contain.', why: 'The lecture should repeat the explanation, not add new values.', source: 'rule', line: true }));
}

// ---- 1d. PDF lectures must stay with the document ----
// A lecture line whose content words are mostly absent from its section is
// probably the model's own material, not the student's document.
const STOP = new Set('about above after again against along also although among another anything around because become before behind being below beside between beyond both cannot could didnt does doesnt doing done during each either enough every example first following from further given going have having here itself just know large later least less like little made make makes many might more most much must near need never next often once only other others otherwise over perhaps place point quite rather really right same second seems several shall should show shows since small some something sometimes still such take takes than that their theirs them then there therefore these they thing things think this those though three through thus together toward under until upon used uses using usually very want well were what whatever when where whether which while whole whose will with within without would your yours lets look looks lecture section document notice simply'.split(' '));
const contentWords = s => (String(s).toLowerCase().match(/[a-z][a-z0-9-]{4,}/g) || []).filter(w => !STOP.has(w));
const stem = w => w.replace(/(ingly|ings|ing|edly|ed|es|s|ly)$/, '');
function grounding(source, lines) {
  const src = new Set(contentWords(source).map(stem));
  return (lines || []).flatMap(l => {
    const ws = [...new Set(contentWords(l).map(stem))];
    if (ws.length < 5) return [];
    const share = ws.filter(w => src.has(w)).length / ws.length;
    return share >= 0.3 ? [] : [{ quote: l, verdict: 'doubt', fix: 'Most of this line is not in your document: treat it as the tutor\'s own explanation.', why: 'PDF lectures should teach what the document says.', source: 'rule', line: true }];
  });
}

export function ruleCheck(text, lines = [], { source = false } = {}) {
  return [...arithmetic(text), ...complexities(text), ...knownFacts(text), ...lines.flatMap(l => [...arithmetic(l), ...knownFacts(l)].map(c => ({ ...c, line: true }))), ...lectureNumbers(text, lines), ...(source ? grounding(text, lines) : [])];
}

// ---- 2 and 3. independent reviewer and second opinion ----
const REVIEW_SYSTEM = `You are a strict fact-checker for engineering course material. You did not write the text below.
List every checkable factual claim in it: definitions, numbers, formulas, complexities, worked-example steps, code behaviour and historical facts. Ignore opinions and teaching phrasing.
For each claim, work it out yourself before judging (re-derive worked examples step by step). Verdicts:
- "ok": correct as stated.
- "doubt": imprecise, missing an important condition, or only true in some cases.
- "wrong": factually incorrect.
For "doubt" and "wrong", give a one-sentence correction in "fix" and a short reason in "why".
"quote" must be copied exactly, character for character, from the text, and should be one sentence or less.
Return JSON only: {"claims":[{"quote":"...","verdict":"ok|doubt|wrong","fix":"...","why":"..."}]}`;
const SECOND_SYSTEM = `You are a second, independent fact-checker. For each numbered claim, decide on your own whether it is factually wrong in the context of the topic. Work it out step by step in your head first.
Return JSON only: {"answers":[{"n":1,"wrong":true|false,"fix":"one-sentence correction if wrong"}]}`;

function parseJson(raw) {
  const clean = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { const a = clean.indexOf('{'), b = clean.lastIndexOf('}'); return a >= 0 && b > a ? JSON.parse(clean.slice(a, b + 1)) : {}; }
}
const squash = s => String(s || '').replace(/\s+/g, ' ').trim();
// Answers are markdown; claims are matched on their words alone, so bold
// markers, list bullets and punctuation never decide whether a quote is real.
// Code blocks and inline code are kept exactly, since a * there is a pointer.
const plain = s => String(s || '').split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => (i % 2 ? part
  : part.replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s+/gm, '').replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '').replace(/^\s*>\s?/gm, ''))).join('');
export const wordsKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function review(topic, text, modelCall) {
  const raw = await modelCall(REVIEW_SYSTEM, `Topic: ${topic}\n\nText to check:\n${plain(text)}`, true, 3000);
  const flat = wordsKey(text);
  return (Array.isArray(parseJson(raw).claims) ? parseJson(raw).claims : []).slice(0, 40)
    .map(c => ({ quote: squash(c.quote).slice(0, 400), verdict: ['ok', 'doubt', 'wrong'].includes(c.verdict) ? c.verdict : 'doubt', fix: squash(c.fix).slice(0, 300), why: squash(c.why).slice(0, 300), source: 'model' }))
    .filter(c => c.quote.length >= 8 && flat.includes(wordsKey(c.quote))); // a claim the text never made is the reviewer's mistake
}
async function secondOpinion(topic, claims, modelCall) {
  if (!claims.length) return claims;
  const raw = await modelCall(SECOND_SYSTEM, `Topic: ${topic}\n\nClaims:\n${claims.map((c, i) => `${i + 1}. ${c.quote}`).join('\n')}`, true, 1500);
  const answers = Array.isArray(parseJson(raw).answers) ? parseJson(raw).answers : [];
  return claims.map((c, i) => {
    const a = answers.find(x => Number(x.n) === i + 1);
    if (a && a.wrong === true) return { ...c, agreed: true, fix: c.fix || squash(a.fix).slice(0, 300) };
    return { ...c, verdict: 'doubt', agreed: false, why: `${c.why ? `${c.why} ` : ''}A second check did not confirm this is wrong.`.trim() };
  });
}

// Runs every layer it can. Without a model, or if a model call fails, the rule
// results are still returned and "reviewed" says what happened.
// source: text is the student's own document (PDF tutor), so lecture lines are
// also checked for staying with it.
export async function factCheck({ topic = '', text = '', lines = [], source = false } = {}, modelCall = null) {
  const body = String(text).slice(0, 12000), lecture = (Array.isArray(lines) ? lines : []).map(squash).filter(Boolean).slice(0, 60);
  if (!body.trim()) throw Object.assign(new Error('Text is required.'), { status: 400 });
  const rules = ruleCheck(body, lecture, { source });
  let model = [], reviewed = 'rules only';
  if (modelCall) {
    try {
      const claims = await review(squash(topic).slice(0, 200), body, modelCall);
      const wrong = claims.filter(c => c.verdict === 'wrong');
      const checked = await secondOpinion(topic, wrong, modelCall).catch(() => wrong.map(c => ({ ...c, verdict: 'doubt', agreed: false })));
      model = claims.map(c => (c.verdict === 'wrong' ? checked.shift() : c));
      reviewed = 'rules and two independent model checks';
    } catch (e) { reviewed = `rules only (model check failed: ${e.message})`; }
  }
  // A rule finding replaces any model opinion on the same text.
  const covered = q => rules.some(r => r.quote.includes(q) || q.includes(r.quote));
  const claims = [...rules, ...model.filter(c => !covered(c.quote))];
  const flagged = claims.filter(c => c.verdict !== 'ok');
  return {
    claims, reviewed,
    counts: { checked: claims.length, ok: claims.length - flagged.length, doubt: flagged.filter(c => c.verdict === 'doubt').length, wrong: flagged.filter(c => c.verdict === 'wrong').length },
  };
}
