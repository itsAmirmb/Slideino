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
  preloadPaused?: boolean;
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

  // 0. Check explicit Slideino stage metadata (e.g. from Reveal.js standalone import)
  const stageAttrMatch = html.match(
    /(?:data-slideino-stage|name=["']slideino-stage["'][^>]*content)\s*=\s*["'](\d{3,4})x(\d{3,4})["']/i
  );
  if (stageAttrMatch) {
    const width = Math.round(Number(stageAttrMatch[1]));
    const height = Math.round(Number(stageAttrMatch[2]));
    if (
      width >= MIN_AUTO_W &&
      width <= MAX_AUTO_W &&
      height >= MIN_AUTO_H &&
      height <= MAX_AUTO_H
    ) {
      return { width, height };
    }
  }

  // 1. Check CSS rule blocks targeting known slide root selectors (including Reveal.js .slides)
  const cssRuleRegex =
    /(?:^|[\s},])(html|body|\.slides|\.slide-container|\.slide-canvas|\.presentation-slide|\.slide|#slide|\[data-slide[^\]]*\])[^{]*\{([^}]{1,1200})\}/gi;
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

  // 3. Check Reveal.js JS configuration dimensions (e.g. Reveal.initialize({ width: 1920, height: 1080 }))
  if (/\bReveal\b/i.test(html)) {
    const revealDimMatch = html.match(
      /\bwidth\s*:\s*(\d{3,4})\b[\s\S]{0,160}?\bheight\s*:\s*(\d{3,4})\b/
    );
    if (revealDimMatch) {
      const width = Math.round(Number(revealDimMatch[1]));
      const height = Math.round(Number(revealDimMatch[2]));
      if (
        width >= MIN_AUTO_W &&
        width <= MAX_AUTO_W &&
        height >= MIN_AUTO_H &&
        height <= MAX_AUTO_H
      ) {
        return { width, height };
      }
    }
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

function buildRevealCompatCss(isThumbnail: boolean, editMode: boolean, prefersReducedMotion: boolean): string {
  const instant = isThumbnail || editMode || prefersReducedMotion;
  return `
/* Reveal.js Layout & Utility Compatibility Layer (zero-specificity base) */
:where(.reveal, .reveal .slides) { width: 100%; height: 100%; position: relative; }
:where(section.reveal-slide, .reveal .slides > section) {
  width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center;
}
.r-hstack { display: flex; flex-direction: row; align-items: center; justify-content: center; }
.r-vstack { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.r-stack { display: grid; }
.r-stack > * { grid-area: 1 / 1; margin: auto; }
.r-stretch { flex: 1 1 auto; min-height: 0; max-width: 100%; object-fit: contain; }
.r-frame { border: 4px solid var(--slide-border); box-shadow: 0 12px 32px rgba(0,0,0,0.16); border-radius: var(--slide-radius); }
.r-fit-text { display: inline-block; white-space: nowrap; max-width: 100%; }
aside.notes { display: none !important; }
${
  instant
    ? `.fragment { opacity: 1 !important; visibility: visible !important; transform: none !important; }`
    : `.fragment { opacity: 0; transition: opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), transform 420ms cubic-bezier(0.16, 1, 0.3, 1); }
.fragment.fade-up { transform: translateY(18px); }
.fragment.fade-down { transform: translateY(-18px); }
.fragment.fade-left { transform: translateX(20px); }
.fragment.fade-right { transform: translateX(-20px); }
.fragment.zoom-in { transform: scale(0.94); }
.fragment.visible { opacity: 1; transform: none; }
.fragment.visible.highlight-red { color: #ef4444; }
.fragment.visible.highlight-blue { color: #3b82f6; }
.fragment.visible.highlight-green { color: #22c55e; }`
}
`;
}

const TAILWIND_CLASS_PATTERN =
  /(?:^|[\s"'`])(?:(?:sm|md|lg|xl|2xl|hover|focus|active|dark|group-hover):)?(?:flex|inline-flex|grid|inline-grid|block|inline-block|hidden|relative|absolute|fixed|sticky|static|inset-[a-z0-9[\]-]+|top-\d|right-\d|bottom-\d|left-\d|items-[a-z]+|justify-[a-z]+|content-[a-z]+|self-[a-z]+|place-[a-z-]+|flex-(?:row|col|wrap|nowrap|1|auto|initial|none|grow|shrink)|grow|shrink|shrink-0|gap-[xy0-9[\].-]+|space-[xy]-[0-9[\].-]+|p[trblxy]?-(?:\d|px|auto|\[)|m[trblxy]?-(?:\d|px|auto|\[)|-m[trblxy]?-\d|w-(?:\d|full|screen|auto|fit|min|max|px|1\/|2\/|3\/|4\/|5\/|\[)|h-(?:\d|full|screen|auto|fit|min|max|px|1\/|2\/|3\/|\[)|min-[wh]-[a-z0-9[\]/]+|max-[wh]-[a-z0-9[\]/]+|aspect-[a-z0-9[\]/]+|text-(?:xs|sm|base|lg|xl|\dxl|left|center|right|justify|balance|pretty|wrap|nowrap|truncate|white|black|transparent|current|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|\[)|bg-(?:white|black|transparent|current|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gradient|none|cover|contain|center|\[)|from-[a-z0-9[\]-]+|via-[a-z0-9[\]-]+|to-[a-z0-9[\]-]+|border(?:-[trblxy0-9]|-solid|-dashed|-dotted|-none|-white|-black|-transparent|-slate|-gray|-zinc|-neutral|-stone|-red|-orange|-amber|-yellow|-green|-emerald|-teal|-cyan|-sky|-blue|-indigo|-violet|-purple|-pink|-rose|-\[)?|divide-[a-z0-9-]+|rounded(?:-[a-z0-9[\]-]+)?|shadow(?:-[a-z0-9[\]-]+)?|ring(?:-[a-z0-9[\]-]+)?|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono|\[)|leading-[a-z0-9[\]-]+|tracking-[a-z0-9[\]-]+|uppercase|lowercase|capitalize|italic|underline|line-through|truncate|antialiased|tabular-nums|opacity-\d+|z-(?:\d+|auto|\[)|col-span-|row-span-|grid-cols-|grid-rows-|overflow-[a-z-]+|backdrop-[a-z0-9-]+|transition(?:-[a-z]+)?|duration-\d+|ease-[a-z]+|scale-\d+|rotate-\d+|translate-[xy]-|object-(?:cover|contain|fill|center)|pointer-events-|select-(?:none|text|all|auto)|cursor-[a-z-]+|sr-only)(?=$|[\s"'`])/;

function extractClassAttributeText(html: string): string {
  const parts: string[] = [];
  const regex = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const val = match[1] ?? match[2] ?? '';
    if (val) parts.push(val);
  }
  return parts.join(' ');
}

function detectUsedLibraries(
  libraries: LibraryConfig,
  rawHtml: string,
  slideCss: string,
  isThumbnail: boolean,
  isStandalone: boolean
): LibraryConfig {
  const html = rawHtml || '';
  const classText = extractClassAttributeText(html);

  const usesTailwind =
    libraries.tailwind &&
    !isStandalone &&
    !/<script[^>]+tailwindcss/i.test(html) &&
    (/\btailwind\.config\b/i.test(html) ||
      (classText.length > 0 && TAILWIND_CLASS_PATTERN.test(classText)));

  const usesKatex =
    libraries.katex &&
    !isStandalone &&
    (/\$\$|\$[^$\n]+\$|\\\(|\\\[|\bkatex\s*\./i.test(html) ||
      /\bkatex\b/i.test(classText) ||
      /\bkatex\b/i.test(slideCss));

  const usesHighlight =
    libraries.highlightjs &&
    !isStandalone &&
    (/<pre\b|<code\b/i.test(html) || /\bhljs\b/i.test(classText));

  const usesMermaid =
    libraries.mermaid &&
    !isStandalone &&
    (/\bmermaid\b/i.test(classText) || /\bmermaid\s*\./i.test(html));

  const usesChartjs =
    libraries.chartjs &&
    !isStandalone &&
    (/<canvas\b/i.test(html) || /\bnew\s+Chart\s*\(|\bChart\s*\.\s*(?:register|defaults|getChart)\b/.test(html));

  const usesLucide =
    libraries.lucide &&
    (/data-lucide\s*=/i.test(html) || /\blucide\s*\.\s*createIcons\b/.test(html)) &&
    (!isStandalone || !/<script[^>]+lucide/i.test(html));

  const usesGsap =
    libraries.gsap &&
    /\bgsap\s*\.|\bScrollTrigger\b/.test(html) &&
    (!isStandalone || !/<script[^>]+gsap/i.test(html));

  const usesFontAwesome =
    libraries.fontawesome &&
    !isStandalone &&
    classText.length > 0 &&
    /\bfa[srbldk]?\s+fa-|\bfa-[a-z0-9-]+/i.test(classText);

  const usesAnimateCss =
    libraries.animatecss &&
    !isThumbnail &&
    !isStandalone &&
    classText.length > 0 &&
    /\banimate__/i.test(classText);

  const usesD3 =
    libraries.d3 &&
    !isStandalone &&
    /\bd3\s*\./.test(html);

  const usesReveal =
    libraries.revealjs &&
    classText.length > 0 &&
    /\b(?:reveal|reveal-slide|r-hstack|r-vstack|r-stack|r-stretch|r-frame|r-fit-text|fragment)\b/i.test(classText);

  return {
    tailwind: usesTailwind,
    katex: usesKatex,
    highlightjs: usesHighlight,
    mermaid: usesMermaid,
    chartjs: usesChartjs,
    lucide: usesLucide,
    gsap: usesGsap,
    revealjs: usesReveal,
    fontawesome: usesFontAwesome,
    animatecss: usesAnimateCss,
    d3: usesD3,
  };
}

function buildLibraryHeadTags(
  used: LibraryConfig,
  theme: SlideTheme,
  customResources: CustomResource[],
  isThumbnail: boolean,
  isStandalone: boolean
): string {
  const tags: string[] = [];

  if (!isStandalone) {
    if (used.tailwind) {
      tags.push(`<script src="https://cdn.tailwindcss.com"></script>`);
    }

    if (used.katex) {
      tags.push(
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`,
        `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>`,
        `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>`
      );
    }

    if (used.highlightjs) {
      const hlTheme = theme.isDark ? 'github-dark' : 'github';
      tags.push(
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/styles/${hlTheme}.min.css">`,
        `<script defer src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>`
      );
    }

    if (used.mermaid) {
      tags.push(
        `<script defer src="https://cdn.jsdelivr.net/npm/mermaid@11.4.0/dist/mermaid.min.js"></script>`
      );
    }

    if (used.chartjs) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>`
      );
    }

    if (used.lucide) {
      tags.push(
        `<script defer src="https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js"></script>`
      );
    }

    if (used.gsap) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>`
      );
    }

    if (used.fontawesome) {
      tags.push(
        `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">`
      );
    }

    if (used.animatecss && !isThumbnail) {
      tags.push(
        `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">`
      );
    }

    if (used.d3) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>`
      );
    }
  } else {
    // Smart fallback for standalone HTML documents that reference Lucide or GSAP without bundling CDN tags
    if (used.lucide) {
      tags.push(
        `<script defer src="https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js"></script>`
      );
    }
    if (used.gsap) {
      tags.push(
        `<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>`
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

function buildSingleSlideRevealShimScript(): string {
  return `<script data-slideino-reveal-shim="true">
(function(g) {
  'use strict';
  // Sandbox-safe History API guard (prevents SecurityError in opaque about:srcdoc iframes)
  try {
    if (g.history) {
      var origReplace = g.history.replaceState && g.history.replaceState.bind(g.history);
      var origPush = g.history.pushState && g.history.pushState.bind(g.history);
      if (origReplace) {
        g.history.replaceState = function() {
          try { return origReplace.apply(g.history, arguments); } catch (_) {}
        };
      }
      if (origPush) {
        g.history.pushState = function() {
          try { return origPush.apply(g.history, arguments); } catch (_) {}
        };
      }
    }
  } catch (_) {}

  // Early capture-phase keyboard bridge so Slideino host presentation shortcuts win over deck-level capture listeners
  g.addEventListener('keydown', function(e) {
    if (typeof g.__slideinoHandleKeyDown === 'function') {
      g.__slideinoHandleKeyDown(e);
    }
  }, true);

  // Lightweight single-slide Reveal.js API shim (zero CDN wait, exact 1:1 stage fit inside Slideino)
  var listeners = {};
  var cfg = { width: 1920, height: 1080, display: 'flex', margin: 0, center: false, hash: false };
  var plugins = {};
  var slides = [];
  var ready = false;
  var initialized = false;

  function scanSlides() {
    var root = document.querySelector('.reveal .slides, .reveal > .slides');
    if (!root) { slides = []; return slides; }
    var top = Array.prototype.filter.call(root.children, function(el) {
      return el.tagName === 'SECTION';
    });
    var flat = [];
    top.forEach(function(sec) {
      var nested = Array.prototype.filter.call(sec.children, function(el) {
        return el.tagName === 'SECTION';
      });
      if (nested.length > 0) flat = flat.concat(nested);
      else flat.push(sec);
    });
    slides = flat;
    return slides;
  }

  function activateCurrentSlide() {
    scanSlides();
    var revealEl = document.querySelector('.reveal');
    if (revealEl) revealEl.classList.add('ready');
    var cur = slides[0];
    if (!cur) return null;
    cur.classList.remove('past', 'future', 'leaving');
    cur.classList.add('present', 'show');
    var computed = g.getComputedStyle ? g.getComputedStyle(cur) : null;
    var wantedDisplay = cfg.display;
    if (!wantedDisplay) {
      wantedDisplay = (computed && computed.flexDirection && computed.flexDirection !== 'row')
        ? 'flex'
        : 'block';
    }
    if (!cur.style.display || (computed && computed.display === 'none')) {
      cur.style.display = wantedDisplay;
    }
    return cur;
  }

  var R = {
    VERSION: '5.1.0',
    isMini: false,
    on: function(n, f) {
      if (typeof f !== 'function') return;
      (listeners[n] = listeners[n] || []).push(f);
    },
    off: function(n, f) {
      if (!listeners[n]) return;
      listeners[n] = listeners[n].filter(function(cb) { return cb !== f; });
    },
    addEventListener: function(n, f) { R.on(n, f); },
    removeEventListener: function(n, f) { R.off(n, f); },
    emit: function(n, d) {
      (listeners[n] || []).slice().forEach(function(f) {
        try { f(d || {}); } catch (_) {}
      });
    },
    getScale: function() { return 1; },
    getConfig: function() { return Object.assign({}, cfg); },
    configure: function(next) { if (next && typeof next === 'object') Object.assign(cfg, next); },
    getTotalSlides: function() { return slides.length || 1; },
    getIndices: function() { return { h: 0, v: 0, f: undefined }; },
    getCurrentSlide: function() { return slides[0] || scanSlides()[0] || null; },
    getSlides: function() { return slides.length ? slides.slice() : scanSlides().slice(); },
    getProgress: function() { return 0; },
    isReady: function() { return ready; },
    isFirstSlide: function() { return true; },
    isLastSlide: function() { return true; },
    layout: function() { R.emit('resize', { scale: 1 }); },
    sync: function() { activateCurrentSlide(); },
    slide: function() { activateCurrentSlide(); },
    next: function() {},
    prev: function() {},
    left: function() {},
    right: function() {},
    up: function() {},
    down: function() {},
    registerPlugin: function(id, plugin) {
      if (typeof id === 'string' && plugin) plugins[id] = plugin;
      else if (id && id.id) plugins[id.id] = id;
    },
    getPlugins: function() { return plugins; },
    hasPlugin: function(id) { return Boolean(plugins[id]); },
    getPlugin: function(id) { return plugins[id] || null; },
    initialize: function(userCfg) {
      initialized = true;
      if (userCfg && typeof userCfg === 'object') {
        Object.assign(cfg, userCfg);
      }
      var cur = activateCurrentSlide();
      if (Array.isArray(cfg.plugins)) {
        cfg.plugins.forEach(function(p) {
          try {
            var inst = typeof p === 'function' ? p() : p;
            if (inst && inst.id) plugins[inst.id] = inst;
            if (inst && typeof inst.init === 'function') inst.init(R);
          } catch (_) {}
        });
      }
      ready = true;
      R.emit('ready', { currentSlide: cur, indexh: 0, indexv: 0 });
      return Promise.resolve(R);
    }
  };

  g.Reveal = R;

  // Fallback for CSS-only Reveal.js decks that never call Reveal.initialize()
  document.addEventListener('DOMContentLoaded', function() {
    if (!initialized) {
      activateCurrentSlide();
      ready = true;
    }
  });
})(window);
</script>`;
}

function buildSingleSlideRevealCss(): string {
  return `<style data-slideino-reveal-single-css="true">
html[data-slideino-reveal-single="true"],
html[data-slideino-reveal-single="true"] body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
}
html[data-slideino-reveal-single="true"] body.idle {
  cursor: auto !important;
}
html[data-slideino-reveal-single="true"] .reveal {
  width: 100% !important;
  height: 100% !important;
  position: relative !important;
  overflow: hidden !important;
}
html[data-slideino-reveal-single="true"] .reveal .slides {
  position: relative !important;
  inset: 0 !important;
  left: 0 !important;
  top: 0 !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  transform: none !important;
  pointer-events: auto !important;
}
html[data-slideino-reveal-single="true"] .reveal .slides > section {
  position: relative !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  transform: none !important;
}
html[data-slideino-reveal-single="true"] #toolbar,
html[data-slideino-reveal-single="true"] #progress,
html[data-slideino-reveal-single="true"] #overview,
html[data-slideino-reveal-single="true"] #rotate,
html[data-slideino-reveal-single="true"] .reveal > .controls,
html[data-slideino-reveal-single="true"] .reveal > .progress,
html[data-slideino-reveal-single="true"] .reveal > .slide-number,
html[data-slideino-reveal-single="true"] .reveal > .pause-overlay {
  display: none !important;
  pointer-events: none !important;
}
</style>`;
}

function buildPaintGateHeadTags(preloadPaused = false): string {
  const pauseAttr = preloadPaused ? `r.setAttribute('data-slideino-paused','true');` : '';
  return `<style data-slideino-paint-gate="true">html[data-slideino-pending="true"] body{opacity:0 !important;pointer-events:none !important;}html[data-slideino-paused="true"] *,html[data-slideino-paused="true"] *::before,html[data-slideino-paused="true"] *::after{animation-play-state:paused !important;}</style>
<script data-slideino-paint-gate="true">(function(){var r=document.documentElement;r.setAttribute('data-slideino-pending','true');${pauseAttr}window.__slPaintGateTimer=setTimeout(function(){r.removeAttribute('data-slideino-pending');},4500);})();</script>`;
}

function buildRuntimeBootstrapScript(
  instanceId: string,
  theme: SlideTheme,
  libraries: LibraryConfig,
  isThumbnail: boolean,
  editMode: boolean,
  autoSize: boolean,
  autoBaseDims?: { width: number; height: number },
  isSingleReveal = false,
  expectsTailwind = false,
  preloadPaused = false
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
  var IS_SINGLE_REVEAL = ${isSingleReveal ? 'true' : 'false'};
  var EXPECTS_TAILWIND = ${expectsTailwind ? 'true' : 'false'};
  var IS_PRELOAD = ${preloadPaused ? 'true' : 'false'};

  var __slActive = !IS_PRELOAD;
  var __slRafFrozen = false;
  var __slQueuedRafs = [];
  var __slPendingFragments = [];
  var __slNativeRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;

  if (!IS_THUMBNAIL && !EDIT_MODE && __slNativeRaf) {
    window.requestAnimationFrame = function(cb) {
      if (__slRafFrozen && !__slActive) {
        __slQueuedRafs.push(cb);
        return 0;
      }
      return __slNativeRaf(cb);
    };
  }

  function pauseGsapAtStart() {
    if (EDIT_MODE || IS_THUMBNAIL) return;
    try {
      if (window.gsap && window.gsap.globalTimeline) {
        window.gsap.globalTimeline.pause(0);
      }
    } catch (_) {}
  }

  function activateSlide() {
    var wasInactive = !__slActive;
    __slActive = true;
    __slRafFrozen = false;
    try { document.documentElement.removeAttribute('data-slideino-paused'); } catch (_) {}
    if (__slQueuedRafs.length > 0 && __slNativeRaf) {
      var batch = __slQueuedRafs.splice(0, __slQueuedRafs.length);
      for (var qi = 0; qi < batch.length; qi++) {
        __slNativeRaf(batch[qi]);
      }
    }
    if (wasInactive && !EDIT_MODE && !IS_THUMBNAIL) {
      try {
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduced && window.gsap && window.gsap.globalTimeline) {
          window.gsap.globalTimeline.play(0);
        }
      } catch (_) {}
      if (__slPendingFragments.length > 0) {
        var frags = __slPendingFragments.splice(0, __slPendingFragments.length);
        frags.forEach(function(el, idx) {
          setTimeout(function() { el.classList.add('visible'); }, 90 + idx * 120);
        });
      }
    }
  }

  function deactivateSlide() {
    if (EDIT_MODE || IS_THUMBNAIL) return;
    __slActive = false;
    __slRafFrozen = true;
    try { document.documentElement.setAttribute('data-slideino-paused', 'true'); } catch (_) {}
    pauseGsapAtStart();
    try {
      var media = document.querySelectorAll('video, audio');
      for (var mi = 0; mi < media.length; mi++) {
        if (media[mi] && typeof media[mi].pause === 'function') media[mi].pause();
      }
    } catch (_) {}
  }

  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'slideino-host' || d.instanceId !== INSTANCE_ID) return;
    var cmd = d.command;
    if (!cmd || typeof cmd !== 'object') return;
    if (cmd.type === 'slide-activate') {
      activateSlide();
    } else if (cmd.type === 'slide-deactivate') {
      deactivateSlide();
    }
  });

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
    var forwardKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'PageDown', 'PageUp', 'Home', 'End', 'Escape', 'f', 'F', 'g', 'G', 'n', 'N', 'b', 'B', 'l', 'L', 'p', 'P', 'h', 'H', 'a', 'A', 'r', 'R', 'e', 'E', 'c', 'C', 'v', 'V', 't', 'T', 'o', 'O', '?'];
    var handleKeyForward = function(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) {
        return;
      }
      if (forwardKeys.indexOf(e.key) !== -1) {
        postHost('keydown', { key: e.key, shiftKey: !!e.shiftKey });
        if (IS_SINGLE_REVEAL) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };
    if (IS_SINGLE_REVEAL) {
      window.__slideinoHandleKeyDown = handleKeyForward;
    } else {
      window.addEventListener('keydown', handleKeyForward);
    }
  }

  function hydrateLibraries() {
    var pendingPromise = null;

    // 1. Lucide icons (idempotent: only run when un-hydrated [data-lucide] icons exist)
    ${
      libraries.lucide
        ? `try {
      if (window.lucide && typeof window.lucide.createIcons === 'function' && document.querySelector('[data-lucide]')) {
        window.lucide.createIcons();
      }
    } catch (_) {}`
        : ''
    }

    // 2. Highlight.js (idempotent: skip already-highlighted code blocks)
    ${
      libraries.highlightjs
        ? `try {
      if (window.hljs) {
        if (typeof window.hljs.highlightElement === 'function') {
          var codeBlocks = document.querySelectorAll('pre code:not([data-highlighted="yes"])');
          for (var ci = 0; ci < codeBlocks.length; ci++) {
            window.hljs.highlightElement(codeBlocks[ci]);
          }
        } else if (typeof window.hljs.highlightAll === 'function' && !window.__slHljsDone) {
          window.__slHljsDone = true;
          window.hljs.highlightAll();
        }
      }
    } catch (_) {}`
        : ''
    }

    // 3. KaTeX auto-render (idempotent: run once once renderMathInElement is available)
    ${
      libraries.katex
        ? `try {
      if (typeof window.renderMathInElement === 'function' && document.body && !document.body.dataset.slMathDone) {
        document.body.dataset.slMathDone = '1';
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

    // 4. Mermaid diagrams (idempotent: only process un-rendered .mermaid nodes)
    ${
      libraries.mermaid
        ? `try {
      var mermaidNodes = document.querySelectorAll('.mermaid:not([data-processed="true"])');
      if (window.mermaid && mermaidNodes.length > 0) {
        if (!window.__slMermaidInit) {
          window.__slMermaidInit = true;
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: ${JSON.stringify(mermaidTheme)},
            fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--slide-font-body').trim() || 'sans-serif'
          });
        }
        var mermaidRun = window.mermaid.run({ nodes: Array.prototype.slice.call(mermaidNodes) });
        if (mermaidRun && typeof mermaidRun.then === 'function') {
          pendingPromise = mermaidRun.catch(function() {});
        }
      }
    } catch (_) {}`
        : ''
    }

    // 5. Reveal.js compatibility (.r-fit-text scaling + staggered .fragment reveal)
    ${
      libraries.revealjs
        ? `try {
      var fitNodes = document.querySelectorAll('.r-fit-text');
      fitNodes.forEach(function(el) {
        if (el.dataset.slFitSized) return;
        var parent = el.parentElement;
        if (!parent) return;
        var maxW = Math.max(240, parent.clientWidth - 8);
        el.style.fontSize = '64px';
        var actualW = el.scrollWidth || el.getBoundingClientRect().width || 1;
        var nextSize = Math.max(24, Math.min(112, Math.floor(64 * (maxW / actualW) * 0.96)));
        el.style.fontSize = nextSize + 'px';
        el.dataset.slFitSized = '1';
      });
      var fragments = document.querySelectorAll('.fragment:not(.visible)');
      if (fragments.length > 0) {
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fragments.forEach(function(el, idx) {
          if (el.dataset.slFragScheduled) return;
          el.dataset.slFragScheduled = '1';
          if (IS_THUMBNAIL || EDIT_MODE || reduced) {
            el.classList.add('visible');
          } else if (!__slActive) {
            __slPendingFragments.push(el);
          } else {
            setTimeout(function() { el.classList.add('visible'); }, 90 + idx * 120);
          }
        });
      }
    } catch (_) {}`
        : ''
    }

    // 6. GSAP & Web Animations thumbnail / reduced-motion fast-forward (works for both managed & standalone slides)
    try {
      var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (IS_THUMBNAIL || reducedMotion) {
        if (window.gsap && window.gsap.globalTimeline) {
          window.gsap.globalTimeline.timeScale(1000);
          window.gsap.globalTimeline.progress(1);
          setTimeout(function() {
            if (window.gsap && window.gsap.globalTimeline) {
              window.gsap.globalTimeline.progress(1);
            }
          }, 120);
        }
        if (document.getAnimations) {
          document.getAnimations().forEach(function(anim) {
            try { anim.finish(); } catch (_) {}
          });
        }
      }
    } catch (_) {}

    return pendingPromise;
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
    if (!AUTO_SIZE || IS_SINGLE_REVEAL) return;
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

  var thumbnailFrozen = false;
  function freezeThumbnailLoops() {
    if (!IS_THUMBNAIL || thumbnailFrozen) return;
    thumbnailFrozen = true;
    try {
      window.requestAnimationFrame = function() { return 0; };
    } catch (_) {}
  }

  var readySent = false;
  var revealStarted = false;

  function releasePaintGate() {
    try {
      if (window.__slPaintGateTimer) {
        clearTimeout(window.__slPaintGateTimer);
        window.__slPaintGateTimer = null;
      }
      document.documentElement.removeAttribute('data-slideino-pending');
    } catch (_) {}
  }

  function signalSlideReady() {
    if (readySent) return;
    readySent = true;
    if (!__slActive && !EDIT_MODE && !IS_THUMBNAIL) {
      pauseGsapAtStart();
    }
    releasePaintGate();
    if (AUTO_SIZE) {
      measureAndReportSize();
    }
    var emit = function() {
      postHost('slide-ready', {
        width: lastReportedW,
        height: lastReportedH
      });
      if (!__slActive && !EDIT_MODE && !IS_THUMBNAIL) {
        __slRafFrozen = true;
        try { document.documentElement.setAttribute('data-slideino-paused', 'true'); } catch (_) {}
        pauseGsapAtStart();
      }
    };
    if (__slNativeRaf) {
      __slNativeRaf(emit);
    } else {
      emit();
    }
  }

  function hasTailwindStyleInjected() {
    try {
      var styles = document.head ? document.head.querySelectorAll('style') : [];
      for (var i = 0; i < styles.length; i++) {
        var el = styles[i];
        if (
          el.hasAttribute('data-slideino-theme') ||
          el.hasAttribute('data-slideino-paint-gate') ||
          el.hasAttribute('data-slideino-shared') ||
          el.hasAttribute('data-slideino-tokens') ||
          el.hasAttribute('data-slideino-overrides') ||
          el.hasAttribute('data-slideino-editor') ||
          el.hasAttribute('data-slideino-reveal') ||
          el.hasAttribute('data-slideino-reveal-single-css')
        ) {
          continue;
        }
        var txt = el.textContent || '';
        if (txt.indexOf('tailwindcss') !== -1 || txt.indexOf('--tw-') !== -1) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function waitForTailwindCss() {
    if (!EXPECTS_TAILWIND || hasTailwindStyleInjected()) return Promise.resolve();
    return new Promise(function(resolve) {
      var start = Date.now();
      var done = false;
      var finish = function() {
        if (done) return;
        done = true;
        resolve();
      };
      var check = function() {
        if (done) return;
        if (hasTailwindStyleInjected() || Date.now() - start >= 1000) {
          finish();
          return;
        }
        if (__slNativeRaf) {
          __slNativeRaf(check);
        } else {
          setTimeout(check, 16);
        }
      };
      check();
    });
  }

  function waitForImagesDecoded() {
    try {
      var imgs = document.images;
      if (!imgs || imgs.length === 0) return Promise.resolve();
      var decodes = [];
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || (!img.currentSrc && !img.getAttribute('src'))) continue;
        if (typeof img.decode === 'function') {
          decodes.push(img.decode().catch(function() {}));
        } else if (!img.complete) {
          decodes.push(new Promise(function(res) {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          }));
        }
      }
      if (decodes.length === 0) return Promise.resolve();
      return Promise.race([
        Promise.all(decodes),
        new Promise(function(resolve) { setTimeout(resolve, 600); })
      ]);
    } catch (_) {
      return Promise.resolve();
    }
  }

  function waitForWindowLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function(resolve) {
      var done = false;
      var finish = function() {
        if (done) return;
        done = true;
        resolve();
      };
      window.addEventListener('load', finish, { once: true });
      setTimeout(finish, 2200);
    });
  }

  function runFullReadyBarrier(initialHydration) {
    if (revealStarted || readySent) return;
    revealStarted = true;

    // Kick off Tailwind & font readiness checks in parallel with window.load for minimum latency
    var tailwindPromise = EXPECTS_TAILWIND ? waitForTailwindCss() : Promise.resolve();
    var fontsPromise = (document.fonts && document.fonts.ready)
      ? Promise.race([
          document.fonts.ready.catch(function() {}),
          new Promise(function(resolve) { setTimeout(resolve, 800); })
        ])
      : Promise.resolve();

    waitForWindowLoad().then(function() {
      var loadHydration = hydrateLibraries();
      if (!__slActive && !EDIT_MODE && !IS_THUMBNAIL) {
        pauseGsapAtStart();
      }
      var waiters = [tailwindPromise, fontsPromise, waitForImagesDecoded()];

      if (initialHydration && typeof initialHydration.then === 'function') {
        waiters.push(
          Promise.race([
            initialHydration.catch(function() {}),
            new Promise(function(resolve) { setTimeout(resolve, 1200); })
          ])
        );
      }
      if (loadHydration && typeof loadHydration.then === 'function') {
        waiters.push(
          Promise.race([
            loadHydration.catch(function() {}),
            new Promise(function(resolve) { setTimeout(resolve, 1200); })
          ])
        );
      }

      var settleAndReveal = function() {
        if (readySent) return;
        if (__slNativeRaf) {
          __slNativeRaf(signalSlideReady);
        } else {
          signalSlideReady();
        }
      };

      if (typeof Promise !== 'undefined' && typeof Promise.all === 'function') {
        Promise.all(waiters).then(settleAndReveal, settleAndReveal);
      } else {
        settleAndReveal();
      }
    });
  }

  function onReady() {
    var pendingHydration = hydrateLibraries();
    if (!__slActive && !EDIT_MODE && !IS_THUMBNAIL) {
      pauseGsapAtStart();
    }
    if (AUTO_SIZE) {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() { scheduleMeasure(30); }).catch(function() {});
      }
      if (typeof ResizeObserver === 'function' && document.body) {
        try {
          var ro = new ResizeObserver(function() {
            if (readySent && __slActive) scheduleMeasure(80);
          });
          ro.observe(document.body);
        } catch (_) {}
      }
    }
    runFullReadyBarrier(pendingHydration);
    if (IS_THUMBNAIL) {
      setTimeout(freezeThumbnailLoops, 2400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', function() {
    var pendingHydration = hydrateLibraries();
    if (!revealStarted) {
      runFullReadyBarrier(pendingHydration);
    }
    if (IS_THUMBNAIL) {
      setTimeout(freezeThumbnailLoops, 900);
    }
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
    preloadPaused = false,
  } = options;

  const processedHtml = resolveLocalAssetPaths(
    stripConflictingMetaTags(slide.html || ''),
    origin
  );

  // Detect if slide is a complete HTML document (<!DOCTYPE html> or <html>)
  const isFullDocument = /<!doctype\s+html|<html[\s>]/i.test(processedHtml);
  const isStandalone = Boolean(slide.standalone) || isFullDocument;
  const activeEditMode = Boolean(editMode && !isThumbnail);

  const themeFontSources = isStandalone
    ? undefined
    : `${theme.tokens.fontDisplay}\n${theme.tokens.fontBody}\n${theme.tokens.fontMono}`;
  const autoFontLink = buildAutoGoogleFontsLink(
    processedHtml,
    slide.css || '',
    sharedCss,
    themeFontSources
  );

  const usedLibraries = detectUsedLibraries(
    libraries,
    processedHtml,
    slide.css || '',
    isThumbnail,
    isStandalone
  );

  const headTags = buildLibraryHeadTags(
    usedLibraries,
    theme,
    customResources,
    isThumbnail,
    isStandalone
  );
  const revealCompatTag = usedLibraries.revealjs
    ? `<style data-slideino-reveal="true">${buildRevealCompatCss(
        isThumbnail,
        activeEditMode,
        prefersReducedMotion
      )}</style>`
    : '';
  const sharedStyleTag = sharedCss?.trim()
    ? `<style data-slideino-shared="true">${escapeStyleClose(sharedCss)}</style>`
    : '';
  const isSingleReveal =
    isFullDocument &&
    (/data-slideino-reveal-single\s*=\s*["']true["']/i.test(processedHtml) ||
      (/class=["'][^"']*\breveal\b[^"']*["']/i.test(processedHtml) &&
        /class=["'][^"']*\bslides\b[^"']*["']/i.test(processedHtml)));

  const expectsTailwind = Boolean(
    usedLibraries.tailwind || /<script[^>]+tailwindcss/i.test(processedHtml)
  );
  const effectivePreloadPaused = Boolean(preloadPaused && !isThumbnail && !activeEditMode);
  const paintGateTags = buildPaintGateHeadTags(effectivePreloadPaused);

  const runtimeScript = buildRuntimeBootstrapScript(
    instanceId,
    theme,
    usedLibraries,
    isThumbnail,
    activeEditMode,
    autoSize,
    autoBaseDims,
    isSingleReveal,
    expectsTailwind,
    effectivePreloadPaused
  );
  const visualEditorScript = activeEditMode
    ? buildVisualEditorInjection(instanceId, isFullDocument)
    : '';

  if (isFullDocument) {
    let doc = processedHtml;
    if (isSingleReveal && !/data-slideino-reveal-single\s*=\s*["']true["']/i.test(doc)) {
      doc = doc.replace(/<html([^>]*)>/i, '<html$1 data-slideino-reveal-single="true">');
    }
    const basePrefix = [
      paintGateTags,
      isSingleReveal ? buildSingleSlideRevealShimScript() : '',
      `<style data-slideino-tokens="true">${escapeStyleClose(
        buildRootVariablesCss(theme, slide)
      )}</style>`,
      sharedStyleTag,
      isSingleReveal ? '' : revealCompatTag,
    ]
      .filter(Boolean)
      .join('\n');

    const overrideSuffix = [
      autoFontLink,
      headTags,
      isSingleReveal ? buildSingleSlideRevealCss() : '',
      `<style data-slideino-overrides="true">${escapeStyleClose(
        buildStandaloneOverrideCss(slide, prefersReducedMotion, isThumbnail)
      )}</style>`,
    ]
      .filter(Boolean)
      .join('\n');

    // Inject paint gate + shim + tokens + shared fonts at the beginning of <head> so the slide's own styles take priority
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
  ${paintGateTags}
  ${sharedStyleTag}
  ${autoFontLink}
  ${headTags}
  ${revealCompatTag}
  ${themeStyleTag}
</head>
<body>
${processedHtml}
${runtimeScript}
${visualEditorScript}
</body>
</html>`;
}

const TAILWIND_BG_MAP: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  'slate-950': '#020617',
  'slate-900': '#0f172a',
  'zinc-950': '#09090b',
  'zinc-900': '#18181b',
  'neutral-950': '#0a0a0a',
  'neutral-900': '#171717',
  'gray-950': '#030712',
  'gray-900': '#111827',
  'stone-950': '#0c0a09',
  'stone-900': '#1c1917',
};

/**
 * Infers the primary background color of a standalone HTML slide so the host
 * stage backdrop matches the slide immediately before first reveal (zero white flash).
 */
export function detectStandaloneBackdrop(html: string, css?: string): string | null {
  const source = `${css || ''}\n${html || ''}`;
  if (!source.trim()) return null;

  // 1. Check direct html/body background rule
  const bodyRule = source.match(
    /(?:^|[\s},;])(?:html\s*,\s*body|body|html)\s*\{[^}]*?background(?:-color)?\s*:\s*([^;!}]+)/i
  );
  if (bodyRule && bodyRule[1]) {
    const val = bodyRule[1].trim();
    const directColor = val.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/);
    if (directColor) return directColor[1];
    // Resolve var(--name) from :root / style block
    const varRef = val.match(/var\(\s*(--[a-zA-Z0-9_-]+)/);
    if (varRef) {
      const escaped = varRef[1].replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const defMatch = source.match(
        new RegExp(`${escaped}\\s*:\\s*(#[0-9a-fA-F]{3,8}|rgba?\\([^)]+\\)|hsla?\\([^)]+\\))`, 'i')
      );
      if (defMatch) return defMatch[1];
    }
  }

  // 2. Check common :root --bg custom property
  const rootBg = source.match(
    /--(?:bg|background|slide-bg|surface-bg)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/i
  );
  if (rootBg) return rootBg[1];

  // 3. Check Tailwind body background utility class
  const bodyClass = (html || '').match(/<body[^>]*\bclass\s*=\s*["']([^"']+)["']/i);
  if (bodyClass) {
    const arb = bodyClass[1].match(/\bbg-\[(#[0-9a-fA-F]{3,8})\]/);
    if (arb) return arb[1];
    const token = bodyClass[1].match(
      /\bbg-(black|white|(?:slate|zinc|neutral|gray|stone)-(?:900|950))\b/
    );
    if (token && TAILWIND_BG_MAP[token[1]]) {
      return TAILWIND_BG_MAP[token[1]];
    }
  }

  return null;
}

