// Sources for AI tutor answers. Gemini's "grounding with Google Search" says
// which web pages back which sentences of an answer (groundingMetadata). This
// file turns that into a numbered source list and rates every source against
// a list of trusted kinds of site:
//   trusted    universities, official documentation and standards, government
//              and science bodies, encyclopedias, journals and preprints
//   reputable  well-known learning sites (good, but edited less strictly)
//   other      everything else: shown with a warning, never counted as backing
// To trust another site, add it to TRUSTED or REPUTABLE (with a test).

const TRUSTED = [
  // universities and course material
  /\.edu$/, /\.edu\.[a-z]{2}$/, /\.ac\.[a-z]{2}$/, /(^|\.)ocw\.mit\.edu$/, /(^|\.)nptel\.ac\.in$/, /(^|\.)swayam\.gov\.in$/,
  // official documentation and standards
  /(^|\.)developer\.mozilla\.org$/, /(^|\.)docs\.python\.org$/, /(^|\.)python\.org$/, /(^|\.)cppreference\.com$/, /(^|\.)docs\.oracle\.com$/,
  /(^|\.)learn\.microsoft\.com$/, /(^|\.)ietf\.org$/, /(^|\.)rfc-editor\.org$/, /(^|\.)w3\.org$/, /(^|\.)iso\.org$/, /(^|\.)ieee\.org$/,
  /(^|\.)unicode\.org$/, /(^|\.)ecma-international\.org$/, /(^|\.)kernel\.org$/, /(^|\.)postgresql\.org$/, /(^|\.)nodejs\.org$/, /(^|\.)go\.dev$/, /(^|\.)rust-lang\.org$/,
  // government and science bodies
  /\.gov$/, /\.gov\.[a-z]{2}$/, /\.mil$/, /(^|\.)who\.int$/, /(^|\.)europa\.eu$/, /(^|\.)nasa\.gov$/, /(^|\.)nist\.gov$/, /(^|\.)cern\.ch$/,
  // encyclopedias, journals, publishers and preprints
  /(^|\.)wikipedia\.org$/, /(^|\.)britannica\.com$/, /(^|\.)mathworld\.wolfram\.com$/, /(^|\.)nature\.com$/, /(^|\.)science\.org$/,
  /(^|\.)sciencedirect\.com$/, /(^|\.)springer\.com$/, /(^|\.)link\.springer\.com$/, /(^|\.)acm\.org$/, /(^|\.)arxiv\.org$/,
  /(^|\.)ncbi\.nlm\.nih\.gov$/, /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/, /(^|\.)jstor\.org$/, /(^|\.)royalsocietypublishing\.org$/, /(^|\.)aps\.org$/, /(^|\.)iop\.org$/,
  /(^|\.)openstax\.org$/, /(^|\.)algs4\.cs\.princeton\.edu$/,
];
const REPUTABLE = [
  /(^|\.)khanacademy\.org$/, /(^|\.)geeksforgeeks\.org$/, /(^|\.)cp-algorithms\.com$/, /(^|\.)brilliant\.org$/, /(^|\.)programiz\.com$/,
  /(^|\.)tutorialspoint\.com$/, /(^|\.)w3schools\.com$/, /(^|\.)baeldung\.com$/, /(^|\.)visualgo\.net$/, /(^|\.)libretexts\.org$/,
  /(^|\.)byjus\.com$/, /(^|\.)physicsclassroom\.com$/, /(^|\.)hyperphysics\.phy-astr\.gsu\.edu$/, /(^|\.)cloudflare\.com$/, /(^|\.)ibm\.com$/,
  /(^|\.)cisco\.com$/, /(^|\.)stackoverflow\.com$/, /(^|\.)medlineplus\.gov$/, /(^|\.)mayoclinic\.org$/, /(^|\.)investopedia\.com$/,
];

export const domainOf = s => {
  let d = String(s || '').trim().toLowerCase();
  try { if (/^https?:\/\//.test(d)) d = new URL(d).hostname; } catch { /* keep as is */ }
  return d.replace(/^www\./, '').replace(/[/:].*$/, '');
};
export function trustOf(domain) {
  const d = domainOf(domain);
  if (!d) return 'other';
  if (TRUSTED.some(re => re.test(d))) return 'trusted';
  if (REPUTABLE.some(re => re.test(d))) return 'reputable';
  return 'other';
}
const RANK = { trusted: 0, reputable: 1, other: 2 };

// groundingMetadata + the answer text -> { sources, claims, queries, widget }
//   sources: [{ n, title, domain, url, trust }] (numbered, best first)
//   claims:  [{ text, sources: [n], trust }]  (trust = best source behind it)
export function buildSources(meta, text = '') {
  if (!meta || !Array.isArray(meta.groundingChunks) || !meta.groundingChunks.length) return null;
  const raw = meta.groundingChunks.map(c => c.web || c.retrievedContext || {}).map(w => ({ title: String(w.title || '').slice(0, 200), url: String(w.uri || ''), domain: domainOf(w.domain || w.title || w.uri) }));
  // One entry per site, best-rated first; remember where each raw chunk went.
  const bySite = new Map(), map = [];
  raw.forEach((s, i) => {
    if (!/^https:\/\//.test(s.url)) { map[i] = null; return; }
    const key = s.domain || s.url;
    if (!bySite.has(key)) bySite.set(key, { ...s, trust: trustOf(s.domain) });
    map[i] = key;
  });
  const list = [...bySite.values()].sort((a, b) => RANK[a.trust] - RANK[b.trust]);
  list.forEach((s, k) => { s.n = k + 1; });
  const numOf = key => bySite.get(key)?.n;
  const claims = (meta.groundingSupports || []).map(s => {
    const nums = [...new Set((s.groundingChunkIndices || []).map(i => map[i] && numOf(map[i])).filter(Boolean))].sort((a, b) => a - b);
    const best = nums.map(n => list[n - 1].trust).sort((a, b) => RANK[a] - RANK[b])[0] || 'other';
    return { text: String(s.segment?.text || '').trim().slice(0, 600), sources: nums, trust: best };
  }).filter(c => c.text && c.sources.length);
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return {
    sources: list, claims,
    counts: { trusted: list.filter(s => s.trust === 'trusted').length, reputable: list.filter(s => s.trust === 'reputable').length, other: list.filter(s => s.trust === 'other').length, claims: claims.length, words },
    queries: (meta.webSearchQueries || []).slice(0, 6).map(q => String(q).slice(0, 120)),
    // Google requires its search suggestions to be shown with grounded answers.
    widget: typeof meta.searchEntryPoint?.renderedContent === 'string' ? meta.searchEntryPoint.renderedContent.slice(0, 20000) : '',
  };
}
