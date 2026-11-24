import React, {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
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

export const SlideFrame = forwardRef<SlideFrameHandle, SlideFrameProps>(
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
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const reactId = useId();
    const instanceId = useMemo(
      () => `slideino-${reactId}-${slide.id}`,
      [reactId, slide.id]
    );

    // Track HTML emitted directly from the visual editor iframe so we never reload/flicker on self-edits,
    // while guaranteeing external reverts (like Undo back to the initial HTML) ALWAYS reload the iframe.
    const lastVisualHtmlRef = useRef<string | null>(null);
    const iframeMutatedLiveRef = useRef<boolean>(false);
    const reloadRevRef = useRef<number>(0);
    const prevDocMetaRef = useRef<string>('');
    const cachedSrcDocRef = useRef<string>('');

    const isAuto = aspectRatio === 'auto';
    const staticAutoDims = useMemo(
      () => (isAuto ? detectSlideStaticDimensions(slide.html, slide.css) : null),
      [isAuto, slide.html, slide.css]
    );

    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [measuredAutoDims, setMeasuredAutoDims] = useState<{
      width: number;
      height: number;
    } | null>(null);
    const [runtimeError, setRuntimeError] = useState<string | null>(null);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    // Native loading="lazy" is ignored on srcDoc iframes; gate thumbnails with IntersectionObserver + idle yield
    const [inViewport, setInViewport] = useState(!isThumbnail);
    const [idleReady, setIdleReady] = useState(!isThumbnail);
    const shouldMountIframe = !isThumbnail || (inViewport && idleReady);

    useImperativeHandle(
      ref,
      () => ({
        sendCommand(command: EditorCommand) {
          try {
            iframeRef.current?.contentWindow?.postMessage(
              {
                source: 'slideino-host',
                instanceId,
                command,
              },
              '*'
            );
          } catch {
            // Ignore iframe not ready
          }
        },
      }),
      [instanceId]
    );

    useEffect(() => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mq.matches);
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setContainerSize({ width, height });
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

    // Guarantee any active timers, animations, or media inside the slide iframe stop immediately on unmount
    useEffect(() => {
      return () => {
        const frame = iframeRef.current;
        if (frame) {
          try {
            frame.srcdoc = '';
            frame.src = 'about:blank';
          } catch {
            // Ignore cross-origin / detached frame cleanup errors
          }
        }
      };
    }, []);

    // Reset error when slide changes
    useEffect(() => {
      setRuntimeError(null);
    }, [slide.html, slide.css, slide.id]);

    // Listen for validated postMessage events from this specific iframe only
    useEffect(() => {
      if (isThumbnail && !isAuto) return;
      const onMessage = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.source !== 'slideino-frame' || data.instanceId !== instanceId) return;

        if (
          data.type === 'content-size' &&
          isAuto &&
          data.payload &&
          typeof data.payload.width === 'number' &&
          typeof data.payload.height === 'number'
        ) {
          const w = Math.max(480, Math.min(3840, Math.round(data.payload.width)));
          const h = Math.max(320, Math.min(2400, Math.round(data.payload.height)));
          setMeasuredAutoDims((prev) =>
            prev && Math.abs(prev.width - w) < 4 && Math.abs(prev.height - h) < 4
              ? prev
              : { width: w, height: h }
          );
          return;
        }

        if (isThumbnail) return;

        if (
          data.type === 'keydown' &&
          onForwardKey &&
          data.payload &&
          typeof data.payload.key === 'string'
        ) {
          onForwardKey(data.payload.key, Boolean(data.payload.shiftKey));
        } else if (
          data.type === 'runtime-error' &&
          data.payload &&
          typeof data.payload.message === 'string'
        ) {
          setRuntimeError(data.payload.message.slice(0, 200));
        } else if (
          data.type === 'dom-sync' &&
          onVisualHtmlChange &&
          data.payload &&
          typeof data.payload.html === 'string'
        ) {
          iframeMutatedLiveRef.current = true;
          lastVisualHtmlRef.current = data.payload.html;
          onVisualHtmlChange(data.payload.html, Boolean(data.payload.commit));
        } else if (data.type === 'element-select' && onElementSelect && data.payload) {
          onElementSelect(
            data.payload.element || null,
            data.payload.multiSelection || null
          );
        } else if (
          data.type === 'layers-change' &&
          onLayersChange &&
          data.payload &&
          Array.isArray(data.payload.layers)
        ) {
          const dir = data.payload.slideDir === 'rtl' ? 'rtl' : 'ltr';
          const fonts = Array.isArray(data.payload.availableFonts)
            ? data.payload.availableFonts.filter((f: unknown): f is string => typeof f === 'string')
            : [];
          onLayersChange(data.payload.layers, dir, fonts);
        } else if (data.type === 'editor-undo' && onEditorUndo) {
          onEditorUndo();
        } else if (data.type === 'editor-redo' && onEditorRedo) {
          onEditorRedo();
        }
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [
      instanceId,
      isThumbnail,
      isAuto,
      onForwardKey,
      onVisualHtmlChange,
      onElementSelect,
      onLayersChange,
      onEditorUndo,
      onEditorRedo,
    ]);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const srcDoc = useMemo(() => {
      if (!shouldMountIframe) return '';
      const metaKey = JSON.stringify({
        slideId: slide.id,
        css: slide.css,
        bg: slide.backgroundOverride,
        standalone: slide.standalone,
        themeId: theme.id,
        themeTokens: theme.tokens,
        themeCss: theme.customCss,
        libraries,
        customResources,
        sharedCssLen: sharedCss?.length || 0,
        editMode: Boolean(editMode && !isThumbnail),
        isThumbnail,
        isAuto,
        prefersReducedMotion,
      });

      // If this update came straight from inside the visual editor iframe (and nothing else changed),
      // keep the existing srcDoc so the iframe stays live with zero flicker or selection loss.
      if (
        editMode &&
        !isThumbnail &&
        cachedSrcDocRef.current &&
        prevDocMetaRef.current === metaKey &&
        lastVisualHtmlRef.current !== null &&
        slide.html === lastVisualHtmlRef.current
      ) {
        return cachedSrcDocRef.current;
      }

      // External change (slide switch, Undo/Redo, raw HTML edit, theme/mode change) -> clear guard & rebuild
      const hadLiveMutation = iframeMutatedLiveRef.current;
      lastVisualHtmlRef.current = null;
      iframeMutatedLiveRef.current = false;
      prevDocMetaRef.current = metaKey;

      let built = buildSlideDocument({
        slide,
        theme,
        libraries,
        customResources,
        sharedCss,
        instanceId,
        origin,
        isThumbnail,
        editMode: Boolean(editMode && !isThumbnail),
        autoSize: isAuto,
        autoBaseDims: staticAutoDims || { width: 1280, height: 720 },
        prefersReducedMotion,
      });

      // If the iframe DOM was mutated live during visual editing and an Undo/Revert brings slide.html
      // back to the exact initial string, React would skip updating srcDoc unless the string differs.
      if (hadLiveMutation && built === cachedSrcDocRef.current) {
        reloadRevRef.current += 1;
        built = `${built}\n<!-- slideino-rev:${reloadRevRef.current} -->`;
      }

      cachedSrcDocRef.current = built;
      return built;
    }, [
      slide,
      theme,
      libraries,
      customResources,
      sharedCss,
      instanceId,
      origin,
      isThumbnail,
      editMode,
      isAuto,
      staticAutoDims,
      prefersReducedMotion,
      shouldMountIframe,
    ]);

    // Reset live measured dimensions whenever the slide document reloads or aspectRatio changes
    useEffect(() => {
      setMeasuredAutoDims(null);
    }, [srcDoc, isAuto]);

    const isFluid = aspectRatio === 'fluid';
    const isManualZoom = !isThumbnail && !isFluid && typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0;
    const baseDims = isFluid
      ? { width: 1280, height: 720 }
      : isAuto
      ? measuredAutoDims || staticAutoDims || { width: 1280, height: 720 }
      : ASPECT_RATIO_DIMENSIONS[aspectRatio];

    const scale = useMemo(() => {
      if (isManualZoom) return zoom as number;
      if (isFluid || containerSize.width === 0 || containerSize.height === 0) return 1;
      return Math.min(
        containerSize.width / baseDims.width,
        containerSize.height / baseDims.height
      );
    }, [isManualZoom, zoom, isFluid, containerSize.width, containerSize.height, baseDims.width, baseDims.height]);

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

    const stageWidth = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.width * scale))}px`;
    const stageHeight = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.height * scale))}px`;

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
            isManualZoom ? 'm-auto shrink-0 shadow-lg rounded-lg ring-1 ring-slate-300/80 dark:ring-slate-700/80' : ''
          }`}
          style={{
            width: stageWidth,
            height: stageHeight,
            backgroundColor: slide.backgroundOverride || theme.tokens.bg,
          }}
        >
          {shouldMountIframe ? (
            <iframe
              ref={iframeRef}
              title={isThumbnail ? `Thumbnail: ${slide.title}` : `Slide: ${slide.title}`}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              loading={isThumbnail ? 'lazy' : 'eager'}
              tabIndex={isThumbnail ? -1 : 0}
              className={`border-0 block ${isThumbnail ? 'pointer-events-none select-none' : ''}`}
              style={
                isFluid
                  ? { width: '100%', height: '100%' }
                  : {
                      width: `${baseDims.width}px`,
                      height: `${baseDims.height}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }
              }
            />
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
              className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/90 text-red-100 text-xs border border-red-800/70 backdrop-blur-sm"
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

SlideFrame.displayName = 'SlideFrame';
