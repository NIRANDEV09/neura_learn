// Downloads for AI lectures.
// 1. Lecture file (.html): one self-contained file with every part's drawn
//    lesson and a small player (subtitles, the teacher's pointer, a browser
//    voice, part navigation). It opens in any browser and plays offline.
// 2. Video (.mp4 where the browser can record it, otherwise .webm): records
//    the board while the lecture replays from the start, using the browser's
//    tab capture (the student picks this tab), cropped to the board when the
//    browser supports it. Tab audio carries the natural voice.
(() => {
  const $ = id => document.getElementById(id);
  const notify = (text, kind = '') => document.dispatchEvent(new CustomEvent('nl:notify', { detail: { text, kind } }));
  const slug = t => String(t || 'lecture').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'lecture';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.hidden = true;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  // Minimal markdown for the written answer: paragraphs, bold, code blocks.
  function answerHtml(md) {
    const out = [];
    String(md || '').replace(/\r/g, '').split(/\n```[a-z]*\n?|```/).forEach((chunk, k) => {
      if (k % 2) { out.push(`<pre>${esc(chunk.trim())}</pre>`); return; }
      chunk.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).forEach(p => out.push(`<p>${esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`));
    });
    return out.join('');
  }

  // The standalone file. The lecture data sits in a JSON block ("<" escaped so
  // no lesson can close the script tag); each part runs in a sandboxed iframe,
  // exactly as in the app.
  function lectureFile(lec) {
    const data = JSON.stringify({ title: lec.title, parts: lec.parts.map(p => ({ title: p.title, html: p.html })) }).replace(/</g, '\\u003c');
    const kit = typeof nlBoardKit === 'function' ? `(${nlBoardKit.toString()})();`.replace(/<\/script/gi, '<\\/script') : '';
    const saved = new Date().toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(lec.title)} · NeuraLearn lecture</title>
<style>
:root{--bg:#f4f6fb;--surface:#fff;--ink:#121a3a;--ink2:#3b4466;--muted:#6b7394;--line:#e6e9f3;--accent:#5b5bf0;--marker:#f5b301}
@media (prefers-color-scheme:dark){:root{--bg:#0b1024;--surface:#131b38;--ink:#eef0ff;--ink2:#c5cae8;--muted:#8f97bd;--line:#252e5a;--accent:#8483ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
.brand{font-size:12px;letter-spacing:.14em;font-weight:700;color:var(--accent)}h1{font-size:24px;line-height:1.25;margin:4px 0 4px}.meta{color:var(--muted);font-size:13px;margin:0 0 16px}
.stage{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;aspect-ratio:16/10}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.sub{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);max-width:88%;background:rgba(10,14,38,.82);color:#fff;padding:8px 14px;border-radius:10px;font-size:15px;text-align:center;pointer-events:none}.sub:empty{display:none}
.start{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,14,38,.45);border:0;cursor:pointer;color:#fff;font:600 18px inherit}
.start span{background:var(--accent);padding:14px 22px;border-radius:14px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0 24px}
button.b{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 12px;font:inherit;font-size:14px;cursor:pointer}button.b:disabled{opacity:.45;cursor:default}
.count{color:var(--muted);font-size:13px;margin-left:auto}label{font-size:14px;color:var(--ink2);display:flex;gap:6px;align-items:center}
.answer{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:6px 20px}.answer h2{font-size:16px}pre{background:var(--bg);border-radius:10px;padding:12px;overflow:auto;font-size:13px}
footer{color:var(--muted);font-size:12px;margin-top:20px}
</style></head><body><main>
<div class="brand">NEURALEARN · SAVED LECTURE</div>
<h1>${esc(lec.title)}</h1>
<p class="meta">${lec.parts.length} ${lec.parts.length === 1 ? 'part' : 'parts'} · saved ${esc(saved)} · plays offline</p>
<div class="stage"><iframe id="f" title="Lecture" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><div id="sub" class="sub" aria-live="polite"></div><button id="start" class="start" type="button"><span>▶ Play lecture</span></button></div>
<div class="bar"><button class="b" id="prev" type="button">◀ Part</button><button class="b" id="pp" type="button" disabled>❚❚ Pause</button><button class="b" id="next" type="button">Part ▶</button>
<label><input id="voice" type="checkbox" checked> Voice</label><span class="count" id="count"></span></div>
${lec.explanation ? `<section class="answer"><h2>The written answer</h2>${answerHtml(lec.explanation)}</section>` : ''}
<footer>Made with NeuraLearn. The drawings, subtitles and pointer run in this file; the voice uses your browser's speech.</footer>
</main>
<script type="application/json" id="data">${data}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent), KIT=${JSON.stringify(kit)};
var f=document.getElementById('f'), sub=document.getElementById('sub'), pp=document.getElementById('pp'), voice=document.getElementById('voice'), i=0, playing=false, started=false;
function $(id){return document.getElementById(id)}
function send(c){try{f.contentWindow.postMessage({type:'neuralelearn:command',command:c,value:1},'*')}catch(e){}}
function wrap(h){var s=KIT?'<script>'+KIT+'<\\/script>':'';return /<head[^>]*>/i.test(h)?h.replace(/<head[^>]*>/i,function(m){return m+s}):s+h}
var vs=null;function pick(){var v=speechSynthesis.getVoices().filter(function(x){return /^en/i.test(x.lang)});vs=v.find(function(x){return /natural|neural|google/i.test(x.name)})||v[0]||null}
if('speechSynthesis' in window){pick();speechSynthesis.onvoiceschanged=pick}
function say(t){if(!voice.checked||!('speechSynthesis' in window)||!t)return;speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);if(vs)u.voice=vs;u.rate=1;speechSynthesis.speak(u)}
function load(k){i=Math.max(0,Math.min(D.parts.length-1,k));sub.textContent='';if('speechSynthesis' in window)speechSynthesis.cancel();f.srcdoc=wrap(D.parts[i].html);$('count').textContent='Part '+(i+1)+' of '+D.parts.length+' · '+D.parts[i].title;$('prev').disabled=i===0;$('next').disabled=i===D.parts.length-1}
f.onload=function(){if(!started)return;playing=true;pp.disabled=false;pp.textContent='❚❚ Pause';send('play');setTimeout(function(){if(playing)send('play')},800)};
addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d||typeof d.type!=='string')return;
if(d.type==='neuralelearn:beat'){var line=String(d.narration||d.subtitle||'').trim();sub.textContent=line;try{f.contentWindow.postMessage({type:'neuralelearn:kit',event:'beat'},'*')}catch(x){}say(line)}
if(d.type==='neuralelearn:finished'){if(i<D.parts.length-1)load(i+1);else{playing=false;pp.textContent='↺ Replay';sub.textContent=''}}});
$('start').onclick=function(){started=true;this.remove();load(0)};
pp.onclick=function(){if(pp.textContent.indexOf('Replay')>=0){load(0);return}playing=!playing;send(playing?'play':'pause');if('speechSynthesis' in window){playing?speechSynthesis.resume():speechSynthesis.pause()}pp.textContent=playing?'❚❚ Pause':'▶ Play'};
$('prev').onclick=function(){started=true;var s=$('start');if(s)s.remove();load(i-1)};$('next').onclick=function(){started=true;var s=$('start');if(s)s.remove();load(i+1)};
$('count').textContent=D.parts.length+(D.parts.length===1?' part':' parts');$('prev').disabled=true;$('next').disabled=D.parts.length<2;
})();
</script>
</body></html>`;
  }

  function downloadFile(lec) {
    if (!lec || !lec.parts || !lec.parts.length) { notify('There is no drawn lecture to download yet.'); return; }
    saveBlob(new Blob([lectureFile(lec)], { type: 'text/html;charset=utf-8' }), `${slug(lec.title)}.html`);
    notify(`Downloaded the lecture file: ${slug(lec.title)}.html`, 'ok');
  }

  // ---------- video ----------
  let recording = null;
  const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  async function recordVideo() {
    if (recording) { recording.stop(); return; }
    const lec = window.currentLecture && window.currentLecture();
    if (!lec) { notify('Open or generate a lecture first, then record it.'); return; }
    if (!canRecord()) { notify('This browser cannot record video. Use Chrome or Edge, or download the lecture file instead.'); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'exclude' });
    } catch (e) { if (e.name !== 'NotAllowedError') notify(`Could not start recording: ${e.message}`); return; }
    const [track] = stream.getVideoTracks();
    // Record just the board when the browser supports cropping a tab capture.
    try { if (window.CropTarget && track.cropTo) await track.cropTo(await CropTarget.fromElement($('board'))); } catch { /* full tab instead */ }
    const mime = VIDEO_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : {});
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const btn = $('dlVideo'), label = btn.textContent;
    const finish = () => { if (rec.state !== 'inactive') rec.stop(); stream.getTracks().forEach(t => t.stop()); };
    rec.onstop = () => {
      document.removeEventListener('lecture:ended', onEnded);
      recording = null; btn.textContent = label; $('dlBtn').classList.remove('recording');
      if (!chunks.length) { notify('The recording was empty.'); return; }
      const type = (mime || 'video/webm').split(';')[0];
      saveBlob(new Blob(chunks, { type }), `${slug(lec.title)}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
      notify(`Video saved: ${slug(lec.title)}.${type.includes('mp4') ? 'mp4' : 'webm'}`, 'ok');
    };
    const onEnded = () => setTimeout(finish, 1500); // keep the last frame a moment
    document.addEventListener('lecture:ended', onEnded);
    track.addEventListener('ended', finish); // the student pressed the browser's "Stop sharing"
    recording = { stop: finish };
    btn.textContent = '■ Stop recording'; $('dlBtn').classList.add('recording');
    rec.start(1000);
    if (!stream.getAudioTracks().length) notify('Recording without sound: tick "Share tab audio" next time to include the voice.');
    window.replayLectureFromStart();
  }

  // ---------- the Download menu in the player ----------
  function wire() {
    const btn = $('dlBtn'), menu = $('dlMenu'); if (!btn) return;
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', e => { e.stopPropagation(); if (recording) { recording.stop(); return; } menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    $('dlFile').addEventListener('click', () => { close(); downloadFile(window.currentLecture && window.currentLecture()); });
    $('dlVideo').addEventListener('click', () => { close(); recordVideo(); });
    if (!canRecord()) { $('dlVideo').disabled = true; $('dlVideo').title = 'Video recording needs Chrome or Edge on a computer.'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  window.Download = { file: downloadFile, video: recordVideo, lectureFile };
})();
