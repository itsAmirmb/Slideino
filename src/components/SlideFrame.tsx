import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  CustomResource,
  LibraryConfig,
  Slide,
  SlideTheme,
} from '../types/slideino';
import { buildSlideDocument } from '../utils/slideRuntime';

interface SlideFrameProps {
  slide: Slide;
  theme: SlideTheme;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  aspectRatio: AspectRatio;
  isThumbnail?: boolean;
  onForwardKey?: (key: string, shiftKey: boolean) => void;
  className?: string;
}

export const SlideFrame: React.FC<SlideFrameProps> = ({
  slide,
  theme,
  libraries,
  customResources,
  sharedCss,
  aspectRatio,
  isThumbnail = false,
  onForwardKey,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reactId = useId();
  const instanceId = useMemo(
    () => `slideino-${reactId}-${slide.id}`,
    [reactId, slide.id]
  );

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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

  // Reset error when slide code changes
  useEffect(() => {
    setRuntimeError(null);
  }, [slide.html, slide.css, slide.id]);

  // Listen for validated postMessage events from this specific iframe only
  useEffect(() => {
    if (isThumbnail) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'slideino-frame' || data.instanceId !== instanceId) return;

      if (data.type === 'keydown' && onForwardKey && data.payload && typeof data.payload.key === 'string') {
        onForwardKey(data.payload.key, Boolean(data.payload.shiftKey));
      } else if (data.type === 'runtime-error' && data.payload && typeof data.payload.message === 'string') {
        setRuntimeError(data.payload.message.slice(0, 200));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [instanceId, isThumbnail, onForwardKey]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const srcDoc = useMemo(
    () =>
      buildSlideDocument({
        slide,
        theme,
        libraries,
        customResources,
        sharedCss,
        instanceId,
        origin,
        isThumbnail,
        prefersReducedMotion,
      }),
    [slide, theme, libraries, customResources, sharedCss, instanceId, origin, isThumbnail, prefersReducedMotion]
  );

  const isFluid = aspectRatio === 'fluid';
  const baseDims = isFluid ? { width: 1280, height: 720 } : ASPECT_RATIO_DIMENSIONS[aspectRatio];

  const scale = useMemo(() => {
    if (isFluid || containerSize.width === 0 || containerSize.height === 0) return 1;
    return Math.min(containerSize.width / baseDims.width, containerSize.height / baseDims.height);
  }, [isFluid, containerSize.width, containerSize.height, baseDims.width, baseDims.height]);

  const stageWidth = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.width * scale))}px`;
  const stageHeight = isFluid ? '100%' : `${Math.max(1, Math.floor(baseDims.height * scale))}px`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
    >
      <div
        className="relative overflow-hidden transition-shadow duration-150"
        style={{
          width: stageWidth,
          height: stageHeight,
          backgroundColor: slide.backgroundOverride || theme.tokens.bg,
        }}
      >
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
};
