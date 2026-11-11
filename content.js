// Page Sketch — the transparent drawing sheet.
// Injected on demand; running it again toggles the sheet off. Closing the
// sheet removes it and everything drawn on it.
(() => {
  if (window.__pageSketch) return window.__pageSketch.toggle();

  const ext = globalThis.browser || globalThis.chrome;
  let session = null;

  function notify(active) {
    try {
      const p = ext && ext.runtime && ext.runtime.sendMessage({ type: 'pagesketch-state', active });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
  function close() {
    if (session) { session.destroy(); session = null; notify(false); }
    return false;
  }
  function open() { session = createSession(close); return true; }

  window.__pageSketch = { toggle: () => (session ? close() : open()) };
  return window.__pageSketch.toggle();

  // ---------------------------------------------------------------------------
  function createSession(requestClose) {
    const TR = globalThis.__psTranslit || { LANGS: [{ id: 'en', name: 'English', native: 'Aa' }], byId: {}, word: (w) => w };
    const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#111111', '#ffffff'];
    const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Nirmala UI", ' +
      '"Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", ' +
      '"Noto Sans Malayalam", "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Oriya", "Kohinoor Devanagari", sans-serif';
    const URDU_STACK = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", "Noto Naskh Arabic", "Segoe UI", sans-serif';

    const state = {
      tool: 'pen', color: COLORS[0], size: 4, fill: false, lang: 'en',
      shapes: [], undo: [], redo: [], current: null, erasing: false, erasedThisDrag: false,
    };

    const I = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
    const ICONS = {
      pass: I('<path d="M5 3l14 7-6 2-2 6z"/>'),
      pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
      highlighter: I('<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>'),
      line: I('<path d="M5 19L19 5"/>'),
      arrow: I('<path d="M5 19L19 5"/><path d="M9 5h10v10"/>'),
      rect: I('<rect x="4" y="5" width="16" height="14" rx="1.5"/>'),
      ellipse: I('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
      text: I('<path d="M5 7V4h14v3"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
      eraser: I('<path d="M20 20H8.5l-4.9-4.9a2 2 0 010-2.8l9.7-9.7a2 2 0 012.8 0l4.3 4.3a2 2 0 010 2.8L11 19"/><path d="M6 11l7 7"/>'),
      fill: I('<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".35"/>'),
      undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
      redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
      clear: I('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
      close: I('<path d="M18 6L6 18M6 6l12 12"/>'),
      expand: I('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'),
      collapse: I('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>'),
      globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18a14 14 0 010-18"/>'),
    };
    // Tools shown while the toolbar is minimized (the default).
    const MINI_TOOLS = ['pen', 'highlighter', 'arrow', 'text'];
    const TOOLS = [
      ['pass', 'Interact with page (V)', 'v'], ['pen', 'Pen (P)', 'p'], ['highlighter', 'Highlighter (H)', 'h'],
      ['line', 'Line (L) — Shift snaps angle', 'l'], ['arrow', 'Arrow (A) — Shift snaps angle', 'a'],
      ['rect', 'Rectangle (R) — Shift for square', 'r'], ['ellipse', 'Ellipse (O) — Shift for circle', 'o'],
      ['text', 'Text (T)', 't'], ['eraser', 'Eraser (E)', 'e'],
    ];

    const CSS = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .wrap { position: fixed; inset: 0; pointer-events: none; }
      .sheet { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: auto; cursor: crosshair; touch-action: none; }
      .frame { position: fixed; inset: 0; pointer-events: none; background: rgba(10,132,255,.035); box-shadow: inset 0 0 0 3px rgba(10,132,255,.55); }
      .wrap.pass .sheet { pointer-events: none; }
      .wrap.pass .frame { background: none; box-shadow: inset 0 0 0 3px rgba(10,132,255,.18); }
      .bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); width: max-content; display: flex; flex-wrap: wrap;
        align-items: center; gap: 2px; padding: 5px; max-width: calc(100vw - 24px); pointer-events: auto;
        background: rgba(28,28,30,.94); color: #f2f2f7; border-radius: 12px; user-select: none;
        box-shadow: 0 8px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.08);
        font: 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      button { all: unset; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: inherit; }
      button:hover { background: rgba(255,255,255,.12); }
      button.on { background: #0a84ff; color: #fff; }
      button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      button.danger:hover { background: rgba(255,59,48,.85); }
      .bar.mini > :not([data-mini]) { display: none; }
      .sep { width: 1px; height: 22px; background: rgba(255,255,255,.16); margin: 0 3px; }
      .grip { width: 14px; height: 32px; cursor: grab; display: grid; place-items: center; opacity: .55; }
      .grip::before { content: ""; width: 6px; height: 16px;
        background: radial-gradient(circle, #fff 1.2px, transparent 1.5px) 0 0 / 3px 4px; }
      .grip:active { cursor: grabbing; }
      button.swatch { width: 20px; height: 20px; border-radius: 50%; margin: 0 1px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
      button.swatch.on { outline: 2px solid #fff; outline-offset: 2px; background-clip: padding-box; }
      label.custom { position: relative; width: 22px; height: 22px; border-radius: 50%; margin: 0 2px; cursor: pointer;
        background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
      label.custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; padding: 0; }
      .size { display: flex; align-items: center; gap: 6px; padding: 0 4px; }
      .size input { width: 70px; accent-color: #0a84ff; }
      .size span { min-width: 18px; text-align: right; font-variant-numeric: tabular-nums; opacity: .85; }
      .lang { display: flex; align-items: center; gap: 4px; padding-left: 4px; }
      .lang svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; opacity: .8; }
      .lang select { width: 112px; height: 30px; border: 0; border-radius: 8px; padding: 0 6px; color: #f2f2f7; background: #3a3a3c;
        font: 12px system-ui, -apple-system, "Segoe UI", "Nirmala UI", sans-serif; cursor: pointer; outline: none; }
      .lang select option { background: #2c2c2e; color: #f2f2f7; }
      textarea.editor { position: fixed; pointer-events: auto; margin: 0; padding: 0; border: 1px dashed rgba(10,132,255,.95);
        background: rgba(255,255,255,.06); outline: none; resize: none; overflow: hidden; white-space: pre; line-height: 1.25; }
      .hint { position: fixed; pointer-events: none; padding: 4px 8px; border-radius: 6px; background: rgba(28,28,30,.94);
        color: #fff; font: 14px/1.2 ${FONT_STACK}; white-space: nowrap; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
      .hint small { opacity: .6; font-size: 11px; margin-left: 6px; }
      .hint[hidden] { display: none; }
    `;

    // ---- DOM ----------------------------------------------------------------
    const host = document.createElement('div');
    host.setAttribute('data-page-sketch', '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });

    const langOptions = TR.LANGS.map((l) =>
      `<option value="${l.id}">${l.id === 'en' ? l.name : `${l.native} · ${l.name}`}</option>`).join('');

    root.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap">
        <canvas class="sheet"></canvas>
        <div class="frame"></div>
        <div class="bar mini" role="toolbar" aria-label="Page Sketch">
          <div class="grip" data-mini title="Drag to move"></div>
          ${TOOLS.map(([id, title]) => `<button data-tool="${id}" ${MINI_TOOLS.includes(id) ? 'data-mini' : ''} title="${title}">${ICONS[id]}</button>`).join('')}
          <div class="sep"></div>
          ${COLORS.map((c) => `<button class="swatch" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('')}
          <label class="custom" title="Custom colour"><input type="color" value="#ff3b30"></label>
          <div class="sep"></div>
          <div class="size" title="Stroke width / text size"><input type="range" min="1" max="30" value="4"><span>4</span></div>
          <button data-act="fill" title="Fill shapes (F)">${ICONS.fill}</button>
          <div class="lang" title="Text language — type phonetically in English letters, e.g. namaste → नमस्ते">${ICONS.globe}<select>${langOptions}</select></div>
          <div class="sep" data-mini></div>
          <button data-act="undo" data-mini title="Undo (Ctrl+Z)">${ICONS.undo}</button>
          <button data-act="redo" title="Redo (Ctrl+Y)">${ICONS.redo}</button>
          <button data-act="clear" data-mini title="Clear all">${ICONS.clear}</button>
          <button data-act="expand" data-mini title="More tools (M)">${ICONS.expand}</button>
          <button data-act="close" data-mini class="danger" title="Close sheet & discard (Esc)">${ICONS.close}</button>
        </div>
        <div class="hint" hidden></div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    const $ = (s) => root.querySelector(s);
    const wrap = $('.wrap'), canvas = $('.sheet'), bar = $('.bar'), hint = $('.hint');
    const sizeInput = $('.size input'), sizeLabel = $('.size span');
    const colorInput = $('label.custom input'), langSelect = $('.lang select');
    const ctx = canvas.getContext('2d');
    const measureCtx = document.createElement('canvas').getContext('2d');

    // ---- Canvas sizing & rendering -------------------------------------------
    let dpr = 1, rafId = 0;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      draw();
    }
    function scheduleDraw() {
      if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
    }
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Shapes are stored in document coordinates so they scroll with the page.
      ctx.setTransform(dpr, 0, 0, dpr, -window.scrollX * dpr, -window.scrollY * dpr);
      for (const s of state.shapes) renderShape(s);
      if (state.current) renderShape(state.current);
    }

    function smoothPath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length < 3) {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
      }
      ctx.stroke();
    }

    function renderShape(s) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      switch (s.type) {
        case 'pen':
        case 'highlighter': {
          if (s.type === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineCap = 'square'; }
          if (s.points.length === 1) {
            ctx.beginPath();
            ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else smoothPath(s.points);
          break;
        }
        case 'line':
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
          break;
        case 'arrow': {
          const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
          const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
          const head = Math.min(Math.max(10, s.size * 3.5), len * 0.6);
          const back = head * 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2 - Math.cos(ang) * back, s.y2 - Math.sin(ang) * back);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.x2, s.y2);
          ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
          ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.lineWidth = Math.max(1, s.size / 2);
          ctx.fill(); ctx.stroke();
          break;
        }
        case 'rect':
        case 'ellipse': {
          const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
          const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
          ctx.beginPath();
          if (s.type === 'rect') ctx.rect(x, y, w, h);
          else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          if (s.fill) { ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
          ctx.stroke();
          break;
        }
        case 'text': {
          ctx.font = s.font;
          ctx.textBaseline = 'top';
          ctx.textAlign = s.rtl ? 'right' : 'left';
          if ('direction' in ctx) ctx.direction = s.rtl ? 'rtl' : 'ltr';
          const lh = s.fs * 1.25, ax = s.rtl ? s.x + s.w : s.x;
          s.text.split('\n').forEach((line, i) => ctx.fillText(line, ax, s.y + i * lh + s.fs * 0.125));
          break;
        }
      }
      ctx.restore();
    }

    // ---- History -----------------------------------------------------------------
    function commit(mutate) {
      state.undo.push(state.shapes.slice());
      if (state.undo.length > 200) state.undo.shift();
      state.redo = [];
      mutate();
      draw();
    }
    function undo() {
      commitEditor();
      if (!state.undo.length) return;
      state.redo.push(state.shapes);
      state.shapes = state.undo.pop();
      draw();
    }
    function redo() {
      if (!state.redo.length) return;
      state.undo.push(state.shapes);
      state.shapes = state.redo.pop();
      draw();
    }
    function clearAll() {
      commitEditor();
      if (state.shapes.length) commit(() => { state.shapes = []; });
    }

    // ---- Hit testing (eraser) --------------------------------------------------
    function distToSeg(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
    function hit(s, p) {
      const tol = 8 + s.size / 2;
      switch (s.type) {
        case 'pen':
        case 'highlighter':
          if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= tol;
          for (let i = 1; i < s.points.length; i++) if (distToSeg(p, s.points[i - 1], s.points[i]) <= tol) return true;
          return false;
        case 'line':
        case 'arrow':
          return distToSeg(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= tol;
        case 'rect': {
          const x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2);
          if (s.fill && p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) return true;
          const c = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
          return c.some((a, i) => distToSeg(p, a, c[(i + 1) % 4]) <= tol);
        }
        case 'ellipse': {
          const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
          const cx = Math.min(s.x1, s.x2) + rx, cy = Math.min(s.y1, s.y2) + ry;
          if (rx < 1 || ry < 1) return Math.hypot(p.x - cx, p.y - cy) <= tol + Math.max(rx, ry);
          const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
          if (s.fill && r <= 1) return true;
          return Math.abs(r - 1) * Math.min(rx, ry) <= tol;
        }
        case 'text':
          return p.x >= s.x - 6 && p.x <= s.x + s.w + 6 && p.y >= s.y - 6 && p.y <= s.y + s.h + 6;
      }
      return false;
    }
    function eraseAt(p) {
      for (let i = state.shapes.length - 1; i >= 0; i--) {
        if (hit(state.shapes[i], p)) {
          if (!state.erasedThisDrag) {
            state.erasedThisDrag = true;
            state.undo.push(state.shapes.slice());
            state.redo = [];
          }
          state.shapes.splice(i, 1);
          draw();
          return;
        }
      }
    }

    // ---- Pointer drawing ----------------------------------------------------------
    const pagePoint = (e) => ({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY });

    function constrain(s, shift) {
      if (!shift) return;
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      if (s.type === 'line' || s.type === 'arrow') {
        const step = Math.PI / 4;
        const ang = Math.round(Math.atan2(dy, dx) / step) * step;
        const len = Math.hypot(dx, dy);
        s.x2 = s.x1 + Math.cos(ang) * len;
        s.y2 = s.y1 + Math.sin(ang) * len;
      } else {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        s.x2 = s.x1 + Math.sign(dx || 1) * d;
        s.y2 = s.y1 + Math.sign(dy || 1) * d;
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (editor) { commitEditor(); return; } // first click just finishes the text
      const p = pagePoint(e);
      if (state.tool === 'text') { openEditor(e.clientX, e.clientY); return; }
      canvas.setPointerCapture(e.pointerId);
      if (state.tool === 'eraser') {
        state.erasing = true; state.erasedThisDrag = false;
        eraseAt(p);
        return;
      }
      if (state.tool === 'pen' || state.tool === 'highlighter') {
        state.current = {
          type: state.tool, color: state.color, points: [p],
          size: state.tool === 'highlighter' ? Math.max(12, state.size * 3) : state.size,
        };
      } else {
        state.current = { type: state.tool, color: state.color, size: state.size, fill: state.fill, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      }
      draw();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (state.erasing) { eraseAt(pagePoint(e)); return; }
      const s = state.current;
      if (!s) return;
      if (s.points) {
        const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ev of evs.length ? evs : [e]) {
          const p = pagePoint(ev), last = s.points[s.points.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) >= 1) s.points.push(p);
        }
      } else {
        const p = pagePoint(e);
        s.x2 = p.x; s.y2 = p.y;
        constrain(s, e.shiftKey);
      }
      scheduleDraw();
    });

    function endStroke() {
      state.erasing = false;
      const s = state.current;
      if (!s) return;
      state.current = null;
      const valid = s.points ? true : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2;
      if (valid) commit(() => state.shapes.push(s));
      else draw();
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- Text tool -------------------------------------------------------------------
    let editor = null;
    const fontSizeFor = (size) => Math.round(12 + size * 2);
    const langInfo = () => TR.byId[state.lang] || { id: 'en' };
    const fontFor = (fs, L) => `600 ${fs}px ${L.id === 'ur' ? URDU_STACK : FONT_STACK}`;
    const romanTail = /[A-Za-z~]+$/;

    function styleEditor() {
      if (!editor) return;
      const L = langInfo(), fs = fontSizeFor(state.size), font = fontFor(fs, L);
      editor.dataset.fs = fs;
      editor.dataset.font = font;
      editor.style.font = font;
      editor.style.lineHeight = '1.25';
      editor.style.color = state.color;
      editor.setAttribute('lang', L.id === 'en' ? 'en' : L.id);
      editor.dir = L.rtl ? 'rtl' : 'ltr';
      autosize();
    }
    function autosize() {
      if (!editor) return;
      const fs = +editor.dataset.fs;
      measureCtx.font = editor.dataset.font;
      const lines = editor.value.split('\n');
      const w = Math.max(fs * 0.5, ...lines.map((l) => measureCtx.measureText(l).width));
      editor.style.width = Math.ceil(w + fs * 0.8) + 'px';
      editor.style.height = Math.ceil(lines.length * fs * 1.25 + 2) + 'px';
      updateHint();
    }
    function updateHint() {
      const L = langInfo();
      if (!editor || L.id === 'en') { hint.hidden = true; return; }
      const before = editor.value.slice(0, editor.selectionStart);
      const m = before.match(romanTail);
      if (!m) { hint.hidden = true; return; }
      hint.textContent = TR.word(m[0], L.id);
      const small = document.createElement('small');
      small.textContent = 'space ↵';
      hint.appendChild(small);
      const r = editor.getBoundingClientRect();
      hint.style.left = r.left + 'px';
      hint.style.top = r.bottom + 6 + 'px';
      hint.dir = L.rtl ? 'rtl' : 'ltr';
      hint.hidden = false;
    }
    // Converts the English-letter word just before the caret (skipping `skip`
    // characters that were just typed, e.g. the space that ended the word).
    function convertTail(skip = 0) {
      if (!editor || state.lang === 'en') return;
      const pos = editor.selectionStart;
      const before = editor.value.slice(0, pos - skip);
      const m = before.match(romanTail);
      if (!m) return;
      const conv = TR.word(m[0], state.lang);
      const head = before.slice(0, before.length - m[0].length) + conv;
      const caret = head.length + skip;
      editor.value = head + editor.value.slice(pos - skip);
      editor.selectionStart = editor.selectionEnd = caret;
    }

    function openEditor(clientX, clientY) {
      editor = document.createElement('textarea');
      editor.className = 'editor';
      editor.spellcheck = false;
      editor.setAttribute('autocomplete', 'off');
      wrap.appendChild(editor);
      styleEditor();
      const fs = +editor.dataset.fs;
      editor.style.left = clientX + 'px';
      editor.style.top = (clientY - fs * 0.65) + 'px';
      editor.addEventListener('input', (e) => {
        if (!e.isComposing && state.lang !== 'en' && /^insert(Text|FromPaste)$/.test(e.inputType)) {
          const data = e.data || '';
          if (data.length === 1) {
            if (/[\s.,!?;:()"'\-|]/.test(data)) convertTail(1);
          } else {
            // Several characters at once (paste, etc.): convert each finished word.
            const pos = editor.selectionStart;
            let start = Math.max(0, pos - (data.length || pos));
            const prevWord = editor.value.slice(0, start).match(romanTail);
            if (prevWord) start -= prevWord[0].length; // word that this chunk finished
            const seg = editor.value.slice(start, pos)
              .replace(/[A-Za-z~]+(?=[\s.,!?;:()"'\-|])/g, (w) => TR.word(w, state.lang));
            const head = editor.value.slice(0, start) + seg;
            editor.value = head + editor.value.slice(pos);
            editor.selectionStart = editor.selectionEnd = head.length;
          }
        }
        autosize();
      });
      editor.addEventListener('click', updateHint);
      editor.addEventListener('keyup', updateHint);
      editor.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.isComposing) return;
        if (e.key === 'Escape') { e.preventDefault(); cancelEditor(); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditor(); return; }
        if (e.key === 'Enter') convertTail(); // Shift+Enter: convert before the new line
      });
      editor.addEventListener('blur', (e) => {
        if (e.relatedTarget && bar.contains(e.relatedTarget)) return; // using the toolbar
        if (e.relatedTarget === null && root.activeElement && bar.contains(root.activeElement)) return;
        commitEditor();
      });
      editor.focus();
      setTimeout(() => editor && root.activeElement !== editor && editor.focus(), 0);
    }
    function removeEditor() {
      const ed = editor;
      editor = null;
      hint.hidden = true;
      if (ed) ed.remove();
      return ed;
    }
    function cancelEditor() { removeEditor(); }
    function commitEditor() {
      if (!editor) return;
      convertTail();
      const rect = editor.getBoundingClientRect();
      const text = editor.value.replace(/\s+$/, '');
      const fs = +editor.dataset.fs, font = editor.dataset.font, rtl = editor.dir === 'rtl';
      const color = editor.style.color || state.color;
      removeEditor();
      if (!text.trim()) return;
      measureCtx.font = font;
      const lines = text.split('\n');
      const w = Math.max(...lines.map((l) => measureCtx.measureText(l).width));
      const x = rtl ? rect.right - 1 + window.scrollX - w : rect.left + 1 + window.scrollX;
      const y = rect.top + 1 + window.scrollY;
      commit(() => state.shapes.push({ type: 'text', text, x, y, w, h: lines.length * fs * 1.25, fs, font, rtl, color, size: 1 }));
      // A script's font may not be loaded the first time it is used; redraw once it is.
      if (document.fonts && document.fonts.load) document.fonts.load(font, text).then(() => draw(), () => {});
    }

    // ---- Toolbar ---------------------------------------------------------------------
    function setTool(tool) {
      if (tool !== 'text') commitEditor();
      state.tool = tool;
      wrap.classList.toggle('pass', tool === 'pass');
      root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
      canvas.style.cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
    }
    function setColor(c) {
      state.color = c;
      root.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === c));
      if (editor) { editor.style.color = c; editor.focus(); }
    }
    function setSize(v) {
      state.size = +v;
      sizeInput.value = v;
      sizeLabel.textContent = v;
      styleEditor();
    }
    function setFill(on) {
      state.fill = on;
      $('[data-act="fill"]').classList.toggle('on', on);
    }
    function setExpanded(on) {
      bar.classList.toggle('mini', !on);
      const b = $('[data-act="expand"]');
      b.innerHTML = on ? ICONS.collapse : ICONS.expand;
      b.title = on ? 'Fewer tools (M)' : 'More tools (M)';
      b.classList.toggle('on', on);
      // If the bar was dragged, keep the bigger version inside the window.
      if (bar.style.transform === 'none') {
        const r = bar.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) bar.style.left = Math.max(8, window.innerWidth - 8 - r.width) + 'px';
      }
    }
    function setLang(id, save) {
      if (!TR.byId[id] && id !== 'en') id = 'en';
      state.lang = id;
      langSelect.value = id;
      styleEditor();
      if (save) {
        try { const p = ext && ext.storage && ext.storage.local.set({ pageSketchLang: id }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      }
    }

    bar.addEventListener('pointerdown', (e) => {
      // Keep focus in the text box while clicking toolbar buttons.
      if (editor && !e.target.closest('select, input')) e.preventDefault();
    });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.dataset.color) setColor(b.dataset.color);
      else if (b.dataset.act === 'fill') setFill(!state.fill);
      else if (b.dataset.act === 'undo') undo();
      else if (b.dataset.act === 'redo') redo();
      else if (b.dataset.act === 'clear') clearAll();
      else if (b.dataset.act === 'expand') setExpanded(bar.classList.contains('mini'));
      else if (b.dataset.act === 'close') requestClose();
    });
    colorInput.addEventListener('input', () => setColor(colorInput.value));
    sizeInput.addEventListener('input', () => setSize(sizeInput.value));
    sizeInput.addEventListener('change', () => editor && editor.focus());
    langSelect.addEventListener('change', () => {
      setLang(langSelect.value, true);
      if (editor) editor.focus(); else setTool('text');
    });

    // Drag the toolbar by its grip.
    const grip = $('.grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = bar.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - ox));
        const y = Math.max(0, Math.min(window.innerHeight - r.height, ev.clientY - oy));
        Object.assign(bar.style, { left: x + 'px', top: y + 'px', transform: 'none' });
      };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });

    // ---- Keyboard shortcuts ------------------------------------------------------------
    const KEY_TOOLS = Object.fromEntries(TOOLS.map(([id, , k]) => [k, id]));
    function onKey(e) {
      if (editor) return; // text box handles its own keys
      const t = e.target;
      if (t !== host && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t === host && root.activeElement && /^(INPUT|SELECT)$/.test(root.activeElement.tagName) && e.key !== 'Escape') return;
      const k = e.key.toLowerCase();
      let handled = true;
      if (e.key === 'Escape') requestClose();
      else if ((e.ctrlKey || e.metaKey) && k === 'z') (e.shiftKey ? redo : undo)();
      else if ((e.ctrlKey || e.metaKey) && k === 'y') redo();
      else if (e.ctrlKey || e.metaKey || e.altKey) handled = false;
      else if (KEY_TOOLS[k]) setTool(KEY_TOOLS[k]);
      else if (k === 'f') setFill(!state.fill);
      else if (k === 'm') setExpanded(bar.classList.contains('mini'));
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scheduleDraw, { passive: true, capture: true });
    if (document.fonts) document.fonts.addEventListener('loadingdone', draw);

    setTool('pen');
    setColor(state.color);
    setSize(state.size);
    setFill(false);
    setExpanded(false);
    setLang('en');
    try {
      const p = ext && ext.storage && ext.storage.local.get('pageSketchLang');
      if (p && p.then) p.then((r) => { if (r && r.pageSketchLang) setLang(r.pageSketchLang); }).catch(() => {});
    } catch (_) {}
    resize();

    return {
      destroy() {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', resize);
        window.removeEventListener('scroll', scheduleDraw, { capture: true });
        if (document.fonts) document.fonts.removeEventListener('loadingdone', draw);
        if (rafId) cancelAnimationFrame(rafId);
        state.shapes = [];
        host.remove();
      },
    };
  }
})();
