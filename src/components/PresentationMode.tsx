import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid,
  HelpCircle,
  Maximize2,
  Minimize2,
  MonitorOff,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { Deck, SlideTheme } from '../types/slideino';
import { SlideFrame } from './SlideFrame';

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

  // Presenter timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const currentSlide = slides[currentIndex] || slides[0];
  const nextSlide = slides[currentIndex + 1] || null;

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

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 3200);
  }, []);

  useEffect(() => {
    bumpControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [bumpControls]);

  const handleKeyAction = useCallback(
    (key: string) => {
      if (key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        else if (gridOpen) setGridOpen(false);
        else if (blackout) setBlackout(false);
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
      } else if (key === '?') {
        setHelpOpen((v) => !v);
      }
    },
    [blackout, currentIndex, goTo, gridOpen, helpOpen, onExit, slides.length, step, toggleFullscreen]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
      }
      handleKeyAction(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKeyAction]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.changedTouches[0]?.screenX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const dx = (e.changedTouches[0]?.screenX ?? 0) - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(dx) > 48) {
      step(dx < 0 ? 1 : -1);
    } else {
      bumpControls();
    }
  };

  const progressPct = ((currentIndex + 1) / slides.length) * 100;

  return (
    <div
      ref={rootRef}
      onMouseMove={bumpControls}
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
                onForwardKey={(key) => handleKeyAction(key)}
              />
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
            {/* Timer Bar */}
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
            onForwardKey={(key) => handleKeyAction(key)}
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

      {/* Floating Accessible Control Bar */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 transition-opacity duration-200 ${
          controlsVisible || presenterView ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <nav
          aria-label="Presentation controls"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/92 border border-slate-700/70 backdrop-blur-md shadow-xl"
        >
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={currentIndex === 0}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="px-2 font-mono text-xs tabular-nums text-slate-200 whitespace-nowrap">
            {String(currentIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>

          <button
            type="button"
            onClick={() => step(1)}
            disabled={currentIndex === slides.length - 1}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <span className="w-px h-5 bg-slate-700 mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setPresenterView((v) => !v)}
            className={`w-10 h-10 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
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
            className={`w-10 h-10 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
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
            className={`w-10 h-10 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
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
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
            aria-label={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <span className="w-px h-5 bg-slate-700 mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={() => onExit(currentIndex)}
            className="px-3 h-10 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
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
            <dl className="divide-y divide-slate-800 text-sm">
              {[
                ['Next slide', 'Right Arrow / Space'],
                ['Previous slide', 'Left Arrow'],
                ['First / Last slide', 'Home / End'],
                ['Presenter Notes & Timer', 'N'],
                ['Slide Grid Overview', 'G'],
                ['Blackout Screen', 'B'],
                ['Fullscreen', 'F'],
                ['Exit Presentation', 'Esc'],
              ].map(([action, keyLabel]) => (
                <div key={action} className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-slate-300">{action}</dt>
                  <dd className="font-mono text-xs text-slate-400">{keyLabel}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};
