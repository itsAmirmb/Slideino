import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Deck, SlideTheme } from '../types/slideino';
import {
  FONT_OPTIONS,
  getContrastGrade,
  getContrastRatio,
  isColorDark,
} from '../data/themes';
import { triggerFileDownload, validateImportedThemeJson } from '../utils/storage';
import { SlideFrame } from './SlideFrame';

interface ThemeStudioProps {
  deck: Deck;
  themes: SlideTheme[];
  activeSlideIndex: number;
  onSelectDeckTheme: (themeId: string) => void;
  onSaveCustomTheme: (theme: SlideTheme) => void;
  onDeleteCustomTheme: (themeId: string) => void;
}

export const ThemeStudio: React.FC<ThemeStudioProps> = ({
  deck,
  themes,
  activeSlideIndex,
  onSelectDeckTheme,
  onSaveCustomTheme,
  onDeleteCustomTheme,
}) => {
  const [editingId, setEditingId] = useState<string>(deck.themeId);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === editingId) || themes[0],
    [themes, editingId]
  );

  const previewSlide = deck.slides[activeSlideIndex] || deck.slides[0];

  const textContrast = useMemo(
    () => getContrastRatio(selectedTheme.tokens.text, selectedTheme.tokens.bg),
    [selectedTheme.tokens.text, selectedTheme.tokens.bg]
  );
  const mutedContrast = useMemo(
    () => getContrastRatio(selectedTheme.tokens.muted, selectedTheme.tokens.bg),
    [selectedTheme.tokens.muted, selectedTheme.tokens.bg]
  );
  const accentContrast = useMemo(
    () => getContrastRatio(selectedTheme.tokens.accent, selectedTheme.tokens.bg),
    [selectedTheme.tokens.accent, selectedTheme.tokens.bg]
  );

  const textGrade = getContrastGrade(textContrast);
  const mutedGrade = getContrastGrade(mutedContrast);
  const accentGrade = getContrastGrade(accentContrast);

  const handleCreateCustomFrom = (source: SlideTheme) => {
    const newTheme: SlideTheme = {
      ...source,
      id: `theme-custom-${Date.now()}`,
      name: `${source.name} Copy`,
      description: 'Custom slide theme configured in Slideino.',
      isBuiltIn: false,
      tokens: { ...source.tokens },
    };
    onSaveCustomTheme(newTheme);
    setEditingId(newTheme.id);
    onSelectDeckTheme(newTheme.id);
  };

  const updateEditingToken = <K extends keyof SlideTheme['tokens']>(
    key: K,
    value: SlideTheme['tokens'][K]
  ) => {
    if (selectedTheme.isBuiltIn) {
      // Automatically fork built-in theme into a custom editable copy on first edit
      const forked: SlideTheme = {
        ...selectedTheme,
        id: `theme-custom-${Date.now()}`,
        name: `${selectedTheme.name} (Custom)`,
        isBuiltIn: false,
        tokens: { ...selectedTheme.tokens, [key]: value },
        isDark: key === 'bg' && typeof value === 'string' ? isColorDark(value) : selectedTheme.isDark,
      };
      onSaveCustomTheme(forked);
      setEditingId(forked.id);
      onSelectDeckTheme(forked.id);
      return;
    }

    const updated: SlideTheme = {
      ...selectedTheme,
      tokens: { ...selectedTheme.tokens, [key]: value },
      isDark: key === 'bg' && typeof value === 'string' ? isColorDark(value) : selectedTheme.isDark,
    };
    onSaveCustomTheme(updated);
  };

  const updateThemeField = (patch: Partial<SlideTheme>) => {
    if (selectedTheme.isBuiltIn) {
      const forked: SlideTheme = {
        ...selectedTheme,
        ...patch,
        id: `theme-custom-${Date.now()}`,
        name: patch.name || `${selectedTheme.name} (Custom)`,
        isBuiltIn: false,
      };
      onSaveCustomTheme(forked);
      setEditingId(forked.id);
      onSelectDeckTheme(forked.id);
      return;
    }
    onSaveCustomTheme({ ...selectedTheme, ...patch });
  };

  const handleExportTheme = () => {
    const slug = selectedTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    triggerFileDownload(
      `${slug || 'slideino-theme'}.json`,
      JSON.stringify(selectedTheme, null, 2),
      'application/json'
    );
  };

  const handleImportTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const valid = validateImportedThemeJson(reader.result);
        if (!valid) {
          setImportError('Invalid theme JSON format. Export a theme to see the expected schema.');
          return;
        }
        onSaveCustomTheme(valid);
        setEditingId(valid.id);
        onSelectDeckTheme(valid.id);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Page Heading */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50">
              Custom Theme Studio
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-2xl">
              Configure reusable typography, color tokens, spacing, and global CSS variables with real-time WCAG 2.1 contrast checks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportTheme}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3.5 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={() => handleCreateCustomFrom(selectedTheme)}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Custom Theme</span>
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

        {/* Main 2-Column Theme Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Theme Library + Live Preview */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Live Preview Canvas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Live Theme Preview
                  </span>
                  <span className="mx-2" aria-hidden="true">·</span>
                  <span>{selectedTheme.name}</span>
                  {deck.themeId === selectedTheme.id && (
                    <>
                      <span className="mx-2" aria-hidden="true">·</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        Active on current deck
                      </span>
                    </>
                  )}
                </div>

                {deck.themeId !== selectedTheme.id && (
                  <button
                    type="button"
                    onClick={() => onSelectDeckTheme(selectedTheme.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    Apply to Deck
                  </button>
                )}
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
                <SlideFrame
                  slide={previewSlide}
                  theme={selectedTheme}
                  libraries={deck.libraries}
                  customResources={deck.customResources}
                  aspectRatio="16:9"
                  isThumbnail
                />
              </div>
            </div>

            {/* WCAG Contrast Verification Strip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  WCAG 2.1 Accessibility Contrast Audit
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Target: 4.5:1 AA · 7.0:1 AAA
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Primary Text / Canvas', ratio: textContrast, grade: textGrade },
                  { label: 'Muted Copy / Canvas', ratio: mutedContrast, grade: mutedGrade },
                  { label: 'Accent / Canvas', ratio: accentContrast, grade: accentGrade },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      {metric.label}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {metric.ratio.toFixed(2)}:1
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          metric.grade.passesAA
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {metric.grade.passesAA ? (
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{metric.grade.label}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Themes List */}
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Installed Themes ({themes.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {themes.map((theme) => {
                  const isSelected = theme.id === selectedTheme.id;
                  const isApplied = theme.id === deck.themeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        setEditingId(theme.id);
                        onSelectDeckTheme(theme.id);
                      }}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-slate-900 ring-1 ring-blue-600/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {theme.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700"
                            style={{ backgroundColor: theme.tokens.bg }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700"
                            style={{ backgroundColor: theme.tokens.text }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700"
                            style={{ backgroundColor: theme.tokens.accent }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {theme.description}
                      </p>
                      <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span>{theme.isBuiltIn ? 'Built-in preset' : 'Custom theme'}</span>
                        {isApplied && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              Active
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Token & Custom CSS Editor */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Theme Tokens
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedTheme.isBuiltIn
                    ? 'Editing a preset creates a custom copy automatically.'
                    : 'Changes save immediately to your browser.'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCreateCustomFrom(selectedTheme)}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Duplicate theme"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleExportTheme}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Export theme JSON"
                  title="Export JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {!selectedTheme.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteCustomTheme(selectedTheme.id);
                      setEditingId(themes[0].id);
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    aria-label="Delete custom theme"
                    title="Delete Theme"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor="theme-name-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Theme Name
              </label>
              <input
                id="theme-name-input"
                type="text"
                value={selectedTheme.name}
                onChange={(e) => updateThemeField({ name: e.target.value })}
                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Color Token Grid */}
            <div className="grid grid-cols-2 gap-3.5">
              {(
                [
                  { key: 'bg', label: 'Canvas Background' },
                  { key: 'surface', label: 'Surface Card' },
                  { key: 'text', label: 'Primary Ink' },
                  { key: 'muted', label: 'Muted Ink' },
                  { key: 'accent', label: 'Accent Color' },
                  { key: 'border', label: 'Hairline Border' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <label
                    htmlFor={`color-${key}`}
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`color-${key}`}
                      type="color"
                      value={selectedTheme.tokens[key]}
                      onChange={(e) => updateEditingToken(key, e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={selectedTheme.tokens[key]}
                      onChange={(e) => updateEditingToken(key, e.target.value)}
                      aria-label={`${label} hex value`}
                      className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Typography Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="font-display-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Display Font
                </label>
                <select
                  id="font-display-select"
                  value={selectedTheme.tokens.fontDisplay}
                  onChange={(e) => updateEditingToken('fontDisplay', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
                >
                  {FONT_OPTIONS.display.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="font-body-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Body Font
                </label>
                <select
                  id="font-body-select"
                  value={selectedTheme.tokens.fontBody}
                  onChange={(e) => updateEditingToken('fontBody', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
                >
                  {FONT_OPTIONS.body.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Numeric Layout Sliders */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="token-font-size"
                  className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1"
                >
                  <span>Base Size</span>
                  <span className="font-mono tabular-nums">{selectedTheme.tokens.baseFontSize}px</span>
                </label>
                <input
                  id="token-font-size"
                  type="range"
                  min={14}
                  max={24}
                  value={selectedTheme.tokens.baseFontSize}
                  onChange={(e) => updateEditingToken('baseFontSize', Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="token-radius"
                  className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1"
                >
                  <span>Radius</span>
                  <span className="font-mono tabular-nums">{selectedTheme.tokens.radius}px</span>
                </label>
                <input
                  id="token-radius"
                  type="range"
                  min={0}
                  max={24}
                  value={selectedTheme.tokens.radius}
                  onChange={(e) => updateEditingToken('radius', Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="token-padding"
                  className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1"
                >
                  <span>Padding</span>
                  <span className="font-mono tabular-nums">{selectedTheme.tokens.padding}px</span>
                </label>
                <input
                  id="token-padding"
                  type="range"
                  min={28}
                  max={96}
                  step={4}
                  value={selectedTheme.tokens.padding}
                  onChange={(e) => updateEditingToken('padding', Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>

            {/* Global Theme Custom CSS */}
            <div>
              <label
                htmlFor="theme-custom-css"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Global Theme CSS (applied across every slide)
              </label>
              <textarea
                id="theme-custom-css"
                value={selectedTheme.customCss}
                onChange={(e) => updateThemeField({ customCss: e.target.value })}
                placeholder="/* Example: h1 { letter-spacing: -0.03em; } */"
                spellCheck={false}
                className="code-editor w-full h-32 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 resize-y"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
