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
function readBody(req) { return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c; if(s.length>4e7) req.destroy();}); req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch(e){reject(e);}}); req.on('error',reject);}); }
const { matchDeterministicTopic } = require('./lib/deterministic-lessons.js');

function buildGeminiUserParts(text, attachment) {
  const parts = [];
  if (attachment && attachment.data && attachment.mimeType) {
    const cleanData = String(attachment.data).replace(/^data:[^;]+;base64,/, '').trim();
    if (cleanData) {
      parts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: cleanData
        }
      });
    }
  }
  parts.push({ text: String(text || 'Analyze and solve this question with an animated whiteboard lesson, including textbook-grade diagrams, Free Body Diagrams (FBD), and step-by-step equations.') });
  return parts;
}

const lessonSchema = `Return ONLY valid JSON with this shape:
{
  "title": "short, clear title",
  "overview": "one sentence overview",
  "topic": "Roadmap: Step 1 → Step 2 → Step 3 → Summary",
  "viewBox": "0 0 960 700",
  "segments": [
    {
      "heading": "Clear teaching objective for this segment",
      "narration": "One to three natural, spoken sentences explaining this step directly.",
      "duration": 2500-6000,
      "actions": [
        {
          "op": "draw_path|draw_rect|draw_circle|draw_arrow|draw_text|draw_formula|flow|highlight|reveal",
          "id": "uniqueId",
          "d": "SVG path commands like M... C... Q... L... Z",
          "x": 0-960, "y": 0-700,
          "width": 10-600, "height": 10-400,
          "x1": 0-960, "y1": 0-700, "x2": 0-960, "y2": 0-700,
          "cx": 0-960, "cy": 0-700, "r": 5-150,
          "stroke": "#hex", "strokeWidth": 1-8,
          "fill": "none|#hex", "opacity": 0.0-1.0,
          "text": "concise label, equation or value",
          "label": "arrow label or force badge (e.g. N = 20 N, T = 13.3 N)",
          "fontSize": 12-28, "fontWeight": "normal|bold|600|700",
          "anchor": "start|middle|end", "color": "#hex",
          "duration": 400-2000, "delay": 0-1500,
          "arrowEnd": true, "pulse": true
        }
      ]
    }
  ],
  "checkpoint": {
    "question": "One concise multiple-choice question testing understanding of this lesson",
    "options": ["A", "B", "C", "D"],
    "answerIndex": 0,
    "explanation": "Brief explanation of the correct choice."
  }
}
Choose the number of segments dynamically based on topic complexity (typically 4-10 segments). Accuracy is mandatory: verify equations, units, arithmetic, signs, and causal statements. The whiteboard persists between segments: subsequent segments add new elements or transform established ones; do not redraw the entire board every segment. Use visible, rich colors: deep slate (#22262b), bright blue (#2b72b8), crimson red (#c93d32), forest green (#2ea44f), warm amber (#e3a83e), purple (#8252a1). Never use white or light yellow strokes on the white board. For paths, provide smooth SVG bezier curves (C, Q, L) that can be drawn with stroke-reveal animations. For processes, use flow markers moving between stages. Output pure JSON without markdown fences.

PHYSICS & FREE BODY DIAGRAM (FBD) RULES:
When teaching mechanics, pulleys, connected blocks, or inclined planes (e.g. JEE/NEET physics or uploaded question images/PDFs):
1. PHYSICAL SETUP: Draw the table surface or incline first with ground hatching marks. Draw pulleys as circles with center axle pins. Draw strings taut between bodies.
2. BLOCKS: Render blocks as clean rectangles with mass labels inside (e.g. 'm₁ = 2 kg', 'm₂ = 4 kg').
3. FORCES & FBD: Always anchor force vectors directly to the block edges/center.
   - Gravity: downward arrow labeled 'm·g'
   - Normal force: upward arrow labeled 'N'
   - Tension: arrow along the string labeled 'T'
   - Friction: arrow opposing motion labeled 'f = μ·N'
   - External forces: arrow in the specified direction with label (e.g. 'F').
   - NEVER emit detached or unlabeled arrows. Give every arrow a descriptive label (e.g. label: "N", label: "T").
4. RESOLVED COMPONENTS: On inclined planes, resolve gravity into dashed perpendicular component (mg·cos θ) and parallel component (mg·sin θ).
5. EQUATIONS & NEWTON'S 2ND LAW:
   - State Newton's 2nd law for each body: (e.g. 'For 2m: 2m·g - T = 2m·a' and 'For m: T - m·g·sin θ - F·cos θ = m·a').
   - Double check algebraic operations: when adding equations, verify coefficients (e.g. 2mg - mg·sin θ = 3ma, NOT mg!).
6. FULL QUESTION RESOLUTION (MANDATORY):
   - Solve for ALL quantities requested in the problem! If the question asks for BOTH acceleration 'a' AND tension 'T', you MUST derive BOTH 'a' and 'T' step-by-step. Never stop after solving for only one variable!
7. MULTIPLE-CHOICE QUESTION MATCHING & SOLUTION CARD (MANDATORY):
   - When the question contains multiple-choice options ((A), (B), (C), (D)), identify all options.
   - In the final segment, evaluate your derived quantities against the options, determine the exact matching option (e.g. Option (A)), and render a prominent green Solution Box on the whiteboard:
     * Card background: op: 'draw_rect', x: 480, y: 610, width: 440, height: 75, stroke: '#2ea44f', strokeWidth: 2, fill: '#f0fdf4'
     * Card title: op: 'draw_text', text: '✓ Correct Answer: Option (A)', x: 500, y: 638, fontSize: 18, fontWeight: 'bold', color: '#1c7430'
     * Card values: op: 'draw_formula', text: 'a = g/3,  T = 4mg/3', x: 500, y: 668, fontSize: 16, color: '#1c7430'
8. CANVAS LAYOUT ZONES & ANTI-COLLISION (VIEWBOX 0 0 960 700):
   - DIAGRAM ZONE (Y: 60 - 450, X: 60 - 900): Incline, blocks, pulleys, force arrows.
   - EQUATIONS ZONE (Y: 480 - 600, X: 60 - 460): Row 1 (y: 500), Row 2 (y: 540), Row 3 (y: 580).
   - SOLUTION & BOX ZONE (Y: 480 - 685, X: 480 - 930): Row 1 (y: 500), Row 2 (y: 540), Row 3 (y: 580), Solution Card (y: 610 - 685).
   - Maintain at least 35px vertical separation between text elements. NEVER place text elements at the exact same or overlapping coordinates!`;

function parseModelJson(text){const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(clean)}catch{}const start=clean.indexOf('{');if(start<0)throw new Error('no JSON object');let depth=0,inString=false,escaped=false;for(let i=start;i<clean.length;i++){const c=clean[i];if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue}if(c==='"'){inString=true;continue}if(c==='{')depth++;else if(c==='}'&&--depth===0){return JSON.parse(clean.slice(start,i+1))}}throw new Error('incomplete JSON object')}
async function askGemini(system, user, temperature=0.25, maxOutputTokens=4096, options={}) {
  if (!API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is missing. Add it to your environment or .env setup.'), {status:503});
  const generationConfig={maxOutputTokens, responseMimeType:'application/json', thinkingConfig:{thinkingLevel:options.thinkingLevel||'low'}};
  const userParts = buildGeminiUserParts(user, options.attachment);
  const models=[...new Set([MODEL,'gemini-flash-lite-latest','gemini-flash-latest','gemini-3.5-flash','gemini-3.8-flash'])];
  let response,raw,usedModel=MODEL;
  for(const model of models){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),options.timeoutMs||45000);
    try { response=await fetch(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:userParts}],generationConfig})}); raw=await response.text(); }
    catch(e) { if(e.name==='AbortError') throw Object.assign(new Error(`Gemini request timed out after ${Math.round((options.timeoutMs||45000)/1000)} seconds. Check model access, API quota, and network.`),{status:504}); throw e; }
    finally { clearTimeout(timeout); }
    if(response.ok){usedModel=model;break}
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
  const userParts = buildGeminiUserParts(user, options.attachment);
  const models=[...new Set([MODEL,'gemini-flash-lite-latest','gemini-flash-latest','gemini-3.5-flash','gemini-3.8-flash'])],controller=new AbortController(),timeoutMs=options.timeoutMs||30000;
  const timeout=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();let upstream=null,usedModel=MODEL,lastError='';
  const onClose=()=>{if(!res.writableEnded)controller.abort()};res.on('close',onClose);
  const emit=event=>res.write(JSON.stringify(event)+'\n');
  try {
    for(const model of models){
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(API_KEY)}`;
      try{upstream=await fetch(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:userParts}],generationConfig:{temperature:0.1,maxOutputTokens:options.maxOutputTokens||1400,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}})})}catch(e){if(e.name==='AbortError')throw Object.assign(new Error(`Gemini first-scene request timed out after ${Math.round(timeoutMs/1000)} seconds.`),{status:504});throw e;}
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
  if (options.attachment && options.attachment.mimeType === 'application/pdf' && API_KEY) {
    return askGemini(system, user, temperature, maxOutputTokens, options);
  }
  if (!GROQ_API_KEY) throw Object.assign(new Error('GROQ_API_KEY is missing. Add it to .env and restart the server.'), {status:503});
  const started=Date.now(), timeoutMs=options.timeoutMs||45000, controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response,raw;

  let userContent = user;
  if (options.attachment && options.attachment.data && options.attachment.mimeType?.startsWith('image/')) {
    const cleanData = String(options.attachment.data).replace(/^data:[^;]+;base64,/, '').trim();
    userContent = [
      { type: 'text', text: user },
      { type: 'image_url', image_url: { url: `data:${options.attachment.mimeType};base64,${cleanData}` } }
    ];
  }

  try {
    response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:system},{role:'user',content:userContent}],temperature,max_completion_tokens:maxOutputTokens,response_format:{type:'json_object'},reasoning_effort:options.reasoningEffort||'medium'})});
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
const lessonRules = `You are NeuraLearn, an expert AI whiteboard professor. Teach the learner's requested concept, level, language, and constraints by progressively drawing and annotating an SVG diagram. Be accurate, explain prerequisites when needed, use examples, and make visuals concept-specific. Return valid JSON only. ${lessonSchema}`;
const interruptRules = `You are NeuraLearn's live whiteboard lesson editor. The student interrupted an ongoing animated lesson with a question or request. Return ONLY one valid JSON object with exactly this shape:
{
  "acknowledgement": "one brief spoken sentence answering or clarifying the student's question",
  "segments": [
    {
      "heading": "Focused clarification or zoom-in",
      "narration": "one to three clear spoken sentences directly answering the question",
      "duration": 3000-5000,
      "actions": [
        {
          "op": "draw_path|draw_rect|draw_circle|draw_arrow|draw_text|draw_formula|flow|highlight|reveal",
          "id": "patchId",
          "d": "...",
          "x": 0-960, "y": 0-700,
          "x1": 0-960, "y1": 0-700, "x2": 0-960, "y2": 0-700,
          "cx": 0-960, "cy": 0-700, "r": 5-80,
          "stroke": "#hex", "strokeWidth": 1-5,
          "fill": "none|#hex",
          "text": "short annotation or label",
          "fontSize": 14-22, "fontWeight": "bold",
          "color": "#hex", "duration": 800, "delay": 200, "arrowEnd": true
        }
      ]
    }
  ],
  "strategy": "append|clarify|replace"
}
Usually return 1-2 segments and 2-5 drawing actions per segment. Keep the active lesson context and add only new board marks to clarify the student's question; do not wipe existing marks unless explicitly asked to redraw. JSON only, no markdown.`;

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
    try{
      const b=await readBody(req);if(!String(b.concept||'').trim())return send(res,400,{error:'Enter a concept first.'});
      const concept=String(b.concept).slice(0,5000);
      const hasAttachment = !!(b.attachment && b.attachment.data);
      const deterministic = !hasAttachment ? await matchDeterministicTopic(concept, hasAttachment) : null;
      if (deterministic) {
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
        const first = { ...deterministic, segments: deterministic.segments.slice(0,1), provider:'deterministic', model:'tracers', latencyMs:15, partial:true };
        res.write(JSON.stringify({type:'delta', text: JSON.stringify(first)}) + '\n');
        res.write(JSON.stringify({type:'done', provider:'deterministic', model:'tracers', latencyMs:15}) + '\n');
        return res.end();
      }
      if(LLM_PROVIDER!=='gemini')return send(res,503,{error:'Streaming lesson generation requires Gemini.'});
      const level=String(b.level||'university beginner').slice(0,100),language=String(b.language||'English').slice(0,60),preferences=String(b.preferences||'Use an intuitive visual explanation.').slice(0,500);
      const system = hasAttachment
        ? `You are NeuraLearn's vision-equipped AI whiteboard professor. The student uploaded an image or document containing a specific question or diagram. Look at the image carefully. Identify the EXACT problem, scenario, objects, numbers, and diagram shown in the image. Do NOT show a generic textbook example—draw the SPECIFIC diagram for this image! Return ONLY valid JSON: {"title":"Title of this specific problem","overview":"one concise overview sentence","topic":"Roadmap: Setup → Analysis → Equations → Solution","viewBox":"0 0 960 700","segments":[{"heading":"Problem Setup from Image","narration":"one concise opening sentence under 25 words identifying what is given in the uploaded image","duration":2800,"actions":[{"op":"draw_path|draw_rect|draw_circle|draw_arrow|draw_text|draw_formula","id":"elem1","d":"...","x":100-800,"y":100-600,"text":"...","stroke":"#2b72b8","strokeWidth":3,"fill":"none","color":"#22262b","delay":200}]}]}. Produce EXACTLY ONE opening scene establishing the physical setup or diagram for the attached image question. Visible colors only. Pure JSON.`
        : `You are NeuraLearn's ultra-fast first-frame whiteboard teacher. Return ONLY valid JSON: {"title":"...","overview":"...","topic":"...","viewBox":"0 0 960 700","segments":[{"heading":"Opening intuition","narration":"one concise opening sentence under 25 words","duration":2500,"actions":[{"op":"draw_path|draw_rect|draw_circle|draw_arrow|draw_text","id":"elem1","d":"...","x":100-800,"y":100-600,"text":"...","stroke":"#2b72b8","strokeWidth":3,"fill":"none","color":"#22262b","delay":200}]}]}. Produce EXACTLY ONE useful opening segment with 2-4 meaningful visual actions. Start with the core concept intuition, not a blank screen. Coordinates fit a 960x700 viewBox. Visible colors only (never white strokes). Pure JSON only.`;
      const prompt = hasAttachment
        ? `Question / Request: ${concept}\nExamine the attached image or document closely. Extract the specific given values, bodies, and setup from the image, and start drawing the first scene now.`
        : `Concept/request: ${concept}\nLevel: ${level}\nLanguage: ${language}\nPreferences: ${preferences}\nCreate the first drawable teaching moment now.`;
      return await streamGeminiResponse(system,prompt,res,{timeoutMs:35000,maxOutputTokens:1400,attachment:b.attachment});
    }catch(e){return send(res,e.status||500,{error:e.message||'First-scene stream failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson/first') {
    try {
      const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Enter a concept first.'});
      const concept=String(b.concept).slice(0,5000);
      const hasAttachment = !!(b.attachment && b.attachment.data);
      const deterministic = !hasAttachment ? await matchDeterministicTopic(concept, hasAttachment) : null;
      if (deterministic) {
        return send(res,200,{...deterministic,segments:deterministic.segments.slice(0,1),provider:'deterministic',model:'tracers',latencyMs:15,partial:true});
      }
      const level=String(b.level||'university beginner').slice(0,100), language=String(b.language||'English').slice(0,60), preferences=String(b.preferences||'Use an intuitive visual explanation.').slice(0,500);
      const fastSystem = hasAttachment
        ? `You are NeuraLearn's vision-equipped AI whiteboard professor. The student uploaded an image or document containing a specific question or diagram. Look at the image carefully. Identify the EXACT problem, scenario, objects, numbers, and diagram shown in the image. Do NOT show a generic textbook example—draw the SPECIFIC diagram for this image! Return ONLY valid JSON: {"title":"Title of this specific problem","overview":"one concise overview sentence","topic":"Roadmap: Setup → Analysis → Equations → Solution","viewBox":"0 0 960 700","segments":[{"heading":"Problem Setup from Image","narration":"one concise opening sentence under 25 words identifying what is given in the uploaded image","duration":2800,"actions":[{"op":"draw_path|draw_rect|draw_circle|draw_arrow|draw_text|draw_formula","id":"elem1","d":"...","x":100-800,"y":100-600,"text":"...","stroke":"#2b72b8","strokeWidth":3,"fill":"none","color":"#22262b","delay":200}]}]}. Produce EXACTLY ONE opening scene establishing the physical setup or diagram for the attached image question. Visible colors only. Pure JSON.`
        : `You are NeuraLearn's ultra-fast first-frame whiteboard teacher. Return ONLY valid JSON: {"title":"...","overview":"...","topic":"...","viewBox":"0 0 960 700","segments":[{"heading":"Opening intuition","narration":"one concise opening sentence under 25 words","duration":2500,"actions":[{"op":"draw_path|draw_rect|draw_circle|draw_arrow|draw_text","id":"elem1","d":"...","x":100-800,"y":100-600,"text":"...","stroke":"#2b72b8","strokeWidth":3,"fill":"none","color":"#22262b","delay":200}]}]}. Produce EXACTLY ONE useful opening segment with 2-4 meaningful visual actions. Start with the core concept intuition, not a blank screen. Coordinates fit a 960x700 viewBox. Visible colors only (never white strokes). Pure JSON only.`;
      const prompt = hasAttachment
        ? `Question / Request: ${concept}\nExamine the attached image or document closely. Extract the specific given values, bodies, and setup from the image, and start drawing the first scene now.`
        : `Concept/request: ${concept}\nLevel: ${level}\nLanguage: ${language}\nPreferences: ${preferences}\nCreate the first drawable teaching moment now.`;
      const first=await askLLM(fastSystem,prompt,0.1,1400,{thinkingLevel:'low',reasoningEffort:'low',timeoutMs:25000,attachment:b.attachment});
      if(!Array.isArray(first.segments)||!first.segments.length) throw Object.assign(new Error('Could not create the first teaching scene.'),{status:502});
      return send(res,200,{...first,segments:first.segments.slice(0,1),provider:first._provider||LLM_PROVIDER,model:first._model||ACTIVE_MODEL,latencyMs:first._latencyMs,partial:true});
    } catch(e){return send(res,e.status||500,{error:e.message||'First scene generation failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson/rest') {
    try {
      const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Missing lesson concept.'});
      const concept=String(b.concept).slice(0,5000);
      const hasAttachment = !!(b.attachment && b.attachment.data);
      const deterministic = !hasAttachment ? await matchDeterministicTopic(concept, hasAttachment) : null;
      if (deterministic) {
        return send(res,200,{segments:deterministic.segments.slice(1),checkpoint:deterministic.checkpoint,provider:'deterministic',model:'tracers',latencyMs:10,partial:false});
      }
      const opening=String(b.firstNarration||'').slice(0,500);
      const prompt = hasAttachment
        ? `The learner uploaded an image question: ${concept}.\nThe first scene already drawn from the image is: ${opening}.\nExisting board marks: ${JSON.stringify(Array.isArray(b.firstActions)?b.firstActions:b.firstVisuals||[]).slice(0,2500)}.\nNow solve the remaining steps for THIS SPECIFIC image problem.
1. Draw Free Body Diagrams with labeled arrows for every force acting on each mass.
2. Set up Newton's second law equations for each mass. Verify signs and coefficients carefully (e.g. sum of masses).
3. FULL PROBLEM RESOLUTION: Solve for ALL quantities asked (e.g. BOTH acceleration 'a' AND tension 'T').
4. MULTIPLE CHOICE RESOLUTION: If the image has options (A, B, C, D), evaluate which option matches, and in the final segment draw a highlighted Solution Box:
   - rect: x: 480, y: 610, width: 440, height: 75, stroke: '#2ea44f', fill: '#f0fdf4'
   - text: '✓ Correct Answer: Option (X)' at x: 500, y: 638, fontSize: 18, fontWeight: 'bold', color: '#1c7430'
   - formula: derived values at x: 500, y: 668, fontSize: 16, color: '#1c7430'
5. LAYOUT: Separate lines vertically by at least 35px in Y: 480-685. Do not overlap coordinates. Return JSON with {"segments":[...],"checkpoint":{...}}. JSON only.`
        : `Learner request: ${concept}\nLevel: ${String(b.level||'university beginner').slice(0,100)}\nLanguage: ${String(b.language||'English').slice(0,60)}\nPreferences: ${String(b.preferences||'Teach intuitively with animated whiteboard drawings.').slice(0,1000)}\n${opening?`The first scene already being taught is: ${opening}`:'The opening scene is already being taught.'}\nActions already on the board: ${JSON.stringify(Array.isArray(b.firstActions)?b.firstActions:b.firstVisuals||[]).slice(0,2500)}\nGenerate ONLY the remaining connected lesson segments, not a duplicate opening. Build a progressive whiteboard composition in viewBox 0 0 960 700. Add new elements to vacant space or highlight existing ones. Return JSON with {"segments":[...],"checkpoint":{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}}. Use 4-8 remaining segments. Give each segment 3-6 purposeful actions. JSON only.`;
      const system=`You are NeuraLearn, a precise visual professor creating an animated SVG whiteboard lesson. ${lessonSchema}`;
      const rest=await askLLM(system,prompt,0.2,8192,{thinkingLevel:'low',reasoningEffort:'low',timeoutMs:60000,attachment:b.attachment});
      if(!Array.isArray(rest.segments)) throw Object.assign(new Error('The remaining lesson had no usable segments.'),{status:502});
      return send(res,200,{segments:rest.segments,checkpoint:rest.checkpoint||null,provider:rest._provider||LLM_PROVIDER,model:rest._model||ACTIVE_MODEL,latencyMs:rest._latencyMs,partial:false});
    } catch(e){return send(res,e.status||500,{error:e.message||'Remaining lesson generation failed.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/lesson') {
    try {
      const b=await readBody(req); if(!String(b.concept||'').trim()) return send(res,400,{error:'Enter a concept first.'});
      const concept=String(b.concept).slice(0,5000);
      const hasAttachment = !!(b.attachment && b.attachment.data);
      const deterministic = !hasAttachment ? await matchDeterministicTopic(concept, hasAttachment) : null;
      if (deterministic) {
        return send(res,200,{...deterministic,provider:'deterministic',model:'tracers',latencyMs:15});
      }
      const prompt = hasAttachment
        ? `Carefully inspect the attached image or document question: ${concept}
1. Transcribe the exact question, all given values, masses, angles, applied forces, and any multiple-choice options (A), (B), (C), (D) shown in the image.
2. Draw the exact physical setup and Free Body Diagrams with clearly labeled force vectors.
3. Formulate Newton's second law for each body along its direction of motion.
4. FULL SOLUTION: Solve for ALL variables asked in the question (e.g. if the question asks for acceleration AND tension, calculate both 'a' and 'T' step-by-step with complete mathematical derivation).
5. OPTION EVALUATION & SOLUTION CARD: Explicitly match the derived solution against the question's options (A, B, C, D) and conclude the lesson with a prominent highlighted Solution Box stating '✓ Correct Answer: Option (X)' with the exact matching values.
6. LAYOUT: Keep diagram elements in Y: 60-450, and equations in Y: 480-685 with distinct non-overlapping coordinates.`
        : `Learner request: ${concept}\nLevel: ${String(b.level||'university beginner').slice(0,100)}\nLanguage: ${String(b.language||'English').slice(0,60)}\nPreferences: ${String(b.preferences||'Teach intuitively, with concrete examples and animated whiteboard SVG drawings.').slice(0,1000)}\nGenerate the lesson now.`;
      const lesson=await askLLM(lessonRules,prompt,0.25,8192,{thinkingLevel:'low',reasoningEffort:'low',attachment:b.attachment}); if(!Array.isArray(lesson.segments)||!lesson.segments.length) throw Object.assign(new Error('Lesson had no usable segments.'),{status:502});
      return send(res,200,{...lesson,provider:lesson._provider||LLM_PROVIDER,model:lesson._model||ACTIVE_MODEL,latencyMs:lesson._latencyMs});
    } catch(e){ return send(res,e.status||500,{error:e.message||'Lesson generation failed.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/interrupt') {
    try {
      const b=await readBody(req); if(!String(b.command||'').trim()) return send(res,400,{error:'Say or type what you want changed.'});
      const context=`Original learner request: ${String(b.concept||'').slice(0,2000)}\nCurrent lesson title: ${String(b.title||'').slice(0,200)}\nRecently explained: ${String(b.recentNarration||'').slice(0,1500)}\nCurrent board marks (avoid repeating these): ${JSON.stringify(Array.isArray(b.currentVisuals)?b.currentVisuals:[]).slice(0,4000)}\nStudent command: ${String(b.command).slice(0,2000)}\nReturn a small, fast patch, usually 1-3 segments with whiteboard drawing actions, answering the student's question.`;
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
