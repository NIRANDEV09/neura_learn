(()=>{
  const $=id=>document.getElementById(id);
  const home=$('modeHome'),chatView=$('chatView'),lessonApp=$('lessonApp'),videoReference=$('videoReference'),videoFrame=$('videoReferenceFrame');
  const KEY='neuralelearn.chat.threads.v1',BOOKMARKS='neuralelearn.bookmarks.v1',PREFS='neuralelearn.preferences.v1';
  let chatLog=[],threadId='',busy=false,recorder=null;

  const escapeHtml=str=>String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  // Fast, clean Markdown-to-HTML parser to eliminate raw asterisks (**) and render bold, headings, code, and lists
  function renderMarkdown(raw){
    if(!raw)return '';
    let str=String(raw);

    // 1. Extract and preserve code blocks
    const codeBlocks=[];
    str=str.replace(/```([a-zA-Z0-9_\-\.]*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
      const idx=codeBlocks.length;
      codeBlocks.push({lang:(lang||'code').trim(),code:escapeHtml(code.trimEnd())});
      return `@@CODE_BLOCK_${idx}@@`;
    });

    // 2. Extract and preserve inline code
    const inlineCodes=[];
    str=str.replace(/`([^`\n]+)`/g,(_,code)=>{
      const idx=inlineCodes.length;
      inlineCodes.push(escapeHtml(code));
      return `@@INLINE_CODE_${idx}@@`;
    });

    // 3. Escape HTML characters in remaining text
    str=escapeHtml(str);

    // 4. Blockquotes
    str=str.replace(/^>[ \t](.+)$/gm,'<blockquote class="chat-quote">$1</blockquote>');
    str=str.replace(/<\/blockquote>\n<blockquote class="chat-quote">/g,'<br>');

    // 5. Headings
    str=str.replace(/^###[ \t]+(.+)$/gm,'<h3 class="chat-h3">$1</h3>');
    str=str.replace(/^##[ \t]+(.+)$/gm,'<h2 class="chat-h2">$1</h2>');
    str=str.replace(/^#[ \t]+(.+)$/gm,'<h1 class="chat-h1">$1</h1>');

    // 6. Horizontal rule
    str=str.replace(/^(?:---|\*\*\*|___)[ \t]*$/gm,'<hr class="chat-hr">');

    // 7. Bold and Italics (eliminate raw ** and *)
    str=str.replace(/\*\*\*([^\*\n]+?)\*\*\*/g,'<strong><em>$1</em></strong>');
    str=str.replace(/___([^_\n]+?)___/g,'<strong><em>$1</em></strong>');
    str=str.replace(/\*\*([^\*\n]+?)\*\*/g,'<strong>$1</strong>');
    str=str.replace(/__([^_\n]+?)__/g,'<strong>$1</strong>');
    str=str.replace(/\*([^\*\n]+?)\*/g,'<em>$1</em>');
    str=str.replace(/(^|\s)_([^_\n]+?)_(\s|$)/g,'$1<em>$2</em>$3');

    // Strip any dangling double asterisks that could appear at stream ends
    str=str.replace(/\*\*/g,'');

    // 8. Lists
    str=str.replace(/^[ \t]*[\*\-\+][ \t]+(.+)$/gm,'<li class="chat-list-item">$1</li>');
    str=str.replace(/((?:<li class="chat-list-item">.*?<\/li>\n?)+)/g,'<ul class="chat-ul">$1</ul>');

    str=str.replace(/^[ \t]*(\d+)\.[ \t]+(.+)$/gm,'<li class="chat-num-item" data-num="$1">$2</li>');
    str=str.replace(/((?:<li class="chat-num-item"[^>]*>.*?<\/li>\n?)+)/g,'<ol class="chat-ol">$1</ol>');

    // 9. Paragraphs and line breaks
    str=str.replace(/\n\n+/g,'</p><p class="chat-p">');
    str=str.replace(/\n/g,'<br>');

    // Clean up empty tags and breaks around block elements
    str=str.replace(/<p class="chat-p">\s*<\/(h[1-3]|ul|ol|blockquote|div|pre)>/g,'</$1>');
    str=str.replace(/<(h[1-3]|ul|ol|blockquote|div|pre)([^>]*)>\s*<\/p>/g,'<$1$2>');
    str=str.replace(/<br>\s*<(ul|ol|h1|h2|h3|blockquote|pre)/g,'<$1');
    str=str.replace(/<\/(ul|ol|h1|h2|h3|blockquote|pre)>\s*<br>/g,'</$1>');

    // 10. Restore inline code
    str=str.replace(/@@INLINE_CODE_(\d+)@@/g,(_,idx)=>{
      const code=inlineCodes[Number(idx)]||'';
      return `<code class="chat-inline-code">${code}</code>`;
    });

    // 11. Restore code blocks with Header & Copy button
    str=str.replace(/@@CODE_BLOCK_(\d+)@@/g,(_,idx)=>{
      const item=codeBlocks[Number(idx)];
      if(!item)return '';
      const lang=item.lang||'code';
      return `<div class="chat-code-card"><div class="chat-code-header"><span class="chat-code-lang">${escapeHtml(lang)}</span><button type="button" class="chat-copy-code-btn" onclick="navigator.clipboard.writeText(this.closest('.chat-code-card').querySelector('code').textContent).then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy',1600)})">Copy</button></div><pre class="chat-pre"><code class="chat-code language-${escapeHtml(lang)}">${item.code}</code></pre></div>`;
    });

    return `<p class="chat-p">${str}</p>`.replace(/<p class="chat-p">\s*<\/p>/g,'');
  }

  const readThreads=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const safeText=x=>String(x??'');

  function renderRecents(){
    const box=$('chatRecent');
    if(!box)return;
    box.replaceChildren();
    readThreads().slice().reverse().slice(0,30).forEach(t=>{
      const b=document.createElement('button');
      b.textContent=t.title||'New chat';
      b.onclick=()=>loadThread(t.id);
      box.append(b);
    });
  }

  function saveThread(){
    if(!chatLog.length)return;
    const all=readThreads();
    const prior=all.findIndex(x=>x.id===threadId);
    const t={id:threadId||String(Date.now()),title:chatLog.find(m=>m.role==='user')?.content?.slice(0,48)||'New chat',messages:chatLog.slice(-40)};
    threadId=t.id;
    if(prior>=0)all[prior]=t;else all.push(t);
    try{localStorage.setItem(KEY,JSON.stringify(all.slice(-30)))}catch{}
    renderRecents();
  }

  function renderMessages(){
    const host=$('chatMessages');
    host.replaceChildren();
    if(!chatLog.length){
      const welcome=document.createElement('div');
      welcome.className='chat-welcome';
      welcome.innerHTML='<span class="chat-spark">✦</span><h1>What can I help you learn?</h1><p>Ask a question and get a clear, thoughtful answer.</p><div class="chat-suggestions"><button data-prompt="Explain photosynthesis in simple terms">Explain photosynthesis simply</button><button data-prompt="Help me understand linked lists with an example">Teach me linked lists</button><button data-prompt="Walk me through solving a quadratic equation">Solve a quadratic equation</button></div>';
      host.append(welcome);
      welcome.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>sendMessage(b.dataset.prompt));
      return;
    }
    chatLog.forEach(m=>{
      const row=document.createElement('div');
      row.className='chat-msg '+(m.role==='user'?'user':'assistant');
      if(m.role==='assistant'){
        const icon=document.createElement('span');
        icon.className='chat-role';
        icon.textContent='✦';
        row.append(icon);
      }
      const bubble=document.createElement('div');
      bubble.className='chat-bubble';
      if(m.role==='assistant'){
        bubble.innerHTML=renderMarkdown(m.content);
      }else{
        bubble.textContent=m.content;
      }
      row.append(bubble);
      host.append(row);
    });
    host.scrollTop=host.scrollHeight;
  }

  function show(mode){
    home.hidden=mode!=='home';
    chatView.hidden=mode!=='chat';
    videoReference.hidden=mode!=='video';
    lessonApp.hidden=mode!=='canvas';
    document.body.dataset.mode=mode;

    if(mode==='video'){
      if(!videoFrame.src)videoFrame.src='http://127.0.0.1:3005/app/?embed=video&parentOrigin='+encodeURIComponent(location.origin)+'#/tutor';
    }
    if(mode==='canvas'){
      if($('lessonModeLabel')) $('lessonModeLabel').textContent='AI Whiteboard Tutor';
      if($('lessonTitle')) $('lessonTitle').textContent='Interactive Animated Whiteboard';
      if($('lessonMeta')) $('lessonMeta').textContent='Progressive SVG vector illustrations drawn and narrated in real time';
      if($('recordVideoBtn')) $('recordVideoBtn').hidden=true;
      const bp=document.querySelector('.brand .pill');
      if(bp) bp.textContent='AI WHITEBOARD';
      applyPreferences();
    }
    if(mode==='chat'){
      renderMessages();
      renderRecents();
      setTimeout(()=>$('groqChatInput').focus(),30);
    }
  }

  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.mode)));
  document.querySelectorAll('[data-back-home]').forEach(b=>b.addEventListener('click',()=>showHomeSection('home')));

  function showHomeSection(name='home'){
    show('home');
    $('homeLanding').hidden=name!=='home';
    $('hubBookmarksPage').hidden=name!=='bookmarks';
    $('hubSettingsPage').hidden=name!=='settings';
    document.querySelectorAll('[data-hub-nav]').forEach(x=>x.classList.toggle('active',x.dataset.hubNav===name));
    if(name==='bookmarks')renderBookmarks();
    if(name==='settings')loadPreferences();
  }

  document.querySelectorAll('[data-hub-nav]').forEach(b=>b.addEventListener('click',()=>{
    const section=b.dataset.hubNav;
    if(section==='history'){
      show('chat');
      renderRecents();
    } else {
      showHomeSection(section);
    }
  }));

  function readBookmarks(){try{return JSON.parse(localStorage.getItem(BOOKMARKS)||'[]')}catch{return[]}}

  function renderBookmarks(){
    const host=$('hubBookmarkList');
    host.replaceChildren();
    const items=readBookmarks();
    if(!items.length){
      const empty=document.createElement('p');
      empty.className='hub-empty';
      empty.textContent='No bookmarked lessons yet. Open a visual lesson and choose “Save bookmark” to keep it here.';
      host.append(empty);
      return;
    }
    items.slice().reverse().forEach(item=>{
      const card=document.createElement('article');
      card.className='hub-bookmark-card';
      const title=document.createElement('h2');
      title.textContent=item.title;
      const prompt=document.createElement('p');
      prompt.textContent=item.prompt;
      const meta=document.createElement('small');
      meta.textContent=new Date(item.savedAt).toLocaleString();
      const actions=document.createElement('div');
      actions.className='hub-bookmark-actions';
      const open=document.createElement('button');
      open.textContent='Open prompt';
      open.onclick=()=>{
        if(item.mode==='video'){
          show('video');
          videoFrame.contentWindow?.postMessage({type:'neuralelearn:open-bookmark',prompt:item.prompt},'http://127.0.0.1:3005');
          return;
        }
        show('canvas');
        $('concept').value=item.prompt;
        $('concept').focus();
      };
      const download=document.createElement('button');
      download.textContent='Download notes';
      download.onclick=()=>{
        const a=document.createElement('a'),blob=new Blob([item.notes||('# '+item.title+'\n\n'+item.prompt+'\n')],{type:'text/markdown;charset=utf-8'});
        a.href=URL.createObjectURL(blob);
        a.download=(item.title||'lesson').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.md';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      };
      const remove=document.createElement('button');
      remove.textContent='Remove';
      remove.onclick=()=>{
        localStorage.setItem(BOOKMARKS,JSON.stringify(readBookmarks().filter(x=>x.id!==item.id)));
        renderBookmarks();
      };
      actions.append(open,download,remove);
      card.append(title,prompt,meta,actions);
      host.append(card);
    });
  }

  function loadPreferences(){
    let p={};try{p=JSON.parse(localStorage.getItem(PREFS)||'{}')}catch{}
    $('settingName').value=p.name||'';
    $('settingLevel').value=p.level||'university beginner';
    $('settingLanguage').value=p.language||'English';
  }

  function applyPreferences(){
    let p={};try{p=JSON.parse(localStorage.getItem(PREFS)||'{}')}catch{}
    if($('level')&&p.level)$('level').value=p.level;
    if($('language')&&p.language)$('language').value=p.language;
    const name=(p.name||'N').trim();
    document.querySelectorAll('.hub-avatar').forEach(a=>a.textContent=(name[0]||'N').toUpperCase());
  }

  $('hubSettingsForm').addEventListener('submit',e=>{
    e.preventDefault();
    const p={name:$('settingName').value.trim().slice(0,40),level:$('settingLevel').value,language:$('settingLanguage').value};
    localStorage.setItem(PREFS,JSON.stringify(p));
    applyPreferences();
    $('hubSettingsStatus').textContent='Settings saved on this device.';
    setTimeout(()=>$('hubSettingsStatus').textContent='',2400);
  });

  $('videoBookmark').addEventListener('click',()=>{
    videoFrame.contentWindow?.postMessage({type:'neuralelearn:save-bookmark'},'http://127.0.0.1:3005');
    $('videoBookmark').textContent='… Save bookmark';
  });

  window.addEventListener('message',e=>{
    if(e.origin!=='http://127.0.0.1:3005'||e.source!==videoFrame.contentWindow||e.data?.type!=='neuralelearn:bookmark-data')return;
    if(!e.data.prompt){
      $('videoBookmark').textContent='Ask a topic first';
      setTimeout(()=>$('videoBookmark').textContent='♧ Save bookmark',1800);
      return;
    }
    const entry={id:String(Date.now()),savedAt:new Date().toISOString(),mode:'video',title:e.data.title||e.data.prompt,prompt:e.data.prompt,notes:e.data.notes||''};
    const items=readBookmarks();
    items.push(entry);
    localStorage.setItem(BOOKMARKS,JSON.stringify(items.slice(-100)));
    $('videoBookmark').textContent='✓ Bookmarked';
    setTimeout(()=>$('videoBookmark').textContent='♧ Save bookmark',1800);
  });

  $('lessonBookmark').addEventListener('click',()=>{
    const data=window.neuraLessonController?.bookmarkData?.();
    if(!data?.prompt){
      const st=$('wbStatusBar')||$('status');
      if(st)st.textContent='Generate a lesson before bookmarking it.';
      return;
    }
    const items=readBookmarks(),entry={id:String(Date.now()),savedAt:new Date().toISOString(),mode:document.body.dataset.mode==='canvas'?'canvas':'video',title:data.title||data.prompt,prompt:data.prompt,notes:data.notes||''};
    items.push(entry);
    localStorage.setItem(BOOKMARKS,JSON.stringify(items.slice(-100)));
    $('lessonBookmark').textContent='✓ Bookmarked';
    setTimeout(()=>$('lessonBookmark').textContent='♧ Save bookmark',1600);
  });

  $('hubSearch').addEventListener('submit',e=>{
    e.preventDefault();
    const q=$('hubQuery').value.trim();
    if(!q)return;
    show('chat');
    sendMessage(q);
    $('hubQuery').value='';
  });

  $('chatNew').addEventListener('click',()=>{
    saveThread();
    threadId='';
    chatLog=[];
    renderMessages();
    $('groqChatInput').focus();
  });

  function loadThread(id){
    const t=readThreads().find(x=>x.id===id);
    if(!t)return;
    threadId=t.id;
    chatLog=Array.isArray(t.messages)?t.messages.slice():[];
    renderMessages();
  }

  async function sendMessage(text){
    const q=String(text||'').trim();
    if(!q||busy)return;
    chatLog.push({role:'user',content:q});
    const host=$('chatMessages');
    const welcome=host.querySelector('.chat-welcome');
    if(welcome)welcome.remove();
    const user=document.createElement('div');
    user.className='chat-msg user';
    const ub=document.createElement('div');
    ub.className='chat-bubble';
    ub.textContent=q;
    user.append(ub);
    host.append(user);
    const row=document.createElement('div');
    row.className='chat-msg assistant';
    const icon=document.createElement('span');
    icon.className='chat-role';
    icon.textContent='✦';
    const bubble=document.createElement('div');
    bubble.className='chat-bubble chat-typing';
    bubble.textContent='Thinking…';
    row.append(icon,bubble);
    host.append(row);
    host.scrollTop=host.scrollHeight;
    busy=true;
    $('groqSend').disabled=true;
    $('chatStatus').textContent='Groq is preparing an answer…';

    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:chatLog.slice(-24)})});
      if(!r.ok){
        const e=await r.json().catch(()=>({}));
        throw new Error(e.error||`Chat failed (${r.status})`);
      }
      bubble.classList.remove('chat-typing');
      bubble.innerHTML='';
      const reader=r.body.getReader(),decoder=new TextDecoder();
      let buf='',answer='';
      for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        buf+=decoder.decode(value,{stream:true});
        let i;
        while((i=buf.indexOf('\n'))>=0){
          const line=buf.slice(0,i).trim();
          buf=buf.slice(i+1);
          if(!line)continue;
          let msg;
          try{msg=JSON.parse(line)}catch{continue}
          if(msg.error)throw new Error(msg.error);
          if(msg.text){
            answer+=msg.text;
            bubble.innerHTML=renderMarkdown(answer);
            const isNearBottom=host.scrollHeight-host.scrollTop-host.clientHeight<130;
            if(isNearBottom){
              host.scrollTop=host.scrollHeight;
            }
          }
        }
      }
      if(buf.trim()){
        try{
          const msg=JSON.parse(buf);
          if(msg.text){
            answer+=msg.text;
            bubble.innerHTML=renderMarkdown(answer);
          }
        }catch{}
      }
      if(!answer.trim())throw new Error('Groq returned an empty answer. Please try again.');
      chatLog.push({role:'assistant',content:answer});
      saveThread();
      $('chatStatus').textContent='Answered by Groq · '+(window.chatModel||'GPT-OSS 20B');
    } catch(e){
      bubble.classList.remove('chat-typing');
      bubble.textContent='I could not get an answer: '+e.message+'\nCheck the Groq API key in the local server configuration.';
      $('chatStatus').textContent='Chat request failed.';
      chatLog.pop();
    } finally {
      busy=false;
      $('groqSend').disabled=false;
      $('groqChatInput').focus();
    }
  }

  $('groqChatForm').addEventListener('submit',e=>{
    e.preventDefault();
    const input=$('groqChatInput'),q=input.value;
    input.value='';
    input.style.height='auto';
    sendMessage(q);
  });

  $('groqChatInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      $('groqChatForm').requestSubmit();
    }
  });

  $('groqChatInput').addEventListener('input',e=>{
    e.target.style.height='auto';
    e.target.style.height=Math.min(e.target.scrollHeight,160)+'px';
  });

  // Floating Scroll-To-Bottom button logic for text chat
  const chatMessagesEl=$('chatMessages');
  const scrollBottomBtn=$('chatScrollBottomBtn');
  if(chatMessagesEl&&scrollBottomBtn){
    chatMessagesEl.addEventListener('scroll',()=>{
      const dist=chatMessagesEl.scrollHeight-chatMessagesEl.scrollTop-chatMessagesEl.clientHeight;
      scrollBottomBtn.hidden=dist<140;
    });
    scrollBottomBtn.addEventListener('click',()=>{
      chatMessagesEl.scrollTo({top:chatMessagesEl.scrollHeight,behavior:'smooth'});
    });
  }

  const mimeTypes=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];

  function saveVideo(blob){
    const a=document.createElement('a'),url=URL.createObjectURL(blob),ext=blob.type.includes('mp4')?'mp4':'webm';
    a.href=url;
    a.download='neuralelearn-lesson.'+ext;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function recordLesson(){
    const btn=$('recordVideoBtn');
    if(recorder){recorder.stop();return}
    if(!window.neuraLessonController?.hasLesson()){alert('Generate a video lesson first, then record it.');return}
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){alert('Video recording needs Chrome or Edge.');return}
    let stream;
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:30},audio:true,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',systemAudio:'exclude'});
    }catch(e){
      if(e.name!=='NotAllowedError')alert('Could not start recording: '+e.message);
      return;
    }
    const track=stream.getVideoTracks()[0];
    try{if(window.CropTarget&&track.cropTo)await track.cropTo(await CropTarget.fromElement($('board')))}catch{}
    const mime=mimeTypes.find(t=>MediaRecorder.isTypeSupported(t))||'',rec=mime?new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000}):new MediaRecorder(stream),chunks=[];
    recorder=rec;
    rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    const finish=()=>{if(rec.state!=='inactive')rec.stop();stream.getTracks().forEach(t=>t.stop())};
    rec.onstop=()=>{
      window.removeEventListener('lesson:ended',ended);
      recorder=null;
      btn.textContent='● Record video';
      if(chunks.length)saveVideo(new Blob(chunks,{type:mime.split(';')[0]||'video/webm'}));
    };
    const ended=()=>setTimeout(finish,1200);
    window.addEventListener('lesson:ended',ended,{once:true});
    track.addEventListener('ended',finish,{once:true});
    rec.start(1000);
    btn.textContent='■ Stop recording';
    if(!stream.getAudioTracks().length)alert('Recording without sound. Select this tab and enable tab audio in the share dialog.');
    window.neuraLessonController.replay();
  }

  $('recordVideoBtn')?.addEventListener('click',recordLesson);

  renderRecents();
  applyPreferences();
  show('home');
})();
