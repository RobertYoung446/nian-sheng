"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GraphIdea = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  status: string;
};
export type AiConfig = {
  provider: "openai" | "deepseek" | "openrouter";
  model: string;
  apiKey: string;
};
type Edge = {
  sourceId: string;
  targetId: string;
  type: string;
  reason: string;
  strength: number;
};
type Point = { id: string; x: number; y: number };

export default function FluidGraph({
  ideas,
  config,
  onClose,
  onOpen,
}: {
  ideas: GraphIdea[];
  config: AiConfig;
  onClose: () => void;
  onOpen: (idea: GraphIdea) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, x: 0, y: 0, ox: 0, oy: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const [edges, setEdges] = useState<Edge[]>(() => fallbackEdges(ideas));
  const [mode, setMode] = useState<"loading" | "model" | "local">("loading");
  const points = useMemo<Point[]>(() => layoutPoints(ideas), [ideas]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        action: "relations",
        provider: config.provider,
        model: config.model,
        ideas,
      }),
    })
      .then(async (response) => ({
        ok: response.ok,
        data: await response.json(),
      }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data.result?.edges)) {
          setEdges(validEdges(data.result.edges, ideas));
          setMode("model");
        } else setMode("local");
      })
      .catch(() => setMode("local"));
    return () => {
      cancelled = true;
    };
  }, [ideas, config.provider, config.model, config.apiKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      drawOcean(ctx, innerWidth, innerHeight, t, pointerRef.current);
      drawEdges(ctx, points, edges, panRef.current, t);
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
      removeEventListener("resize", resize);
    };
  }, [points, edges]);

  function pointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest(".ocean-node")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      ox: panRef.current.x,
      oy: panRef.current.y,
    };
  }
  function pointerMove(event: React.PointerEvent) {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (!dragRef.current.active) return;
    panRef.current = {
      x: dragRef.current.ox + event.clientX - dragRef.current.x,
      y: dragRef.current.oy + event.clientY - dragRef.current.y,
    };
    if (worldRef.current)
      worldRef.current.style.transform = `translate3d(${panRef.current.x}px,${panRef.current.y}px,0)`;
  }
  function pointerUp() {
    dragRef.current.active = false;
  }

  return (
    <section
      className="ocean-graph"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <canvas ref={canvasRef} />
      <div className="ocean-noise" />
      <header className="ocean-header glass">
        <div>
          <span>AI IDEA OCEAN</span>
          <h2>想法关系海</h2>
          <p>长按并拖动海面探索 · 点击想法查看详情</p>
        </div>
        <div className={`engine-state ${mode}`}>
          <i />
          {mode === "model"
            ? "真实大模型已完成关系分配"
            : mode === "loading"
              ? "AI 正在分析关系…"
              : "本地语义引擎模式"}
        </div>
        <button onClick={onClose} aria-label="关闭全屏图谱">
          ×
        </button>
      </header>
      <div className="ocean-world" ref={worldRef}>
        {points.map((point, index) => {
          const idea = ideas.find((item) => item.id === point.id)!;
          return (
            <button
              className="ocean-node pressable"
              style={{
                left: point.x,
                top: point.y,
                animationDelay: `-${index * 1.4}s`,
              }}
              key={idea.id}
              onClick={() => onOpen(idea)}
            >
              <span>{idea.tags[0] || "想法"}</span>
              <h3>{idea.title}</h3>
              <div>
                <small>{idea.status}</small>
                <b>{idea.confidence}</b>
              </div>
            </button>
          );
        })}
      </div>
      <aside className="ocean-legend glass">
        <strong>关系类型</strong>
        {[...new Set(edges.map((edge) => edge.type))]
          .slice(0, 6)
          .map((type, index) => (
            <span key={type}>
              <i className={`c${index}`} />
              {type}
            </span>
          ))}
      </aside>
      <div className="drag-hint">
        按住海面拖动 <span>↔</span>
      </div>
    </section>
  );
}

function layoutPoints(ideas: GraphIdea[]): Point[] {
  const count = Math.max(ideas.length, 1);
  return ideas.map((idea, index) => {
    const ring = Math.floor(index / 8);
    const slot = index % 8;
    const angle = (slot / Math.min(8, count)) * Math.PI * 2 + ring * 0.45;
    const radius = 250 + ring * 260;
    return {
      id: idea.id,
      x: innerSafeWidth() / 2 + Math.cos(angle) * radius,
      y: innerSafeHeight() / 2 + Math.sin(angle) * radius,
    };
  });
}
function innerSafeWidth() {
  return typeof window === "undefined" ? 1200 : window.innerWidth;
}
function innerSafeHeight() {
  return typeof window === "undefined" ? 800 : window.innerHeight;
}
function fallbackEdges(ideas: GraphIdea[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < ideas.length; i++)
    for (let j = i + 1; j < ideas.length; j++) {
      const shared = ideas[i].tags.filter((tag) => ideas[j].tags.includes(tag));
      if (shared.length)
        edges.push({
          sourceId: ideas[i].id,
          targetId: ideas[j].id,
          type: "主题相似",
          reason: `共享 ${shared.join("、")}`,
          strength: 0.68,
        });
    }
  if (!edges.length && ideas.length > 1)
    for (let i = 1; i < ideas.length; i++)
      edges.push({
        sourceId: ideas[0].id,
        targetId: ideas[i].id,
        type: "潜在互补",
        reason: "等待模型进一步判断",
        strength: 0.4,
      });
  return edges;
}
function validEdges(raw: unknown[], ideas: GraphIdea[]) {
  const ids = new Set(ideas.map((idea) => idea.id));
  return raw
    .filter((edge): edge is Edge =>
      Boolean(
        edge &&
          typeof edge === "object" &&
          ids.has((edge as Edge).sourceId) &&
          ids.has((edge as Edge).targetId),
      ),
    )
    .slice(0, 80);
}
function drawOcean(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  pointer: { x: number; y: number },
) {
  ctx.clearRect(0, 0, w, h);
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#dff3eb");
  base.addColorStop(0.48, "#b8dccd");
  base.addColorStop(1, "#6ea992");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "screen";
  const blobs = [
    [0.18, 0.2, 260, "rgba(255,255,255,.55)"],
    [0.76, 0.24, 330, "rgba(180,230,211,.42)"],
    [0.58, 0.75, 380, "rgba(126,193,167,.34)"],
    [pointer.x / w || 0.5, pointer.y / h || 0.5, 210, "rgba(255,244,220,.3)"],
  ] as const;
  blobs.forEach(([bx, by, r, color], i) => {
    const x = bx * w + Math.sin(t * 0.22 + i) * 60,
      y = by * h + Math.cos(t * 0.18 + i) * 45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    for (let x = -40; x < w + 40; x += 18) {
      const y =
        h * (0.12 + i * 0.11) +
        Math.sin(x * 0.008 + t * 0.35 + i) * 22 +
        Math.sin(x * 0.003 - t * 0.2) * 18;
      if (x === -40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.09 + i * 0.008})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
function drawEdges(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  edges: Edge[],
  pan: { x: number; y: number },
  t: number,
) {
  const map = new Map(points.map((point) => [point.id, point]));
  edges.forEach((edge, index) => {
    const a = map.get(edge.sourceId),
      b = map.get(edge.targetId);
    if (!a || !b) return;
    const ax = a.x + pan.x,
      ay = a.y + pan.y,
      bx = b.x + pan.x,
      by = b.y + pan.y;
    const mx = (ax + bx) / 2 + Math.sin(t * 0.45 + index) * 18,
      my = (ay + by) / 2 + Math.cos(t * 0.38 + index) * 18;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.strokeStyle = `rgba(28,91,67,${0.22 + edge.strength * 0.34})`;
    ctx.lineWidth = 1 + edge.strength * 2;
    ctx.stroke();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = -t * 8;
    ctx.strokeStyle = "rgba(255,255,255,.52)";
    ctx.stroke();
    ctx.setLineDash([]);
  });
}
