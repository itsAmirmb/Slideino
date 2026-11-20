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
  sharedCss?: string;
  deduplicatedFontCount?: number;
  savedBytes?: number;
  mode: 'multi-slide' | 'single-slide';
  sourceFormat?:
    | 'singlefile-iframes'
    | 'comment-delimited'
    | 'sections'
    | 'slide-classes'
    | 'single-document'
    | 'fragment';
}

function makeSlideId(index: number): string {
  return `slide-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function decodeBase64Utf8(b64: string): string {
  try {
    const binary = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return b64;
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function extractSingleFileDeckTitle(rawHtml: string, docTitle?: string): string | undefined {
  const cleanDocTitle = docTitle?.trim();
  const genericTitles = new Set(['', 'genspark', 'document', 'slides', 'presentation', 'untitled']);

  // SingleFile embeds the source URL in a leading HTML comment:
  // <!-- Page saved with SingleFile  url: https://...&deck=data-engineering-foundations ... -->
  const sfComment = rawHtml.slice(0, 1200).match(/<!--[\s\S]*?SingleFile[\s\S]*?url:\s*(https?:\/\/[^\s<>]+)/i);
  if (sfComment && sfComment[1]) {
    try {
      const parsedUrl = new URL(sfComment[1].trim());
      const deckParam =
        parsedUrl.searchParams.get('deck') ||
        parsedUrl.searchParams.get('title') ||
        parsedUrl.searchParams.get('name');
      if (deckParam && deckParam.trim().length > 1) {
        return humanizeSlug(deckParam).slice(0, 80);
      }
    } catch {
      // Ignore invalid URL in comment
    }
  }

  if (cleanDocTitle && !genericTitles.has(cleanDocTitle.toLowerCase())) {
    return cleanDocTitle.slice(0, 80);
  }

  return cleanDocTitle || undefined;
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

interface FontFacePool {
  entries: Map<
    string,
    {
      rule: string;
      minWeight: number | null;
      maxWeight: number | null;
      isNumericWeight: boolean;
    }
  >;
  rawOccurrences: number;
  rawBytes: number;
}

function createFontFacePool(): FontFacePool {
  return {
    entries: new Map(),
    rawOccurrences: 0,
    rawBytes: 0,
  };
}

function extractFontFacesFromCss(css: string, pool: FontFacePool): string {
  if (!css || !/@font-face/i.test(css)) return css;

  return css.replace(/@font-face\s*\{[^{}]*\}/gi, (fullRule) => {
    pool.rawOccurrences += 1;
    pool.rawBytes += fullRule.length;

    const body = fullRule.replace(/^@font-face\s*\{/i, '').replace(/\}$/, '');
    const family = (body.match(/font-family\s*:\s*([^;]+)/i)?.[1] || '').trim();
    const style = (body.match(/font-style\s*:\s*([^;]+)/i)?.[1] || 'normal').trim().toLowerCase();
    const unicodeRange = (body.match(/unicode-range\s*:\s*([^;]+)/i)?.[1] || '').trim();
    const srcUrls = Array.from(body.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi))
      .map((m) => m[2].trim())
      .join(',');
    const weightRaw = (body.match(/font-weight\s*:\s*([^;]+)/i)?.[1] || '').trim();

    // Parse numeric weight or weight range (e.g. "400" or "400 900")
    const weightNums = weightRaw
      ? weightRaw
          .split(/\s+/)
          .map((token) => Number(token))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 1000)
      : [];
    const isPureNumericWeight =
      weightRaw.length > 0 &&
      weightNums.length > 0 &&
      weightNums.length === weightRaw.split(/\s+/).length;

    if (family && srcUrls && isPureNumericWeight) {
      const key = `${family}|${style}|${unicodeRange}|${srcUrls}`;
      const minW = Math.min(...weightNums);
      const maxW = Math.max(...weightNums);
      const existing = pool.entries.get(key);
      if (existing && existing.isNumericWeight && existing.minWeight !== null && existing.maxWeight !== null) {
        existing.minWeight = Math.min(existing.minWeight, minW);
        existing.maxWeight = Math.max(existing.maxWeight, maxW);
      } else {
        pool.entries.set(key, {
          rule: fullRule,
          minWeight: minW,
          maxWeight: maxW,
          isNumericWeight: true,
        });
      }
    } else {
      const normalizedKey = fullRule.replace(/\s+/g, ' ').trim();
      if (!pool.entries.has(normalizedKey)) {
        pool.entries.set(normalizedKey, {
          rule: fullRule,
          minWeight: null,
          maxWeight: null,
          isNumericWeight: false,
        });
      }
    }

    return '';
  });
}

function finalizeFontFacePool(pool: FontFacePool): {
  sharedCss: string;
  uniqueCount: number;
  savedBytes: number;
} {
  if (pool.entries.size === 0) {
    return { sharedCss: '', uniqueCount: 0, savedBytes: 0 };
  }

  const rules: string[] = [];
  for (const entry of pool.entries.values()) {
    if (entry.isNumericWeight && entry.minWeight !== null && entry.maxWeight !== null) {
      const weightValue =
        entry.minWeight === entry.maxWeight
          ? `${entry.minWeight}`
          : `${entry.minWeight} ${entry.maxWeight}`;
      const mergedRule = entry.rule.replace(
        /font-weight\s*:\s*[^;}]+/i,
        `font-weight:${weightValue}`
      );
      rules.push(mergedRule);
    } else {
      rules.push(entry.rule);
    }
  }

  const sharedCss = rules.join('\n');
  const savedBytes = Math.max(0, pool.rawBytes - sharedCss.length);
  return {
    sharedCss,
    uniqueCount: rules.length,
    savedBytes,
  };
}

export function mergeSharedCss(existing?: string, incoming?: string): string | undefined {
  const combined = [existing?.trim(), incoming?.trim()].filter(Boolean).join('\n');
  if (!combined) return undefined;
  const pool = createFontFacePool();
  const remainder = extractFontFacesFromCss(combined, pool).trim();
  const { sharedCss } = finalizeFontFacePool(pool);
  const merged = [sharedCss, remainder].filter(Boolean).join('\n').trim();
  return merged || undefined;
}

function extractDataHtmlFromSrc(src: string): string | null {
  const match = src.match(/^data:text\/html([^,]*),([\s\S]*)$/i);
  if (!match) return null;
  const meta = match[1].toLowerCase();
  const payload = match[2];
  if (meta.includes(';base64')) {
    return decodeBase64Utf8(payload);
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function normalizeStandaloneDocument(
  rawSlideHtml: string,
  index: number,
  fontPool: FontFacePool
): Slide {
  const parser = new DOMParser();
  const subDoc = parser.parseFromString(rawSlideHtml, 'text/html');

  // Remove restrictive SingleFile CSP/referrer meta tags and empty stripped script tags
  subDoc
    .querySelectorAll('meta[http-equiv="content-security-policy" i], meta[name="referrer" i]')
    .forEach((el) => el.remove());

  subDoc.querySelectorAll('script').forEach((scriptEl) => {
    const hasSrc = Boolean(scriptEl.getAttribute('src')?.trim());
    const hasCode = Boolean(scriptEl.textContent?.trim());
    if (!hasSrc && !hasCode) {
      scriptEl.remove();
    }
  });

  // Extract @font-face rules into shared deck pool to avoid megabytes of repeated base64 fonts
  subDoc.querySelectorAll('style').forEach((styleEl) => {
    const rawCss = styleEl.textContent || '';
    if (rawCss.includes('@font-face')) {
      const stripped = extractFontFacesFromCss(rawCss, fontPool).trim();
      if (!stripped) {
        styleEl.remove();
      } else {
        styleEl.textContent = stripped;
      }
    }
  });

  // Determine best human-readable slide title (decoded entities via DOM API)
  const docTitle = subDoc.title?.trim();
  const screenLabel = subDoc
    .querySelector('[data-screen-label]')
    ?.getAttribute('data-screen-label')
    ?.trim();
  const headingText = subDoc
    .querySelector('h1, h2, h3')
    ?.textContent?.replace(/\s+/g, ' ')
    .trim();

  const title = (
    docTitle ||
    screenLabel ||
    headingText ||
    `Imported Slide ${index + 1}`
  ).slice(0, 80);

  const cleanedHtml = `<!doctype html>\n${subDoc.documentElement.outerHTML}`;

  return {
    id: makeSlideId(index),
    title,
    html: cleanedHtml,
    css: '',
    notes: '',
    transition: 'fade',
    standalone: true,
  };
}

function extractIframeSlides(
  doc: Document,
  isSingleFile: boolean,
  fontPool: FontFacePool
): Slide[] {
  const iframes = Array.from(doc.querySelectorAll('iframe'));
  if (iframes.length === 0) return [];

  const extractedDocs: string[] = [];
  const seenKeys = new Set<string>();

  for (const frame of iframes) {
    let rawContent = frame.getAttribute('srcdoc')?.trim() || '';
    if (!rawContent) {
      const src = frame.getAttribute('src')?.trim() || '';
      if (/^data:text\/html/i.test(src)) {
        rawContent = extractDataHtmlFromSrc(src)?.trim() || '';
      }
    }

    if (rawContent.length < 80) continue;

    // Skip blank/tracking iframes that have no real visible slide markup
    const looksLikeSlide =
      /slide-container|data-object|data-screen-label|<h[1-3]\b|<svg\b|<canvas\b|<img\b|<section\b|<div\b/i.test(
        rawContent
      );
    if (!looksLikeSlide) continue;

    // Deduplicate identical iframe documents (e.g. viewers rendering both thumbnail + stage iframes)
    const dedupKey =
      rawContent.length +
      ':' +
      rawContent.slice(0, 200) +
      ':' +
      rawContent.slice(-200);
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    extractedDocs.push(rawContent);
  }

  // Extract if we found multiple slide iframes, OR if a SingleFile capture contains at least 1 slide iframe
  if (extractedDocs.length > 1 || (isSingleFile && extractedDocs.length === 1)) {
    return extractedDocs.map((rawSlideDoc, idx) =>
      normalizeStandaloneDocument(rawSlideDoc, idx, fontPool)
    );
  }

  return [];
}

export function parseImportedHtml(rawInput: string): ParsedImportResult {
  const input = rawInput.trim();
  if (!input) {
    return { slides: [], mode: 'single-slide' };
  }

  const isSingleFile = /Page saved with SingleFile/i.test(input.slice(0, 1200));
  const fontPool = createFontFacePool();

  // Check for explicit <!-- slide --> or --- HTML comment delimiter first
  const commentParts = input
    .split(/<!--\s*slide\s*-->|\n---\n/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (commentParts.length > 1) {
    const slides = commentParts.map((part, idx) => {
      if (/<!doctype\s+html|<html[\s>]/i.test(part)) {
        return normalizeStandaloneDocument(part, idx, fontPool);
      }
      return {
        id: makeSlideId(idx),
        title: extractHeadingTitle(part, idx),
        html: part,
        css: '',
        notes: '',
        transition: 'fade' as const,
      };
    });
    const { sharedCss, uniqueCount, savedBytes } = finalizeFontFacePool(fontPool);
    return {
      detectedTitle: extractSingleFileDeckTitle(input),
      sharedCss: sharedCss || undefined,
      deduplicatedFontCount: uniqueCount || undefined,
      savedBytes: savedBytes || undefined,
      mode: 'multi-slide',
      sourceFormat: 'comment-delimited',
      slides,
    };
  }

  // Parse using browser DOMParser
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');
    const detectedTitle = extractSingleFileDeckTitle(input, doc.title);

    // 1. Check for embedded slide iframes (SingleFile exports of GenSpark, Pitch, AI slide viewers)
    const iframeSlides = extractIframeSlides(doc, isSingleFile, fontPool);
    if (iframeSlides.length > 0) {
      const { sharedCss, uniqueCount, savedBytes } = finalizeFontFacePool(fontPool);
      return {
        detectedTitle: detectedTitle || iframeSlides[0]?.title,
        sharedCss: sharedCss || undefined,
        deduplicatedFontCount: uniqueCount || undefined,
        savedBytes: savedBytes || undefined,
        mode: iframeSlides.length > 1 ? 'multi-slide' : 'single-slide',
        sourceFormat: 'singlefile-iframes',
        slides: iframeSlides,
      };
    }

    // Collect shared <style> rules if present, extracting @font-face into sharedCss
    const rawStyleBlocks = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n')
      .trim();
    const cleanedStyleBlocks = extractFontFacesFromCss(rawStyleBlocks, fontPool).trim();

    // 2. Look for top-level <section> elements or .slide elements
    const sectionNodes = Array.from(doc.body.querySelectorAll(':scope > section'));
    const slideClassNodes = Array.from(doc.body.querySelectorAll('.slide'));
    const multiNodes =
      sectionNodes.length > 1
        ? sectionNodes
        : slideClassNodes.length > 1
        ? slideClassNodes
        : [];

    if (multiNodes.length > 1) {
      const { sharedCss, uniqueCount, savedBytes } = finalizeFontFacePool(fontPool);
      return {
        detectedTitle,
        sharedCss: sharedCss || undefined,
        deduplicatedFontCount: uniqueCount || undefined,
        savedBytes: savedBytes || undefined,
        mode: 'multi-slide',
        sourceFormat: sectionNodes.length > 1 ? 'sections' : 'slide-classes',
        slides: multiNodes.map((node, idx) => {
          const html = node.outerHTML;
          return {
            id: makeSlideId(idx),
            title: extractHeadingTitle(html, idx),
            html,
            css: cleanedStyleBlocks,
            notes: '',
            transition: 'fade',
          };
        }),
      };
    }

    // 3. Single full HTML document
    const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(input);
    if (isFullDoc) {
      const singlePool = createFontFacePool();
      const normalized = normalizeStandaloneDocument(input, 0, singlePool);
      const { sharedCss, uniqueCount, savedBytes } = finalizeFontFacePool(singlePool);
      return {
        detectedTitle: detectedTitle || normalized.title,
        sharedCss: sharedCss || undefined,
        deduplicatedFontCount: uniqueCount || undefined,
        savedBytes: savedBytes || undefined,
        mode: 'single-slide',
        sourceFormat: 'single-document',
        slides: [normalized],
      };
    }

    // 4. Fragment with inline <style> tags
    if (rawStyleBlocks) {
      const clone = doc.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('style').forEach((el) => el.remove());
      const { sharedCss, uniqueCount, savedBytes } = finalizeFontFacePool(fontPool);
      return {
        detectedTitle,
        sharedCss: sharedCss || undefined,
        deduplicatedFontCount: uniqueCount || undefined,
        savedBytes: savedBytes || undefined,
        mode: 'single-slide',
        sourceFormat: 'fragment',
        slides: [
          {
            id: makeSlideId(0),
            title: extractHeadingTitle(clone.innerHTML, 0),
            html: clone.innerHTML.trim(),
            css: cleanedStyleBlocks,
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
    detectedTitle: extractSingleFileDeckTitle(input),
    mode: 'single-slide',
    sourceFormat: 'fragment',
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

export function isH2dOrUnsupportedBinary(
  filename: string,
  bytes: Uint8Array
): { unsupported: boolean; isH2d: boolean; reason?: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.h2d')) {
    return {
      unsupported: true,
      isH2d: true,
      reason:
        'Files ending in .h2d are encrypted proprietary archives created by the html.to.design Figma extension and can only be opened inside Figma. Use the "Capture GenSpark / Web" tab to export clean HTML or MHTML slides directly into Slideino.',
    };
  }

  // Sample first 1024 bytes for non-text binary control characters (excluding tab/LF/CR)
  const sampleLen = Math.min(bytes.length, 1024);
  if (sampleLen > 0) {
    let binaryCount = 0;
    for (let i = 0; i < sampleLen; i++) {
      const b = bytes[i];
      if (b === 0 || (b < 32 && b !== 9 && b !== 10 && b !== 13)) {
        binaryCount++;
      }
    }
    if (binaryCount / sampleLen > 0.12) {
      return {
        unsupported: true,
        isH2d: false,
        reason: `"${filename}" appears to be an encrypted or binary file rather than HTML/CSS or MHTML.`,
      };
    }
  }

  return { unsupported: false, isH2d: false };
}

function decodeQuotedPrintable(input: string): string {
  const unwrapped = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unwrapped.length; i++) {
    if (unwrapped[i] === '=' && i + 2 < unwrapped.length) {
      const hex = unwrapped.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(unwrapped.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return unwrapped;
  }
}

export function extractMhtmlHtml(rawMhtml: string): string | null {
  const boundaryMatch = rawMhtml.match(/boundary=["']?([^"'\r\n;]+)["']?/i);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1].trim();
  const rawParts = rawMhtml.split(`--${boundary}`);
  if (rawParts.length < 2) return null;

  let mainHtml = '';
  const extraCss: string[] = [];
  const assetMap = new Map<string, string>();
  const SAFE_IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/i;

  for (const part of rawParts.slice(1)) {
    if (part.startsWith('--')) break;
    const splitIdx = part.search(/\r?\n\r?\n/);
    if (splitIdx === -1) continue;

    const headerRaw = part.slice(0, splitIdx);
    const bodyRaw = part.slice(splitIdx).replace(/^\r?\n\r?\n/, '').trim();

    const contentType =
      headerRaw.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase() || '';
    const encoding =
      headerRaw.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || '';
    const location =
      headerRaw.match(/Content-Location:\s*([^\r\n]+)/i)?.[1]?.trim() || '';
    const contentId =
      headerRaw.match(/Content-ID:\s*<?([^>\r\n]+)>?/i)?.[1]?.trim() || '';

    const decodeText = () => {
      if (encoding === 'quoted-printable') return decodeQuotedPrintable(bodyRaw);
      if (encoding === 'base64') {
        return decodeBase64Utf8(bodyRaw);
      }
      return bodyRaw;
    };

    if (contentType === 'text/html' && !mainHtml) {
      mainHtml = decodeText();
    } else if (contentType === 'text/css') {
      extraCss.push(decodeText());
    } else if (SAFE_IMAGE_MIME.test(contentType) && encoding === 'base64') {
      const dataUri = `data:${contentType};base64,${bodyRaw.replace(/\s+/g, '')}`;
      if (location) assetMap.set(location, dataUri);
      if (contentId) assetMap.set(`cid:${contentId}`, dataUri);
    }
  }

  if (!mainHtml) return null;

  let hydrated = mainHtml;
  for (const [ref, dataUri] of assetMap.entries()) {
    hydrated = hydrated.split(ref).join(dataUri);
  }

  if (extraCss.length > 0) {
    const styleBlock = `<style data-mhtml-inlined="true">\n${extraCss.join('\n')}\n</style>`;
    if (/<\/head>/i.test(hydrated)) {
      hydrated = hydrated.replace(/<\/head>/i, `${styleBlock}\n</head>`);
    } else {
      hydrated = `${styleBlock}\n${hydrated}`;
    }
  }

  return hydrated;
}

export function buildWebCaptureScript(): string {
  return `// Slideino Browser Slide Extractor (works on GenSpark & web slide decks)
// Paste this into your browser DevTools Console (F12 -> Console) on the slide page.
(() => {
  const collectStyles = (doc) => {
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.outerHTML)
      .join('\\n');
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .filter((l) => /^https:/i.test(l.href))
      .map((l) => '<link rel="stylesheet" href="' + l.href + '">')
      .join('\\n');
    return links + '\\n' + styles;
  };

  const slides = [];

  // 1. Check for slide iframes (used by GenSpark & AI slide viewers)
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const frame of iframes) {
    try {
      if (frame.srcdoc && frame.srcdoc.trim().length > 80) {
        slides.push(frame.srcdoc.trim());
        continue;
      }
      const fdoc = frame.contentDocument;
      if (fdoc && fdoc.body && fdoc.body.innerHTML.trim().length > 80) {
        slides.push('<!doctype html><html><head>' + collectStyles(fdoc) + '</head><body>' + fdoc.body.innerHTML + '</body></html>');
      }
    } catch (_) {}
  }

  // 2. Fallback: look for slide sections or slide containers on the page
  if (slides.length === 0) {
    const selectors = ['[data-slide]', '.slide', 'section.slide', 'main > section', '.swiper-slide'];
    let nodes = [];
    for (const sel of selectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) { nodes = found; break; }
    }
    const pageStyles = collectStyles(document);
    for (const node of nodes) {
      slides.push('<!doctype html><html><head>' + pageStyles + '</head><body>' + node.outerHTML + '</body></html>');
    }
  }

  if (slides.length === 0) {
    console.warn('Slideino Extractor: No slide iframes or .slide sections found on this page.');
    return;
  }

  const output = slides.join('\\n<!-- slide -->\\n');
  const blob = new Blob([output], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'slideino-captured-slides.html';
  a.click();
  console.log('Slideino Extractor: Downloaded ' + slides.length + ' slides!');
})();`;
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
      sharedCss: deck.sharedCss,
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
