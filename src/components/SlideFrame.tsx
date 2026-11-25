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

interface Dims {
  width: number;
  height: number;
}

interface BufferSlotState {
  srcDoc: string;
  instanceId: string;
  slideId: string;
  title: string;
  transition: Slide['transition'];
  backdrop: string;
  staticDims: Dims | null;
  measuredDims: Dims | null;
}

interface PendingLayersPayload {
  instanceId: string;
  layers: SlideLayerItem[];
  slideDir: 'ltr' | 'rtl';
  availableFonts: string[];
}

interface DoubleBufferDocSpec {
  slide: Slide;
  theme: SlideTheme;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  origin: string;
  editMode: boolean;
  isAuto: boolean;
  staticAutoW: number;
  staticAutoH: number;
  prefersReducedMotion: boolean;
}

const EMPTY_SLOT: BufferSlotState = {
  srcDoc: '',
  instanceId: '',
  slideId: '',
  title: '',
  transition: 'fade',
  backdrop: '',
  staticDims: null,
  measuredDims: null,
};

// Emergency failsafe only — normal swaps happen immediately on the slide's `slide-ready` handshake
// after window.load + Tailwind CSS + fonts + images + Mermaid hydration complete.
const READY_FALLBACK_MS = 4500;
const SINGLE_READY_FALLBACK_MS = 4500;
const OLD_SLOT_CLEANUP_MS = 240;

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
    const reactId = useId();

    // Double-buffer ALL primary stages (Presentation, Audience, Studio Preview, AND Studio Edit Mode)
    // so navigating slides keeps the current slide visually stable until the incoming slide is 100% ready.
    const isDoubleBuffered = !isThumbnail;
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

    // Detect static dimensions once per HTML/CSS change and extract stable primitive numbers
    const staticAutoDims = useMemo(
      () => (isAuto ? detectSlideStaticDimensions(slide.html, slide.css) : null),
      [isAuto, slide.html, slide.css]
    );
    const staticAutoW = staticAutoDims?.width ?? 0;
    const staticAutoH = staticAutoDims?.height ?? 0;

    // Infer smart backdrop color so dark standalone slides never flash a white theme backdrop
    const isStandaloneSlide = useMemo(
      () => Boolean(slide.standalone) || /<!doctype\s+html|<html[\s>]/i.test(slide.html || ''),
      [slide.standalone, slide.html]
    );
    const slideBackdrop = useMemo(() => {
      if (slide.backgroundOverride?.trim()) return slide.backgroundOverride.trim();
      if (isStandaloneSlide) {
        return detectStandaloneBackdrop(slide.html, slide.css) || theme.tokens.bg;
      }
      return theme.tokens.bg;
    }, [slide.backgroundOverride, isStandaloneSlide, slide.html, slide.css, theme.tokens.bg]);

    // Initialize reduced-motion synchronously to avoid a post-mount srcDoc rebuild/reload
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

    // ── Double-buffer state (Presentation, Audience, Studio Preview & Studio Edit) ──
    const [slots, setSlots] = useState<[BufferSlotState, BufferSlotState]>([
      EMPTY_SLOT,
      EMPTY_SLOT,
    ]);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [pendingSlot, setPendingSlot] = useState<0 | 1 | null>(null);
    const [firstRevealed, setFirstRevealed] = useState<boolean>(false);

    const slotsRef = useRef(slots);
    slotsRef.current = slots;
    const activeSlotRef = useRef<0 | 1>(activeSlot);
    activeSlotRef.current = activeSlot;
    const pendingSlotRef = useRef<0 | 1 | null>(pendingSlot);
    pendingSlotRef.current = pendingSlot;
    const pendingInstanceIdRef = useRef<string | null>(null);
    const pendingLayersRef = useRef<PendingLayersPayload | null>(null);
    const firstRevealedRef = useRef<boolean>(firstRevealed);
    firstRevealedRef.current = firstRevealed;
    const bufferLoadRevRef = useRef<number>(0);
    const fallbackTimerRef = useRef<number | null>(null);
    const cleanupTimerRef = useRef<number | null>(null);

    // Track HTML emitted directly from the active visual editor iframe so live drags/typing
    // never trigger a reload, while external edits / Undo / slide switches always pre-render cleanly.
    const lastVisualHtmlRef = useRef<string | null>(null);
    const prevDocMetaRef = useRef<string>('');
    const cachedDocSpecRef = useRef<DoubleBufferDocSpec | null>(null);

    // ── Single-iframe state (Thumbnails only) ──
    const singleInstanceId = useMemo(
      () => `slideino-${reactId}-${slide.id}`,
      [reactId, slide.id]
    );
    const [measuredSingleAutoDims, setMeasuredSingleAutoDims] = useState<Dims | null>(null);
    const [readySingleSrcDoc, setReadySingleSrcDoc] = useState<string>('');
    const singleSrcDocRef = useRef<string>('');
    const singleFallbackTimerRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        sendCommand(command: EditorCommand) {
          try {
            const activeIdx = activeSlotRef.current;
            const targetFrame = isDoubleBuffered
              ? activeIdx === 0
                ? slot0Ref.current
                : slot1Ref.current
              : singleIframeRef.current;
            const targetInstanceId = isDoubleBuffered
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
      [isDoubleBuffered, singleInstanceId]
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

    const clearBufferTimers = useCallback(() => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    }, []);

    // Guarantee any active timers, animations, or media inside all iframes stop immediately on unmount
    useEffect(() => {
      return () => {
        clearBufferTimers();
        if (singleFallbackTimerRef.current !== null) {
          window.clearTimeout(singleFallbackTimerRef.current);
          singleFallbackTimerRef.current = null;
        }
        blankIframeElement(singleIframeRef.current);
        blankIframeElement(slot0Ref.current);
        blankIframeElement(slot1Ref.current);
      };
    }, [clearBufferTimers]);

    // Reset runtime error when slide changes
    useEffect(() => {
      setRuntimeError(null);
    }, [slide.html, slide.css, slide.id]);

    const commitPendingSlot = useCallback(
      (targetSlot: 0 | 1, expectedInstanceId: string, reportedDims?: Dims | null) => {
        if (
          pendingSlotRef.current !== targetSlot ||
          pendingInstanceIdRef.current !== expectedInstanceId
        ) {
          return;
        }

        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        if (cleanupTimerRef.current !== null) {
          window.clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }

        pendingSlotRef.current = null;
        pendingInstanceIdRef.current = null;
        setPendingSlot(null);

        if (reportedDims && isAuto) {
          setSlots((prev) => {
            const slot = prev[targetSlot];
            if (slot.instanceId !== expectedInstanceId) return prev;
            const next: [BufferSlotState, BufferSlotState] = [prev[0], prev[1]];
            next[targetSlot] = { ...slot, measuredDims: reportedDims };
            return next;
          });
        }

        const prevSlot = activeSlotRef.current;
        activeSlotRef.current = targetSlot;
        firstRevealedRef.current = true;
        setActiveSlot(targetSlot);
        setFirstRevealed(true);

        // Flush any layers-change payload buffered while this slot was pre-rendering offscreen
        if (
          pendingLayersRef.current &&
          pendingLayersRef.current.instanceId === expectedInstanceId
        ) {
          const buffered = pendingLayersRef.current;
          pendingLayersRef.current = null;
          callbacksRef.current.onLayersChange?.(
            buffered.layers,
            buffered.slideDir,
            buffered.availableFonts
          );
        }

        if (prevSlot !== targetSlot) {
          const prevFrame = prevSlot === 0 ? slot0Ref.current : slot1Ref.current;
          if (prevFrame && document.activeElement === prevFrame) {
            try {
              prevFrame.blur();
            } catch {
              // Ignore blur error
            }
          }
          cleanupTimerRef.current = window.setTimeout(() => {
            cleanupTimerRef.current = null;
            if (activeSlotRef.current === prevSlot || pendingSlotRef.current === prevSlot) {
              return;
            }
            const retiringFrame = prevSlot === 0 ? slot0Ref.current : slot1Ref.current;
            blankIframeElement(retiringFrame);
            setSlots((prev) => {
              const next: [BufferSlotState, BufferSlotState] = [prev[0], prev[1]];
              next[prevSlot] = EMPTY_SLOT;
              return next;
            });
          }, OLD_SLOT_CLEANUP_MS);
        }
      },
      [isAuto]
    );

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    // ── Double-Buffered Load Pipeline (Presentation, Audience, Studio Preview & Studio Edit) ──
    const slideId = slide.id;
    const slideHtml = slide.html;
    const slideCss = slide.css;
    const slideBgOverride = slide.backgroundOverride;
    const slideStandalone = slide.standalone;

    const latestSlideMetaRef = useRef({
      title: slide.title,
      transition: slide.transition,
      backdrop: slideBackdrop,
    });
    latestSlideMetaRef.current = {
      title: slide.title,
      transition: slide.transition,
      backdrop: slideBackdrop,
    };

    const doubleBufferDocSpec = useMemo<DoubleBufferDocSpec | null>(() => {
      if (!isDoubleBuffered || !shouldMountIframe) return null;

      const metaKey = JSON.stringify({
        slideId,
        css: slideCss,
        bg: slideBgOverride,
        standalone: slideStandalone,
        themeId: theme.id,
        themeTokens: theme.tokens,
        themeCss: theme.customCss,
        libraries,
        customResources,
        sharedCssLen: sharedCss?.length || 0,
        editMode: Boolean(editMode),
        isAuto,
        staticAutoW,
        staticAutoH,
        prefersReducedMotion,
      });

      // If this update came straight from inside the active visual editor iframe (and nothing else changed),
      // keep the exact previous spec object reference so the iframe stays live with zero flicker or selection loss.
      if (
        editMode &&
        cachedDocSpecRef.current &&
        prevDocMetaRef.current === metaKey &&
        lastVisualHtmlRef.current !== null &&
        slideHtml === lastVisualHtmlRef.current
      ) {
        return cachedDocSpecRef.current;
      }

      // External change (slide switch, Undo/Redo, raw HTML edit, theme/mode change) -> clear live guard & pre-render
      lastVisualHtmlRef.current = null;
      prevDocMetaRef.current = metaKey;

      const nextSpec: DoubleBufferDocSpec = {
        slide: {
          id: slideId,
          title: latestSlideMetaRef.current.title,
          html: slideHtml,
          css: slideCss,
          notes: '',
          transition: latestSlideMetaRef.current.transition,
          backgroundOverride: slideBgOverride,
          standalone: slideStandalone,
        },
        theme,
        libraries,
        customResources,
        sharedCss,
        origin,
        editMode: Boolean(editMode),
        isAuto,
        staticAutoW,
        staticAutoH,
        prefersReducedMotion,
      };
      cachedDocSpecRef.current = nextSpec;
      return nextSpec;
    }, [
      isDoubleBuffered,
      shouldMountIframe,
      slideId,
      slideHtml,
      slideCss,
      slideBgOverride,
      slideStandalone,
      theme,
      libraries,
      customResources,
      sharedCss,
      origin,
      editMode,
      isAuto,
      staticAutoW,
      staticAutoH,
      prefersReducedMotion,
    ]);

    useEffect(() => {
      if (!isDoubleBuffered || !doubleBufferDocSpec) return;

      clearBufferTimers();

      // Before the very first slide has revealed, load directly into Slot 0;
      // afterward always pre-render the incoming slide in the hidden inactive slot.
      const targetSlot: 0 | 1 = !firstRevealedRef.current
        ? activeSlotRef.current
        : activeSlotRef.current === 0
        ? 1
        : 0;

      bufferLoadRevRef.current += 1;
      const slotInstanceId = `slideino-${reactId}-s${targetSlot}-r${bufferLoadRevRef.current}`;
      const baseDimsForDoc =
        doubleBufferDocSpec.staticAutoW > 0 && doubleBufferDocSpec.staticAutoH > 0
          ? {
              width: doubleBufferDocSpec.staticAutoW,
              height: doubleBufferDocSpec.staticAutoH,
            }
          : { width: 1280, height: 720 };

      const builtDoc = buildSlideDocument({
        slide: doubleBufferDocSpec.slide,
        theme: doubleBufferDocSpec.theme,
        libraries: doubleBufferDocSpec.libraries,
        customResources: doubleBufferDocSpec.customResources,
        sharedCss: doubleBufferDocSpec.sharedCss,
        instanceId: slotInstanceId,
        origin: doubleBufferDocSpec.origin,
        isThumbnail: false,
        editMode: doubleBufferDocSpec.editMode,
        autoSize: doubleBufferDocSpec.isAuto,
        autoBaseDims: baseDimsForDoc,
        prefersReducedMotion: doubleBufferDocSpec.prefersReducedMotion,
      });

      pendingSlotRef.current = targetSlot;
      pendingInstanceIdRef.current = slotInstanceId;
      pendingLayersRef.current = null;
      setPendingSlot(targetSlot);

      const meta = latestSlideMetaRef.current;
      const nextSlotState: BufferSlotState = {
        srcDoc: builtDoc,
        instanceId: slotInstanceId,
        slideId: doubleBufferDocSpec.slide.id,
        title: meta.title,
        transition: meta.transition,
        backdrop: meta.backdrop,
        staticDims:
          doubleBufferDocSpec.staticAutoW > 0 && doubleBufferDocSpec.staticAutoH > 0
            ? {
                width: doubleBufferDocSpec.staticAutoW,
                height: doubleBufferDocSpec.staticAutoH,
              }
            : null,
        measuredDims: null,
      };

      setSlots((prev) => {
        const next: [BufferSlotState, BufferSlotState] = [prev[0], prev[1]];
        next[targetSlot] = nextSlotState;
        return next;
      });

      // Emergency failsafe only — normal swap triggers on the slide's full-render `slide-ready` event
      fallbackTimerRef.current = window.setTimeout(() => {
        commitPendingSlot(targetSlot, slotInstanceId);
      }, READY_FALLBACK_MS);
    }, [isDoubleBuffered, doubleBufferDocSpec, reactId, clearBufferTimers, commitPendingSlot]);

    // ── Single-Iframe Document Pipeline (Thumbnails only) ──
    const singleSrcDoc = useMemo(() => {
      if (isDoubleBuffered || !shouldMountIframe) return '';

      const baseDimsForDoc =
        staticAutoW > 0 && staticAutoH > 0
          ? { width: staticAutoW, height: staticAutoH }
          : { width: 1280, height: 720 };

      return buildSlideDocument({
        slide: {
          id: slideId,
          title: latestSlideMetaRef.current.title,
          html: slideHtml,
          css: slideCss,
          notes: '',
          transition: latestSlideMetaRef.current.transition,
          backgroundOverride: slideBgOverride,
          standalone: slideStandalone,
        },
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
      isDoubleBuffered,
      shouldMountIframe,
      slideId,
      slideHtml,
      slideCss,
      slideBgOverride,
      slideStandalone,
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
    // Derived synchronously during render so thumbnails NEVER flash 1 frame of unloaded content
    const isSingleReady = Boolean(singleSrcDoc) && readySingleSrcDoc === singleSrcDoc;

    useEffect(() => {
      if (isDoubleBuffered) return;
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
    }, [isDoubleBuffered, singleSrcDoc, isAuto]);

    // ── Unified postMessage Listener (Validates exact source iframe & instanceId) ──
    useEffect(() => {
      if (!shouldMountIframe) return;

      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.source !== 'slideino-frame') return;

        // 1. Double-buffered mode (Slot 0 & Slot 1)
        if (isDoubleBuffered) {
          const w0 = slot0Ref.current?.contentWindow;
          const w1 = slot1Ref.current?.contentWindow;
          let slotIndex: 0 | 1 | null = null;
          if (event.source && event.source === w0) slotIndex = 0;
          else if (event.source && event.source === w1) slotIndex = 1;
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
              const next: [BufferSlotState, BufferSlotState] = [prev[0], prev[1]];
              next[slotIndex!] = { ...cur, measuredDims: clamped };
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
            commitPendingSlot(slotIndex, data.instanceId, reportedDims);
            return;
          }

          // Buffer initial layers-change from a pre-rendering edit-mode slot so it flushes on swap
          if (
            data.type === 'layers-change' &&
            slotIndex === pendingSlotRef.current &&
            data.instanceId === pendingInstanceIdRef.current &&
            data.payload &&
            Array.isArray(data.payload.layers)
          ) {
            const dir = data.payload.slideDir === 'rtl' ? 'rtl' : 'ltr';
            const fonts = Array.isArray(data.payload.availableFonts)
              ? data.payload.availableFonts.filter((f: unknown): f is string => typeof f === 'string')
              : [];
            pendingLayersRef.current = {
              instanceId: data.instanceId,
              layers: data.payload.layers,
              slideDir: dir,
              availableFonts: fonts,
            };
            return;
          }

          // Only accept interaction, editor, and error events from the currently active visible slot
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
            lastVisualHtmlRef.current = data.payload.html;
            cb.onVisualHtmlChange(data.payload.html, Boolean(data.payload.commit));
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
    }, [shouldMountIframe, isDoubleBuffered, isAuto, singleInstanceId, commitPendingSlot]);

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
      ? isDoubleBuffered
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
    const stageBackdrop = isDoubleBuffered
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
            isDoubleBuffered ? (
              ([0, 1] as const).map((slotIndex) => {
                const slot = slots[slotIndex];
                const isActive = slotIndex === activeSlot;
                const isPending = slotIndex === pendingSlot;
                const hasContent = Boolean(slot.srcDoc);
                const slotDims: Dims = isFluid
                  ? { width: 1280, height: 720 }
                  : isAuto
                  ? slot.measuredDims || slot.staticDims || baseDims
                  : ASPECT_RATIO_DIMENSIONS[aspectRatio];
                const slotScale = computeScaleForDims(slotDims);
                const useFade =
                  !prefersReducedMotion && !editMode && slot.transition !== 'none';

                // Active slot reveals cleanly on top (zIndex: 2) only once ready;
                // Retiring previous slot stays opaque underneath (zIndex: 1) during swap
                // so no intermediate or blank frame ever shows, then blanks after OLD_SLOT_CLEANUP_MS.
                const slotOpacity = isActive
                  ? firstRevealed
                    ? 1
                    : 0
                  : isPending || !hasContent
                  ? 0
                  : 1;

                const slotTransition =
                  isActive && firstRevealed && useFade
                    ? 'opacity 140ms ease-out'
                    : 'none';

                return (
                  <div
                    key={slotIndex}
                    aria-hidden={!isActive}
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      zIndex: isActive ? 2 : 1,
                      opacity: slotOpacity,
                      transition: slotTransition,
                      pointerEvents: isActive && firstRevealed ? 'auto' : 'none',
                      backgroundColor: slot.backdrop || stageBackdrop,
                    }}
                  >
                    <iframe
                      ref={slotIndex === 0 ? slot0Ref : slot1Ref}
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
