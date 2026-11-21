import React, { useCallback, useEffect, useRef } from 'react';

export type AnnotationTool =
  | 'pointer'
  | 'laser'
  | 'pen'
  | 'highlighter'
  | 'arrow'
  | 'rect'
  | 'eraser';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'arrow' | 'rect';
  color: string;
  size: number; // Base stroke width in px at 1280px reference width
  points: NormalizedPoint[];
}

export const ANNOTATION_COLORS = [
  { id: 'red', label: 'Crimson Red', value: '#ef4444' },
  { id: 'amber', label: 'Amber Gold', value: '#f59e0b' },
  { id: 'emerald', label: 'Emerald Green', value: '#22c55e' },
  { id: 'sky', label: 'Sky Blue', value: '#38bdf8' },
  { id: 'white', label: 'Pure White', value: '#ffffff' },
  { id: 'ink', label: 'Charcoal Ink', value: '#0f172a' },
] as const;

export const LASER_COLORS = [
  { id: 'red', label: 'Red Laser', value: '#ef4444' },
  { id: 'amber', label: 'Amber Laser', value: '#f59e0b' },
  { id: 'emerald', label: 'Green Laser', value: '#22c55e' },
  { id: 'sky', label: 'Blue Laser', value: '#38bdf8' },
] as const;

export const ANNOTATION_SIZES = [
  { id: 'sm', label: 'Fine', value: 3 },
  { id: 'md', label: 'Medium', value: 5.5 },
  { id: 'lg', label: 'Bold', value: 9 },
] as const;

interface LaserTrailPoint {
  x: number; // Local CSS px
  y: number;
  time: number;
}

interface PresentationAnnotationLayerProps {
  tool: AnnotationTool;
  color: string;
  laserColor: string;
  strokeSize: number;
  annotations: AnnotationStroke[];
  onCommitStroke: (stroke: AnnotationStroke) => void;
  onEraseStrokeIds: (ids: string[]) => void;
}

const LASER_TRAIL_LIFETIME_MS = 460;
const LASER_MAX_POINTS = 48;

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTestStroke(
  stroke: AnnotationStroke,
  px: number,
  py: number,
  width: number,
  height: number,
  radiusPx: number
): boolean {
  const scale = width / 1280;
  const extra = Math.max(
    radiusPx,
    stroke.size * scale * (stroke.tool === 'highlighter' ? 2.2 : 1.1)
  );
  const pts = stroke.points;
  if (pts.length === 0) return false;

  if (stroke.tool === 'rect' && pts.length >= 2) {
    const x1 = Math.min(pts[0].x, pts[pts.length - 1].x) * width;
    const x2 = Math.max(pts[0].x, pts[pts.length - 1].x) * width;
    const y1 = Math.min(pts[0].y, pts[pts.length - 1].y) * height;
    const y2 = Math.max(pts[0].y, pts[pts.length - 1].y) * height;
    return (
      distToSegment(px, py, x1, y1, x2, y1) <= extra ||
      distToSegment(px, py, x2, y1, x2, y2) <= extra ||
      distToSegment(px, py, x2, y2, x1, y2) <= extra ||
      distToSegment(px, py, x1, y2, x1, y1) <= extra
    );
  }

  if (stroke.tool === 'arrow' && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    return distToSegment(px, py, a.x * width, a.y * height, b.x * width, b.y * height) <= extra;
  }

  if (pts.length === 1) {
    return Math.hypot(px - pts[0].x * width, py - pts[0].y * height) <= extra;
  }

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (distToSegment(px, py, a.x * width, a.y * height, b.x * width, b.y * height) <= extra) {
      return true;
    }
  }
  return false;
}

function drawStrokeOnCanvas(
  ctx: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  width: number,
  height: number
) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  const scale = width / 1280;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(8, stroke.size * 3.8 * scale);
  } else {
    ctx.globalAlpha = 0.96;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = Math.max(1.5, stroke.size * scale);
  }

  if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
    if (pts.length === 1) {
      const p = pts[0];
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      for (let i = 1; i < pts.length - 1; i++) {
        const cx = pts[i].x * width;
        const cy = pts[i].y * height;
        const nx = (pts[i].x + pts[i + 1].x) * 0.5 * width;
        const ny = (pts[i].y + pts[i + 1].y) * 0.5 * height;
        ctx.quadraticCurveTo(cx, cy, nx, ny);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * width, last.y * height);
      ctx.stroke();
    }
  } else if (stroke.tool === 'arrow' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    const x1 = start.x * width;
    const y1 = start.y * height;
    const x2 = end.x * width;
    const y2 = end.y * height;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(len * 0.45, Math.max(14, ctx.lineWidth * 4.2));
      const headSpread = Math.PI / 6.5;

      const shaftEndX = x2 - Math.cos(angle) * (headLen * 0.65);
      const shaftEndY = y2 - Math.sin(angle) * (headLen * 0.65);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - headSpread),
        y2 - headLen * Math.sin(angle - headSpread)
      );
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + headSpread),
        y2 - headLen * Math.sin(angle + headSpread)
      );
      ctx.closePath();
      ctx.fill();
    }
  } else if (stroke.tool === 'rect' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    const x = Math.min(start.x, end.x) * width;
    const y = Math.min(start.y, end.y) * height;
    const rw = Math.abs(end.x - start.x) * width;
    const rh = Math.abs(end.y - start.y) * height;
    const radius = Math.min(10 * scale, rw / 4, rh / 4);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, rw, rh, radius);
    } else {
      ctx.rect(x, y, rw, rh);
    }
    ctx.stroke();
  }

  ctx.restore();
}

const PresentationAnnotationLayerImpl: React.FC<PresentationAnnotationLayerProps> = ({
  tool,
  color,
  laserColor,
  strokeSize,
  annotations,
  onCommitStroke,
  onEraseStrokeIds,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const laserDotRef = useRef<HTMLDivElement>(null);
  const eraserCursorRef = useRef<HTMLDivElement>(null);

  const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const activeStrokeRef = useRef<AnnotationStroke | null>(null);
  const isErasingRef = useRef(false);

  const toolRef = useRef<AnnotationTool>(tool);
  toolRef.current = tool;
  const laserColorRef = useRef<string>(laserColor);
  laserColorRef.current = laserColor;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserRafRef = useRef<number | null>(null);

  const refreshRect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const renderDrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, dpr } = sizeRef.current;
    if (width <= 0 || height <= 0) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const list = annotationsRef.current;
    for (let i = 0; i < list.length; i++) {
      drawStrokeOnCanvas(ctx, list[i], width, height);
    }
    if (activeStrokeRef.current) {
      drawStrokeOnCanvas(ctx, activeStrokeRef.current, width, height);
    }

    ctx.restore();
  }, []);

  const clearLaserCanvas = useCallback(() => {
    if (laserRafRef.current !== null) {
      cancelAnimationFrame(laserRafRef.current);
      laserRafRef.current = null;
    }
    laserTrailRef.current = [];
    const canvas = laserCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const tickLaserTrail = useCallback(() => {
    const canvas = laserCanvasRef.current;
    if (!canvas) {
      laserRafRef.current = null;
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      laserRafRef.current = null;
      return;
    }

    const { width, height, dpr } = sizeRef.current;
    const now = performance.now();
    const trail = laserTrailRef.current;

    let firstAlive = 0;
    while (firstAlive < trail.length && now - trail[firstAlive].time >= LASER_TRAIL_LIFETIME_MS) {
      firstAlive++;
    }
    if (firstAlive > 0) {
      trail.splice(0, firstAlive);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (trail.length >= 2) {
      const strokeColor = laserColorRef.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Soft tapered outer glow ribbon
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const ageRatio = Math.max(0, 1 - (now - p1.time) / LASER_TRAIL_LIFETIME_MS);
        const posRatio = i / (trail.length - 1);
        const intensity = ageRatio * ageRatio * posRatio;
        if (intensity <= 0.01) continue;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = intensity * 0.45;
        ctx.lineWidth = Math.max(2, 12 * intensity);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = intensity * 0.72;
        ctx.lineWidth = Math.max(1, 3.6 * intensity);
        ctx.stroke();
      }
    }

    ctx.restore();

    if (trail.length > 0) {
      laserRafRef.current = requestAnimationFrame(tickLaserTrail);
    } else {
      laserRafRef.current = null;
    }
  }, []);

  const ensureLaserLoop = useCallback(() => {
    if (laserRafRef.current === null) {
      laserRafRef.current = requestAnimationFrame(tickLaserTrail);
    }
  }, [tickLaserTrail]);

  // Keep canvases matched to container size and cache bounding rect
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncCanvasSizes = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width, height, dpr };
      refreshRect();

      const drawCanvas = drawCanvasRef.current;
      if (drawCanvas) {
        drawCanvas.width = Math.max(1, Math.round(width * dpr));
        drawCanvas.height = Math.max(1, Math.round(height * dpr));
      }
      const laserCanvas = laserCanvasRef.current;
      if (laserCanvas) {
        laserCanvas.width = Math.max(1, Math.round(width * dpr));
        laserCanvas.height = Math.max(1, Math.round(height * dpr));
      }
      renderDrawCanvas();
    };

    const rect = el.getBoundingClientRect();
    syncCanvasSizes(rect.width, rect.height);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncCanvasSizes(entry.contentRect.width, entry.contentRect.height);
      }
    });
    ro.observe(el);
    window.addEventListener('resize', refreshRect, { passive: true });
    window.addEventListener('scroll', refreshRect, { passive: true, capture: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', refreshRect);
      window.removeEventListener('scroll', refreshRect, true);
    };
  }, [renderDrawCanvas, refreshRect]);

  useEffect(() => {
    renderDrawCanvas();
  }, [annotations, renderDrawCanvas]);

  useEffect(() => {
    if (tool !== 'laser') {
      clearLaserCanvas();
      if (laserDotRef.current) laserDotRef.current.style.opacity = '0';
    }
    if (tool !== 'eraser' && eraserCursorRef.current) {
      eraserCursorRef.current.style.opacity = '0';
    }
  }, [tool, clearLaserCanvas]);

  useEffect(() => {
    return () => clearLaserCanvas();
  }, [clearLaserCanvas]);

  const toLocalPoint = (clientX: number, clientY: number) => {
    const r = rectRef.current;
    if (r.width <= 0 || r.height <= 0) return null;
    const px = Math.max(0, Math.min(r.width, clientX - r.left));
    const py = Math.max(0, Math.min(r.height, clientY - r.top));
    return {
      px,
      py,
      norm: {
        x: px / r.width,
        y: py / r.height,
      },
    };
  };

  const pushLaserPoint = (px: number, py: number, now: number) => {
    const trail = laserTrailRef.current;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(px - last.x, py - last.y) >= 2) {
      trail.push({ x: px, y: py, time: now });
      if (trail.length > LASER_MAX_POINTS) {
        trail.shift();
      }
      ensureLaserLoop();
    }
  };

  const updateLaserDot = (px: number, py: number, visible: boolean) => {
    const dot = laserDotRef.current;
    if (!dot) return;
    if (!visible) {
      dot.style.opacity = '0';
      return;
    }
    dot.style.opacity = '1';
    dot.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  };

  const updateEraserCursor = (px: number, py: number, visible: boolean) => {
    const el = eraserCursorRef.current;
    if (!el) return;
    if (!visible) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  };

  const eraseAtPoint = (px: number, py: number) => {
    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;
    const radiusPx = Math.max(12, 16 * (width / 1280));
    const hitIds: string[] = [];
    const list = annotationsRef.current;
    for (let i = 0; i < list.length; i++) {
      if (hitTestStroke(list[i], px, py, width, height, radiusPx)) {
        hitIds.push(list[i].id);
      }
    }
    if (hitIds.length > 0) {
      onEraseStrokeIds(hitIds);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const currentTool = toolRef.current;
    if (currentTool === 'pointer') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    refreshRect();
    const pos = toLocalPoint(e.clientX, e.clientY);
    if (!pos) return;

    if (currentTool === 'laser') {
      updateLaserDot(pos.px, pos.py, true);
      pushLaserPoint(pos.px, pos.py, performance.now());
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (currentTool === 'eraser') {
      isErasingRef.current = true;
      updateEraserCursor(pos.px, pos.py, true);
      eraseAtPoint(pos.px, pos.py);
      return;
    }

    activeStrokeRef.current = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool: currentTool,
      color,
      size: strokeSize,
      points: [pos.norm],
    };
    renderDrawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const currentTool = toolRef.current;
    if (currentTool === 'pointer') return;

    if (currentTool === 'laser') {
      const nativeEvent = e.nativeEvent as PointerEvent;
      const coalesced =
        typeof nativeEvent.getCoalescedEvents === 'function'
          ? nativeEvent.getCoalescedEvents()
          : null;
      const now = performance.now();

      if (coalesced && coalesced.length > 0) {
        let lastPos: { px: number; py: number } | null = null;
        for (let i = 0; i < coalesced.length; i++) {
          const p = toLocalPoint(coalesced[i].clientX, coalesced[i].clientY);
          if (p) {
            pushLaserPoint(p.px, p.py, now);
            lastPos = p;
          }
        }
        if (lastPos) {
          updateLaserDot(lastPos.px, lastPos.py, true);
        }
      } else {
        const pos = toLocalPoint(e.clientX, e.clientY);
        if (pos) {
          updateLaserDot(pos.px, pos.py, true);
          pushLaserPoint(pos.px, pos.py, now);
        }
      }
      return;
    }

    const pos = toLocalPoint(e.clientX, e.clientY);
    if (!pos) return;

    if (currentTool === 'eraser') {
      updateEraserCursor(pos.px, pos.py, true);
      if (isErasingRef.current) {
        eraseAtPoint(pos.px, pos.py);
      }
      return;
    }

    const active = activeStrokeRef.current;
    if (!active) return;

    if (active.tool === 'pen' || active.tool === 'highlighter') {
      const last = active.points[active.points.length - 1];
      const dx = (pos.norm.x - last.x) * sizeRef.current.width;
      const dy = (pos.norm.y - last.y) * sizeRef.current.height;
      if (Math.hypot(dx, dy) >= 2) {
        active.points.push(pos.norm);
        renderDrawCanvas();
      }
    } else if (active.tool === 'arrow') {
      let endPt = pos.norm;
      if (e.shiftKey && sizeRef.current.width > 0 && sizeRef.current.height > 0) {
        const start = active.points[0];
        const dx = (pos.norm.x - start.x) * sizeRef.current.width;
        const dy = (pos.norm.y - start.y) * sizeRef.current.height;
        const len = Math.hypot(dx, dy);
        const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        endPt = {
          x: Math.max(0, Math.min(1, start.x + (Math.cos(snapped) * len) / sizeRef.current.width)),
          y: Math.max(0, Math.min(1, start.y + (Math.sin(snapped) * len) / sizeRef.current.height)),
        };
      }
      active.points = [active.points[0], endPt];
      renderDrawCanvas();
    } else if (active.tool === 'rect') {
      let endPt = pos.norm;
      if (e.shiftKey && sizeRef.current.width > 0 && sizeRef.current.height > 0) {
        const start = active.points[0];
        const dx = (pos.norm.x - start.x) * sizeRef.current.width;
        const dy = (pos.norm.y - start.y) * sizeRef.current.height;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        endPt = {
          x: Math.max(
            0,
            Math.min(1, start.x + (Math.sign(dx || 1) * side) / sizeRef.current.width)
          ),
          y: Math.max(
            0,
            Math.min(1, start.y + (Math.sign(dy || 1) * side) / sizeRef.current.height)
          ),
        };
      }
      active.points = [active.points[0], endPt];
      renderDrawCanvas();
    }
  };

  const handlePointerLeave = () => {
    if (laserDotRef.current) laserDotRef.current.style.opacity = '0';
    if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = '0';
  };

  const finishInteraction = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const currentTool = toolRef.current;
    if (currentTool === 'laser') {
      if (e && e.pointerType !== 'mouse' && laserDotRef.current) {
        laserDotRef.current.style.opacity = '0';
      }
      return;
    }

    if (currentTool === 'eraser') {
      isErasingRef.current = false;
      return;
    }

    const active = activeStrokeRef.current;
    if (!active) return;
    activeStrokeRef.current = null;

    if (
      (active.tool === 'arrow' || active.tool === 'rect') &&
      (active.points.length < 2 ||
        Math.hypot(
          (active.points[1].x - active.points[0].x) * sizeRef.current.width,
          (active.points[1].y - active.points[0].y) * sizeRef.current.height
        ) < 6)
    ) {
      renderDrawCanvas();
      return;
    }

    onCommitStroke(active);
    renderDrawCanvas();
  };

  const isInteractive = tool !== 'pointer';
  const cursorClass =
    tool === 'laser' || tool === 'eraser'
      ? 'cursor-none'
      : tool === 'pointer'
      ? ''
      : 'cursor-crosshair';

  return (
    <div
      ref={containerRef}
      onPointerEnter={refreshRect}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onPointerLeave={handlePointerLeave}
      className={`absolute inset-0 z-10 touch-none overflow-hidden ${
        isInteractive ? 'pointer-events-auto' : 'pointer-events-none'
      } ${cursorClass}`}
      aria-hidden="true"
    >
      {/* Persistent Drawing Canvas */}
      <canvas ref={drawCanvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Smooth Fading Laser Trail Canvas */}
      <canvas
        ref={laserCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Glowing Laser Pointer Dot */}
      <div
        ref={laserDotRef}
        className="absolute top-0 left-0 rounded-full pointer-events-none will-change-transform"
        style={{
          opacity: 0,
          width: '18px',
          height: '18px',
          marginLeft: '-9px',
          marginTop: '-9px',
          background: `radial-gradient(circle, #ffffff 0%, #ffffff 32%, ${laserColor} 58%, transparent 100%)`,
          boxShadow: `0 0 14px 4px ${laserColor}, 0 0 28px 8px ${laserColor}66`,
        }}
      />

      {/* Stroke Eraser Cursor Ring */}
      <div
        ref={eraserCursorRef}
        className="absolute top-0 left-0 rounded-full pointer-events-none border-2 border-white bg-slate-900/30 will-change-transform"
        style={{
          opacity: 0,
          width: '24px',
          height: '24px',
          marginLeft: '-12px',
          marginTop: '-12px',
          boxShadow: '0 0 0 1.5px rgba(15, 23, 42, 0.85)',
        }}
      />
    </div>
  );
};

export const PresentationAnnotationLayer = React.memo(PresentationAnnotationLayerImpl);
