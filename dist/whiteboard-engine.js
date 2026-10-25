// NeuraLearn Real-Time Animated AI Whiteboard Engine
// Coordinates SVG stroke-reveal animations, dynamic flow particles, progressive labels,
// Web Speech API narration, playback controls, step seeking, and live interruptions.

class WhiteboardRenderer {
  constructor(svgElement) {
    this.svg = typeof svgElement === 'string' ? document.getElementById(svgElement) : svgElement;
    this.elements = new Map();
    this.stepHistory = []; // array of Set(elementIds) added in each step
    this.activeAnimations = [];
    this.sketchMode = true; // Default to authentic hand-drawn whiteboard sketch
    this.rc = null;
    this.initSvg();
  }

  initSvg() {
    if (!this.svg) return;
    this.svg.innerHTML = '';
    this.svg.setAttribute('viewBox', '0 0 960 700');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.classList.add('wb-sketch-canvas');

    // Create defs with arrow markers, gradients, and filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrowDefault" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#333740" />
      </marker>
      <marker id="arrowBlue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#2b72b8" />
      </marker>
      <marker id="arrowRed" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#c93d32" />
      </marker>
      <marker id="arrowGreen" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#2ea44f" />
      </marker>
      <marker id="arrowGold" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#e3a83e" />
      </marker>
      <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    `;
    this.svg.appendChild(defs);

    // Layer groups for clean SVG ordering
    this.gBase = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.gBase.setAttribute('id', 'layer-base');
    this.gMain = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.gMain.setAttribute('id', 'layer-main');
    this.gFlow = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.gFlow.setAttribute('id', 'layer-flow');
    this.gText = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.gText.setAttribute('id', 'layer-text');

    this.svg.append(this.gBase, this.gMain, this.gFlow, this.gText);
    this.elements.clear();
    this.stepHistory = [];

    // Initialize RoughJS instance for hand-sketched whiteboard drawing
    if (typeof window !== 'undefined' && window.rough) {
      try {
        this.rc = window.rough.svg(this.svg);
      } catch (e) {
        console.warn('Rough.js initialization:', e);
        this.rc = null;
      }
    }
  }

  setSketchMode(enabled) {
    this.sketchMode = !!enabled;
    const btn = document.getElementById('wbSketchBtn');
    if (btn) {
      btn.textContent = this.sketchMode ? '✍ Sketch: On' : '✍ Sketch: Off';
      btn.classList.toggle('active', this.sketchMode);
    }
  }

  toggleSketchMode() {
    this.setSketchMode(!this.sketchMode);
    return this.sketchMode;
  }

  clear() {
    this.cancelAnimations();
    this.initSvg();
  }

  cancelAnimations() {
    this.activeAnimations.forEach(id => clearTimeout(id));
    this.activeAnimations = [];
  }

  // Coordinate normalizer: converts percentage strings (e.g. "50%") or preserves exact SVG viewBox coordinates
  normalizeX(val) {
    if (typeof val === 'string' && val.trim().endsWith('%')) {
      return (parseFloat(val) / 100) * 960;
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }

  normalizeY(val) {
    if (typeof val === 'string' && val.trim().endsWith('%')) {
      return (parseFloat(val) / 100) * 700;
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }

  getArrowMarker(color) {
    const hex = String(color || '').toLowerCase();
    if (hex.includes('2b72') || hex.includes('blue') || hex.includes('1769')) return 'url(#arrowBlue)';
    if (hex.includes('c93d') || hex.includes('red') || hex.includes('d43b')) return 'url(#arrowRed)';
    if (hex.includes('2ea4') || hex.includes('green') || hex.includes('3c87')) return 'url(#arrowGreen)';
    if (hex.includes('e3a8') || hex.includes('amber') || hex.includes('c77b')) return 'url(#arrowGold)';
    return 'url(#arrowDefault)';
  }

  // Execute an action immediately or with animation
  executeAction(action, animated = true) {
    if (!action || typeof action !== 'object') return;
    const op = String(action.op || action.type || 'reveal').toLowerCase();
    const id = action.id || ('el_' + Math.random().toString(36).substr(2, 9));

    // Handle legacy 'visuals' format
    if (!action.op && action.type) {
      return this.renderLegacyVisual(action, animated);
    }

    switch (op) {
      case 'draw_path':
        this.renderPath(id, action, animated);
        break;
      case 'draw_rect':
        this.renderRect(id, action, animated);
        break;
      case 'draw_circle':
        this.renderCircle(id, action, animated);
        break;
      case 'draw_arrow':
      case 'draw_line':
        this.renderArrow(id, action, animated);
        break;
      case 'draw_text':
      case 'draw_formula':
        this.renderText(id, action, animated);
        break;
      case 'flow':
      case 'marker':
        this.renderFlowMarker(id, action, animated);
        break;
      case 'highlight':
      case 'pulse':
        this.highlightElement(action.id || action.targetId, action);
        break;
      case 'reveal':
      case 'appear':
        this.renderReveal(id, action, animated);
        break;
      case 'clear':
        if (action.targetIds) {
          action.targetIds.forEach(tid => this.removeElement(tid));
        } else {
          this.clear();
        }
        break;
    }
  }

  // --- Primitives Implementations with Rough.js Hand-Drawn Sketch Support ---

  renderPath(id, action, animated) {
    if (this.sketchMode && this.rc && action.d && action.rough !== false) {
      try {
        const strokeColor = action.stroke || '#22262b';
        const strokeW = Number(action.strokeWidth) || 2.5;
        const fillCol = (action.fill && action.fill !== 'none') ? action.fill : undefined;
        const roughness = action.roughness !== undefined ? Number(action.roughness) : 1.35;
        const bowing = action.bowing !== undefined ? Number(action.bowing) : 1.1;

        const g = this.rc.path(action.d, {
          roughness,
          bowing,
          stroke: strokeColor,
          strokeWidth: strokeW,
          fill: fillCol,
          fillStyle: action.fillStyle || 'hachure',
          fillWeight: 1.2,
          hachureGap: 6,
          hachureAngle: -35
        });
        g.setAttribute('id', id);
        g.classList.add('wb-sketch-elem');

        let old = this.elements.get(id);
        if (old) old.replaceWith(g);
        else this.gMain.appendChild(g);
        this.elements.set(id, g);

        if (animated) {
          const paths = g.querySelectorAll('path');
          paths.forEach((p, idx) => {
            try {
              const len = p.getTotalLength() || 400;
              p.style.strokeDasharray = len;
              p.style.strokeDashoffset = len;
              p.style.transition = 'none';

              const duration = Number(action.duration) || 900;
              const delay = (Number(action.delay) || 0) + (idx * 50);

              const timer = setTimeout(() => {
                requestAnimationFrame(() => {
                  p.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.75,.2,1)`;
                  p.style.strokeDashoffset = '0';
                });
              }, delay);
              this.activeAnimations.push(timer);
            } catch (_) {
              p.style.strokeDashoffset = '0';
            }
          });
        }
        return;
      } catch (err) {
        console.warn('Rough path fallback for', id, err);
      }
    }

    // Standard vector fallback
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'path') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      newEl.setAttribute('id', id);
      if (el) el.replaceWith(newEl);
      else this.gMain.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    el.setAttribute('d', action.d || '');
    el.setAttribute('stroke', action.stroke || '#22262b');
    el.setAttribute('stroke-width', action.strokeWidth || 3);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('fill', action.fill || 'none');

    if (action.strokeDasharray) {
      el.setAttribute('stroke-dasharray', action.strokeDasharray);
    }

    if (animated && action.d) {
      try {
        const len = el.getTotalLength() || 400;
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;
        el.style.transition = 'none';
        
        const duration = Number(action.duration) || 1000;
        const delay = Number(action.delay) || 0;

        const timer = setTimeout(() => {
          requestAnimationFrame(() => {
            el.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.75,.2,1)`;
            el.style.strokeDashoffset = '0';
          });
        }, delay);
        this.activeAnimations.push(timer);
      } catch (_) {
        el.style.strokeDashoffset = '0';
      }
    } else {
      el.style.strokeDashoffset = '0';
    }
  }

  renderRect(id, action, animated) {
    const x = this.normalizeX(action.x);
    const y = this.normalizeY(action.y);
    const w = this.normalizeX(action.width || action.w || 80);
    const h = this.normalizeY(action.height || action.h || 50);

    if (this.sketchMode && this.rc) {
      try {
        const strokeColor = action.stroke || '#333740';
        const strokeW = Number(action.strokeWidth) || 2.5;
        const fillCol = (action.fill && action.fill !== 'none' && action.fill !== '#ffffff' && action.fill !== '#fff') ? action.fill : undefined;
        const roughness = action.roughness !== undefined ? Number(action.roughness) : 1.7;
        const bowing = action.bowing !== undefined ? Number(action.bowing) : 1.4;

        const g = this.rc.rectangle(x, y, Math.max(10, w), Math.max(10, h), {
          roughness,
          bowing,
          stroke: strokeColor,
          strokeWidth: strokeW,
          fill: fillCol,
          fillStyle: action.fillStyle || 'hachure',
          fillWeight: 1.3,
          hachureGap: 6,
          hachureAngle: -35
        });
        g.setAttribute('id', id);
        g.classList.add('wb-sketch-elem');

        let old = this.elements.get(id);
        if (old) old.replaceWith(g);
        else this.gMain.appendChild(g);
        this.elements.set(id, g);

        if (animated) {
          const paths = g.querySelectorAll('path');
          paths.forEach((p, idx) => {
            try {
              const len = p.getTotalLength() || 300;
              p.style.strokeDasharray = len;
              p.style.strokeDashoffset = len;
              p.style.transition = 'none';
              const duration = Number(action.duration) || 750;
              const delay = (Number(action.delay) || 0) + (idx * 60);

              const timer = setTimeout(() => {
                requestAnimationFrame(() => {
                  p.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.75,.2,1)`;
                  p.style.strokeDashoffset = '0';
                });
              }, delay);
              this.activeAnimations.push(timer);
            } catch (_) {
              p.style.strokeDashoffset = '0';
            }
          });
        }
        return;
      } catch (err) {
        console.warn('Rough rect fallback for', id, err);
      }
    }

    // Standard vector fallback
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'rect') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      newEl.setAttribute('id', id);
      if (el) el.replaceWith(newEl);
      else this.gMain.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('width', Math.max(10, w));
    el.setAttribute('height', Math.max(10, h));
    el.setAttribute('rx', action.rx || 8);
    el.setAttribute('ry', action.ry || action.rx || 8);
    el.setAttribute('stroke', action.stroke || '#333740');
    el.setAttribute('stroke-width', action.strokeWidth || 2);
    el.setAttribute('fill', action.fill || '#ffffff');
    if (action.opacity !== undefined) el.setAttribute('opacity', action.opacity);

    if (animated) {
      el.style.opacity = '0';
      el.style.transition = `opacity ${action.duration || 600}ms ease`;
      const timer = setTimeout(() => {
        el.style.opacity = action.opacity !== undefined ? String(action.opacity) : '1';
      }, action.delay || 0);
      this.activeAnimations.push(timer);
    } else {
      el.style.opacity = action.opacity !== undefined ? String(action.opacity) : '1';
    }
  }

  renderCircle(id, action, animated) {
    const cx = this.normalizeX(action.cx || action.x);
    const cy = this.normalizeY(action.cy || action.y);
    const r = Number(action.r || action.radius || 20);

    if (this.sketchMode && this.rc) {
      try {
        const strokeColor = action.stroke || '#2b72b8';
        const strokeW = Number(action.strokeWidth) || 2.5;
        const fillCol = (action.fill && action.fill !== 'none' && action.fill !== '#ffffff' && action.fill !== '#fff') ? action.fill : undefined;
        const roughness = action.roughness !== undefined ? Number(action.roughness) : 1.8;

        const g = this.rc.circle(cx, cy, 2 * r, {
          roughness,
          bowing: 1.5,
          stroke: strokeColor,
          strokeWidth: strokeW,
          fill: fillCol,
          fillStyle: action.fillStyle || 'hachure',
          fillWeight: 1.3,
          hachureGap: 6
        });
        g.setAttribute('id', id);
        g.classList.add('wb-sketch-elem');

        let old = this.elements.get(id);
        if (old) old.replaceWith(g);
        else this.gMain.appendChild(g);
        this.elements.set(id, g);

        if (animated) {
          const paths = g.querySelectorAll('path');
          paths.forEach((p, idx) => {
            try {
              const len = p.getTotalLength() || 250;
              p.style.strokeDasharray = len;
              p.style.strokeDashoffset = len;
              p.style.transition = 'none';
              const duration = Number(action.duration) || 700;
              const delay = (Number(action.delay) || 0) + (idx * 60);

              const timer = setTimeout(() => {
                requestAnimationFrame(() => {
                  p.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.75,.2,1)`;
                  p.style.strokeDashoffset = '0';
                });
              }, delay);
              this.activeAnimations.push(timer);
            } catch (_) {
              p.style.strokeDashoffset = '0';
            }
          });
        }
        return;
      } catch (err) {
        console.warn('Rough circle fallback for', id, err);
      }
    }

    // Standard vector fallback
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'circle') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      newEl.setAttribute('id', id);
      if (el) el.replaceWith(newEl);
      else this.gMain.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('r', r);
    el.setAttribute('stroke', action.stroke || '#2b72b8');
    el.setAttribute('stroke-width', action.strokeWidth || 3);
    el.setAttribute('fill', action.fill || '#ffffff');

    if (animated) {
      el.style.opacity = '0';
      el.style.transform = `scale(0.7)`;
      el.style.transformOrigin = `${cx}px ${cy}px`;
      el.style.transition = `all ${action.duration || 500}ms cubic-bezier(.2,.8,.3,1)`;
      const timer = setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      }, action.delay || 0);
      this.activeAnimations.push(timer);
    } else {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
  }

  renderArrow(id, action, animated) {
    const x1 = this.normalizeX(action.x1 || action.x);
    const y1 = this.normalizeY(action.y1 || action.y);
    const x2 = this.normalizeX(action.x2 !== undefined ? action.x2 : x1 + 100);
    const y2 = this.normalizeY(action.y2 !== undefined ? action.y2 : y1);
    const strokeColor = action.stroke || '#333740';
    const strokeW = Number(action.strokeWidth) || 2.5;

    if (this.sketchMode && this.rc) {
      try {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', id);
        g.classList.add('wb-sketch-elem');

        const shaft = this.rc.line(x1, y1, x2, y2, {
          roughness: 1.5,
          bowing: 1.2,
          stroke: strokeColor,
          strokeWidth: strokeW
        });
        g.appendChild(shaft);

        if (action.arrowEnd !== false) {
          const theta = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 15;
          const f1x = x2 - headLen * Math.cos(theta - 0.45);
          const f1y = y2 - headLen * Math.sin(theta - 0.45);
          const f2x = x2 - headLen * Math.cos(theta + 0.45);
          const f2y = y2 - headLen * Math.sin(theta + 0.45);

          const fin1 = this.rc.line(x2, y2, f1x, f1y, {
            roughness: 1.5,
            bowing: 1.0,
            stroke: strokeColor,
            strokeWidth: strokeW
          });
          const fin2 = this.rc.line(x2, y2, f2x, f2y, {
            roughness: 1.5,
            bowing: 1.0,
            stroke: strokeColor,
            strokeWidth: strokeW
          });
          g.append(fin1, fin2);
        }

        let old = this.elements.get(id);
        if (old) old.replaceWith(g);
        else this.gMain.appendChild(g);
        this.elements.set(id, g);

        if (animated) {
          const paths = g.querySelectorAll('path');
          paths.forEach((p, idx) => {
            try {
              const len = p.getTotalLength() || 200;
              p.style.strokeDasharray = len;
              p.style.strokeDashoffset = len;
              p.style.transition = 'none';
              const duration = Number(action.duration) || 700;
              const delay = (Number(action.delay) || 0) + (idx * 60);

              const timer = setTimeout(() => {
                requestAnimationFrame(() => {
                  p.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.75,.2,1)`;
                  p.style.strokeDashoffset = '0';
                });
              }, delay);
              this.activeAnimations.push(timer);
            } catch (_) {
              p.style.strokeDashoffset = '0';
            }
          });
        }

        // Render arrow label if specified
        if (action.label || action.text) {
          this.renderArrowLabel(id, action, x1, y1, x2, y2, strokeColor, animated);
        }
        return;
      } catch (err) {
        console.warn('Rough arrow fallback for', id, err);
      }
    }

    // Standard vector fallback
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'path') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      newEl.setAttribute('id', id);
      if (el) el.replaceWith(newEl);
      else this.gMain.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    const d = `M ${x1} ${y1} L ${x2} ${y2}`;
    el.setAttribute('d', d);
    el.setAttribute('stroke', strokeColor);
    el.setAttribute('stroke-width', strokeW);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('fill', 'none');

    if (action.strokeDasharray) {
      el.setAttribute('stroke-dasharray', action.strokeDasharray);
    }

    if (action.arrowEnd !== false) {
      el.setAttribute('marker-end', this.getArrowMarker(strokeColor));
    }

    if (animated) {
      try {
        const len = el.getTotalLength() || 200;
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;
        const duration = action.duration || 700;
        const delay = action.delay || 0;
        const timer = setTimeout(() => {
          requestAnimationFrame(() => {
            el.style.transition = `stroke-dashoffset ${duration}ms ease-out`;
            el.style.strokeDashoffset = '0';
          });
        }, delay);
        this.activeAnimations.push(timer);
      } catch (_) {
        el.style.strokeDashoffset = '0';
      }
    } else {
      el.style.strokeDashoffset = '0';
    }

    // Render arrow label if specified
    if (action.label || action.text) {
      this.renderArrowLabel(id, action, x1, y1, x2, y2, strokeColor, animated);
    }
  }

  renderArrowLabel(id, action, x1, y1, x2, y2, color, animated) {
    const lblText = String(action.label || action.text);
    const theta = Math.atan2(y2 - y1, x2 - x1);
    const offset = 18;
    const perpX = -Math.sin(theta) * offset;
    const perpY = Math.cos(theta) * offset;
    const midX = (x1 + x2) / 2 + perpX;
    const midY = (y1 + y2) / 2 + perpY;

    this.renderText(id + '_lbl', {
      x: midX,
      y: midY,
      text: lblText,
      color: action.labelColor || color,
      fontSize: action.fontSize || 14,
      fontWeight: '700',
      fontFamily: "'STIX Two Text', 'Inter', system-ui, sans-serif",
      anchor: 'middle',
      delay: (action.delay || 0) + 150
    }, animated);
  }

  renderText(id, action, animated) {
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'text') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      newEl.setAttribute('id', id);
      if (el) el.replaceWith(newEl);
      else this.gText.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    let x = this.normalizeX(action.x);
    let y = this.normalizeY(action.y);
    const textStr = String(action.text || action.label || '');

    // Anti-collision: if another distinct text element already occupies this exact position, shift y down
    if (textStr && textStr.length > 2 && this.gText) {
      const existingTexts = Array.from(this.gText.querySelectorAll('text'));
      for (const other of existingTexts) {
        if (other === el || other.getAttribute('id') === id) continue;
        const ox = Number(other.getAttribute('x'));
        const oy = Number(other.getAttribute('y'));
        const otherStr = other.textContent || '';
        if (Math.abs(y - oy) < 22 && Math.abs(x - ox) < Math.max(80, otherStr.length * 8)) {
          y = oy + 32;
        }
      }
    }

    // Mathematical formula and code detection for academic font rendering
    const isFormula = action.op === 'draw_formula' || action.isFormula || 
      /([=+\-*/^∑\u2211\u03b8\u03bc\u03c0\u221a\u2264\u2265]|=>|<=|->|lim_|dx|dt|\b(sin|cos|tan|log|ln)\b)/.test(textStr) ||
      /\b(FBD|Tension|Normal|Gravity|mg|F_net|F_ext|\bkg\b|\bN\b|\bm\/s|\bms\b|a\s*=|\bT\s*=|\bN\s*=|\bf\s*=)/.test(textStr);

    const isCode = action.fontFamily && action.fontFamily.includes('mono');

    if (isFormula) {
      el.classList.add('wb-math-text');
    } else if (isCode) {
      el.classList.add('wb-code-text');
    } else {
      el.classList.remove('wb-math-text', 'wb-code-text');
    }

    const defaultFont = isFormula 
      ? "'STIX Two Text', 'Cambria Math', 'Latin Modern Math', 'Times New Roman', serif"
      : (action.fontFamily || (this.sketchMode ? "'Caveat', 'Kalam', 'Segoe Print', cursive, sans-serif" : "'Inter', -apple-system, sans-serif"));

    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', action.anchor || 'start');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('fill', action.color || action.fill || '#1c1f24');
    el.setAttribute('font-size', (action.fontSize || 18) + 'px');
    el.setAttribute('font-weight', action.fontWeight || (isFormula ? '600' : '700'));
    el.setAttribute('font-family', defaultFont);
    el.setAttribute('letter-spacing', isFormula ? '0.3px' : '0.5px');

    // Natural handwriting rotation only for non-formula labels
    if (this.sketchMode && !isFormula && !isCode) {
      const hash = String(id).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const jitterAngle = (((hash % 7) - 3) * 0.4).toFixed(1);
      el.setAttribute('transform', `rotate(${jitterAngle} ${x} ${y})`);
    } else {
      el.removeAttribute('transform');
    }

    el.textContent = textStr;

    if (animated) {
      el.style.opacity = '0';
      el.style.transition = `opacity ${action.duration || 450}ms ease`;
      const timer = setTimeout(() => {
        el.style.opacity = '1';
      }, action.delay || 0);
      this.activeAnimations.push(timer);
    } else {
      el.style.opacity = '1';
    }
  }

  renderFlowMarker(id, action, animated) {
    let el = this.elements.get(id);
    if (!el || el.tagName.toLowerCase() !== 'circle') {
      const newEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      newEl.setAttribute('id', id);
      newEl.classList.add('flow-marker');
      if (el) el.replaceWith(newEl);
      else this.gFlow.appendChild(newEl);
      el = newEl;
      this.elements.set(id, el);
    }

    const cx = this.normalizeX(action.cx || action.x);
    const cy = this.normalizeY(action.cy || action.y);
    const r = Number(action.r) || 8;
    const color = action.color || '#1769d2';

    el.setAttribute('r', r);
    el.setAttribute('fill', color);
    el.setAttribute('stroke', '#ffffff');
    el.setAttribute('stroke-width', '2');
    el.style.filter = 'drop-shadow(0 0 6px ' + color + ')';

    const hasTransit = action.fromX !== undefined && action.fromY !== undefined;

    if (hasTransit && animated) {
      const fromX = this.normalizeX(action.fromX);
      const fromY = this.normalizeY(action.fromY);
      el.setAttribute('cx', fromX);
      el.setAttribute('cy', fromY);
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      el.style.transformOrigin = `${fromX}px ${fromY}px`;
      el.style.transition = 'none';

      const transitDur = Number(action.duration) || 900;
      const timer = setTimeout(() => {
        el.style.transition = `opacity 250ms ease, cx ${transitDur}ms cubic-bezier(.2,.8,.2,1), cy ${transitDur}ms cubic-bezier(.2,.8,.2,1), transform 250ms ease`;
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
        el.setAttribute('cx', cx);
        el.setAttribute('cy', cy);
      }, Number(action.delay) || 0);
      this.activeAnimations.push(timer);
    } else if (animated) {
      el.setAttribute('cx', cx);
      el.setAttribute('cy', cy);
      el.style.opacity = '0';
      el.style.transform = 'scale(0.5)';
      el.style.transformOrigin = `${cx}px ${cy}px`;
      el.style.transition = 'opacity 350ms ease, transform 350ms cubic-bezier(.16, 1, .3, 1)';

      const timer = setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      }, Number(action.delay) || 0);
      this.activeAnimations.push(timer);
    } else {
      el.setAttribute('cx', cx);
      el.setAttribute('cy', cy);
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
      el.style.transition = 'none';
    }
  }

  highlightElement(id, action = {}) {
    const el = this.elements.get(id);
    if (!el) return;

    if (this.sketchMode && this.rc) {
      try {
        const bbox = el.getBBox ? el.getBBox() : null;
        if (bbox && bbox.width > 0) {
          const hlId = 'hl_' + id + '_' + Date.now();
          const hlColor = action.stroke || action.color || '#fef08a';
          const midY = bbox.y + bbox.height / 2;
          const pad = 8;
          const g = this.rc.line(bbox.x - pad, midY, bbox.x + bbox.width + pad, midY, {
            roughness: 2.2,
            bowing: 1.5,
            stroke: hlColor,
            strokeWidth: Math.max(14, bbox.height * 0.8),
            opacity: 0.45
          });
          g.setAttribute('id', hlId);
          g.style.opacity = '0';
          g.style.transition = 'opacity 300ms ease';
          this.gBase.appendChild(g);
          requestAnimationFrame(() => { g.style.opacity = '0.55'; });
          setTimeout(() => {
            g.style.opacity = '0';
            setTimeout(() => g.remove(), 400);
          }, 2200);
          return;
        }
      } catch (_) {}
    }

    el.classList.add('wb-highlighted');
    setTimeout(() => {
      el.classList.remove('wb-highlighted');
    }, 1800);
  }

  renderReveal(id, action, animated) {
    const type = String(action.type || 'path').toLowerCase();
    if (type === 'path') {
      this.renderPath(id, action, animated);
    } else if (type === 'rect') {
      this.renderRect(id, action, animated);
    } else if (type === 'circle') {
      this.renderCircle(id, action, animated);
    } else if (type === 'text') {
      this.renderText(id, action, animated);
    }
  }

  renderLegacyVisual(v, animated) {
    const t = String(v.type || 'text').toLowerCase();
    const id = 'leg_' + Math.random().toString(36).substr(2, 8);
    const x = this.normalizeX(v.x);
    const y = this.normalizeY(v.y);
    const x2 = this.normalizeX(v.x2 !== undefined ? v.x2 : v.x);
    const y2 = this.normalizeY(v.y2 !== undefined ? v.y2 : v.y);
    const w = this.normalizeX(v.w || 20);
    const h = this.normalizeY(v.h || 15);
    const color = v.color || '#2b72b8';

    if (t === 'rect') {
      this.renderRect(id, { x, y, width: w, height: h, stroke: color, fill: '#ffffff', delay: v.delay }, animated);
      if (v.text) {
        this.renderText(id + '_lbl', { x: x + w / 2, y: y + h / 2, text: v.text, anchor: 'middle', color: '#222', delay: (v.delay || 0) + 100 }, animated);
      }
    } else if (t === 'circle' || t === 'dot') {
      this.renderCircle(id, { cx: x + w / 2, cy: y + h / 2, r: Math.max(8, w / 2), stroke: color, fill: t === 'dot' ? color : '#f0f7ff', delay: v.delay }, animated);
      if (v.text) {
        this.renderText(id + '_lbl', { x: x + w / 2, y: y + h / 2, text: v.text, anchor: 'middle', color: '#222', delay: (v.delay || 0) + 100 }, animated);
      }
    } else if (t === 'line' || t === 'arrow') {
      this.renderArrow(id, { x1: x, y1: y, x2, y2, stroke: color, arrowEnd: t === 'arrow', delay: v.delay }, animated);
      if (v.text) {
        this.renderText(id + '_lbl', { x: (x + x2) / 2, y: (y + y2) / 2 - 8, text: v.text, anchor: 'middle', color: '#222', delay: (v.delay || 0) + 100 }, animated);
      }
    } else {
      this.renderText(id, { x, y, text: v.text, color, fontSize: v.size || 16, delay: v.delay }, animated);
    }
  }

  removeElement(id) {
    const el = this.elements.get(id);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
      this.elements.delete(id);
    }
  }

  // Restore state up to a specific step index
  renderUpToStep(steps, upToStepIndex) {
    this.clear();
    for (let s = 0; s <= upToStepIndex && s < steps.length; s++) {
      const seg = steps[s];
      const actions = Array.isArray(seg.actions) ? seg.actions : (Array.isArray(seg.visuals) ? seg.visuals : []);
      actions.forEach(action => this.executeAction(action, false));
    }
  }
}

// ---------------------------------------------------------------------------
// Synchronized Playback & Teaching Controller
// ---------------------------------------------------------------------------
class WhiteboardPlaybackController {
  constructor(options = {}) {
    this.renderer = options.renderer;
    this.chatContainer = options.chatContainer;
    this.statusEl = options.statusEl;
    this.progressEl = options.progressEl;
    this.progressBar = options.progressBar;
    this.stepPill = options.stepPill;
    this.titleEl = options.titleEl;
    this.topicRoadmapEl = options.topicRoadmapEl;
    this.playBtn = options.playBtn;
    this.voiceBtn = options.voiceBtn;
    this.voiceSpeedSlider = options.voiceSpeedSlider;
    this.voiceSpeedVal = options.voiceSpeedVal;
    this.quizBox = options.quizBox;
    this.quizQuestion = options.quizQuestion;
    this.quizOptions = options.quizOptions;
    this.quizFeedback = options.quizFeedback;

    this.lesson = null;
    this.steps = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isMuted = false;
    this.voiceRate = 1.0;
    this.currentUtterance = null;
    this.activeStepToken = 0;
    this.activeGenerationController = null;

    this.bindEvents();
  }

  bindEvents() {
    if (this.voiceSpeedSlider) {
      this.voiceSpeedSlider.addEventListener('input', e => {
        this.voiceRate = Number(e.target.value) || 1.0;
        if (this.voiceSpeedVal) this.voiceSpeedVal.textContent = this.voiceRate.toFixed(1) + '×';
      });
    }
  }

  loadLesson(lessonData, autoPlay = true) {
    this.stopPlayback();
    this.lesson = lessonData;
    this.steps = Array.isArray(lessonData?.segments) ? lessonData.segments : [];
    this.currentIndex = 0;

    if (this.titleEl) this.titleEl.textContent = lessonData.title || 'Interactive Whiteboard Lesson';
    if (this.topicRoadmapEl) this.topicRoadmapEl.textContent = lessonData.topic || lessonData.overview || 'Progressive Whiteboard Explanation';
    if (this.renderer?.svg) {
      this.renderer.svg.setAttribute('viewBox', lessonData.viewBox || '0 0 960 700');
    }

    this.renderTranscriptSidebar();
    this.renderer.clear();
    this.updateControls();

    if (this.quizBox) this.quizBox.style.display = 'none';

    if (autoPlay && this.steps.length) {
      this.playStep(0);
    }
  }

  renderTranscriptSidebar() {
    if (!this.chatContainer) return;
    this.chatContainer.innerHTML = '';

    this.steps.forEach((step, idx) => {
      const msg = document.createElement('div');
      msg.className = 'wb-msg ai';
      msg.id = `wb_msg_${idx}`;
      
      const head = document.createElement('div');
      head.className = 'wb-msg-head';
      head.textContent = `${idx + 1}. ${step.heading || 'Teaching Step'}`;

      const text = document.createElement('p');
      text.textContent = step.narration || '';

      msg.append(head, text);
      msg.addEventListener('click', () => {
        this.seekToStep(idx);
      });
      this.chatContainer.appendChild(msg);
    });
  }

  async playStep(index) {
    if (index >= this.steps.length) {
      this.isPlaying = false;
      this.isPaused = false;
      this.updateControls();
      if (this.statusEl) this.statusEl.textContent = 'Lesson complete — ready for questions.';
      this.showQuiz();
      return;
    }

    this.currentIndex = index;
    this.isPlaying = true;
    this.isPaused = false;
    this.activeStepToken++;
    const token = this.activeStepToken;

    const step = this.steps[index];
    this.updateControls();

    // 1. Highlight active transcript card and scroll into view
    this.highlightTranscriptCard(index);

    // 2. Trigger drawing actions for this step
    const actions = Array.isArray(step.actions) ? step.actions : (Array.isArray(step.visuals) ? step.visuals : []);
    actions.forEach(action => this.renderer.executeAction(action, true));

    // 3. Coordinate speech synthesis narration
    const speechPromise = this.speakNarration(step.narration || '');
    const minWaitPromise = new Promise(r => setTimeout(r, Math.max(1200, Number(step.duration) || 2800)));

    await Promise.all([speechPromise, minWaitPromise]);

    if (token !== this.activeStepToken) return; // user cancelled, seeked, or paused

    if (!this.isPaused && this.isPlaying) {
      this.playStep(index + 1);
    }
  }

  highlightTranscriptCard(index) {
    if (!this.chatContainer) return;
    const cards = this.chatContainer.querySelectorAll('.wb-msg');
    cards.forEach((c, i) => c.classList.toggle('active', i === index));
    const activeCard = document.getElementById(`wb_msg_${index}`);
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  speakNarration(text) {
    if (this.isMuted || !('speechSynthesis' in window) || !text) {
      return Promise.resolve();
    }

    window.speechSynthesis.cancel();
    return new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          this.currentUtterance = null;
          resolve();
        }
      };

      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.voiceRate || 1.0;
      u.lang = 'en-US';

      // Pick natural voice if available
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online')));
      if (match) u.voice = match;

      u.onend = done;
      u.onerror = done;
      this.currentUtterance = u;
      window.speechSynthesis.speak(u);

      // Fallback timer in case speech synthesis stalls
      setTimeout(done, Math.max(1500, (text.length * 90) / this.voiceRate + 2000));
    });
  }

  pause() {
    this.isPaused = true;
    this.isPlaying = false;
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    this.updateControls();
    if (this.statusEl) this.statusEl.textContent = 'Paused. You can resume, seek, or ask a question.';
  }

  resume() {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.isPaused = false;
      this.isPlaying = true;
      this.updateControls();
      return;
    }
    this.playStep(this.currentIndex);
  }

  nextStep() {
    this.stopSpeech();
    const nextIdx = Math.min(this.steps.length - 1, this.currentIndex + 1);
    this.seekToStep(nextIdx);
  }

  prevStep() {
    this.stopSpeech();
    const prevIdx = Math.max(0, this.currentIndex - 1);
    this.seekToStep(prevIdx);
  }

  replayCurrentStep() {
    this.seekToStep(this.currentIndex);
  }

  resetLesson() {
    this.stopPlayback();
    this.currentIndex = 0;
    this.renderer.clear();
    this.updateControls();
    this.highlightTranscriptCard(-1);
    if (this.statusEl) this.statusEl.textContent = 'Ready. Click Teach to begin.';
  }

  seekToStep(index) {
    this.stopPlayback();
    this.currentIndex = index;
    // Render all elements up to this step statically, then play step
    this.renderer.renderUpToStep(this.steps, index);
    this.playStep(index);
  }

  stopPlayback() {
    this.activeStepToken++;
    this.isPlaying = false;
    this.isPaused = false;
    this.stopSpeech();
    if (this.renderer) this.renderer.cancelAnimations();
    this.updateControls();
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  toggleVoice() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stopSpeech();
    if (this.voiceBtn) {
      this.voiceBtn.textContent = this.isMuted ? '🔇 Voice: Off' : '🔊 Voice: On';
      this.voiceBtn.classList.toggle('muted', this.isMuted);
    }
  }

  updateControls() {
    const total = this.steps.length;
    const curr = total > 0 ? this.currentIndex + 1 : 0;

    if (this.playBtn) {
      this.playBtn.textContent = this.isPlaying ? '⏸ Pause' : (this.isPaused ? '▶ Continue' : '▶ Teach');
      this.playBtn.disabled = total === 0;
    }
    if (this.progressEl) {
      this.progressEl.textContent = total > 0 ? `${curr} / ${total}` : '0 / 0';
    }
    if (this.progressBar) {
      const pct = total > 0 ? (curr / total) * 100 : 0;
      this.progressBar.style.width = pct + '%';
    }
    if (this.stepPill) {
      this.stepPill.textContent = total > 0 ? `Step ${curr} of ${total}` : 'Ready';
    }
    if (this.statusEl && this.steps[this.currentIndex]) {
      this.statusEl.textContent = this.steps[this.currentIndex].heading || 'Explaining...';
    }
  }

  showQuiz() {
    const q = this.lesson?.checkpoint;
    if (!q || !Array.isArray(q.options) || !this.quizBox) return;

    this.quizBox.style.display = 'block';
    if (this.quizQuestion) this.quizQuestion.textContent = q.question || 'Check your understanding:';
    if (this.quizFeedback) this.quizFeedback.textContent = '';
    if (this.quizOptions) {
      this.quizOptions.innerHTML = '';
      q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-opt-btn';
        btn.textContent = `${String.fromCharCode(65 + idx)}. ${opt}`;
        btn.onclick = () => {
          const isCorrect = idx === q.answerIndex;
          btn.classList.add(isCorrect ? 'correct' : 'incorrect');
          if (this.quizFeedback) {
            this.quizFeedback.textContent = (isCorrect ? '✓ Correct! ' : '✗ Not quite. ') + (q.explanation || '');
            this.quizFeedback.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'incorrect');
          }
        };
        this.quizOptions.appendChild(btn);
      });
    }
    this.quizBox.scrollIntoView({ behavior: 'smooth' });
  }

  // Live Interruption Handler
  async handleInterruption(commandText, conceptText) {
    const command = String(commandText || '').trim();
    if (!command) return;

    this.stopPlayback();
    if (this.statusEl) this.statusEl.textContent = 'Adapting whiteboard to your interruption...';

    const recentNarration = this.steps[this.currentIndex]?.narration || '';
    const currentActions = this.steps.slice(0, this.currentIndex + 1).flatMap(s => s.actions || s.visuals || []);

    try {
      const res = await fetch('/api/interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: conceptText || this.lesson?.title || '',
          title: this.lesson?.title || '',
          recentNarration,
          currentVisuals: currentActions.slice(-20),
          command
        })
      });

      const patch = await res.json();
      if (!res.ok) throw new Error(patch.error || 'Adaptation failed');

      if (patch.acknowledgement) {
        if (this.statusEl) this.statusEl.textContent = patch.acknowledgement;
        await this.speakNarration(patch.acknowledgement);
      }

      const newSegments = Array.isArray(patch.segments) ? patch.segments : [];
      if (!newSegments.length) throw new Error('No clarification segments returned.');

      if (patch.strategy === 'replace') {
        this.steps = newSegments;
        this.currentIndex = 0;
      } else {
        // Append right after current step
        this.steps.splice(this.currentIndex + 1, 0, ...newSegments);
      }

      this.renderTranscriptSidebar();
      this.playStep(this.currentIndex + 1);
    } catch (e) {
      if (this.statusEl) this.statusEl.textContent = 'Interruption notice: ' + e.message;
    }
  }

  exportNotes() {
    if (!this.lesson) return;
    const title = this.lesson.title || 'NeuraLearn Whiteboard Lesson';
    let md = `# ${title}\n\n`;
    if (this.lesson.overview) md += `*${this.lesson.overview}*\n\n`;
    if (this.lesson.topic) md += `**Roadmap:** ${this.lesson.topic}\n\n---\n\n`;

    this.steps.forEach((s, i) => {
      md += `### Step ${i + 1}: ${s.heading || 'Explanation'}\n\n`;
      md += `${s.narration || ''}\n\n`;
    });

    if (this.lesson.checkpoint?.question) {
      md += `### Review Question\n\n**${this.lesson.checkpoint.question}**\n\n`;
      this.lesson.checkpoint.options.forEach((opt, idx) => {
        md += `- ${String.fromCharCode(65 + idx)}. ${opt}\n`;
      });
      md += `\n*Answer:* ${this.lesson.checkpoint.explanation || ''}\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()) + '-notes.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  exportSvg() {
    if (!this.renderer?.svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(this.renderer.svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ((this.lesson?.title || 'whiteboard').replace(/[^a-z0-9]+/gi, '-').toLowerCase()) + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

// Global exposure
window.WhiteboardRenderer = WhiteboardRenderer;
window.WhiteboardPlaybackController = WhiteboardPlaybackController;
