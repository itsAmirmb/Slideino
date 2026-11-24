import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Grid,
  HelpCircle,
  Highlighter,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorOff,
  NotebookPen,
  Pause,
  Pen,
  Play,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Deck, SlideTheme } from '../types/slideino';
import { SlideFrame } from './SlideFrame';
import {
  ANNOTATION_COLORS,
  ANNOTATION_SIZES,
  AnnotationStroke,
  AnnotationTool,
  LASER_COLORS,
  LaserMoveEvent,
  PresentationAnnotationLayer,
  RemoteLaserHandle,
} from './PresentationAnnotationLayer';
import {
  buildAudienceWindowUrl,
  createPresentationSyncBridge,
  PresentationSyncBridge,
  SyncWindowRole,
} from '../utils/presentationSync';

interface PresentationModeProps {
  deck: Deck;
  theme: SlideTheme;
  initialSlideIndex: number;
  viewRole?: SyncWindowRole;
  syncSessionId?: string;
  onExit: (lastIndex: number) => void;
  onExportPresentation?: () => void;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Isolated timer component so the 1-second tick never re-renders the main PresentationMode stage,
 * SlideFrame, or high-frequency Laser/Drawing canvas.
 */
const PresenterTimer: React.FC = React.memo(() => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  return (
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <span className="font-mono text-2xl font-semibold tabular-nums text-white">
          {formatTimer(elapsedSeconds)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTimerRunning((v) => !v)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          aria-label={timerRunning ? 'Pause timer' : 'Resume timer'}
        >
          {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setElapsedSeconds(0)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
PresenterTimer.displayName = 'PresenterTimer';

export const PresentationMode: React.FC<PresentationModeProps> = ({
  deck,
  theme,
  initialSlideIndex,
  viewRole = 'presenter',
  syncSessionId,
  onExit,
  onExportPresentation,
}) => {
  const isAudienceMode = viewRole === 'audience';
  const effectiveSyncId = syncSessionId || `deck-${deck.id}`;

  const activeSlides = deck.slides.filter((s) => !s.hidden);
  const slides = activeSlides.length > 0 ? activeSlides : deck.slides;

  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(Math.max(0, initialSlideIndex), slides.length - 1)
  );
  const [presenterView, setPresenterView] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [toolOptionsHidden, setToolOptionsHidden] = useState(false);
  const [noteFontSize, setNoteFontSize] = useState(16);
  const [syncedAudienceCount, setSyncedAudienceCount] = useState(0);
  const [syncedPresenterCount, setSyncedPresenterCount] = useState(0);
  const [copiedAudienceLink, setCopiedAudienceLink] = useState(false);
  const [showAudienceBanner, setShowAudienceBanner] = useState(isAudienceMode);
  const [presentationEnded, setPresentationEnded] = useState(false);
  const [closeTabHint, setCloseTabHint] = useState(false);

  // Annotation & laser pointer state (stored per slide so navigating preserves drawings)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pointer');
  const [lastDrawTool, setLastDrawTool] = useState<Exclude<AnnotationTool, 'pointer' | 'laser'>>('pen');
  const [strokeColor, setStrokeColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [laserColor, setLaserColor] = useState<string>(LASER_COLORS[0].value);
  const [strokeSize, setStrokeSize] = useState<number>(ANNOTATION_SIZES[1].value);
  const [annotationsBySlide, setAnnotationsBySlide] = useState<Record<string, AnnotationStroke[]>>({});
  const [undoHistoryBySlide, setUndoHistoryBySlide] = useState<Record<string, AnnotationStroke[][]>>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const dockHoveredRef = useRef(false);
  const controlsVisibleRef = useRef(true);
  const toolbarHiddenRef = useRef(false);
  toolbarHiddenRef.current = toolbarHidden;
  const lastBumpRef = useRef(0);
  const activeToolRef = useRef<AnnotationTool>('pointer');
  activeToolRef.current = activeTool;
  const touchStartXRef = useRef<number | null>(null);

  // Dual-window sync refs
  const syncBridgeRef = useRef<PresentationSyncBridge | null>(null);
  const remoteLaserRef = useRef<RemoteLaserHandle | null>(null);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const blackoutRef = useRef(blackout);
  blackoutRef.current = blackout;
  const currentSlide = slides[currentIndex] || slides[0];
  const currentSlideIdRef = useRef(currentSlide.id);
  currentSlideIdRef.current = currentSlide.id;
  const nextSlide = slides[currentIndex + 1] || null;
  const currentAnnotations = useMemo(
    () => annotationsBySlide[currentSlide.id] || [],
    [annotationsBySlide, currentSlide.id]
  );
  const canUndoAnnotation = (undoHistoryBySlide[currentSlide.id]?.length || 0) > 0;

  const audienceUrl = useMemo(
    () => buildAudienceWindowUrl(deck.id, effectiveSyncId, currentIndex),
    [deck.id, effectiveSyncId, currentIndex]
  );

  // Auto-hide the brief Audience setup banner after 4.5s so listeners never see it
  useEffect(() => {
    if (!isAudienceMode || !showAudienceBanner) return;
    const id = window.setTimeout(() => setShowAudienceBanner(false), 4500);
    return () => window.clearTimeout(id);
  }, [isAudienceMode, showAudienceBanner]);

  const broadcastState = useCallback(
    (nextIndex: number, nextBlackout: boolean, nextAnnotations?: Record<string, AnnotationStroke[]>) => {
      syncBridgeRef.current?.send({
        type: 'state',
        state: {
          slideIndex: nextIndex,
          blackout: nextBlackout,
          ...(nextAnnotations ? { annotationsBySlide: nextAnnotations } : {}),
        },
      });
    },
    []
  );

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, index));
      setCurrentIndex(clamped);
      setBlackout(false);
      if (isAudienceMode) setShowAudienceBanner(false);
      broadcastState(clamped, false);
    },
    [slides.length, isAudienceMode, broadcastState]
  );

  const step = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(slides.length - 1, currentIndexRef.current + delta));
      setCurrentIndex(next);
      setBlackout(false);
      if (isAudienceMode) setShowAudienceBanner(false);
      broadcastState(next, false);
    },
    [slides.length, isAudienceMode, broadcastState]
  );

  const toggleBlackout = useCallback(
    (force?: boolean) => {
      const next = typeof force === 'boolean' ? force : !blackoutRef.current;
      setBlackout(next);
      broadcastState(currentIndexRef.current, next);
    },
    [broadcastState]
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (fs && isAudienceMode) setShowAudienceBanner(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [isAudienceMode]);

  const handleExitPresentation = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    if (!isAudienceMode) {
      syncBridgeRef.current?.close({ endPresentation: true });
      syncBridgeRef.current = null;
    }
    onExit(currentIndexRef.current);
  }, [isAudienceMode, onExit]);

  const bumpControls = useCallback((force = false) => {
    if (toolbarHiddenRef.current) return;
    const now = performance.now();
    if (!force && controlsVisibleRef.current && now - lastBumpRef.current < 300) {
      return;
    }
    lastBumpRef.current = now;
    if (!controlsVisibleRef.current) {
      controlsVisibleRef.current = true;
      setControlsVisible(true);
    }
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    const timeoutMs = activeToolRef.current !== 'pointer' ? 2200 : 3000;
    hideTimerRef.current = window.setTimeout(() => {
      if (!dockHoveredRef.current && !toolbarHiddenRef.current) {
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      }
    }, timeoutMs);
  }, []);

  const hideToolbar = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    dockHoveredRef.current = false;
    toolbarHiddenRef.current = true;
    controlsVisibleRef.current = false;
    setToolbarHidden(true);
    setControlsVisible(false);
  }, []);

  const showToolbar = useCallback(() => {
    toolbarHiddenRef.current = false;
    setToolbarHidden(false);
    bumpControls(true);
  }, [bumpControls]);

  const toggleToolbarHidden = useCallback(() => {
    if (toolbarHiddenRef.current) showToolbar();
    else hideToolbar();
  }, [hideToolbar, showToolbar]);

  const handleStageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Never auto-reveal while manually hidden or while actively drawing/pressing mouse button
      if (toolbarHiddenRef.current || (e.buttons & 1) !== 0) return;
      // While using Laser or Drawing tools, avoid popping up the dock on every slide pointer move;
      // bring it back smoothly whenever the cursor approaches the bottom dock area.
      if (activeToolRef.current !== 'pointer') {
        if (window.innerHeight - e.clientY <= 104) {
          bumpControls(false);
        }
        return;
      }
      bumpControls(false);
    },
    [bumpControls]
  );

  useEffect(() => {
    bumpControls(true);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [bumpControls]);

  const selectTool = useCallback(
    (next: AnnotationTool) => {
      setActiveTool(next);
      if (next !== 'pointer' && next !== 'laser') {
        setLastDrawTool(next);
      }
      if (!toolbarHiddenRef.current) {
        bumpControls(true);
      }
    },
    [bumpControls]
  );

  const annotationsBySlideRef = useRef(annotationsBySlide);
  annotationsBySlideRef.current = annotationsBySlide;
  const undoHistoryBySlideRef = useRef(undoHistoryBySlide);
  undoHistoryBySlideRef.current = undoHistoryBySlide;

  // Establish dual-window real-time sync channel (BroadcastChannel + localStorage fallback)
  useEffect(() => {
    const bridge = createPresentationSyncBridge({
      syncId: effectiveSyncId,
      role: viewRole,
      onPeersChange: (audCount, presCount) => {
        setSyncedAudienceCount(audCount);
        setSyncedPresenterCount(presCount);
      },
      onMessage: (msg) => {
        if (msg.type === 'presentation-ended') {
          if (isAudienceMode) {
            setPresentationEnded(true);
            setBlackout(false);
            setShowAudienceBanner(false);
            remoteLaserRef.current?.hide();
            if (document.fullscreenElement) {
              document.exitFullscreen?.().catch(() => {});
            }
          }
          return;
        }
        if (msg.type === 'hello') {
          if (viewRole === 'presenter') {
            // Immediately push full authoritative state to newly opened Audience Window
            bridge.send({
              type: 'state',
              state: {
                slideIndex: currentIndexRef.current,
                blackout: blackoutRef.current,
                annotationsBySlide: annotationsBySlideRef.current,
              },
            });
          } else if (msg.role === 'presenter') {
            // Presenter restarted presentation -> automatically resume Audience Window
            setPresentationEnded(false);
            setCloseTabHint(false);
          }
          return;
        }
        if (msg.type === 'pong' && isAudienceMode && msg.role === 'presenter') {
          setPresentationEnded(false);
          setCloseTabHint(false);
          return;
        }
        if (msg.type === 'state') {
          const clamped = Math.max(0, Math.min(slides.length - 1, msg.state.slideIndex));
          setCurrentIndex(clamped);
          setBlackout(Boolean(msg.state.blackout));
          if (msg.state.annotationsBySlide) {
            setAnnotationsBySlide(msg.state.annotationsBySlide);
          }
          if (isAudienceMode) {
            setPresentationEnded(false);
            setCloseTabHint(false);
            setShowAudienceBanner(false);
          }
          return;
        }
        if (msg.type === 'laser') {
          if (msg.laser.active && msg.laser.slideId === currentSlideIdRef.current) {
            remoteLaserRef.current?.handleEvent({
              active: true,
              x: msg.laser.x,
              y: msg.laser.y,
              color: msg.laser.color,
              phase: msg.laser.phase || 'hover',
            });
          } else {
            remoteLaserRef.current?.hide();
          }
        }
      },
    });
    syncBridgeRef.current = bridge;
    return () => {
      bridge.close({ endPresentation: viewRole === 'presenter' });
      syncBridgeRef.current = null;
    };
  }, [effectiveSyncId, viewRole, slides.length, isAudienceMode]);

  const handleLaserMove = useCallback((event: LaserMoveEvent) => {
    syncBridgeRef.current?.send({
      type: 'laser',
      laser: {
        active: event.active,
        x: event.x,
        y: event.y,
        color: event.color,
        slideId: currentSlideIdRef.current,
        phase: event.phase,
      },
    });
  }, []);

  const handleCopyAudienceLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(audienceUrl);
      setCopiedAudienceLink(true);
      window.setTimeout(() => setCopiedAudienceLink(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  }, [audienceUrl]);

  const handleCommitStroke = useCallback(
    (stroke: AnnotationStroke) => {
      const slideId = currentSlide.id;
      const current = annotationsBySlideRef.current[slideId] || [];
      const nextMap = {
        ...annotationsBySlideRef.current,
        [slideId]: [...current, stroke],
      };
      setUndoHistoryBySlide((hPrev) => ({
        ...hPrev,
        [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
      }));
      setAnnotationsBySlide(nextMap);
      broadcastState(currentIndexRef.current, blackoutRef.current, nextMap);
    },
    [currentSlide.id, broadcastState]
  );

  const handleEraseStrokeIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const slideId = currentSlide.id;
      const current = annotationsBySlideRef.current[slideId] || [];
      const filtered = current.filter((s) => !idSet.has(s.id));
      if (filtered.length === current.length) return;
      const nextMap = {
        ...annotationsBySlideRef.current,
        [slideId]: filtered,
      };
      setUndoHistoryBySlide((hPrev) => ({
        ...hPrev,
        [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
      }));
      setAnnotationsBySlide(nextMap);
      broadcastState(currentIndexRef.current, blackoutRef.current, nextMap);
    },
    [currentSlide.id, broadcastState]
  );

  const handleUndoAnnotation = useCallback(() => {
    const slideId = currentSlide.id;
    const stack = undoHistoryBySlideRef.current[slideId];
    if (!stack || stack.length === 0) return;
    const previousState = stack[stack.length - 1];
    const nextMap = { ...annotationsBySlideRef.current, [slideId]: previousState };
    setUndoHistoryBySlide((hPrev) => ({
      ...hPrev,
      [slideId]: (hPrev[slideId] || []).slice(0, -1),
    }));
    setAnnotationsBySlide(nextMap);
    broadcastState(currentIndexRef.current, blackoutRef.current, nextMap);
  }, [currentSlide.id, broadcastState]);

  const handleClearSlideAnnotations = useCallback(() => {
    const slideId = currentSlide.id;
    const current = annotationsBySlideRef.current[slideId] || [];
    if (current.length === 0) return;
    const nextMap = { ...annotationsBySlideRef.current, [slideId]: [] };
    setUndoHistoryBySlide((hPrev) => ({
      ...hPrev,
      [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
    }));
    setAnnotationsBySlide(nextMap);
    broadcastState(currentIndexRef.current, blackoutRef.current, nextMap);
  }, [currentSlide.id, broadcastState]);

  const handleKeyAction = useCallback(
    (key: string) => {
      if (key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        else if (gridOpen) setGridOpen(false);
        else if (blackout) toggleBlackout(false);
        else if (activeTool !== 'pointer') selectTool('pointer');
        else if (!isAudienceMode) handleExitPresentation();
        return;
      }
      if (key === 'ArrowRight' || key === ' ' || key === 'PageDown' || key === 'ArrowDown') {
        step(1);
      } else if (key === 'ArrowLeft' || key === 'PageUp' || key === 'ArrowUp') {
        step(-1);
      } else if (key === 'Home') {
        goTo(0);
      } else if (key === 'End') {
        goTo(slides.length - 1);
      } else if (key === 'g' || key === 'G') {
        if (!isAudienceMode) {
          setGridOpen((v) => !v);
          setHelpOpen(false);
        }
      } else if (key === 'n' || key === 'N') {
        // Never allow Presenter View to open inside a dedicated Audience Window
        if (!isAudienceMode) {
          setPresenterView((v) => !v);
        }
      } else if (key === 'b' || key === 'B') {
        toggleBlackout();
      } else if (key === 'f' || key === 'F') {
        toggleFullscreen();
      } else if (key === 'l' || key === 'L') {
        if (!isAudienceMode) selectTool(activeTool === 'laser' ? 'pointer' : 'laser');
      } else if (key === 'p' || key === 'P') {
        if (!isAudienceMode) selectTool(activeTool === 'pen' ? 'pointer' : 'pen');
      } else if (key === 'h' || key === 'H') {
        if (!isAudienceMode) selectTool(activeTool === 'highlighter' ? 'pointer' : 'highlighter');
      } else if (key === 'a' || key === 'A') {
        if (!isAudienceMode) selectTool(activeTool === 'arrow' ? 'pointer' : 'arrow');
      } else if (key === 'r' || key === 'R') {
        if (!isAudienceMode) selectTool(activeTool === 'rect' ? 'pointer' : 'rect');
      } else if (key === 'e' || key === 'E') {
        if (!isAudienceMode) selectTool(activeTool === 'eraser' ? 'pointer' : 'eraser');
      } else if (key === 'v' || key === 'V') {
        if (!isAudienceMode) selectTool('pointer');
      } else if (key === 'c' || key === 'C') {
        if (!isAudienceMode) handleClearSlideAnnotations();
      } else if (key === 't' || key === 'T') {
        toggleToolbarHidden();
      } else if (key === 'o' || key === 'O') {
        if (!isAudienceMode && activeTool !== 'pointer') {
          setToolOptionsHidden((v) => !v);
          if (!toolbarHiddenRef.current) bumpControls(true);
        }
      } else if (key === '?') {
        if (!isAudienceMode) setHelpOpen((v) => !v);
      }
    },
    [
      activeTool,
      blackout,
      bumpControls,
      currentIndex,
      goTo,
      gridOpen,
      handleClearSlideAnnotations,
      handleExitPresentation,
      helpOpen,
      isAudienceMode,
      selectTool,
      slides.length,
      step,
      toggleBlackout,
      toggleFullscreen,
      toggleToolbarHidden,
    ]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndoAnnotation();
        return;
      }
      if (['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
      }
      handleKeyAction(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKeyAction, handleUndoAnnotation]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTool !== 'pointer') return;
    touchStartXRef.current = e.changedTouches[0]?.screenX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (activeTool !== 'pointer') return;
    if (touchStartXRef.current === null) return;
    const dx = (e.changedTouches[0]?.screenX ?? 0) - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(dx) > 48) {
      step(dx < 0 ? 1 : -1);
    } else {
      bumpControls(true);
    }
  };

  const annotationOverlay = useMemo(
    () => (
      <PresentationAnnotationLayer
        slideId={currentSlide.id}
        tool={isAudienceMode ? 'pointer' : activeTool}
        color={strokeColor}
        laserColor={laserColor}
        strokeSize={strokeSize}
        annotations={currentAnnotations}
        onCommitStroke={handleCommitStroke}
        onEraseStrokeIds={handleEraseStrokeIds}
        onLaserMove={isAudienceMode ? undefined : handleLaserMove}
        remoteLaserRef={remoteLaserRef}
      />
    ),
    [
      currentSlide.id,
      isAudienceMode,
      activeTool,
      strokeColor,
      laserColor,
      strokeSize,
      currentAnnotations,
      handleCommitStroke,
      handleEraseStrokeIds,
      handleLaserMove,
    ]
  );

  const isLaserActive = activeTool === 'laser';
  const isDrawingToolActive = activeTool !== 'pointer' && activeTool !== 'laser';

  const progressPct = ((currentIndex + 1) / slides.length) * 100;

  return (
    <div
      ref={rootRef}
      onMouseMove={handleStageMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col select-none"
      role="application"
      aria-label={`Presenting ${deck.title}`}
    >
      {/* Screen Reader Live Region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {currentIndex + 1} of {slides.length}: {currentSlide.title}
      </div>

      {/* Top Progress Bar */}
      <div className="h-0.5 w-full bg-slate-800 shrink-0">
        <div
          className="h-full bg-blue-500 transition-[width] duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Main Presentation Stage or Private Presenter Split View */}
      {!isAudienceMode && presenterView ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 overflow-y-auto">
          <div className="lg:col-span-8 flex flex-col gap-3 min-h-[340px]">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">Current Slide · {currentSlide.title}</span>
              </div>
              <span className="font-mono tabular-nums shrink-0">
                {String(currentIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </span>
            </div>
            <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 bg-black p-2">
              <SlideFrame
                slide={currentSlide}
                theme={theme}
                libraries={deck.libraries}
                customResources={deck.customResources}
                sharedCss={deck.sharedCss}
                aspectRatio={deck.aspectRatio}
                overlay={annotationOverlay}
                onForwardKey={handleKeyAction}
              />
              {blackout && (
                <div
                  onClick={() => toggleBlackout(false)}
                  className="absolute inset-0 bg-black/85 z-20 flex flex-col items-center justify-center gap-2 cursor-pointer"
                >
                  <MonitorOff className="w-6 h-6 text-slate-400" />
                  <span className="text-xs font-medium text-slate-200">
                    Audience screen blacked out
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Press B or click here to resume
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3.5 min-h-0">
            {/* Dual-Screen Audience Window Control */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {syncedAudienceCount > 0 ? (
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-xs font-medium text-slate-200 truncate">
                    {syncedAudienceCount > 0
                      ? syncedAudienceCount === 1
                        ? 'Audience window synced'
                        : `${syncedAudienceCount} audience windows synced`
                      : 'Keep notes private'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAudienceLink}
                  className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  title="Copy Audience Window link"
                >
                  {copiedAudienceLink ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Open a clean slide-only Audience Window for your projector (Extended Display) or share only that tab on Zoom/Meet. Slides, blackout, laser &amp; ink sync live.
              </p>
              <a
                href={audienceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>
                  {syncedAudienceCount > 0 ? 'Open Another Audience Window' : 'Open Audience Window'}
                </span>
              </a>
            </div>

            {/* Isolated Presenter Timer (zero stage re-renders on 1s tick) */}
            <PresenterTimer />

            {/* Next Slide Preview */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-2">
              <span className="text-xs text-slate-400">
                Next Slide{nextSlide ? ` · ${nextSlide.title}` : ''}
              </span>
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-black">
                {nextSlide ? (
                  <SlideFrame
                    slide={nextSlide}
                    theme={theme}
                    libraries={deck.libraries}
                    customResources={deck.customResources}
                    sharedCss={deck.sharedCss}
                    aspectRatio={deck.aspectRatio}
                    isThumbnail
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                    End of presentation
                  </div>
                )}
              </div>
            </div>

            {/* Speaker Notes */}
            <div className="flex-1 min-h-[160px] p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Speaker Notes</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setNoteFontSize((s) => Math.max(12, s - 2))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                    aria-label="Decrease notes font size"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteFontSize((s) => Math.min(28, s + 2))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                    aria-label="Increase notes font size"
                  >
                    A+
                  </button>
                </div>
              </div>
              <div
                className="flex-1 overflow-y-auto text-slate-200 leading-relaxed whitespace-pre-wrap select-text"
                style={{ fontSize: `${noteFontSize}px` }}
              >
                {currentSlide.notes?.trim() || 'No speaker notes for this slide.'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 relative flex items-center justify-center p-2 sm:p-4"
          onClick={() => {
            if (isAudienceMode && showAudienceBanner) setShowAudienceBanner(false);
          }}
        >
          {isAudienceMode && presentationEnded ? (
            <div className="flex flex-col items-center justify-center text-center max-w-md px-6 py-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                <MonitorOff className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-semibold text-white">
                Presentation ended
              </h1>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                The presenter closed the presentation. You can close this tab, or leave it open to reconnect automatically when they present again.
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    window.close();
                    window.setTimeout(() => setCloseTabHint(true), 180);
                  }}
                  className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Close Tab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPresentationEnded(false);
                    setCloseTabHint(false);
                  }}
                  className="h-9 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  Resume Slide View
                </button>
              </div>
              {closeTabHint && (
                <p className="text-[11px] text-slate-500 mt-3">
                  Your browser prevents tabs from closing themselves — press Ctrl+W or Cmd+W to close this tab.
                </p>
              )}
            </div>
          ) : (
            <SlideFrame
              slide={currentSlide}
              theme={theme}
              libraries={deck.libraries}
              customResources={deck.customResources}
              sharedCss={deck.sharedCss}
              aspectRatio={deck.aspectRatio}
              overlay={annotationOverlay}
              onForwardKey={handleKeyAction}
            />
          )}
          {isAudienceMode && showAudienceBanner && !blackout && !presentationEnded && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/95 border border-slate-700/80 text-xs text-slate-200 shadow-2xl backdrop-blur-md">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  syncedPresenterCount > 0 ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">
                Audience Window {syncedPresenterCount > 0 ? '· Synced with Presenter' : '· Ready'} — Move to projector or share this tab, then press{' '}
                <strong className="font-mono text-white">F</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowAudienceBanner(false)}
                className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {blackout && !presentationEnded && (
            <div
              onClick={() => toggleBlackout(false)}
              className="absolute inset-0 bg-black z-20 flex items-end justify-center pb-8 cursor-pointer"
            >
              {!isAudienceMode && (
                <span className="text-xs text-slate-600">
                  Screen blacked out — press B or click to resume
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Discreet Bottom-Center Reveal Handle When Toolbar Is Manually Hidden */}
      {toolbarHidden && !(isAudienceMode && presentationEnded) && (
        <button
          type="button"
          onClick={showToolbar}
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30 h-7 px-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 border border-slate-700/70 text-slate-300 hover:text-white hover:bg-slate-900 opacity-15 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer backdrop-blur-sm"
          aria-label="Show presentation toolbar (T)"
          title="Show Toolbar (T)"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Floating Accessible Control Bar & Separate Collapsible Contextual Sub-Bars */}
      {!(isAudienceMode && presentationEnded) && (
      <div
        onMouseEnter={() => {
          if (toolbarHiddenRef.current) return;
          dockHoveredRef.current = true;
          if (!controlsVisibleRef.current) {
            controlsVisibleRef.current = true;
            setControlsVisible(true);
          }
        }}
        onMouseLeave={() => {
          dockHoveredRef.current = false;
          if (!toolbarHiddenRef.current) {
            bumpControls(true);
          }
        }}
        className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 max-w-[96vw] transition-[opacity,transform] duration-200 ${
          !toolbarHidden && (controlsVisible || presenterView)
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        {/* 1. Separate Compact Laser Color Bar (collapsible without turning off Laser) */}
        {!isAudienceMode && isLaserActive && !toolOptionsHidden && (
          <div
            role="toolbar"
            aria-label="Laser pointer options"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/95 border border-slate-700/80 backdrop-blur-md shadow-xl"
          >
            <span className="text-[11px] font-medium text-slate-400 pr-0.5 whitespace-nowrap">
              Laser
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-label="Laser color">
              {LASER_COLORS.map((swatch) => {
                const isSelected = laserColor === swatch.value;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => setLaserColor(swatch.value)}
                    aria-label={swatch.label}
                    aria-pressed={isSelected}
                    title={swatch.label}
                    className={`w-4 h-4 rounded-full border border-white/30 transition-transform cursor-pointer shrink-0 ${
                      isSelected
                        ? 'scale-115 ring-2 ring-white ring-offset-1 ring-offset-slate-900'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: swatch.value }}
                  />
                );
              })}
            </div>
            <span className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setToolOptionsHidden(true)}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Hide laser options (O)"
              title="Hide Laser Options (O)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => selectTool('pointer')}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Turn off laser (Esc)"
              title="Turn Off Laser (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. Separate Compact Drawing Bar (collapsible without turning off active drawing tool) */}
        {!isAudienceMode && isDrawingToolActive && !toolOptionsHidden && (
          <div
            role="toolbar"
            aria-label="Drawing tools"
            className="flex flex-wrap items-center justify-center gap-1 px-2 py-1 rounded-xl bg-slate-900/95 border border-slate-700/80 backdrop-blur-md shadow-xl"
          >
            {(
              [
                { id: 'pen', icon: Pen, label: 'Pen (P)' },
                { id: 'highlighter', icon: Highlighter, label: 'Highlighter (H)' },
                { id: 'arrow', icon: ArrowUpRight, label: 'Arrow (A, hold Shift to snap)' },
                { id: 'rect', icon: Square, label: 'Box (R, hold Shift for square)' },
                { id: 'eraser', icon: Eraser, label: 'Stroke Eraser (E)' },
              ] as const
            ).map(({ id, icon: Icon, label }) => {
              const isSelected = activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTool(id)}
                  aria-label={label}
                  aria-pressed={isSelected}
                  title={label}
                  className={`w-7 h-7 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}

            {activeTool !== 'eraser' && (
              <>
                <span className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />
                <div className="flex items-center gap-1 px-0.5" role="group" aria-label="Ink color">
                  {ANNOTATION_COLORS.map((swatch) => {
                    const isColorActive = strokeColor === swatch.value;
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setStrokeColor(swatch.value)}
                        aria-label={swatch.label}
                        aria-pressed={isColorActive}
                        title={swatch.label}
                        className={`w-4 h-4 rounded-full border border-white/25 transition-transform cursor-pointer shrink-0 ${
                          isColorActive
                            ? 'scale-115 ring-2 ring-white ring-offset-1 ring-offset-slate-900'
                            : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: swatch.value }}
                      />
                    );
                  })}
                </div>

                <span className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />
                <div className="flex items-center gap-0.5" role="group" aria-label="Stroke width">
                  {ANNOTATION_SIZES.map((sz) => {
                    const isActive = strokeSize === sz.value;
                    const dotPx = sz.id === 'sm' ? 4 : sz.id === 'md' ? 6.5 : 9;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setStrokeSize(sz.value)}
                        aria-label={`${sz.label} stroke`}
                        aria-pressed={isActive}
                        title={`${sz.label} stroke`}
                        className={`w-6 h-6 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span
                          className="rounded-full bg-current block"
                          style={{ width: `${dotPx}px`, height: `${dotPx}px` }}
                        />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <span className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={handleUndoAnnotation}
              disabled={!canUndoAnnotation}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-35 disabled:pointer-events-none cursor-pointer shrink-0"
              aria-label="Undo drawing (Ctrl+Z)"
              title="Undo Drawing (Ctrl/Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleClearSlideAnnotations}
              disabled={currentAnnotations.length === 0}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-950/70 hover:text-red-300 disabled:opacity-35 disabled:pointer-events-none cursor-pointer shrink-0"
              aria-label="Clear drawings on this slide (C)"
              title="Clear Slide Drawings (C)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setToolOptionsHidden(true)}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Hide drawing options (O)"
              title="Hide Drawing Options (O)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => selectTool('pointer')}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Done drawing (Esc)"
              title="Done Drawing (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <nav
          aria-label="Presentation controls"
          className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-900/92 border border-slate-700/70 backdrop-blur-md shadow-xl overflow-x-auto max-w-full"
        >
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={currentIndex === 0}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-35 cursor-pointer shrink-0"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <span className="px-1.5 font-mono text-xs tabular-nums text-slate-200 whitespace-nowrap shrink-0">
            {String(currentIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>

          <button
            type="button"
            onClick={() => step(1)}
            disabled={currentIndex === slides.length - 1}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-35 cursor-pointer shrink-0"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {!isAudienceMode && (
            <>
              <span className="w-px h-4 bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

              {/* Laser Pointer Toggle (separate from drawing) */}
              <button
                type="button"
                onClick={() => selectTool(isLaserActive ? 'pointer' : 'laser')}
                className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                  isLaserActive
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Toggle laser pointer (L)"
                aria-pressed={isLaserActive}
                title="Laser Pointer (L)"
              >
                <Radio className="w-4 h-4" />
              </button>

              {/* Drawing Tools Toggle (separate from laser) */}
              <button
                type="button"
                onClick={() => selectTool(isDrawingToolActive ? 'pointer' : lastDrawTool)}
                className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                  isDrawingToolActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Toggle drawing tools (P)"
                aria-pressed={isDrawingToolActive}
                title="Draw & Annotate (P)"
              >
                <Pen className="w-4 h-4" />
              </button>

              {/* Compact Toggle to Re-Expand Hidden Laser / Drawing Options */}
              {(isLaserActive || isDrawingToolActive) && toolOptionsHidden && (
                <button
                  type="button"
                  onClick={() => setToolOptionsHidden(false)}
                  className="w-7 h-8 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
                  aria-label="Show tool options (O)"
                  title={isLaserActive ? 'Show Laser Options (O)' : 'Show Drawing Options (O)'}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              )}

              <span className="w-px h-4 bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setPresenterView((v) => !v)}
                className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                  presenterView ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Toggle presenter notes view (N)"
                title="Presenter View (N)"
              >
                <NotebookPen className="w-4 h-4" />
              </button>

              {/* Direct Dual-Window Audience Screen Launcher */}
              <a
                href={audienceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`relative w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                  syncedAudienceCount > 0
                    ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Open synchronized Audience Window"
                title={
                  syncedAudienceCount > 0
                    ? `Audience Window Synced (${syncedAudienceCount}) — Click to open another`
                    : 'Open Separate Audience Window (Dual Screen)'
                }
              >
                <Monitor className="w-4 h-4" />
                {syncedAudienceCount > 0 && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
                    aria-hidden="true"
                  />
                )}
              </a>

              <button
                type="button"
                onClick={() => setGridOpen((v) => !v)}
                className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                  gridOpen ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Toggle slide grid overview (G)"
                title="Slide Grid (G)"
              >
                <Grid className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => toggleBlackout()}
                className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                  blackout ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-label="Blackout screen (B)"
                title="Blackout Screen (B)"
              >
                <MonitorOff className="w-4 h-4" />
              </button>
            </>
          )}

          <span className="w-px h-4 bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {!isAudienceMode && (
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Keyboard shortcuts (?)"
              title="Keyboard Shortcuts (?)"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {!isAudienceMode && onExportPresentation && (
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen?.().catch(() => {});
                }
                onExportPresentation();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Export standalone presentation"
              title="Export Standalone Presentation (.html)"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={hideToolbar}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Hide toolbar (T)"
            title="Hide Toolbar (T)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {!isAudienceMode && (
            <>
              <span className="w-px h-4 bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

              <button
                type="button"
                onClick={handleExitPresentation}
                className="px-2.5 h-8 sm:h-9 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                aria-label="Exit presentation (Escape)"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </>
          )}
        </nav>
      </div>
      )}

      {/* Grid Overview Modal */}
      {gridOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/92 backdrop-blur-md p-6 sm:p-10 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Slide grid overview"
        >
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">Slide Overview</h2>
                <p className="text-xs text-slate-400 mt-1">
                  {deck.title} · {slides.length} slides
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close Grid</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    goTo(idx);
                    setGridOpen(false);
                  }}
                  className={`group text-left rounded-xl overflow-hidden border transition-colors cursor-pointer ${
                    idx === currentIndex
                      ? 'border-blue-500 ring-2 ring-blue-500/40'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="aspect-video bg-black overflow-hidden">
                    <SlideFrame
                      slide={s}
                      theme={theme}
                      libraries={deck.libraries}
                      customResources={deck.customResources}
                      sharedCss={deck.sharedCss}
                      aspectRatio={deck.aspectRatio}
                      isThumbnail
                    />
                  </div>
                  <div className="px-3.5 py-2.5 bg-slate-900 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-200 truncate">{s.title}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Overlay */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setHelpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-white">Keyboard Shortcuts</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Close shortcuts"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="divide-y divide-slate-800 text-sm max-h-[65vh] overflow-y-auto pr-1">
              {[
                ['Next / Previous slide', 'Right / Left Arrow'],
                ['First / Last slide', 'Home / End'],
                ['Laser Pointer', 'L'],
                ['Pen / Highlighter', 'P / H'],
                ['Arrow / Box', 'A / R (hold Shift to snap)'],
                ['Stroke Eraser / Pointer', 'E / V'],
                ['Undo / Clear slide ink', 'Ctrl+Z / C'],
                ['Hide / Show Tool Options', 'O'],
                ['Hide / Show Toolbar', 'T'],
                ['Presenter Notes & Timer', 'N'],
                ['Slide Grid Overview', 'G'],
                ['Blackout Screen', 'B'],
                ['Fullscreen', 'F'],
                ['Exit tool / Presentation', 'Esc'],
              ].map(([action, keyLabel]) => (
                <div key={action} className="py-2 flex items-center justify-between gap-4">
                  <dt className="text-slate-300">{action}</dt>
                  <dd className="font-mono text-xs text-slate-400 text-right">{keyLabel}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};
