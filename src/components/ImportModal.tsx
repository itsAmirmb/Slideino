import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, FileCode2, Upload, X } from 'lucide-react';
import { Deck, Slide, SlideTheme } from '../types/slideino';
import { buildAiPromptTemplate, parseImportedHtml } from '../utils/htmlImporter';

interface ImportModalProps {
  isOpen: boolean;
  initialMode: 'import' | 'prompt';
  deck: Deck;
  theme: SlideTheme;
  onClose: () => void;
  onImportSlides: (slides: Slide[], target: 'append' | 'new-deck', title?: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  initialMode,
  deck,
  theme,
  onClose,
  onImportSlides,
}) => {
  const [mode, setMode] = useState<'import' | 'prompt'>(initialMode);
  const [rawHtml, setRawHtml] = useState('');
  const [importTarget, setImportTarget] = useState<'append' | 'new-deck'>('append');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const parsed = useMemo(() => parseImportedHtml(rawHtml), [rawHtml]);
  const promptText = useMemo(
    () => buildAiPromptTemplate(deck, theme, deck.libraries),
    [deck, theme]
  );

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawHtml(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSubmit = () => {
    if (parsed.slides.length === 0) return;
    onImportSlides(parsed.slides, importTarget, parsed.detectedTitle);
    setRawHtml('');
    onClose();
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
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
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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
                Import HTML / CSS
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

        {mode === 'import' ? (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Paste a single slide or a full multi-slide HTML document separated by{' '}
                <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  &lt;section&gt;
                </code>
                ,{' '}
                <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  .slide
                </code>
                , or{' '}
                <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  &lt;!-- slide --&gt;
                </code>
                .
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Upload .html File</span>
              </button>
            </div>

            <textarea
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder={`<section class="p-16">\n  <h1>Quarterly Product Roadmap</h1>\n  <p>Paste any HTML, CSS, Tailwind, Mermaid, Chart.js, or KaTeX markup...</p>\n</section>`}
              spellCheck={false}
              aria-label="Paste HTML and CSS slide code"
              className="code-editor w-full h-64 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-900 dark:text-slate-100 resize-y focus:border-blue-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  {parsed.slides.length} {parsed.slides.length === 1 ? 'slide' : 'slides'} detected
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
                  disabled={parsed.slides.length === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Import {parsed.slides.length > 0 ? `${parsed.slides.length} ` : ''}
                  {parsed.slides.length === 1 ? 'Slide' : 'Slides'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Copy this tailored prompt into your preferred AI tool so the generated HTML and CSS slides automatically match your active theme variables ({theme.name}), aspect ratio ({deck.aspectRatio}), and enabled libraries.
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
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied Prompt' : 'Copy Prompt'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
