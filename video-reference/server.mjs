import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerInterrupt } from './lib/director.mjs';
import { computedLesson, lessonCatalog } from './lib/lessonService.mjs';
import { synthesize, ttsConfig, VOICES, STYLES } from './lib/tts.mjs';
import { factCheck } from './lib/factcheck.mjs';
import { modelList, modelOrder, modelDetails, noteModel, modelReport, withModelChoice, timeLeft, noteUsage, usageReport, geminiUsage, reviewerFor, preferModel } from './lib/models.mjs';
import { callModelFallback, generateWithModel } from './lib/model-provider.mjs';
import { memo } from './lib/cache.mjs';
import { buildSources } from './lib/sources.mjs';
import { retrieve, sourcesPrompt, CITE_RULES, retrievedSources } from './lib/retrieve.mjs';
const lessonCache = memo(60), explainCache = memo(120), ttsCache = memo(40), sourcesCache = memo(120);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 1_000_000);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
function send(res, status, data) {
  // Tell the app which model answered, and which busy ones were skipped.
  const used = modelReport();
  const report = used && used.used ? { 'x-model-used':used.used, 'x-model-skipped':used.skipped.join(',') } : {};
  const usage = usageReport();
  if (usage?.calls) report['x-usage'] = JSON.stringify(usage);
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', ...report });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '', size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large.'), { status:413 })); req.destroy(); } else body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { status:400 })); } });
    req.on('error', reject);
  });
}
function validateText(value, label, max=12000) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${label} is required.`), { status:400 });
  if (value.length > max) throw Object.assign(new Error(`${label} is too long (max ${max} characters).`), { status:413 });
  return value.trim();
}

const lessonSchemaHint = `Return ONLY valid JSON, no markdown fences, with this schema:
{"title":"...","level":"...","learningGoals":["..."],"scenes":[{"title":"...","narration":"Scene overview","subtitle":"...","visual":{"kind":"tree|photosynthesis|network|memory|equation|flow|timeline|diagram","nodes":[{"id":"a","label":"...","x":0.5,"y":0.5,"shape":"circle|rect|leaf|sun|packet|host|chloroplast|molecule|cpu|ram|disk|database|diamond|cylinder"}],"edges":[{"id":"e1","from":"a","to":"b","label":"optional"}],"focusIds":["a"],"formula":"optional text","code":"optional code"},"beats":[{"narration":"One clear spoken sentence or short thought","subtitle":"Concise matching subtitle","durationSeconds":5,"action":"reveal|trace|transform|compare|pulse|flow|write|zoom","focusIds":["a"],"revealNodeIds":["a"],"revealEdgeIds":[],"motion":{"from":"a","to":"b","label":"optional moving token"},"formula":"optional changing formula","code":"optional highlighted code line"}],"durationSeconds":12,"checkpoint":"Optional question"}],"summary":["..."],"practice":[{"question":"...","answer":"..."}]}
VISUAL CONTINUITY CONTRACT — treat the entire lesson as ONE evolving whiteboard, not disconnected slides:
A. Before writing scenes, choose the correct visual language for the topic. Use a real concept diagram, not a generic collection of labeled boxes. For trees use parent-child branches and circular node values; photosynthesis must show a sun/photon, leaf/chloroplast, light reactions, electron/ATP/NADPH flow and Calvin cycle as relevant; networking must show hosts, packets, links and protocol state; memory must show CPU, address translation, page table, RAM/disk blocks; mathematics must show equations/graphs and transform one line into the next.
B. Use semantic node shapes from the schema. Labels should be concise physical/technical entities, not explanatory sentences. Put explanation in narration. Coordinates should form a meaningful layout.
C. Scenes are sequential chapters of one lesson. Every scene after the first MUST explicitly continue the prior scene: reuse exactly the same IDs, labels, and approximate coordinates for every entity that remains; preserve all earlier objects/edges in the same visual kind and add only what is needed for the next step. Prefer a cumulative diagram over a fresh replacement. The lesson should feel like one drawing being extended, not 12 unrelated pictures. Do not restart the diagram or repeat the same introductory picture. Add a short transition field explaining how this scene follows the previous scene, and visual.kind must remain consistent unless the concept genuinely changes representation.
D. Do not repeat the scene title inside every beat. Beats are steps inside a scene, not new scenes. Their subtitles should be concise, non-redundant statements.
E. Avoid generic boxes unless boxes are the actual concept (memory blocks, packets, table cells, etc.). A diagram should communicate the mechanism visually even before reading the labels.
TEACHING REQUIREMENTS — these are critical:
1. Create 8-16 meaningful scenes for a broad concept, without filler. Add transition to every scene after the first; make the transition refer to the preceding scene and explain what changes next. Teach prerequisites/intuitions, mechanism, a worked example or trace, misconceptions, applications, recap and practice.
2. EACH SCENE MUST HAVE 3-7 beats. Each beat is a small teaching moment with its own narration (ideally ONE sentence, maximum two short sentences), subtitle, action and visual change. Never put the whole scene explanation in one beat. Across the lesson, generate enough beats to teach thoroughly; no arbitrary short-lesson limit.
3. Every spoken sentence must have a matching visual beat. The learner should see something change for every sentence: reveal a new node/edge, highlight a concept, trace a connection, move a token, transform a value, compare states, write a formula, or spotlight code. Do not repeat a static diagram while explaining several sentences.
4. Make visuals genuinely topic-specific and use the semantic shapes above. Do not satisfy this requirement by placing ordinary text in a rectangle. Make visuals genuinely topic-specific. For a tree traversal, animate a pointer along nodes and build the output; for networking, move packets between hosts and update sequence/ACK values; for photosynthesis, move photons/electrons/materials through the relevant structures; for equations, transform each line step-by-step. Choose motion/action that actually explains the sentence.
5. Every beat's focusIds/revealNodeIds/revealEdgeIds refer to IDs in that scene. revealNodeIds and revealEdgeIds are cumulative (include previously revealed IDs). motion.from/to must be existing node IDs. It is fine to omit motion when it doesn't make sense, but use it often for processes/flows.
6. Coordinates x/y must be between 0.08 and 0.92. Keep labels short and legible. IDs unique per scene. Edges must refer to existing nodes. Avoid overcrowding; simplify the scene or create another scene instead.
7. Make each narration pedagogically complete and accurate for an undergraduate engineering learner. Explain why, not only what. Include examples, numerical steps, code/formulas when relevant, common misconceptions, and transitions. No vague filler.
8. The UI will speak each beat separately and animate its matching state, so keep beat narration atomic and make every beat visually meaningful. Use action names that match the intended visual change.
9. Return valid JSON only. Never include executable HTML/JS or arbitrary code in the response.`;


// Every Gemini request goes through here, streamed. onText receives each new
// piece of text as it is written (the explanation shows it live). The chosen
// model is tried first; a model that is busy, missing, or has not started
// answering within options.startWithin ms hands over to the next one, because
// an overloaded model can otherwise sit for a minute before refusing.
// options: { jsonMode, thinking ('low' is much faster), startWithin, ground
// (search Google while writing; the sources go to onGrounding(meta, modelId)) }.
// On a host with a time limit (see requestHandler), no new model is tried once
// too little time is left, and the learner gets a clear "try again" message.
const tooSlow = () => Object.assign(new Error('The AI took longer than the hosting time limit allows. Try again, or pick a faster model (Flash-Lite) in the model menu.'), {status:504});
async function modelStream(system, user, maxTokens, onText, options = {}) {
  const order = modelOrder(process.env), selected = modelDetails(order[0], process.env);
  const provider = selected?.provider || (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  if (provider !== 'gemini' || !order.some(id => modelDetails(id, process.env)?.provider === 'gemini')) {
    const text = await modelCall(system, user, !!options.jsonMode, maxTokens, options); onText(text); return text;
  }
  const key = process.env.GEMINI_API_KEY || '';
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const skipped = [], why = [], startWithin = options.startWithin || 15_000;
  let lastErr = null;
  let ground = !!options.ground && !options.jsonMode, groundOff = '';
  const body = thinking => JSON.stringify({system_instruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],...(ground?{tools:[{google_search:{}}]}:{}),generationConfig:{temperature:0.35,maxOutputTokens:maxTokens,...(options.jsonMode?{responseMimeType:'application/json'}:{}),...(thinking?{thinkingConfig:{thinkingLevel:thinking}}:{})}});
  const geminiModels = order.filter(id => modelDetails(id, process.env)?.provider === 'gemini');
  for (const id of geminiModels) {
    if (timeLeft() < 5_000) throw tooSlow();
    const model = modelDetails(id, process.env).model;
    let r, thinking = options.thinking || null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const slow = new AbortController(), waitTimer = setTimeout(() => slow.abort(), Math.min(startWithin, timeLeft()));
      try {
        r = await fetch(`${base}/models/${model}:streamGenerateContent?alt=sse`, {method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:body(thinking),signal:AbortSignal.any([slow.signal, AbortSignal.timeout(Math.min(180_000, timeLeft()))])});
      } catch (e) {
        clearTimeout(waitTimer);
        r = null;
        why.push(`${id}: ${slow.signal.aborted ? 'did not start in time' : e.message}`.slice(0, 160)); console.warn(`[model] ${why.at(-1)}`);
        if (timeLeft() < 1_000) throw tooSlow();
        lastErr = slow.signal.aborted ? Object.assign(new Error(`Model ${model} did not start answering.`), {status:503, busy:true}) : Object.assign(new Error(`Gemini request failed: ${e.message}`), {status:503});
        break;
      }
      clearTimeout(waitTimer);
      // A model that does not accept the thinking setting is asked again without it.
      if (r.status === 400 && thinking) { const e = await r.clone().json().catch(()=>({})); if (/thinking/i.test(e.error?.message || '')) { thinking = null; continue; } }
      // A model that can't search is asked again without the search tool.
      if (r.status === 400 && ground) { const e = await r.clone().json().catch(()=>({})); if (/tool|search|ground/i.test(e.error?.message || '')) { ground = false; groundOff = 'unsupported'; attempt--; continue; } }
      // Search has its own quota: when it is used up, answer without searching.
      if (r.status === 429 && ground) { ground = false; groundOff = 'quota'; console.warn(`[model] ${id}: search grounding refused (429), answering without it`); attempt--; continue; }
      break;
    }
    if (!r) { if (lastErr.busy) { skipped.push(model); continue; } break; }
    if (!r.ok) {
      const data = await r.json().catch(()=>({}));
      const msg = data.error?.message || `Gemini returned HTTP ${r.status}`;
      // Logged for the host's function logs (Gemini's error text never contains the key).
      why.push(`${id}: HTTP ${r.status} ${msg}`.slice(0, 160)); console.warn(`[model] ${why.at(-1)}`);
      if ([400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(r.status)) { skipped.push(id); lastErr = Object.assign(new Error(`Model ${model} is unavailable (${r.status}).`), {status:503, busy:true}); continue; }
      throw Object.assign(new Error(msg), {status:502});
    }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', full = '', blocked = '', usage = null, grounding = null;
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (e) { if (timeLeft() < 1_000) throw tooSlow(); throw Object.assign(new Error(`Gemini stopped mid-answer: ${e.message}`), {status:503}); }
      const { value, done } = chunk;
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, cut).trim(); buf = buf.slice(cut + 1);
        if (!line.startsWith('data:')) continue;
        let data; try { data = JSON.parse(line.slice(5)); } catch { continue; }
        if (data.promptFeedback?.blockReason) blocked = data.promptFeedback.blockReason;
        if (data.usageMetadata) usage = data.usageMetadata;
        const gm = data.candidates?.[0]?.groundingMetadata;
        if (gm && (gm.groundingChunks?.length || gm.groundingSupports?.length)) grounding = { ...(grounding || {}), ...gm };
        const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
        if (text) { full += text; onText(text); }
      }
    }
    if (blocked) throw new Error(`Gemini blocked the prompt (${blocked}). Simplify the topic and retry.`);
    if (!full.trim()) { why.push(`${id}: empty answer`); console.warn(`[model] ${why.at(-1)}`); skipped.push(id); lastErr = Object.assign(new Error('Gemini returned an empty response.'), {status:503, busy:true}); continue; }
    noteModel(id, skipped, why);
    noteUsage(geminiUsage(usage));
    if (options.onGrounding) options.onGrounding(grounding, id, groundOff);
    return full;
  }
  const alternatives = order.filter(id => modelDetails(id, process.env)?.provider !== 'gemini');
  for (const id of alternatives) {
    if (timeLeft() < 5_000) throw tooSlow();
    try {
      const text = await generateWithModel(id, system, user, !!options.jsonMode, maxTokens, { ...options, timeoutMs: Math.min(options.timeoutMs || 120_000, timeLeft()) }, process.env);
      noteModel(id, skipped, why);
      onText(text);
      return text;
    } catch (error) {
      if (error.fatal) throw error;
      why.push(`${id}: ${error.message}`.slice(0, 160));
      skipped.push(id);
      lastErr = error;
    }
  }
  const message = alternatives.length || lastErr?.busy
    ? 'All configured AI models are busy or unavailable. Try again shortly, or add another provider key for fallback.'
    : (lastErr?.message || 'Gemini request failed.');
  throw Object.assign(new Error(message), {status:503});
}
// Reads the text on a scanned page with a Gemini model (Flash-Lite first: it
// is the quickest, and transcription needs no reasoning). Busy models hand
// over to the next Gemini model.
const OCR_PROMPT = 'Transcribe all readable text on this page in reading order. Keep each heading, list item and paragraph on its own line, and write formulas in plain text. Return only the page text, with no commentary. If the page has no text, return nothing.';
async function readPageImage(base64) {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw Object.assign(new Error('Reading scanned PDFs needs a Gemini key on the server.'), {status:503});
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const ids = modelOrder(process.env).filter(id => modelDetails(id, process.env)?.provider === 'gemini');
  ids.sort((a, b) => (/lite/.test(b) ? 1 : 0) - (/lite/.test(a) ? 1 : 0));
  let lastErr = null;
  for (const id of ids) {
    if (timeLeft() < 5_000) throw tooSlow();
    const model = modelDetails(id, process.env).model;
    let r;
    try {
      r = await fetch(`${base}/models/${model}:generateContent`, { method:'POST', headers:{'content-type':'application/json','x-goog-api-key':key}, signal:AbortSignal.timeout(Math.min(60_000, timeLeft())),
        body:JSON.stringify({ contents:[{ role:'user', parts:[{ inline_data:{ mime_type:'image/jpeg', data:base64 } }, { text:OCR_PROMPT }] }], generationConfig:{ temperature:0, maxOutputTokens:4000 } }) });
    } catch (e) { lastErr = e; continue; }
    const data = await r.json().catch(()=>({}));
    if (!r.ok) { lastErr = new Error(data.error?.message || `HTTP ${r.status}`); if ([429,500,502,503,504,404].includes(r.status)) continue; break; }
    noteUsage(geminiUsage(data.usageMetadata)); noteModel(id, []);
    const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    return { text: text.slice(0, 20000), model: id };
  }
  throw Object.assign(new Error(`Could not read the page: ${lastErr?.message || 'no Gemini model available'}.`), {status:503});
}

async function modelCall(system, user, jsonMode=false, maxTokens=8000, options={}) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const timeout = AbortSignal.timeout(120_000);
  if (provider === 'ollama') {
    const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    let r;
    try { r = await fetch(`${base}/api/chat`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({model, stream:false, format:jsonMode?'json':undefined, messages:[{role:'system',content:system},{role:'user',content:user}], options:{temperature:0.35}}), signal:timeout }); }
    catch (e) { throw Object.assign(new Error(`Could not reach Ollama at ${base}. Start Ollama and pull the model “${model}”. Details: ${e.message}`), { status:503 }); }
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `Ollama returned HTTP ${r.status}`), {status:502});
    noteUsage({ input: data.prompt_eval_count, output: data.eval_count });
    return data.message?.content || '';
  }
  const first = modelDetails(modelOrder(process.env)[0], process.env);
  if (first?.provider === 'gemini') return modelStream(system, user, maxTokens, () => {}, { ...options, jsonMode, startWithin: options.startWithin || 25_000 });
  if (['gemini','openai','xai','grok','openai-compatible'].includes(provider)) return callModelFallback(system, user, jsonMode, maxTokens, { ...options, timeoutMs: Math.min(options.timeoutMs || 120_000, timeLeft()) }, process.env);
  throw Object.assign(new Error('Unsupported LLM_PROVIDER. Use gemini, openai, xai, ollama or openai-compatible.'), {status:500});
}
function parseJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(clean); } catch { const a=clean.indexOf('{'), b=clean.lastIndexOf('}'); if(a>=0&&b>a) return JSON.parse(clean.slice(a,b+1)); throw new Error('The model did not return valid JSON. Try again or use a more capable model.'); }
}
function inferVisualKind(topic, scene) {
  const t=String(topic||'').toLowerCase();
  if(/photosynth|calvin cycle|light reaction|chloroplast/.test(t)) return 'photosynthesis';
  if(/binary tree|tree traversal|inorder|preorder|postorder|heap|bst|avl tree/.test(t)) return 'tree';
  if(/tcp|network|http|dns|dhcp|packet|congestion|routing|ethernet/.test(t)) return 'network';
  if(/virtual memory|paging|page table|mmu|address translation|operating system memory/.test(t)) return 'memory';
  if(/equation|linear algebra|matrix|calculus|derivative|integral|probability|statistics|standard deviation|eigen/.test(t)) return 'equation';
  return ['tree','photosynthesis','network','memory','equation','flow','timeline','diagram','text'].includes(scene?.visual?.kind)?scene.visual.kind:'diagram';
}
function inferShape(label, topic, preferred) {
  const x=String(label||'').toLowerCase(),t=String(topic||'').toLowerCase();
  if(/sun|sunlight|photon|light ray/.test(x)) return 'sun';
  if(/leaf|plant/.test(x)) return 'leaf';
  if(/chloroplast|thylakoid|granum/.test(x)) return 'chloroplast';
  if(/molecule|glucose|oxygen|carbon dioxide|co2|h2o|water molecule|electron|atp|nadph/.test(x)) return 'molecule';
  if(/packet|segment|datagram|frame/.test(x)) return 'packet';
  if(/client|server|host|computer|sender|receiver/.test(x)) return 'host';
  if(/cpu|processor|mmu/.test(x)) return 'cpu';
  if(/ram|main memory|physical memory/.test(x)) return 'ram';
  if(/disk|secondary storage|swap/.test(x)) return 'disk';
  if(/page table|database|table/.test(x)) return 'database';
  if(/decision|condition|\\bif\\b/.test(x)) return 'diamond';
  if(/tree|traversal|root|node|heap/.test(t) && /^-?\d+(\.\d+)?$/.test(x)) return 'circle';
  if(preferred==='rect' && /block|table cell|register|memory cell|page|buffer|packet|frame|queue|stack/.test(x)) return 'rect';
  return ['leaf','sun','packet','host','chloroplast','molecule','cpu','ram','disk','database','diamond','cylinder'].includes(preferred)?preferred:'circle';
}
function validateLesson(lesson, topic='') {
  if (!lesson || typeof lesson.title !== 'string' || !Array.isArray(lesson.scenes) || lesson.scenes.length < 3) throw new Error('Lesson format was incomplete. Please generate again.');
  lesson.scenes = lesson.scenes.map((s, i) => {
    if (!s || typeof s.title !== 'string' || typeof s.narration !== 'string' || !s.visual || !Array.isArray(s.visual.nodes) || !Array.isArray(s.visual.edges)) throw new Error(`Scene ${i+1} was incomplete. Please generate again.`);
    const ids = new Set(s.visual.nodes.map(n=>n.id));
    if (s.visual.nodes.some(n=>!n.id || typeof n.label!=='string' || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x<0 || n.x>1 || n.y<0 || n.y>1)) throw new Error(`Scene ${i+1} contains invalid node coordinates.`);
    if (s.visual.edges.some(e=>!ids.has(e.from)||!ids.has(e.to))) throw new Error(`Scene ${i+1} has an edge referencing a missing node.`);
    s.visual.edges.forEach((e,j)=>{ if(typeof e.id!=='string'||!e.id.trim()) e.id=`${e.from}->${e.to}:${j}`; });
    s.visual.focusIds = Array.isArray(s.visual.focusIds) ? s.visual.focusIds.filter(id=>ids.has(id)) : [];
    s.subtitle = typeof s.subtitle==='string' ? s.subtitle : s.narration.slice(0,180);
    s.transition = typeof s.transition==='string' ? s.transition.slice(0,500) : (i===0 ? 'Introduce the core model.' : 'Continue the same model from the previous scene; preserve its existing entities and connections.');
    s.visual.kind = inferVisualKind(topic, s);
    s.visual.nodes.forEach(n=>{ n.shape = inferShape(n.label, topic, n.shape); });
    const edges = new Set(s.visual.edges.map((e, j)=>e.id || `${e.from}->${e.to}:${j}`));
    const edgeId = e => e.id || `${e.from}->${e.to}:${s.visual.edges.indexOf(e)}`;
    // Backward compatibility: if an older model returns no beats, split the narration into sentence-sized beats.
    let beats = Array.isArray(s.beats) ? s.beats : [];
    if (!beats.length) {
      const sentences = (s.narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [s.narration]).map(x=>x.trim()).filter(Boolean);
      beats = sentences.map((text,j)=>({narration:text,subtitle:text,action:['reveal','trace','pulse','flow'][j%4],focusIds:s.visual.focusIds.length?[s.visual.focusIds[j%s.visual.focusIds.length]]:[],revealNodeIds:s.visual.nodes.slice(0,Math.min(s.visual.nodes.length,Math.max(1,Math.ceil((j+1)*s.visual.nodes.length/sentences.length)))).map(n=>n.id),revealEdgeIds:s.visual.edges.slice(0,Math.ceil((j+1)*s.visual.edges.length/sentences.length)).map(edgeId),durationSeconds:Math.max(3,Math.min(9,(text.split(/\s+/).length/2.4)))}));
    }
    // Enforce the key product behavior even when a model returns multiple sentences in one beat.
    beats = beats.flatMap((b)=>{
      const parts=(String(b.narration||'').match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[String(b.narration||'')]).map(x=>x.trim()).filter(Boolean);
      if(parts.length<=1)return [b];
      return parts.map((sentence,j)=>({...b,narration:sentence,subtitle:sentence,motion:j===0?b.motion:null,durationSeconds:Math.max(2,(Number(b.durationSeconds)||parts.length*4)/parts.length)}));
    });
    if (beats.length < 3) {
      const sentences=(s.narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[s.narration]).map(x=>x.trim()).filter(Boolean);
      if(sentences.length>beats.length) beats=sentences.map((sentence,j)=>({...((beats[Math.min(j,beats.length-1)])||{}),narration:sentence,subtitle:sentence,action:['reveal','trace','pulse','flow','transform'][j%5],focusIds:s.visual.nodes.length?[s.visual.nodes[j%s.visual.nodes.length].id]:[],durationSeconds:Math.max(2,Math.min(8,sentence.split(/\s+/).length/2.4))}));
    }
    let seenNodes = new Set(), seenEdges = new Set();
    s.beats = beats.map((b,j)=>{
      const narration = typeof b.narration==='string' && b.narration.trim() ? b.narration.trim() : (j===0?s.narration:'');
      if (!narration) throw new Error(`Scene ${i+1}, beat ${j+1} is missing narration.`);
      const focusIds = Array.isArray(b.focusIds) ? b.focusIds.filter(id=>ids.has(id)) : [];
      const revealNodeIds = Array.isArray(b.revealNodeIds) ? b.revealNodeIds.filter(id=>ids.has(id)) : [];
      const revealEdgeIds = Array.isArray(b.revealEdgeIds) ? b.revealEdgeIds.filter(id=>edges.has(id) || s.visual.edges.some(e=>`${e.from}->${e.to}:${s.visual.edges.indexOf(e)}`===id)) : [];
      revealNodeIds.forEach(id=>seenNodes.add(id)); revealEdgeIds.forEach(id=>seenEdges.add(id));
      const motion = b.motion && ids.has(b.motion.from) && ids.has(b.motion.to) ? {from:b.motion.from,to:b.motion.to,label:typeof b.motion.label==='string'?b.motion.label.slice(0,50):'→'} : null;
      return {narration,subtitle:typeof b.subtitle==='string'&&b.subtitle.trim()?b.subtitle.trim():narration,action:['reveal','trace','transform','compare','pulse','flow','write','zoom'].includes(b.action)?b.action:'pulse',focusIds,revealNodeIds:[...seenNodes],revealEdgeIds:[...seenEdges],motion,formula:typeof b.formula==='string'?b.formula.slice(0,240):'',code:typeof b.code==='string'?b.code.slice(0,500):'',durationSeconds:Math.min(30,Math.max(2,Number(b.durationSeconds)||Math.max(3,narration.split(/\s+/).length/2.5)))};
    });
    // Ensure every beat reveals at least one new piece of the scene where possible.
    s.beats.forEach((b,j)=>{
      if (!b.revealNodeIds.length && s.visual.nodes.length) b.revealNodeIds=s.visual.nodes.slice(0,Math.min(s.visual.nodes.length,j+1)).map(n=>n.id);
      if (!b.revealEdgeIds.length && s.visual.edges.length) b.revealEdgeIds=s.visual.edges.slice(0,Math.min(s.visual.edges.length,j+1)).map(edgeId);
    });
    s.durationSeconds = Math.min(120, Math.max(5, Number(s.durationSeconds)||s.beats.reduce((sum,b)=>sum+b.durationSeconds,0)));
    return s;
  });
  lesson.learningGoals = Array.isArray(lesson.learningGoals) ? lesson.learningGoals : [];
  lesson.summary = Array.isArray(lesson.summary) ? lesson.summary : [];
  lesson.practice = Array.isArray(lesson.practice) ? lesson.practice : [];
  return lesson;
}

function currentModel() {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  if (['gemini','openai','xai','grok','openai-compatible'].includes(provider)) {
    const id = modelOrder(process.env)[0];
    return modelDetails(id, process.env)?.model || 'not configured';
  }
  if (provider === 'ollama') return process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  return process.env.LLM_MODEL || 'not configured';
}
function isConfigured() {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  if (provider === 'ollama') return true;
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || process.env.GROK_API_KEY || (provider === 'openai-compatible' && process.env.LLM_BASE_URL && process.env.LLM_MODEL));
}

// The request handler is shared: this file runs it as a local server, and the
// Netlify function (lib/netlify.mjs) and Vercel functions (api/) call the same
// function for each request. options.timeLimitMs is the host's cut-off.
export const requestHandler = (req,res,options={}) => withModelChoice(req.headers['x-model'], () => handle(req,res), options.timeLimitMs ? Date.now() + options.timeLimitMs : null);
const server = http.createServer(requestHandler);
async function handle(req,res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,provider:(process.env.LLM_PROVIDER||'ollama').toLowerCase(),model:currentModel(),configured:isConfigured(),models:modelList(),voice:ttsConfig().enabled,voiceRpm:ttsConfig().rpm,voices:VOICES,styles:Object.entries(STYLES).map(([id,s])=>({id,label:s.label})),defaultVoice:ttsConfig().voice});
  // Computed lessons: the tracer produces every frame; the model only narrates.
  // Natural voice: a scene's lines in, one WAV file out, with where each line starts and ends.
  if (req.method==='POST' && url.pathname==='/api/tts') {
    try {
      const body = await readBody(req);
      // The same lines in the same voice are made once and reused (replays, saved lectures).
      const ttsKey = JSON.stringify([body.lines ?? body.text, body.voice || '', body.style || '']);
      const { wav, segments } = ttsCache.get(ttsKey) || ttsCache.set(ttsKey, await synthesize(body.lines ?? body.text, ttsConfig(), fetch, { voice: body.voice, style: body.style }));
      res.writeHead(200, { 'content-type':'audio/wav', 'content-length':wav.length, 'x-segments':JSON.stringify(segments), 'cache-control':'private, max-age=86400', 'x-content-type-options':'nosniff' });
      return res.end(wav);
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected voice error.',retryAfter:e.retryAfter,daily:e.daily}); }
  }
  // Background fact check of AI-written content: rules, then two independent model checks.
  if (req.method==='POST' && url.pathname==='/api/factcheck') {
    try {
      const body = await readBody(req);
      const useModel = body.rulesOnly!==true && body.offline!==true && isConfigured();
      // A different model reviews the answer than the one that wrote it.
      const reviewer = useModel && typeof body.writer==='string' ? reviewerFor(body.writer.slice(0,120)) : null;
      if (reviewer) preferModel(reviewer, body.writer.slice(0,120));
      const result = await factCheck({topic:body.topic,text:body.text,lines:body.lines,source:body.source===true}, useModel ? modelCall : null);
      return send(res,200,{...result, writer: typeof body.writer==='string' ? body.writer.slice(0,120) : null, reviewer: useModel ? (modelReport()?.used || reviewer) : null});
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected fact-check error.'}); }
  }
  // Scanned PDFs: one page image in, its text out (Gemini reads images).
  if (req.method==='POST' && url.pathname==='/api/ocr') {
    try {
      const body = await readBody(req);
      const image = typeof body.image==='string' ? body.image.replace(/^data:image\/jpeg;base64,/, '') : '';
      if (!image || image.length > 950_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) throw Object.assign(new Error('Send one page as a JPEG under 700 KB.'), {status:400});
      return send(res,200,await readPageImage(image));
    } catch(e) { return send(res,e.status||500,{error:e.message||'Could not read the page.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/sources') {
    try {
      const body = await readBody(req);
      const text = validateText(body.text,'Text',12000), topic = typeof body.topic==='string' ? body.topic.slice(0,300) : '';
      const key = JSON.stringify(['lookup', topic, text]);
      const hit = sourcesCache.get(key); if (hit) return send(res,200,hit);
      if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('Finding sources needs a Gemini key on the server.'), {status:503});
      // Only Gemini can search; the writer's choice doesn't matter here.
      const gem = modelOrder(process.env).find(id => modelDetails(id, process.env)?.provider === 'gemini'); if (gem) preferModel(gem);
      let grounding = null, groundOff = '';
      const restated = await modelStream('You check teaching material against trustworthy references. Search for university course pages, textbooks, official documentation, standards and encyclopedias that support the key facts in the text. Restate each key fact in one short sentence, in the same order. Do not add facts that are not in the text.',
        `Topic: ${topic}\n\nText:\n${text}`, 1500, () => {}, { ground:true, onGrounding: (m, id, off) => { grounding = m; groundOff = off || ''; } });
      const result = buildSources(grounding, restated) || { sources:[], claims:[], counts:{trusted:0,reputable:0,other:0,claims:0}, none:true, reason:groundOff };
      return send(res,200,sourcesCache.set(key, { ...result, lookup:true }));
    } catch(e) { return send(res,e.status||500,{error:e.message||'Could not find sources.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/catalog') return send(res,200,lessonCatalog());
  // Accounts: the Supabase project URL and its public anon key. Both are meant
  // to be public (row level security protects the data); null means accounts
  // are not set up and the app keeps everything in the browser.
  if (req.method==='GET' && url.pathname==='/api/config') {
    const supaUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''), anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    const ok = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supaUrl) && anonKey.length > 20;
    return send(res,200,{accounts: ok ? {url:supaUrl, anonKey} : null});
  }
  if (req.method==='POST' && url.pathname==='/api/computed-lesson') {
    try { return send(res,200,await computedLesson(await readBody(req), { modelCall, isConfigured, currentModel })); }
    catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected lesson error.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/interrupt') {
    try {
      const body = await readBody(req);
      const question = validateText(body.question,'Question',600);
      const result = await answerInterrupt({algorithm:body.algorithm,data:body.data,target:body.target,stepIndex:body.stepIndex,sceneTitle:body.sceneTitle,question}, body.offline===true||!isConfigured() ? null : modelCall);
      return send(res,200,result);
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected interrupt error.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/explain') {
    try {
      const body = await readBody(req);
      const topic = validateText(body.topic,'Topic',500);
      const source = typeof body.source==='string' ? body.source.slice(0,20000) : '';
      const level = typeof body.level==='string' ? body.level.slice(0,100) : 'Undergraduate engineering';
      const history = Array.isArray(body.history) ? body.history.slice(-6).map(m => ({ role: (m && m.role === 'user') ? 'user' : 'assistant', content: String((m && m.content) || '').slice(0, 1500) })) : [];
      const htxt = history.length ? `Conversation so far (continue it — answer follow-ups in context, do not repeat what was already explained):\n${history.map(m=>`${m.role==='user'?'Learner':'Tutor'}: ${m.content}`).join('\n').slice(0,4000)}\n\n` : '';
      const system = `You are NeuraLearn, a friendly expert tutor answering exactly like ChatGPT. Match your depth and length to the question asked: a quick or brief question gets a short focused answer; a big or complex topic gets a full thorough explanation — never pad a small question, never cut a big one short. Use structured markdown that fits the topic: a one-line bold title, numbered steps (1. 2. 3.) for processes, C/code examples inside \`\`\`c fences when code helps, "- " bullets for lists like advantages/disadvantages, and a markdown table when comparing things. Use **bold** for key terms. Plain markdown only — no links. Return ONLY the explanation.`;
      const user = `${htxt}Explain this topic. Topic: ${topic}\nLearner level: ${level}\nSource notes (ground truth when supplied):\n${source || '(No notes supplied)'}`;
      const cacheKey = JSON.stringify([topic, source, level, history]);
      const cached = explainCache.get(cacheKey);
      // Streaming: one JSON object per line, {t} for text as it is written, then {done}.
      if (body.stream === true) {
        res.writeHead(200, { 'content-type':'application/x-ndjson; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
        const emit = o => res.write(JSON.stringify(o) + '\n');
        // Verified answers say where their facts come from. By default the
        // question is looked up on Wikipedia first and the model answers from
        // those passages, citing them as [n] (lib/retrieve.mjs). With
        // GEMINI_SEARCH_GROUNDING=true, Gemini searches Google itself instead.
        const wantSources = body.ground === true && !source;
        const googleSearch = wantSources && process.env.GEMINI_SEARCH_GROUNDING === 'true';
        const key = JSON.stringify([cacheKey, wantSources ? (googleSearch ? 'google' : 'cited') : 'plain']);
        const hit = explainCache.get(key);
        if (hit) { emit({t:hit}); emit({done:true,cached:true,...(wantSources && sourcesCache.get(key) ? {sources:sourcesCache.get(key)} : {})}); return res.end(); }
        let grounding = null, groundOff = '', found = [];
        if (wantSources && !googleSearch) { found = await retrieve(topic); emit({looked:found.map(f => f.title)}); }
        const sys = found.length ? `${system}\n\n${CITE_RULES}` : system;
        const usr = found.length ? `${user}\n\n${sourcesPrompt(found)}` : user;
        try {
          const full = String(await modelStream(sys, usr, 4000, t => emit({t}), googleSearch ? { ground:true, onGrounding: (m, id, off) => { grounding = m; groundOff = off || ''; } } : {}) || '').trim();
          if (!full) throw new Error('The model returned an empty explanation.');
          explainCache.set(key, full.replace(/^```(?:md|markdown|text)?[ \t]*\n/i, '').replace(/\n?```\s*$/, '').slice(0, 8000));
          const report = modelReport();
          const none = reason => ({ sources:[], claims:[], counts:{trusted:0,reputable:0,other:0,claims:0}, none:true, reason });
          const sources = !wantSources ? null : googleSearch ? (buildSources(grounding, full) || none(groundOff)) : (retrievedSources(found, full) || none('nothing-found'));
          if (sources && !sources.none) sourcesCache.set(key, sources);
          emit({done:true, model:report?.used || null, skipped:report?.skipped || [], ...(report?.why?.length ? {why:report.why} : {}), usage:usageReport(), ...(sources ? {sources} : {})});
        } catch (e) { emit({error:e.message || 'Unexpected explanation error.'}); }
        return res.end();
      }
      if (cached) return send(res,200,{explanation:cached,topic,cached:true});
      const raw = await modelCall(system, user, false, 4000);
      let explanation = String(raw || '').trim();
      if (/^```(?:md|markdown|text)?[ \t]*\n/i.test(explanation) && /\n?```\s*$/.test(explanation)) explanation = explanation.replace(/^```(?:md|markdown|text)?[ \t]*\n/i, '').replace(/\n?```\s*$/, '');
      explanation = explanation.slice(0, 8000);
      if (!explanation) throw new Error('The model returned an empty explanation.');
      explainCache.set(cacheKey, explanation);
      return send(res,200,{explanation,topic});
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected explanation error.'}); }
  }
  if (req.method==='POST' && (url.pathname==='/api/code-lesson')) {
    try {
      const body = await readBody(req);
      const topic = validateText(body.topic,'Topic',500);
      const source = typeof body.source==='string' ? body.source.slice(0,20000) : '';
      const level = typeof body.level==='string' ? body.level.slice(0,100) : 'Undergraduate engineering';
      const isPdf = body.pdf === true;
      const isViz = body.visualize === true;
      const PDF_SUFFIX = `DOCUMENT MODE: the source text is ONE section of a long uploaded document. Explain it line by line — cover EVERY idea in this section, one beat per idea, as many beats as needed (up to 24 beats). Each beat: 2-4 sentences with real substance. Do not skim, do not summarize the rest of the document.`;
      const VISUALIZE_SUFFIX = `VISUALIZE MODE: the source text below is the FINAL explanation. Narrate its sentences in order, one beat per sentence, using the same words where possible. Do not add chapters, headings, or new facts.`;
      const sysBase = `You are NeuraLearn's senior creative-coding teacher and expert frontend engineer. Generate the ACTUAL RUNNABLE TEACHING PROGRAM, not a JSON description of a diagram. Return ONLY a complete standalone HTML document beginning <!doctype html>. No markdown fences, no preface. Be extremely token-efficient: no comments, short ids, minimal CSS, terse JS. You MUST close </html>.

The document will run in a sandboxed iframe inside an existing teaching SaaS. Build visuals with ONLY inline SVG + DOM + CSS animations + vanilla JS canvas — NO external CDN, NO Konva, NO network calls. The lesson must render fully offline; a lesson that shows a blank screen when a CDN fails is a failure. Do not use React, Vue, build tools, or require any local files. Never use eval, Function, dynamic imports, localStorage, cookies, or access parent DOM. No generic box-and-arrow slideshow.

TEACHING QUALITY IS THE PRODUCT:
- First reason about the concept and choose its natural visual representation. Produce a real, recognizable and intuitively understandable demonstration, not generic labelled rectangles. For tree traversal, draw a proper binary tree with branches, circular value nodes, a moving/highlighted current node, recursion/call stack when relevant, and an output sequence that grows in the exact correct order. For photosynthesis, depict a plant/leaf/chloroplast, sunlight and water/CO2 inputs, light reactions and Calvin cycle with energy/material flow. For networking, show connected hosts and packets traveling over links. For virtual memory, show CPU logical address split, page table lookup, frame mapping, RAM and page fault/disk if relevant. For math, transform equations step-by-step and/or draw an actual coordinate graph. For any other topic, invent a similarly specific visual model suited to the topic. Avoid arbitrary boxes as a universal visual language.
- Make the visual large, polished, legible, colorful but not cluttered. Prefer a single continuous inline-SVG scene whose objects move, transform, reveal, or update. Motion must teach the concept. Use DOM + CSS animations + inline SVG as the ONLY rendering stack.
- Teach as ONE continuous flowing explanation in natural LLM style (like ChatGPT): intuition → mechanism → worked example → misconception → recap, written as plain spoken sentences with NO chapter headings, NO outline and NO bullet lists. Break it into 12-24 beats with exactly ONE sentence per beat. Every sentence gets its own visual change in ONE continuously-evolving diagram (reveal, highlight, move a token, transform a value). The learner must experience a single unbroken line-by-line visual explanation — never chapters, never slides. Keep the FULL HTML under ~40KB. Explanations must be correct and matched to the visual state.
- Send a narration event (with a short subtitle) for every teaching step; the host shows it as subtitles. Keep the language natural and sufficiently detailed for an undergraduate engineering student learning from fundamentals. Ensure the example/data and algorithm/process are internally consistent.
- Add accessible layout and responsive sizing. Outer app supplies controls, narration and outline; do not add duplicate play/pause controls. Initially paused until the outer app tells you to play. Implement an internal async playback timeline with pause/resume/replay and step timing.

REQUIRED parent message protocol (window.parent.postMessage; use targetOrigin '*'; outer app validates event.source). THIS PROTOCOL IS MANDATORY — a lesson that never messages the parent will be discarded and counts as a failure:
0) Attach the command listener FIRST, before sending anything: window.addEventListener('message', handler). Then send the lesson message. Then build visuals. Order matters — if you send first and listen later you will miss the first play command and stall on frame 1.
1) On initialization send {type:'neuralelearn:lesson', title:'lesson title', scenes:[{title:'lesson title',summary:'continuous explanation',beats:TOTAL}]}. Use exactly ONE scene for the whole explanation — never multiple chapters.
2) At the beginning of each step send {type:'neuralelearn:beat', title:'lesson title', sceneTitle:'lesson title', sceneIndex:0, beatIndex:0-based step number across the whole explanation, totalScenes:1, totalBeats:TOTAL, narration:'ONE spoken sentence that reads as part of one flowing ChatGPT-style explanation', subtitle:'short matching subtitle', durationMs:7000, visualNote:'what changed visually'}.
3) Listen for window message data {type:'neuralelearn:command', command:'play'|'pause'|'replay'|'seek'|'speed', sceneIndex?:number, value?:number}. Robustness rules: 'play' is idempotent — it means start OR resume, handle duplicate plays without restarting; never auto-play before the first 'play'. Implement pause with remaining-time bookkeeping: on 'pause' record Date.now and clear the pending timeout; on 'play' resume with the remaining ms, do not restart the beat. 'replay' must clear ALL timers, reset sceneIndex=0/beatIndex=0 and all visual state, set playbackState='playing', then execute beat 0 and schedule with startTimer (never leave it paused after replay). 'seek' must clamp to [0,N), clear timer, reset to that scene beat 0, set playbackState to whatever it was before seek if it was 'playing' keep playing and startTimer, else execute the beat paused — but default to playing so chapter clicks advance. 'speed' updates playbackSpeed and applies to the CURRENT wait (recompute remaining). Playback must not run before 'play' command. Do NOT use speechSynthesis inside the iframe for timing — the host does narration; only use word-count waits. Never use DOMContentLoaded alone to init visuals — run init immediately AND on DOMContentLoaded, so visuals exist even if the event already fired; visuals must be visible within 1s of load.
4) Emit each beat event immediately before performing that beat's visual action; keep visual action and narration aligned, then WAIT FOR THE FULL NARRATION TO FINISH before advancing — never cut a scene short. TIMING: include EXACTLY this function verbatim in your JS: function beatMs(nar){var words=String(nar).split(/\s+/).length;return Math.max(6000,Math.round(words*550/playbackSpeed))+800;} and call beatMs(beat.narration) for every beat's wait and durationMs. A scene MUST NOT advance until its current beat's narration time has fully elapsed (plus the buffer). When all beats done send {type:'neuralelearn:finished'}. EVERY beat must change something visible in the inline SVG (highlight, reveal, move a dot along a path, update a label) — a beat with no visual change is a failure.
5) POINTER AND SUBTITLES: the host provides window.NL and shows the subtitles. Right after sending each beat message, call if(window.NL)NL.point(el) with the one SVG or HTML element that sentence is about (or an array of up to 3 elements, pointed at in order). Never draw subtitle, caption or narration text inside the page; the host already shows it.
6) Do not repeat chapter headings in narration except at the first beat of that chapter. Use no fake claims or placeholder content.

Return complete working HTML, with inline CSS and JS. Quality over brevity. The topic is arbitrary, so do not hardcode only one topic or pretend every topic is a tree. Choose topic-specific visuals and ensure all examples are correct. NO external URLs, NO CDN script tags — if you emit a <script src= it will be rejected.`;
      let system = isPdf ? sysBase + '\n\n' + PDF_SUFFIX : sysBase;
      if (body.visualize === true) system += '\n\n' + VISUALIZE_SUFFIX;
      const maxTokens = isPdf ? 16000 : (body.visualize === true ? 16000 : 8000);
      const user = `Create the complete executable NeuraLearn visual lesson now. Topic: ${topic}\nLearner level: ${level}\nSource notes (use as ground truth when supplied; do not invent conflicting details):\n${source || '(No source notes supplied)'}`;
      const lessonKey = JSON.stringify([topic, source, level, isPdf, isViz]);
      const hit = lessonCache.get(lessonKey);
      if (hit) return send(res,200,{...hit,cached:true});
      let html = '';
      let lastProblem = '';
      for (let attempt = 1; attempt <= 1; attempt++) {
        let raw = await modelCall(system,user,false,maxTokens,{thinking:'low'});
        raw = String(raw||'').trim().replace(/^```(?:html)?\s*/i,'').replace(/\s*```$/,'');
        const start = raw.toLowerCase().indexOf('<!doctype html');
        html = start > 0 ? raw.slice(start) : raw;
        if (!/<html[\s>]/i.test(html) || !/<script[\s>]/i.test(html) || !/<\/html\s*>/i.test(html)) { lastProblem = 'incomplete HTML document'; html = ''; continue; }
        if (!html.includes('neuralelearn:lesson') || !html.includes('neuralelearn:beat')) { lastProblem = 'playback protocol messages'; html = ''; continue; }
        // Offline-safe visuals: no external CDN — Konva-only lessons blank-screen when CDN fails
        if (/<script[^>]+src\s*=/i.test(html) || /cdn\.jsdelivr\.net|unpkg\.com|konva/i.test(html)) { lastProblem = 'offline-safe SVG visuals (CDN script found)'; html = ''; continue; }
        if (!/<svg[\s>]/i.test(html) && !/<canvas[\s>]/i.test(html)) { lastProblem = 'inline SVG/canvas visuals'; html = ''; continue; }
        // Timing validation: accept a runtime computation (Math.max(6000, …*550…))
        // with ANY variable name, or usable numeric durations. Lenient on purpose:
        // strict rejection wasted paid tokens on good lessons.
        const runtimeTimed = /Math\.max\(\s*6000/i.test(html) && /\*\s*55?0/i.test(html);
        if (!runtimeTimed) {
          const pairs = [...html.matchAll(/narration:\s*("((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')[\s\S]{0,600}?durationMs:\s*(\d+)/g)];
          const durs = pairs.length
            ? pairs.map(([ , , dq, sq, dur]) => ({ words: (dq || sq || '').split(/\s+/).filter(Boolean).length, dur: Number(dur) }))
            : [...html.matchAll(/durationMs:\s*(\d+)/g)].map(([ , dur]) => ({ words: 20, dur: Number(dur) }));
          if (!durs.length) { lastProblem = 'readable beat timings'; html = ''; continue; }
          const bad = durs.filter(d => d.dur < Math.min(6000, d.words * 400));
          if (bad.length > Math.ceil(durs.length * 0.5)) { lastProblem = `rushed beat timing (${bad.length}/${durs.length} beats too short)`; html = ''; continue; }
        }
        lastProblem = '';
        break;
      }
      if (!html) throw new Error(`The model did not return a usable lesson (missing ${lastProblem}). Hit Retry to regenerate.`);
      if (html.length > 1_500_000) throw new Error('Generated lesson is too large. Please retry with a narrower topic.');
      if (html.length > 1_500_000) throw new Error('Generated lesson is too large. Please retry with a narrower topic.');
      const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
      const model = currentModel();
      return send(res,200,lessonCache.set(lessonKey,{html,topic,provider,model}));
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected code-generation error.'}); }
  }
  if (req.method==='POST' && (url.pathname==='/api/lesson'||url.pathname==='/api/ask')) {
    try {
      const body = await readBody(req);
      if (url.pathname==='/api/lesson') {
        const topic = validateText(body.topic,'Topic',500);
        const source = typeof body.source==='string' ? body.source.slice(0,20000) : '';
        const level = typeof body.level==='string' ? body.level.slice(0,100) : 'Undergraduate engineering';
        const raw = await modelCall(`You are NeuraLearn, a rigorous patient professor and visual instructional designer. Learner level: ${level}. Create a complete teachable lesson. ${lessonSchemaHint}`, `Teach: ${topic}\nLearner level: ${level}\nOptional source notes (prioritize these, don't invent what is absent):\n${source || '(No notes supplied)'}`, true);
        const lesson = validateLesson(parseJson(raw), topic);
        return send(res,200,{lesson,provider:(process.env.LLM_PROVIDER||'ollama').toLowerCase(),model:currentModel()});
      }
      const question = validateText(body.question,'Question',3000);
      const lesson = body.lesson && typeof body.lesson==='object' ? body.lesson : {};
      const sceneIndex = Number.isInteger(body.sceneIndex) ? body.sceneIndex : 0;
      const scene = Array.isArray(lesson.scenes) ? lesson.scenes[sceneIndex] : null;
      const context = JSON.stringify({title:lesson.title,goals:lesson.learningGoals,summary:lesson.summary,currentScene:scene,transition:scene?.transition,practice:lesson.practice}).slice(0,18000);
      const answer = await modelCall('You are the NeuraLearn tutor answering a learner about the active lesson. Be clear, step-by-step, correct misconceptions gently, and distinguish lesson facts from assumptions. If context is insufficient, say so. Answer in detail appropriate to an undergraduate learner. Do not return JSON.', `Lesson context:\n${context}\n\nLearner question: ${question}`);
      if (!answer.trim()) throw new Error('The model returned an empty answer.');
      return send(res,200,{answer:answer.trim()});
    } catch(e) { return send(res,e.status||500,{error:e.message||'Unexpected server error.'}); }
  }
  if (req.method==='GET') {
    let requested = url.pathname==='/' ? '/index.html' : decodeURIComponent(url.pathname);
    // Pretty path like /app -> redirect to /app/ so relative assets resolve and index.html is served
    if (!requested.endsWith('/') && !path.extname(requested)) { res.writeHead(301,{location:requested+'/', 'cache-control':'no-store'}); return res.end(); }
    if (requested.endsWith('/')) requested += 'index.html';
    const file = path.resolve(ROOT,'public',`.${requested}`);
    if (!file.startsWith(path.resolve(ROOT,'public')+path.sep)) return send(res,403,{error:'Forbidden'});
    fs.readFile(file,(err,data)=>{ if(err) return send(res,404,{error:'Not found'}); res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-cache'}); res.end(data); });
    return;
  }
  send(res,404,{error:'Not found'});
}
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) server.listen(PORT,'127.0.0.1',()=>console.log(`NeuraLearn running at http://127.0.0.1:${PORT}`));
