import {
  CustomResource,
  LibraryConfig,
  Slide,
  SlideTheme,
} from '../types/slideino';
import { isValidHttpsUrl } from './storage';
import { buildVisualEditorInjection } from './visualEditorScript';
import { buildAutoGoogleFontsLink } from '../data/fonts';

export interface BuildSlideOptions {
  slide: Slide;
  theme: SlideTheme;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  instanceId: string;
  origin: string;
  isThumbnail?: boolean;
  editMode?: boolean;
  autoSize?: boolean;
  autoBaseDims?: { width: number; height: number };
  prefersReducedMotion?: boolean;
}

const MIN_AUTO_W = 480;
const MAX_AUTO_W = 3840;
const MIN_AUTO_H = 320;
const MAX_AUTO_H = 2400;

function extractPxPair(block: string): { width: number; height: number } | null {
  const wMatch = block.match(/(?:^|[;{\s])(?:min-)?width\s*:\s*(\d{3,4})(?:\.\d+)?px\b/i);
  const hMatch = block.match(/(?:^|[;{\s])(?:min-)?height\s*:\s*(\d{3,4})(?:\.\d+)?px\b/i);
  if (!wMatch || !hMatch) return null;
  const width = Math.round(Number(wMatch[1]));
  const height = Math.round(Number(hMatch[1]));
  if (
    width >= MIN_AUTO_W &&
    width <= MAX_AUTO_W &&
    height >= MIN_AUTO_H &&
    height <= MAX_AUTO_H
  ) {
    return { width, height };
  }
  return null;
}

/**
 * Fast static detector for explicit slide canvas pixel dimensions (e.g. 1536x864, 1920x1080, 1440x900)
 * declared on root slide containers or inline styles before the iframe finishes rendering.
 */
export function detectSlideStaticDimensions(
  html: string,
  css = ''
): { width: number; height: number } | null {
  const source = `${css}\n${html}`;
  if (!source.trim()) return null;

  // 1. Check CSS rule blocks targeting known slide root selectors
  const cssRuleRegex =
    /(?:^|[\s},])(html|body|\.slide-container|\.slide-canvas|\.presentation-slide|\.slide|#slide|\[data-slide[^\]]*\])[^{]*\{([^}]{1,1200})\}/gi;
  let match: RegExpExecArray | null;
  let best: { width: number; height: number } | null = null;
  while ((match = cssRuleRegex.exec(source)) !== null) {
    const pair = extractPxPair(match[2]);
    if (pair && (!best || pair.width * pair.height > best.width * best.height)) {
      best = pair;
    }
  }
  if (best) return best;

  // 2. Check inline style on <body> or top-level wrapper (<div>/<section>/<main>/<article>)
  const inlineRootRegex =
    /<(body|div|section|main|article)\b[^>]*\bstyle\s*=\s*["']([^"']{1,800})["']/gi;
  let checked = 0;
  while ((match = inlineRootRegex.exec(html)) !== null && checked < 6) {
    checked += 1;
    const pair = extractPxPair(match[2]);
    if (pair) return pair;
  }

  return null;
}

function escapeStyleClose(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function stripConflictingMetaTags(html: string): string {
  return html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
    ''
  );
}

function resolveLocalAssetPaths(html: string, origin: string): string {
  if (!origin || (!origin.startsWith('https://') && !origin.startsWith('http://'))) {
    return html;
  }
  const cleanOrigin = origin.replace(/\/$/, '');
  return html.replace(
    /(src|href)=["'](\/src\/assets\/[^"']+)["']/gi,
    (_match, attr: string, path: string) => `${attr}="${cleanOrigin}${path}"`
  );
}

function buildLibraryHeadTags(
  libraries: LibraryConfig,
  theme: SlideTheme,
  customResources: CustomResource[],
  isThumbnail: boolean,
  isStandalone: boolean
): string {
  const tags: string[] = [];

  if (!isStandalone) {
    // Google Fonts for built-in typography families
    tags.push(
      `<link rel="preconnect" href="https://fonts.googleapis.com">`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap">`
    );

    if (libraries.tailwind) {
      tags.push(`<script src="https://cdn.tailwindcss.com"></script>`);
    }

    if (libraries.katex) {
      tags.push(
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`,
        `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>`,
        `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>`
      );
    }

    if (libraries.highlightjs) {
      const hlTheme = theme.isDark ? 'github-dark' : 'github';
      tags.push(
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/styles/${hlTheme}.min.css">`,
        `<script defer src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>`
      );
    }

    if (libraries.mermaid) {
      tags.push(
        `<script defer src="https://cdn.jsdelivr.net/npm/mermaid@11.4.0/dist/mermaid.min.js"></script>`
      );
    }

    if (libraries.chartjs) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>`
      );
    }

    if (libraries.lucide) {
      tags.push(
        `<script defer src="https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js"></script>`
      );
    }

    if (libraries.fontawesome) {
      tags.push(
        `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">`
      );
    }

    if (libraries.animatecss && !isThumbnail) {
      tags.push(
        `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">`
      );
    }

    if (libraries.d3) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>`
      );
    }
  }

  for (const res of customResources) {
    if (!isValidHttpsUrl(res.url)) continue;
    const safeUrl = res.url.replace(/"/g, '&quot;');
    if (res.type === 'style') {
      tags.push(`<link rel="stylesheet" href="${safeUrl}">`);
    } else {
      tags.push(`<script defer src="${safeUrl}"></script>`);
    }
  }

  return tags.join('\n');
}

function buildRootVariablesCss(theme: SlideTheme, slide: Slide): string {
  const bg = slide.backgroundOverride?.trim() || theme.tokens.bg;
  return `
:root {
  --slide-bg: ${bg};
  --slide-surface: ${theme.tokens.surface};
  --slide-text: ${theme.tokens.text};
  --slide-muted: ${theme.tokens.muted};
  --slide-accent: ${theme.tokens.accent};
  --slide-border: ${theme.tokens.border};
  --slide-font-display: ${theme.tokens.fontDisplay};
  --slide-font-body: ${theme.tokens.fontBody};
  --slide-font-mono: ${theme.tokens.fontMono};
  --slide-font-size: ${theme.tokens.baseFontSize}px;
  --slide-radius: ${theme.tokens.radius}px;
  --slide-padding: ${theme.tokens.padding}px;
}
`;
}

function buildMotionCss(prefersReducedMotion: boolean, isThumbnail: boolean): string {
  return prefersReducedMotion || isThumbnail
    ? `*, *::before, *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
}`
    : `@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}`;
}

function buildThemeCss(
  theme: SlideTheme,
  slide: Slide,
  prefersReducedMotion: boolean,
  isThumbnail: boolean,
  autoSize: boolean
): string {
  return `
${buildRootVariablesCss(theme, slide)}
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  ${autoSize ? 'min-height: 100%; height: 100%; overflow: visible;' : 'height: 100%; overflow: hidden;'}
  background: var(--slide-bg);
  color: var(--slide-text);
  font-family: var(--slide-font-body);
  font-size: var(--slide-font-size);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img, svg, canvas, video {
  max-width: 100%;
}

.hljs {
  background: var(--slide-surface) !important;
}

${buildMotionCss(prefersReducedMotion, isThumbnail)}

${escapeStyleClose(theme.customCss || '')}
${escapeStyleClose(slide.css || '')}
`;
}

function buildStandaloneOverrideCss(
  slide: Slide,
  prefersReducedMotion: boolean,
  isThumbnail: boolean
): string {
  const parts: string[] = [buildMotionCss(prefersReducedMotion, isThumbnail)];

  if (slide.backgroundOverride?.trim()) {
    parts.push(`html, body { background: ${slide.backgroundOverride.trim()} !important; }`);
  }

  if (slide.css?.trim()) {
    parts.push(escapeStyleClose(slide.css));
  }

  return parts.join('\n');
}

function buildRuntimeBootstrapScript(
  instanceId: string,
  theme: SlideTheme,
  libraries: LibraryConfig,
  isThumbnail: boolean,
  editMode: boolean,
  autoSize: boolean,
  autoBaseDims?: { width: number; height: number }
): string {
  const safeId = JSON.stringify(instanceId);
  const mermaidTheme = theme.isDark ? 'dark' : 'neutral';
  const baseW = autoBaseDims?.width || 1280;
  const baseH = autoBaseDims?.height || 720;

  return `<script data-slideino-runtime="true">
(function() {
  var INSTANCE_ID = ${safeId};
  var IS_THUMBNAIL = ${isThumbnail ? 'true' : 'false'};
  var EDIT_MODE = ${editMode ? 'true' : 'false'};
  var AUTO_SIZE = ${autoSize ? 'true' : 'false'};
  var AUTO_BASE_W = ${Math.round(baseW)};
  var AUTO_BASE_H = ${Math.round(baseH)};

  function postHost(type, payload) {
    try {
      window.parent.postMessage({
        source: 'slideino-frame',
        instanceId: INSTANCE_ID,
        type: type,
        payload: payload
      }, '*');
    } catch (_) {}
  }

  window.addEventListener('error', function(e) {
    if (IS_THUMBNAIL) return;
    postHost('runtime-error', {
      message: String(e.message || 'Slide script error').slice(0, 240)
    });
  });

  if (!IS_THUMBNAIL && !EDIT_MODE) {
    window.addEventListener('keydown', function(e) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) {
        return;
      }
      var forwardKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'PageDown', 'PageUp', 'Home', 'End', 'Escape', 'f', 'F', 'g', 'G', 'n', 'N', 'b', 'B', '?'];
      if (forwardKeys.indexOf(e.key) !== -1) {
        postHost('keydown', { key: e.key, shiftKey: !!e.shiftKey });
      }
    });
  }

  function hydrateLibraries() {
    // 1. Lucide icons
    ${
      libraries.lucide
        ? `try { if (window.lucide && typeof window.lucide.createIcons === 'function') { window.lucide.createIcons(); } } catch (_) {}`
        : ''
    }

    // 2. Highlight.js
    ${
      libraries.highlightjs
        ? `try {
      if (window.hljs && typeof window.hljs.highlightAll === 'function') {
        window.hljs.highlightAll();
      }
    } catch (_) {}`
        : ''
    }

    // 3. KaTeX auto-render
    ${
      libraries.katex
        ? `try {
      if (typeof window.renderMathInElement === 'function') {
        window.renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\\\(', right: '\\\\)', display: false },
            { left: '\\\\[', right: '\\\\]', display: true }
          ],
          throwOnError: false
        });
      }
    } catch (_) {}`
        : ''
    }

    // 4. Mermaid diagrams
    ${
      libraries.mermaid
        ? `try {
      if (window.mermaid && document.querySelector('.mermaid')) {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: ${JSON.stringify(mermaidTheme)},
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--slide-font-body').trim() || 'sans-serif'
        });
        window.mermaid.run({ querySelector: '.mermaid' }).catch(function() {});
      }
    } catch (_) {}`
        : ''
    }
  }

  var lastReportedW = AUTO_BASE_W;
  var lastReportedH = AUTO_BASE_H;
  var measureTimer = null;

  function findClippingAncestorRect(el, stopNode) {
    var cur = el.parentElement;
    var clipR = null;
    while (cur && cur !== stopNode && cur !== document.body && cur !== document.documentElement) {
      var cs = window.getComputedStyle(cur);
      var ox = cs.overflowX;
      var oy = cs.overflowY;
      if (ox === 'hidden' || ox === 'clip' || oy === 'hidden' || oy === 'clip') {
        var r = cur.getBoundingClientRect();
        if (!clipR) {
          clipR = { right: r.right, bottom: r.bottom };
        } else {
          clipR.right = Math.min(clipR.right, r.right);
          clipR.bottom = Math.min(clipR.bottom, r.bottom);
        }
      }
      cur = cur.parentElement;
    }
    return clipR;
  }

  function measureAndReportSize() {
    if (!AUTO_SIZE) return;
    if (document.documentElement && document.documentElement.classList.contains('__sl_dragging__')) {
      return;
    }
    try {
      var measuredW = Math.max(AUTO_BASE_W, lastReportedW);
      var measuredH = Math.max(AUTO_BASE_H, lastReportedH);

      var explicitRoot = document.querySelector(
        '.slide-container, .slide-canvas, .presentation-slide, .slide, #slide, [data-slide], [data-slide-canvas]'
      );
      if (explicitRoot && explicitRoot.getBoundingClientRect) {
        var er = explicitRoot.getBoundingClientRect();
        var ecs = window.getComputedStyle(explicitRoot);
        var ew = Math.ceil(Math.max(er.width, explicitRoot.scrollWidth || 0));
        var eh = Math.ceil(Math.max(er.height, explicitRoot.scrollHeight || 0));
        if (ew >= 480 && eh >= 320 && ecs.display !== 'none') {
          measuredW = Math.max(measuredW, ew);
          measuredH = Math.max(measuredH, eh);
        }
      }

      var docEl = document.documentElement;
      var body = document.body;
      if (docEl) {
        measuredW = Math.max(measuredW, Math.ceil(docEl.scrollWidth || 0));
        measuredH = Math.max(measuredH, Math.ceil(docEl.scrollHeight || 0));
      }
      if (body) {
        measuredW = Math.max(measuredW, Math.ceil(body.scrollWidth || 0));
        measuredH = Math.max(measuredH, Math.ceil(body.scrollHeight || 0));
      }

      var scanRoot = explicitRoot || body;
      if (scanRoot) {
        var rootRect = scanRoot.getBoundingClientRect();
        var originLeft = Math.min(0, rootRect.left);
        var originTop = Math.min(0, rootRect.top);
        var nodes = scanRoot.querySelectorAll('*');
        var limit = Math.min(nodes.length, 600);
        for (var i = 0; i < limit; i++) {
          var el = nodes[i];
          if (!el || !el.getBoundingClientRect) continue;
          if (
            el.id === '__slideino_editor_overlay__' ||
            el.hasAttribute('data-slideino-editor') ||
            (el.closest && el.closest('#__slideino_editor_overlay__'))
          ) {
            continue;
          }
          var tag = el.tagName ? el.tagName.toLowerCase() : '';
          if (
            tag === 'script' ||
            tag === 'style' ||
            tag === 'link' ||
            tag === 'meta' ||
            tag === 'head' ||
            tag === 'title'
          ) {
            continue;
          }
          var cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
            continue;
          }
          if (cs.pointerEvents === 'none' && cs.filter && cs.filter.indexOf('blur') !== -1) {
            continue;
          }
          var r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0) continue;

          var clip = findClippingAncestorRect(el, scanRoot);
          var visibleRight = clip ? Math.min(r.right, clip.right) : r.right;
          var visibleBottom = clip ? Math.min(r.bottom, clip.bottom) : r.bottom;

          var rightEdge = Math.ceil(visibleRight - originLeft);
          var bottomEdge = Math.ceil(visibleBottom - originTop);
          if (rightEdge > measuredW && rightEdge <= ${MAX_AUTO_W}) {
            measuredW = rightEdge;
          }
          if (bottomEdge > measuredH && bottomEdge <= ${MAX_AUTO_H}) {
            measuredH = bottomEdge;
          }
        }
      }

      measuredW = Math.max(${MIN_AUTO_W}, Math.min(${MAX_AUTO_W}, Math.round(measuredW)));
      measuredH = Math.max(${MIN_AUTO_H}, Math.min(${MAX_AUTO_H}, Math.round(measuredH)));

      if (Math.abs(measuredW - lastReportedW) >= 4 || Math.abs(measuredH - lastReportedH) >= 4) {
        lastReportedW = measuredW;
        lastReportedH = measuredH;
        postHost('content-size', { width: measuredW, height: measuredH });
      }
    } catch (_) {}
  }

  function scheduleMeasure(delay) {
    if (!AUTO_SIZE) return;
    if (measureTimer) clearTimeout(measureTimer);
    measureTimer = setTimeout(measureAndReportSize, delay || 40);
  }

  function onReady() {
    setTimeout(hydrateLibraries, 20);
    if (AUTO_SIZE) {
      scheduleMeasure(40);
      setTimeout(measureAndReportSize, 220);
      setTimeout(measureAndReportSize, 650);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() { scheduleMeasure(30); }).catch(function() {});
      }
      if (typeof ResizeObserver === 'function' && document.body) {
        try {
          var ro = new ResizeObserver(function() { scheduleMeasure(80); });
          ro.observe(document.body);
        } catch (_) {}
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', function() {
    hydrateLibraries();
    scheduleMeasure(50);
  });
})();
</script>`;
}

export function buildSlideDocument(options: BuildSlideOptions): string {
  const {
    slide,
    theme,
    libraries,
    customResources,
    sharedCss,
    instanceId,
    origin,
    isThumbnail = false,
    editMode = false,
    autoSize = false,
    autoBaseDims,
    prefersReducedMotion = false,
  } = options;

  const processedHtml = resolveLocalAssetPaths(
    stripConflictingMetaTags(slide.html || ''),
    origin
  );

  // Detect if slide is a complete HTML document (<!DOCTYPE html> or <html>)
  const isFullDocument = /<!doctype\s+html|<html[\s>]/i.test(processedHtml);
  const isStandalone = Boolean(slide.standalone) || isFullDocument;
  const activeEditMode = Boolean(editMode && !isThumbnail);

  const autoFontLink = buildAutoGoogleFontsLink(processedHtml, slide.css || '', sharedCss);

  const headTags = buildLibraryHeadTags(
    libraries,
    theme,
    customResources,
    isThumbnail,
    isStandalone
  );
  const sharedStyleTag = sharedCss?.trim()
    ? `<style data-slideino-shared="true">${escapeStyleClose(sharedCss)}</style>`
    : '';
  const runtimeScript = buildRuntimeBootstrapScript(
    instanceId,
    theme,
    libraries,
    isThumbnail,
    activeEditMode,
    autoSize,
    autoBaseDims
  );
  const visualEditorScript = activeEditMode
    ? buildVisualEditorInjection(instanceId, isFullDocument)
    : '';

  if (isFullDocument) {
    let doc = processedHtml;
    const basePrefix = [
      `<style data-slideino-tokens="true">${escapeStyleClose(
        buildRootVariablesCss(theme, slide)
      )}</style>`,
      sharedStyleTag,
    ]
      .filter(Boolean)
      .join('\n');

    const overrideSuffix = [
      autoFontLink,
      headTags,
      `<style data-slideino-overrides="true">${escapeStyleClose(
        buildStandaloneOverrideCss(slide, prefersReducedMotion, isThumbnail)
      )}</style>`,
    ]
      .filter(Boolean)
      .join('\n');

    // Inject tokens + shared fonts at the beginning of <head> so the slide's own styles take priority
    if (/<head[^>]*>/i.test(doc)) {
      doc = doc.replace(/<head[^>]*>/i, (match) => `${match}\n${basePrefix}`);
    } else if (/<html[^>]*>/i.test(doc)) {
      doc = doc.replace(/<html[^>]*>/i, (match) => `${match}\n<head>\n${basePrefix}`);
      if (!/<\/head>/i.test(doc) && /<body[\s>]/i.test(doc)) {
        doc = doc.replace(/<body/i, `</head>\n<body`);
      }
    } else {
      doc = `${basePrefix}\n${doc}`;
    }

    // Inject user overrides & custom resources at the end of </head>
    if (/<\/head>/i.test(doc)) {
      doc = doc.replace(/<\/head>/i, `${overrideSuffix}\n</head>`);
    } else if (/<body[\s>]/i.test(doc)) {
      doc = doc.replace(/<body/i, `${overrideSuffix}\n<body`);
    } else {
      doc = `${overrideSuffix}\n${doc}`;
    }

    const bodySuffix = [runtimeScript, visualEditorScript].filter(Boolean).join('\n');
    if (/<\/body>/i.test(doc)) {
      doc = doc.replace(/<\/body>/i, `${bodySuffix}\n</body>`);
    } else {
      doc = `${doc}\n${bodySuffix}`;
    }
    return doc;
  }

  const themeStyleTag = `<style data-slideino-theme="true">${escapeStyleClose(
    buildThemeCss(theme, slide, prefersReducedMotion, isThumbnail, autoSize)
  )}</style>`;

  // Wrap HTML fragment cleanly
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${sharedStyleTag}
  ${autoFontLink}
  ${headTags}
  ${themeStyleTag}
</head>
<body>
${processedHtml}
${runtimeScript}
${visualEditorScript}
</body>
</html>`;
}
