const $ = id => document.getElementById(id);
const state = { lineRun:0, subLine:null, tsubWords:[], tsubEnds:[], lesson:null, mode:'legacy', index:0, beatIndex:0, playing:false, paused:false, runId:0, speech:null, timer:null, startedAt:0, remainingMs:0, voiceAvailable:('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window), voices:[], codeHtml:'', autoPlay:false, lastBeatAt:0, pendingSeek:null, watchdog:null, playSentAt:0, lessonLoadId:0, postedBeats:null, lastChatScene:-1, explainBubble:null, explainLoad:-1, lineNo:0, vizParts:[], vizNext:0, vizIndex:-1, vizBusy:false, vizEpoch:0, vizPendingAdvance:false, chatHistory:[], lastQ:'', pdfChunks:null, pdfTitle:'', pdfParsing:false, pdfError:'', stalls:0, sentSpans:null, sentIdx:0, postedPartText:-1 };
const palette = ['#2f63e9','#0e9b78','#db8b24','#8c5be8','#dc5474','#0e91b5'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chatStatus(t){ const s=$('chatStatus'); if(s) s.textContent=t; }
function addChat(role, text){
  const box=$('chatThread'); if(!box) return null;
  const div=document.createElement('div');
  div.className='chatmsg '+role; div.textContent=String(text ?? '');
  box.append(div); box.scrollTop=box.scrollHeight;
  return div;
}
function clearChat(text){
  const box=$('chatThread'); if(!box) return;
  box.replaceChildren();
  addChat('bot', text || 'New explanation starting…');
}
function mdInline(s){ return esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+?)`/g,'<code>$1</code>'); }
function splitSentences(t){
  return (String(t||'').replace(/\r/g,'').split(/\n\s*\n/).join('\n').match(/[^.!?\n]+[.!?]+(?:\*\*|["'])?|\n+/g)||[String(t||'')])
    .map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s && !/^\n+$/.test(s));
}
function mdSentences(text){
  return splitSentences(text).map(s=>`<span class="sent">${mdInline(s)}</span>`).join(' ');
}
function mdRender(src){
  const lines=String(src||'').replace(/\r/g,'').split('\n');
  let html='',i=0,inFence=false;const fence=[];
  const isFence=l=>/^```/.test(l.trim()), isTable=l=>/^\|.*\|\s*$/.test(l.trim());
  const isHead=l=>/^#{1,4}\s+/.test(l.trim()), isNum=l=>/^\d+[.)]\s+/.test(l.trim()), isBul=l=>/^[-*]\s+/.test(l.trim());
  while(i<lines.length){
    const t=lines[i].trim();
    if(isFence(t)){ if(inFence){html+=`<pre class="codeblock"><code>${esc(fence.join('\n'))}</code></pre>`;fence.length=0;} inFence=!inFence; i++; continue; }
    if(inFence){ fence.push(lines[i]); i++; continue; }
    if(!t){ i++; continue; }
    if(isTable(t)){
      const rows=[];
      while(i<lines.length&&isTable(lines[i])){rows.push(lines[i].trim().split('|').slice(1,-1).map(c=>c.trim()));i++;}
      const head=rows.length>1&&rows[1].every(c=>/^:?-{2,}:?$/.test(c));
      const body=head?rows.filter((_,ri)=>ri!==1):rows;
      html+='<table class="mdtable">'+body.map((r,ri)=>`<tr>${r.map(c=>((ri===0&&head)?`<th>${mdInline(c)}</th>`:`<td>${mdInline(c)}</td>`)).join('')}</tr>`).join('')+'</table>';
      continue;
    }
    let m=t.match(/^(#{1,4})\s+(.*)/);
    if(m){ html+=`<div class="mdh">${mdInline(m[2])}</div>`; i++; continue; }
    m=t.match(/^(\d+)[.)]\s+(.*)/);
    if(m){ html+=`<div class="mdstep"><span class="mdnum">${m[1]}</span><span>${mdSentences(m[2])}</span></div>`; i++; continue; }
    m=t.match(/^[-*]\s+(.*)/);
    if(m){ html+=`<div class="mdbullet">• <span>${mdSentences(m[1])}</span></div>`; i++; continue; }
    const para=[];
    while(i<lines.length){const u=lines[i].trim();if(!u||isFence(u)||isTable(u)||isHead(u)||isNum(u)||isBul(u))break;para.push(u);i++;}
    html+=`<p class="mdp">${mdSentences(para.join(' '))}</p>`;
  }
  if(inFence&&fence.length)html+=`<pre class="codeblock"><code>${esc(fence.join('\n'))}</code></pre>`;
  return html;
}
// Posts the full explanation at once (ChatGPT-style markdown) with highlightable lines.
function postTextSentences(text){
  const box=$('chatThread'); if(!box) return [];
  const div=document.createElement('div');
  div.className='chatmsg bot flowing';
  div.innerHTML=mdRender(text)||esc(String(text||''));
  box.append(div); box.scrollTop=box.scrollHeight;
  state.sentSpans=Array.from(div.querySelectorAll('.sent')); state.sentIdx=0;
  return state.sentSpans;
}
// Lights up the explanation line currently being spoken, in order.
function highlightSentence(narration){
  if(!state.sentSpans||!state.sentSpans.length) return;
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const n=norm(narration); if(!n) return;
  const nwords=n.split(' ');
  let best=-1,bestScore=0;
  for(let i=state.sentIdx||0;i<state.sentSpans.length;i++){
    const wset=new Set(norm(state.sentSpans[i].textContent).split(' '));
    const hit=nwords.filter(w=>wset.has(w)).length;
    const score=hit/Math.max(1,nwords.length);
    if(score>bestScore){bestScore=score;best=i;}
    if(score>0.6) break;
  }
  if(best>=0&&bestScore>0.25){
    state.sentSpans.forEach(sp=>sp.classList.remove('speaking'));
    state.sentSpans[best].classList.add('speaking'); state.sentIdx=best+1;
    try{state.sentSpans[best].scrollIntoView({block:'nearest'});}catch{}
  }
}
// ---- PDF upload: parsed instantly in-browser, explained section by section ----
function pdfStatus(t){ const s=$('pdfStatus'); if(s) s.textContent=t; }
async function ensurePdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res,rej)=>{ const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload=res; s.onerror=()=>rej(new Error('Could not load the PDF reader from CDN (internet needed).'));
    document.head.append(s); });
  const lib=window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  return lib;
}
function chunkPages(pages, target=1200){
  const chunks=[]; let cur={texts:[],words:0,start:1};
  pages.forEach((t,idx)=>{
    if(cur.words>0&&cur.words+t.words>target){
      chunks.push({text:cur.texts.join('\n\n'),pages:cur.start===idx?`${cur.start}`:`${cur.start}–${idx}`});
      cur={texts:[],words:0,start:idx+1};
    }
    cur.texts.push(t.text);cur.words+=t.words;
  });
  if(cur.texts.length)chunks.push({text:cur.texts.join('\n\n'),pages:cur.start===pages.length?`${cur.start}`:`${cur.start}–${pages.length}`});
  return chunks;
}
// Even sampling of the WHOLE document for the up-front summary — tiny excerpts
// from start/middle/end so the AI summarizes the whole doc, not just page 1.
// Server caps source at 20000 chars; stay under it.
function docSummarySource(chunks){
  const budget=18000;
  const all=chunks.map(c=>c.text).join('\n\n');
  if(all.length<=budget) return all;
  const per=Math.floor(budget/chunks.length);
  if(per>=200) return chunks.map(c=>`(pp. ${c.pages}) ${c.text.slice(0,per)}`).join('\n\n').slice(0,budget);
  // Very long document: spread a fixed number of chunks evenly across it.
  const take=Math.max(1,Math.floor(budget/1600));
  const step=chunks.length/take;
  const picked=[]; for(let i=0;i<take;i++) picked.push(chunks[Math.floor(i*step)]);
  const each=Math.max(200,Math.floor(budget/picked.length));
  return picked.map(c=>`(pp. ${c.pages}) ${c.text.slice(0,each)}`).join('\n\n').slice(0,budget);
}
async function handlePdfFile(file){
  state.pdfChunks=null;state.pdfTitle='';state.pdfParsing=false;state.pdfError='';
  if(!file){ pdfStatus('No PDF attached. Attach one and the video is built from it section by section — total length follows the document.'); return; }
  if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){ state.pdfError='not a .pdf file'; pdfStatus('That is not a PDF — pick a .pdf file.'); return; }
  if(file.size>40*1024*1024){ state.pdfError='over 40MB'; pdfStatus('PDF is over 40MB — pick a smaller file.'); return; }
  state.pdfParsing=true;
  pdfStatus(`Reading “${file.name}”… do not hit Generate until it says ready.`);
  try{
    const lib=await ensurePdfJs();
    const buf=await file.arrayBuffer();
    const pdf=await lib.getDocument({data:buf}).promise;
    const pages=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      const text=tc.items.map(it=>it.str+(it.hasEOL?'\n':' ')).join('').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      pages.push({text,words:text?text.split(/\s+/).filter(Boolean).length:0});
      if(p%10===0||p===pdf.numPages)pdfStatus(`Reading “${file.name}”… page ${p}/${pdf.numPages} — wait for ready.`);
    }
    let totalWords=pages.reduce((n,pg)=>n+pg.words,0);
    // A scanned PDF (photos of pages) has no text layer: read the pages with Gemini instead.
    if(!totalWords&&!$('instantToggle')?.checked){ totalWords=await readScannedPages(pdf,pages,file.name); }
    if(!totalWords){ state.pdfError='no extractable text (scanned images?)'; pdfStatus(`“${file.name}” has ${pdf.numPages} pages but no readable text${$('instantToggle')?.checked?' (scanned pages are read with AI, which is off in Instant mode)':''}. Remove the file or pick another.`); return; }
    const perPage=Math.round(totalWords/pdf.numPages);
    const dense=perPage>3000?` — unusually dense text (${perPage.toLocaleString()} words/page); check the file looks right.`:'';
    const chunks=chunkPages(pages,800).map(c=>({text:c.text.slice(0,12000),pages:c.pages}));
    state.pdfChunks=chunks;state.pdfTitle=file.name.replace(/\.pdf$/i,'');
    const n=chunks.length;
    pdfStatus(`“${file.name}” ready — ${pdf.numPages} pages · ~${totalWords.toLocaleString()} words → ${n} sections. AI is writing the full-document summary — visuals start after it appears.`);
    addChat('bot',`PDF attached: “${state.pdfTitle}” — ${n} sections. AI is writing a full-document summary first; visuals start only once it appears. Ask anything meanwhile and it jumps the queue.`);
    startThinking(); chatStatus('Writing full-document summary…');
    let summary=null, summaryErr='';
    try{
      const exp=await api('/api/explain',{
        topic:`Full-document summary of “${state.pdfTitle}”`.slice(0,500),
        source:docSummarySource(chunks),
        level:'Undergraduate engineering; explain from fundamentals and build to rigorous understanding'
      },120000);
      summary=String(exp&&exp.explanation||'').trim();
    }catch(e){ summaryErr=(e&&e.message)||'request failed'; }
    stopThinking();
    if(summary){
      postTextSentences(summary);
      state.chatHistory.push({q:`Summarize the uploaded document “${state.pdfTitle}”`.slice(0,300),a:summary});
      pdfStatus(`“${file.name}” ready — summary above; drawing the ${n} sections as visuals now.`);
    }else{
      addChat('bot',`Full-document summary failed (${summaryErr||'no response'}) — showing raw Section 1 text instead; visuals start now.`);
      postTextSentences(chunks[0].text);
      state.postedPartText=0;
      pdfStatus(`“${file.name}” ready — summary unavailable; raw Section 1 text above, visuals starting.`);
    }
    const group={title:state.pdfTitle,kind:'doc',explanation:summary||'',complete:true};
    chunks.forEach((c,i)=>state.vizParts.push({title:`${state.pdfTitle} — Section ${i+1}/${n} (p.${c.pages})`,kind:'doc',text:c.text,pages:c.pages,el:null,html:null,ready:false,model:'',group}));
    pumpViz();
  }catch(e){ state.pdfError=e.message||'read failed'; pdfStatus(`Could not read that PDF: ${state.pdfError} — remove the file or pick another.`); }
  finally{ state.pdfParsing=false; }
}
// Scanned PDFs: each page is drawn to an image in the browser and sent to
// /api/ocr, which transcribes it with Gemini. At most OCR_PAGES pages, two at
// a time. Fills pages[] in place and returns the word count.
const OCR_PAGES=30;
async function readScannedPages(pdf,pages,name){
  const n=Math.min(pdf.numPages,OCR_PAGES); let done=0, failed=0;
  pdfStatus(`“${name}” is a scanned PDF: reading ${n} ${n===1?'page':'pages'} with AI…`);
  addChat('bot',`“${name}” has no text layer (scanned pages), so the tutor is reading ${n<pdf.numPages?`the first ${n} of ${pdf.numPages} pages`:`its ${n} ${n===1?'page':'pages'}`} with AI first. This takes a few seconds a page.`);
  async function one(p){
    const page=await pdf.getPage(p), vp0=page.getViewport({scale:1}), scale=Math.min(2,1500/Math.max(vp0.width,vp0.height));
    const vp=page.getViewport({scale}), canvas=document.createElement('canvas');
    canvas.width=Math.round(vp.width); canvas.height=Math.round(vp.height);
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    let q=0.72, url=canvas.toDataURL('image/jpeg',q);
    while(url.length>900000&&q>0.35){ q-=0.12; url=canvas.toDataURL('image/jpeg',q); }
    try{
      const r=await api('/api/ocr',{image:url,page:p},70000);
      const text=String(r.text||'').trim();
      pages[p-1]={text,words:text?text.split(/\s+/).filter(Boolean).length:0};
    }catch(e){ failed++; }
    done++; pdfStatus(`“${name}”: read ${done} of ${n} scanned pages with AI…`);
  }
  let next=1; const worker=async()=>{ while(next<=n){ const p=next++; await one(p); } };
  await Promise.all([worker(),worker()]);
  const words=pages.reduce((s,pg)=>s+pg.words,0);
  if(failed&&words) addChat('bot',`${failed} scanned ${failed===1?'page':'pages'} could not be read and ${failed===1?'is':'are'} skipped.`);
  return words;
}
// ---- Continuous conversational loop: every answer queues visuals, the pump draws forever ----
async function submitChat(text){
  const q=String(text||'').trim(); if(!q) return;
  hideError();
  addChat('user',q);
  const input=$('chatInput'); if(input)input.value='';
  state.lastQ=q;
  const send=$('chatSend'); if(send){send.disabled=true;send.textContent='…';}
  if(window.Computed){
    let routed=false;
    try{ routed=await Computed.handle(q,leaveCodeMode); }catch(e){ routed=false; }
    if(routed){ if(send){send.disabled=false;send.textContent='Ask ↗';} return; }
    if(state.mode==='computed'){ Computed.deactivate(); state.mode='legacy'; }
  }
  const typing=addChat('bot','Thinking'); if(typing)typing.classList.add('thinking');
  if(window.Usage)Usage.begin(typing);
  chatStatus('Writing answer…');
  try{
    const hist=[];
    for(const h of state.chatHistory.slice(-3)){ hist.push({role:'user',content:String(h.q).slice(0,1500)},{role:'assistant',content:String(h.a).slice(0,1500)}); }
    const title=String(q).replace(/\s+/g,' ').trim().slice(0,70)||'Lesson';
    // Lecture part 1 is queued as soon as its paragraphs are written; the rest when the answer is complete.
    let first=null;
    const group={title:q,kind:'chat',explanation:'',complete:false};
    leaveLessonBoard(); notesStart(title);
    const explanation=await explainStream(q,hist,typing,soFar=>{
      notesUpdate(soFar);
      if(first) return;
      const paras=completeParagraphs(soFar), part=firstPart(paras);
      if(part&&soFar.length>=700){ first=part; enqueueViz({title:`${title} (part 1)`,kind:'chat',text:part.join('\n\n'),el:typing,group}); chatStatus('Drawing the first part of the lecture while the answer is written…'); }
    });
    if(window.FactCheck&&typing)FactCheck.run(q,explanation,typing);
    state.chatHistory.push({q,a:explanation});
    group.explanation=explanation;
    chatStatus('Answer complete — drawing the lecture…');
    notesUpdate(explanation); notesWait('Drawing the animated lecture: part 1 is almost ready…');
    const all=paragraphs(explanation);
    if(first){
      const rest=restParts(all.slice(first.length)), n=rest.length+1;
      rest.forEach((p,k)=>enqueueViz({title:`${title} (part ${k+2} of ${n})`,kind:'chat',text:p,el:typing,group}));
    } else {
      const parts=lectureParts(explanation);
      parts.forEach((text,k)=>enqueueViz({title:parts.length>1?`${title} (part ${k+1} of ${parts.length})`:title,kind:'chat',text,el:typing,group}));
    }
    group.complete=true; maybeSaveGroup(group);
  }catch(e){
    if(typing){typing.classList.remove('thinking');typing.textContent=`Sorry — ${e.message}`;}
    chatStatus('Request failed · try again'); showError(`Chat failed: ${e.message}`); stopThinking(); notesStop();
  }finally{
    if(send){send.disabled=false;send.textContent='Ask ↗';}
  }
}
// Called by computed.js right before a computed lesson takes over the board.
function leaveCodeMode(){
  if(state.mode==='code')sendFrameCommand('pause');
  {const dl=$('dlBtn');if(dl)dl.disabled=true;}
  state.runId++;state.playing=false;state.paused=false;state.autoPlay=false;stopSpeech();stopThinking();
  state.vizEpoch=(state.vizEpoch||0)+1;state.vizActive=0;state.vizParts=[];state.vizNext=0;state.vizIndex=-1;state.vizPendingAdvance=false;
  state.codeHtml='';state.lesson=null;
  const f=$('lessonFrame');if(f){f.hidden=true;f.removeAttribute('srcdoc');}
  state.mode='computed';
}
// Splits an explanation into up to 3 lecture parts at paragraph breaks. The first
// part is short so it is drawn and starts playing quickly; code blocks and lists
// stay whole. Every sentence is still taught, in the same order.
// Paragraphs of an answer, with code blocks kept whole.
function paragraphs(md){
  return String(md||'').split(/\n{2,}/).reduce((out,p)=>{ const open=out.length&&((out[out.length-1].match(/```/g)||[]).length%2===1); if(open) out[out.length-1]+='\n\n'+p; else out.push(p); return out; },[]).map(p=>p.trim()).filter(Boolean);
}
// While streaming: only paragraphs that are finished (followed by a blank line, code closed).
function completeParagraphs(text){
  const cut=text.lastIndexOf('\n\n'); if(cut<0) return [];
  const paras=paragraphs(text.slice(0,cut));
  if(paras.length&&((paras[paras.length-1].match(/```/g)||[]).length%2===1)) paras.pop();
  return paras;
}
// The short first part: at least two paragraphs and about 450 characters.
function firstPart(paras){
  let size=0; const out=[];
  for(const p of paras){ out.push(p); size+=p.length; if(out.length>=2&&size>=450) return out; }
  return null;
}
// The rest of the answer in one or two parts.
function restParts(paras){
  if(!paras.length) return [];
  const total=paras.join('\n\n').length;
  if(total<1400) return [paras.join('\n\n')];
  const parts=[[]];let size=0;
  paras.forEach(p=>{ if(size>0&&size+p.length>total/2&&parts.length<2){ parts.push([]); size=0; } parts[parts.length-1].push(p); size+=p.length; });
  return parts.map(x=>x.join('\n\n'));
}
// ---- Board notes: something to look at within seconds ----
// While the lecture visual is being generated, the answer's key points are
// written on the board as they stream in, with the pointer on the newest line.
// The lecture replaces them the moment its first part is ready.
function keyPoints(text){
  const out=[];
  for(const p of completeParagraphs(text+'\n\n')){
    if(p.startsWith('```')||/^\|/.test(p)) continue;
    let line=p.replace(/^#{1,6}\s*/,'').replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm,'').replace(/\*\*|__|`/g,'').replace(/\s+/g,' ').trim();
    if(!line||line.length<12) continue;
    const first=(line.match(/^[^.!?]+[.!?]/)||[line])[0].trim();
    out.push(first.length>120?first.slice(0,117).replace(/\s+\S*$/,'')+'…':first);
  }
  return out;
}
function notesStart(title){
  let el=$('notesBoard');
  if(!el){ el=document.createElement('div'); el.id='notesBoard'; el.className='notesboard'; $('board').append(el); }
  el.innerHTML='<p class="nbtag">Key points</p><h3></h3><ol></ol><div class="nbstick" aria-hidden="true"></div><p class="nbwait"><span class="nbspin"></span>Drawing the animated lecture…</p>';
  el.querySelector('h3').textContent=title;
  el.hidden=false; $('welcome').hidden=true;
}
function notesUpdate(text){
  const el=$('notesBoard'); if(!el||el.hidden) return;
  const ol=el.querySelector('ol'), pts=keyPoints(text).slice(0,6);
  for(let i=ol.children.length;i<pts.length;i++){
    const li=document.createElement('li'); li.textContent=pts[i]; ol.append(li);
    const stick=el.querySelector('.nbstick'); stick.style.top=`${li.offsetTop+li.offsetHeight/2}px`; stick.style.left=`${Math.min(li.offsetLeft+li.offsetWidth*0.55,el.clientWidth-60)}px`; stick.classList.add('on');
  }
}
function notesWait(text){ const w=$('notesBoard')?.querySelector('.nbwait'); if(w) w.lastChild.textContent=text; }
function notesStop(){ const el=$('notesBoard'); if(el) el.hidden=true; }
const cleanFence=t=>String(t).replace(/^```(?:md|markdown|text)?[ \t]*\n/i,'').replace(/\n?```\s*$/,'');
// Streams the explanation into the chat bubble as it is written. Falls back to
// a single JSON answer on hosts that do not stream.
async function explainStream(q,hist,bubble,onText){
  // Verified mode: the answer is written with Google Search and carries its sources (sources.js).
  const verified=!!(window.FactCheck&&FactCheck.enabled)&&!$('instantToggle')?.checked;
  const r=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic:q,history:hist,stream:true,ground:verified,level:'Undergraduate engineering; explain from fundamentals and build to rigorous understanding'})});
  const ctype=r.headers.get('content-type')||'';
  const render=t=>{ if(!bubble) return; bubble.classList.remove('thinking'); bubble.classList.add('flowing'); bubble.innerHTML=mdRender(t); };
  if(!ctype.includes('ndjson')){
    const j=await r.json().catch(()=>({error:'Server returned an unreadable response.'}));
    if(!r.ok||!j.explanation) throw new Error(j.error||`Request failed (${r.status})`);
    render(j.explanation); onText(j.explanation); return j.explanation;
  }
  const reader=r.body.getReader(), dec=new TextDecoder();
  let buf='', text='', last=0, err=null, sources=null;
  for(;;){
    const {value,done}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    let nl;
    while((nl=buf.indexOf('\n'))>=0){
      const line=buf.slice(0,nl); buf=buf.slice(nl+1); if(!line.trim()) continue;
      let m; try{ m=JSON.parse(line); }catch{ continue; }
      if(m.looked&&m.looked.length) chatStatus(`Read ${m.looked.length} Wikipedia ${m.looked.length===1?'article':'articles'} first: ${m.looked.join(', ')}`);
      if(m.t){ if(!text&&window.Usage)Usage.firstText(); text+=m.t; const t=cleanFence(text); onText(window.Sources?Sources.strip(t):t); if(performance.now()-last>120){ last=performance.now(); render(t); } }
      if(m.error) err=m.error;
      if(m.done&&m.model) document.dispatchEvent(new CustomEvent('model:used',{detail:{used:m.model,skipped:m.skipped||[]}}));
      if(m.done&&m.usage) document.dispatchEvent(new CustomEvent('usage',{detail:m.usage}));
      if(m.done&&m.sources) sources=m.sources;
    }
  }
  if(err&&!text.trim()) throw new Error(err);
  text=cleanFence(text).trim().slice(0,8000);
  if(!text) throw new Error('The model returned an empty explanation.');
  render(text);
  // Sources: from the search done while writing, or looked up afterwards when there was none.
  if(verified&&window.Sources&&bubble&&sources) Sources.render(bubble,sources);
  // The rest of the app (lecture, voice, fact check, history) gets the text without citation markers.
  return window.Sources?Sources.strip(text).replace(/[ \t]+\n/g,'\n'):text;
}
function lectureParts(md){
  const paras=String(md||'').split(/\n{2,}/).reduce((out,p)=>{ const open=out.length&&((out[out.length-1].match(/```/g)||[]).length%2===1); if(open) out[out.length-1]+='\n\n'+p; else out.push(p); return out; },[]).map(p=>p.trim()).filter(Boolean);
  const total=paras.join('\n\n').length;
  if(total<900||paras.length<3) return [paras.join('\n\n')];
  const firstSize=Math.min(700,total*0.25), restSize=Math.max(900,(total-firstSize)/2);
  const parts=[[]];let size=0;
  paras.forEach(p=>{ const limit=parts.length===1?firstSize:restSize; if(size>0&&size+p.length>limit&&parts.length<3){ parts.push([]); size=0; } parts[parts.length-1].push(p); size+=p.length; });
  return parts.map(x=>x.join('\n\n'));
}
function leaveLessonBoard(){
  if(state.mode==='code'){ sendFrameCommand('pause'); }
  {const dl=$('dlBtn');if(dl)dl.disabled=true;}
  state.vizEpoch=(state.vizEpoch||0)+1;state.vizActive=0;state.vizParts=[];state.vizNext=0;state.vizIndex=-1;state.vizPendingAdvance=false;
  const f=$('lessonFrame'); if(f){ f.hidden=true; f.removeAttribute('srcdoc'); }
  const ts=$('tsub'); if(ts) ts.hidden=true;
  stopSpeech();
}
function enqueueViz(p, priority){
  const pos=priority?state.vizNext:state.vizParts.length;
  state.vizParts.splice(pos,0,Object.assign({html:null,ready:false,model:''},p));
  const waiting=state.vizParts.length-(state.vizIndex+1);
  chatStatus(waiting>1?`${waiting} visuals queued — drawing nonstop…`:chatStatusText());
  pumpViz();
}
function chatStatusText(){ return 'Chat with your visual tutor'; }
// Lecture parts are generated in parallel (up to 3 at once) and played strictly
// in order: part 1 starts as soon as it is ready while the rest are still being made.
const VIZ_PARALLEL=3;
function pumpViz(){
  const epoch=state.vizEpoch;
  while(state.vizNext<state.vizParts.length&&(state.vizActive||0)<VIZ_PARALLEL){
    const i=state.vizNext++, part=state.vizParts[i]; state.vizActive=(state.vizActive||0)+1;
    genVizPart(i,epoch).finally(()=>{ if(epoch!==state.vizEpoch) return; state.vizActive--; playNextReady(); pumpViz(); maybeSaveGroup(part&&part.group); });
  }
}
// Saved lectures (saved.js): once every part of a lecture is drawn (or has
// failed), the lecture goes to the student's library, at most once.
function maybeSaveGroup(g){
  if(!g||!g.complete||g.saved||!window.Saved) return;
  const parts=state.vizParts.filter(p=>p.group===g);
  if(!parts.length||parts.some(p=>!p.ready&&!p.failed)) return;
  const done=parts.filter(p=>p.ready); if(!done.length) return;
  g.saved=true;
  Saved.save({title:g.title,kind:g.kind,explanation:g.explanation,model:done[0].model||'',parts:done.map(p=>({title:p.title,kind:p.kind,text:p.text,html:p.html,model:p.model,pages:p.pages}))});
}
// Plays a saved lecture straight away: every part is already drawn, so no AI call is made.
window.playSavedLecture=function(lec){
  stopPlayback();
  if(window.Computed){Computed.deactivate();}
  leaveLessonBoard(); stopThinking(); notesStop(); hideError();
  const group={title:lec.title,kind:lec.kind,explanation:lec.explanation||'',complete:true,saved:true};
  const box=$('chatThread'); if(box) box.replaceChildren();
  addChat('user',lec.title);
  let bubble=null;
  if(lec.explanation){ postTextSentences(lec.explanation); bubble=box&&box.lastElementChild; state.chatHistory=[{q:lec.title,a:lec.explanation}]; }
  addChat('bot',`Replaying your saved lecture (${lec.parts.length} ${lec.parts.length===1?'part':'parts'}). No AI calls needed.`);
  state.pdfTitle=lec.kind==='doc'?lec.title:'';state.postedPartText=lec.explanation?-2:-1;
  state.vizParts=lec.parts.map(p=>({title:p.title,kind:p.kind,text:p.text,pages:p.pages,html:p.html,model:p.model||'',ready:true,el:p.kind==='chat'?bubble:null,group}));
  state.vizNext=state.vizParts.length;state.vizIndex=-1;
  $('lessonTitle').textContent=lec.title;
  if(state.vizParts.length) firstViz(0);
};
// The lecture on the board (its drawn parts), for the Download menu (download.js).
window.currentLecture=function(){
  const parts=state.vizParts.filter(p=>p.ready&&p.html); if(!parts.length) return null;
  const g=parts[0].group||{};
  return {title:g.title||$('lessonTitle').textContent||'Lecture',kind:g.kind||parts[0].kind||'chat',explanation:g.explanation||'',parts:parts.map(p=>({title:p.title,kind:p.kind,text:p.text,html:p.html,model:p.model,pages:p.pages}))};
};
// Plays the lecture again from its first drawn part (used when recording a video).
window.replayLectureFromStart=function(){ const k=state.vizParts.findIndex(p=>p.ready&&!p.failed); if(k>=0) loadVizPart(k); };
// The next part to play: the first one after the current that has not failed.
function nextPart(from){ for(let k=from+1;k<state.vizParts.length;k++){ if(!state.vizParts[k].failed) return k; } return -1; }
function playNextReady(){
  const nxt=nextPart(state.vizIndex); if(nxt<0) return;
  const part=state.vizParts[nxt]; if(!part.ready) return;
  if(state.vizIndex===-1) firstViz(nxt);
  else if(!state.playing||state.vizPendingAdvance){ state.vizPendingAdvance=false; loadVizPart(nxt); }
}
function firstViz(r){
  stopThinking(); notesStop();
  $('connection').className='status ok';$('connection').innerHTML='<i></i> Visual teacher running';
  loadVizPart(r);
}
async function genVizPart(i, epoch){
  const p=state.vizParts[i]; if(!p||p.ready) return p;
  chatStatus(`Drawing ${i+1}/${state.vizParts.length} — ${p.title}`);
  try{
    const body=p.kind==='doc'
      ? {topic:p.title,pdf:true,source:`This is section ${i+1} of the uploaded document "${state.pdfTitle||'document'}" (pages ${p.pages}). Teach ONLY this section, completely and visually. Do not summarize other parts.\n\nSECTION TEXT:\n${p.text}`,level:'Undergraduate engineering; explain from fundamentals and build to rigorous understanding'}
      : {topic:p.title,visualize:true,source:`Teach these exact sentences in order, one beat per sentence, same words where possible. Do not add new facts.\n\n${p.text}`,level:'Undergraduate engineering; explain from fundamentals and build to rigorous understanding'};
    const data=await api('/api/code-lesson',body);
    if(epoch!==state.vizEpoch) return null;
    if(!data.html||!data.html.includes('neuralelearn:lesson')) throw new Error('Visual came back unusable.');
    p.html=data.html;p.ready=true;p.model=data.model;
    return data;
  }catch(e){ if(epoch!==state.vizEpoch) return null; p.failed=true; showError(`Visual ${i+1} failed and was skipped: ${e.message} — chat continues.`); addChat('bot',`Visual ${i+1} (“${p.title}”) failed: ${e.message} — skipped, chat continues.`); return null; }
}
function loadVizPart(i){
  const p=state.vizParts[i]; if(!p||!p.ready) return;
  if(window.Computed)Computed.deactivate();
  state.vizIndex=i;state.codeHtml=p.html;
  state.lessonLoadId++;state.postedBeats=new Set();state.lastChatScene=-1;state.lineNo=0;state.explainBubble=null;
  state.mode='code';
  if(p.kind==='doc'&&state.postedPartText!==i){ postTextSentences(p.text); state.postedPartText=i; }
  else if(p.kind==='chat'&&p.el){ state.sentSpans=Array.from(p.el.querySelectorAll('.sent')); state.sentIdx=0; }
  else { state.sentSpans=null; }
  $('welcome').hidden=true;$('sceneSvg').hidden=true;$('lessonFrame').hidden=false;notesStop();
  $('playBtn').disabled=false;$('resetBtn').disabled=false;{const dl=$('dlBtn');if(dl)dl.disabled=false;}
  $('connection').className='status ok';$('connection').innerHTML=`<i></i> ${esc(p.model||'model')} · visual teacher`;
  chatStatus(`Drawing ${i+1}/${state.vizParts.length} — ${p.title}`);
  const lines=lectureLines(p.html);
  if(window.Voice&&lines.length>=3&&$('voiceToggle').checked)Voice.prefetch([lines]);
  if(window.FactCheck&&lines.length){ if(p.kind==='chat')FactCheck.checkLecture(p.text,lines); else if(p.kind==='doc')FactCheck.checkLecture(p.text,lines,{source:true}); }
  state.subLine=null;const ts=$('tsub');if(ts){ts.hidden=true;ts.replaceChildren();}
  loadCodeFrame(p.html,null,true);
}

async function api(path, data, timeoutMs=150000) {
  const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r = await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:ctrl.signal});
    const ctype=r.headers.get('content-type')||'';
    if(!ctype.includes('application/json')){
      if(path.includes('code-lesson'))throw new Error('The server took too long to answer (cold start or a slow model run). Hit Retry — the retry is usually fast because everything is warm.');
      throw new Error(`Server returned an unreadable response (${r.status}).`);
    }
    const result = await r.json().catch(()=>({error:'Server returned an unreadable response.'}));
    if(!r.ok) throw new Error(result.error || `Request failed (${r.status})`);
    return result;
  }catch(e){ if(e.name==='AbortError') throw new Error('Request timed out — the model took too long. Retry with a narrower topic.'); throw e; }
  finally{clearTimeout(t);}
}
async function checkHealth(){
  try { const r=await fetch('/api/health'); const d=await r.json(); $('connection').className='status ok'; $('connection').innerHTML=`<i></i> ${esc(d.model)} ready`; }
  catch { $('connection').className='status bad'; $('connection').innerHTML='<i></i> Server unavailable'; }
}
function setBusy(busy, text='Working…'){
  $('playBtn').disabled=busy||!state.lesson; $('resetBtn').disabled=busy||!state.lesson;
  $('playBtn').textContent=busy?text:(state.playing?'Ⅱ Pause':(state.index>=((state.lesson?.scenes.length||1)-1)&&state.beatIndex>=((state.lesson?.scenes[state.index]?.beats?.length||1)-1)&&!state.playing?'▶ Replay lesson':'▶ Play lesson'));
}
function stopSpeech(){
  state.timer=null;
  if(window.Voice)Voice.stop();
  else if(state.voiceAvailable){try{window.speechSynthesis.cancel();}catch{}}
  state.speech=null;
}
function sendFrameCommand(command, extra={}){try{const f=$('lessonFrame');if(!f||f.hidden)return;f.contentWindow?.postMessage({type:'neuralelearn:command',command,...extra},'*');if(command==='play')state.playSentAt=Date.now();}catch{}}
function stopPlayback(){if(state.mode==='computed'&&window.Computed){Computed.pause();return;}state.runId++;state.playing=false;state.paused=false;state.autoPlay=false;stopSpeech();if(state.mode==='code')sendFrameCommand('pause');setBusy(false);}
function loadCodeFrame(html, seekIndex=null, fresh=false){
  const frame=$('lessonFrame');
  state.pendingSeek=Number.isInteger(seekIndex)?seekIndex:null;
  state.autoPlay=true; state.playing=true; state.paused=false; state.runId++;
  state.lastBeatAt=Date.now(); if(fresh) state.stalls=0;
  // Error forwarder: surfaces the generated program's real JS errors to the
  // parent (sandboxed iframes can't be inspected otherwise). Independent
  // listener — never touches lesson code.
  const fwd=`<script>window.addEventListener('error',function(e){try{window.parent.postMessage({type:'neuralelearn:error',message:String((e&&e.message)||'script error')},'*')}catch(_){}});window.addEventListener('unhandledrejection',function(e){try{var r=e&&e.reason;window.parent.postMessage({type:'neuralelearn:error',message:'promise: '+String((r&&r.message)||r||'rejection')},'*')}catch(_){}});<\/script>`;
  const kit=typeof nlBoardKit==='function'?`<script>(${nlBoardKit.toString()})();<\/script>`:'';
  const wrapped=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+fwd+kit):fwd+kit+html;
  frame.hidden=false;
  frame.onload=()=>{
    if(state.mode!=='code')return;
    // Send play immediately + again shortly after — covers generated code that
    // attaches its listener late. play is idempotent by protocol.
    sendFrameCommand('play',{value:Number($('speed').value)});
    setTimeout(()=>{if(state.mode==='code'&&state.autoPlay&&!state.lesson?.scenes?.length)sendFrameCommand('play',{value:Number($('speed').value)});},800);
    setTimeout(()=>{
      if(state.mode!=='code'||!state.autoPlay)return;
      // If still no beat after load, resend + seek if requested
      if(state.pendingSeek!=null){sendFrameCommand('seek',{sceneIndex:state.pendingSeek});state.pendingSeek=null;}
      else if(Date.now()-state.lastBeatAt>4000)sendFrameCommand('play',{value:Number($('speed').value)});
    },1500);
    $('playBtn').disabled=false;$('resetBtn').disabled=false;$('playBtn').textContent='Ⅱ Pause';
  };
  // srcdoc reload guarantees recovery even if iframe JS crashed — replay command alone can't do that
  frame.removeAttribute('srcdoc');
  // force reload even if html identical
  requestAnimationFrame(()=>{frame.srcdoc=wrapped;});
  startWatchdog();
}
function hardRestartCode(seekIndex=null, fresh=false){
  if(!state.codeHtml){sendFrameCommand('replay',{value:Number($('speed').value)});return;}
  stopSpeech();
  state.index=Number.isInteger(seekIndex)?seekIndex:0;state.beatIndex=0;
  $('playBtn').textContent='Ⅱ Pause';
  loadCodeFrame(state.codeHtml, seekIndex, fresh);
}
function resetPlayback(){
  if(state.mode==='computed'&&window.Computed){Computed.replay();return;}
  if(state.mode==='code'){hardRestartCode(0,true);return;}
  stopPlayback();state.index=0;if(state.lesson) renderScene(0);
}
function setOutline(){
  const ol=$('outline');if(!ol)return;ol.replaceChildren();
  if(!state.lesson?.scenes?.length){ol.innerHTML='<li class="outlineempty">Your lesson scenes will appear here.</li>';return;}
  state.lesson.scenes.forEach((s,i)=>{const li=document.createElement('li');li.dataset.index=i;li.innerHTML=`<span class="num">${i+1}</span><span>${esc(s.title)}</span>`;li.addEventListener('click',()=>{stopPlayback();state.index=i;state.beatIndex=0;renderScene(i,0);});ol.append(li);});
  const sc=$('sceneCount');if(sc)sc.textContent=`${state.lesson.scenes.length} scenes`;
}
function renderScene(index, beatIndex=0){
  if(!state.lesson)return;
  index=Math.max(0,Math.min(index,state.lesson.scenes.length-1));state.index=index;
  const scene=state.lesson.scenes[index];
  const beats=Array.isArray(scene.beats)&&scene.beats.length?scene.beats:[{narration:scene.narration,subtitle:scene.subtitle,focusIds:scene.visual.focusIds||[],revealNodeIds:scene.visual.nodes.map(n=>n.id),revealEdgeIds:scene.visual.edges.map((e,j)=>e.id||`${e.from}->${e.to}:${j}`),action:'pulse',durationSeconds:scene.durationSeconds}];
  beatIndex=Math.max(0,Math.min(beatIndex,beats.length-1));state.beatIndex=beatIndex;
  const beat=beats[beatIndex];
  $('lessonTitle').textContent=state.lesson.title;
  $('sceneCounter').textContent=beatIndex===0?`Scene ${index+1} of ${state.lesson.scenes.length} · ${scene.title}`:`Scene ${index+1} of ${state.lesson.scenes.length} · Step ${beatIndex+1}/${beats.length}`;
  $('sceneKind').textContent=(beat.action||scene.visual.kind||'VISUAL').toUpperCase();
  $('progressFill').style.width=`${((index+(beatIndex+1)/beats.length)/state.lesson.scenes.length)*100}%`;
  if(beatIndex===0&&state.playing&&state.lastChatScene!==index){ state.lastChatScene=index; addChat('bot',`${scene.title} — ${beat.narration||scene.narration||''}`); }
  drawScene(scene.visual,beat,beatIndex,beats.length);
  if(!state.playing)setBusy(false);
}

function svgEl(tag,attrs={},text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=String(text);return el;}
function semanticGlyph(g, shape, color) {
  // Compact SVG pictograms keep concepts visually recognizable instead of turning everything into boxes.
  if(shape==='sun'){
    g.append(svgEl('circle',{r:22,fill:'#ffd45a',stroke:'#e8a71c','stroke-width':2}));
    for(let i=0;i<8;i++){const a=i*Math.PI/4,x1=Math.cos(a)*28,y1=Math.sin(a)*28,x2=Math.cos(a)*36,y2=Math.sin(a)*36;g.append(svgEl('line',{x1,y1,x2,y2,stroke:'#e8a71c','stroke-width':3,'stroke-linecap':'round'}));}return true;
  }
  if(shape==='leaf'){
    g.append(svgEl('path',{d:'M -34 10 C -35 -22 -3 -38 32 -28 C 29 4 7 28 -23 22 Z',fill:'#a8e6a1',stroke:'#26854a','stroke-width':2.5}));
    g.append(svgEl('path',{d:'M -25 20 Q -2 -2 24 -25',fill:'none',stroke:'#26854a','stroke-width':2.5}));return true;
  }
  if(shape==='chloroplast'){
    g.append(svgEl('ellipse',{rx:38,ry:23,fill:'#d5f5b8',stroke:'#368a4d','stroke-width':3}));
    for(let i=-2;i<=2;i++)g.append(svgEl('path',{d:`M ${i*10-5} -13 q 8 6 0 12 q -8 6 0 13`,fill:'none',stroke:'#368a4d','stroke-width':3}));return true;
  }
  if(shape==='molecule'){
    [[-16,0],[0,-13],[16,0],[0,14]].forEach(([x,y])=>g.append(svgEl('circle',{cx:x,cy:y,r:9,fill:color,stroke:'#fff','stroke-width':2})));g.append(svgEl('path',{d:'M -9 -7 L -5 -10 M 8 -7 L 12 -4 M -8 7 L -4 10 M 8 7 L 4 10',stroke:'#718096','stroke-width':3}));return true;
  }
  if(shape==='packet'){
    g.append(svgEl('rect',{x:-34,y:-23,width:68,height:46,rx:7,fill:'#e6efff',stroke:'#3569d4','stroke-width':2.5}));
    for(let i=0;i<3;i++)g.append(svgEl('line',{x1:-23,y1:-10+i*10,x2:23,y2:-10+i*10,stroke:'#3569d4','stroke-width':2}));return true;
  }
  if(shape==='host'||shape==='cpu'){
    g.append(svgEl('rect',{x:-32,y:-23,width:64,height:43,rx:5,fill:shape==='cpu'?'#e8e1ff':'#e3f4ff',stroke:shape==='cpu'?'#7754c8':'#2a7eac','stroke-width':2.5}));
    g.append(svgEl('path',{d:'M -14 27 L 14 27 M 0 20 L 0 27',stroke:'#64748b','stroke-width':3,'stroke-linecap':'round'}));
    if(shape==='cpu')g.append(svgEl('path',{d:'M -10 -8 H 10 M -10 0 H 10 M -10 8 H 10',stroke:'#7754c8','stroke-width':3}));return true;
  }
  if(shape==='ram'||shape==='disk'||shape==='database'||shape==='cylinder'){
    if(shape==='ram'){
      g.append(svgEl('rect',{x:-37,y:-22,width:74,height:44,rx:5,fill:'#d9f5eb',stroke:'#168568','stroke-width':2.5}));
      for(let i=-2;i<=2;i++)g.append(svgEl('rect',{x:i*12-4,y:-12,width:8,height:24,fill:'#73cdb3',stroke:'#168568','stroke-width':1}));
    }else{
      g.append(svgEl('path',{d:'M -32 -16 C -32 -28 32 -28 32 -16 L 32 18 C 32 30 -32 30 -32 18 Z',fill:'#e1e9ff',stroke:'#526dc2','stroke-width':2.5}));
      g.append(svgEl('ellipse',{cx:0,cy:-16,rx:32,ry:10,fill:'#f4f6ff',stroke:'#526dc2','stroke-width':2.5}));
      g.append(svgEl('path',{d:'M -32 0 C -32 12 32 12 32 0',fill:'none',stroke:'#526dc2','stroke-width':2}));
    }return true;
  }
  if(shape==='diamond') {g.append(svgEl('path',{d:'M 0 -31 L 42 0 L 0 31 L -42 0 Z',fill:'#fff1c9',stroke:'#c28b20','stroke-width':2.5}));return true;}
  if(shape==='cylinder') return true;
  return false;
}
function nodeLabel(g,label,active){
  const words=label.split(/\s+/);let lines=[],line='';for(const word of words){if((line+' '+word).trim().length>18&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);lines=lines.slice(0,3);
  const text=svgEl('text',{x:0,y:lines.length>1?43:48,'text-anchor':'middle','font-size':Math.min(17,Math.max(12,16-lines.length)),'font-weight':750,fill:active?'#26364b':'#27364b'});
  lines.forEach((str,j)=>text.append(svgEl('tspan',{x:0,dy:j===0?0:16},str)));g.append(text);
}
function layoutTree(nodes,edges){
  const childMap=new Map(nodes.map(n=>[n.id,[]])),parented=new Set();
  edges.forEach(e=>{if(childMap.has(e.from)&&childMap.has(e.to)){childMap.get(e.from).push(e.to);parented.add(e.to);}});
  const roots=nodes.filter(n=>!parented.has(n.id));if(!roots.length)return null;
  const positions=new Map();let leaf=0;
  function visit(id,depth){const kids=childMap.get(id)||[];if(!kids.length){positions.set(id,{x:(leaf+1)/(nodes.length+1),y:Math.min(.82,.16+depth*.2)});leaf++;return;}kids.forEach(k=>visit(k,depth+1));const xs=kids.map(k=>positions.get(k)?.x).filter(Number.isFinite);positions.set(id,{x:xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:(leaf+1)/(nodes.length+1),y:Math.min(.82,.16+depth*.2)});}
  roots.forEach(r=>visit(r.id,0));return positions;
}
function drawScene(v,beat={},beatIndex=0,beatCount=1){
  const svg=$('sceneSvg');try{svg.unpauseAnimations();}catch{}svg.classList.remove('paused');svg.replaceChildren();svg.hidden=false;document.querySelector('.welcome').hidden=true;
  const defs=svgEl('defs');
  const marker=svgEl('marker',{id:'arrow',markerWidth:8,markerHeight:8,refX:6,refY:3,orient:'auto',markerUnits:'strokeWidth'});marker.append(svgEl('path',{d:'M0,0 L6,3 L0,6 z',fill:'#91a1b8'}));defs.append(marker);
  const glow=svgEl('filter',{id:'glow',x:'-60%',y:'-60%',width:'220%',height:'220%'});glow.append(svgEl('feGaussianBlur',{stdDeviation:5,result:'blur'}));const merge=svgEl('feMerge');merge.append(svgEl('feMergeNode',{in:'blur'}),svgEl('feMergeNode',{in:'SourceGraphic'}));glow.append(merge);defs.append(glow);svg.append(defs);
  const nodes=Array.isArray(v.nodes)?v.nodes:[],edges=Array.isArray(v.edges)?v.edges:[];const byId=new Map(nodes.map(n=>[n.id,n]));
  const treePositions=v.kind==='tree'?layoutTree(nodes,edges):null;
  const point=n=>treePositions?.get(n.id)?{x:treePositions.get(n.id).x*1000,y:treePositions.get(n.id).y*620}:{x:n.x*1000,y:n.y*620};
  const focus=new Set(Array.isArray(beat.focusIds)&&beat.focusIds.length?beat.focusIds:(v.focusIds||[]));
  let visibleNodeIds=new Set(Array.isArray(beat.revealNodeIds)?beat.revealNodeIds:[]);
  let visibleEdgeIds=new Set(Array.isArray(beat.revealEdgeIds)?beat.revealEdgeIds:[]);
  if(!visibleNodeIds.size){const count=Math.max(1,Math.ceil(nodes.length*(beatIndex+1)/Math.max(1,beatCount)));nodes.slice(0,count).forEach(n=>visibleNodeIds.add(n.id));}
  if(!visibleEdgeIds.size){const count=Math.ceil(edges.length*(beatIndex+1)/Math.max(1,beatCount));edges.slice(0,count).forEach((e,i)=>visibleEdgeIds.add(e.id||`${e.from}->${e.to}:${i}`));}
  // Draw connections first so each one is visibly traced as it appears.
  edges.forEach((e,i)=>{
    if(!visibleEdgeIds.has(e.id||`${e.from}->${e.to}:${i}`))return;
    const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)return;
    const p1=point(a),p2=point(b),x1=p1.x,y1=p1.y,x2=p2.x,y2=p2.y;
    const line=svgEl('line',{x1,y1,x2,y2,stroke:focus.has(e.from)||focus.has(e.to)?'#4778ee':'#9aa8bb','stroke-width':focus.has(e.from)||focus.has(e.to)?4:3,'stroke-linecap':'round','marker-end':'url(#arrow)',class:'edge-draw'});svg.append(line);
    if(e.label){const tx=(x1+x2)/2,ty=(y1+y2)/2-9;svg.append(svgEl('text',{x:tx,y:ty,'text-anchor':'middle','font-size':13,fill:'#66758a','font-weight':700,class:'label-reveal'},e.label));}
  });
  nodes.forEach((n,i)=>{
    if(!visibleNodeIds.has(n.id))return;
    const pos=point(n),x=pos.x,y=pos.y,color=palette[i%palette.length],active=focus.has(n.id),label=String(n.label||n.id),shape=n.shape||'circle',width=Math.min(210,Math.max(92,label.length*8+30));
    const g=svgEl('g',{class:`node-enter ${active?'node-focus':''} ${active?'node-pulse':''}`,transform:`translate(${x} ${y})`,filter:active?'url(#glow)':'none'});
    const semantic=semanticGlyph(g,shape,color);
    if(!semantic){
      if(shape==='circle')g.append(svgEl('circle',{r:Math.min(54,Math.max(38,width/2)),fill:active?'#eef3ff':'#fff',stroke:color,'stroke-width':active?4:2.5}));
      else if(shape==='diamond')g.append(svgEl('path',{d:`M 0 -32 L ${width/2} 0 L 0 32 L ${-width/2} 0 Z`,fill:'#fff6d9',stroke:color,'stroke-width':2.5}));
      else g.append(svgEl('rect',{x:-width/2,y:-28,width,height:56,rx:13,fill:active?'#eef3ff':'#fff',stroke:color,'stroke-width':active?4:2.5}));
    }
    nodeLabel(g,label,active);svg.append(g);
  });
  let motion=beat.motion&&byId.has(beat.motion.from)&&byId.has(beat.motion.to)?beat.motion:null;
  if(!motion&&['trace','flow','transform'].includes(beat.action)&&nodes.length>1){const from=(beat.focusIds||[]).find(id=>byId.has(id))||nodes[Math.min(beatIndex,nodes.length-2)].id;const fromIndex=nodes.findIndex(n=>n.id===from);const target=nodes[Math.min(nodes.length-1,Math.max(fromIndex+1,beatIndex+1))];if(target&&target.id!==from)motion={from,to:target.id,label:beat.action==='flow'?'moving':beat.action==='transform'?'change':'follow'};}
  if(motion){
    const a=byId.get(motion.from),b=byId.get(motion.to),pa=point(a),pb=point(b),x1=pa.x,y1=pa.y,x2=pb.x,y2=pb.y;
    const path=svgEl('path',{id:'motionPath',d:`M ${x1} ${y1} L ${x2} ${y2}`,fill:'none',stroke:'none'});svg.append(path);
    const token=svgEl('g',{class:'traveller'});token.append(svgEl('circle',{r:17,fill:'#f8b72f',stroke:'#fff','stroke-width':4,filter:'url(#glow)'}));token.append(svgEl('text',{x:0,y:5,'text-anchor':'middle','font-size':17,'font-weight':900,fill:'#242424'},'➤'));
    const animate=svgEl('animateMotion',{dur:`${Math.max(1.1,Number(beat.durationSeconds)||4)*0.65}s`,repeatCount:'1',fill:'freeze',path:`M ${x1} ${y1} L ${x2} ${y2}`});token.append(animate);svg.append(token);
    if(motion.label)svg.append(svgEl('text',{x:(x1+x2)/2,y:(y1+y2)/2-24,'text-anchor':'middle','font-size':15,'font-weight':850,fill:'#b77905',class:'label-reveal'},motion.label));
  }
  if(beat.formula||v.formula){const formula=beat.formula||v.formula;const box=svgEl('g',{class:'formula-enter',transform:'translate(500 565)'});box.append(svgEl('rect',{x:-420,y:-25,width:840,height:44,rx:10,fill:'#f5f7fb',stroke:'#b8c8ed','stroke-width':1.5}));box.append(svgEl('text',{x:0,y:3,'text-anchor':'middle','font-size':17,'font-weight':750,fill:'#27364b'},formula));svg.append(box);}
  if(beat.code||v.code){const code=String(beat.code||v.code).split('\n').slice(0,5);const bg=svgEl('rect',{x:25,y:22,width:Math.min(500,Math.max(300,Math.max(...code.map(s=>s.length))*8+36)),height:code.length*22+22,rx:10,fill:'#f8fafc',stroke:'#b8c8ed','stroke-width':1.5,class:'formula-enter'});svg.append(bg);code.forEach((line,i)=>svg.append(svgEl('text',{x:40,y:48+i*22,'font-size':13,fill:'#384b64','font-family':'ui-monospace,monospace',class:'label-reveal'},line.slice(0,58))));}
  if(beat.action==='compare'){const tag=svgEl('g',{class:'formula-enter',transform:'translate(500 75)'});tag.append(svgEl('rect',{x:-105,y:-22,width:210,height:36,rx:18,fill:'#eaf2ff',stroke:'#9ab8ff'}));tag.append(svgEl('text',{x:0,y:1,'text-anchor':'middle','font-size':14,'font-weight':800,fill:'#2f63e9'},'COMPARE STATES'));svg.append(tag);}
}

function speechText(scene,beat){return `${state.beatIndex===0?scene.title+'. ':''}${beat?.narration||scene.narration}`;}
function speak(scene,beat,runId){
  if(!state.voiceAvailable||!$('voiceToggle').checked)return Promise.resolve('no-voice');
  return new Promise(resolve=>{
    stopSpeech();if(runId!==state.runId)return resolve('cancelled');
    const u=new SpeechSynthesisUtterance(speechText(scene,beat));state.speech=u;{const bv=window.Voice&&Voice.bestDeviceVoice();if(bv){u.voice=bv;u.lang=bv.lang;}}u.rate=Number($('speed').value);u.pitch=1;u.volume=1;
    let finished=false;const done=why=>{if(finished)return;finished=true;if(state.speech===u)state.speech=null;resolve(why);};u.onend=()=>done('ended');u.onerror=()=>done('error');
    try{window.speechSynthesis.speak(u);}catch{done('error');}
  });
}
async function waitMs(ms,runId){let left=ms;while(left>0&&runId===state.runId){if(state.paused){await new Promise(r=>setTimeout(r,100));continue;}const slice=Math.min(100,left);await new Promise(r=>{state.timer=setTimeout(()=>{state.timer=null;r();},slice);});if(!state.paused)left-=slice;}return runId===state.runId?'ended':'cancelled';}
async function playLoop(){
  if(state.mode==='computed'&&window.Computed){Computed.toggle();return;}
  if(!state.lesson && state.mode!=='code')return;
  if(state.mode==='code'){
    // Stuck recovery: playing but no beat for 25s -> hard reload instead of toggling pause
    const stuck = state.playing && !state.paused && state.lastBeatAt && (Date.now()-state.lastBeatAt>25000);
    if(stuck){hardRestartCode(state.index);return;}
    if(state.playing&&!state.paused){state.paused=true;state.autoPlay=false;sendFrameCommand('pause');if(window.Voice)Voice.pause();$('playBtn').textContent='▶ Resume';return;}
    if(state.playing&&state.paused){state.paused=false;state.autoPlay=true;state.lastBeatAt=Date.now();sendFrameCommand('play',{value:Number($('speed').value)});if(window.Voice)Voice.resume();$('playBtn').textContent='Ⅱ Pause';return;}
    // Not playing (finished or fresh): if we have html, hard-restart to guarantee start
    if(state.codeHtml){hardRestartCode(0);return;}
    state.playing=true;state.paused=false;state.autoPlay=true;sendFrameCommand('play',{value:Number($('speed').value)});$('playBtn').textContent='Ⅱ Pause';$('playBtn').disabled=false;return;}
  if(state.playing&&!state.paused){state.paused=true;if(state.voiceAvailable)window.speechSynthesis.pause();try{$('sceneSvg').pauseAnimations();}catch{}$('sceneSvg').classList.add('paused');$('playBtn').textContent='▶ Resume';return;}
  if(state.playing&&state.paused){state.paused=false;if(state.voiceAvailable)window.speechSynthesis.resume();try{$('sceneSvg').unpauseAnimations();}catch{}$('sceneSvg').classList.remove('paused');$('playBtn').textContent='Ⅱ Pause';return;}
  if(state.index>=state.lesson.scenes.length-1&&state.beatIndex>=((state.lesson.scenes[state.index]?.beats?.length||1)-1)){state.index=0;state.beatIndex=0;renderScene(0,0);}
  state.playing=true;const runId=++state.runId;$('playBtn').textContent='Ⅱ Pause';$('playBtn').disabled=false;
  while(state.playing&&runId===state.runId){
    const scene=state.lesson.scenes[state.index];
    const beats=Array.isArray(scene.beats)&&scene.beats.length?scene.beats:[{narration:scene.narration,subtitle:scene.subtitle,durationSeconds:scene.durationSeconds}];
    const beat=beats[state.beatIndex]||beats[0];
    renderScene(state.index,state.beatIndex);
    const speechResult=await speak(scene,beat,runId);if(runId!==state.runId||!state.playing)break;
    if(speechResult==='no-voice'||speechResult==='error')await waitMs((beat.durationSeconds||Math.max(3,beat.narration.split(/\s+/).length/2.4))*1000/Number($('speed').value),runId);
    if(runId!==state.runId||!state.playing)break;
    if(state.beatIndex<beats.length-1){state.beatIndex++;renderScene(state.index,state.beatIndex);continue;}
    if(state.index>=state.lesson.scenes.length-1){state.playing=false;state.paused=false;setBusy(false);$('playBtn').textContent='↺ Replay lesson';break;}
    state.index++;state.beatIndex=0;renderScene(state.index,0);
  }
}

function startWatchdog(){
  if(state.watchdog)clearInterval(state.watchdog);
  state.watchdog=setInterval(()=>{
    if(state.mode!=='code'||!state.playing||state.paused||!state.lesson)return;
    const silent=Date.now()-state.lastBeatAt;
    if(silent>25000){
      state.stalls=(state.stalls||0)+1;
      if(state.stalls<=1&&state.codeHtml){
        // First stall: auto hard-restart at the stuck chapter (reloads the
        // visual cleanly). Only nags the user if it stalls twice in a row.
        $('sceneCounter').textContent=`Visual hiccup — restarting it…`;
        chatStatus('Visual hiccup — auto-restarting…');
        hardRestartCode(state.index);
      }else{
        $('sceneCounter').textContent=`Stalled — hit ↺ Replay to hard-restart`;
        showError('Playback stalled twice — the generated visual is broken at this point. Hit ↺ Replay, or Retry with a narrower topic.');
      }
    }
  },5000);
}
window.addEventListener('message',event=>{
  if(event.source!==$('lessonFrame').contentWindow)return;
  const d=event.data;if(!d||typeof d!=='object'||typeof d.type!=='string')return;
  if(d.type==='neuralelearn:lesson'){
    stopThinking();
    if(state.codeInitTimer){clearTimeout(state.codeInitTimer);state.codeInitTimer=null;}
    const scenes=Array.isArray(d.scenes)?d.scenes.slice(0,40).map((x,i)=>({title:String(x.title||`Part ${i+1}`).slice(0,180),summary:String(x.summary||'').slice(0,400),beats:[]})):[];
    state.lesson={title:String(d.title||$('lessonTitle').textContent),scenes,learningGoals:[],summary:scenes.map(x=>x.summary).filter(Boolean),practice:[]};
    state.lastBeatAt=Date.now();
    state.lessonLoadId++; state.postedBeats=new Set(); state.lastChatScene=-1;
    $('lessonTitle').textContent=state.lesson.title;state.lineNo=0;state.explainBubble=null;$('sceneCounter').textContent='Ready to learn';$('sceneKind').textContent='LIVE CODE';chatStatus('Full explanation streaming below');$('playBtn').disabled=false;$('resetBtn').disabled=false;
    hideError();
    // Guarantee start even if the early play was missed: lesson arrived, so listener is alive now
    if(state.autoPlay){
      sendFrameCommand('play',{value:Number($('speed').value)});
      if(state.pendingSeek!=null){setTimeout(()=>sendFrameCommand('seek',{sceneIndex:state.pendingSeek}),600);state.pendingSeek=null;}
    }
  }
  if(d.type==='neuralelearn:beat'){
    state.lastBeatAt=Date.now();state.stalls=0;hideError();
    const sceneIndex=Math.max(0,Number(d.sceneIndex)||0),beatIndex=Math.max(0,Number(d.beatIndex)||0);state.index=sceneIndex;state.beatIndex=beatIndex;
    const scene=state.lesson?.scenes?.[sceneIndex];if(scene){scene.beats=scene.beats||[];scene.beats[beatIndex]={narration:String(d.narration||''),subtitle:String(d.subtitle||''),durationSeconds:Math.max(2,(Number(d.durationMs)||6000)/1000)};}
    $('lessonTitle').textContent=String(d.title||state.lesson?.title||'NeuraLearn');$('sceneKind').textContent='LIVE CODE';
    const bkey=state.lessonLoadId+':'+sceneIndex+':'+beatIndex;
    if(state.postedBeats&&!state.postedBeats.has(bkey)){
      state.postedBeats.add(bkey);
      state.lineNo=(state.lineNo||0)+1;
      highlightSentence(String(d.narration||''));
      const total=Number(d.totalBeats)||0, sc=$('sceneCounter');
      if(sc)sc.textContent=total?`Line ${state.lineNo} of ${total}`:`Line ${state.lineNo}`;
    }
    const total=Math.max(1,Number(d.totalScenes)||state.lesson?.scenes.length||1),beats=Math.max(1,Number(d.totalBeats)||1);$('progressFill').style.width=`${Math.min(100,((sceneIndex+(beatIndex+1)/beats)/total)*100)}%`;
    // Every lecture line gets the pointer, a subtitle and the chosen voice.
    try{$('lessonFrame').contentWindow.postMessage({type:'neuralelearn:kit',event:'beat'},'*');}catch{}
    const line=String(d.narration||d.subtitle||'').trim();
    if(line&&state.subLine!==bkey){state.subLine=bkey;lectureLine(line);}
  }
  if(d.type==='neuralelearn:finished'){
    const nxt=state.vizIndex>=0?nextPart(state.vizIndex):-1;
    if(nxt>=0){
      if(state.vizParts[nxt].ready){ loadVizPart(nxt); return; }
      state.vizPendingAdvance=true;
      $('sceneCounter').textContent=`Part ${state.vizIndex+1} of ${state.vizParts.length} done, next part almost ready…`;
      chatStatus(`Visual ${nxt+1}/${state.vizParts.length} generating…`);
      pumpViz();
      return;
    }
    state.playing=false;state.paused=false;state.autoPlay=false;setBusy(false);$('playBtn').textContent='↺ Replay lesson';
    document.dispatchEvent(new CustomEvent('lecture:ended'));}
  if(d.type==='neuralelearn:error')addChat('bot',`Visual error: ${String(d.message||'Unknown error')} — the lesson's own script reported this. If playback stalls, hit ↺ Replay or Retry.`);
});
// ---- lecture subtitles and voice (AI tutor lectures) ----
function tsubSet(text){
  const box=$('tsub');if(!box)return;box.replaceChildren();state.tsubWords=[];state.tsubEnds=[];
  const total=text.length||1;let at=0;
  text.split(/(\s+)/).forEach(w=>{if(!w)return;at+=w.length;if(/^\s+$/.test(w)){box.append(w);return;}const sp=document.createElement('span');sp.textContent=w;box.append(sp);state.tsubWords.push(sp);state.tsubEnds.push(at/total);});
  box.hidden=false;
}
function tsubProgress(p){(state.tsubWords||[]).forEach((w,i)=>{const e=state.tsubEnds;w.classList.toggle('said',e[i]<=p+0.02);w.classList.toggle('now',e[i]>p+0.02&&(i===0||e[i-1]<=p+0.02));});}
function lectureLine(text){
  const flag=window.FactCheck&&FactCheck.flagFor(text);
  // A line the fact check marked wrong is held back: the correction is said instead.
  if(flag&&flag.verdict==='wrong') text=`Correction: ${flag.fix}`;
  tsubSet(text);
  $('tsub').classList.toggle('flagged',!!flag&&flag.verdict!=='wrong');$('tsub').classList.toggle('corrected',!!flag&&flag.verdict==='wrong');
  if(flag&&flag.verdict!=='wrong')$('tsub').dataset.flag=flag.fix;
  const rate=Number($('speed').value)||1, est=text.split(/\s+/).length*60000/(160*rate)+500, mine=++state.lineRun;
  const wantVoice=window.Voice&&$('voiceToggle').checked&&Voice.choice!=='off';
  if(!wantVoice){const t0=performance.now();const tick=()=>{if(mine!==state.lineRun)return;const p=(performance.now()-t0)/est;tsubProgress(p);if(p<1)requestAnimationFrame(tick);};tick();return;}
  Voice.speak(text,{rate,onProgress:p=>{if(mine===state.lineRun)tsubProgress(p);}});
}
// The generated lecture carries its narration in its source; collect it so the
// natural voice can record the whole lecture before the lines are reached.
function lectureLines(html){
  const out=[];const re=/narration\s*:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;let m;
  while((m=re.exec(html))&&out.length<40){let t=m[2];try{t=m[1]==='"'?JSON.parse('"'+t+'"'):t.replace(/\\(['`\\])/g,'$1').replace(/\\n/g,' ');}catch{}t=t.replace(/\s+/g,' ').trim();if(t.length>3&&t.length<=420&&!/\$\{/.test(t)&&!out.includes(t))out.push(t);}
  return out;
}
function showError(msg){const b=$('errorBox');if(!b)return;$('errorText').textContent=msg;b.hidden=false;}
function hideError(){const b=$('errorBox');if(b)b.hidden=true;}
const errorClose=$('errorClose');
if(errorClose)errorClose.addEventListener('click',hideError);
const errorRetry=$('errorRetry');
if(errorRetry)errorRetry.addEventListener('click',()=>{hideError();if(state.lastQ)submitChat(state.lastQ);});
const THINK_STEPS=['Understanding your topic','Analysing the concept','Writing the explanation','Designing line-by-line visuals','Syncing voice and motion','Polishing the whiteboard'];
function startThinking(){stopThinking();const ov=$('thinkOverlay');if(ov)ov.hidden=false;let i=0;const tick=()=>{const msg=THINK_STEPS[i%THINK_STEPS.length];i++;chatStatus(msg+'…');const tm=$('thinkMsg');if(tm){tm.textContent=msg;tm.style.animation='none';void tm.offsetWidth;tm.style.animation='';}};tick();state.thinkTimer=setInterval(tick,2200);}
function stopThinking(){if(state.thinkTimer){clearInterval(state.thinkTimer);state.thinkTimer=null;}const ct=$('chatThread');if(ct)ct.querySelectorAll('.chatmsg.thinking').forEach(m=>m.remove());const ov=$('thinkOverlay');if(ov)ov.hidden=true;}
$('playBtn').addEventListener('click',playLoop);$('resetBtn').addEventListener('click',resetPlayback);
$('speed').addEventListener('input',()=>{$('speedLabel').textContent=`${Number($('speed').value).toFixed(2).replace(/0$/,'')}×`;if(state.mode==='code')sendFrameCommand('speed',{value:Number($('speed').value)});});
$('settingsToggle').addEventListener('click',()=>$('settingsDialog').showModal());
document.querySelectorAll('[data-topic]').forEach(btn=>btn.addEventListener('click',()=>submitChat(btn.dataset.topic)));
const pdfInput=$('pdfInput');
if(pdfInput)pdfInput.addEventListener('change',e=>{handlePdfFile(e.target.files&&e.target.files[0]);});
const pdfBtn=$('pdfBtn');
if(pdfBtn)pdfBtn.addEventListener('click',()=>{const pi=$('pdfInput');if(pi)pi.click();});
const chatInput=$('chatInput');
if(chatInput)chatInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); const f=$('chatForm'); if(f)f.requestSubmit(); } });
$('chatForm').addEventListener('submit',e=>{ e.preventDefault(); submitChat($('chatInput').value); });
const newChatBtn=$('newChatBtn');
if(newChatBtn)newChatBtn.addEventListener('click',()=>{
  stopPlayback();
  if(window.Computed){Computed.deactivate();if(state.mode==='computed')state.mode='legacy';}
  state.vizEpoch=(state.vizEpoch||0)+1;state.vizActive=0;
  state.vizParts=[];state.vizNext=0;state.vizIndex=-1;state.vizPendingAdvance=false;
  state.chatHistory=[];state.lastQ='';state.lesson=null;state.codeHtml='';
  state.pdfChunks=null;state.pdfTitle='';const pi=$('pdfInput');if(pi)pi.value='';pdfStatus('No PDF attached.');
  const box=$('chatThread');if(box)box.replaceChildren();
  addChat('bot','Fresh chat — ask any concept, I explain and draw nonstop.');
  $('welcome').hidden=false;$('sceneSvg').hidden=true;$('lessonFrame').hidden=true;{const ts=$('tsub');if(ts)ts.hidden=true;}
  $('lessonTitle').textContent='Your lesson starts here';$('sceneCounter').textContent='Ask anything below to begin';
  chatStatus('Chat with your visual tutor');hideError();
});
if(state.voiceAvailable){const loadVoices=()=>{state.voices=window.speechSynthesis.getVoices();};loadVoices();window.speechSynthesis.onvoiceschanged=loadVoices;}
window.addEventListener('beforeunload',stopPlayback);
checkHealth();
