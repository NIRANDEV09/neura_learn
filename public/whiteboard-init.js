// NeuraLearn Whiteboard Tutor Initialization and Dashboard Integration

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const svgEl = $('whiteboardSvg');
  if (!svgEl) return;

  const renderer = new WhiteboardRenderer(svgEl);

  const controller = new WhiteboardPlaybackController({
    renderer,
    chatContainer: $('wbChatStream'),
    statusEl: $('wbStatusBar'),
    progressEl: $('wbProgressText'),
    progressBar: $('wbProgressBar'),
    stepPill: $('stepPill'),
    titleEl: $('lessonTitle'),
    topicRoadmapEl: $('sidebarRoadmap'),
    playBtn: $('wbPlayBtn'),
    voiceBtn: $('wbVoiceBtn'),
    voiceSpeedSlider: $('voiceSpeedSlider'),
    voiceSpeedVal: $('voiceSpeedVal'),
    quizBox: $('wbQuizCard'),
    quizQuestion: $('wbQuizQuestion'),
    quizOptions: $('wbQuizOptions'),
    quizFeedback: $('wbQuizFeedback')
  });

  window.wbController = controller;

  // Wire Playback Buttons
  $('wbPlayBtn')?.addEventListener('click', () => {
    if (controller.isPlaying) {
      controller.pause();
    } else if (controller.isPaused) {
      controller.resume();
    } else if (controller.steps.length) {
      controller.playStep(controller.currentIndex);
    }
  });

  $('wbVoiceBtn')?.addEventListener('click', () => controller.toggleVoice());
  $('wbSketchBtn')?.addEventListener('click', () => {
    controller.renderer.toggleSketchMode();
    if (controller.steps.length) controller.replayCurrentStep();
  });
  $('nextStepBtn')?.addEventListener('click', () => controller.nextStep());
  $('prevStepBtn')?.addEventListener('click', () => controller.prevStep());
  $('replayStepBtn')?.addEventListener('click', () => controller.replayCurrentStep());
  $('resetLessonBtn')?.addEventListener('click', () => controller.resetLesson());
  $('downloadNotesBtn')?.addEventListener('click', () => controller.exportNotes());
  $('downloadSvgBtn')?.addEventListener('click', () => controller.exportSvg());

  // Interruption handling
  const sendInterrupt = () => {
    const input = $('wbInterruptInput');
    const cmd = input?.value?.trim();
    if (!cmd) return;
    input.value = '';
    controller.handleInterruption(cmd, $('concept')?.value?.trim());
  };

  $('wbSendInterrupt')?.addEventListener('click', sendInterrupt);
  $('wbInterruptInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendInterrupt();
  });

  // Speech recognition for mic button
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('wbMicBtn');
  if (SR && micBtn) {
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      micBtn.textContent = '⏺';
      if ($('wbStatusBar')) $('wbStatusBar').textContent = 'Listening for your question...';
    };
    recognition.onresult = e => {
      const text = e.results[0][0].transcript;
      if ($('wbInterruptInput')) $('wbInterruptInput').value = text;
      sendInterrupt();
    };
    recognition.onerror = e => {
      if ($('wbStatusBar')) $('wbStatusBar').textContent = 'Voice input: ' + (e.error || 'unavailable');
    };
    recognition.onend = () => {
      micBtn.textContent = '🎙';
    };

    micBtn.addEventListener('click', () => {
      try { recognition.start(); } catch (_) {}
    });
  } else if (micBtn) {
    micBtn.disabled = true;
    micBtn.title = 'Speech recognition not supported in this browser';
  }

  // Quick Sample Topic Pills
  document.querySelectorAll('.wb-topic-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const prompt = pill.dataset.prompt;
      if (prompt && $('concept')) {
        $('concept').value = prompt;
        generateLesson();
      }
    });
  });

  // --- Image and PDF File Attachment Handling ---
  window._attachedFile = null;
  const fileInput = $('wbFileInput');
  const previewBadge = $('filePreviewBadge');
  const previewImg = $('filePreviewImg');
  const previewIcon = $('filePreviewIcon');
  const previewName = $('filePreviewName');
  const previewSize = $('filePreviewSize');
  const removeBtn = $('fileRemoveBtn');
  const uploadContainer = $('fileUploadContainer');
  const conceptArea = $('concept');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function handleFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      alert('Please upload an image (PNG, JPG, WebP) or PDF document.');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result;
      window._attachedFile = {
        name: file.name,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
        data: base64,
        size: file.size
      };

      if (previewName) previewName.textContent = file.name;
      if (previewSize) previewSize.textContent = `(${formatBytes(file.size)})`;

      if (isImage && previewImg) {
        previewImg.src = base64;
        previewImg.style.display = 'inline-block';
        if (previewIcon) previewIcon.style.display = 'none';
      } else if (previewIcon) {
        if (previewImg) previewImg.style.display = 'none';
        previewIcon.style.display = 'inline-block';
      }

      if (previewBadge) previewBadge.style.display = 'inline-flex';
      if ($('wbStatusBar')) $('wbStatusBar').textContent = `Attached ${file.name}. Ready to build live lesson.`;

      if (conceptArea && !conceptArea.value.trim()) {
        conceptArea.value = `Solve and explain the question in this ${isImage ? 'image' : 'document'} step-by-step: ${file.name.replace(/\.[^/.]+$/, '')}`;
      }
    };
    reader.readAsDataURL(file);
  }

  fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  removeBtn?.addEventListener('click', () => {
    window._attachedFile = null;
    if (fileInput) fileInput.value = '';
    if (previewBadge) previewBadge.style.display = 'none';
    if ($('wbStatusBar')) $('wbStatusBar').textContent = 'Attachment removed.';
  });

  // Drag and drop handling
  [conceptArea, uploadContainer].forEach(target => {
    if (!target) return;
    target.addEventListener('dragover', e => {
      e.preventDefault();
      target.classList.add('wb-dragover');
    });
    target.addEventListener('dragleave', () => {
      target.classList.remove('wb-dragover');
    });
    target.addEventListener('drop', e => {
      e.preventDefault();
      target.classList.remove('wb-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  });

  // Main Lesson Generation Function
  let activeGenerationController = null;
  async function generateLesson() {
    const concept = $('concept')?.value?.trim() || (window._attachedFile ? `Solve and explain the question in the attached ${window._attachedFile.name}` : '');
    if (!concept && !window._attachedFile) {
      if ($('wbStatusBar')) $('wbStatusBar').textContent = 'Please enter a question or attach an image / PDF.';
      $('concept')?.focus();
      return;
    }

    controller.stopPlayback();
    activeGenerationController?.abort();
    const abortCtrl = new AbortController();
    activeGenerationController = abortCtrl;

    const buildBtn = $('generateBtn');
    if (buildBtn) buildBtn.disabled = true;
    if ($('wbStatusBar')) $('wbStatusBar').textContent = window._attachedFile 
      ? `Analyzing ${window._attachedFile.name} & generating visual lesson...`
      : 'Preparing your animated whiteboard lesson...';
    if ($('modelBadge')) $('modelBadge').textContent = 'Connecting...';

    const payload = {
      concept,
      level: $('level')?.value || 'university beginner',
      language: $('language')?.value || 'English',
      preferences: $('preferences')?.value || 'Teach intuitively with animated whiteboard drawings.'
    };

    if (window._attachedFile) {
      payload.attachment = window._attachedFile;
    }

    try {
      // 1. For uploaded questions (images or PDFs), use /api/lesson for complete, end-to-end mathematical solving
      // This ensures all asked variables (e.g. BOTH acceleration 'a' AND tension 'T') and multiple-choice options are fully solved and highlighted.
      if (window._attachedFile) {
        if ($('wbStatusBar')) $('wbStatusBar').textContent = `Analyzing ${window._attachedFile.name} & solving full question...`;
        if ($('modelBadge')) $('modelBadge').textContent = 'Solving Problem...';
        const fullRes = await fetch('/api/lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortCtrl.signal
        });
        if (!fullRes.ok) {
          const err = await fullRes.json().catch(() => ({}));
          throw new Error(err.error || `Problem solving failed (${fullRes.status})`);
        }
        const lessonData = await fullRes.json();
        controller.loadLesson(lessonData, true);
        if ($('modelBadge')) $('modelBadge').textContent = `${lessonData.provider || 'NeuraLearn'} · Solved`;
        if ($('wbStatusBar')) $('wbStatusBar').textContent = `Full solution ready • ${lessonData.segments?.length || 0} steps`;
        return;
      }

      // 2. Otherwise (text topic), try fast first scene / streaming endpoint
      let response;
      try {
        response = await fetch('/api/lesson/first/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortCtrl.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
        response = null;
      }

      if (response && response.ok) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '', firstScene = null, doneEvent = null;

        const processLine = line => {
          const l = line.trim();
          if (!l) return;
          try {
            const ev = JSON.parse(l);
            if (ev.type === 'delta' && ev.text) {
              fullText += ev.text;
              if (!firstScene) {
                try {
                  const parsed = JSON.parse(fullText);
                  if (parsed && Array.isArray(parsed.segments) && parsed.segments.length) {
                    firstScene = parsed;
                    controller.loadLesson(parsed, true);
                    if ($('modelBadge')) $('modelBadge').textContent = 'Live Playing';
                  }
                } catch (_) {}
              }
            } else if (ev.type === 'done') {
              doneEvent = ev;
            }
          } catch (_) {}
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            processLine(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        if (buffer.trim()) processLine(buffer);

        // If whole lesson was streamed in one shot (e.g. deterministic)
        if (firstScene && firstScene.segments && firstScene.segments.length > 1) {
          controller.loadLesson(firstScene, true);
          if ($('modelBadge')) $('modelBadge').textContent = `${firstScene.provider || 'Ready'} · Active`;
          if ($('wbStatusBar')) $('wbStatusBar').textContent = `Lesson ready • ${firstScene.segments.length} steps`;
          return;
        }

        // If first scene was loaded, fetch the rest in parallel
        if (firstScene && firstScene.segments) {
          const restRes = await fetch('/api/lesson/rest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              firstNarration: firstScene.segments[0]?.narration || '',
              firstActions: firstScene.segments[0]?.actions || firstScene.segments[0]?.visuals || []
            }),
            signal: abortCtrl.signal
          });

          if (restRes.ok) {
            const rest = await restRes.json();
            if (Array.isArray(rest.segments) && rest.segments.length) {
              const fullSegments = [firstScene.segments[0], ...rest.segments];
              const fullLesson = {
                ...firstScene,
                segments: fullSegments,
                checkpoint: rest.checkpoint || firstScene.checkpoint
              };
              // Update remaining steps without interrupting ongoing playback of step 0
              controller.lesson = fullLesson;
              controller.steps = fullSegments;
              controller.renderTranscriptSidebar();
              controller.highlightTranscriptCard(controller.currentIndex);
              controller.updateControls();
              if ($('wbStatusBar')) $('wbStatusBar').textContent = `Full lesson loaded • ${fullSegments.length} steps`;
              if ($('modelBadge')) $('modelBadge').textContent = `${rest.provider || 'Gemini'} · Active`;
              return;
            }
          }
        }
      }

      // 2. Direct fallback to /api/lesson
      const fallbackRes = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortCtrl.signal
      });

      if (!fallbackRes.ok) {
        const err = await fallbackRes.json().catch(() => ({}));
        throw new Error(err.error || `Lesson request failed (${fallbackRes.status})`);
      }

      const lessonData = await fallbackRes.json();
      controller.loadLesson(lessonData, true);
      if ($('modelBadge')) $('modelBadge').textContent = `${lessonData.provider || 'NeuraLearn'} · Active`;
      if ($('wbStatusBar')) $('wbStatusBar').textContent = `Lesson ready • ${lessonData.segments?.length || 0} steps`;
    } catch (e) {
      if (e.name !== 'AbortError') {
        if ($('wbStatusBar')) $('wbStatusBar').textContent = 'Error: ' + e.message;
        if ($('modelBadge')) $('modelBadge').textContent = 'Error';
      }
    } finally {
      if (buildBtn) buildBtn.disabled = false;
      if (activeGenerationController === abortCtrl) activeGenerationController = null;
    }
  }

  $('generateBtn')?.addEventListener('click', generateLesson);

  // Hook into window for hub.js bookmarks compatibility
  window.neuraLessonController = {
    hasLesson: () => !!(controller.lesson && controller.steps.length),
    replay: () => controller.playStep(0),
    bookmarkData: () => ({
      title: controller.lesson?.title || $('concept')?.value || 'Whiteboard Lesson',
      prompt: $('concept')?.value || controller.lesson?.title || '',
      notes: controller.exportNotesText ? controller.exportNotesText() : `# ${controller.lesson?.title || 'Lesson'}\n\n${controller.steps.map((s, i) => `## Step ${i+1}: ${s.heading}\n\n${s.narration}`).join('\n\n')}`
    })
  };
});
