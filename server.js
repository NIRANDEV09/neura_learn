const http = require('http');
const { spawn } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
// Minimal .env loader (no dependency required). Existing process environment wins.
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch (_) { /* .env is optional */ }
const PORT = Number(process.env.PORT || 3003);
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
const API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MODEL = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').replace(/^models\//, '');
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';
const ACTIVE_MODEL = LLM_PROVIDER === 'groq' ? GROQ_MODEL : MODEL;
const ACTIVE_KEY = LLM_PROVIDER === 'groq' ? GROQ_API_KEY : API_KEY;
const ROOT = path.join(__dirname, fs.existsSync(path.join(__dirname, 'dist')) ? 'dist' : 'public');

function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*'});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function readBody(req) { return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c; if(s.length>1e6) req.destroy();}); req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch(e){reject(e);}}); req.on('error',reject);}); }
const lessonSchema = `Return ONLY valid JSON with this shape: {"title":"short title","overview":"one sentence","segments":[{"narration":"one natural spoken sentence or short paragraph","visuals":[{"type":"text|line|arrow|circle|rect|formula|dot|curve","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"w":1-60,"h":1-40,"text":"short label or equation","color":"#hex","size":10-30,"delay":0-1200,"style":"rough|plain"}],"duration":1200-6000}],"checkpoint":{"question":"one short question","options":["...","...","..."],"answerIndex":0,"explanation":"..."}}. Choose the number of segments yourself from the topic complexity and the requested depth; follow any explicit request for brevity, detail, or a target count. Do not force every topic into the same length. Make a short/simple request concise, a normal request complete, and a deep/advanced request substantially more detailed. Continue until the concept and requested scope are fully taught, without padding. Each segment should add a distinct teaching step: intuition, definitions, mechanism, worked example, interpretation, application, and a useful recap as appropriate. Accuracy is mandatory: verify equations, units, arithmetic, signs, and causal claims before answering. For worked examples, show the substitution and check the result. If uncertain, explain the uncertainty instead of inventing a fact. Visual coordinates are percentages of the whiteboard. Never use white or near-white visual colors on the whiteboard; choose clearly visible blue, red, green, purple, orange, or dark gray instead. Every segment must have 3-6 purposeful, specific visuals that directly teach its narration. The whiteboard persists between segments: each segment adds new marks only, reuses established labels, and never redraws the same equation or diagram. Build a clear whiteboard composition with readable labels, correctly placed arrows, equations with units, labeled axes and plotted points when relevant, and a visual change that matches the spoken idea. For worked examples, show the actual values and result; for processes, show ordered stages; for comparisons, show both sides. For data structures, label every node with its concrete value inside the node shape: put list values inside rectangular nodes and tree keys inside circles. Use a small worked example with explicit values; for a doubly linked list show prev/data/next meaning and arrows in both directions, and for trees put parent/child values on the correct nodes and connect them with branches. Never draw empty node boxes or unlabeled tree circles when teaching these structures. Do not invent data or use generic decorative boxes. Avoid overlap and keep visual geometry mathematically faithful. Each segment should be animated stroke-by-stroke. Keep narration concise enough for spoken teaching. Include a checkpoint only if useful; otherwise set checkpoint to null. Use valid JSON, no markdown.`;
function parseModelJson(text){const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(clean)}catch{}const start=clean.indexOf('{');if(start<0)throw new Error('no JSON object');let depth=0,inString=false,escaped=false;for(let i=start;i<clean.length;i++){const c=clean[i];if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue}if(c==='"'){inString=true;continue}if(c==='{')depth++;else if(c==='}'&&--depth===0){return JSON.parse(clean.slice(start,i+1))}}throw new Error('incomplete JSON object')}
async function askGemini(system, user, temperature=0.25, maxOutputTokens=4096, options={}) {
  if (!API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is missing. Add it to your environment or .env setup.'), {status:503});
  const generationConfig={maxOutputTokens, responseMimeType:'application/json', thinkingConfig:{thinkingLevel:options.thinkingLevel||'low'}};
  // Keep the preferred model first, then use stable Flash fallbacks if it is
  // quota-limited or temporarily busy. Lite is only reached when both full
  // Flash models cannot serve the request.
  const models=[...new Set([MODEL,'gemini-3.5-flash','gemini-3.8-flash'])];
  let response,raw,usedModel=MODEL;
  for(const model of models){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),options.timeoutMs||45000);
    try { response=await fetch(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig})}); raw=await response.text(); }
    catch(e) { if(e.name==='AbortError') throw Object.assign(new Error(`Gemini request timed out after ${Math.round((options.timeoutMs||45000)/1000)} seconds. Check model access, API quota, and network.`),{status:504}); throw e; }
    finally { clearTimeout(timeout); }
    if(response.ok){usedModel=model;break}
    // A model-specific free-tier limit on the primary can still leave quota on
    // the fallback model. Try that model for both temporary overload and 429.
    if(response.status!==503 && response.status!==429)throw Object.assign(new Error(`Gemini API ${response.status}: ${raw.slice(0,500)}`),{status:response.status});
  }
  if(!response?.ok){
    if(response?.status===429) throw Object.assign(new Error(`Gemini's request quota is exhausted for both ${models.join(' and ')}. This key has reached its free-tier daily request limit. Wait for the quota reset or use a Gemini key with available quota/billing. (${(raw||'No response').slice(0,300)})`),{status:429});
    throw Object.assign(new Error(`Gemini's Flash models are temporarily overloaded (${models.join(', ')}). Please try again shortly. (${(raw||'No response').slice(0,300)})`),{status:503});
  }
  const payload = JSON.parse(raw);
  let text = payload.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  text = text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try { const result=parseModelJson(text); Object.defineProperty(result,'_model',{value:usedModel,enumerable:false}); return result; } catch { throw Object.assign(new Error(`Gemini returned incomplete or invalid JSON from ${usedModel}. Please retry the request.`), {status:502}); }
}
async function streamGeminiResponse(system,user,res,options={}) {
  if(!API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is missing. Add it to your environment or .env setup.'),{status:503});
  const models=[...new Set([MODEL,'gemini-3.5-flash','gemini-3.8-flash'])],controller=new AbortController(),timeoutMs=options.timeoutMs||22000;
  const timeout=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();let upstream=null,usedModel=MODEL,lastError='';
  const onClose=()=>{if(!res.writableEnded)controller.abort()};res.on('close',onClose);
  const emit=event=>res.write(JSON.stringify(event)+'\n');
  try {
    for(const model of models){
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      try{upstream=await fetch(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{temperature:0.1,maxOutputTokens:options.maxOutputTokens||700,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}})})}catch(e){if(e.name==='AbortError')throw Object.assign(new Error(`Gemini first-scene request timed out after ${Math.round(timeoutMs/1000)} seconds.`),{status:504});throw e;}
      if(upstream.ok){usedModel=model;break;}lastError=await upstream.text();if(upstream.status!==429&&upstream.status!==503)throw Object.assign(new Error(`Gemini API ${upstream.status}: ${lastError.slice(0,500)}`),{status:upstream.status});upstream=null;
    }
    if(!upstream)throw Object.assign(new Error(`Gemini models are busy or unavailable (${lastError.slice(0,300)})`),{status:503});
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Accel-Buffering':'no'});res.flushHeaders?.();
    const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='',full='';
    const consume=line=>{const value=line.trim();if(!value.startsWith('data:'))return;const raw=value.slice(5).trim();if(!raw||raw==='[DONE]')return;let event;try{event=JSON.parse(raw)}catch{return;}for(const part of event.candidates?.[0]?.content?.parts||[]){if(part.thought||typeof part.text!=='string'||!part.text)continue;full+=part.text;emit({type:'delta',text:part.text});}};
    for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,i));buffer=buffer.slice(i+1);}}
    if(buffer.trim())consume(buffer);if(!full.trim())throw Object.assign(new Error('Gemini returned an empty first scene.'),{status:502});
    emit({type:'done',provider:'gemini',model:usedModel,latencyMs:Date.now()-started});res.end();
  }catch(e){if(res.headersSent){try{emit({type:'error',error:e.message||'Gemini stream failed.'});res.end();}catch{}}else throw e;}finally{clearTimeout(timeout);res.off('close',onClose);}
}
async function askGroq(system, user, temperature=0.25, maxOutputTokens=4096, options={}) {
  if (!GROQ_API_KEY) throw Object.assign(new Error('GROQ_API_KEY is missing. Add it to .env and restart the server.'), {status:503});
  const started=Date.now(), timeoutMs=options.timeoutMs||45000, controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response,raw;
  try {
    response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],temperature,max_completion_tokens:maxOutputTokens,response_format:{type:'json_object'},reasoning_effort:options.reasoningEffort||'medium'})});
    raw=await response.text();
  } catch(e) {
    if(e.name==='AbortError') throw Object.assign(new Error(`Groq request timed out after ${Math.round(timeoutMs/1000)} seconds.`),{status:504});
    throw e;
  } finally { clearTimeout(timeout); }
  if(!response.ok) throw Object.assign(new Error(`Groq API ${response.status}: ${raw.slice(0,500)}`),{status:response.status});
  const elapsed=Date.now()-started;
  let text='';
  try { const payload=JSON.parse(raw); text=payload.choices?.[0]?.message?.content||''; }
  catch { throw Object.assign(new Error('Groq returned an unreadable response.'),{status:502}); }
  text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try { const result=JSON.parse(text); Object.defineProperties(result,{_model:{value:GROQ_MODEL,enumerable:false},_provider:{value:'groq',enumerable:false},_latencyMs:{value:elapsed,enumerable:false}}); return result; }
  catch { throw Object.assign(new Error('Groq returned invalid lesson JSON. Try again or use a simpler prompt.'),{status:502}); }
}
async function askLLM(system,user,temperature=0.25,maxOutputTokens=4096,options={}) {
  return LLM_PROVIDER==='groq' ? askGroq(system,user,temperature,maxOutputTokens,options) : askGemini(system,user,temperature,maxOutputTokens,options);
}
const lessonRules = `You are NeuraLearn, a precise and friendly visual professor. Teach the learner's requested concept, level, language, and constraints. Build an adaptive storyboard using the schema below. Be accurate, explain prerequisites when needed, use examples, and make visuals concept-specific. Do not claim to run code. Keep each narration segment independently useful and connected to the previous one. ${lessonSchema}`;
const interruptRules = `You are NeuraLearn's live lesson editor. The student interrupted an ongoing animated lesson. Return ONLY one valid JSON object with exactly this top-level shape: {"acknowledgement":"one brief spoken sentence","segments":[{"narration":"one to three clear spoken sentences","visuals":[{"type":"text|line|arrow|circle|rect|formula|dot|curve","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"w":1-60,"h":1-40,"text":"short label or equation","color":"#hex","size":10-30,"delay":0-1200,"style":"rough|plain"}],"duration":1200-6000}],"strategy":"replace|append|clarify"}. Usually return only 1-2 segments and 2-5 visuals per segment; make more only when needed to answer the specific interruption. Respond to the student's actual question or instruction: explain an idea, correct a mistake, redraw or zoom in, slow down, or show an example. Do not include lesson title, overview, or checkpoint fields. Keep the active lesson context; add only new board marks and avoid repeating content already on the board; replace only when correcting/replacing the current explanation, otherwise append or clarify. When answering about lists or trees, put explicit node values inside each box/circle and show the proper pointer or branch directions. Verify facts, equations, arithmetic, signs, and units. Never use white or near-white visual colors; choose a visible color. JSON only, no markdown or text outside the object.`;
async function route(req,res) {
  const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
  if (req.method==='OPTIONS') { res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); return res.end(); }
  if (url.pathname==='/api/health') return send(res,200,{ok:true,provider:LLM_PROVIDER,model:ACTIVE_MODEL,apiKeyConfigured:!!ACTIVE_KEY,chatProvider:'groq',chatModel:GROQ_CHAT_MODEL,chatApiKeyConfigured:!!GROQ_API_KEY});
  if (req.method==='POST' && url.pathname==='/api/chat') {
    if(!GROQ_API_KEY)return send(res,503,{error:'GROQ_API_KEY is missing. Add it to .env and restart the local server.'});
    let body;try{body=await readBody(req)}catch{return send(res,400,{error:'Invalid chat request.'})}
    const incoming=Array.isArray(body.messages)?body.messages.slice(-24):[];
    const messages=[];let total=0;for(const m of incoming){if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')continue;const content=m.content.slice(0,6000);total+=content.length;if(total>30000)return send(res,413,{error:'This conversation is too long. Start a new chat to continue.'});messages.push({role:m.role,content})}
    if(!messages.length||messages[messages.length-1].role!=='user')return send(res,400,{error:'Send a question to start the chat.'});
    const system='You are NeuraLearn, a clear, friendly and accurate learning tutor. Answer the actual question directly. Explain concepts step by step when useful, use concise examples, and format longer answers with short headings and bullets. For code, give runnable code and explain important parts. Check calculations and factual claims; if uncertain, say so. Avoid filler and do not claim to have browsed or executed code.';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);const onClose=()=>{if(!res.writableEnded)controller.abort()};res.on('close',onClose);
    try{const upstream=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:GROQ_CHAT_MODEL,messages:[{role:'system',content:system},...messages],temperature:0.25,max_completion_tokens:2400,reasoning_effort:'low',stream:true})});
      if(!upstream.ok){const raw=await upstream.text();return send(res,upstream.status,{error:`Groq chat ${upstream.status}: ${raw.slice(0,420)}`})}
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='';
      const consume=line=>{const t=line.trim();if(!t.startsWith('data:'))return;const raw=t.slice(5).trim();if(!raw||raw==='[DONE]')return;let event;try{event=JSON.parse(raw)}catch{return}const text=event.choices?.[0]?.delta?.content;if(typeof text==='string'&&text)res.write(JSON.stringify({text})+'\n')};
      for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,i));buffer=buffer.slice(i+1)}}if(buffer.trim())consume(buffer);if(!res.writableEnded)res.end(JSON.stringify({done:true,model:GROQ_CHAT_MODEL})+'\n');
    }catch(e){if(res.headersSent){if(!res.writableEnded)res.end(JSON.stringify({error:e.name==='AbortError'?'Groq request timed out. Please retry.':e.message})+'\n')}else send(res,e.name==='AbortError'?504:502,{error:e.name==='AbortError'?'Groq request timed out. Please retry.':e.message||'Groq chat failed.'})}finally{clearTimeout(timeout);res.off('close',onClose)}
    return;
  }
  if (req.method==='POST' && url.pathname==='/api/lesson/first/stream') {
    if(LLM_PROVIDER!=='gemini')return send(res,503,{error:'Streaming lesson generation requires Gemini.'});
    try{const b=await readBody(req);if(!String(b.concept||'').trim())return send(res,400,{error:'Enter a concept first.'});const concept=String(b.concept).slice(0,5000),level=String(b.level||'university beginner').slice(0,100),language=String(b.language||'English').slice(0,60),preferences=String(b.preferences||'Use an intuitive visual explanation.').slice(0,500);const system=`You are NeuraLearn's ultra-fast first-frame teacher. Return ONLY valid JSON: {"title":"...","overview":"...","segments":[{"narration":"one concise opening sentence","visuals":[{"type":"text|line|arrow|circle|rect|formula|dot|curve","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"w":1-60,"h":1-40,"text":"short label or equation","color":"#hex","size":10-30,"delay":0-1200,"style":"rough|plain"}],"duration":1200-3000}]}. Produce EXACTLY ONE useful opening segment with 2-4 meaningful visual actions. Start with the core intuition, not a title card. Use coordinates that fit a 100x100 board. Keep the spoken sentence under 22 words and labels concise. Concept-specific, accurate, no decorative filler. If the request is a linked list or tree, draw a concrete small example and put each data value inside its rectangle/circle node (not only in nearby text); show linked-list prev/next arrows or tree parent/child branches clearly. Never leave data-structure nodes empty. Never use white or near-white colors for visual marks; choose a clearly visible blue, red, green, purple, orange, or dark gray. No checkpoint. JSON only.`;const prompt=`Concept/request: ${concept}\nLevel: ${level}\nLanguage: ${language}\nPreferences: ${preferences}\nCreate the first drawable teaching moment now.`;return await streamGeminiResponse(system,prompt,res,{timeoutMs:22000,maxOutputTokens:700});}catch(e){return send(res,e.status||500,{error:e.message||'First-scene stream failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson/first') {
    try {
      const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Enter a concept first.'});
      const concept=String(b.concept).slice(0,5000), level=String(b.level||'university beginner').slice(0,100), language=String(b.language||'English').slice(0,60), preferences=String(b.preferences||'Use an intuitive visual explanation.').slice(0,500);
      const fastSystem=`You are NeuraLearn's ultra-fast first-frame teacher. Return ONLY valid JSON: {"title":"...","overview":"...","segments":[{"narration":"one concise opening sentence","visuals":[{"type":"text|line|arrow|circle|rect|formula|dot|curve","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"w":1-60,"h":1-40,"text":"short label or equation","color":"#hex","size":10-30,"delay":0-1200,"style":"rough|plain"}],"duration":1200-3000}]}. Produce EXACTLY ONE useful opening segment with 2-4 meaningful visual actions. Start with the core intuition, not a title card. Use coordinates that fit a 100x100 board. Keep the spoken sentence under 22 words and labels concise. Concept-specific, accurate, no decorative filler. Never use white or near-white colors for visual marks; choose a clearly visible blue, red, green, purple, orange, or dark gray. No checkpoint. JSON only.`;
      const prompt=`Concept/request: ${concept}\nLevel: ${level}\nLanguage: ${language}\nPreferences: ${preferences}\nCreate the first drawable teaching moment now.`;
      const first=await askLLM(fastSystem,prompt,0.1,700,{thinkingLevel:'low',reasoningEffort:'low',timeoutMs:15000});
      if(!Array.isArray(first.segments)||!first.segments.length) throw Object.assign(new Error('Could not create the first teaching scene.'),{status:502});
      return send(res,200,{...first,segments:first.segments.slice(0,1),provider:first._provider||LLM_PROVIDER,model:first._model||ACTIVE_MODEL,latencyMs:first._latencyMs,partial:true});
    } catch(e){return send(res,e.status||500,{error:e.message||'First scene generation failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson/rest') {
    try {
      const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Missing lesson concept.'});
      const opening=String(b.firstNarration||'').slice(0,500);
      const prompt=`Learner request: ${String(b.concept).slice(0,5000)}\nLevel: ${String(b.level||'university beginner').slice(0,100)}\nLanguage: ${String(b.language||'English').slice(0,60)}\nPreferences: ${String(b.preferences||'Teach intuitively with visuals.').slice(0,1000)}\n${opening?`The first scene already being taught is: ${opening}`:'The short opening scene is being generated at the same time and introduces the core intuition.'}\nVisuals already on the board: ${JSON.stringify(Array.isArray(b.firstVisuals)?b.firstVisuals:[]).slice(0,2500)}\nGenerate ONLY the remaining connected lesson segments, not a duplicate opening or intuition. The learner sees one persistent slide-based canvas: later segments add only new marks, never redraw an equation, label, or diagram already established. Make each segment contribute the next distinct teaching step and place added marks in unused clear space. Adapt the number to the concept and requested depth. Return JSON with {"segments":[...],"checkpoint":null or {"question":"...","options":["...","...","..."],"answerIndex":0,"explanation":"..."}}. Choose however many remaining segments are needed for this specific topic and requested depth. Treat explicit words such as brief, overview, detailed, step by step, from zero, or deeply as strong guidance; do not use a fixed segment count. Cover the necessary teaching steps without repetition and stop when the requested scope is complete. Make this a complete connected explanation: define terms, explain why/how, show at least one checked example where useful, interpret the result, and finish with a concise takeaway. Use 2-4 natural spoken sentences per segment, with enough detail to teach rather than merely label. Give each segment 3-6 concrete visuals that accurately match the narration; include units, meaningful annotations, and labeled diagram parts. Verify every calculation, equation, direction, and causal statement. Avoid repetition and filler. JSON only.`;
      const system=`You are NeuraLearn, a precise visual professor. Continue the current lesson coherently, explaining prerequisites, mechanism, and an example where useful. ${lessonSchema}`;
      const rest=await askLLM(system,prompt,0.2,8192,{thinkingLevel:'low',reasoningEffort:'low',timeoutMs:60000});
      if(!Array.isArray(rest.segments)) throw Object.assign(new Error('The remaining lesson had no usable segments.'),{status:502});
      return send(res,200,{segments:rest.segments,checkpoint:rest.checkpoint||null,provider:rest._provider||LLM_PROVIDER,model:rest._model||ACTIVE_MODEL,latencyMs:rest._latencyMs,partial:false});
    } catch(e){return send(res,e.status||500,{error:e.message||'Remaining lesson generation failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson') {
    try { const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Enter a concept first.'});
      const prompt = `Learner request: ${String(b.concept).slice(0,5000)}\nLevel: ${String(b.level||'university beginner').slice(0,100)}\nLanguage: ${String(b.language||'English').slice(0,60)}\nPreferences: ${String(b.preferences||'Teach intuitively, with a concrete example and animated hand-drawn visuals.').slice(0,1000)}\nGenerate the lesson now.`;
      const lesson=await askLLM(lessonRules,prompt,0.25,8192,{thinkingLevel:'low',reasoningEffort:'low'}); if(!Array.isArray(lesson.segments)||!lesson.segments.length) throw Object.assign(new Error('Lesson had no usable segments.'),{status:502});
      return send(res,200,{...lesson,provider:lesson._provider||LLM_PROVIDER,model:lesson._model||ACTIVE_MODEL,latencyMs:lesson._latencyMs});
    } catch(e){ return send(res,e.status||500,{error:e.message||'Lesson generation failed.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/interrupt') {
    try { const b=await readBody(req); if(!String(b.command||'').trim()) return send(res,400,{error:'Say or type what you want changed.'});
      const context=`Original learner request: ${String(b.concept||'').slice(0,2000)}\nCurrent lesson title: ${String(b.title||'').slice(0,200)}\nRecently explained: ${String(b.recentNarration||'').slice(0,1500)}\nCurrent board marks (avoid repeating these): ${JSON.stringify(Array.isArray(b.currentVisuals)?b.currentVisuals:[]).slice(0,4000)}\nStudent command: ${String(b.command).slice(0,2000)}\nReturn a small, fast patch, usually 1-4 segments, unless the student explicitly asks for a full re-teach. Keep context and continue from here.`;
      const patch=await askLLM(interruptRules,context,0.2,2400,{thinkingLevel:'low',reasoningEffort:'low',timeoutMs:30000});
      if(!Array.isArray(patch.segments)||!patch.segments.length)throw Object.assign(new Error('Gemini returned a patch without any visual explanation. Please retry.'),{status:502});
      return send(res,200,patch);
    } catch(e){ return send(res,e.status||500,{error:e.message||'Could not adapt the lesson.'}); }
  }
  let file = url.pathname==='/' ? 'index.html' : path.normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/,'');
  const full = path.join(ROOT,file); if(!full.startsWith(ROOT)) return send(res,403,{error:'Forbidden'});
  fs.readFile(full,(err,buf)=>{ if(err) return send(res,404,'Not found','text/plain; charset=utf-8'); const ext=path.extname(full); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'}; send(res,200,buf.toString(),types[ext]||'application/octet-stream'); });
}
http.createServer((req,res)=>route(req,res).catch(e=>send(res,500,{error:e.message||'Server error'}))).listen(PORT,()=>{console.log(`NeuraLearn running at http://localhost:${PORT} (provider: ${LLM_PROVIDER}, model: ${ACTIVE_MODEL})`);if(process.env.NEURA_VIDEO_SERVER!=='0'){const child=spawn(process.execPath,[path.join(__dirname,'video-reference','launch.cjs')],{cwd:path.join(__dirname,'video-reference'),stdio:'ignore',windowsHide:true});child.on('error',e=>console.error('Video reference server failed to start:',e.message));}});
