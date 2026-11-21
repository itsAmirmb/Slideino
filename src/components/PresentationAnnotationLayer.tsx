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
  x: number; // pixel x relative to canvas
  y: number; // pixel y relative to canvas
  t: number; // performance.now()
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

const LASER_TRAIL_MS = 380;

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
  const eraserRingRef = useRef<HTMLDivElement>(null);

  // Cached bounding rect & canvas dimensions — avoids forced synchronous reflow in pointermove
  const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const activeStrokeRef = useRef<AnnotationStroke | null>(null);
  const isErasingRef = useRef(false);

  // Live refs so high-frequency pointer/RAF loops never trigger React re-renders
  const toolRef = useRef<AnnotationTool>(tool);
  toolRef.current = tool;
  const laserColorRef = useRef(laserColor);
  laserColorRef.current = laserColor;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  // Laser trail state (drawn on dedicated lightweight canvas while GPU DOM dot tracks at 0ms latency)
  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserRafRef = useRef<number | null>(null);
  const laserCtxRef = useRef<CanvasRenderingContext2D | null>(null);

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

  const stopLaserLoop = useCallback(() => {
    if (laserRafRef.current !== null) {
      cancelAnimationFrame(laserRafRef.current);
      laserRafRef.current = null;
    }
  }, []);

  const renderLaserTrailFrame = useCallback(() => {
    const canvas = laserCanvasRef.current;
    if (!canvas) {
      laserRafRef.current = null;
      return;
    }
    if (!laserCtxRef.current) {
      laserCtxRef.current =
        canvas.getContext('2d', { desynchronized: true }) || canvas.getContext('2d');
    }
    const ctx = laserCtxRef.current;
    if (!ctx) {
      laserRafRef.current = null;
      return;
    }

    const { width, height, dpr } = sizeRef.current;
    if (width <= 0 || height <= 0) {
      laserRafRef.current = null;
      return;
    }

    const now = performance.now();
    const trail = laserTrailRef.current;
    let firstValid = 0;
    while (firstValid < trail.length && now - trail[firstValid].t >= LASER_TRAIL_MS) {
      firstValid++;
    }
    if (firstValid > 0) {
      trail.splice(0, firstValid);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (trail.length > 1) {
      const hex = laserColorRef.current || '#ef4444';
      const scale = Math.max(0.65, width / 1280);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hex;

      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const ageRatio = 1 - (now - p1.t) / LASER_TRAIL_MS;
        if (ageRatio <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.globalAlpha = ageRatio * ageRatio * 0.55;
        ctx.lineWidth = Math.max(1.5, 8.5 * scale * ageRatio);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (trail.length > 1) {
      laserRafRef.current = requestAnimationFrame(renderLaserTrailFrame);
    } else {
      laserRafRef.current = null;
    }
  }, []);

  const ensureLaserLoop = useCallback(() => {
    if (laserRafRef.current === null) {
      laserRafRef.current = requestAnimationFrame(renderLaserTrailFrame);
    }
  }, [renderLaserTrailFrame]);

  const hideLaserDot = useCallback(() => {
    if (laserDotRef.current) {
      laserDotRef.current.style.opacity = '0';
    }
  }, []);

  const hideEraserRing = useCallback(() => {
    if (eraserRingRef.current) {
      eraserRingRef.current.style.opacity = '0';
    }
  }, []);

  // Keep canvases matched to container physical pixels & keep cached rect accurate
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncCanvasSize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width, height, dpr };
      refreshRect();
      for (const canvas of [drawCanvasRef.current, laserCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
      }
      renderDrawCanvas();
    };

    const rect = el.getBoundingClientRect();
    syncCanvasSize(rect.width, rect.height);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncCanvasSize(entry.contentRect.width, entry.contentRect.height);
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

  // Re-render drawing canvas only when saved annotations change
  useEffect(() => {
    renderDrawCanvas();
  }, [annotations, renderDrawCanvas]);

  // Clean up laser/eraser indicators when switching tools
  useEffect(() => {
    if (tool !== 'laser') {
      laserTrailRef.current = [];
      stopLaserLoop();
      hideLaserDot();
      const canvas = laserCanvasRef.current;
      if (canvas) {
        const ctx = laserCtxRef.current || canvas.getContext('2d');
        ctx?.setTransform(1, 0, 0, 1, 0, 0);
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (tool !== 'eraser') {
      isErasingRef.current = false;
      hideEraserRing();
    }
  }, [tool, stopLaserLoop, hideLaserDot, hideEraserRing]);

  useEffect(() => {
    return () => stopLaserLoop();
  }, [stopLaserLoop]);

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

  const moveLaserDotDirect = (px: number, py: number, pressed: boolean) => {
    const dot = laserDotRef.current;
    if (!dot) return;
    dot.style.opacity = '1';
    dot.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${pressed ? 1.25 : 1})`;
  };

  const moveEraserRingDirect = (px: number, py: number) => {
    const ring = eraserRingRef.current;
    if (!ring) return;
    ring.style.opacity = '1';
    ring.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  };

  const handlePointerEnter = () => {
    refreshRect();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const currentTool = toolRef.current;
    if (currentTool === 'pointer') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    refreshRect();
    const pos = toLocalPoint(e.clientX, e.clientY);
    if (!pos) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (currentTool === 'laser') {
      moveLaserDotDirect(pos.px, pos.py, true);
      laserTrailRef.current.push({ x: pos.px, y: pos.py, t: performance.now() });
      ensureLaserLoop();
      return;
    }

    if (currentTool === 'eraser') {
      isErasingRef.current = true;
      moveEraserRingDirect(pos.px, pos.py);
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
      const coalesced = e.nativeEvent.getCoalescedEvents?.();
      const events = coalesced && coalesced.length > 0 ? coalesced : [e.nativeEvent];
      const now = performance.now();
      const trail = laserTrailRef.current;
      let latestPos: ReturnType<typeof toLocalPoint> = null;

      for (let i = 0; i < events.length; i++) {
        const pt = toLocalPoint(events[i].clientX, events[i].clientY);
        if (!pt) continue;
        latestPos = pt;
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(pt.px - last.x, pt.py - last.y) >= 2) {
          trail.push({ x: pt.px, y: pt.py, t: now });
        }
      }

      if (trail.length > 72) {
        trail.splice(0, trail.length - 72);
      }

      if (latestPos) {
        moveLaserDotDirect(latestPos.px, latestPos.py, (e.buttons & 1) === 1);
        ensureLaserLoop();
      }
      return;
    }

    const pos = toLocalPoint(e.clientX, e.clientY);
    if (!pos) return;

    if (currentTool === 'eraser') {
      moveEraserRingDirect(pos.px, pos.py);
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

  const finishInteraction = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const currentTool = toolRef.current;
    if (currentTool === 'laser') {
      if (e) {
        const pos = toLocalPoint(e.clientX, e.clientY);
        if (pos) moveLaserDotDirect(pos.px, pos.py, false);
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

  const handlePointerLeave = () => {
    if (toolRef.current === 'laser') {
      hideLaserDot();
    }
    if (toolRef.current === 'eraser') {
      isErasingRef.current = false;
      hideEraserRing();
    }
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
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onPointerLeave={handlePointerLeave}
      className={`absolute inset-0 z-10 touch-none ${
        isInteractive ? `pointer-events-auto ${cursorClass}` : 'pointer-events-none'
      }`}
      aria-hidden="true"
    >
      <canvas ref={drawCanvasRef} className="absolute inset-0 w-full h-full block" />
      <canvas
        ref={laserCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Hardware-composited zero-latency Laser Dot */}
      <div
        ref={laserDotRef}
        className="absolute top-0 left-0 pointer-events-none will-change-transform"
        style={{
          opacity: 0,
          width: '28px',
          height: '28px',
          marginLeft: '-14px',
          marginTop: '-14px',
          borderRadius: '9999px',
          background: `radial-gradient(circle, #ffffff 0%, #ffffff 22%, ${laserColor} 40%, ${laserColor}55 68%, transparent 100%)`,
          boxShadow: `0 0 14px ${laserColor}`,
        }}
      />

      {/* Hardware-composited Eraser Cursor Ring */}
      <div
        ref={eraserRingRef}
        className="absolute top-0 left-0 pointer-events-none will-change-transform rounded-full border-2 border-white/90 bg-white/15 shadow-[0_0_0_1px_rgba(15,23,42,0.75)]"
        style={{
          opacity: 0,
          width: '26px',
          height: '26px',
          marginLeft: '-13px',
          marginTop: '-13px',
        }}
      />
    </div>
  );
};

export const PresentationAnnotationLayer = React.memo(PresentationAnnotationLayerImpl);
