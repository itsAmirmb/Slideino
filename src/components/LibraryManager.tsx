import React, { useMemo, useState } from 'react';
import { AlertCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  CustomResource,
  Deck,
  LibraryCategory,
  LibraryDefinition,
  LibraryId,
} from '../types/slideino';
import { LIBRARY_CATALOG } from '../data/libraries';
import { isValidHttpsUrl } from '../utils/storage';

interface LibraryManagerProps {
  deck: Deck;
  onToggleLibrary: (id: LibraryId) => void;
  onInsertLibraryExample: (lib: LibraryDefinition) => void;
  onAddCustomResource: (res: CustomResource) => void;
  onRemoveCustomResource: (id: string) => void;
}

const CATEGORIES: { id: 'all' | LibraryCategory; label: string }[] = [
  { id: 'all', label: 'All Libraries' },
  { id: 'styling', label: 'Styling' },
  { id: 'diagrams', label: 'Diagrams & Charts' },
  { id: 'math-code', label: 'Math & Code' },
  { id: 'icons-motion', label: 'Icons & Motion' },
];

export const LibraryManager: React.FC<LibraryManagerProps> = ({
  deck,
  onToggleLibrary,
  onInsertLibraryExample,
  onAddCustomResource,
  onRemoveCustomResource,
}) => {
  const [category, setCategory] = useState<'all' | LibraryCategory>('all');
  const [resLabel, setResLabel] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resType, setResType] = useState<'script' | 'style'>('style');
  const [urlError, setUrlError] = useState<string | null>(null);

  const visibleLibraries = useMemo(
    () =>
      category === 'all'
        ? LIBRARY_CATALOG
        : LIBRARY_CATALOG.filter((lib) => lib.category === category),
    [category]
  );

  const enabledCount = useMemo(
    () => Object.values(deck.libraries).filter(Boolean).length,
    [deck.libraries]
  );

  const handleAddResource = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    const trimmedUrl = resUrl.trim();
    if (!isValidHttpsUrl(trimmedUrl)) {
      setUrlError('Only valid HTTPS URLs (https://...) are permitted for external slide assets.');
      return;
    }
    onAddCustomResource({
      id: `res-${Date.now()}`,
      label: resLabel.trim() || new URL(trimmedUrl).hostname,
      type: resType,
      url: trimmedUrl,
    });
    setResLabel('');
    setResUrl('');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Heading & Filter Bar */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50">
              Slide Libraries &amp; Runtime Tools
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-2xl">
              Toggle the web libraries injected automatically into your sandboxed slide stage.{' '}
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-200">
                {enabledCount} of {LIBRARY_CATALOG.length}
              </span>{' '}
              enabled for {deck.title}.
            </p>
          </div>

          <div
            role="group"
            aria-label="Filter libraries by category"
            className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === cat.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Library Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleLibraries.map((lib) => {
            const enabled = Boolean(deck.libraries[lib.id]);
            return (
              <div
                key={lib.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                        {lib.name}
                      </h2>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono">{lib.version}</span>
                        <span aria-hidden="true">·</span>
                        <span>{enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Toggle ${lib.name}`}
                      onClick={() => onToggleLibrary(lib.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                    {lib.description}
                  </p>

                  <div className="mt-3 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                    {lib.usageHint}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onInsertLibraryExample(lib)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Insert Demo Slide</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom External HTTPS Scripts / Stylesheets */}
        <section
          aria-labelledby="custom-cdn-heading"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col gap-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2
                id="custom-cdn-heading"
                className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50"
              >
                Custom External Scripts &amp; Stylesheets
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Need Three.js, Plotly, Lottie, or a bespoke Google Font stylesheet? Attach any HTTPS CDN resource to this deck.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>HTTPS-only &amp; isolated inside sandboxed iframe</span>
            </div>
          </div>

          <form onSubmit={handleAddResource} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              type="text"
              value={resLabel}
              onChange={(e) => setResLabel(e.target.value)}
              placeholder="Label (e.g. Plotly.js)"
              aria-label="Resource label"
              className="sm:col-span-3 h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
            />
            <select
              value={resType}
              onChange={(e) => setResType(e.target.value as 'script' | 'style')}
              aria-label="Resource type"
              className="sm:col-span-2 h-10 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="style">Stylesheet (CSS)</option>
              <option value="script">Script (JS)</option>
            </select>
            <input
              type="url"
              value={resUrl}
              onChange={(e) => setResUrl(e.target.value)}
              placeholder="https://cdn.jsdelivr.net/npm/..."
              aria-label="HTTPS Resource URL"
              required
              className="sm:col-span-5 h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="sm:col-span-2 h-10 px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:opacity-90 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Add Resource
            </button>
          </form>

          {urlError && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{urlError}</span>
            </div>
          )}

          {deck.customResources.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {deck.customResources.map((res) => (
                <div
                  key={res.id}
                  className="px-4 py-3 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/60"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {res.label}{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        · {res.type === 'style' ? 'CSS Stylesheet' : 'JavaScript'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {res.url}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveCustomResource(res.id)}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
                    aria-label={`Remove ${res.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No custom external resources added yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
