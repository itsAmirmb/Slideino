import {
  ASPECT_RATIO_DIMENSIONS,
  Deck,
  LibraryConfig,
  Slide,
  SlideTheme,
} from '../types/slideino';
import { LIBRARY_CATALOG } from '../data/libraries';
import { buildSlideDocument } from './slideRuntime';

export interface ParsedImportResult {
  slides: Slide[];
  detectedTitle?: string;
  mode: 'multi-slide' | 'single-slide';
}

function makeSlideId(index: number): string {
  return `slide-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function extractHeadingTitle(html: string, fallbackIndex: number): string {
  const match = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (match && match[1]) {
    const clean = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length > 0) {
      return clean.slice(0, 64);
    }
  }
  return `Imported Slide ${fallbackIndex + 1}`;
}

export function parseImportedHtml(rawInput: string): ParsedImportResult {
  const input = rawInput.trim();
  if (!input) {
    return { slides: [], mode: 'single-slide' };
  }

  // Extract document <title> if present
  const titleMatch = input.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const detectedTitle = titleMatch?.[1]?.trim();

  // Check for explicit <!-- slide --> or --- HTML comment delimiter
  const commentParts = input
    .split(/<!--\s*slide\s*-->|\n---\n/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (commentParts.length > 1) {
    return {
      detectedTitle,
      mode: 'multi-slide',
      slides: commentParts.map((part, idx) => ({
        id: makeSlideId(idx),
        title: extractHeadingTitle(part, idx),
        html: part,
        css: '',
        notes: '',
        transition: 'fade',
      })),
    };
  }

  // Parse using browser DOMParser to detect <section> or .slide blocks safely
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');

    // Collect shared <style> rules if present
    const styleBlocks = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n')
      .trim();

    // Look for top-level <section> elements or .slide elements
    const sectionNodes = Array.from(doc.body.querySelectorAll(':scope > section'));
    const slideClassNodes = Array.from(doc.body.querySelectorAll('.slide'));
    const multiNodes =
      sectionNodes.length > 1
        ? sectionNodes
        : slideClassNodes.length > 1
        ? slideClassNodes
        : [];

    if (multiNodes.length > 1) {
      return {
        detectedTitle,
        mode: 'multi-slide',
        slides: multiNodes.map((node, idx) => {
          const html = node.outerHTML;
          return {
            id: makeSlideId(idx),
            title: extractHeadingTitle(html, idx),
            html,
            css: styleBlocks,
            notes: '',
            transition: 'fade',
          };
        }),
      };
    }

    // Single full HTML document or single fragment
    const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(input);
    if (isFullDoc) {
      // Preserve scripts inside body if any, separate clean style blocks when simple
      const hasExternalLinks = doc.head.querySelectorAll('link, script').length > 0;
      if (hasExternalLinks) {
        return {
          detectedTitle,
          mode: 'single-slide',
          slides: [
            {
              id: makeSlideId(0),
              title: detectedTitle || extractHeadingTitle(input, 0),
              html: input,
              css: '',
              notes: '',
              transition: 'fade',
            },
          ],
        };
      }
      return {
        detectedTitle,
        mode: 'single-slide',
        slides: [
          {
            id: makeSlideId(0),
            title: detectedTitle || extractHeadingTitle(doc.body.innerHTML, 0),
            html: doc.body.innerHTML.trim(),
            css: styleBlocks,
            notes: '',
            transition: 'fade',
          },
        ],
      };
    }

    // Fragment with inline <style> tags
    if (styleBlocks) {
      const clone = doc.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('style').forEach((el) => el.remove());
      return {
        detectedTitle,
        mode: 'single-slide',
        slides: [
          {
            id: makeSlideId(0),
            title: extractHeadingTitle(clone.innerHTML, 0),
            html: clone.innerHTML.trim(),
            css: styleBlocks,
            notes: '',
            transition: 'fade',
          },
        ],
      };
    }
  } catch {
    // Fallback to raw HTML single slide
  }

  return {
    detectedTitle,
    mode: 'single-slide',
    slides: [
      {
        id: makeSlideId(0),
        title: extractHeadingTitle(input, 0),
        html: input,
        css: '',
        notes: '',
        transition: 'fade',
      },
    ],
  };
}

export function buildAiPromptTemplate(
  deck: Deck,
  theme: SlideTheme,
  libraries: LibraryConfig
): string {
  const enabledLibs = LIBRARY_CATALOG.filter((lib) => libraries[lib.id])
    .map((lib) => `- ${lib.name} (${lib.usageHint})`)
    .join('\n');

  const dims =
    deck.aspectRatio === 'fluid'
      ? 'Fluid responsive viewport (100% width x 100% height)'
      : `${deck.aspectRatio} canvas (${ASPECT_RATIO_DIMENSIONS[deck.aspectRatio].width}x${ASPECT_RATIO_DIMENSIONS[deck.aspectRatio].height}px)`;

  return `Create a presentation slide deck in clean HTML and CSS compatible with Slideino.

Canvas & Aspect Ratio:
- Target stage: ${dims}
- Each slide root element should fill height: 100%; width: 100%; without vertical overflow.
- Separate multiple slides with <!-- slide --> comments so Slideino imports each slide automatically.

Theme CSS Variables (already injected by Slideino — use these for automatic theme switching):
- var(--slide-bg)        /* Current: ${theme.tokens.bg} */
- var(--slide-surface)   /* Current: ${theme.tokens.surface} */
- var(--slide-text)      /* Current: ${theme.tokens.text} */
- var(--slide-muted)     /* Current: ${theme.tokens.muted} */
- var(--slide-accent)    /* Current: ${theme.tokens.accent} */
- var(--slide-border)    /* Current: ${theme.tokens.border} */
- var(--slide-font-display), var(--slide-font-body), var(--slide-font-mono)
- var(--slide-radius), var(--slide-padding)

Enabled Runtime Libraries (ready to use without adding CDN tags):
${enabledLibs || '- Pure HTML & CSS'}

Accessibility & Design Requirements:
- Maintain WCAG AA contrast (at least 4.5:1 for body text).
- Use semantic headings (<h1>, <h2>, <h3>) and alt text on all images.
- Keep copy concise (35-65 words per slide) with generous whitespace.

Topic to generate slides for:
[Describe your presentation topic, audience, and number of slides here]`;
}

export function exportStandaloneHtml(deck: Deck, theme: SlideTheme, origin: string): string {
  const visibleSlides = deck.slides.filter((s) => !s.hidden);
  const slidesToExport = visibleSlides.length > 0 ? visibleSlides : deck.slides;

  const dims =
    deck.aspectRatio === 'fluid'
      ? { width: 1280, height: 720, fluid: true }
      : { ...ASPECT_RATIO_DIMENSIONS[deck.aspectRatio], fluid: false };

  const compiledDocs = slidesToExport.map((slide, idx) => ({
    title: slide.title,
    notes: slide.notes,
    doc: buildSlideDocument({
      slide,
      theme,
      libraries: deck.libraries,
      customResources: deck.customResources,
      instanceId: `export-${idx}`,
      origin,
      isThumbnail: false,
    }),
  }));

  // Safe JSON serialization preventing </script> breakout
  const safePayload = JSON.stringify({
    title: deck.title,
    dims,
    slides: compiledDocs,
  }).replace(/</g, '\\u003c');

  const safeTitle = deck.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — Slideino Presentation</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0b0f17; color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    #app {
      width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    #stage-wrap {
      position: relative; overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.45);
      background: ${theme.tokens.bg};
    }
    iframe {
      border: 0; display: block;
      transform-origin: top left;
    }
    .hud {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; border-radius: 10px;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.25);
      backdrop-filter: blur(8px);
      font-size: 13px;
      transition: opacity 0.2s ease;
    }
    .hud button {
      background: transparent; color: #f8fafc; border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;
    }
    .hud button:hover { background: rgba(255,255,255,0.12); }
    .hud button:disabled { opacity: 0.4; cursor: not-allowed; }
    .counter { font-variant-numeric: tabular-nums; font-family: monospace; min-width: 64px; text-align: center; }
    .progress {
      position: fixed; top: 0; left: 0; height: 3px;
      background: ${theme.tokens.accent}; transition: width 0.2s ease;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0, 0, 0, 0); white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="progress" id="progress"></div>
  <div id="live-region" class="sr-only" aria-live="polite"></div>
  <main id="app">
    <div id="stage-wrap">
      <iframe id="frame" sandbox="allow-scripts" title="Slide viewport"></iframe>
    </div>
  </main>
  <nav class="hud" aria-label="Slide navigation">
    <button id="prev" type="button" aria-label="Previous slide">Prev</button>
    <span class="counter" id="counter">1 / 1</span>
    <button id="next" type="button" aria-label="Next slide">Next</button>
    <button id="fs" type="button" aria-label="Toggle fullscreen">Fullscreen</button>
  </nav>
  <script>
    const DECK = ${safePayload};
    let index = 0;
    const frame = document.getElementById('frame');
    const wrap = document.getElementById('stage-wrap');
    const counter = document.getElementById('counter');
    const progress = document.getElementById('progress');
    const live = document.getElementById('live-region');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');

    function layout() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (DECK.dims.fluid) {
        wrap.style.width = vw + 'px';
        wrap.style.height = vh + 'px';
        frame.style.width = vw + 'px';
        frame.style.height = vh + 'px';
        frame.style.transform = 'none';
        return;
      }
      const scale = Math.min(vw / DECK.dims.width, vh / DECK.dims.height);
      wrap.style.width = Math.round(DECK.dims.width * scale) + 'px';
      wrap.style.height = Math.round(DECK.dims.height * scale) + 'px';
      frame.style.width = DECK.dims.width + 'px';
      frame.style.height = DECK.dims.height + 'px';
      frame.style.transform = 'scale(' + scale + ')';
    }

    function render() {
      const slide = DECK.slides[index];
      if (!slide) return;
      frame.srcdoc = slide.doc;
      counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(DECK.slides.length).padStart(2, '0');
      progress.style.width = (((index + 1) / DECK.slides.length) * 100) + '%';
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === DECK.slides.length - 1;
      live.textContent = 'Slide ' + (index + 1) + ' of ' + DECK.slides.length + ': ' + slide.title;
    }

    function step(delta) {
      const next = Math.max(0, Math.min(DECK.slides.length - 1, index + delta));
      if (next !== index) { index = next; render(); }
    }

    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));
    document.getElementById('fs').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') step(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') step(-1);
      if (e.key === 'Home') { index = 0; render(); }
      if (e.key === 'End') { index = DECK.slides.length - 1; render(); }
    });

    window.addEventListener('message', (e) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.source !== 'slideino-frame') return;
      if (e.data.type === 'keydown') {
        const k = e.data.payload && e.data.payload.key;
        if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') step(1);
        if (k === 'ArrowLeft' || k === 'PageUp') step(-1);
      }
    });

    let touchStartX = 0;
    window.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; });
    window.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
    });

    window.addEventListener('resize', layout);
    layout();
    render();
  </script>
</body>
</html>`;
}
