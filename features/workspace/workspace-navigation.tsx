'use client';

import { useLayoutEffect, useRef } from 'react';
import type { View } from '../../lib/workspace-navigation';
import { Icon } from './components';

const items: { id: View; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'ideas', label: '想法' },
  { id: 'actions', label: '行动' },
  { id: 'review', label: '回顾' },
];

// DesignBookmark's shared --spring-lead and --spring-trail (stiffness, damping).
const lead = { stiffness: 620, damping: 36 };
const trail = { stiffness: 190, damping: 19 };
type Edge = { position: number; velocity: number };

function step(edge: Edge, target: number, spring: typeof lead, dt: number) {
  const acceleration = spring.stiffness * (target - edge.position) - spring.damping * edge.velocity;
  edge.velocity += acceleration * dt;
  edge.position += edge.velocity * dt;
}

function settled(edge: Edge, target: number) {
  return Math.abs(edge.position - target) < 0.05 && Math.abs(edge.velocity) < 0.1;
}

export default function WorkspaceNavigation({ view, navigate, inboxCount }: {
  view: View;
  navigate: (view: View) => void;
  inboxCount: number;
}) {
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const motion = useRef({
    axis: '' as '' | 'x' | 'y',
    start: { position: 0, velocity: 0 },
    end: { position: 0, velocity: 0 },
  });

  useLayoutEffect(() => {
    const nav = navRef.current!;
    const pill = pillRef.current!;
    const button = activeRef.current!;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const edges = motion.current;
    const { start, end } = edges;
    let frame = 0;
    let previousTime = performance.now();

    function measure() {
      const group = nav.getBoundingClientRect();
      const item = button.getBoundingClientRect();
      const horizontal = getComputedStyle(nav).display === 'grid'; // Mobile bottom bar
      return {
        horizontal,
        start: horizontal ? item.left - group.left : item.top - group.top,
        size: horizontal ? item.width : item.height,
        cross: horizontal ? item.top - group.top : item.left - group.left,
        thickness: horizontal ? item.height : item.width,
      };
    }

    let box = measure();
    const targetEnd = () => box.start + box.size;
    const forward = box.start + targetEnd() >= start.position + end.position;

    function paint() {
      const size = Math.max(0, end.position - start.position);
      const x = box.horizontal ? start.position : box.cross;
      const y = box.horizontal ? box.cross : start.position;
      pill.style.transform = `translate(${x}px, ${y}px)`;
      pill.style.width = `${box.horizontal ? size : box.thickness}px`;
      pill.style.height = `${box.horizontal ? box.thickness : size}px`;
    }

    function snap() {
      cancelAnimationFrame(frame);
      edges.axis = box.horizontal ? 'x' : 'y';
      start.position = box.start;
      end.position = targetEnd();
      start.velocity = end.velocity = 0;
      paint();
    }

    function tick(now: number) {
      const dt = Math.min((now - previousTime) / 1000, 1 / 30) / 4;
      previousTime = now;
      for (let i = 0; i < 4; i++) {
        step(start, box.start, forward ? trail : lead, dt);
        step(end, targetEnd(), forward ? lead : trail, dt);
      }
      if (settled(start, box.start) && settled(end, targetEnd())) {
        snap();
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    }

    if (preference.matches || edges.axis !== (box.horizontal ? 'x' : 'y')) snap();
    else frame = requestAnimationFrame(tick);
    nav.dataset.pillReady = '';

    const observer = new ResizeObserver(() => {
      const next = measure();
      if (next.horizontal !== box.horizontal || next.start !== box.start || next.size !== box.size
        || next.cross !== box.cross || next.thickness !== box.thickness) {
        box = next;
        snap();
      }
    });
    observer.observe(nav);
    nav.querySelectorAll('button').forEach(item => observer.observe(item));
    preference.addEventListener('change', snap);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener('change', snap);
    };
  }, [view]);

  return (
    <nav ref={navRef} aria-label="主导航">
      <span ref={pillRef} className="ns-nav-pill" aria-hidden="true" />
      {items.map(({ id, label }) => (
        <button key={id} ref={view === id ? activeRef : undefined} type="button"
          className={view === id ? 'active' : undefined}
          aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
          <Icon name={id} />
          <span>{label}</span>
          {id === 'ideas' && inboxCount > 0 ? <b>{inboxCount}</b> : null}
        </button>
      ))}
    </nav>
  );
}
