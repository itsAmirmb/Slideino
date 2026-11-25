import {
  ASPECT_RATIO_DIMENSIONS,
  Deck,
  SlideTheme,
} from '../types/slideino';
import {
  buildSlideDocument,
  detectSlideStaticDimensions,
  detectStandaloneBackdrop,
} from './slideRuntime';

export interface PresentationExportOptions {
  includeAnnotations: boolean;
  includePresenterTools: boolean;
  includeGridAndBlackout: boolean;
  includeHiddenSlides: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: PresentationExportOptions = {
  includeAnnotations: true,
  includePresenterTools: true,
  includeGridAndBlackout: true,
  includeHiddenSlides: false,
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read blob'));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function resolveAssetToDataUrl(
  assetPath: string,
  origin: string,
  cache: Map<string, string>
): Promise<string | null> {
  if (cache.has(assetPath)) return cache.get(assetPath)!;
  try {
    const fetchUrl = assetPath.startsWith('http')
      ? assetPath
      : `${origin.replace(/\/$/, '')}${assetPath.startsWith('/') ? '' : '/'}${assetPath}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Skip very large non-image assets unexpectedly matched
    if (blob.size > 12 * 1024 * 1024) return null;
    const dataUrl = await blobToDataUrl(blob);
    cache.set(assetPath, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Inlines same-origin local image assets (e.g. /src/assets/..., /assets/...) as embedded data URIs
 * so the exported standalone HTML presentation works 100% offline when double-clicked from disk.
 */
async function inlineLocalAssets(
  text: string,
  origin: string,
  cache: Map<string, string>
): Promise<string> {
  if (!text || !origin) return text;
  const assetPattern =
    /(?:\/(?:src\/)?assets\/[^"'()\s<>?#]+\.(?:png|jpe?g|gif|webp|svg|avif|ico))/gi;
  const matches = Array.from(new Set(text.match(assetPattern) || []));
  if (matches.length === 0) return text;

  let result = text;
  for (const path of matches) {
    const dataUrl = await resolveAssetToDataUrl(path, origin, cache);
    if (dataUrl) {
      result = result.split(path).join(dataUrl);
    }
  }
  return result;
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportStandalonePresentationHtml(
  deck: Deck,
  theme: SlideTheme,
  origin: string,
  options: PresentationExportOptions = DEFAULT_EXPORT_OPTIONS
): Promise<{ html: string; slideCount: number; byteSize: number }> {
  const candidates = options.includeHiddenSlides
    ? deck.slides
    : deck.slides.filter((s) => !s.hidden);
  const slidesToExport = candidates.length > 0 ? candidates : deck.slides;

  const assetCache = new Map<string, string>();
  const inlinedSharedCss = deck.sharedCss
    ? await inlineLocalAssets(deck.sharedCss, origin, assetCache)
    : '';

  const isAuto = deck.aspectRatio === 'auto';
  const dims =
    deck.aspectRatio === 'fluid'
      ? { width: 1280, height: 720, fluid: true, auto: false }
      : deck.aspectRatio === 'auto'
      ? { width: 1280, height: 720, fluid: false, auto: true }
      : { ...ASPECT_RATIO_DIMENSIONS[deck.aspectRatio], fluid: false, auto: false };

  const compiledSlides = [];
  for (let idx = 0; idx < slidesToExport.length; idx++) {
    const rawSlide = slidesToExport[idx];
    const inlinedHtml = await inlineLocalAssets(rawSlide.html || '', origin, assetCache);
    const inlinedCss = await inlineLocalAssets(rawSlide.css || '', origin, assetCache);
    const slide = { ...rawSlide, html: inlinedHtml, css: inlinedCss };

    const slideDims = isAuto
      ? detectSlideStaticDimensions(slide.html, slide.css) || { width: 1280, height: 720 }
      : { width: dims.width, height: dims.height };

    // Omit sharedCss per slide to avoid repeating multi-MB @font-face stylesheets N times;
    // the standalone player injects DECK.sharedCss once dynamically into each slide's <head>.
    const doc = buildSlideDocument({
      slide,
      theme,
      libraries: deck.libraries,
      customResources: deck.customResources,
      sharedCss: undefined,
      instanceId: `export-${idx}`,
      origin,
      isThumbnail: false,
      autoSize: isAuto,
      autoBaseDims: slideDims,
    });

    const isStandaloneSlide =
      Boolean(slide.standalone) || /<!doctype\s+html|<html[\s>]/i.test(slide.html || '');
    const resolvedBg =
      slide.backgroundOverride?.trim() ||
      (isStandaloneSlide ? detectStandaloneBackdrop(slide.html, slide.css) : null) ||
      theme.tokens.bg;

    compiledSlides.push({
      id: slide.id,
      title: slide.title,
      notes: options.includePresenterTools ? slide.notes || '' : '',
      transition: slide.transition || deck.defaultTransition || 'fade',
      bg: resolvedBg,
      width: slideDims.width,
      height: slideDims.height,
      doc,
    });
  }

  const payload = {
    title: deck.title,
    themeBg: theme.tokens.bg,
    accent: theme.tokens.accent,
    dims,
    options,
    sharedCss: inlinedSharedCss.replace(/<\/style/gi, '<\\/style'),
    slides: compiledSlides,
  };

  // Safe JSON script block (avoids </script> breakout and parses significantly faster than a JS literal)
  const safeJson = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const safeTitle = escapeHtmlText(deck.title || 'Presentation');
  const accentColor = theme.tokens.accent || '#3b82f6';
  const stageBg = theme.tokens.bg || '#0b0f17';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — Slideino Presentation</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #020617; color: #f1f5f9;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0, 0, 0, 0); white-space: nowrap;
    }
    .progress-track {
      position: fixed; top: 0; left: 0; right: 0; height: 2px;
      background: rgba(30, 41, 59, 0.9); z-index: 40;
    }
    .progress-fill {
      height: 100%; width: 0%; background: ${accentColor};
      transition: width 200ms ease;
    }

    /* Main Stage & Presenter Split Layout */
    #app {
      position: fixed; inset: 0; top: 2px;
      display: flex; flex-direction: column;
    }
    #stage-layout {
      flex: 1; min-height: 0; display: flex; position: relative;
      padding: 12px; gap: 16px;
    }
    #stage-layout.is-presenter { padding: 18px; }
    #stage-column {
      flex: 1; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; gap: 10px;
    }
    #presenter-header {
      display: none; align-items: center; justify-content: space-between;
      font-size: 12px; color: #94a3b8;
    }
    #stage-layout.is-presenter #presenter-header { display: flex; }

    #stage-container {
      flex: 1; min-width: 0; min-height: 0;
      display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
    }
    #stage-layout.is-presenter #stage-container {
      border-radius: 12px; border: 1px solid #1e293b; background: #000000; padding: 8px;
    }

    #stage-wrap {
      position: relative; overflow: hidden;
      background: ${stageBg};
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      transition: opacity 220ms ease, transform 220ms ease;
    }
    #stage-wrap.anim-fade { opacity: 0; }
    #stage-wrap.anim-slide { opacity: 0; transform: translateX(28px); }
    #stage-wrap.anim-slide-back { opacity: 0; transform: translateX(-28px); }
    #stage-wrap.anim-zoom { opacity: 0; transform: scale(0.95); }

    #frame {
      border: 0; display: block; transform-origin: top left;
    }

    /* Annotation & Laser Overlay locked strictly to #stage-wrap */
    #ann-layer {
      position: absolute; inset: 0; z-index: 15; touch-action: none;
      pointer-events: none;
    }
    #ann-layer.is-active { pointer-events: auto; }
    #ann-layer.cursor-none { cursor: none; }
    #ann-layer.cursor-crosshair { cursor: crosshair; }
    #ann-layer canvas {
      position: absolute; inset: 0; width: 100%; height: 100%; display: block;
    }
    #laser-canvas { pointer-events: none; }
    #laser-dot {
      position: absolute; top: 0; left: 0; width: 28px; height: 28px;
      margin-left: -14px; margin-top: -14px; border-radius: 9999px;
      pointer-events: none; opacity: 0; will-change: transform;
    }
    #eraser-ring {
      position: absolute; top: 0; left: 0; width: 26px; height: 26px;
      margin-left: -13px; margin-top: -13px; border-radius: 9999px;
      border: 2px solid rgba(255, 255, 255, 0.9);
      background: rgba(255, 255, 255, 0.15);
      box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.75);
      pointer-events: none; opacity: 0; will-change: transform;
    }

    /* Presenter Sidebar */
    #presenter-sidebar {
      display: none; width: 340px; max-width: 34vw; flex-shrink: 0;
      flex-direction: column; gap: 14px; min-height: 0;
    }
    #stage-layout.is-presenter #presenter-sidebar { display: flex; }
    @media (max-width: 960px) {
      #stage-layout.is-presenter { flex-direction: column; overflow-y: auto; }
      #presenter-sidebar { width: 100%; max-width: 100%; }
    }
    .p-card {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;
      padding: 14px; display: flex; flex-direction: column; gap: 10px;
    }
    .p-timer-row {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    .p-timer-val {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums;
      color: #ffffff;
    }
    .p-btn-sm {
      background: #1e293b; color: #e2e8f0; border: 0; border-radius: 8px;
      padding: 6px 10px; font-size: 12px; cursor: pointer; display: inline-flex;
      align-items: center; justify-content: center; text-decoration: none; gap: 5px;
    }
    .p-btn-sm:hover { background: #334155; }
    .p-btn-primary {
      background: #2563eb; color: #ffffff; border: 0; border-radius: 8px;
      height: 32px; padding: 0 12px; font-size: 12px; font-weight: 500;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; text-decoration: none; white-space: nowrap;
    }
    .p-btn-primary:hover { background: #3b82f6; }
    .p-sync-dot {
      width: 8px; height: 8px; border-radius: 9999px; background: #10b981;
      display: none; flex-shrink: 0;
    }
    .p-sync-dot.is-live { display: inline-block; }
    #p-blackout-preview {
      position: absolute; inset: 0; z-index: 22; background: rgba(0, 0, 0, 0.86);
      display: none; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; cursor: pointer; text-align: center; padding: 16px;
    }
    #p-blackout-preview.is-open { display: flex; }
    #audience-banner {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 36; display: none; align-items: center; gap: 10px;
      padding: 8px 14px; border-radius: 12px;
      background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(51, 65, 85, 0.85);
      color: #e2e8f0; font-size: 12px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      white-space: nowrap; max-width: 94vw;
    }
    #audience-banner.is-open { display: flex; }
    .p-next-box {
      position: relative; width: 100%; aspect-ratio: 16 / 9;
      border-radius: 8px; overflow: hidden; border: 1px solid #1e293b;
      background: #000000; display: flex; align-items: center; justify-content: center;
    }
    #next-frame {
      border: 0; display: block; transform-origin: top left; pointer-events: none;
    }
    .p-notes-card { flex: 1; min-height: 150px; overflow: hidden; }
    #notes-body {
      flex: 1; overflow-y: auto; white-space: pre-wrap; line-height: 1.6;
      color: #e2e8f0; font-size: 16px; user-select: text; -webkit-user-select: text;
    }

    /* Floating Two-Tier Compact Dock */
    #dock-wrap {
      position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%) translateY(0);
      z-index: 35; display: flex; flex-direction: column; align-items: center; gap: 6px;
      max-width: 96vw; transition: opacity 200ms ease, transform 200ms ease;
    }
    #dock-wrap.is-hidden { opacity: 0; transform: translateX(-50%) translateY(8px); pointer-events: none; }
    #dock-reveal {
      position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
      z-index: 35; height: 28px; padding: 0 10px; border-radius: 8px;
      border: 1px solid rgba(51, 65, 85, 0.75); background: rgba(15, 23, 42, 0.85);
      color: #cbd5e1; cursor: pointer; display: none; align-items: center; justify-content: center;
      opacity: 0.16; backdrop-filter: blur(8px); transition: opacity 180ms ease, background 150ms ease, color 150ms ease;
    }
    #dock-reveal.is-open { display: inline-flex; }
    #dock-reveal:hover, #dock-reveal:focus-visible { opacity: 1; background: #0f172a; color: #ffffff; }
    .hud-bar {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 8px; border-radius: 12px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(51, 65, 85, 0.8);
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      max-width: 96vw; overflow-x: auto;
    }
    .hud-sub {
      display: none; flex-wrap: wrap; justify-content: center; gap: 4px;
      padding: 4px 8px; border-radius: 12px;
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid rgba(51, 65, 85, 0.85);
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    }
    .hud-sub.is-open { display: flex; align-items: center; }
    .hud-sep {
      width: 1px; height: 18px; background: #334155; margin: 0 3px; flex-shrink: 0;
    }
    .hud-btn {
      width: 34px; height: 34px; border: 0; border-radius: 8px;
      background: transparent; color: #cbd5e1; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 140ms ease, color 140ms ease;
    }
    .hud-btn.sm { width: 28px; height: 28px; }
    .hud-btn:hover:not(:disabled) { background: #1e293b; color: #ffffff; }
    .hud-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .hud-btn.active-blue { background: #2563eb; color: #ffffff; }
    .hud-btn.active-red { background: #dc2626; color: #ffffff; }
    .hud-counter {
      padding: 0 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px; font-variant-numeric: tabular-nums; color: #e2e8f0;
      white-space: nowrap; flex-shrink: 0;
    }
    .swatch {
      width: 16px; height: 16px; border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.3); cursor: pointer;
      padding: 0; flex-shrink: 0; transition: transform 120ms ease;
    }
    .swatch:hover { transform: scale(1.14); }
    .swatch.is-selected {
      transform: scale(1.16);
      box-shadow: 0 0 0 2px #0f172a, 0 0 0 4px #ffffff;
    }
    .size-btn {
      width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #94a3b8; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .size-btn:hover { background: #1e293b; color: #ffffff; }
    .size-btn.is-selected { background: #334155; color: #ffffff; }
    .size-dot { border-radius: 9999px; background: currentColor; display: block; }

    /* Blackout, Ended Screen, Grid & Shortcuts Overlays */
    #blackout {
      position: fixed; inset: 0; z-index: 45; background: #000000;
      display: none; align-items: flex-end; justify-content: center;
      padding-bottom: 32px; cursor: pointer; font-size: 12px; color: #475569;
    }
    #blackout.is-open { display: flex; }
    #ended-screen {
      position: fixed; inset: 0; z-index: 46; background: #020617;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 24px; gap: 12px;
    }
    #ended-screen.is-open { display: flex; }

    .modal-backdrop {
      position: fixed; inset: 0; z-index: 50;
      background: rgba(2, 6, 23, 0.92); backdrop-filter: blur(8px);
      display: none; padding: 28px; overflow-y: auto;
    }
    .modal-backdrop.is-open { display: block; }
    #help-modal.is-open {
      display: flex; align-items: center; justify-content: center;
    }
    .grid-inner { max-width: 1180px; margin: 0 auto; }
    .grid-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px; gap: 16px;
    }
    .grid-cards {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 18px;
    }
    .grid-card {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;
      overflow: hidden; cursor: pointer; text-align: left; padding: 0;
      color: inherit; transition: border-color 150ms ease;
    }
    .grid-card:hover { border-color: #64748b; }
    .grid-card.is-current { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35); }
    .grid-thumb {
      position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000000;
      overflow: hidden;
    }
    .grid-thumb iframe {
      border: 0; display: block; transform-origin: top left; pointer-events: none;
    }
    .grid-meta {
      padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
      gap: 8px; font-size: 12px;
    }
    .help-card {
      width: 100%; max-width: 440px; background: #0f172a;
      border: 1px solid #1e293b; border-radius: 14px; padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    }
    .help-list {
      margin: 14px 0 0; padding: 0; list-style: none;
    }
    .help-list li {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 8px 0; border-top: 1px solid #1e293b; font-size: 13px; color: #cbd5e1;
    }
    .help-list li:first-child { border-top: 0; }
    .help-key {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; color: #94a3b8;
    }

    @media print {
      #dock-wrap, #dock-reveal, .progress-track, #presenter-sidebar, #presenter-header { display: none !important; }
      html, body, #app, #stage-layout, #stage-container {
        position: static !important; overflow: visible !important; background: #ffffff !important;
      }
    }
  </style>
</head>
<body>
  <div class="progress-track"><div class="progress-fill" id="progress"></div></div>
  <div id="live-region" class="sr-only" aria-live="polite" aria-atomic="true"></div>

  <main id="app" role="application" aria-label="${safeTitle}">
    <div id="stage-layout">
      <div id="stage-column">
        <div id="presenter-header">
          <span id="p-slide-title">Slide</span>
          <span id="p-slide-counter" style="font-family: monospace;">01 / 01</span>
        </div>
        <div id="stage-container">
          <div id="stage-wrap">
            <iframe id="frame" sandbox="allow-scripts" title="Active slide"></iframe>
            <div id="ann-layer" aria-hidden="true">
              <canvas id="draw-canvas"></canvas>
              <canvas id="laser-canvas"></canvas>
              <div id="laser-dot"></div>
              <div id="eraser-ring"></div>
            </div>
            <div id="p-blackout-preview" role="button" tabindex="0">
              <span style="font-size:12px; font-weight:600; color:#e2e8f0;">Audience screen blacked out</span>
              <span style="font-size:11px; color:#94a3b8;">Press B or click here to resume</span>
            </div>
          </div>
        </div>
      </div>

      <aside id="presenter-sidebar" aria-label="Presenter tools">
        <div class="p-card" id="p-audience-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="display:flex; align-items:center; gap:7px; min-width:0;">
              <span class="p-sync-dot" id="p-sync-dot" aria-hidden="true"></span>
              <span style="font-size:12px; font-weight:600; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="p-sync-label">Keep notes private</span>
            </div>
            <button type="button" class="p-btn-sm" id="btn-copy-audience" style="padding:4px 8px; font-size:11px;">Copy Link</button>
          </div>
          <div style="font-size:11px; color:#94a3b8; line-height:1.5;">
            Open a clean slide-only Audience Window for your projector (Extended Display) or share only that tab on Zoom/Meet. Slides, blackout, laser &amp; ink sync live.
          </div>
          <a id="btn-open-audience" class="p-btn-primary" href="?view=audience" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            <span id="btn-open-audience-text">Open Audience Window</span>
          </a>
        </div>
        <div class="p-card">
          <div class="p-timer-row">
            <span class="p-timer-val" id="timer-val">00:00</span>
            <div style="display:flex; gap:6px;">
              <button type="button" class="p-btn-sm" id="timer-toggle">Pause</button>
              <button type="button" class="p-btn-sm" id="timer-reset">Reset</button>
            </div>
          </div>
        </div>
        <div class="p-card">
          <div style="font-size:12px; color:#94a3b8;" id="next-label">Next Slide</div>
          <div class="p-next-box" id="next-box">
            <iframe id="next-frame" sandbox="allow-scripts" title="Next slide preview" tabindex="-1"></iframe>
            <div id="next-end" style="display:none; font-size:12px; color:#64748b;">End of presentation</div>
          </div>
        </div>
        <div class="p-card p-notes-card">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:12px; font-weight:600; color:#cbd5e1;">Speaker Notes</span>
            <div style="display:flex; gap:4px;">
              <button type="button" class="p-btn-sm" id="notes-dec" aria-label="Decrease note font size">A-</button>
              <button type="button" class="p-btn-sm" id="notes-inc" aria-label="Increase note font size">A+</button>
            </div>
          </div>
          <div id="notes-body">No speaker notes for this slide.</div>
        </div>
      </aside>
    </div>
  </main>

  <div id="audience-banner" role="status">
    <span class="p-sync-dot is-live" id="aud-banner-dot" style="background:#f59e0b;"></span>
    <span id="aud-banner-text">Audience Window · Ready — Move to projector or share this tab, then press <strong>F</strong></span>
    <button type="button" class="p-btn-sm" id="aud-banner-close" style="padding:3px 6px; font-size:11px;" aria-label="Dismiss notice">✕</button>
  </div>

  <button type="button" id="dock-reveal" title="Show Toolbar (T)" aria-label="Show presentation toolbar (T)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
  </button>

  <div id="dock-wrap">
    <!-- Separate Laser Color Bar -->
    <div id="laser-bar" class="hud-sub" role="toolbar" aria-label="Laser pointer colors">
      <span style="font-size:11px; color:#94a3b8; padding:0 4px;">Laser</span>
      <button type="button" class="swatch is-selected" data-laser-color="#ef4444" style="background:#ef4444" title="Red Laser" aria-label="Red Laser"></button>
      <button type="button" class="swatch" data-laser-color="#f59e0b" style="background:#f59e0b" title="Amber Laser" aria-label="Amber Laser"></button>
      <button type="button" class="swatch" data-laser-color="#22c55e" style="background:#22c55e" title="Green Laser" aria-label="Green Laser"></button>
      <button type="button" class="swatch" data-laser-color="#38bdf8" style="background:#38bdf8" title="Blue Laser" aria-label="Blue Laser"></button>
      <span class="hud-sep"></span>
      <button type="button" class="hud-btn sm" id="laser-hide-opts" title="Hide Laser Options (O)" aria-label="Hide laser options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button type="button" class="hud-btn sm" id="laser-close" title="Turn Off Laser (Esc)" aria-label="Turn off laser">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Separate Compact Drawing Bar -->
    <div id="draw-bar" class="hud-sub" role="toolbar" aria-label="Drawing tools">
      <button type="button" class="hud-btn sm" data-tool="pen" title="Pen (P)" aria-label="Pen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
      <button type="button" class="hud-btn sm" data-tool="highlighter" title="Highlighter (H)" aria-label="Highlighter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
      </button>
      <button type="button" class="hud-btn sm" data-tool="arrow" title="Arrow (A, hold Shift to snap)" aria-label="Arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
      </button>
      <button type="button" class="hud-btn sm" data-tool="rect" title="Box (R, hold Shift for square)" aria-label="Box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
      </button>
      <button type="button" class="hud-btn sm" data-tool="eraser" title="Stroke Eraser (E)" aria-label="Stroke Eraser">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <span class="hud-sep" id="ink-sep-1"></span>
      <div id="ink-colors" style="display:flex; align-items:center; gap:5px; padding:0 2px;">
        <button type="button" class="swatch is-selected" data-ink-color="#ef4444" style="background:#ef4444" title="Crimson Red" aria-label="Crimson Red"></button>
        <button type="button" class="swatch" data-ink-color="#f59e0b" style="background:#f59e0b" title="Amber Gold" aria-label="Amber Gold"></button>
        <button type="button" class="swatch" data-ink-color="#22c55e" style="background:#22c55e" title="Emerald Green" aria-label="Emerald Green"></button>
        <button type="button" class="swatch" data-ink-color="#38bdf8" style="background:#38bdf8" title="Sky Blue" aria-label="Sky Blue"></button>
        <button type="button" class="swatch" data-ink-color="#ffffff" style="background:#ffffff" title="Pure White" aria-label="Pure White"></button>
        <button type="button" class="swatch" data-ink-color="#0f172a" style="background:#0f172a" title="Charcoal Ink" aria-label="Charcoal Ink"></button>
      </div>

      <span class="hud-sep" id="ink-sep-2"></span>
      <div id="ink-sizes" style="display:flex; align-items:center; gap:2px;">
        <button type="button" class="size-btn" data-size="3" title="Fine stroke" aria-label="Fine stroke"><span class="size-dot" style="width:4px;height:4px;"></span></button>
        <button type="button" class="size-btn is-selected" data-size="5.5" title="Medium stroke" aria-label="Medium stroke"><span class="size-dot" style="width:6.5px;height:6.5px;"></span></button>
        <button type="button" class="size-btn" data-size="9" title="Bold stroke" aria-label="Bold stroke"><span class="size-dot" style="width:9px;height:9px;"></span></button>
      </div>

      <span class="hud-sep"></span>
      <button type="button" class="hud-btn sm" id="ann-undo" title="Undo (Ctrl+Z)" aria-label="Undo drawing" disabled>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
      </button>
      <button type="button" class="hud-btn sm" id="ann-clear" title="Clear Slide Drawings (C)" aria-label="Clear slide drawings" disabled>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
      <button type="button" class="hud-btn sm" id="draw-hide-opts" title="Hide Drawing Options (O)" aria-label="Hide drawing options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button type="button" class="hud-btn sm" id="draw-close" title="Done Drawing (Esc)" aria-label="Done drawing">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Main Presentation Control Bar -->
    <nav class="hud-bar" aria-label="Presentation controls">
      <button type="button" class="hud-btn" id="prev" title="Previous Slide (Left Arrow)" aria-label="Previous slide">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="hud-counter" id="counter">01 / 01</span>
      <button type="button" class="hud-btn" id="next" title="Next Slide (Right Arrow)" aria-label="Next slide">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      <span class="hud-sep" id="ann-sep"></span>
      <button type="button" class="hud-btn" id="btn-laser" title="Laser Pointer (L)" aria-label="Laser pointer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M7.76 16.24a6 6 0 0 1 0-8.48"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
      </button>
      <button type="button" class="hud-btn" id="btn-draw" title="Draw & Annotate (P)" aria-label="Drawing tools">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
      <button type="button" class="hud-btn sm" id="btn-show-opts" style="display:none; width:28px; height:34px;" title="Show Tool Options (O)" aria-label="Show tool options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>

      <span class="hud-sep" id="view-sep"></span>
      <button type="button" class="hud-btn" id="btn-notes" title="Presenter Notes & Timer (N)" aria-label="Presenter view">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>
      </button>
      <a class="hud-btn" id="btn-audience" href="?view=audience" target="_blank" rel="noopener noreferrer" title="Open Separate Audience Window (Dual Screen)" aria-label="Open synchronized audience window" style="text-decoration:none; position:relative;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
        <span id="dock-sync-dot" style="display:none; position:absolute; top:6px; right:6px; width:6px; height:6px; border-radius:9999px; background:#34d399;"></span>
      </a>
      <button type="button" class="hud-btn" id="btn-grid" title="Slide Grid (G)" aria-label="Slide grid">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
      </button>
      <button type="button" class="hud-btn" id="btn-blackout" title="Blackout Screen (B)" aria-label="Blackout screen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17H4a2 2 0 0 1-2-2V5c0-1.5 1-2 1-2"/><path d="M22 15V5a2 2 0 0 0-2-2H9"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m2 2 20 20"/></svg>
      </button>
      <button type="button" class="hud-btn" id="btn-fs" title="Fullscreen (F)" aria-label="Toggle fullscreen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>
      </button>
      <button type="button" class="hud-btn" id="btn-help" title="Keyboard Shortcuts (?)" aria-label="Keyboard shortcuts">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
      </button>
      <button type="button" class="hud-btn" id="btn-hide-dock" title="Hide Toolbar (T)" aria-label="Hide toolbar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </nav>
  </div>

  <div id="blackout">Screen blacked out — press B or click anywhere to resume</div>

  <div id="ended-screen" role="status" aria-live="polite">
    <div style="width:48px; height:48px; border-radius:14px; background:#0f172a; border:1px solid #1e293b; display:flex; align-items:center; justify-content:center; color:#94a3b8; margin-bottom:4px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17H4a2 2 0 0 1-2-2V5c0-1.5 1-2 1-2"/><path d="M22 15V5a2 2 0 0 0-2-2H9"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m2 2 20 20"/></svg>
    </div>
    <div style="font-size:18px; font-weight:600; color:#ffffff;">Presentation ended</div>
    <div style="font-size:13px; color:#94a3b8; max-width:420px; line-height:1.55;">
      The presenter closed the presentation. You can close this tab, or leave it open to reconnect automatically when they present again.
    </div>
    <div style="display:flex; gap:10px; margin-top:8px;">
      <button type="button" class="p-btn-primary" id="ended-close-tab">Close Tab</button>
      <button type="button" class="p-btn-sm" id="ended-resume" style="height:32px; padding:0 14px;">Resume Slide View</button>
    </div>
    <div id="ended-close-hint" style="display:none; font-size:11px; color:#64748b; margin-top:4px;">
      Your browser prevents tabs from closing themselves — press Ctrl+W or Cmd+W to close this tab.
    </div>
  </div>

  <div id="grid-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Slide overview">
    <div class="grid-inner">
      <div class="grid-header">
        <div>
          <div style="font-size:18px; font-weight:600; color:#ffffff;">Slide Overview</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:2px;" id="grid-subtitle"></div>
        </div>
        <button type="button" class="p-btn-sm" id="grid-close" style="padding:8px 14px;">Close Grid</button>
      </div>
      <div class="grid-cards" id="grid-cards"></div>
    </div>
  </div>

  <div id="help-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
    <div class="help-card" id="help-card">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="font-size:16px; font-weight:600; color:#ffffff;">Keyboard Shortcuts</div>
        <button type="button" class="p-btn-sm" id="help-close">Close</button>
      </div>
      <ul class="help-list" id="help-list"></ul>
    </div>
  </div>

  <script id="slideino-deck-data" type="application/json">${safeJson}</script>
  <script>
  (function() {
    var DECK = JSON.parse(document.getElementById('slideino-deck-data').textContent || '{}');
    var OPTS = DECK.options || { includeAnnotations: true, includePresenterTools: true, includeGridAndBlackout: true };
    var slides = DECK.slides || [];
    if (slides.length === 0) return;

    var index = 0;
    var hashMatch = (window.location.hash || '').match(/^#slide-(\d+)$/);
    if (hashMatch) {
      var parsed = parseInt(hashMatch[1], 10) - 1;
      if (parsed >= 0 && parsed < slides.length) index = parsed;
    }

    var stageLayout = document.getElementById('stage-layout');
    var stageContainer = document.getElementById('stage-container');
    var wrap = document.getElementById('stage-wrap');
    var frame = document.getElementById('frame');
    var nextFrame = document.getElementById('next-frame');
    var nextBox = document.getElementById('next-box');
    var nextLabel = document.getElementById('next-label');
    var nextEnd = document.getElementById('next-end');
    var notesBody = document.getElementById('notes-body');
    var pSlideTitle = document.getElementById('p-slide-title');
    var pSlideCounter = document.getElementById('p-slide-counter');
    var counter = document.getElementById('counter');
    var progress = document.getElementById('progress');
    var live = document.getElementById('live-region');
    var prevBtn = document.getElementById('prev');
    var nextBtn = document.getElementById('next');
    var dockWrap = document.getElementById('dock-wrap');
    var dockReveal = document.getElementById('dock-reveal');
    var laserBar = document.getElementById('laser-bar');
    var drawBar = document.getElementById('draw-bar');
    var btnLaser = document.getElementById('btn-laser');
    var btnDraw = document.getElementById('btn-draw');
    var btnShowOpts = document.getElementById('btn-show-opts');
    var btnHideDock = document.getElementById('btn-hide-dock');
    var btnNotes = document.getElementById('btn-notes');
    var btnGrid = document.getElementById('btn-grid');
    var btnBlackout = document.getElementById('btn-blackout');
    var btnFs = document.getElementById('btn-fs');
    var btnHelp = document.getElementById('btn-help');
    var blackoutEl = document.getElementById('blackout');
    var gridModal = document.getElementById('grid-modal');
    var gridCards = document.getElementById('grid-cards');
    var gridSubtitle = document.getElementById('grid-subtitle');
    var helpModal = document.getElementById('help-modal');
    var helpList = document.getElementById('help-list');
    var btnAudience = document.getElementById('btn-audience');
    var dockSyncDot = document.getElementById('dock-sync-dot');
    var btnOpenAudience = document.getElementById('btn-open-audience');
    var btnOpenAudienceText = document.getElementById('btn-open-audience-text');
    var btnCopyAudience = document.getElementById('btn-copy-audience');
    var pSyncDot = document.getElementById('p-sync-dot');
    var pSyncLabel = document.getElementById('p-sync-label');
    var pBlackoutPreview = document.getElementById('p-blackout-preview');
    var audienceBanner = document.getElementById('audience-banner');
    var audBannerDot = document.getElementById('aud-banner-dot');
    var audBannerText = document.getElementById('aud-banner-text');
    var audBannerClose = document.getElementById('aud-banner-close');
    var endedScreen = document.getElementById('ended-screen');
    var endedCloseTab = document.getElementById('ended-close-tab');
    var endedResume = document.getElementById('ended-resume');
    var endedCloseHint = document.getElementById('ended-close-hint');

    // Dual-Window Audience vs Presenter mode detection
    var urlParams = new URLSearchParams(window.location.search || '');
    var isAudienceMode = urlParams.get('view') === 'audience';
    var defaultSyncKey = 'deck-' + (DECK.title || 'presentation').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
    var syncId = urlParams.get('sync') || defaultSyncKey;
    var syncChannelName = 'slideino-standalone-sync:' + syncId;
    var syncStorageKey = 'slideino_standalone_pkt:' + syncId;
    var syncRole = isAudienceMode ? 'audience' : 'presenter';
    var syncSenderId = syncRole + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    var syncSeq = 0;
    var syncPeers = {};
    var seenSyncSeq = {};
    var syncBc = null;
    var lastSyncLaserEmit = 0;
    var lastStorageLaserEmit = 0;

    function buildAudienceHref() {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set('view', 'audience');
        u.searchParams.set('sync', syncId);
        u.hash = '#slide-' + (index + 1);
        return u.toString();
      } catch (_) {
        return '?view=audience&sync=' + encodeURIComponent(syncId) + '#slide-' + (index + 1);
      }
    }

    function refreshAudienceLinks() {
      var href = buildAudienceHref();
      if (btnAudience) btnAudience.setAttribute('href', href);
      if (btnOpenAudience) btnOpenAudience.setAttribute('href', href);
    }

    if (isAudienceMode) {
      document.title = 'Audience View — ' + (DECK.title || 'Presentation');
      btnLaser.style.display = 'none';
      btnDraw.style.display = 'none';
      btnNotes.style.display = 'none';
      btnAudience.style.display = 'none';
      btnGrid.style.display = 'none';
      btnBlackout.style.display = 'none';
      btnHelp.style.display = 'none';
      document.getElementById('ann-sep').style.display = 'none';
      blackoutEl.textContent = '';
      audienceBanner.classList.add('is-open');
      setTimeout(function() { audienceBanner.classList.remove('is-open'); }, 4500);
      audBannerClose.addEventListener('click', function() { audienceBanner.classList.remove('is-open'); });
    } else {
      // Respect export feature toggles
      if (!OPTS.includeAnnotations) {
        btnLaser.style.display = 'none';
        btnDraw.style.display = 'none';
        document.getElementById('ann-sep').style.display = 'none';
      }
      if (!OPTS.includePresenterTools) {
        btnNotes.style.display = 'none';
      }
      if (!OPTS.includeGridAndBlackout) {
        btnGrid.style.display = 'none';
        btnBlackout.style.display = 'none';
      }
      if (!OPTS.includePresenterTools && !OPTS.includeGridAndBlackout) {
        btnAudience.style.display = 'none';
        document.getElementById('view-sep').style.display = 'none';
      }
    }

    var presenterView = false;
    var gridOpen = false;
    var blackoutOpen = false;
    var helpOpen = false;
    var noteFontSize = 16;
    var activeDims = { width: DECK.dims.width || 1280, height: DECK.dims.height || 720 };

    // Deduplicated sharedCss injector (keeps file compact while preserving all fonts & shared styles)
    function composeSlideDoc(rawDoc) {
      if (!DECK.sharedCss) return rawDoc;
      var tag = '<style data-slideino-shared="true">' + DECK.sharedCss + '</style>';
      if (/<head[^>]*>/i.test(rawDoc)) {
        return rawDoc.replace(/<head[^>]*>/i, function(m) { return m + '\\n' + tag; });
      }
      return tag + '\\n' + rawDoc;
    }

    // Isolated Presenter Timer (zero stage re-renders)
    var timerVal = document.getElementById('timer-val');
    var timerToggle = document.getElementById('timer-toggle');
    var timerReset = document.getElementById('timer-reset');
    var elapsedSec = 0;
    var timerRunning = true;
    function renderTimer() {
      var m = Math.floor(elapsedSec / 60);
      var s = elapsedSec % 60;
      timerVal.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    var timerIntervalId = setInterval(function() {
      if (timerRunning && presenterView) {
        elapsedSec += 1;
        renderTimer();
      }
    }, 1000);
    timerToggle.addEventListener('click', function() {
      timerRunning = !timerRunning;
      timerToggle.textContent = timerRunning ? 'Pause' : 'Resume';
    });
    timerReset.addEventListener('click', function() {
      elapsedSec = 0;
      renderTimer();
    });
    document.getElementById('notes-dec').addEventListener('click', function() {
      noteFontSize = Math.max(12, noteFontSize - 2);
      notesBody.style.fontSize = noteFontSize + 'px';
    });
    document.getElementById('notes-inc').addEventListener('click', function() {
      noteFontSize = Math.min(28, noteFontSize + 2);
      notesBody.style.fontSize = noteFontSize + 'px';
    });

    // Layout & Scaling (supports Fixed, Fluid, and Auto Fit Content)
    function layoutNextPreview() {
      if (!presenterView) return;
      var nxt = slides[index + 1];
      if (!nxt) return;
      var br = nextBox.getBoundingClientRect();
      if (br.width <= 0 || br.height <= 0) return;
      var nw = nxt.width || 1280;
      var nh = nxt.height || 720;
      var sc = Math.min(br.width / nw, br.height / nh);
      nextFrame.style.width = nw + 'px';
      nextFrame.style.height = nh + 'px';
      nextFrame.style.transform = 'scale(' + sc + ')';
      nextFrame.style.position = 'absolute';
      nextFrame.style.left = Math.round((br.width - nw * sc) / 2) + 'px';
      nextFrame.style.top = Math.round((br.height - nh * sc) / 2) + 'px';
    }

    function layout() {
      var cr = stageContainer.getBoundingClientRect();
      var vw = Math.max(1, cr.width);
      var vh = Math.max(1, cr.height);
      if (DECK.dims.fluid) {
        wrap.style.width = vw + 'px';
        wrap.style.height = vh + 'px';
        frame.style.width = vw + 'px';
        frame.style.height = vh + 'px';
        frame.style.transform = 'none';
      } else {
        var w = activeDims.width || DECK.dims.width || 1280;
        var h = activeDims.height || DECK.dims.height || 720;
        var scale = Math.min(vw / w, vh / h);
        wrap.style.width = Math.max(1, Math.floor(w * scale)) + 'px';
        wrap.style.height = Math.max(1, Math.floor(h * scale)) + 'px';
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
        frame.style.transform = 'scale(' + scale + ')';
      }
      syncAnnotationCanvasSize();
      layoutNextPreview();
    }

    // ==================== Annotation & Laser Engine ====================
    var annLayer = document.getElementById('ann-layer');
    var drawCanvas = document.getElementById('draw-canvas');
    var laserCanvas = document.getElementById('laser-canvas');
    var laserDot = document.getElementById('laser-dot');
    var eraserRing = document.getElementById('eraser-ring');
    var annUndoBtn = document.getElementById('ann-undo');
    var annClearBtn = document.getElementById('ann-clear');

    var activeTool = 'pointer';
    var lastDrawTool = 'pen';
    var strokeColor = '#ef4444';
    var laserColor = '#ef4444';
    var strokeSize = 5.5;
    var annotationsBySlide = {};
    var undoBySlide = {};
    var activeStroke = null;
    var isErasing = false;
    var annRect = { left: 0, top: 0, width: 0, height: 0 };
    var annSize = { width: 0, height: 0, dpr: 1 };
    var laserStrokes = [];
    var activeLaserStroke = null;
    var remoteActiveLaserStroke = null;
    var laserRaf = null;
    var laserCtx = null;
    var LASER_HOLD_MS = 750;
    var LASER_FADE_MS = 550;
    var LASER_MAX_PTS = 900;

    function updateLaserDotStyle() {
      laserDot.style.background = 'radial-gradient(circle, #ffffff 0%, #ffffff 22%, ' + laserColor + ' 40%, ' + laserColor + '55 68%, transparent 100%)';
      laserDot.style.boxShadow = '0 0 14px ' + laserColor;
    }
    updateLaserDotStyle();

    function getCurrentSlideId() {
      return (slides[index] && slides[index].id) || ('s-' + index);
    }

    function refreshAnnRect() {
      var r = annLayer.getBoundingClientRect();
      annRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    }

    function syncAnnotationCanvasSize() {
      var r = annLayer.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      annRect = { left: r.left, top: r.top, width: r.width, height: r.height };
      annSize = { width: r.width, height: r.height, dpr: dpr };
      drawCanvas.width = Math.max(1, Math.round(r.width * dpr));
      drawCanvas.height = Math.max(1, Math.round(r.height * dpr));
      laserCanvas.width = Math.max(1, Math.round(r.width * dpr));
      laserCanvas.height = Math.max(1, Math.round(r.height * dpr));
      renderDrawCanvas();
      renderLaserCanvas();
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function hitTestStroke(s, px, py, w, h, radiusPx) {
      var scale = w / 1280;
      var extra = Math.max(radiusPx, s.size * scale * (s.tool === 'highlighter' ? 2.2 : 1.1));
      var pts = s.points;
      if (!pts || pts.length === 0) return false;
      if (s.tool === 'rect' && pts.length >= 2) {
        var x1 = Math.min(pts[0].x, pts[pts.length - 1].x) * w;
        var x2 = Math.max(pts[0].x, pts[pts.length - 1].x) * w;
        var y1 = Math.min(pts[0].y, pts[pts.length - 1].y) * h;
        var y2 = Math.max(pts[0].y, pts[pts.length - 1].y) * h;
        return distToSegment(px, py, x1, y1, x2, y1) <= extra ||
               distToSegment(px, py, x2, y1, x2, y2) <= extra ||
               distToSegment(px, py, x2, y2, x1, y2) <= extra ||
               distToSegment(px, py, x1, y2, x1, y1) <= extra;
      }
      if (s.tool === 'arrow' && pts.length >= 2) {
        return distToSegment(px, py, pts[0].x * w, pts[0].y * h, pts[pts.length - 1].x * w, pts[pts.length - 1].y * h) <= extra;
      }
      if (pts.length === 1) {
        return Math.hypot(px - pts[0].x * w, py - pts[0].y * h) <= extra;
      }
      for (var i = 1; i < pts.length; i++) {
        if (distToSegment(px, py, pts[i - 1].x * w, pts[i - 1].y * h, pts[i].x * w, pts[i].y * h) <= extra) return true;
      }
      return false;
    }

    function drawOneStroke(ctx, s, w, h) {
      var pts = s.points;
      if (!pts || pts.length === 0) return;
      var scale = w / 1280;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = Math.max(8, s.size * 3.8 * scale);
      } else {
        ctx.globalAlpha = 0.96;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = Math.max(1.5, s.size * scale);
      }
      if (s.tool === 'pen' || s.tool === 'highlighter') {
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x * w, pts[0].y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0].x * w, pts[0].y * h);
          for (var i = 1; i < pts.length - 1; i++) {
            var cx = pts[i].x * w, cy = pts[i].y * h;
            var nx = (pts[i].x + pts[i + 1].x) * 0.5 * w;
            var ny = (pts[i].y + pts[i + 1].y) * 0.5 * h;
            ctx.quadraticCurveTo(cx, cy, nx, ny);
          }
          ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
          ctx.stroke();
        }
      } else if (s.tool === 'arrow' && pts.length >= 2) {
        var x1 = pts[0].x * w, y1 = pts[0].y * h;
        var x2 = pts[pts.length - 1].x * w, y2 = pts[pts.length - 1].y * h;
        var len = Math.hypot(x2 - x1, y2 - y1);
        if (len > 1) {
          var ang = Math.atan2(y2 - y1, x2 - x1);
          var hl = Math.min(len * 0.45, Math.max(14, ctx.lineWidth * 4.2));
          var sp = Math.PI / 6.5;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2 - Math.cos(ang) * hl * 0.65, y2 - Math.sin(ang) * hl * 0.65);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - hl * Math.cos(ang - sp), y2 - hl * Math.sin(ang - sp));
          ctx.lineTo(x2 - hl * Math.cos(ang + sp), y2 - hl * Math.sin(ang + sp));
          ctx.closePath();
          ctx.fill();
        }
      } else if (s.tool === 'rect' && pts.length >= 2) {
        var rx = Math.min(pts[0].x, pts[pts.length - 1].x) * w;
        var ry = Math.min(pts[0].y, pts[pts.length - 1].y) * h;
        var rw = Math.abs(pts[pts.length - 1].x - pts[0].x) * w;
        var rh = Math.abs(pts[pts.length - 1].y - pts[0].y) * h;
        var rad = Math.min(10 * scale, rw / 4, rh / 4);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(rx, ry, rw, rh, rad);
        else ctx.rect(rx, ry, rw, rh);
        ctx.stroke();
      }
      ctx.restore();
    }

    function renderDrawCanvas() {
      var ctx = drawCanvas.getContext('2d');
      if (!ctx || annSize.width <= 0 || annSize.height <= 0) return;
      ctx.save();
      ctx.setTransform(annSize.dpr, 0, 0, annSize.dpr, 0, 0);
      ctx.clearRect(0, 0, annSize.width, annSize.height);
      var list = annotationsBySlide[getCurrentSlideId()] || [];
      for (var i = 0; i < list.length; i++) drawOneStroke(ctx, list[i], annSize.width, annSize.height);
      if (activeStroke) drawOneStroke(ctx, activeStroke, annSize.width, annSize.height);
      ctx.restore();
      updateAnnotationButtons();
    }

    function updateAnnotationButtons() {
      var sid = getCurrentSlideId();
      var list = annotationsBySlide[sid] || [];
      var stack = undoBySlide[sid] || [];
      annUndoBtn.disabled = stack.length === 0;
      annClearBtn.disabled = list.length === 0;
    }

    function pushUndoSnapshot(sid, prevList) {
      if (!undoBySlide[sid]) undoBySlide[sid] = [];
      undoBySlide[sid].push(prevList.slice());
      if (undoBySlide[sid].length > 30) undoBySlide[sid].shift();
    }

    function undoAnnotation() {
      var sid = getCurrentSlideId();
      var stack = undoBySlide[sid];
      if (!stack || stack.length === 0) return;
      annotationsBySlide[sid] = stack.pop();
      renderDrawCanvas();
      broadcastState(true);
    }

    function clearAnnotations() {
      var sid = getCurrentSlideId();
      var cur = annotationsBySlide[sid] || [];
      if (cur.length === 0) return;
      pushUndoSnapshot(sid, cur);
      annotationsBySlide[sid] = [];
      renderDrawCanvas();
      broadcastState(true);
    }

    function clearLaserStrokes() {
      laserStrokes = [];
      activeLaserStroke = null;
      remoteActiveLaserStroke = null;
      if (laserRaf !== null) { cancelAnimationFrame(laserRaf); laserRaf = null; }
      if (laserCtx) { laserCtx.setTransform(1, 0, 0, 1, 0, 0); laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height); }
    }

    function appendLaserPt(stroke, norm) {
      var pts = stroke.points;
      var last = pts[pts.length - 1];
      if (!last) { pts.push(norm); return true; }
      var dx = (norm.x - last.x) * (annSize.width || 1280);
      var dy = (norm.y - last.y) * (annSize.height || 720);
      if (Math.hypot(dx, dy) >= 2) {
        if (pts.length < LASER_MAX_PTS) pts.push(norm);
        return true;
      }
      return false;
    }

    function traceLaserPath(ctx, pts, w, h) {
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        ctx.lineTo(pts[0].x * w + 0.1, pts[0].y * h + 0.1);
        return;
      }
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (var i = 1; i < pts.length - 1; i++) {
        var cx = pts[i].x * w, cy = pts[i].y * h;
        var nx = (pts[i].x + pts[i + 1].x) * 0.5 * w;
        var ny = (pts[i].y + pts[i + 1].y) * 0.5 * h;
        ctx.quadraticCurveTo(cx, cy, nx, ny);
      }
      var last = pts[pts.length - 1];
      ctx.lineTo(last.x * w, last.y * h);
    }

    function renderLaserCanvas() {
      if (!laserCtx) laserCtx = laserCanvas.getContext('2d', { desynchronized: true }) || laserCanvas.getContext('2d');
      if (!laserCtx || annSize.width <= 0 || annSize.height <= 0) { laserRaf = null; return; }
      var now = performance.now();
      var w = annSize.width, h = annSize.height;
      var scale = Math.max(0.65, w / 1280);
      var hasFading = false;

      laserCtx.setTransform(annSize.dpr, 0, 0, annSize.dpr, 0, 0);
      laserCtx.clearRect(0, 0, w, h);
      laserCtx.lineCap = 'round';
      laserCtx.lineJoin = 'round';

      for (var i = laserStrokes.length - 1; i >= 0; i--) {
        var s = laserStrokes[i];
        var alpha = 1;
        if (s.releasedAt !== null) {
          var elapsed = now - s.releasedAt;
          if (elapsed >= LASER_HOLD_MS + LASER_FADE_MS) {
            laserStrokes.splice(i, 1);
            continue;
          }
          hasFading = true;
          if (elapsed > LASER_HOLD_MS) {
            var t = (elapsed - LASER_HOLD_MS) / LASER_FADE_MS;
            var e = 1 - t;
            alpha = e * e;
          }
        }
        if (!s.points.length || alpha <= 0.005) continue;

        traceLaserPath(laserCtx, s.points, w, h);
        laserCtx.strokeStyle = s.color;
        laserCtx.globalAlpha = alpha * 0.28;
        laserCtx.lineWidth = Math.max(8, 15 * scale);
        laserCtx.stroke();

        traceLaserPath(laserCtx, s.points, w, h);
        laserCtx.strokeStyle = s.color;
        laserCtx.globalAlpha = alpha * 0.92;
        laserCtx.lineWidth = Math.max(3.5, 6 * scale);
        laserCtx.stroke();

        traceLaserPath(laserCtx, s.points, w, h);
        laserCtx.strokeStyle = '#ffffff';
        laserCtx.globalAlpha = alpha * 0.85;
        laserCtx.lineWidth = Math.max(1.4, 2.2 * scale);
        laserCtx.stroke();
      }
      laserCtx.globalAlpha = 1;

      if (hasFading) laserRaf = requestAnimationFrame(renderLaserCanvas);
      else laserRaf = null;
    }

    function ensureLaserLoop() {
      if (laserRaf === null) laserRaf = requestAnimationFrame(renderLaserCanvas);
    }

    var toolOptionsHidden = false;
    function syncToolBars() {
      var isLaser = activeTool === 'laser';
      var isDraw = activeTool !== 'pointer' && activeTool !== 'laser';
      btnLaser.classList.toggle('active-red', isLaser);
      btnDraw.classList.toggle('active-blue', isDraw);
      laserBar.classList.toggle('is-open', isLaser && !toolOptionsHidden);
      drawBar.classList.toggle('is-open', isDraw && !toolOptionsHidden);
      btnShowOpts.style.display = (OPTS.includeAnnotations && (isLaser || isDraw) && toolOptionsHidden) ? 'inline-flex' : 'none';
      btnShowOpts.title = isLaser ? 'Show Laser Options (O)' : 'Show Drawing Options (O)';
    }

    function setToolOptionsHidden(val) {
      toolOptionsHidden = Boolean(val);
      syncToolBars();
      if (!toolbarHidden) bumpControls(true);
    }

    function setTool(nextTool) {
      if (!OPTS.includeAnnotations) nextTool = 'pointer';
      activeTool = nextTool;
      if (nextTool !== 'pointer' && nextTool !== 'laser') lastDrawTool = nextTool;

      annLayer.classList.toggle('is-active', activeTool !== 'pointer');
      annLayer.classList.toggle('cursor-none', activeTool === 'laser' || activeTool === 'eraser');
      annLayer.classList.toggle('cursor-crosshair', activeTool !== 'pointer' && activeTool !== 'laser' && activeTool !== 'eraser');

      var isLaser = activeTool === 'laser';
      syncToolBars();

      drawBar.querySelectorAll('[data-tool]').forEach(function(b) {
        b.classList.toggle('active-blue', b.getAttribute('data-tool') === activeTool);
      });
      var hideInk = activeTool === 'eraser';
      document.getElementById('ink-sep-1').style.display = hideInk ? 'none' : '';
      document.getElementById('ink-colors').style.display = hideInk ? 'none' : 'flex';
      document.getElementById('ink-sep-2').style.display = hideInk ? 'none' : '';
      document.getElementById('ink-sizes').style.display = hideInk ? 'none' : 'flex';

      if (!isLaser) {
        laserDot.style.opacity = '0';
        clearLaserStrokes();
        emitLaserSync(0, 0, false, 'hide');
      }
      if (activeTool !== 'eraser') {
        eraserRing.style.opacity = '0';
        isErasing = false;
      }
      if (!toolbarHidden) bumpControls(true);
    }

    function toLocalPt(cx, cy) {
      if (annRect.width <= 0 || annRect.height <= 0) return null;
      var px = Math.max(0, Math.min(annRect.width, cx - annRect.left));
      var py = Math.max(0, Math.min(annRect.height, cy - annRect.top));
      return { px: px, py: py, norm: { x: px / annRect.width, y: py / annRect.height } };
    }

    function eraseAt(px, py) {
      var sid = getCurrentSlideId();
      var list = annotationsBySlide[sid] || [];
      if (list.length === 0) return;
      var rPx = Math.max(12, 16 * (annSize.width / 1280));
      var kept = [];
      var removed = false;
      for (var i = 0; i < list.length; i++) {
        if (hitTestStroke(list[i], px, py, annSize.width, annSize.height, rPx)) removed = true;
        else kept.push(list[i]);
      }
      if (removed) {
        pushUndoSnapshot(sid, list);
        annotationsBySlide[sid] = kept;
        renderDrawCanvas();
        broadcastState(true);
      }
    }

    annLayer.addEventListener('pointerenter', refreshAnnRect);
    annLayer.addEventListener('pointerdown', function(e) {
      if (activeTool === 'pointer') return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      refreshAnnRect();
      var pt = toLocalPt(e.clientX, e.clientY);
      if (!pt) return;
      if (annLayer.setPointerCapture) annLayer.setPointerCapture(e.pointerId);
      if (activeTool === 'laser') {
        activeLaserStroke = { points: [pt.norm], color: laserColor, releasedAt: null };
        laserStrokes.push(activeLaserStroke);
        laserDot.style.opacity = '1';
        laserDot.style.transform = 'translate3d(' + pt.px + 'px,' + pt.py + 'px,0) scale(1.18)';
        renderLaserCanvas();
        emitLaserSync(pt.norm.x, pt.norm.y, true, 'start');
        return;
      }
      if (activeTool === 'eraser') {
        isErasing = true;
        eraserRing.style.opacity = '1';
        eraserRing.style.transform = 'translate3d(' + pt.px + 'px,' + pt.py + 'px,0)';
        eraseAt(pt.px, pt.py);
        return;
      }
      activeStroke = { tool: activeTool, color: strokeColor, size: strokeSize, points: [pt.norm] };
      renderDrawCanvas();
    });

    annLayer.addEventListener('pointermove', function(e) {
      if (activeTool === 'pointer') return;
      if (activeTool === 'laser') {
        if (activeLaserStroke) {
          var events = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
          var lastPt = null;
          var mutated = false;
          for (var i = 0; i < events.length; i++) {
            var p = toLocalPt(events[i].clientX, events[i].clientY);
            if (!p) continue;
            lastPt = p;
            if (appendLaserPt(activeLaserStroke, p.norm)) mutated = true;
          }
          if (lastPt) {
            laserDot.style.opacity = '1';
            laserDot.style.transform = 'translate3d(' + lastPt.px + 'px,' + lastPt.py + 'px,0) scale(1.18)';
            if (mutated) renderLaserCanvas();
            emitLaserSync(lastPt.norm.x, lastPt.norm.y, true, 'draw');
          }
        } else {
          var hp = toLocalPt(e.clientX, e.clientY);
          if (hp) {
            laserDot.style.opacity = '1';
            laserDot.style.transform = 'translate3d(' + hp.px + 'px,' + hp.py + 'px,0) scale(1)';
            emitLaserSync(hp.norm.x, hp.norm.y, true, 'hover');
          }
        }
        return;
      }
      var pt = toLocalPt(e.clientX, e.clientY);
      if (!pt) return;
      if (activeTool === 'eraser') {
        eraserRing.style.opacity = '1';
        eraserRing.style.transform = 'translate3d(' + pt.px + 'px,' + pt.py + 'px,0)';
        if (isErasing) eraseAt(pt.px, pt.py);
        return;
      }
      if (!activeStroke) return;
      if (activeStroke.tool === 'pen' || activeStroke.tool === 'highlighter') {
        var last = activeStroke.points[activeStroke.points.length - 1];
        if (Math.hypot((pt.norm.x - last.x) * annSize.width, (pt.norm.y - last.y) * annSize.height) >= 2) {
          activeStroke.points.push(pt.norm);
          renderDrawCanvas();
        }
      } else if (activeStroke.tool === 'arrow') {
        var endPt = pt.norm;
        if (e.shiftKey && annSize.width > 0) {
          var st = activeStroke.points[0];
          var dx = (pt.norm.x - st.x) * annSize.width, dy = (pt.norm.y - st.y) * annSize.height;
          var len = Math.hypot(dx, dy);
          var ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          endPt = { x: Math.max(0, Math.min(1, st.x + Math.cos(ang) * len / annSize.width)), y: Math.max(0, Math.min(1, st.y + Math.sin(ang) * len / annSize.height)) };
        }
        activeStroke.points = [activeStroke.points[0], endPt];
        renderDrawCanvas();
      } else if (activeStroke.tool === 'rect') {
        var rEnd = pt.norm;
        if (e.shiftKey && annSize.width > 0) {
          var rs = activeStroke.points[0];
          var rdx = (pt.norm.x - rs.x) * annSize.width, rdy = (pt.norm.y - rs.y) * annSize.height;
          var side = Math.max(Math.abs(rdx), Math.abs(rdy));
          rEnd = { x: Math.max(0, Math.min(1, rs.x + (rdx < 0 ? -1 : 1) * side / annSize.width)), y: Math.max(0, Math.min(1, rs.y + (rdy < 0 ? -1 : 1) * side / annSize.height)) };
        }
        activeStroke.points = [activeStroke.points[0], rEnd];
        renderDrawCanvas();
      }
    });

    function endPointer(e) {
      if (e && annLayer.hasPointerCapture && annLayer.hasPointerCapture(e.pointerId)) {
        annLayer.releasePointerCapture(e.pointerId);
      }
      if (activeTool === 'laser') {
        var p = e ? toLocalPt(e.clientX, e.clientY) : null;
        if (activeLaserStroke) {
          if (p) appendLaserPt(activeLaserStroke, p.norm);
          activeLaserStroke.releasedAt = performance.now();
          activeLaserStroke = null;
          renderLaserCanvas();
          ensureLaserLoop();
        }
        if (e && e.pointerType !== 'mouse') {
          laserDot.style.opacity = '0';
          if (p) emitLaserSync(p.norm.x, p.norm.y, true, 'end');
          emitLaserSync(0, 0, false, 'hide');
        } else if (p) {
          laserDot.style.transform = 'translate3d(' + p.px + 'px,' + p.py + 'px,0) scale(1)';
          emitLaserSync(p.norm.x, p.norm.y, true, 'end');
        }
        return;
      }
      if (activeTool === 'eraser') { isErasing = false; return; }
      if (!activeStroke) return;
      var committed = activeStroke;
      activeStroke = null;
      if ((committed.tool === 'arrow' || committed.tool === 'rect') &&
          (committed.points.length < 2 || Math.hypot((committed.points[1].x - committed.points[0].x) * annSize.width, (committed.points[1].y - committed.points[0].y) * annSize.height) < 6)) {
        renderDrawCanvas();
        return;
      }
      var sid = getCurrentSlideId();
      var prevList = annotationsBySlide[sid] || [];
      pushUndoSnapshot(sid, prevList);
      annotationsBySlide[sid] = prevList.concat([committed]);
      renderDrawCanvas();
      broadcastState(true);
    }

    annLayer.addEventListener('pointerup', endPointer);
    annLayer.addEventListener('pointercancel', endPointer);
    annLayer.addEventListener('pointerleave', function() {
      if (activeTool === 'laser') {
        if (activeLaserStroke) return;
        laserDot.style.opacity = '0';
        emitLaserSync(0, 0, false, 'hide');
      }
      if (activeTool === 'eraser') { isErasing = false; eraserRing.style.opacity = '0'; }
    });

    // ==================== Dock Auto-Hide & Manual Hide ====================
    var hideTimer = null;
    var dockHovered = false;
    var dockVisible = true;
    var toolbarHidden = false;
    var lastBump = 0;

    function hideToolbar() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      dockHovered = false;
      toolbarHidden = true;
      dockVisible = false;
      dockWrap.classList.add('is-hidden');
      dockReveal.classList.add('is-open');
    }

    function showToolbar() {
      toolbarHidden = false;
      dockReveal.classList.remove('is-open');
      bumpControls(true);
    }

    function toggleToolbarHidden() {
      if (toolbarHidden) showToolbar();
      else hideToolbar();
    }

    function bumpControls(force) {
      if (toolbarHidden) return;
      var now = performance.now();
      if (!force && dockVisible && now - lastBump < 300) return;
      lastBump = now;
      if (!dockVisible) {
        dockVisible = true;
        dockWrap.classList.remove('is-hidden');
      }
      if (hideTimer) clearTimeout(hideTimer);
      var timeoutMs = activeTool !== 'pointer' ? 2200 : 3000;
      hideTimer = setTimeout(function() {
        if (!dockHovered && !presenterView && !toolbarHidden) {
          dockVisible = false;
          dockWrap.classList.add('is-hidden');
        }
      }, timeoutMs);
    }

    dockWrap.addEventListener('mouseenter', function() {
      if (toolbarHidden) return;
      dockHovered = true;
      dockVisible = true;
      dockWrap.classList.remove('is-hidden');
    });
    dockWrap.addEventListener('mouseleave', function() {
      dockHovered = false;
      if (!toolbarHidden) bumpControls(true);
    });
    window.addEventListener('mousemove', function(e) {
      if (toolbarHidden || (e.buttons & 1) !== 0) return;
      if (activeTool !== 'pointer') {
        if (window.innerHeight - e.clientY <= 104) bumpControls(false);
        return;
      }
      bumpControls(false);
    }, { passive: true });

    // ==================== Slide Rendering ====================
    function render(direction) {
      var slide = slides[index];
      if (!slide) return;
      activeDims = {
        width: slide.width || DECK.dims.width || 1280,
        height: slide.height || DECK.dims.height || 720
      };
      wrap.style.background = slide.bg || DECK.themeBg || '#0b0f17';

      // Apply subtle transition animation if requested
      var tr = slide.transition || 'fade';
      wrap.classList.remove('anim-fade', 'anim-slide', 'anim-slide-back', 'anim-zoom');
      if (direction && tr !== 'none') {
        var cls = tr === 'slide' ? (direction < 0 ? 'anim-slide-back' : 'anim-slide') : ('anim-' + tr);
        wrap.classList.add(cls);
        void wrap.offsetWidth;
        requestAnimationFrame(function() { wrap.classList.remove(cls); });
      }

      layout();
      frame.srcdoc = composeSlideDoc(slide.doc);

      var numStr = (index + 1 < 10 ? '0' : '') + (index + 1) + ' / ' + (slides.length < 10 ? '0' : '') + slides.length;
      counter.textContent = numStr;
      pSlideCounter.textContent = numStr;
      pSlideTitle.textContent = 'Current Slide · ' + slide.title;
      progress.style.width = (((index + 1) / slides.length) * 100) + '%';
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === slides.length - 1;
      live.textContent = 'Slide ' + (index + 1) + ' of ' + slides.length + ': ' + slide.title;

      // Presenter notes & next preview
      notesBody.textContent = (slide.notes && slide.notes.trim()) ? slide.notes : 'No speaker notes for this slide.';
      var nxt = slides[index + 1];
      if (presenterView) {
        if (nxt) {
          nextLabel.textContent = 'Next Slide · ' + nxt.title;
          nextFrame.style.display = 'block';
          nextEnd.style.display = 'none';
          nextFrame.srcdoc = composeSlideDoc(nxt.doc);
          layoutNextPreview();
        } else {
          nextLabel.textContent = 'Next Slide';
          nextFrame.style.display = 'none';
          nextEnd.style.display = 'block';
        }
      }

      try { history.replaceState(null, '', '#slide-' + (index + 1)); } catch (_) {}
      refreshAudienceLinks();
      clearLaserStrokes();
      renderDrawCanvas();
    }

    function step(delta, fromSync) {
      var next = Math.max(0, Math.min(slides.length - 1, index + delta));
      if (next !== index) {
        index = next;
        setBlackout(false, true);
        if (isAudienceMode) audienceBanner.classList.remove('is-open');
        render(delta);
        if (!fromSync) broadcastState(false);
      }
    }

    function goTo(i, fromSync) {
      var clamped = Math.max(0, Math.min(slides.length - 1, i));
      var dir = clamped >= index ? 1 : -1;
      index = clamped;
      setBlackout(false, true);
      if (isAudienceMode) audienceBanner.classList.remove('is-open');
      render(dir);
      if (!fromSync) broadcastState(false);
    }

    function applyBlackoutVisual() {
      if (!isAudienceMode && presenterView) {
        blackoutEl.classList.remove('is-open');
        pBlackoutPreview.classList.toggle('is-open', blackoutOpen);
      } else {
        pBlackoutPreview.classList.remove('is-open');
        blackoutEl.classList.toggle('is-open', blackoutOpen);
      }
      btnBlackout.classList.toggle('active-blue', blackoutOpen);
    }

    function togglePresenterView() {
      if (isAudienceMode || !OPTS.includePresenterTools) return;
      presenterView = !presenterView;
      stageLayout.classList.toggle('is-presenter', presenterView);
      btnNotes.classList.toggle('active-blue', presenterView);
      applyBlackoutVisual();
      if (presenterView) {
        if (!toolbarHidden) {
          dockVisible = true;
          dockWrap.classList.remove('is-hidden');
        }
        render(0);
      } else {
        layout();
        if (!toolbarHidden) bumpControls(true);
      }
    }

    function setBlackout(val, fromSync) {
      if (!isAudienceMode && !OPTS.includeGridAndBlackout) return;
      blackoutOpen = Boolean(val);
      applyBlackoutVisual();
      if (!fromSync) broadcastState(false);
    }

    // ==================== Dual-Window Sync Bridge ====================
    var syncClosed = false;
    var presentationEnded = false;
    var syncHeartbeatId = null;

    function setAudienceEnded(ended) {
      if (!isAudienceMode) return;
      presentationEnded = Boolean(ended);
      endedScreen.classList.toggle('is-open', presentationEnded);
      if (presentationEnded) {
        blackoutOpen = false;
        applyBlackoutVisual();
        audienceBanner.classList.remove('is-open');
        dockWrap.style.display = 'none';
        dockReveal.classList.remove('is-open');
        laserDot.style.opacity = '0';
        try {
          frame.srcdoc = '';
          frame.src = 'about:blank';
        } catch (_) {}
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(function() {});
        }
      } else {
        endedCloseHint.style.display = 'none';
        dockWrap.style.display = '';
        render(0);
      }
    }

    if (endedCloseTab) {
      endedCloseTab.addEventListener('click', function() {
        window.close();
        setTimeout(function() { endedCloseHint.style.display = 'block'; }, 180);
      });
    }
    if (endedResume) {
      endedResume.addEventListener('click', function() {
        setAudienceEnded(false);
      });
    }

    function updateSyncUi() {
      var now = Date.now();
      var audCount = 0;
      var presCount = 0;
      Object.keys(syncPeers).forEach(function(k) {
        if (now - syncPeers[k].lastSeen > 5500) delete syncPeers[k];
        else if (syncPeers[k].role === 'audience') audCount++;
        else presCount++;
      });
      if (!isAudienceMode) {
        var live = audCount > 0;
        pSyncDot.classList.toggle('is-live', live);
        pSyncLabel.textContent = live
          ? (audCount === 1 ? 'Audience window synced' : audCount + ' audience windows synced')
          : 'Keep notes private';
        btnOpenAudienceText.textContent = live ? 'Open Another Audience Window' : 'Open Audience Window';
        if (dockSyncDot) dockSyncDot.style.display = live ? 'block' : 'none';
      } else {
        if (audBannerDot) audBannerDot.style.background = presCount > 0 ? '#10b981' : '#f59e0b';
        if (audBannerText) {
          audBannerText.innerHTML = (presCount > 0 ? 'Audience Window · Synced with Presenter' : 'Audience Window · Ready') +
            ' — Move to projector or share this tab, then press <strong>F</strong>';
        }
      }
    }

    function sendSync(payload, skipStorage) {
      if (syncClosed) return;
      syncSeq += 1;
      var env = { channel: syncChannelName, senderId: syncSenderId, seq: syncSeq, ts: Date.now(), payload: payload };
      if (syncBc) {
        try { syncBc.postMessage(env); } catch (_) {}
      }
      if (!skipStorage) {
        if (payload.type === 'laser') {
          if (syncBc) return;
          var isEdge = !payload.laser.active || payload.laser.phase === 'start' || payload.laser.phase === 'end' || payload.laser.phase === 'hide';
          var now = Date.now();
          if (!isEdge && now - lastStorageLaserEmit < 45) return;
          lastStorageLaserEmit = now;
        }
        try { localStorage.setItem(syncStorageKey, JSON.stringify(env)); } catch (_) {}
      }
    }

    function broadcastState(includeAnnotations) {
      var st = { slideIndex: index, blackout: blackoutOpen };
      if (includeAnnotations) st.annotationsBySlide = annotationsBySlide;
      sendSync({ type: 'state', state: st });
    }

    function emitLaserSync(normX, normY, active, phase) {
      if (isAudienceMode) return;
      var resolvedPhase = phase || (active ? 'hover' : 'hide');
      var isEdge = !active || resolvedPhase === 'start' || resolvedPhase === 'end' || resolvedPhase === 'hide';
      var now = performance.now();
      if (!isEdge && now - lastSyncLaserEmit < 16) return;
      lastSyncLaserEmit = now;
      sendSync({
        type: 'laser',
        laser: { active: active, x: normX, y: normY, color: laserColor, slideId: getCurrentSlideId(), phase: resolvedPhase }
      });
    }

    function handleIncomingSync(env) {
      if (syncClosed || !env || env.channel !== syncChannelName || env.senderId === syncSenderId || !env.payload) return;
      if (seenSyncSeq[env.senderId] && env.seq <= seenSyncSeq[env.senderId]) return;
      seenSyncSeq[env.senderId] = env.seq;
      var p = env.payload;
      if (p.type === 'presentation-ended') {
        delete syncPeers[env.senderId];
        updateSyncUi();
        if (isAudienceMode) setAudienceEnded(true);
        return;
      }
      if (p.type === 'hello' || p.type === 'ping') {
        syncPeers[env.senderId] = { role: p.role, lastSeen: Date.now() };
        updateSyncUi();
        sendSync({ type: 'pong', role: syncRole });
        if (p.type === 'hello' && !isAudienceMode) {
          broadcastState(true);
        } else if (isAudienceMode && p.role === 'presenter' && presentationEnded) {
          setAudienceEnded(false);
        }
        return;
      }
      if (p.type === 'pong') {
        syncPeers[env.senderId] = { role: p.role, lastSeen: Date.now() };
        updateSyncUi();
        if (isAudienceMode && p.role === 'presenter' && presentationEnded) {
          setAudienceEnded(false);
        }
        return;
      }
      if (p.type === 'goodbye') {
        delete syncPeers[env.senderId];
        updateSyncUi();
        return;
      }
      if (syncPeers[env.senderId]) syncPeers[env.senderId].lastSeen = Date.now();
      if (p.type === 'state' && p.state) {
        if (isAudienceMode && presentationEnded) {
          setAudienceEnded(false);
        }
        var targetIdx = Math.max(0, Math.min(slides.length - 1, Number(p.state.slideIndex || 0)));
        if (targetIdx !== index) {
          var dir = targetIdx >= index ? 1 : -1;
          index = targetIdx;
          render(dir);
        }
        setBlackout(Boolean(p.state.blackout), true);
        if (p.state.annotationsBySlide) {
          annotationsBySlide = p.state.annotationsBySlide;
          renderDrawCanvas();
        }
        if (isAudienceMode) audienceBanner.classList.remove('is-open');
        return;
      }
      if (p.type === 'laser' && p.laser) {
        var lPhase = p.laser.phase || (p.laser.active ? 'hover' : 'hide');
        if (p.laser.active && lPhase !== 'hide' && p.laser.slideId === getCurrentSlideId() && annSize.width > 0) {
          if (p.laser.color && p.laser.color !== laserColor) {
            laserColor = p.laser.color;
            updateLaserDotStyle();
          }
          var normPt = {
            x: Math.max(0, Math.min(1, Number(p.laser.x || 0))),
            y: Math.max(0, Math.min(1, Number(p.laser.y || 0)))
          };
          var rx = normPt.x * annSize.width;
          var ry = normPt.y * annSize.height;
          var pressed = lPhase === 'start' || lPhase === 'draw';
          laserDot.style.opacity = '1';
          laserDot.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) scale(' + (pressed ? 1.18 : 1) + ')';

          if (lPhase === 'start') {
            if (remoteActiveLaserStroke) remoteActiveLaserStroke.releasedAt = performance.now();
            remoteActiveLaserStroke = { points: [normPt], color: p.laser.color || laserColor, releasedAt: null };
            laserStrokes.push(remoteActiveLaserStroke);
            renderLaserCanvas();
          } else if (lPhase === 'draw') {
            if (!remoteActiveLaserStroke) {
              remoteActiveLaserStroke = { points: [normPt], color: p.laser.color || laserColor, releasedAt: null };
              laserStrokes.push(remoteActiveLaserStroke);
              renderLaserCanvas();
            } else if (appendLaserPt(remoteActiveLaserStroke, normPt)) {
              renderLaserCanvas();
            }
          } else if (lPhase === 'end') {
            if (remoteActiveLaserStroke) {
              appendLaserPt(remoteActiveLaserStroke, normPt);
              remoteActiveLaserStroke.releasedAt = performance.now();
              remoteActiveLaserStroke = null;
              renderLaserCanvas();
              ensureLaserLoop();
            }
          }
        } else {
          laserDot.style.opacity = '0';
          if (remoteActiveLaserStroke) {
            remoteActiveLaserStroke.releasedAt = performance.now();
            remoteActiveLaserStroke = null;
            ensureLaserLoop();
          }
        }
      }
    }

    function teardownPresentation() {
      if (syncClosed) return;
      if (!isAudienceMode) {
        sendSync({ type: 'presentation-ended', role: syncRole });
      }
      sendSync({ type: 'goodbye', role: syncRole });
      try { localStorage.removeItem(syncStorageKey); } catch (_) {}
      syncClosed = true;
      if (syncHeartbeatId !== null) {
        clearInterval(syncHeartbeatId);
        syncHeartbeatId = null;
      }
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
      if (syncBc) {
        try {
          syncBc.onmessage = null;
          syncBc.close();
        } catch (_) {}
        syncBc = null;
      }
      try {
        frame.srcdoc = '';
        frame.src = 'about:blank';
        if (nextFrame) {
          nextFrame.srcdoc = '';
          nextFrame.src = 'about:blank';
        }
      } catch (_) {}
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        syncBc = new BroadcastChannel(syncChannelName);
        syncBc.onmessage = function(ev) { handleIncomingSync(ev.data); };
      } catch (_) { syncBc = null; }
    }
    window.addEventListener('storage', function(ev) {
      if (ev.key !== syncStorageKey || !ev.newValue) return;
      try { handleIncomingSync(JSON.parse(ev.newValue)); } catch (_) {}
    });
    document.addEventListener('visibilitychange', function() {
      if (syncClosed || document.visibilityState !== 'visible') return;
      sendSync({ type: 'ping', role: syncRole }, Boolean(syncBc));
      updateSyncUi();
    });
    window.addEventListener('pagehide', teardownPresentation);
    window.addEventListener('beforeunload', teardownPresentation);
    sendSync({ type: 'hello', role: syncRole });
    syncHeartbeatId = setInterval(function() {
      sendSync({ type: 'ping', role: syncRole }, Boolean(syncBc));
      updateSyncUi();
    }, 2000);

    if (btnCopyAudience) {
      btnCopyAudience.addEventListener('click', function() {
        var href = buildAudienceHref();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(href).then(function() {
            btnCopyAudience.textContent = 'Copied';
            setTimeout(function() { btnCopyAudience.textContent = 'Copy Link'; }, 1800);
          }).catch(function() {});
        }
      });
    }
    pBlackoutPreview.addEventListener('click', function() { setBlackout(false); });

    var gridBuilt = false;
    var gridObserver = null;
    function toggleGrid(force) {
      if (!OPTS.includeGridAndBlackout) return;
      gridOpen = typeof force === 'boolean' ? force : !gridOpen;
      gridModal.classList.toggle('is-open', gridOpen);
      btnGrid.classList.toggle('active-blue', gridOpen);
      if (gridOpen) {
        setHelp(false);
        gridSubtitle.textContent = DECK.title + ' · ' + slides.length + ' slides';
        if (!gridBuilt) {
          gridBuilt = true;
          gridCards.innerHTML = '';
          if (typeof IntersectionObserver !== 'undefined') {
            gridObserver = new IntersectionObserver(function(entries) {
              entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                var sIdx = parseInt(el.getAttribute('data-slide-idx') || '-1', 10);
                var sObj = slides[sIdx];
                if (sObj && !el.getAttribute('data-loaded')) {
                  el.setAttribute('data-loaded', '1');
                  el.srcdoc = composeSlideDoc(sObj.doc);
                }
                gridObserver.unobserve(el);
              });
            }, { root: gridModal, rootMargin: '200px' });
          }
          slides.forEach(function(s, idx) {
            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'grid-card';
            card.setAttribute('data-idx', String(idx));
            var thumb = document.createElement('div');
            thumb.className = 'grid-thumb';
            thumb.style.background = s.bg || '#000000';
            var ifr = document.createElement('iframe');
            ifr.setAttribute('sandbox', 'allow-scripts');
            ifr.setAttribute('loading', 'lazy');
            ifr.setAttribute('tabindex', '-1');
            ifr.setAttribute('data-slide-idx', String(idx));
            ifr.title = 'Slide ' + (idx + 1);
            var tw = s.width || 1280, th = s.height || 720;
            ifr.style.width = tw + 'px';
            ifr.style.height = th + 'px';
            if (gridObserver) {
              gridObserver.observe(ifr);
            } else {
              ifr.setAttribute('data-loaded', '1');
              ifr.srcdoc = composeSlideDoc(s.doc);
            }
            thumb.appendChild(ifr);
            var meta = document.createElement('div');
            meta.className = 'grid-meta';
            var tSpan = document.createElement('span');
            tSpan.textContent = s.title;
            tSpan.style.overflow = 'hidden';
            tSpan.style.textOverflow = 'ellipsis';
            tSpan.style.whiteSpace = 'nowrap';
            var nSpan = document.createElement('span');
            nSpan.textContent = (idx + 1 < 10 ? '0' : '') + (idx + 1);
            nSpan.style.fontFamily = 'monospace';
            nSpan.style.color = '#94a3b8';
            meta.appendChild(tSpan);
            meta.appendChild(nSpan);
            card.appendChild(thumb);
            card.appendChild(meta);
            card.addEventListener('click', function() {
              goTo(idx);
              toggleGrid(false);
            });
            gridCards.appendChild(card);
          });
        }
        // Highlight current & scale thumbnails cleanly
        requestAnimationFrame(function() {
          gridCards.querySelectorAll('.grid-card').forEach(function(card, idx) {
            card.classList.toggle('is-current', idx === index);
            var thumb = card.querySelector('.grid-thumb');
            var ifr = card.querySelector('iframe');
            if (thumb && ifr) {
              var tr = thumb.getBoundingClientRect();
              var s = slides[idx];
              var tw = (s && s.width) || 1280;
              var th = (s && s.height) || 720;
              var sc = Math.min(tr.width / tw, tr.height / th);
              ifr.style.transform = 'scale(' + sc + ')';
              ifr.style.position = 'absolute';
              ifr.style.left = Math.round((tr.width - tw * sc) / 2) + 'px';
              ifr.style.top = Math.round((tr.height - th * sc) / 2) + 'px';
            }
          });
        });
      }
    }

    function setHelp(val) {
      helpOpen = Boolean(val);
      helpModal.classList.toggle('is-open', helpOpen);
      if (helpOpen) {
        var rows = [
          ['Next / Previous slide', 'Right / Left Arrow'],
          ['First / Last slide', 'Home / End']
        ];
        if (OPTS.includeAnnotations) {
          rows.push(['Laser Pointer', 'L']);
          rows.push(['Pen / Highlighter', 'P / H']);
          rows.push(['Arrow / Box', 'A / R (hold Shift)']);
          rows.push(['Stroke Eraser / Pointer', 'E / V']);
          rows.push(['Undo / Clear ink', 'Ctrl+Z / C']);
          rows.push(['Hide / Show Tool Options', 'O']);
        }
        rows.push(['Hide / Show Toolbar', 'T']);
        if (OPTS.includePresenterTools) rows.push(['Presenter Notes & Timer', 'N']);
        if (OPTS.includeGridAndBlackout) {
          rows.push(['Slide Grid Overview', 'G']);
          rows.push(['Blackout Screen', 'B']);
        }
        rows.push(['Fullscreen', 'F']);
        rows.push(['Close overlay / tool', 'Esc']);
        helpList.innerHTML = rows.map(function(r) {
          return '<li><span>' + r[0] + '</span><span class="help-key">' + r[1] + '</span></li>';
        }).join('');
      }
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function(){});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(function(){});
      }
    }

    // ==================== Event Wiring ====================
    prevBtn.addEventListener('click', function() { step(-1); });
    nextBtn.addEventListener('click', function() { step(1); });
    btnLaser.addEventListener('click', function() { setTool(activeTool === 'laser' ? 'pointer' : 'laser'); });
    btnDraw.addEventListener('click', function() { setTool((activeTool !== 'pointer' && activeTool !== 'laser') ? 'pointer' : lastDrawTool); });
    btnShowOpts.addEventListener('click', function() { setToolOptionsHidden(false); });
    btnHideDock.addEventListener('click', hideToolbar);
    dockReveal.addEventListener('click', showToolbar);
    document.getElementById('laser-hide-opts').addEventListener('click', function() { setToolOptionsHidden(true); });
    document.getElementById('draw-hide-opts').addEventListener('click', function() { setToolOptionsHidden(true); });
    document.getElementById('laser-close').addEventListener('click', function() { setTool('pointer'); });
    document.getElementById('draw-close').addEventListener('click', function() { setTool('pointer'); });
    btnNotes.addEventListener('click', togglePresenterView);
    btnGrid.addEventListener('click', function() { toggleGrid(); });
    document.getElementById('grid-close').addEventListener('click', function() { toggleGrid(false); });
    btnBlackout.addEventListener('click', function() { setBlackout(!blackoutOpen); });
    blackoutEl.addEventListener('click', function() { setBlackout(false); });
    btnFs.addEventListener('click', toggleFullscreen);
    btnHelp.addEventListener('click', function() { setHelp(!helpOpen); });
    document.getElementById('help-close').addEventListener('click', function() { setHelp(false); });
    helpModal.addEventListener('click', function(e) { if (e.target === helpModal) setHelp(false); });
    annUndoBtn.addEventListener('click', undoAnnotation);
    annClearBtn.addEventListener('click', clearAnnotations);

    drawBar.querySelectorAll('[data-tool]').forEach(function(b) {
      b.addEventListener('click', function() { setTool(b.getAttribute('data-tool')); });
    });
    laserBar.querySelectorAll('[data-laser-color]').forEach(function(b) {
      b.addEventListener('click', function() {
        laserColor = b.getAttribute('data-laser-color');
        laserBar.querySelectorAll('[data-laser-color]').forEach(function(s) { s.classList.toggle('is-selected', s === b); });
        updateLaserDotStyle();
      });
    });
    drawBar.querySelectorAll('[data-ink-color]').forEach(function(b) {
      b.addEventListener('click', function() {
        strokeColor = b.getAttribute('data-ink-color');
        drawBar.querySelectorAll('[data-ink-color]').forEach(function(s) { s.classList.toggle('is-selected', s === b); });
      });
    });
    drawBar.querySelectorAll('[data-size]').forEach(function(b) {
      b.addEventListener('click', function() {
        strokeSize = parseFloat(b.getAttribute('data-size')) || 5.5;
        drawBar.querySelectorAll('[data-size]').forEach(function(s) { s.classList.toggle('is-selected', s === b); });
      });
    });

    function handleKey(k) {
      if (k === 'Escape') {
        if (helpOpen) setHelp(false);
        else if (gridOpen) toggleGrid(false);
        else if (blackoutOpen) setBlackout(false);
        else if (activeTool !== 'pointer') setTool('pointer');
        return;
      }
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'ArrowDown') step(1);
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') step(-1);
      else if (k === 'Home') goTo(0);
      else if (k === 'End') goTo(slides.length - 1);
      else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'n' || k === 'N') { if (!isAudienceMode) togglePresenterView(); }
      else if (k === 'g' || k === 'G') { if (!isAudienceMode) toggleGrid(); }
      else if (k === 'b' || k === 'B') setBlackout(!blackoutOpen);
      else if (k === 't' || k === 'T') toggleToolbarHidden();
      else if (k === '?') { if (!isAudienceMode) setHelp(!helpOpen); }
      else if (!isAudienceMode && OPTS.includeAnnotations) {
        if (k === 'l' || k === 'L') setTool(activeTool === 'laser' ? 'pointer' : 'laser');
        else if (k === 'p' || k === 'P') setTool(activeTool === 'pen' ? 'pointer' : 'pen');
        else if (k === 'h' || k === 'H') setTool(activeTool === 'highlighter' ? 'pointer' : 'highlighter');
        else if (k === 'a' || k === 'A') setTool(activeTool === 'arrow' ? 'pointer' : 'arrow');
        else if (k === 'r' || k === 'R') setTool(activeTool === 'rect' ? 'pointer' : 'rect');
        else if (k === 'e' || k === 'E') setTool(activeTool === 'eraser' ? 'pointer' : 'eraser');
        else if (k === 'v' || k === 'V') setTool('pointer');
        else if (k === 'c' || k === 'C') clearAnnotations();
        else if ((k === 'o' || k === 'O') && activeTool !== 'pointer') setToolOptionsHidden(!toolOptionsHidden);
      }
    }

    window.addEventListener('keydown', function(e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isAudienceMode && OPTS.includeAnnotations) {
        e.preventDefault();
        undoAnnotation();
        return;
      }
      if (['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'Home', 'End'].indexOf(e.key) !== -1) {
        e.preventDefault();
      }
      handleKey(e.key);
    });

    window.addEventListener('message', function(e) {
      if (e.source !== frame.contentWindow || !e.data || e.data.source !== 'slideino-frame') return;
      if (e.data.type === 'content-size' && DECK.dims.auto && e.data.payload) {
        var w = Math.max(480, Math.min(3840, Math.round(e.data.payload.width || 1280)));
        var h = Math.max(320, Math.min(2400, Math.round(e.data.payload.height || 720)));
        if (Math.abs(activeDims.width - w) >= 4 || Math.abs(activeDims.height - h) >= 4) {
          activeDims = { width: w, height: h };
          layout();
        }
        return;
      }
      if (e.data.type === 'keydown' && e.data.payload && typeof e.data.payload.key === 'string') {
        handleKey(e.data.payload.key);
      }
    });

    var touchStartX = null;
    window.addEventListener('touchstart', function(e) {
      if (activeTool !== 'pointer') return;
      touchStartX = e.changedTouches[0] ? e.changedTouches[0].screenX : null;
    }, { passive: true });
    window.addEventListener('touchend', function(e) {
      if (activeTool !== 'pointer' || touchStartX === null) return;
      var dx = (e.changedTouches[0] ? e.changedTouches[0].screenX : 0) - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
      else bumpControls(true);
    }, { passive: true });

    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', function() {
      if (document.fullscreenElement && isAudienceMode) audienceBanner.classList.remove('is-open');
      setTimeout(layout, 60);
    });
    bumpControls(true);
    render(0);
  })();
  </script>
</body>
</html>`;

  const byteSize = new Blob([html]).size;
  return {
    html,
    slideCount: compiledSlides.length,
    byteSize,
  };
}
