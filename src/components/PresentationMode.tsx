import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Grid,
  HelpCircle,
  Highlighter,
  Maximize2,
  Minimize2,
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
  PresentationAnnotationLayer,
} from './PresentationAnnotationLayer';

interface PresentationModeProps {
  deck: Deck;
  theme: SlideTheme;
  initialSlideIndex: number;
  onExit: (lastIndex: number) => void;
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
  onExit,
}) => {
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
  const [noteFontSize, setNoteFontSize] = useState(16);

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
  const lastBumpRef = useRef(0);
  const activeToolRef = useRef<AnnotationTool>('pointer');
  activeToolRef.current = activeTool;
  const touchStartXRef = useRef<number | null>(null);

  const currentSlide = slides[currentIndex] || slides[0];
  const nextSlide = slides[currentIndex + 1] || null;
  const currentAnnotations = useMemo(
    () => annotationsBySlide[currentSlide.id] || [],
    [annotationsBySlide, currentSlide.id]
  );
  const canUndoAnnotation = (undoHistoryBySlide[currentSlide.id]?.length || 0) > 0;

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, index));
      setCurrentIndex(clamped);
      setBlackout(false);
    },
    [slides.length]
  );

  const step = useCallback(
    (delta: number) => {
      setCurrentIndex((prev) => Math.max(0, Math.min(slides.length - 1, prev + delta)));
      setBlackout(false);
    },
    [slides.length]
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const bumpControls = useCallback((force = false) => {
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
    hideTimerRef.current = window.setTimeout(() => {
      if (!dockHoveredRef.current) {
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      }
    }, 3000);
  }, []);

  const handleStageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // While using Laser or Drawing tools, avoid popping up the dock on every slide pointer move;
      // bring it back smoothly whenever the cursor approaches the bottom dock area.
      if (activeToolRef.current !== 'pointer') {
        if (window.innerHeight - e.clientY <= 136) {
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
      bumpControls(true);
    },
    [bumpControls]
  );

  const annotationsBySlideRef = useRef(annotationsBySlide);
  annotationsBySlideRef.current = annotationsBySlide;
  const undoHistoryBySlideRef = useRef(undoHistoryBySlide);
  undoHistoryBySlideRef.current = undoHistoryBySlide;

  const handleCommitStroke = useCallback(
    (stroke: AnnotationStroke) => {
      const slideId = currentSlide.id;
      const current = annotationsBySlideRef.current[slideId] || [];
      setUndoHistoryBySlide((hPrev) => ({
        ...hPrev,
        [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
      }));
      setAnnotationsBySlide((prev) => ({
        ...prev,
        [slideId]: [...(prev[slideId] || []), stroke],
      }));
    },
    [currentSlide.id]
  );

  const handleEraseStrokeIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const slideId = currentSlide.id;
      const current = annotationsBySlideRef.current[slideId] || [];
      const filtered = current.filter((s) => !idSet.has(s.id));
      if (filtered.length === current.length) return;
      setUndoHistoryBySlide((hPrev) => ({
        ...hPrev,
        [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
      }));
      setAnnotationsBySlide((prev) => ({
        ...prev,
        [slideId]: (prev[slideId] || []).filter((s) => !idSet.has(s.id)),
      }));
    },
    [currentSlide.id]
  );

  const handleUndoAnnotation = useCallback(() => {
    const slideId = currentSlide.id;
    const stack = undoHistoryBySlideRef.current[slideId];
    if (!stack || stack.length === 0) return;
    const previousState = stack[stack.length - 1];
    setUndoHistoryBySlide((hPrev) => ({
      ...hPrev,
      [slideId]: (hPrev[slideId] || []).slice(0, -1),
    }));
    setAnnotationsBySlide((aPrev) => ({ ...aPrev, [slideId]: previousState }));
  }, [currentSlide.id]);

  const handleClearSlideAnnotations = useCallback(() => {
    const slideId = currentSlide.id;
    const current = annotationsBySlideRef.current[slideId] || [];
    if (current.length === 0) return;
    setUndoHistoryBySlide((hPrev) => ({
      ...hPrev,
      [slideId]: [...(hPrev[slideId] || []).slice(-29), current],
    }));
    setAnnotationsBySlide((prev) => ({ ...prev, [slideId]: [] }));
  }, [currentSlide.id]);

  const handleKeyAction = useCallback(
    (key: string) => {
      if (key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        else if (gridOpen) setGridOpen(false);
        else if (blackout) setBlackout(false);
        else if (activeTool !== 'pointer') selectTool('pointer');
        else onExit(currentIndex);
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
        setGridOpen((v) => !v);
        setHelpOpen(false);
      } else if (key === 'n' || key === 'N') {
        setPresenterView((v) => !v);
      } else if (key === 'b' || key === 'B') {
        setBlackout((v) => !v);
      } else if (key === 'f' || key === 'F') {
        toggleFullscreen();
      } else if (key === 'l' || key === 'L') {
        selectTool(activeTool === 'laser' ? 'pointer' : 'laser');
      } else if (key === 'p' || key === 'P') {
        selectTool(activeTool === 'pen' ? 'pointer' : 'pen');
      } else if (key === 'h' || key === 'H') {
        selectTool(activeTool === 'highlighter' ? 'pointer' : 'highlighter');
      } else if (key === 'a' || key === 'A') {
        selectTool(activeTool === 'arrow' ? 'pointer' : 'arrow');
      } else if (key === 'r' || key === 'R') {
        selectTool(activeTool === 'rect' ? 'pointer' : 'rect');
      } else if (key === 'e' || key === 'E') {
        selectTool(activeTool === 'eraser' ? 'pointer' : 'eraser');
      } else if (key === 'v' || key === 'V') {
        selectTool('pointer');
      } else if (key === 'c' || key === 'C') {
        handleClearSlideAnnotations();
      } else if (key === '?') {
        setHelpOpen((v) => !v);
      }
    },
    [
      activeTool,
      blackout,
      currentIndex,
      goTo,
      gridOpen,
      handleClearSlideAnnotations,
      helpOpen,
      onExit,
      selectTool,
      slides.length,
      step,
      toggleFullscreen,
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
        tool={activeTool}
        color={strokeColor}
        laserColor={laserColor}
        strokeSize={strokeSize}
        annotations={currentAnnotations}
        onCommitStroke={handleCommitStroke}
        onEraseStrokeIds={handleEraseStrokeIds}
      />
    ),
    [
      activeTool,
      strokeColor,
      laserColor,
      strokeSize,
      currentAnnotations,
      handleCommitStroke,
      handleEraseStrokeIds,
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

      {/* Main Presentation Stage or Presenter Split View */}
      {presenterView ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 overflow-y-auto">
          <div className="lg:col-span-8 flex flex-col gap-3 min-h-[340px]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Current Slide · {currentSlide.title}</span>
              <span className="font-mono tabular-nums">
                {String(currentIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </span>
            </div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 bg-black p-2">
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
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
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
            <div className="flex-1 min-h-[180px] p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-3 overflow-hidden">
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
        <div className="flex-1 min-h-0 relative flex items-center justify-center p-2 sm:p-4">
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
              onClick={() => setBlackout(false)}
              className="absolute inset-0 bg-black z-20 flex items-end justify-center pb-8 cursor-pointer"
            >
              <span className="text-xs text-slate-600">Screen blacked out — press B or click to resume</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Accessible Control Bar & Separate Contextual Sub-Bars */}
      <div
        onMouseEnter={() => {
          dockHoveredRef.current = true;
          if (!controlsVisibleRef.current) {
            controlsVisibleRef.current = true;
            setControlsVisible(true);
          }
        }}
        onMouseLeave={() => {
          dockHoveredRef.current = false;
          bumpControls(true);
        }}
        className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 max-w-[96vw] transition-opacity duration-200 ${
          controlsVisible || presenterView ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 1. Separate Compact Laser Color Bar (shown only when Laser is active) */}
        {isLaserActive && (
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
              onClick={() => selectTool('pointer')}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Turn off laser (Esc)"
              title="Turn Off Laser (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. Separate Compact Drawing Bar (no redundant Laser/Pointer buttons) */}
        {isDrawingToolActive && (
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
            onClick={() => setBlackout((v) => !v)}
            className={`w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
              blackout ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
            aria-label="Blackout screen (B)"
            title="Blackout Screen (B)"
          >
            <MonitorOff className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <span className="w-px h-4 bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={() => onExit(currentIndex)}
            className="px-2.5 h-8 sm:h-9 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            aria-label="Exit presentation (Escape)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </nav>
      </div>

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
