import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  EyeOff,
  FileCode2,
  Laptop,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AspectRatio,
  Deck,
  DevicePreview,
  Slide,
  SlideTemplate,
  SlideTheme,
  TransitionType,
} from '../types/slideino';
import { SLIDE_TEMPLATES } from '../data/starterDeck';
import { SlideFrame } from './SlideFrame';

interface StudioWorkspaceProps {
  deck: Deck;
  themes: SlideTheme[];
  activeTheme: SlideTheme;
  activeSlideIndex: number;
  uiDarkMode: boolean;
  onToggleUiDarkMode: () => void;
  onSelectSlide: (index: number) => void;
  onUpdateDeck: (updater: (deck: Deck) => Deck) => void;
  onUpdateSlide: (slideId: string, patch: Partial<Slide>) => void;
  onAddSlide: (template?: SlideTemplate) => void;
  onDuplicateSlide: (slideId: string) => void;
  onDeleteSlide: (slideId: string) => void;
  onMoveSlide: (index: number, direction: -1 | 1) => void;
  onOpenImportModal: (mode: 'import' | 'prompt') => void;
  onExportStandaloneHtml: () => void;
}

type InspectorTab = 'html' | 'css' | 'notes' | 'settings';

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  deck,
  themes,
  activeTheme,
  activeSlideIndex,
  uiDarkMode,
  onToggleUiDarkMode,
  onSelectSlide,
  onUpdateDeck,
  onUpdateSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onOpenImportModal,
  onExportStandaloneHtml,
}) => {
  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('html');
  const [devicePreview, setDevicePreview] = useState<DevicePreview>('desktop');
  const [slideSearch, setSlideSearch] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  const activeSlide = deck.slides[activeSlideIndex] || deck.slides[0];

  const filteredSlides = useMemo(() => {
    const q = slideSearch.trim().toLowerCase();
    return deck.slides
      .map((slide, originalIndex) => ({ slide, originalIndex }))
      .filter(({ slide }) => !q || slide.title.toLowerCase().includes(q));
  }, [deck.slides, slideSearch]);

  const handleCodeTabKey = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    field: 'html' | 'css'
  ) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const next = `${val.slice(0, start)}  ${val.slice(end)}`;
    onUpdateSlide(activeSlide.id, { [field]: next });
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  const handleStageKeyForward = (key: string) => {
    if (key === 'ArrowRight' || key === 'PageDown') {
      onSelectSlide(Math.min(deck.slides.length - 1, activeSlideIndex + 1));
    } else if (key === 'ArrowLeft' || key === 'PageUp') {
      onSelectSlide(Math.max(0, activeSlideIndex - 1));
    }
  };

  const deviceWidthClass =
    devicePreview === 'mobile'
      ? 'max-w-[390px]'
      : devicePreview === 'tablet'
      ? 'max-w-[780px]'
      : 'max-w-full';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Compact Workspace Toolbar */}
      <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setLeftRailOpen((v) => !v)}
            className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0 ${
              leftRailOpen
                ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            aria-label={leftRailOpen ? 'Hide slide list' : 'Show slide list'}
            title="Toggle Slide List"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={deck.title}
            onChange={(e) =>
              onUpdateDeck((d) => ({
                ...d,
                title: e.target.value,
                updatedAt: new Date().toISOString(),
              }))
            }
            aria-label="Deck title"
            className="min-w-[160px] max-w-[280px] sm:max-w-[340px] px-2.5 py-1.5 rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-950 text-sm font-semibold text-slate-900 dark:text-slate-100 border border-transparent focus:border-slate-300 dark:focus:border-slate-700 truncate"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Aspect Ratio Selector */}
          <label className="sr-only" htmlFor="aspect-ratio-select">
            Slide aspect ratio
          </label>
          <select
            id="aspect-ratio-select"
            value={deck.aspectRatio}
            onChange={(e) =>
              onUpdateDeck((d) => ({
                ...d,
                aspectRatio: e.target.value as AspectRatio,
                updatedAt: new Date().toISOString(),
              }))
            }
            className="h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <option value="16:9">16:9 Widescreen</option>
            <option value="16:10">16:10 Display</option>
            <option value="4:3">4:3 Classic</option>
            <option value="9:16">9:16 Vertical</option>
            <option value="fluid">Fluid Responsive</option>
          </select>

          {/* Theme Quick Switcher */}
          <label className="sr-only" htmlFor="quick-theme-select">
            Active slide theme
          </label>
          <select
            id="quick-theme-select"
            value={deck.themeId}
            onChange={(e) =>
              onUpdateDeck((d) => ({
                ...d,
                themeId: e.target.value,
                updatedAt: new Date().toISOString(),
              }))
            }
            className="h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[165px] truncate cursor-pointer"
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Responsive Viewport Preview Switch */}
          <div
            role="group"
            aria-label="Viewport size preview"
            className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            {(
              [
                { id: 'desktop', icon: Laptop, label: 'Desktop preview' },
                { id: 'tablet', icon: Tablet, label: 'Tablet preview' },
                { id: 'mobile', icon: Smartphone, label: 'Mobile preview' },
              ] as const
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDevicePreview(id)}
                aria-label={label}
                aria-pressed={devicePreview === id}
                className={`w-8 h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                  devicePreview === id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <span className="hidden lg:inline-block w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5" aria-hidden="true" />

          {/* Import AI HTML */}
          <button
            type="button"
            onClick={() => onOpenImportModal('import')}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import HTML</span>
          </button>

          {/* Copy AI Prompt */}
          <button
            type="button"
            onClick={() => onOpenImportModal('prompt')}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden md:inline">AI Prompt</span>
          </button>

          {/* Export Standalone HTML */}
          <button
            type="button"
            onClick={onExportStandaloneHtml}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Export HTML</span>
          </button>

          {/* Studio Light / Dark Toggle */}
          <button
            type="button"
            onClick={onToggleUiDarkMode}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label={uiDarkMode ? 'Switch studio to light mode' : 'Switch studio to dark mode'}
            title={uiDarkMode ? 'Light Studio UI' : 'Dark Studio UI'}
          >
            {uiDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Toggle Code Inspector */}
          <button
            type="button"
            onClick={() => setRightInspectorOpen((v) => !v)}
            className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0 ${
              rightInspectorOpen
                ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            aria-label={rightInspectorOpen ? 'Hide code editor' : 'Show code editor'}
            title="Toggle Code Editor"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3-Pane Studio Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Slide Navigator Rail */}
        {leftRailOpen && (
          <aside
            aria-label="Slide navigator"
            className="w-full lg:w-64 xl:w-72 shrink-0 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col max-h-56 lg:max-h-none"
          >
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={slideSearch}
                  onChange={(e) => setSlideSearch(e.target.value)}
                  placeholder="Filter slides..."
                  aria-label="Filter slides"
                  className="w-full h-9 pl-8 pr-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTemplateMenuOpen((v) => !v)}
                  className="h-9 px-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  aria-expanded={templateMenuOpen}
                  aria-haspopup="menu"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>

                {templateMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-30"
                  >
                    <div className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      New Slide From Template
                    </div>
                    {SLIDE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onAddSlide(tpl);
                          setTemplateMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {tpl.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {tpl.summary}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-hidden">
              {filteredSlides.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  No slides match &ldquo;{slideSearch}&rdquo;.
                </div>
              ) : (
                filteredSlides.map(({ slide, originalIndex }) => {
                  const isSelected = originalIndex === activeSlideIndex;
                  return (
                    <div
                      key={slide.id}
                      className={`group w-48 lg:w-full shrink-0 rounded-xl border transition-colors overflow-hidden ${
                        isSelected
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSlide(originalIndex)}
                        className="w-full text-left block cursor-pointer"
                        aria-current={isSelected ? 'true' : undefined}
                      >
                        <div className="aspect-video w-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative border-b border-slate-100 dark:border-slate-800">
                          <SlideFrame
                            slide={slide}
                            theme={activeTheme}
                            libraries={deck.libraries}
                            customResources={deck.customResources}
                            aspectRatio={deck.aspectRatio}
                            isThumbnail
                          />
                          {slide.hidden && (
                            <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
                              <EyeOff className="w-4 h-4 text-white" aria-label="Hidden slide" />
                            </div>
                          )}
                        </div>
                        <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {slide.title}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                            {String(originalIndex + 1).padStart(2, '0')}
                          </span>
                        </div>
                      </button>

                      {/* Accessible Slide Row Actions */}
                      <div className="px-2 pb-2 flex items-center justify-end gap-1 border-t border-slate-100 dark:border-slate-800/70 pt-1.5">
                        <button
                          type="button"
                          onClick={() => onMoveSlide(originalIndex, -1)}
                          disabled={originalIndex === 0}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          aria-label={`Move slide ${originalIndex + 1} up`}
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveSlide(originalIndex, 1)}
                          disabled={originalIndex === deck.slides.length - 1}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          aria-label={`Move slide ${originalIndex + 1} down`}
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateSlide(slide.id)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label={`Duplicate slide ${originalIndex + 1}`}
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSlide(slide.id)}
                          disabled={deck.slides.length <= 1}
                          className="p-1.5 rounded text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 cursor-pointer"
                          aria-label={`Delete slide ${originalIndex + 1}`}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Center Focal Stage */}
        <section
          aria-label="Live slide canvas"
          className="flex-1 min-w-0 min-h-[340px] flex flex-col bg-slate-100/80 dark:bg-slate-950"
        >
          <div className="flex-1 min-h-0 p-4 sm:p-8 flex items-center justify-center overflow-hidden">
            <div
              className={`w-full h-full ${deviceWidthClass} mx-auto flex items-center justify-center transition-[max-width] duration-200`}
            >
              <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden shadow-md border border-slate-200/90 dark:border-slate-800 bg-slate-200/40 dark:bg-slate-900/50">
                <SlideFrame
                  slide={activeSlide}
                  theme={activeTheme}
                  libraries={deck.libraries}
                  customResources={deck.customResources}
                  aspectRatio={deck.aspectRatio}
                  onForwardKey={handleStageKeyForward}
                />
              </div>
            </div>
          </div>

          {/* Stage Footer Transport Bar */}
          <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeSlide.title}
              </span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{deck.aspectRatio}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden sm:inline whitespace-nowrap">{activeTheme.name}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSelectSlide(Math.max(0, activeSlideIndex - 1))}
                disabled={activeSlideIndex === 0}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 min-w-[54px] text-center">
                {String(activeSlideIndex + 1).padStart(2, '0')} /{' '}
                {String(deck.slides.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => onSelectSlide(Math.min(deck.slides.length - 1, activeSlideIndex + 1))}
                disabled={activeSlideIndex === deck.slides.length - 1}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                aria-label="Next slide"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Right Code & Properties Inspector */}
        {rightInspectorOpen && (
          <aside
            aria-label="Slide code and settings editor"
            className="w-full lg:w-[390px] xl:w-[440px] shrink-0 bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col min-h-[300px] lg:min-h-0"
          >
            {/* Inspector Tabs */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Slide inspector tabs"
                className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full"
              >
                {(
                  [
                    { id: 'html', label: 'HTML' },
                    { id: 'css', label: 'CSS' },
                    { id: 'notes', label: 'Notes' },
                    { id: 'settings', label: 'Settings' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === tab.id}
                    onClick={() => setInspectorTab(tab.id)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      inspectorTab === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inspector Body */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {inspectorTab === 'html' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>HTML Markup (Fragments or Full Doc)</span>
                    </span>
                    <span className="font-mono tabular-nums">{activeSlide.html.length} chars</span>
                  </div>
                  <textarea
                    value={activeSlide.html}
                    onChange={(e) => onUpdateSlide(activeSlide.id, { html: e.target.value })}
                    onKeyDown={(e) => handleCodeTabKey(e, 'html')}
                    spellCheck={false}
                    aria-label="Slide HTML code"
                    className="code-editor flex-1 w-full p-4 bg-slate-50/70 dark:bg-slate-950 text-xs leading-6 text-slate-900 dark:text-slate-100 border-0 resize-none focus:outline-none"
                  />
                </div>
              )}

              {inspectorTab === 'css' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Scoped Slide CSS</span>
                    <span className="font-mono tabular-nums">{activeSlide.css.length} chars</span>
                  </div>
                  <textarea
                    value={activeSlide.css}
                    onChange={(e) => onUpdateSlide(activeSlide.id, { css: e.target.value })}
                    onKeyDown={(e) => handleCodeTabKey(e, 'css')}
                    placeholder="/* Use var(--slide-bg), var(--slide-text), var(--slide-accent) */"
                    spellCheck={false}
                    aria-label="Slide CSS code"
                    className="code-editor flex-1 w-full p-4 bg-slate-50/70 dark:bg-slate-950 text-xs leading-6 text-slate-900 dark:text-slate-100 border-0 resize-none focus:outline-none"
                  />
                </div>
              )}

              {inspectorTab === 'notes' && (
                <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Speaker notes appear in Presenter View (press <kbd className="font-mono">N</kbd> while presenting).
                  </p>
                  <textarea
                    value={activeSlide.notes}
                    onChange={(e) => onUpdateSlide(activeSlide.id, { notes: e.target.value })}
                    placeholder="Add talking points, timing cues, or key citations for this slide..."
                    aria-label="Speaker notes"
                    className="flex-1 w-full p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-900 dark:text-slate-100 resize-none"
                  />
                </div>
              )}

              {inspectorTab === 'settings' && (
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                  <div>
                    <label
                      htmlFor="slide-title-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Slide Title (used in Navigator &amp; Screen Reader)
                    </label>
                    <input
                      id="slide-title-input"
                      type="text"
                      value={activeSlide.title}
                      onChange={(e) => onUpdateSlide(activeSlide.id, { title: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="slide-transition-select"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Slide Transition
                    </label>
                    <select
                      id="slide-transition-select"
                      value={activeSlide.transition}
                      onChange={(e) =>
                        onUpdateSlide(activeSlide.id, {
                          transition: e.target.value as TransitionType,
                        })
                      }
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100"
                    >
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="zoom">Zoom</option>
                      <option value="none">None (Instant)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="slide-bg-override"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Background Override (CSS color or gradient)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="slide-bg-override"
                        type="text"
                        value={activeSlide.backgroundOverride || ''}
                        onChange={(e) =>
                          onUpdateSlide(activeSlide.id, {
                            backgroundOverride: e.target.value || undefined,
                          })
                        }
                        placeholder={`Inherits theme (${activeTheme.tokens.bg})`}
                        className="flex-1 h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                      />
                      {activeSlide.backgroundOverride && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSlide(activeSlide.id, { backgroundOverride: undefined })
                          }
                          className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        Skip slide during presentation
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Keep this slide in the editor without showing it to the audience.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(activeSlide.hidden)}
                      onChange={(e) => onUpdateSlide(activeSlide.id, { hidden: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
