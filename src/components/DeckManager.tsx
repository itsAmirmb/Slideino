import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
  Download,
  FileJson,
  GitCommitHorizontal,
  History,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Deck, SlideTheme } from '../types/slideino';
import { triggerFileDownload, validateImportedDeckJson } from '../utils/storage';

interface DeckManagerProps {
  decks: Deck[];
  activeDeck: Deck;
  themes: SlideTheme[];
  onSelectDeck: (deckId: string) => void;
  onCreateDeck: () => void;
  onDuplicateDeck: (deckId: string) => void;
  onDeleteDeck: (deckId: string) => void;
  onImportDeckJson: (deck: Deck) => void;
  onExportStandaloneHtml: (deck: Deck) => void;
  onSaveSnapshot: (message: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const DeckManager: React.FC<DeckManagerProps> = ({
  decks,
  activeDeck,
  themes,
  onSelectDeck,
  onCreateDeck,
  onDuplicateDeck,
  onDeleteDeck,
  onImportDeckJson,
  onExportStandaloneHtml,
  onSaveSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getThemeName = (themeId: string) =>
    themes.find((t) => t.id === themeId)?.name || 'Atelier Light';

  const handleExportJson = (deck: Deck) => {
    const slug = deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    triggerFileDownload(
      `${slug || 'slideino-deck'}.json`,
      JSON.stringify(deck, null, 2),
      'application/json'
    );
  };

  const handleUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const parsed = validateImportedDeckJson(reader.result);
        if (!parsed) {
          setImportError('Unable to import deck JSON. Ensure the file was exported from Slideino.');
          return;
        }
        onImportDeckJson(parsed);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommitSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = snapshotMsg.trim();
    if (!clean) return;
    onSaveSnapshot(clean);
    setSnapshotMsg('');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Heading */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50">
              Decks &amp; Revision History
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-2xl">
              Organize multiple slide decks, save named checkpoints before major edits, and export self-contained HTML presentations or Git-friendly JSON backups.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleUploadJson}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3.5 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Import Deck JSON</span>
            </button>
            <button
              type="button"
              onClick={onCreateDeck}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Deck</span>
            </button>
          </div>
        </div>

        {importError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{importError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Decks List */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Your Presentations ({decks.length})
            </h2>

            <div className="flex flex-col gap-3.5">
              {decks.map((deck) => {
                const isActive = deck.id === activeDeck.id;
                return (
                  <div
                    key={deck.id}
                    className={`p-5 rounded-xl bg-white dark:bg-slate-900 border transition-colors ${
                      isActive
                        ? 'border-blue-600 dark:border-blue-500'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
                          {deck.title}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono tabular-nums">
                            {deck.slides.length} {deck.slides.length === 1 ? 'slide' : 'slides'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{deck.aspectRatio}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getThemeName(deck.themeId)}</span>
                          <span aria-hidden="true">·</span>
                          <span>Updated {formatDate(deck.updatedAt)}</span>
                          {isActive && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                Open in Studio
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => onSelectDeck(deck.id)}
                          className="h-9 px-3.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
                        >
                          Open Deck
                        </button>
                      )}
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onExportStandaloneHtml(deck)}
                          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Standalone HTML</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportJson(deck)}
                          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Export JSON</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateDeck(deck.id)}
                          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Duplicate</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteDeck(deck.id)}
                        disabled={decks.length <= 1}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 cursor-pointer"
                        aria-label={`Delete ${deck.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Git-style Revision Snapshots for Active Deck */}
          <aside
            aria-labelledby="snapshots-heading"
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-5"
          >
            <div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <h2
                  id="snapshots-heading"
                  className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Revision Snapshots
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Save local checkpoints for <span className="font-medium text-slate-700 dark:text-slate-300">{activeDeck.title}</span> so you can roll back slide or theme changes anytime.
              </p>
            </div>

            <form onSubmit={handleCommitSnapshot} className="flex items-center gap-2">
              <input
                type="text"
                value={snapshotMsg}
                onChange={(e) => setSnapshotMsg(e.target.value)}
                placeholder="Checkpoint message (e.g. Final Q3 metrics)"
                aria-label="Revision checkpoint message"
                className="flex-1 h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={!snapshotMsg.trim()}
                className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                <GitCommitHorizontal className="w-4 h-4" aria-hidden="true" />
                <span>Save</span>
              </button>
            </form>

            {activeDeck.snapshots.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No snapshots saved for this deck yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {activeDeck.snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3.5 bg-slate-50/50 dark:bg-slate-950/60 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {snap.message}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono tabular-nums">{snap.slideCount} slides</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(snap.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRestoreSnapshot(snap.id)}
                        disabled={snap.slides.length === 0}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                        title="Restore this checkpoint"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSnapshot(snap.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        aria-label={`Delete snapshot ${snap.message}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};
