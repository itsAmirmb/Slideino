import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  CustomResource,
  EditorCommand,
  LibraryConfig,
  MultiSelectionSummary,
  SelectedElementInfo,
  Slide,
  SlideLayerItem,
  SlideTheme,
} from '../types/slideino';
import {
  buildSlideDocument,
  detectSlideStaticDimensions,
  detectStandaloneBackdrop,
} from '../utils/slideRuntime';

export interface SlideFrameHandle {
  sendCommand: (command: EditorCommand) => void;
}

interface SlideFrameProps {
  slide: Slide;
  preloadSlides?: Slide[];
  theme: SlideTheme;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  aspectRatio: AspectRatio;
  isThumbnail?: boolean;
  editMode?: boolean;
  zoom?: 'fit' | number;
  onScaleChange?: (scale: number) => void;
  onDimensionsChange?: (dims: { width: number; height: number }) => void;
  onForwardKey?: (key: string, shiftKey: boolean) => void;
  onVisualHtmlChange?: (html: string, commit: boolean) => void;
  onElementSelect?: (
    element: SelectedElementInfo | null,
    multiSelection: MultiSelectionSummary | null
  ) => void;
  onLayersChange?: (
    layers: SlideLayerItem[],
    slideDir: 'ltr' | 'rtl',
    availableFonts: string[]
  ) => void;
  onEditorUndo?: () => void;
  onEditorRedo?: () => void;
  overlay?: React.ReactNode;
  className?: string;
}

type SlotIndex = 0 | 1 | 2;
const SLOT_INDICES: readonly SlotIndex[] = [0, 1, 2];

interface Dims {
  width: number;
  height: number;
}

interface PoolSlotState {
  srcDoc: string;
  docKey: string;
  instanceId: string;
  slideId: string;
  title: string;
  transition: Slide['transition'];
  backdrop: string;
  ready: boolean;
  staticDims: Dims | null;
  measuredDims: Dims | null;
}

interface PendingLayersPayload {
  layers: SlideLayerItem[];
  slideDir: 'ltr' | 'rtl';
  availableFonts: string[];
}

const EMPTY_SLOT: PoolSlotState = {
  srcDoc: '',
  docKey: '',
  instanceId: '',
  slideId: '',
  title: '',
  transition: 'fade',
  backdrop: '',
  ready: false,
  staticDims: null,
  measuredDims: null,
};

// Emergency failsafe only — normal reveals fire immediately on the slide's `slide-ready` event
const READY_FALLBACK_MS = 3500;
const SINGLE_READY_FALLBACK_MS = 3500;
const RETIRING_HOLD_MS = 160;
const PRELOAD_IDLE_DELAY_MS = 85;

function hashText(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${input.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

function resolveSlideBackdrop(slide: Slide, themeBg: string): string {
  if (slide.backgroundOverride?.trim()) return slide.backgroundOverride.trim();
  const isStandalone =
    Boolean(slide.standalone) || /<!doctype\s+html|<html[\s>]/i.test(slide.html || '');
  if (isStandalone) {
    return detectStandaloneBackdrop(slide.html, slide.css) || themeBg;
  }
  return themeBg;
}

function computeSlideDocKey(slide: Slide, envKey: string): string {
  return [
    slide.id,
    hashText(slide.html || ''),
    hashText(slide.css || ''),
    slide.backgroundOverride || '',
    slide.standalone ? '1' : '0',
    envKey,
  ].join('|');
}

function blankIframeElement(frame: HTMLIFrameElement | null): void {
  if (!frame) return;
  try {
    frame.srcdoc = '';
    frame.src = 'about:blank';
  } catch {
    // Ignore detached / cross-origin frame cleanup errors
  }
}

function clampAutoDims(width: number, height: number): Dims {
  return {
    width: Math.max(480, Math.min(3840, Math.round(width))),
    height: Math.max(320, Math.min(2400, Math.round(height))),
  };
}

const SlideFrameInner = forwardRef<SlideFrameHandle, SlideFrameProps>(
  (
    {
      slide,
      preloadSlides,
      theme,
      libraries,
      customResources,
      sharedCss,
      aspectRatio,
      isThumbnail = false,
      editMode = false,
      zoom = 'fit',
      onScaleChange,
      onDimensionsChange,
      onForwardKey,
      onVisualHtmlChange,
      onElementSelect,
      onLayersChange,
      onEditorUndo,
      onEditorRedo,
      overlay,
      className = '',
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const singleIframeRef = useRef<HTMLIFrameElement>(null);
    const slot0Ref = useRef<HTMLIFrameElement>(null);
    const slot1Ref = useRef<HTMLIFrameElement>(null);
    const slot2Ref = useRef<HTMLIFrameElement>(null);
    const reactId = useId();

    const getSlotIframe = useCallback((idx: SlotIndex): HTMLIFrameElement | null => {
      if (idx === 0) return slot0Ref.current;
      if (idx === 1) return slot1Ref.current;
      return slot2Ref.current;
    }, []);

    // All primary stages use the 3-slot Pre-Warmed LRU Pool (`prev` + `current` + `next`)
    // for 0ms instant slide transitions with zero partial-render flash.
    const isPooled = !isThumbnail;
    const isAuto = aspectRatio === 'auto';
    const isFluid = aspectRatio === 'fluid';
    const isManualZoom =
      !isThumbnail &&
      !isFluid &&
      typeof zoom === 'number' &&
      Number.isFinite(zoom) &&
      zoom > 0;

    // Keep parent callbacks in a ref so the window message listener stays mounted and stable
    const callbacksRef = useRef({
      onForwardKey,
      onVisualHtmlChange,
      onElementSelect,
      onLayersChange,
      onEditorUndo,
      onEditorRedo,
    });
    callbacksRef.current = {
      onForwardKey,
      onVisualHtmlChange,
      onElementSelect,
      onLayersChange,
      onEditorUndo,
      onEditorRedo,
    };

    const staticAutoDims = useMemo(
      () => (isAuto ? detectSlideStaticDimensions(slide.html, slide.css) : null),
      [isAuto, slide.html, slide.css]
    );
    const staticAutoW = staticAutoDims?.width ?? 0;
    const staticAutoH = staticAutoDims?.height ?? 0;

    const slideBackdrop = useMemo(
      () => resolveSlideBackdrop(slide, theme.tokens.bg),
      [slide.backgroundOverride, slide.standalone, slide.html, slide.css, theme.tokens.bg]
    );

    const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    );
    const [containerSize, setContainerSize] = useState<Dims>({ width: 0, height: 0 });
    const [runtimeError, setRuntimeError] = useState<string | null>(null);

    // Native loading="lazy" is ignored on srcDoc iframes; gate thumbnails with IntersectionObserver + idle yield
    const [inViewport, setInViewport] = useState(!isThumbnail);
    const [idleReady, setIdleReady] = useState(!isThumbnail);
    const shouldMountIframe = !isThumbnail || (inViewport && idleReady);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    // Deterministic environment key shared across current & preloaded slides
    const envKey = useMemo(
      () =>
        JSON.stringify({
          themeId: theme.id,
          themeTokens: theme.tokens,
          themeCss: hashText(theme.customCss || ''),
          libraries,
          customResources,
          sharedCss: hashText(sharedCss || ''),
          editMode: Boolean(editMode),
          isAuto,
          prefersReducedMotion,
        }),
      [theme, libraries, customResources, sharedCss, editMode, isAuto, prefersReducedMotion]
    );

    const currentDocKey = useMemo(
      () => computeSlideDocKey(slide, envKey),
      [slide.id, slide.html, slide.css, slide.backgroundOverride, slide.standalone, envKey]
    );

    // Keep latest render context in a ref for async preload scheduling without stale closures
    const renderEnvRef = useRef({
      theme,
      libraries,
      customResources,
      sharedCss,
      origin,
      editMode: Boolean(editMode),
      isAuto,
      prefersReducedMotion,
      envKey,
      currentSlide: slide,
      currentDocKey,
      preloadSlides: preloadSlides || [],
    });
    renderEnvRef.current = {
      theme,
      libraries,
      customResources,
      sharedCss,
      origin,
      editMode: Boolean(editMode),
      isAuto,
      prefersReducedMotion,
      envKey,
      currentSlide: slide,
      currentDocKey,
      preloadSlides: preloadSlides || [],
    };

    // ── 3-Slot Pre-Warmed LRU Pool State ──
    const [slots, setSlots] = useState<[PoolSlotState, PoolSlotState, PoolSlotState]>([
      EMPTY_SLOT,
      EMPTY_SLOT,
      EMPTY_SLOT,
    ]);
    const [activeSlot, setActiveSlot] = useState<SlotIndex>(0);
    const [retiringSlot, setRetiringSlot] = useState<SlotIndex | null>(null);
    const [pendingSlot, setPendingSlot] = useState<SlotIndex | null>(null);
    const [firstRevealed, setFirstRevealed] = useState<boolean>(false);

    const slotsRef = useRef(slots);
    slotsRef.current = slots;
    const activeSlotRef = useRef<SlotIndex>(activeSlot);
    activeSlotRef.current = activeSlot;
    const retiringSlotRef = useRef<SlotIndex | null>(retiringSlot);
    retiringSlotRef.current = retiringSlot;
    const pendingSlotRef = useRef<SlotIndex | null>(pendingSlot);
    pendingSlotRef.current = pendingSlot;
    const pendingInstanceIdRef = useRef<string | null>(null);
    const firstRevealedRef = useRef<boolean>(firstRevealed);
    firstRevealedRef.current = firstRevealed;
    const loadRevRef = useRef<number>(0);

    const fallbackTimerRef = useRef<number | null>(null);
    const retiringTimerRef = useRef<number | null>(null);
    const preloadTimerRef = useRef<number | null>(null);
    const pendingLayersMapRef = useRef<Map<string, PendingLayersPayload>>(new Map());

    // Live visual editor guard (prevents reloading active iframe on self-edits, while forcing reload on Undo)
    const lastVisualHtmlRef = useRef<string | null>(null);
    const liveMutatedSlotRef = useRef<SlotIndex | null>(null);

    // ── Single-iframe state (Thumbnails only) ──
    const singleInstanceId = useMemo(
      () => `slideino-${reactId}-${slide.id}`,
      [reactId, slide.id]
    );
    const [measuredSingleAutoDims, setMeasuredSingleAutoDims] = useState<Dims | null>(null);
    const [readySingleSrcDoc, setReadySingleSrcDoc] = useState<string>('');
    const singleSrcDocRef = useRef<string>('');
    const singleFallbackTimerRef = useRef<number | null>(null);

    const sendSlotLifecycle = useCallback(
      (idx: SlotIndex, type: 'slide-activate' | 'slide-deactivate') => {
        const slot = slotsRef.current[idx];
        const frame = getSlotIframe(idx);
        if (!slot.instanceId || !frame?.contentWindow) return;
        try {
          frame.contentWindow.postMessage(
            {
              source: 'slideino-host',
              instanceId: slot.instanceId,
              command: { type },
            },
            '*'
          );
        } catch {
          // Ignore detached iframe
        }
      },
      [getSlotIframe]
    );

    useImperativeHandle(
      ref,
      () => ({
        sendCommand(command: EditorCommand) {
          try {
            const activeIdx = activeSlotRef.current;
            const targetFrame = isPooled
              ? getSlotIframe(activeIdx)
              : singleIframeRef.current;
            const targetInstanceId = isPooled
              ? slotsRef.current[activeIdx].instanceId
              : singleInstanceId;
            if (!targetInstanceId) return;
            targetFrame?.contentWindow?.postMessage(
              {
                source: 'slideino-host',
                instanceId: targetInstanceId,
                command,
              },
              '*'
            );
          } catch {
            // Ignore iframe not ready
          }
        },
      }),
      [isPooled, getSlotIframe, singleInstanceId]
    );

    useEffect(() => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }, []);

    // Measure container synchronously before first paint to prevent a 1-frame scale(1) jump
    useLayoutEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const updateSize = (width: number, height: number) => {
        setContainerSize((prev) =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
            ? prev
            : { width, height }
        );
      };
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        updateSize(rect.width, rect.height);
      }
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          updateSize(width, height);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Lazy-mount offscreen thumbnail iframes only when scrolled near viewport
    useEffect(() => {
      if (!isThumbnail) {
        setInViewport(true);
        setIdleReady(true);
        return;
      }
      if (inViewport) return;
      const el = containerRef.current;
      if (!el || typeof IntersectionObserver === 'undefined') {
        setInViewport(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setInViewport(true);
            io.disconnect();
          }
        },
        { rootMargin: '240px' }
      );
      io.observe(el);
      return () => io.disconnect();
    }, [isThumbnail, inViewport]);

    // Yield thumbnail iframe mounting until the main stage has had priority to paint
    useEffect(() => {
      if (!isThumbnail || !inViewport || idleReady) return;
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof win.requestIdleCallback === 'function') {
        const id = win.requestIdleCallback(() => setIdleReady(true), { timeout: 220 });
        return () => win.cancelIdleCallback?.(id);
      }
      const timerId = window.setTimeout(() => setIdleReady(true), 60);
      return () => window.clearTimeout(timerId);
    }, [isThumbnail, inViewport, idleReady]);

    const clearAllPoolTimers = useCallback(() => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      if (retiringTimerRef.current !== null) {
        window.clearTimeout(retiringTimerRef.current);
        retiringTimerRef.current = null;
      }
      if (preloadTimerRef.current !== null) {
        window.clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
    }, []);

    // Stop all active timers, animations, or media inside all iframes immediately on unmount
    useEffect(() => {
      return () => {
        clearAllPoolTimers();
        if (singleFallbackTimerRef.current !== null) {
          window.clearTimeout(singleFallbackTimerRef.current);
          singleFallbackTimerRef.current = null;
        }
        blankIframeElement(singleIframeRef.current);
        blankIframeElement(slot0Ref.current);
        blankIframeElement(slot1Ref.current);
        blankIframeElement(slot2Ref.current);
      };
    }, [clearAllPoolTimers]);

    useEffect(() => {
      setRuntimeError(null);
    }, [slide.html, slide.css, slide.id]);

    const getDesiredKeySet = useCallback((): Set<string> => {
      const env = renderEnvRef.current;
      const set = new Set<string>([env.currentDocKey]);
      for (const ps of env.preloadSlides) {
        if (ps && ps.id !== env.currentSlide.id) {
          set.add(computeSlideDocKey(ps, env.envKey));
        }
      }
      return set;
    }, []);

    const evictOutOfWindowSlots = useCallback(() => {
      const desired = getDesiredKeySet();
      const curActive = activeSlotRef.current;
      const curRetiring = retiringSlotRef.current;
      const curPending = pendingSlotRef.current;

      let changed = false;
      const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
        slotsRef.current[0],
        slotsRef.current[1],
        slotsRef.current[2],
      ];

      for (const idx of SLOT_INDICES) {
        if (idx === curActive || idx === curRetiring || idx === curPending) continue;
        const slot = next[idx];
        if (slot.srcDoc && !desired.has(slot.docKey)) {
          pendingLayersMapRef.current.delete(slot.instanceId);
          blankIframeElement(getSlotIframe(idx));
          next[idx] = EMPTY_SLOT;
          changed = true;
        }
      }

      if (changed) {
        slotsRef.current = next;
        setSlots(next);
      }
    }, [getDesiredKeySet, getSlotIframe]);

    const loadSlideIntoSlot = useCallback(
      (targetSlot: SlotIndex, targetSlide: Slide, docKey: string, preloadPaused: boolean): string => {
        const env = renderEnvRef.current;
        loadRevRef.current += 1;
        const slotInstanceId = `slideino-${reactId}-s${targetSlot}-r${loadRevRef.current}`;

        const staticDims = env.isAuto
          ? detectSlideStaticDimensions(targetSlide.html, targetSlide.css)
          : null;
        const baseDimsForDoc = staticDims || { width: 1280, height: 720 };

        const builtDoc = buildSlideDocument({
          slide: targetSlide,
          theme: env.theme,
          libraries: env.libraries,
          customResources: env.customResources,
          sharedCss: env.sharedCss,
          instanceId: slotInstanceId,
          origin: env.origin,
          isThumbnail: false,
          editMode: env.editMode,
          autoSize: env.isAuto,
          autoBaseDims: baseDimsForDoc,
          prefersReducedMotion: env.prefersReducedMotion,
          preloadPaused,
        });

        const prevInst = slotsRef.current[targetSlot].instanceId;
        if (prevInst) pendingLayersMapRef.current.delete(prevInst);

        const nextSlotState: PoolSlotState = {
          srcDoc: builtDoc,
          docKey,
          instanceId: slotInstanceId,
          slideId: targetSlide.id,
          title: targetSlide.title,
          transition: targetSlide.transition,
          backdrop: resolveSlideBackdrop(targetSlide, env.theme.tokens.bg),
          ready: false,
          staticDims,
          measuredDims: null,
        };

        const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
          slotsRef.current[0],
          slotsRef.current[1],
          slotsRef.current[2],
        ];
        next[targetSlot] = nextSlotState;
        slotsRef.current = next;
        setSlots(next);

        if (liveMutatedSlotRef.current === targetSlot) {
          liveMutatedSlotRef.current = null;
          lastVisualHtmlRef.current = null;
        }

        return slotInstanceId;
      },
      [reactId]
    );

    const schedulePreloadPump = useCallback(
      (delayMs = PRELOAD_IDLE_DELAY_MS) => {
        if (!isPooled) return;
        if (preloadTimerRef.current !== null) {
          window.clearTimeout(preloadTimerRef.current);
          preloadTimerRef.current = null;
        }

        preloadTimerRef.current = window.setTimeout(() => {
          preloadTimerRef.current = null;
          if (!firstRevealedRef.current || pendingSlotRef.current !== null) return;

          const env = renderEnvRef.current;
          const desired = getDesiredKeySet();
          const curActive = activeSlotRef.current;
          const curRetiring = retiringSlotRef.current;

          // Load one adjacent preload slide at a time so nextSlide gets 100% network/CPU priority
          for (const idx of SLOT_INDICES) {
            if (idx === curActive) continue;
            const slot = slotsRef.current[idx];
            if (slot.srcDoc && !slot.ready && desired.has(slot.docKey)) {
              return; // An adjacent slide is already mid-preload; pump will re-run when it signals ready
            }
          }

          const seenKeys = new Set<string>([env.currentDocKey]);
          for (const candidate of env.preloadSlides) {
            if (!candidate || candidate.id === env.currentSlide.id) continue;
            const candKey = computeSlideDocKey(candidate, env.envKey);
            if (seenKeys.has(candKey)) continue;
            seenKeys.add(candKey);

            // Already warm or loading in the pool?
            const alreadyInPool = SLOT_INDICES.some(
              (idx) => slotsRef.current[idx].srcDoc && slotsRef.current[idx].docKey === candKey
            );
            if (alreadyInPool) continue;

            // Pick an empty or out-of-window slot that isn't active or retiring
            let victim: SlotIndex | null = null;
            for (const idx of SLOT_INDICES) {
              if (idx === curActive || idx === curRetiring) continue;
              if (!slotsRef.current[idx].srcDoc) {
                victim = idx;
                break;
              }
            }
            if (victim === null) {
              for (const idx of SLOT_INDICES) {
                if (idx === curActive || idx === curRetiring) continue;
                if (!desired.has(slotsRef.current[idx].docKey)) {
                  victim = idx;
                  break;
                }
              }
            }
            if (victim === null) return;

            loadSlideIntoSlot(victim, candidate, candKey, true);
            return;
          }
        }, delayMs);
      },
      [isPooled, getDesiredKeySet, loadSlideIntoSlot]
    );

    const activatePoolSlot = useCallback(
      (targetSlot: SlotIndex, expectedInstanceId: string, reportedDims?: Dims | null) => {
        const slot = slotsRef.current[targetSlot];
        if (!slot.srcDoc || slot.instanceId !== expectedInstanceId) return;

        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        if (retiringTimerRef.current !== null) {
          window.clearTimeout(retiringTimerRef.current);
          retiringTimerRef.current = null;
        }

        pendingSlotRef.current = null;
        pendingInstanceIdRef.current = null;
        setPendingSlot(null);

        // Ensure slot is marked ready & store any final auto dims
        if (!slot.ready || (reportedDims && renderEnvRef.current.isAuto)) {
          const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
            slotsRef.current[0],
            slotsRef.current[1],
            slotsRef.current[2],
          ];
          next[targetSlot] = {
            ...slot,
            ready: true,
            measuredDims: reportedDims && renderEnvRef.current.isAuto ? reportedDims : slot.measuredDims,
          };
          slotsRef.current = next;
          setSlots(next);
        }

        const prevSlot = activeSlotRef.current;
        const wasRevealed = firstRevealedRef.current;

        if (prevSlot !== targetSlot && wasRevealed) {
          // Pause the departing slide (0% CPU) while keeping it warm in the pool for instant Back navigation
          sendSlotLifecycle(prevSlot, 'slide-deactivate');
          const prevFrame = getSlotIframe(prevSlot);
          if (prevFrame && document.activeElement === prevFrame) {
            try {
              prevFrame.blur();
            } catch {
              // Ignore blur error
            }
          }
          retiringSlotRef.current = prevSlot;
          setRetiringSlot(prevSlot);
        } else {
          retiringSlotRef.current = null;
          setRetiringSlot(null);
        }

        activeSlotRef.current = targetSlot;
        firstRevealedRef.current = true;
        setActiveSlot(targetSlot);
        setFirstRevealed(true);

        // Immediately activate animations & rAF loops in the newly active slide
        sendSlotLifecycle(targetSlot, 'slide-activate');

        // Flush any buffered Edit-mode layers payload for this slot
        const bufferedLayers = pendingLayersMapRef.current.get(expectedInstanceId);
        if (bufferedLayers) {
          pendingLayersMapRef.current.delete(expectedInstanceId);
          callbacksRef.current.onLayersChange?.(
            bufferedLayers.layers,
            bufferedLayers.slideDir,
            bufferedLayers.availableFonts
          );
        }

        if (prevSlot !== targetSlot && wasRevealed) {
          retiringTimerRef.current = window.setTimeout(() => {
            retiringTimerRef.current = null;
            retiringSlotRef.current = null;
            setRetiringSlot(null);
            evictOutOfWindowSlots();
            schedulePreloadPump(30);
          }, RETIRING_HOLD_MS);
        } else {
          evictOutOfWindowSlots();
          schedulePreloadPump(PRELOAD_IDLE_DELAY_MS);
        }
      },
      [sendSlotLifecycle, getSlotIframe, evictOutOfWindowSlots, schedulePreloadPump]
    );

    // ── Primary Slide Activation / Pool Lookup Effect ──
    useEffect(() => {
      if (!isPooled || !shouldMountIframe) return;

      const activeIdx = activeSlotRef.current;
      const activeState = slotsRef.current[activeIdx];

      // 1. Live visual-editor self-edit guard: if active slot already displays this exact edit, do nothing
      if (
        editMode &&
        activeState.srcDoc &&
        activeState.docKey === currentDocKey &&
        (liveMutatedSlotRef.current !== activeIdx || slide.html === lastVisualHtmlRef.current)
      ) {
        schedulePreloadPump(PRELOAD_IDLE_DELAY_MS);
        return;
      }

      // 2. Check if active slot already holds this exact slide cleanly (e.g. only slide.title or slide.notes changed)
      const activeIsDirtyFromLiveEdit =
        editMode &&
        liveMutatedSlotRef.current === activeIdx &&
        slide.html !== lastVisualHtmlRef.current;

      if (
        !activeIsDirtyFromLiveEdit &&
        activeState.srcDoc &&
        activeState.docKey === currentDocKey &&
        firstRevealedRef.current
      ) {
        if (pendingSlotRef.current !== null) {
          pendingSlotRef.current = null;
          pendingInstanceIdRef.current = null;
          setPendingSlot(null);
          if (fallbackTimerRef.current !== null) {
            window.clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
        }
        schedulePreloadPump(PRELOAD_IDLE_DELAY_MS);
        return;
      }

      // 3. Search the 3-slot pool for a warm or in-flight match!
      let matchSlot: SlotIndex | null = null;
      for (const idx of SLOT_INDICES) {
        if (idx === activeIdx && activeIsDirtyFromLiveEdit) continue;
        const s = slotsRef.current[idx];
        if (s.srcDoc && s.docKey === currentDocKey) {
          matchSlot = idx;
          break;
        }
      }

      if (matchSlot !== null) {
        const matched = slotsRef.current[matchSlot];
        if (matched.ready) {
          // INSTANT POOL HIT (< 16ms swap!)
          activatePoolSlot(matchSlot, matched.instanceId);
          return;
        }
        // MID-PRELOAD HIT: reuse the in-flight load without restarting it!
        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        pendingSlotRef.current = matchSlot;
        pendingInstanceIdRef.current = matched.instanceId;
        setPendingSlot(matchSlot);
        const targetIdx = matchSlot;
        const targetInst = matched.instanceId;
        fallbackTimerRef.current = window.setTimeout(() => {
          activatePoolSlot(targetIdx, targetInst);
        }, READY_FALLBACK_MS);
        return;
      }

      // 4. POOL MISS (first mount, grid jump, or theme/code edit) -> load into a free/evictable slot
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      if (preloadTimerRef.current !== null) {
        window.clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }

      const desired = getDesiredKeySet();
      let targetSlot: SlotIndex;
      if (!firstRevealedRef.current) {
        targetSlot = activeSlotRef.current;
      } else {
        let chosen: SlotIndex | null = null;
        // Prefer an empty slot that isn't active
        for (const idx of SLOT_INDICES) {
          if (idx === activeIdx) continue;
          if (!slotsRef.current[idx].srcDoc) {
            chosen = idx;
            break;
          }
        }
        // Next prefer an out-of-window slot that isn't active
        if (chosen === null) {
          for (const idx of SLOT_INDICES) {
            if (idx === activeIdx) continue;
            if (!desired.has(slotsRef.current[idx].docKey)) {
              chosen = idx;
              break;
            }
          }
        }
        // Fallback: any slot other than active
        if (chosen === null) {
          chosen = activeIdx === 0 ? 1 : 0;
        }
        targetSlot = chosen;
      }

      const slotInstanceId = loadSlideIntoSlot(targetSlot, slide, currentDocKey, false);
      pendingSlotRef.current = targetSlot;
      pendingInstanceIdRef.current = slotInstanceId;
      setPendingSlot(targetSlot);

      fallbackTimerRef.current = window.setTimeout(() => {
        activatePoolSlot(targetSlot, slotInstanceId);
      }, READY_FALLBACK_MS);
    }, [
      isPooled,
      shouldMountIframe,
      currentDocKey,
      editMode,
      slide,
      activatePoolSlot,
      getDesiredKeySet,
      loadSlideIntoSlot,
      schedulePreloadPump,
    ]);

    // Trigger preload pump when preloadSlides list changes (e.g. slide reordered/added)
    const preloadSignature = useMemo(
      () => (preloadSlides || []).map((s) => `${s.id}:${hashText(s.html || '')}`).join(','),
      [preloadSlides]
    );
    useEffect(() => {
      if (!isPooled || !shouldMountIframe || !firstRevealed || pendingSlot !== null) return;
      schedulePreloadPump(PRELOAD_IDLE_DELAY_MS);
    }, [isPooled, shouldMountIframe, firstRevealed, pendingSlot, preloadSignature, schedulePreloadPump]);

    // ── Single-Iframe Document Pipeline (Thumbnails only) ──
    const singleSrcDoc = useMemo(() => {
      if (isPooled || !shouldMountIframe) return '';

      const baseDimsForDoc =
        staticAutoW > 0 && staticAutoH > 0
          ? { width: staticAutoW, height: staticAutoH }
          : { width: 1280, height: 720 };

      return buildSlideDocument({
        slide,
        theme,
        libraries,
        customResources,
        sharedCss,
        instanceId: singleInstanceId,
        origin,
        isThumbnail: true,
        editMode: false,
        autoSize: isAuto,
        autoBaseDims: baseDimsForDoc,
        prefersReducedMotion,
      });
    }, [
      isPooled,
      shouldMountIframe,
      slide,
      theme,
      libraries,
      customResources,
      sharedCss,
      singleInstanceId,
      origin,
      isAuto,
      staticAutoW,
      staticAutoH,
      prefersReducedMotion,
    ]);

    singleSrcDocRef.current = singleSrcDoc;
    const isSingleReady = Boolean(singleSrcDoc) && readySingleSrcDoc === singleSrcDoc;

    useEffect(() => {
      if (isPooled) return;
      if (singleFallbackTimerRef.current !== null) {
        window.clearTimeout(singleFallbackTimerRef.current);
        singleFallbackTimerRef.current = null;
      }
      setMeasuredSingleAutoDims(null);
      if (!singleSrcDoc) return;
      const targetDoc = singleSrcDoc;
      singleFallbackTimerRef.current = window.setTimeout(() => {
        singleFallbackTimerRef.current = null;
        if (singleSrcDocRef.current === targetDoc) {
          setReadySingleSrcDoc(targetDoc);
        }
      }, SINGLE_READY_FALLBACK_MS);
    }, [isPooled, singleSrcDoc, isAuto]);

    // ── Unified postMessage Listener (Validates exact source iframe & instanceId) ──
    useEffect(() => {
      if (!shouldMountIframe) return;

      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.source !== 'slideino-frame') return;

        // 1. 3-Slot Pooled Mode
        if (isPooled) {
          let slotIndex: SlotIndex | null = null;
          if (event.source && event.source === slot0Ref.current?.contentWindow) slotIndex = 0;
          else if (event.source && event.source === slot1Ref.current?.contentWindow) slotIndex = 1;
          else if (event.source && event.source === slot2Ref.current?.contentWindow) slotIndex = 2;
          else return;

          const slotState = slotsRef.current[slotIndex];
          if (!slotState.instanceId || data.instanceId !== slotState.instanceId) return;

          if (
            data.type === 'content-size' &&
            isAuto &&
            data.payload &&
            typeof data.payload.width === 'number' &&
            typeof data.payload.height === 'number'
          ) {
            const clamped = clampAutoDims(data.payload.width, data.payload.height);
            setSlots((prev) => {
              const cur = prev[slotIndex!];
              if (cur.instanceId !== data.instanceId) return prev;
              if (
                cur.measuredDims &&
                Math.abs(cur.measuredDims.width - clamped.width) < 4 &&
                Math.abs(cur.measuredDims.height - clamped.height) < 4
              ) {
                return prev;
              }
              const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
                prev[0],
                prev[1],
                prev[2],
              ];
              next[slotIndex!] = { ...cur, measuredDims: clamped };
              slotsRef.current = next;
              return next;
            });
            return;
          }

          if (data.type === 'slide-ready') {
            let reportedDims: Dims | null = null;
            if (
              isAuto &&
              data.payload &&
              typeof data.payload.width === 'number' &&
              typeof data.payload.height === 'number'
            ) {
              reportedDims = clampAutoDims(data.payload.width, data.payload.height);
            }

            // If this slot is the currently requested pending slide, activate it immediately!
            if (
              pendingSlotRef.current === slotIndex &&
              pendingInstanceIdRef.current === data.instanceId
            ) {
              activatePoolSlot(slotIndex, data.instanceId, reportedDims);
              return;
            }

            // Otherwise it finished preloading cleanly in the background -> mark warm & pump next preload
            setSlots((prev) => {
              const cur = prev[slotIndex!];
              if (cur.instanceId !== data.instanceId) return prev;
              const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
                prev[0],
                prev[1],
                prev[2],
              ];
              next[slotIndex!] = {
                ...cur,
                ready: true,
                measuredDims: reportedDims || cur.measuredDims,
              };
              slotsRef.current = next;
              return next;
            });
            schedulePreloadPump(35);
            return;
          }

          // Buffer initial layers-change from any preloading/inactive edit-mode slot
          if (
            data.type === 'layers-change' &&
            slotIndex !== activeSlotRef.current &&
            data.payload &&
            Array.isArray(data.payload.layers)
          ) {
            const dir = data.payload.slideDir === 'rtl' ? 'rtl' : 'ltr';
            const fonts = Array.isArray(data.payload.availableFonts)
              ? data.payload.availableFonts.filter((f: unknown): f is string => typeof f === 'string')
              : [];
            pendingLayersMapRef.current.set(data.instanceId, {
              layers: data.payload.layers,
              slideDir: dir,
              availableFonts: fonts,
            });
            return;
          }

          // Only accept interaction, editor, and error events from the active visible slot
          if (slotIndex !== activeSlotRef.current) return;

          const cb = callbacksRef.current;
          if (
            data.type === 'keydown' &&
            cb.onForwardKey &&
            data.payload &&
            typeof data.payload.key === 'string'
          ) {
            cb.onForwardKey(data.payload.key, Boolean(data.payload.shiftKey));
          } else if (
            data.type === 'runtime-error' &&
            data.payload &&
            typeof data.payload.message === 'string'
          ) {
            setRuntimeError(data.payload.message.slice(0, 200));
          } else if (
            data.type === 'dom-sync' &&
            cb.onVisualHtmlChange &&
            data.payload &&
            typeof data.payload.html === 'string'
          ) {
            const nextHtml = data.payload.html;
            lastVisualHtmlRef.current = nextHtml;
            liveMutatedSlotRef.current = slotIndex;
            // Sync active slot's docKey in-place so React re-render doesn't trigger a reload
            const env = renderEnvRef.current;
            const syncedKey = computeSlideDocKey(
              { ...env.currentSlide, html: nextHtml },
              env.envKey
            );
            const cur = slotsRef.current[slotIndex];
            if (cur.docKey !== syncedKey) {
              const next: [PoolSlotState, PoolSlotState, PoolSlotState] = [
                slotsRef.current[0],
                slotsRef.current[1],
                slotsRef.current[2],
              ];
              next[slotIndex] = { ...cur, docKey: syncedKey };
              slotsRef.current = next;
              setSlots(next);
            }
            cb.onVisualHtmlChange(nextHtml, Boolean(data.payload.commit));
          } else if (data.type === 'element-select' && cb.onElementSelect && data.payload) {
            cb.onElementSelect(
              data.payload.element || null,
              data.payload.multiSelection || null
            );
          } else if (
            data.type === 'layers-change' &&
            cb.onLayersChange &&
            data.payload &&
            Array.isArray(data.payload.layers)
          ) {
            const dir = data.payload.slideDir === 'rtl' ? 'rtl' : 'ltr';
            const fonts = Array.isArray(data.payload.availableFonts)
              ? data.payload.availableFonts.filter((f: unknown): f is string => typeof f === 'string')
              : [];
            cb.onLayersChange(data.payload.layers, dir, fonts);
          } else if (data.type === 'editor-undo' && cb.onEditorUndo) {
            cb.onEditorUndo();
          } else if (data.type === 'editor-redo' && cb.onEditorRedo) {
            cb.onEditorRedo();
          }
          return;
        }

        // 2. Single-iframe mode (Thumbnails only)
        if (event.source !== singleIframeRef.current?.contentWindow) return;
        if (data.instanceId !== singleInstanceId) return;

        if (data.type === 'slide-ready') {
          if (
            isAuto &&
            data.payload &&
            typeof data.payload.width === 'number' &&
            typeof data.payload.height === 'number'
          ) {
            const clamped = clampAutoDims(data.payload.width, data.payload.height);
            setMeasuredSingleAutoDims((prev) =>
              prev &&
              Math.abs(prev.width - clamped.width) < 4 &&
              Math.abs(prev.height - clamped.height) < 4
                ? prev
                : clamped
            );
          }
          if (singleFallbackTimerRef.current !== null) {
            window.clearTimeout(singleFallbackTimerRef.current);
            singleFallbackTimerRef.current = null;
          }
          setReadySingleSrcDoc(singleSrcDocRef.current);
          return;
        }

        if (
          data.type === 'content-size' &&
          isAuto &&
          data.payload &&
          typeof data.payload.width === 'number' &&
          typeof data.payload.height === 'number'
        ) {
          const clamped = clampAutoDims(data.payload.width, data.payload.height);
          setMeasuredSingleAutoDims((prev) =>
            prev &&
            Math.abs(prev.width - clamped.width) < 4 &&
            Math.abs(prev.height - clamped.height) < 4
              ? prev
              : clamped
          );
        }
      };

      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [
      shouldMountIframe,
      isPooled,
      isAuto,
      singleInstanceId,
      activatePoolSlot,
      schedulePreloadPump,
    ]);

    // ── Compute stage dimensions & scale ──
    const fallbackAutoDims = useMemo<Dims>(
      () =>
        staticAutoW > 0 && staticAutoH > 0
          ? { width: staticAutoW, height: staticAutoH }
          : { width: 1280, height: 720 },
      [staticAutoW, staticAutoH]
    );

    const activeSlotState = slots[activeSlot];
    const baseDims: Dims = isFluid
      ? { width: 1280, height: 720 }
      : isAuto
      ? isPooled
        ? activeSlotState.measuredDims || activeSlotState.staticDims || fallbackAutoDims
        : measuredSingleAutoDims || fallbackAutoDims
      : ASPECT_RATIO_DIMENSIONS[aspectRatio];

    const computeScaleForDims = useCallback(
      (dims: Dims) => {
        if (isManualZoom) return zoom as number;
        if (isFluid || containerSize.width === 0 || containerSize.height === 0) return 1;
        return Math.min(containerSize.width / dims.width, containerSize.height / dims.height);
      },
      [isManualZoom, zoom, isFluid, containerSize.width, containerSize.height]
    );

    const scale = useMemo(
      () => computeScaleForDims(baseDims),
      [computeScaleForDims, baseDims]
    );

    useEffect(() => {
      if (!isThumbnail && onScaleChange) {
        onScaleChange(scale);
      }
    }, [scale, isThumbnail, onScaleChange]);

    useEffect(() => {
      if (!isThumbnail && onDimensionsChange) {
        onDimensionsChange({ width: baseDims.width, height: baseDims.height });
      }
    }, [baseDims.width, baseDims.height, isThumbnail, onDimensionsChange]);

    const hasMeasuredContainer =
      isFluid || isManualZoom || (containerSize.width > 0 && containerSize.height > 0);
    const stageWidth = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.width * scale))}px`;
    const stageHeight = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.height * scale))}px`;
    const stageBackdrop = isPooled
      ? activeSlotState.backdrop || slideBackdrop
      : slideBackdrop;

    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full flex ${
          isManualZoom
            ? 'overflow-auto p-4'
            : 'items-center justify-center overflow-hidden'
        } ${className}`}
      >
        <div
          className={`relative overflow-hidden transition-shadow duration-150 ${
            isManualZoom
              ? 'm-auto shrink-0 shadow-lg rounded-lg ring-1 ring-slate-300/80 dark:ring-slate-700/80'
              : ''
          }`}
          style={{
            width: stageWidth,
            height: stageHeight,
            backgroundColor: stageBackdrop,
            visibility: hasMeasuredContainer ? 'visible' : 'hidden',
          }}
        >
          {shouldMountIframe ? (
            isPooled ? (
              SLOT_INDICES.map((slotIndex) => {
                const slot = slots[slotIndex];
                const isActive = slotIndex === activeSlot;
                const isRetiring = slotIndex === retiringSlot;
                const slotDims: Dims = isFluid
                  ? { width: 1280, height: 720 }
                  : isAuto
                  ? slot.measuredDims || slot.staticDims || baseDims
                  : ASPECT_RATIO_DIMENSIONS[aspectRatio];
                const slotScale = computeScaleForDims(slotDims);
                const useFade =
                  !prefersReducedMotion && !editMode && slot.transition !== 'none';

                // Active slot reveals cleanly on top (zIndex: 3);
                // Retiring previous slot stays opaque directly beneath (zIndex: 2) during the 110ms crossfade;
                // Warm preloaded/paused slots stay hidden at zIndex: 1, opacity: 0 ready for instant swap.
                const zIndex = isActive ? 3 : isRetiring ? 2 : 1;
                const slotOpacity = isActive ? (firstRevealed ? 1 : 0) : isRetiring ? 1 : 0;
                const slotTransition =
                  isActive && firstRevealed && useFade
                    ? 'opacity 110ms ease-out'
                    : 'none';

                return (
                  <div
                    key={slotIndex}
                    aria-hidden={!isActive}
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      zIndex,
                      opacity: slotOpacity,
                      transition: slotTransition,
                      pointerEvents: isActive && firstRevealed ? 'auto' : 'none',
                      backgroundColor: slot.backdrop || stageBackdrop,
                    }}
                  >
                    <iframe
                      ref={slotIndex === 0 ? slot0Ref : slotIndex === 1 ? slot1Ref : slot2Ref}
                      title={slot.title ? `Slide: ${slot.title}` : `Slide ${slotIndex + 1}`}
                      srcDoc={slot.srcDoc || undefined}
                      sandbox="allow-scripts"
                      loading="eager"
                      tabIndex={isActive ? 0 : -1}
                      className="border-0 block"
                      style={
                        isFluid
                          ? { width: '100%', height: '100%' }
                          : {
                              width: `${slotDims.width}px`,
                              height: `${slotDims.height}px`,
                              transform: `scale(${slotScale})`,
                              transformOrigin: 'top left',
                            }
                      }
                    />
                  </div>
                );
              })
            ) : (
              <iframe
                ref={singleIframeRef}
                title={`Thumbnail: ${slide.title}`}
                srcDoc={singleSrcDoc}
                sandbox="allow-scripts"
                loading="lazy"
                tabIndex={-1}
                className="border-0 block pointer-events-none select-none"
                style={{
                  ...(isFluid
                    ? { width: '100%', height: '100%' }
                    : {
                        width: `${baseDims.width}px`,
                        height: `${baseDims.height}px`,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                      }),
                  opacity: isSingleReady ? 1 : 0,
                  transition: 'none',
                }}
              />
            )
          ) : (
            <div
              aria-hidden="true"
              className="w-full h-full flex items-center justify-center p-2 opacity-60"
            >
              <div className="w-2/3 h-2 rounded-full bg-slate-400/20" />
            </div>
          )}

          {!isThumbnail && overlay}

          {!isThumbnail && runtimeError && (
            <div
              role="alert"
              className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/90 text-red-100 text-xs border border-red-800/70 backdrop-blur-sm"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-300" aria-hidden="true" />
              <span className="truncate font-mono">Slide script notice: {runtimeError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SlideFrameInner.displayName = 'SlideFrame';

export const SlideFrame = React.memo(SlideFrameInner);
