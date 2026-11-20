import {
  CustomResource,
  LibraryConfig,
  Slide,
  SlideTheme,
} from '../types/slideino';
import { isValidHttpsUrl } from './storage';

export interface BuildSlideOptions {
  slide: Slide;
  theme: SlideTheme;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  instanceId: string;
  origin: string;
  isThumbnail?: boolean;
  prefersReducedMotion?: boolean;
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
  isThumbnail: boolean
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
  height: 100%;
  overflow: hidden;
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
  isThumbnail: boolean
): string {
  const safeId = JSON.stringify(instanceId);
  const mermaidTheme = theme.isDark ? 'dark' : 'neutral';

  return `<script>
(function() {
  var INSTANCE_ID = ${safeId};
  var IS_THUMBNAIL = ${isThumbnail ? 'true' : 'false'};

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

  if (!IS_THUMBNAIL) {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(hydrateLibraries, 20);
    });
  } else {
    setTimeout(hydrateLibraries, 20);
  }
  window.addEventListener('load', hydrateLibraries);
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
    prefersReducedMotion = false,
  } = options;

  const processedHtml = resolveLocalAssetPaths(
    stripConflictingMetaTags(slide.html || ''),
    origin
  );

  // Detect if slide is a complete HTML document (<!DOCTYPE html> or <html>)
  const isFullDocument = /<!doctype\s+html|<html[\s>]/i.test(processedHtml);
  const isStandalone = Boolean(slide.standalone) || isFullDocument;

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
    isThumbnail
  );

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

    if (/<\/body>/i.test(doc)) {
      doc = doc.replace(/<\/body>/i, `${runtimeScript}\n</body>`);
    } else {
      doc = `${doc}\n${runtimeScript}`;
    }
    return doc;
  }

  const themeStyleTag = `<style data-slideino-theme="true">${escapeStyleClose(
    buildThemeCss(theme, slide, prefersReducedMotion, isThumbnail)
  )}</style>`;

  // Wrap HTML fragment cleanly
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${sharedStyleTag}
  ${headTags}
  ${themeStyleTag}
</head>
<body>
${processedHtml}
${runtimeScript}
</body>
</html>`;
}
