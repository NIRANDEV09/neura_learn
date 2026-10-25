// Where the AI tutor's facts come from. Before an answer is written, the
// question is looked up on Wikipedia (free API, no key), and the passages most
// relevant to the question are taken from the top articles. The model answers
// from those numbered passages and marks each sentence that uses one with [n],
// so every cited sentence can be traced to the exact page and passage it came
// from. Sentences without a marker are the tutor's own explanation.
const API = 'https://en.wikipedia.org/w/api.php';
// Wikipedia asks API clients to identify themselves.
const UA = 'NeuraLearn/1.0 (educational tutor; https://storied-churros-164bf2.netlify.app)';
const STOP = new Set('a an and are as at be been but by can could did do does doing done explain explained explaining example examples for from give how i in into is it its me more most much my of on or please quick quickly short simple simply so tell than that the their them then there these they this those to understand use used uses using was way ways what when where which while who why will with work works would you your two three four five one sentence sentences word words paragraph paragraphs line lines brief briefly detail detailed details answer topic about between difference differ vs versus'.split(' '));
const DROP = /^(see also|references|notes|external links|further reading|bibliography|sources|citations|footnotes|gallery)$/i;

export function keywords(question) {
  const words = String(question || '').toLowerCase().replace(/[^a-z0-9+#\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 10);
}

async function wiki(params, fetchImpl, signal) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
  const r = await fetchImpl(url, { headers: { 'user-agent': UA, 'api-user-agent': UA, accept: 'application/json' }, signal });
  if (!r.ok) throw new Error(`Wikipedia returned HTTP ${r.status}`);
  return r.json();
}

// The passages of one article that matter most for the question, in article
// order, starting with the opening paragraph; at most `budget` characters.
export function bestPassages(extract, words, budget = 1600) {
  const paras = [];
  let section = '';
  for (const raw of String(extract || '').split(/\n+/)) {
    const line = raw.trim();
    const head = line.match(/^=+\s*(.*?)\s*=+$/);
    if (head) { section = head[1]; continue; }
    if (DROP.test(section) || line.length < 60) continue;
    paras.push({ text: line, i: paras.length });
  }
  if (!paras.length) return '';
  const score = p => { const t = p.text.toLowerCase(); return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
  const ranked = paras.slice(1).map(p => ({ ...p, s: score(p) })).filter(p => p.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  const pick = [paras[0]];
  let used = paras[0].text.length;
  for (const p of ranked) { if (used + p.text.length > budget) continue; pick.push(p); used += p.text.length; }
  return pick.sort((a, b) => a.i - b.i).map(p => p.text).join('\n').slice(0, budget + 400);
}

// -> [{ n, title, url, domain, trust, excerpt }] (may be empty; never throws)
export async function retrieve(question, { fetchImpl = fetch, timeoutMs = 4500, max = 3, budget = 1600 } = {}) {
  const words = keywords(question);
  if (!words.length) return [];
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const found = await wiki({ action: 'query', list: 'search', srsearch: words.slice(0, 8).join(' '), srlimit: String(max + 2), srprop: '' }, fetchImpl, signal);
    const titles = (found.query?.search || []).map(s => s.title).filter(t => !/\(disambiguation\)$/i.test(t)).slice(0, max);
    const pages = await Promise.all(titles.map(title => wiki({ action: 'query', prop: 'extracts|info', inprop: 'url', explaintext: '1', exsectionformat: 'wiki', redirects: '1', titles: title }, fetchImpl, signal)
      .then(j => j.query?.pages?.[0]).catch(() => null)));
    return pages.filter(p => p && !p.missing && p.extract)
      .map(p => ({ title: p.title, url: p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, excerpt: bestPassages(p.extract, words, budget) }))
      .filter(p => p.excerpt && words.some(w => p.excerpt.toLowerCase().includes(w)))
      .map((p, k) => ({ n: k + 1, ...p, domain: 'en.wikipedia.org', trust: 'trusted' }));
  } catch { return []; }
}

export function sourcesPrompt(list) {
  return `SOURCES (numbered passages from trusted references; base your facts on them):\n${list.map(s => `[${s.n}] Wikipedia, "${s.title}"\n${s.excerpt}`).join('\n\n')}`;
}
export const CITE_RULES = 'Base your facts on the numbered SOURCES given with the question. Right after each sentence that uses a source, add its number in square brackets, like [1] or [1][2], before the next sentence. Cite only numbers that exist in SOURCES, and only for facts the passage actually states. You may add your own explanation or examples where the sources say nothing; leave those sentences without a number. Never put citation numbers inside code blocks or tables.';

// Citation markers: [n] right after a space or punctuation, outside code.
const MARK = /(?:(?<=[\s.,;:!?)"'’])|^)\[(\d{1,2})\](?:\[\d{1,2}\])*/g;
function outsideCode(text, fn) {
  return String(text).split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}
export const stripCites = text => outsideCode(text, t => t.replace(/[ \t]*(?:(?<=[\s.,;:!?)"'’])|^)\[(\d{1,2})\](?:\[\d{1,2}\])*/gm, ''));

// Which sentences cite which sources -> { claims: [{ text, sources }], cited, sentences }
export function citedClaims(text, list) {
  const valid = new Set(list.map(s => s.n));
  const prose = outsideCode(text, t => t).split(/```[\s\S]*?```/).join(' ');
  const sentences = (prose.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s*\[\d{1,2}\])*|[^.!?]+$/g) || []).map(s => s.trim()).filter(s => s.replace(/\[\d+\]/g, '').trim().length > 20);
  const claims = [];
  for (const s of sentences) {
    const nums = [...new Set([...s.matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1])).filter(n => valid.has(n)))];
    if (nums.length) claims.push({ text: stripCites(s).replace(/\*\*/g, '').trim(), sources: nums.sort((a, b) => a - b), trust: 'trusted' });
  }
  return { claims, cited: claims.length, sentences: sentences.length };
}

// The "sources" object sent with the answer (same shape as lib/sources.mjs).
export function retrievedSources(list, text) {
  if (!list.length) return null;
  const { claims, cited, sentences } = citedClaims(text, list);
  return {
    mode: 'retrieved',
    // used: the answer cites it; read-but-unused sources are listed apart.
    sources: list.map(({ excerpt, ...s }) => ({ ...s, excerpt: excerpt.slice(0, 900), used: claims.some(c => c.sources.includes(s.n)) })),
    claims,
    counts: { trusted: list.length, reputable: 0, other: 0, claims: cited, sentences },
  };
}
