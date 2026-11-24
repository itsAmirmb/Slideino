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

export type LaserMovePhase = 'hover' | 'start' | 'draw' | 'end' | 'hide';

export interface LaserMoveEvent {
  active: boolean;
  x: number;
  y: number;
  color: string;
  phase: LaserMovePhase;
}

interface LaserStroke {
  points: NormalizedPoint[];
  color: string;
  releasedAt: number | null; // null while pointer is held down (stays 100% solid)
}

export interface RemoteLaserHandle {
  handleEvent: (event: LaserMoveEvent) => void;
  hide: () => void;
}

interface PresentationAnnotationLayerProps {
  slideId?: string;
  tool: AnnotationTool;
  color: string;
  laserColor: string;
  strokeSize: number;
  annotations: AnnotationStroke[];
  onCommitStroke: (stroke: AnnotationStroke) => void;
  onEraseStrokeIds: (ids: string[]) => void;
  onLaserMove?: (event: LaserMoveEvent) => void;
  remoteLaserRef?: React.MutableRefObject<RemoteLaserHandle | null>;
}

// PowerPoint-style laser ink timing: stays 100% solid while held, pauses briefly on release, then fades smoothly
const LASER_HOLD_AFTER_RELEASE_MS = 750;
const LASER_FADE_DURATION_MS = 550;
const LASER_MAX_POINTS_PER_STROKE = 900;

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
  slideId,
  tool,
  color,
  laserColor,
  strokeSize,
  annotations,
  onCommitStroke,
  onEraseStrokeIds,
  onLaserMove,
  remoteLaserRef,
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
  const activeLaserColorRef = useRef<string>(laserColor);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const onLaserMoveRef = useRef(onLaserMove);
  onLaserMoveRef.current = onLaserMove;
  const lastEmitLaserTsRef = useRef(0);

  const laserStrokesRef = useRef<LaserStroke[]>([]);
  const activeLaserStrokeRef = useRef<LaserStroke | null>(null);
  const remoteActiveLaserStrokeRef = useRef<LaserStroke | null>(null);
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
    laserStrokesRef.current = [];
    activeLaserStrokeRef.current = null;
    remoteActiveLaserStrokeRef.current = null;
    const canvas = laserCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const drawLaserStrokePath = (
    ctx: CanvasRenderingContext2D,
    pts: NormalizedPoint[],
    width: number,
    height: number
  ) => {
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      ctx.lineTo(pts[0].x * width + 0.1, pts[0].y * height + 0.1);
      return;
    }
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
  };

  const renderLaserCanvas = useCallback(() => {
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
    const strokes = laserStrokesRef.current;
    const scale = Math.max(0.65, width / 1280);
    let hasFadingStroke = false;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      let alpha = 1;
      if (s.releasedAt !== null) {
        const elapsed = now - s.releasedAt;
        if (elapsed >= LASER_HOLD_AFTER_RELEASE_MS + LASER_FADE_DURATION_MS) {
          strokes.splice(i, 1);
          continue;
        }
        hasFadingStroke = true;
        if (elapsed > LASER_HOLD_AFTER_RELEASE_MS) {
          const t = (elapsed - LASER_HOLD_AFTER_RELEASE_MS) / LASER_FADE_DURATION_MS;
          const eased = 1 - t;
          alpha = eased * eased;
        }
      }

      if (s.points.length === 0 || alpha <= 0.005) continue;

      // 1. Soft outer neon halo
      drawLaserStrokePath(ctx, s.points, width, height);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha * 0.28;
      ctx.lineWidth = Math.max(8, 15 * scale);
      ctx.stroke();

      // 2. Crisp vivid laser body
      drawLaserStrokePath(ctx, s.points, width, height);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha * 0.92;
      ctx.lineWidth = Math.max(3.5, 6 * scale);
      ctx.stroke();

      // 3. Bright luminous core (classic PowerPoint / keynote laser look)
      drawLaserStrokePath(ctx, s.points, width, height);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = Math.max(1.4, 2.2 * scale);
      ctx.stroke();
    }

    ctx.restore();

    // Only keep rAF spinning while at least one released stroke is waiting/fading (0% idle CPU while held still)
    if (hasFadingStroke) {
      laserRafRef.current = requestAnimationFrame(renderLaserCanvas);
    } else {
      laserRafRef.current = null;
    }
  }, []);

  const ensureLaserLoop = useCallback(() => {
    if (laserRafRef.current === null) {
      laserRafRef.current = requestAnimationFrame(renderLaserCanvas);
    }
  }, [renderLaserCanvas]);

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
      renderLaserCanvas();
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
  }, [renderDrawCanvas, renderLaserCanvas, refreshRect]);

  useEffect(() => {
    renderDrawCanvas();
  }, [annotations, renderDrawCanvas]);

  // Clear ephemeral laser ink cleanly whenever the active slide changes
  useEffect(() => {
    clearLaserCanvas();
  }, [slideId, clearLaserCanvas]);

  useEffect(() => {
    activeLaserColorRef.current = laserColor;
    if (laserDotRef.current) {
      laserDotRef.current.style.background = `radial-gradient(circle, #ffffff 0%, #ffffff 32%, ${laserColor} 58%, transparent 100%)`;
      laserDotRef.current.style.boxShadow = `0 0 14px 4px ${laserColor}, 0 0 28px 8px ${laserColor}66`;
    }
  }, [laserColor]);

  useEffect(() => {
    if (tool !== 'laser') {
      clearLaserCanvas();
      if (laserDotRef.current) laserDotRef.current.style.opacity = '0';
      onLaserMoveRef.current?.({
        active: false,
        x: 0,
        y: 0,
        color: laserColorRef.current,
        phase: 'hide',
      });
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

  const appendPointToLaserStroke = useCallback(
    (stroke: LaserStroke, norm: NormalizedPoint) => {
      const { width, height } = sizeRef.current;
      const last = stroke.points[stroke.points.length - 1];
      if (!last) {
        stroke.points.push(norm);
        return true;
      }
      const dx = (norm.x - last.x) * (width || 1280);
      const dy = (norm.y - last.y) * (height || 720);
      if (Math.hypot(dx, dy) >= 2) {
        if (stroke.points.length < LASER_MAX_POINTS_PER_STROKE) {
          stroke.points.push(norm);
        }
        return true;
      }
      return false;
    },
    []
  );

  const updateLaserDot = useCallback(
    (px: number, py: number, visible: boolean, overrideColor?: string, pressed = false) => {
      const dot = laserDotRef.current;
      if (!dot) return;
      if (!visible) {
        dot.style.opacity = '0';
        return;
      }
      if (overrideColor && overrideColor !== activeLaserColorRef.current) {
        activeLaserColorRef.current = overrideColor;
        dot.style.background = `radial-gradient(circle, #ffffff 0%, #ffffff 32%, ${overrideColor} 58%, transparent 100%)`;
        dot.style.boxShadow = `0 0 14px 4px ${overrideColor}, 0 0 28px 8px ${overrideColor}66`;
      }
      dot.style.opacity = '1';
      dot.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${pressed ? 1.18 : 1})`;
    },
    []
  );

  // Expose zero-rerender imperative API so Audience Window mirrors exact click-hold-fade laser ink at 60fps
  useEffect(() => {
    if (!remoteLaserRef) return;
    remoteLaserRef.current = {
      handleEvent: (event: LaserMoveEvent) => {
        const { width, height } = sizeRef.current;
        if (!event.active || event.phase === 'hide' || width <= 0 || height <= 0) {
          updateLaserDot(0, 0, false);
          if (remoteActiveLaserStrokeRef.current) {
            remoteActiveLaserStrokeRef.current.releasedAt = performance.now();
            remoteActiveLaserStrokeRef.current = null;
            ensureLaserLoop();
          }
          return;
        }

        const norm = {
          x: Math.max(0, Math.min(1, event.x)),
          y: Math.max(0, Math.min(1, event.y)),
        };
        const px = norm.x * width;
        const py = norm.y * height;
        const isPressed = event.phase === 'start' || event.phase === 'draw';
        updateLaserDot(px, py, true, event.color, isPressed);

        if (event.phase === 'start') {
          if (remoteActiveLaserStrokeRef.current) {
            remoteActiveLaserStrokeRef.current.releasedAt = performance.now();
          }
          const nextStroke: LaserStroke = {
            points: [norm],
            color: event.color || laserColorRef.current,
            releasedAt: null,
          };
          remoteActiveLaserStrokeRef.current = nextStroke;
          laserStrokesRef.current.push(nextStroke);
          renderLaserCanvas();
        } else if (event.phase === 'draw') {
          let stroke = remoteActiveLaserStrokeRef.current;
          if (!stroke) {
            stroke = {
              points: [norm],
              color: event.color || laserColorRef.current,
              releasedAt: null,
            };
            remoteActiveLaserStrokeRef.current = stroke;
            laserStrokesRef.current.push(stroke);
            renderLaserCanvas();
          } else if (appendPointToLaserStroke(stroke, norm)) {
            renderLaserCanvas();
          }
        } else if (event.phase === 'end') {
          if (remoteActiveLaserStrokeRef.current) {
            appendPointToLaserStroke(remoteActiveLaserStrokeRef.current, norm);
            remoteActiveLaserStrokeRef.current.releasedAt = performance.now();
            remoteActiveLaserStrokeRef.current = null;
            renderLaserCanvas();
            ensureLaserLoop();
          }
        }
      },
      hide: () => {
        updateLaserDot(0, 0, false);
        if (remoteActiveLaserStrokeRef.current) {
          remoteActiveLaserStrokeRef.current.releasedAt = performance.now();
          remoteActiveLaserStrokeRef.current = null;
          ensureLaserLoop();
        }
      },
    };
    return () => {
      remoteLaserRef.current = null;
    };
  }, [
    remoteLaserRef,
    appendPointToLaserStroke,
    updateLaserDot,
    renderLaserCanvas,
    ensureLaserLoop,
  ]);

  const emitLaserMove = (
    normX: number,
    normY: number,
    active: boolean,
    phase: LaserMovePhase
  ) => {
    const cb = onLaserMoveRef.current;
    if (!cb) return;
    const isLifecycleEdge = phase === 'start' || phase === 'end' || phase === 'hide' || !active;
    const now = performance.now();
    if (!isLifecycleEdge && now - lastEmitLaserTsRef.current < 16) return;
    lastEmitLaserTsRef.current = now;
    cb({ active, x: normX, y: normY, color: laserColorRef.current, phase });
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
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const nextLaserStroke: LaserStroke = {
        points: [pos.norm],
        color: laserColorRef.current,
        releasedAt: null,
      };
      activeLaserStrokeRef.current = nextLaserStroke;
      laserStrokesRef.current.push(nextLaserStroke);
      updateLaserDot(pos.px, pos.py, true, laserColorRef.current, true);
      renderLaserCanvas();
      emitLaserMove(pos.norm.x, pos.norm.y, true, 'start');
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
      const activeLaser = activeLaserStrokeRef.current;
      const nativeEvent = e.nativeEvent as PointerEvent;
      const coalesced =
        activeLaser && typeof nativeEvent.getCoalescedEvents === 'function'
          ? nativeEvent.getCoalescedEvents()
          : null;

      if (activeLaser && coalesced && coalesced.length > 0) {
        let lastPos: { px: number; py: number; norm: NormalizedPoint } | null = null;
        let mutated = false;
        for (let i = 0; i < coalesced.length; i++) {
          const p = toLocalPoint(coalesced[i].clientX, coalesced[i].clientY);
          if (p) {
            if (appendPointToLaserStroke(activeLaser, p.norm)) mutated = true;
            lastPos = p;
          }
        }
        if (lastPos) {
          updateLaserDot(lastPos.px, lastPos.py, true, laserColorRef.current, true);
          if (mutated) renderLaserCanvas();
          emitLaserMove(lastPos.norm.x, lastPos.norm.y, true, 'draw');
        }
      } else {
        const pos = toLocalPoint(e.clientX, e.clientY);
        if (pos) {
          if (activeLaser) {
            updateLaserDot(pos.px, pos.py, true, laserColorRef.current, true);
            if (appendPointToLaserStroke(activeLaser, pos.norm)) {
              renderLaserCanvas();
            }
            emitLaserMove(pos.norm.x, pos.norm.y, true, 'draw');
          } else {
            updateLaserDot(pos.px, pos.py, true, laserColorRef.current, false);
            emitLaserMove(pos.norm.x, pos.norm.y, true, 'hover');
          }
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
    // While actively holding & drawing with pointer capture, ignore transient edge leave events
    if (activeLaserStrokeRef.current) return;
    if (laserDotRef.current) laserDotRef.current.style.opacity = '0';
    if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = '0';
    if (toolRef.current === 'laser') {
      emitLaserMove(0, 0, false, 'hide');
    }
  };

  const finishInteraction = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const currentTool = toolRef.current;
    if (currentTool === 'laser') {
      const activeLaser = activeLaserStrokeRef.current;
      const pos = e ? toLocalPoint(e.clientX, e.clientY) : null;
      if (activeLaser) {
        if (pos) {
          appendPointToLaserStroke(activeLaser, pos.norm);
        }
        activeLaser.releasedAt = performance.now();
        activeLaserStrokeRef.current = null;
        renderLaserCanvas();
        ensureLaserLoop();
      }
      if (e && e.pointerType !== 'mouse') {
        if (laserDotRef.current) laserDotRef.current.style.opacity = '0';
        if (pos) emitLaserMove(pos.norm.x, pos.norm.y, true, 'end');
        emitLaserMove(0, 0, false, 'hide');
      } else if (pos) {
        updateLaserDot(pos.px, pos.py, true, laserColorRef.current, false);
        emitLaserMove(pos.norm.x, pos.norm.y, true, 'end');
      } else if (activeLaser) {
        const lastPt = activeLaser.points[activeLaser.points.length - 1] || { x: 0, y: 0 };
        emitLaserMove(lastPt.x, lastPt.y, true, 'end');
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
