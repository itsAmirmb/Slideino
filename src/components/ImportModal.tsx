import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  Globe,
  Loader2,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ASPECT_RATIO_LABELS, Deck, Slide, SlideTheme } from '../types/slideino';
import {
  buildAiPromptTemplate,
  buildWebCaptureScript,
  extractMhtmlHtml,
  isH2dOrUnsupportedBinary,
  ParsedImportResult,
  parseImportedHtml,
} from '../utils/htmlImporter';

interface ImportModalProps {
  isOpen: boolean;
  initialMode: 'import' | 'prompt' | 'capture';
  deck: Deck;
  theme: SlideTheme;
  onClose: () => void;
  onImportSlides: (
    slides: Slide[],
    target: 'append' | 'new-deck',
    title?: string,
    sharedCss?: string
  ) => void;
}

interface UploadedImportState {
  label: string;
  totalBytes: number;
  result: ParsedImportResult;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSourceLabel(format?: ParsedImportResult['sourceFormat']): string {
  switch (format) {
    case 'singlefile-iframes':
      return 'SingleFile embedded slide frames';
    case 'comment-delimited':
      return 'Comment-delimited slides';
    case 'sections':
      return 'HTML <section> slides';
    case 'slide-classes':
      return '.slide containers';
    case 'single-document':
      return 'Standalone HTML document';
    default:
      return 'HTML/CSS markup';
  }
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  initialMode,
  deck,
  theme,
  onClose,
  onImportSlides,
}) => {
  const [mode, setMode] = useState<'import' | 'capture' | 'prompt'>(initialMode);
  const [rawHtml, setRawHtml] = useState('');
  const [uploadedImport, setUploadedImport] = useState<UploadedImportState | null>(null);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importTarget, setImportTarget] = useState<'append' | 'new-deck'>('append');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{
    type: 'error' | 'h2d';
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(initialMode);
    setUploadNotice(null);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const pastedParsed = useMemo(
    () => (uploadedImport ? { slides: [], mode: 'single-slide' as const } : parseImportedHtml(rawHtml)),
    [rawHtml, uploadedImport]
  );

  const activeParsed: ParsedImportResult = uploadedImport ? uploadedImport.result : pastedParsed;

  const promptText = useMemo(
    () => buildAiPromptTemplate(deck, theme, deck.libraries),
    [deck, theme]
  );
  const captureScript = useMemo(() => buildWebCaptureScript(), []);

  if (!isOpen) return null;

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    if (files.length === 0) return;

    setUploadNotice(null);
    setIsParsingFiles(true);

    // Yield a frame so the loading state renders before parsing multi-MB SingleFile HTML
    await new Promise((resolve) => window.setTimeout(resolve, 16));

    try {
      const collectedHtmlParts: string[] = [];
      let totalBytes = 0;

      for (const file of files) {
        totalBytes += file.size;
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const check = isH2dOrUnsupportedBinary(file.name, bytes);
        if (check.unsupported) {
          setUploadNotice({
            type: check.isH2d ? 'h2d' : 'error',
            message: check.reason || 'Unsupported binary file.',
          });
          setIsParsingFiles(false);
          return;
        }

        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        const lower = file.name.toLowerCase();

        if (
          lower.endsWith('.mhtml') ||
          lower.endsWith('.mht') ||
          /Content-Type:\s*multipart\/related/i.test(text.slice(0, 600))
        ) {
          const extracted = extractMhtmlHtml(text);
          if (!extracted) {
            setUploadNotice({
              type: 'error',
              message: `Could not extract HTML content from "${file.name}". Try saving with the SingleFile browser extension or the Capture Script tab.`,
            });
            setIsParsingFiles(false);
            return;
          }
          collectedHtmlParts.push(extracted);
        } else {
          collectedHtmlParts.push(text.trim());
        }
      }

      const combined =
        collectedHtmlParts.length === 1
          ? collectedHtmlParts[0]
          : collectedHtmlParts.join('\n<!-- slide -->\n');

      const parsedResult = parseImportedHtml(combined);

      if (parsedResult.slides.length === 0) {
        setUploadNotice({
          type: 'error',
          message: 'No renderable HTML slides were detected in the selected file.',
        });
        setIsParsingFiles(false);
        return;
      }

      const label =
        files.length === 1 ? files[0].name : `${files.length} files (${files[0].name} + more)`;

      setUploadedImport({
        label,
        totalBytes,
        result: parsedResult,
      });
      setRawHtml('');

      // Default to creating a new deck when importing a multi-slide file
      if (parsedResult.slides.length > 1) {
        setImportTarget('new-deck');
      }
    } catch {
      setUploadNotice({
        type: 'error',
        message: 'Failed to read or parse the uploaded HTML file.',
      });
    } finally {
      setIsParsingFiles(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await processFiles(fileList);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleImportSubmit = () => {
    if (activeParsed.slides.length === 0) return;
    onImportSlides(
      activeParsed.slides,
      importTarget,
      activeParsed.detectedTitle,
      activeParsed.sharedCss
    );
    setRawHtml('');
    setUploadedImport(null);
    setUploadNotice(null);
    onClose();
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(captureScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h2
              id="import-modal-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-50"
            >
              AI HTML Workflow
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setMode('import')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'import'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Import HTML / MHTML
              </button>
              <button
                type="button"
                onClick={() => setMode('capture')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'capture'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Capture GenSpark / Web
              </button>
              <button
                type="button"
                onClick={() => setMode('prompt')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'prompt'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Copy AI Prompt
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === 'import' && (
          <div
            className={`p-6 flex flex-col gap-4 overflow-y-auto transition-colors ${
              isDragging ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Paste HTML/CSS or drop/upload{' '}
                <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  .html
                </code>{' '}
                (including <span className="font-medium text-slate-800 dark:text-slate-200">SingleFile</span> exports) or{' '}
                <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  .mhtml
                </code>{' '}
                files.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".html,.htm,.mhtml,.mht,.txt,.h2d"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingFiles}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isParsingFiles ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{isParsingFiles ? 'Parsing File...' : 'Upload HTML / SingleFile'}</span>
              </button>
            </div>

            {uploadNotice && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex flex-col gap-2.5"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <p className="leading-relaxed">{uploadNotice.message}</p>
                </div>
                {uploadNotice.type === 'h2d' && (
                  <div className="pl-6">
                    <button
                      type="button"
                      onClick={() => setMode('capture')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-900 dark:bg-amber-200 text-white dark:text-slate-950 font-medium cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open GenSpark Capture Guide</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {isParsingFiles ? (
              <div className="h-60 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>Extracting slides and deduplicating embedded fonts...</span>
              </div>
            ) : uploadedImport ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {uploadedImport.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>{formatBytes(uploadedImport.totalBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSourceLabel(uploadedImport.result.sourceFormat)}</span>
                        {uploadedImport.result.detectedTitle && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {uploadedImport.result.detectedTitle}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setUploadedImport(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                </div>

                {uploadedImport.result.savedBytes && uploadedImport.result.savedBytes > 50_000 && (
                  <div className="px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/80 text-[11px] text-blue-800 dark:text-blue-200">
                    Deduplicated {uploadedImport.result.deduplicatedFontCount || 'shared'} embedded font faces into deck-level CSS (saved{' '}
                    {formatBytes(uploadedImport.result.savedBytes)} for fast editing and local storage).
                  </div>
                )}

                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                  {uploadedImport.result.slides.map((s, idx) => (
                    <div
                      key={s.id}
                      className="px-3 py-1.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-800 dark:text-slate-200 truncate">
                        {s.title}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <textarea
                value={rawHtml}
                onChange={(e) => {
                  setRawHtml(e.target.value);
                  if (uploadNotice) setUploadNotice(null);
                }}
                placeholder={`<section class="p-16">\n  <h1>Quarterly Product Roadmap</h1>\n  <p>Paste any HTML, CSS, Tailwind, Mermaid, Chart.js, or KaTeX markup — or drop a SingleFile .html export here...</p>\n</section>`}
                spellCheck={false}
                aria-label="Paste HTML and CSS slide code"
                className="code-editor w-full h-60 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-900 dark:text-slate-100 resize-y focus:border-blue-500"
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  {activeParsed.slides.length}{' '}
                  {activeParsed.slides.length === 1 ? 'slide' : 'slides'} detected
                </span>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importTarget"
                      checked={importTarget === 'append'}
                      onChange={() => setImportTarget('append')}
                      className="accent-blue-600"
                    />
                    <span>Add to current deck</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importTarget"
                      checked={importTarget === 'new-deck'}
                      onChange={() => setImportTarget('new-deck')}
                      className="accent-blue-600"
                    />
                    <span>Create new deck</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={activeParsed.slides.length === 0 || isParsingFiles}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Import {activeParsed.slides.length > 0 ? `${activeParsed.slides.length} ` : ''}
                  {activeParsed.slides.length === 1 ? 'Slide' : 'Slides'}
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'capture' && (
          <div className="p-6 flex flex-col gap-5 overflow-y-auto">
            <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Because <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">.h2d</code> files from the <span className="font-medium text-slate-900 dark:text-slate-100">html.to.design</span> extension are encrypted strictly for Figma, use either of these open HTML capture methods to bring GenSpark or any web-based AI slides directly into Slideino:
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option 1: SingleFile or Chrome MHTML
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Install the free open-source <span className="font-medium text-slate-800 dark:text-slate-200">SingleFile</span> Chrome extension to save a self-contained <code className="font-mono">.html</code>, or press <kbd className="font-mono">Ctrl/Cmd + S</kbd> in Chrome and choose <span className="font-medium text-slate-800 dark:text-slate-200">Webpage, Single File (.mhtml)</span> — then upload it in the Import tab.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option 2: Multi-Slide Console Extractor
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Open your GenSpark deck, press <kbd className="font-mono">F12</kbd> → <span className="font-medium text-slate-800 dark:text-slate-200">Console</span>, and run the script below. It extracts all slide iframes or sections with CSS intact and downloads a ready-to-import <code className="font-mono">.html</code> file.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Browser Console Capture Script</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Copied Script' : 'Copy Capture Script'}</span>
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre leading-relaxed max-h-56">
                {captureScript}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMode('import')}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Back to Upload HTML / MHTML
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {mode === 'prompt' && (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Copy this tailored prompt into your preferred AI tool so the generated HTML and CSS slides automatically match your active theme variables ({theme.name}), screen size ({ASPECT_RATIO_LABELS[deck.aspectRatio] || deck.aspectRatio}), and enabled libraries.
            </p>

            <pre className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72">
              {promptText}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
              >
                {copiedPrompt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPrompt ? 'Copied Prompt' : 'Copy Prompt'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
