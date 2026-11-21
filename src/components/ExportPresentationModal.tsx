import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  Grid,
  Loader2,
  NotebookPen,
  Radio,
  X,
} from 'lucide-react';
import { ASPECT_RATIO_LABELS, Deck, SlideTheme } from '../types/slideino';
import {
  DEFAULT_EXPORT_OPTIONS,
  PresentationExportOptions,
} from '../utils/presentationExporter';

interface ExportPresentationModalProps {
  isOpen: boolean;
  deck: Deck | null;
  theme: SlideTheme;
  onClose: () => void;
  onExport: (deck: Deck, options: PresentationExportOptions) => Promise<void>;
}

export const ExportPresentationModal: React.FC<ExportPresentationModalProps> = ({
  isOpen,
  deck,
  theme,
  onClose,
  onExport,
}) => {
  const [options, setOptions] = useState<PresentationExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [exporting, isOpen, onClose]);

  if (!isOpen || !deck) return null;

  const visibleCount = deck.slides.filter((s) => !s.hidden).length;
  const hiddenCount = deck.slides.length - visibleCount;
  const effectiveSlideCount =
    options.includeHiddenSlides || visibleCount === 0 ? deck.slides.length : visibleCount;

  const handleConfirm = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await onExport(deck, options);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => {
        if (!exporting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-presentation-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="export-presentation-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-50"
            >
              Export Standalone Presentation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Single self-contained HTML file that runs independently in any browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Close export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Deck Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {deck.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono tabular-nums">
                  {effectiveSlideCount} {effectiveSlideCount === 1 ? 'slide' : 'slides'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{ASPECT_RATIO_LABELS[deck.aspectRatio] || deck.aspectRatio}</span>
                <span aria-hidden="true">·</span>
                <span>{theme.name}</span>
              </div>
            </div>
            <FileCode2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          </div>

          {/* Player Feature Toggles */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Built-in Player Features
            </span>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={options.includeAnnotations}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, includeAnnotations: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                  <span>Laser Pointer &amp; Drawing Tools</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Smooth fading laser pointer, pen, highlighter, arrow, box, stroke eraser, and per-slide ink undo.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={options.includePresenterTools}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, includePresenterTools: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <NotebookPen className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
                  <span>Presenter Notes &amp; Timer (N)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Includes split presenter view with live clock, next-slide preview, and resizable speaker notes.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={options.includeGridAndBlackout}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, includeGridAndBlackout: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Slide Grid Overview (G) &amp; Blackout (B)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Visual slide jump grid and instant blackout screen toggle during live talks.
                </p>
              </div>
            </label>

            {hiddenCount > 0 && (
              <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  Include {hiddenCount} hidden {hiddenCount === 1 ? 'slide' : 'slides'}
                </span>
                <input
                  type="checkbox"
                  checked={options.includeHiddenSlides}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, includeHiddenSlides: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            )}
          </div>

          {/* Efficiency Note */}
          <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Shared fonts and stylesheets are deduplicated once and local images are embedded automatically so the exported <code className="font-mono">.html</code> file stays compact and runs offline.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="h-9 px-4 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={exporting}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{exporting ? 'Packaging Presentation...' : 'Export Presentation (.html)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
