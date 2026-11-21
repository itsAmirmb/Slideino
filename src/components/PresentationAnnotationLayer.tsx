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

export const ANNOTATION_SIZES = [
  { id: 'sm', label: 'Fine', value: 3 },
  { id: 'md', label: 'Medium', value: 5.5 },
  { id: 'lg', label: 'Bold', value: 9 },
] as const;

interface LaserTrailPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  t: number; // performance.now()
}

interface PresentationAnnotationLayerProps {
  tool: AnnotationTool;
  color: string;
  strokeSize: number;
  annotations: AnnotationStroke[];
  onCommitStroke: (stroke: AnnotationStroke) => void;
  onEraseStrokeIds: (ids: string[]) => void;
  onUserActivity?: () => void;
}

const LASER_TRAIL_MS = 480;

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
  const extra = Math.max(radiusPx, stroke.size * scale * (stroke.tool === 'highlighter' ? 2.2 : 1.1));
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

      // Shorten shaft slightly so it stops cleanly inside the arrowhead base
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

export const PresentationAnnotationLayer: React.FC<PresentationAnnotationLayerProps> = ({
  tool,
  color,
  strokeSize,
  annotations,
  onCommitStroke,
  onEraseStrokeIds,
  onUserActivity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const activeStrokeRef = useRef<AnnotationStroke | null>(null);
  const isErasingRef = useRef(false);
  const eraserPosRef = useRef<{ x: number; y: number } | null>(null);

  // Laser pointer live state
  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserCurrentRef = useRef<NormalizedPoint | null>(null);
  const laserPressedRef = useRef(false);
  const laserRafRef = useRef<number | null>(null);
  const laserColorRef = useRef(color);
  laserColorRef.current = color;

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

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

    // Draw clean eraser indicator ring when eraser is active and hovering
    if (tool === 'eraser' && eraserPosRef.current) {
      const ep = eraserPosRef.current;
      const r = Math.max(11, 14 * (width / 1280));
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, r + 1.5, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.stroke();
    }

    ctx.restore();
  }, [tool]);

  const stopLaserLoop = useCallback(() => {
    if (laserRafRef.current !== null) {
      cancelAnimationFrame(laserRafRef.current);
      laserRafRef.current = null;
    }
  }, []);

  const renderLaserFrame = useCallback(() => {
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
    if (width <= 0 || height <= 0) {
      laserRafRef.current = null;
      return;
    }

    const now = performance.now();
    const trail = laserTrailRef.current.filter((p) => now - p.t < LASER_TRAIL_MS);
    laserTrailRef.current = trail;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const laserHex =
      laserColorRef.current === '#0f172a' || laserColorRef.current === '#ffffff'
        ? '#ef4444'
        : laserColorRef.current;
    const scale = Math.max(0.6, width / 1280);

    // Draw smooth fading comet tail
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const ageRatio = 1 - (now - p1.t) / LASER_TRAIL_MS;
        if (ageRatio <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(p0.x * width, p0.y * height);
        ctx.lineTo(p1.x * width, p1.y * height);
        ctx.strokeStyle = laserHex;
        ctx.globalAlpha = Math.pow(ageRatio, 1.6) * 0.55;
        ctx.lineWidth = Math.max(2, 9 * scale * ageRatio);
        ctx.stroke();
      }
    }

    // Draw crisp glowing laser dot at current cursor position
    const cur = laserCurrentRef.current;
    if (cur && tool === 'laser') {
      const cx = cur.x * width;
      const cy = cur.y * height;
      const haloRadius = (laserPressedRef.current ? 24 : 18) * scale;
      const coreRadius = (laserPressedRef.current ? 6 : 4.5) * scale;

      const grad = ctx.createRadialGradient(cx, cy, coreRadius * 0.4, cx, cy, haloRadius);
      grad.addColorStop(0, laserHex);
      grad.addColorStop(0.45, `${laserHex}99`);
      grad.addColorStop(1, `${laserHex}00`);

      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Bright incandescent white center core
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius + 1.5 * scale, 0, Math.PI * 2);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = laserHex;
      ctx.stroke();
    }

    ctx.restore();

    if (trail.length > 0 || (cur && tool === 'laser')) {
      laserRafRef.current = requestAnimationFrame(renderLaserFrame);
    } else {
      laserRafRef.current = null;
    }
  }, [tool]);

  const ensureLaserLoop = useCallback(() => {
    if (laserRafRef.current === null) {
      laserRafRef.current = requestAnimationFrame(renderLaserFrame);
    }
  }, [renderLaserFrame]);

  // Keep canvases matched to container physical pixels (HiDPI crispness)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncCanvasSize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width, height, dpr };
      for (const canvas of [drawCanvasRef.current, laserCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
      }
      renderDrawCanvas();
      if (laserTrailRef.current.length > 0 || laserCurrentRef.current) {
        ensureLaserLoop();
      }
    };

    const rect = el.getBoundingClientRect();
    syncCanvasSize(rect.width, rect.height);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncCanvasSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderDrawCanvas, ensureLaserLoop]);

  // Re-render whenever annotations or tool change
  useEffect(() => {
    renderDrawCanvas();
  }, [annotations, tool, renderDrawCanvas]);

  // Clear laser dot/loop cleanly when leaving laser mode
  useEffect(() => {
    if (tool !== 'laser') {
      laserCurrentRef.current = null;
      laserPressedRef.current = false;
      laserTrailRef.current = [];
      stopLaserLoop();
      const canvas = laserCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (tool !== 'eraser') {
      eraserPosRef.current = null;
      isErasingRef.current = false;
      renderDrawCanvas();
    }
  }, [tool, stopLaserLoop, renderDrawCanvas]);

  useEffect(() => {
    return () => stopLaserLoop();
  }, [stopLaserLoop]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLDivElement>): {
    norm: NormalizedPoint;
    px: number;
    py: number;
  } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return {
      px,
      py,
      norm: {
        x: Math.max(0, Math.min(1, px / rect.width)),
        y: Math.max(0, Math.min(1, py / rect.height)),
      },
    };
  };

  const eraseAtPoint = (px: number, py: number) => {
    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;
    const radiusPx = Math.max(12, 16 * (width / 1280));
    const hitIds: string[] = [];
    for (const s of annotationsRef.current) {
      if (hitTestStroke(s, px, py, width, height, radiusPx)) {
        hitIds.push(s.id);
      }
    }
    if (hitIds.length > 0) {
      onEraseStrokeIds(hitIds);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'pointer') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    const pos = getNormalizedPoint(e);
    if (!pos) return;
    onUserActivity?.();

    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (tool === 'laser') {
      laserPressedRef.current = true;
      laserCurrentRef.current = pos.norm;
      laserTrailRef.current.push({ x: pos.norm.x, y: pos.norm.y, t: performance.now() });
      ensureLaserLoop();
      return;
    }

    if (tool === 'eraser') {
      isErasingRef.current = true;
      eraserPosRef.current = { x: pos.px, y: pos.py };
      eraseAtPoint(pos.px, pos.py);
      renderDrawCanvas();
      return;
    }

    activeStrokeRef.current = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool,
      color,
      size: strokeSize,
      points: [pos.norm],
    };
    renderDrawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'pointer') return;
    const pos = getNormalizedPoint(e);
    if (!pos) return;

    if (tool === 'laser') {
      laserCurrentRef.current = pos.norm;
      const trail = laserTrailRef.current;
      const last = trail[trail.length - 1];
      const now = performance.now();
      if (
        !last ||
        Math.hypot(pos.norm.x - last.x, pos.norm.y - last.y) > 0.002 ||
        now - last.t > 16
      ) {
        trail.push({ x: pos.norm.x, y: pos.norm.y, t: now });
      }
      ensureLaserLoop();
      return;
    }

    if (tool === 'eraser') {
      eraserPosRef.current = { x: pos.px, y: pos.py };
      if (isErasingRef.current) {
        eraseAtPoint(pos.px, pos.py);
      }
      renderDrawCanvas();
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

    if (tool === 'laser') {
      laserPressedRef.current = false;
      return;
    }

    if (tool === 'eraser') {
      isErasingRef.current = false;
      return;
    }

    const active = activeStrokeRef.current;
    if (!active) return;
    activeStrokeRef.current = null;

    // Ignore accidental zero-size shape clicks
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
    if (tool === 'laser') {
      laserCurrentRef.current = null;
      laserPressedRef.current = false;
    }
    if (tool === 'eraser') {
      eraserPosRef.current = null;
      isErasingRef.current = false;
      renderDrawCanvas();
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
      <canvas ref={laserCanvasRef} className="absolute inset-0 w-full h-full block pointer-events-none" />
    </div>
  );
};
