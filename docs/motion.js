// Shared interaction layer for the account app and the standalone edition.
const spring = 'cubic-bezier(.2,1.12,.3,1)';
const panels = new Map();
let reduced;
let lastSource = null;
let sourceTime = 0;
let lastTrigger = null;

function play(element, frames, options = {}) {
  if (!element || reduced?.matches) return null;
  return element.animate(frames, { duration: 380, easing: spring, ...options });
}

function sourceTransform(panel, source) {
  const to = panel.getBoundingClientRect();
  const from = source?.isConnected ? source.getBoundingClientRect() : null;
  if (!from || !to.width || !to.height) return 'translateY(24px) scale(.98)';
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

export function dismissMotion(panel, done) {
  if (!panel || panel.dataset.leaving === 'true') { if (!panel) done(); return; }
  panel.dataset.leaving = 'true';
  const record = panels.get(panel.dataset.motionKey || panel.className);
  const animation = play(panel, [
    { transform: 'none', opacity: 1, borderRadius: getComputedStyle(panel).borderRadius },
    { transform: sourceTransform(panel, record?.source), opacity: 0, borderRadius: '28px' },
  ], { duration: 230, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
  if (animation) animation.finished.then(done, done); else done();
}

export function installMotion() {
  reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController();
  const signal = abort.signal;
  const seen = new WeakSet();
  const bound = new WeakSet();
  const listKeys = new Map();
  const activeAnimations = new Set();
  let scheduled = false;
  let savedOverflow = null;
  let tiltCard = null;
  let pointer = null;
  let tiltFrame = 0;
  let tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
  const mobile = () => matchMedia('(max-width: 680px)').matches;
  const on = (el, event, listener, options = {}) => el.addEventListener(event, listener, { ...options, signal });
  const animate = (el, frames, options) => {
    const a = play(el, frames, options);
    if (a) { activeAnimations.add(a); a.finished.then(() => activeAnimations.delete(a), () => activeAnimations.delete(a)); }
    return a;
  };
  on(document, 'click', event => {
    const source = event.target.closest('.idea-card,.inbox-main,.focus-card button,.capture,.capture-button,.ocean-preview,.open-ocean,[data-action="open-ocean"],[data-action="open-idea"],.ocean-node');
    if (source && (!source.closest('[data-motion-panel]') || source.closest('.ocean,.ocean-graph'))) {
      lastTrigger = source;
      lastSource = source.closest('.idea-card,.focus-card,.ocean-preview') || source;
      sourceTime = performance.now();
    }
  }, { capture: true });

  function bindSheet(panel) {
    const handle = panel.querySelector(':scope > .motion-handle');
    if (!handle || bound.has(handle)) return;
    bound.add(handle);
    let drag = null, dragged = false;
    const levels = [.34, .64, .94];
    const key = panel.dataset.motionKey || panel.className;
    const height = () => window.visualViewport?.height || innerHeight;
    const snap = index => {
      panel.dataset.snap = String(index);
      panel.style.removeProperty('height');
      handle.setAttribute('aria-label', `详情高度：${['摘要', '半屏', '全屏'][index]}。点击切换，方向键调整`);
      if (panels.has(key)) panels.get(key).snap = index;
    };
    snap(panels.get(key)?.snap ?? 1);
    on(handle, 'pointerdown', event => {
      if (!mobile() || event.button !== 0) return;
      dragged = false;
      drag = { y: event.clientY, h: panel.getBoundingClientRect().height, last: event.clientY, time: performance.now(), velocity: 0 };
      panel.classList.add('is-dragging');
      handle.setPointerCapture(event.pointerId);
    });
    on(handle, 'pointermove', event => {
      if (!drag) return;
      const now = performance.now();
      drag.velocity = (event.clientY - drag.last) / Math.max(now - drag.time, 1);
      drag.last = event.clientY; drag.time = now;
      dragged ||= Math.abs(event.clientY - drag.y) > 5;
      const raw = drag.h + drag.y - event.clientY;
      const min = height() * .24, max = height() * .94;
      const resisted = raw < min ? min + (raw - min) * .2 : raw > max ? max + (raw - max) * .2 : raw;
      panel.style.height = `${resisted}px`;
    });
    const release = (event, cancel = false) => {
      if (!drag) return;
      const velocity = performance.now() - drag.time < 100 ? drag.velocity : 0;
      const projected = panel.getBoundingClientRect().height - velocity * 160;
      const moved = dragged;
      drag = null;
      panel.classList.remove('is-dragging');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (cancel || !moved) { snap(Number(panel.dataset.snap)); return; }
      if (projected < height() * .20) {
        panel.querySelector('[data-motion-close]')?.click();
      } else {
        const nearest = levels.reduce((best, value, index) => Math.abs(value * height() - projected) < Math.abs(levels[best] * height() - projected) ? index : best, 0);
        snap(nearest);
      }
    };
    on(handle, 'pointerup', event => release(event));
    on(handle, 'pointercancel', event => release(event, true));
    on(handle, 'click', () => { if (dragged) { dragged = false; return; } snap((Number(panel.dataset.snap) + 1) % 3); });
    on(handle, 'keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = Number(panel.dataset.snap);
      snap(event.key === 'Home' ? 0 : event.key === 'End' ? 2 : Math.max(0, Math.min(2, index + (event.key === 'ArrowUp' ? 1 : -1))));
    });
  }

  function refresh() {
    scheduled = false;
    const current = new Set();
    document.querySelectorAll('[data-motion-panel]').forEach(panel => {
      const key = panel.dataset.motionKey || panel.className;
      current.add(key);
      const old = panels.get(key);
      if (!old) {
        const source = performance.now() - sourceTime < 1800 ? lastSource : document.activeElement;
        panels.set(key, { panel, source, focus: performance.now() - sourceTime < 1800 ? lastTrigger : document.activeElement, snap: 1 });
        bindSheet(panel);
        animate(panel, [
          { transform: sourceTransform(panel, source), opacity: .25, borderRadius: '28px' },
          { transform: 'none', opacity: 1, borderRadius: getComputedStyle(panel).borderRadius },
        ]);
        (panel.querySelector('[autofocus]') || panel.querySelector('textarea') || panel.querySelector('[data-motion-close], button'))?.focus({ preventScroll: true });
      } else {
        old.panel = panel;
        bindSheet(panel);
      }
    });
    for (const [key, record] of panels) {
      if (!current.has(key)) {
        panels.delete(key);
        if (!current.size || record.focus?.closest('[data-motion-panel]')) {
          const focus = record.focus?.isConnected ? record.focus : record.source;
          queueMicrotask(() => focus?.isConnected && focus.focus({ preventScroll: true }));
        }
      }
    }
    const modalOpen = current.size > 0;
    document.querySelectorAll('.sidebar,.workspace').forEach(el => {
      const containsPanel = el.querySelector('[data-motion-panel]');
      el.inert = modalOpen && !containsPanel;
      [...el.children].forEach(child => { child.inert = modalOpen && Boolean(containsPanel) && !child.matches('[data-motion-panel]') && !child.querySelector('[data-motion-panel]'); });
    });
    if (modalOpen && savedOverflow === null) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    if (!modalOpen && savedOverflow !== null) { document.body.style.overflow = savedOverflow; savedOverflow = null; }
    const currentLists = new Set();
    document.querySelectorAll('.idea-grid,.library-grid,.inbox-list,.news-list,.kanban > section,.cascade-target').forEach((list, position) => {
      const group = `${document.querySelector('.topbar h1')?.textContent}|${list.className}|${position}`;
      currentLists.add(group);
      const previous = listKeys.get(group) || new Set();
      const next = new Set();
      let index = 0;
      [...list.children].forEach(item => {
        const id = item.dataset.id || item.dataset.ideaId || item.querySelector('[data-id]')?.dataset.id || item.textContent;
        next.add(id);
        if (seen.has(item) || previous.has(id) || item.tagName === 'HEADER') return;
        seen.add(item);
        animate(item, [{ opacity: 0, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 390, delay: Math.min(index++, 5) * 45, fill: 'backwards' });
      });
      listKeys.set(group, next);
    });
    for (const key of listKeys.keys()) if (!currentLists.has(key)) listKeys.delete(key);
  }
  const observer = new MutationObserver(() => {
    if (!scheduled) { scheduled = true; queueMicrotask(refresh); }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-motion-panel'] });
  on(document, 'keydown', event => {
    const record = [...panels.values()].at(-1);
    if (!record) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      record.panel.querySelector('[data-motion-close]')?.click();
    }
    if (event.key === 'Tab') {
      const items = [...record.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { capture: true });

  function tiltTick() {
    tiltX += (targetX - tiltX) * .15; tiltY += (targetY - tiltY) * .15;
    if (!tiltCard?.isConnected) { tiltFrame = 0; return; }
    tiltCard.style.transform = `perspective(1100px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    if (Math.abs(targetX - tiltX) + Math.abs(targetY - tiltY) > .015) tiltFrame = requestAnimationFrame(tiltTick);
    else { tiltFrame = 0; if (!pointer) { tiltCard.style.removeProperty('transform'); tiltCard = null; } }
  }
  on(document, 'pointermove', event => {
    if (reduced.matches || event.pointerType !== 'mouse') return;
    const card = event.target.closest('.focus-card');
    if (card) {
      if (tiltCard && tiltCard !== card) tiltCard.style.removeProperty('transform');
      tiltCard = card; pointer = event;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      targetX = (y - .5) * -3; targetY = (x - .5) * 3;
      card.style.setProperty('--light-x', `${x * 100}%`); card.style.setProperty('--light-y', `${y * 100}%`);
      card.classList.add('is-lit');
    } else { pointer = null; targetX = targetY = 0; tiltCard?.classList.remove('is-lit'); }
    if (tiltCard && !tiltFrame) tiltFrame = requestAnimationFrame(tiltTick);
  });
  const resetTilt = () => { pointer = null; targetX = targetY = 0; tiltCard?.classList.remove('is-lit'); if (tiltCard && !tiltFrame) tiltFrame = requestAnimationFrame(tiltTick); };
  on(window, 'blur', resetTilt);
  on(document, 'pointerout', event => { if (!event.relatedTarget) resetTilt(); });
  on(document, 'pointerup', event => {
    const button = event.target.closest('button:not(:disabled)');
    if (button && !button.classList.contains('motion-handle')) animate(button, [{ scale: '.97' }, { scale: '1.012', offset: .65 }, { scale: '1' }], { duration: 260 });
  });
  on(reduced, 'change', () => { if (reduced.matches) { activeAnimations.forEach(a => a.cancel()); cancelAnimationFrame(tiltFrame); tiltFrame = 0; tiltCard?.style.removeProperty('transform'); tiltCard?.classList.remove('is-lit'); tiltCard = null; pointer = null; targetX = targetY = tiltX = tiltY = 0; } });
  refresh();
  return () => {
    observer.disconnect(); abort.abort(); cancelAnimationFrame(tiltFrame);
    activeAnimations.forEach(a => a.cancel());
    tiltCard?.style.removeProperty('transform');
    document.querySelectorAll('.sidebar,.workspace,.sidebar > *,.workspace > *').forEach(el => { el.inert = false; });
    if (savedOverflow !== null) document.body.style.overflow = savedOverflow;
    panels.clear();
  };
}
