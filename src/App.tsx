import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CustomResource,
  Deck,
  LibraryDefinition,
  LibraryId,
  Slide,
  SlideTemplate,
  SlideTheme,
  WorkspaceTab,
} from './types/slideino';
import { DEFAULT_LIBRARIES } from './data/libraries';
import { SLIDE_TEMPLATES } from './data/starterDeck';
import { mergeSharedCss } from './utils/htmlImporter';
import { PresentationExportOptions } from './utils/presentationExporter';
import { detectSlideStaticDimensions } from './utils/slideRuntime';
import {
  getAllThemes,
  loadActiveDeckId,
  loadCustomThemes,
  loadDecks,
  loadUiDarkMode,
  saveActiveDeckId,
  saveCustomThemes,
  saveDecks,
  saveUiDarkMode,
  triggerFileDownload,
} from './utils/storage';
import { Header } from './components/Header';
import { StudioWorkspace } from './components/StudioWorkspace';
import { PresentationMode } from './components/PresentationMode';
import { parseAudienceUrlParams } from './utils/presentationSync';

const ThemeStudio = lazy(() =>
  import('./components/ThemeStudio').then((m) => ({ default: m.ThemeStudio }))
);
const LibraryManager = lazy(() =>
  import('./components/LibraryManager').then((m) => ({ default: m.LibraryManager }))
);
const DeckManager = lazy(() =>
  import('./components/DeckManager').then((m) => ({ default: m.DeckManager }))
);
const ImportModal = lazy(() =>
  import('./components/ImportModal').then((m) => ({ default: m.ImportModal }))
);
const ExportPresentationModal = lazy(() =>
  import('./components/ExportPresentationModal').then((m) => ({
    default: m.ExportPresentationModal,
  }))
);

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const audienceParams = useMemo(() => parseAudienceUrlParams(), []);

  const initialBoot = useMemo(() => {
    const initialDecks = loadDecks();
    const resolvedDeckId =
      audienceParams.isAudienceView &&
      audienceParams.deckId &&
      initialDecks.some((d) => d.id === audienceParams.deckId)
        ? audienceParams.deckId
        : loadActiveDeckId(initialDecks);
    return { initialDecks, resolvedDeckId };
  }, [audienceParams.deckId, audienceParams.isAudienceView]);

  const [decks, setDecks] = useState<Deck[]>(() => initialBoot.initialDecks);
  const [activeDeckId, setActiveDeckId] = useState<string>(() => initialBoot.resolvedDeckId);
  const [customThemes, setCustomThemes] = useState<SlideTheme[]>(() => loadCustomThemes());
  const [uiDarkMode, setUiDarkMode] = useState<boolean>(() => loadUiDarkMode());

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [activeSlideIndex, setActiveSlideIndex] = useState(() =>
    audienceParams.isAudienceView ? audienceParams.slideIndex : 0
  );
  const [presenting, setPresenting] = useState(() => audienceParams.isAudienceView);
  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    mode: 'import' | 'prompt';
  }>({ open: false, mode: 'import' });
  const [exportModalDeck, setExportModalDeck] = useState<Deck | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', uiDarkMode);
    if (!audienceParams.isAudienceView) {
      saveUiDarkMode(uiDarkMode);
    }
  }, [uiDarkMode, audienceParams.isAudienceView]);

  // Avoid overwriting Studio decks from a read-only Audience Window; instead listen for updates
  useEffect(() => {
    if (audienceParams.isAudienceView) return;
    saveDecks(decks);
  }, [decks, audienceParams.isAudienceView]);

  useEffect(() => {
    if (audienceParams.isAudienceView) return;
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId, audienceParams.isAudienceView]);

  useEffect(() => {
    if (audienceParams.isAudienceView) return;
    saveCustomThemes(customThemes);
  }, [customThemes, audienceParams.isAudienceView]);

  useEffect(() => {
    if (!audienceParams.isAudienceView) return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes('decks')) {
        setDecks(loadDecks());
      }
      if (!e.key || e.key.includes('themes')) {
        setCustomThemes(loadCustomThemes());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [audienceParams.isAudienceView]);

  const allThemes = useMemo(() => getAllThemes(customThemes), [customThemes]);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) || decks[0],
    [decks, activeDeckId]
  );

  const activeTheme = useMemo(
    () => allThemes.find((t) => t.id === activeDeck.themeId) || allThemes[0],
    [allThemes, activeDeck.themeId]
  );

  // Set clear browser tab title for Audience Window so it is effortless to spot in Zoom/Meet share pickers
  useEffect(() => {
    if (!audienceParams.isAudienceView) return;
    const prev = document.title;
    document.title = `Audience View — ${activeDeck.title}`;
    return () => {
      document.title = prev;
    };
  }, [audienceParams.isAudienceView, activeDeck.title]);

  // Keep slide index within bounds when deck changes
  useEffect(() => {
    if (activeSlideIndex >= activeDeck.slides.length) {
      setActiveSlideIndex(Math.max(0, activeDeck.slides.length - 1));
    }
  }, [activeDeck.slides.length, activeSlideIndex]);

  // Global Cmd/Ctrl + Enter shortcut to present
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !presenting) {
        e.preventDefault();
        setPresenting(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [presenting]);

  const updateActiveDeck = useCallback(
    (updater: (deck: Deck) => Deck) => {
      setDecks((prev) =>
        prev.map((d) => (d.id === activeDeck.id ? updater(d) : d))
      );
    },
    [activeDeck.id]
  );

  const handleUpdateSlide = useCallback(
    (slideId: string, patch: Partial<Slide>) => {
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        slides: d.slides.map((s) => (s.id === slideId ? { ...s, ...patch } : s)),
      }));
    },
    [updateActiveDeck]
  );

  const handleAddSlide = useCallback(
    (template?: SlideTemplate) => {
      const tpl = template || SLIDE_TEMPLATES[0];
      const newSlide: Slide = {
        id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: tpl.name,
        html: tpl.html,
        css: tpl.css,
        notes: tpl.notes,
        transition: activeDeck.defaultTransition,
      };
      const insertAt = activeSlideIndex + 1;
      updateActiveDeck((d) => {
        const nextSlides = [...d.slides];
        nextSlides.splice(insertAt, 0, newSlide);
        return {
          ...d,
          updatedAt: new Date().toISOString(),
          slides: nextSlides,
        };
      });
      setActiveSlideIndex(insertAt);
      showToast(`Added "${tpl.name}" slide`);
    },
    [activeDeck.defaultTransition, activeSlideIndex, showToast, updateActiveDeck]
  );

  const handleDuplicateSlide = useCallback(
    (slideId: string) => {
      const idx = activeDeck.slides.findIndex((s) => s.id === slideId);
      if (idx === -1) return;
      const orig = activeDeck.slides[idx];
      const copy: Slide = {
        ...orig,
        id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${orig.title} (Copy)`,
      };
      updateActiveDeck((d) => {
        const next = [...d.slides];
        next.splice(idx + 1, 0, copy);
        return { ...d, updatedAt: new Date().toISOString(), slides: next };
      });
      setActiveSlideIndex(idx + 1);
      showToast('Slide duplicated');
    },
    [activeDeck.slides, showToast, updateActiveDeck]
  );

  const handleDeleteSlide = useCallback(
    (slideId: string) => {
      if (activeDeck.slides.length <= 1) return;
      const idx = activeDeck.slides.findIndex((s) => s.id === slideId);
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        slides: d.slides.filter((s) => s.id !== slideId),
      }));
      setActiveSlideIndex((prev) => Math.max(0, prev >= idx ? prev - 1 : prev));
      showToast('Slide removed');
    },
    [activeDeck.slides, showToast, updateActiveDeck]
  );

  const handleMoveSlide = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= activeDeck.slides.length) return;
      updateActiveDeck((d) => {
        const next = [...d.slides];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        return { ...d, updatedAt: new Date().toISOString(), slides: next };
      });
      if (activeSlideIndex === index) setActiveSlideIndex(target);
      else if (activeSlideIndex === target) setActiveSlideIndex(index);
    },
    [activeDeck.slides.length, activeSlideIndex, updateActiveDeck]
  );

  const handleImportSlides = useCallback(
    (slides: Slide[], target: 'append' | 'new-deck', title?: string, sharedCss?: string) => {
      const hasOversizedSlide = slides.some((s) => {
        const detected = detectSlideStaticDimensions(s.html, s.css);
        return Boolean(detected && (detected.width > 1280 || detected.height > 720));
      });

      if (target === 'new-deck') {
        const newDeck: Deck = {
          id: `deck-${Date.now()}`,
          title: title || 'Imported AI Presentation',
          description: 'Imported from HTML/CSS.',
          themeId: activeDeck.themeId,
          aspectRatio: hasOversizedSlide ? 'auto' : '16:9',
          defaultTransition: 'fade',
          libraries: { ...activeDeck.libraries },
          customResources: [],
          sharedCss,
          slides,
          snapshots: [],
          updatedAt: new Date().toISOString(),
        };
        setDecks((prev) => [newDeck, ...prev]);
        setActiveDeckId(newDeck.id);
        setActiveSlideIndex(0);
        setActiveTab('studio');
        showToast(`Created deck with ${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`);
        return;
      }

      const startIndex = activeDeck.slides.length;
      updateActiveDeck((d) => ({
        ...d,
        aspectRatio: hasOversizedSlide && d.aspectRatio === '16:9' ? 'auto' : d.aspectRatio,
        sharedCss: mergeSharedCss(d.sharedCss, sharedCss),
        updatedAt: new Date().toISOString(),
        slides: [...d.slides, ...slides],
      }));
      setActiveSlideIndex(startIndex);
      setActiveTab('studio');
      showToast(`Imported ${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`);
    },
    [activeDeck, showToast, updateActiveDeck]
  );

  const handleOpenExportModal = useCallback(
    (targetDeck: Deck = activeDeck) => {
      setExportModalDeck(targetDeck);
    },
    [activeDeck]
  );

  const handleConfirmExportPresentation = useCallback(
    async (targetDeck: Deck, options: PresentationExportOptions) => {
      const themeForDeck =
        allThemes.find((t) => t.id === targetDeck.themeId) || allThemes[0];
      const { exportStandalonePresentationHtml } = await import('./utils/presentationExporter');
      const { html, slideCount, byteSize } = await exportStandalonePresentationHtml(
        targetDeck,
        themeForDeck,
        window.location.origin,
        options
      );
      const slug = targetDeck.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      triggerFileDownload(`${slug || 'slideino'}-presentation.html`, html, 'text/html');
      showToast(
        `Exported presentation (${slideCount} ${slideCount === 1 ? 'slide' : 'slides'} · ${formatByteSize(byteSize)})`
      );
    },
    [allThemes, showToast]
  );

  const handleToggleLibrary = useCallback(
    (id: LibraryId) => {
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        libraries: { ...d.libraries, [id]: !d.libraries[id] },
      }));
    },
    [updateActiveDeck]
  );

  const handleInsertLibraryExample = useCallback(
    (lib: LibraryDefinition) => {
      const demoSlide: Slide = {
        id: `slide-demo-${lib.id}-${Date.now()}`,
        title: lib.exampleTitle,
        html: lib.exampleHtml,
        css: lib.exampleCss,
        notes: lib.exampleNotes,
        transition: 'fade',
      };
      const newIndex = activeDeck.slides.length;
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        libraries: { ...d.libraries, [lib.id]: true },
        slides: [...d.slides, demoSlide],
      }));
      setActiveSlideIndex(newIndex);
      setActiveTab('studio');
      showToast(`Enabled ${lib.name} and added demo slide`);
    },
    [activeDeck.slides.length, showToast, updateActiveDeck]
  );

  const handleAddCustomResource = useCallback(
    (res: CustomResource) => {
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        customResources: [...d.customResources, res],
      }));
      showToast(`Attached ${res.label}`);
    },
    [showToast, updateActiveDeck]
  );

  const handleRemoveCustomResource = useCallback(
    (id: string) => {
      updateActiveDeck((d) => ({
        ...d,
        updatedAt: new Date().toISOString(),
        customResources: d.customResources.filter((r) => r.id !== id),
      }));
    },
    [updateActiveDeck]
  );

  const handleSaveCustomTheme = useCallback((theme: SlideTheme) => {
    setCustomThemes((prev) => {
      const exists = prev.some((t) => t.id === theme.id);
      return exists ? prev.map((t) => (t.id === theme.id ? theme : t)) : [...prev, theme];
    });
  }, []);

  const handleDeleteCustomTheme = useCallback(
    (themeId: string) => {
      setCustomThemes((prev) => prev.filter((t) => t.id !== themeId));
      setDecks((prev) =>
        prev.map((d) => (d.themeId === themeId ? { ...d, themeId: 'atelier-light' } : d))
      );
      showToast('Custom theme deleted');
    },
    [showToast]
  );

  const handleCreateDeck = useCallback(() => {
    const blankTpl = SLIDE_TEMPLATES[1];
    const newDeck: Deck = {
      id: `deck-${Date.now()}`,
      title: `Untitled Presentation ${decks.length + 1}`,
      description: '',
      themeId: activeDeck.themeId,
      aspectRatio: '16:9',
      defaultTransition: 'fade',
      libraries: { ...DEFAULT_LIBRARIES },
      customResources: [],
      updatedAt: new Date().toISOString(),
      snapshots: [],
      slides: [
        {
          id: `slide-${Date.now()}`,
          title: 'Opening Slide',
          html: blankTpl.html,
          css: blankTpl.css,
          notes: blankTpl.notes,
          transition: 'fade',
        },
      ],
    };
    setDecks((prev) => [newDeck, ...prev]);
    setActiveDeckId(newDeck.id);
    setActiveSlideIndex(0);
    setActiveTab('studio');
    showToast('Created new deck');
  }, [activeDeck.themeId, decks.length, showToast]);

  const handleDuplicateDeck = useCallback(
    (deckId: string) => {
      const source = decks.find((d) => d.id === deckId);
      if (!source) return;
      const copy: Deck = {
        ...source,
        id: `deck-${Date.now()}`,
        title: `${source.title} (Copy)`,
        updatedAt: new Date().toISOString(),
        slides: source.slides.map((s, idx) => ({
          ...s,
          id: `slide-${Date.now()}-${idx}`,
        })),
      };
      setDecks((prev) => [copy, ...prev]);
      showToast('Deck duplicated');
    },
    [decks, showToast]
  );

  const handleDeleteDeck = useCallback(
    (deckId: string) => {
      if (decks.length <= 1) return;
      const remaining = decks.filter((d) => d.id !== deckId);
      setDecks(remaining);
      if (activeDeckId === deckId) {
        setActiveDeckId(remaining[0].id);
        setActiveSlideIndex(0);
      }
      showToast('Deck deleted');
    },
    [activeDeckId, decks, showToast]
  );

  const handleImportDeckJson = useCallback(
    (imported: Deck) => {
      setDecks((prev) => [imported, ...prev]);
      setActiveDeckId(imported.id);
      setActiveSlideIndex(0);
      setActiveTab('studio');
      showToast(`Imported "${imported.title}"`);
    },
    [showToast]
  );

  const handleSaveSnapshot = useCallback(
    (message: string) => {
      updateActiveDeck((d) => ({
        ...d,
        snapshots: [
          {
            id: `snap-${Date.now()}`,
            message,
            createdAt: new Date().toISOString(),
            slideCount: d.slides.length,
            themeId: d.themeId,
            libraries: { ...d.libraries },
            sharedCss: d.sharedCss,
            slides: d.slides.map((s) => ({ ...s })),
          },
          ...d.snapshots,
        ],
      }));
      showToast('Saved revision snapshot');
    },
    [showToast, updateActiveDeck]
  );

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string) => {
      const snap = activeDeck.snapshots.find((s) => s.id === snapshotId);
      if (!snap || snap.slides.length === 0) return;
      updateActiveDeck((d) => ({
        ...d,
        themeId: snap.themeId,
        libraries: { ...snap.libraries },
        sharedCss: snap.sharedCss ?? d.sharedCss,
        slides: snap.slides.map((s) => ({ ...s })),
        updatedAt: new Date().toISOString(),
      }));
      setActiveSlideIndex(0);
      setActiveTab('studio');
      showToast(`Restored "${snap.message}"`);
    },
    [activeDeck.snapshots, showToast, updateActiveDeck]
  );

  const handleDeleteSnapshot = useCallback(
    (snapshotId: string) => {
      updateActiveDeck((d) => ({
        ...d,
        snapshots: d.snapshots.filter((s) => s.id !== snapshotId),
      }));
    },
    [updateActiveDeck]
  );

  // Dedicated Audience Window renders ONLY the clean full-screen presentation stage (zero Studio iframes/overhead)
  if (audienceParams.isAudienceView) {
    return (
      <PresentationMode
        deck={activeDeck}
        theme={activeTheme}
        initialSlideIndex={activeSlideIndex}
        viewRole="audience"
        syncSessionId={audienceParams.syncId || `deck-${activeDeck.id}`}
        onExit={() => {
          // Audience window stays clean on stage; pressing Escape only exits fullscreen/overlays
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Skip to Main Content Link for Keyboard & Screen Reader Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-blue-600 focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to workspace content
      </a>

      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onStartPresentation={() => setPresenting(true)}
      />

      <main id="main-content" className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'studio' && (
          <StudioWorkspace
            deck={activeDeck}
            themes={allThemes}
            activeTheme={activeTheme}
            activeSlideIndex={activeSlideIndex}
            uiDarkMode={uiDarkMode}
            isSuspended={presenting}
            onToggleUiDarkMode={() => setUiDarkMode((v) => !v)}
            onSelectSlide={setActiveSlideIndex}
            onUpdateDeck={updateActiveDeck}
            onUpdateSlide={handleUpdateSlide}
            onAddSlide={handleAddSlide}
            onDuplicateSlide={handleDuplicateSlide}
            onDeleteSlide={handleDeleteSlide}
            onMoveSlide={handleMoveSlide}
            onOpenImportModal={(mode) => setImportModalState({ open: true, mode })}
            onExportStandaloneHtml={() => handleOpenExportModal(activeDeck)}
          />
        )}

        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              Loading workspace…
            </div>
          }
        >
          {activeTab === 'themes' && (
            <ThemeStudio
              deck={activeDeck}
              themes={allThemes}
              activeSlideIndex={activeSlideIndex}
              onSelectDeckTheme={(themeId) =>
                updateActiveDeck((d) => ({
                  ...d,
                  themeId,
                  updatedAt: new Date().toISOString(),
                }))
              }
              onSaveCustomTheme={handleSaveCustomTheme}
              onDeleteCustomTheme={handleDeleteCustomTheme}
            />
          )}

          {activeTab === 'libraries' && (
            <LibraryManager
              deck={activeDeck}
              onToggleLibrary={handleToggleLibrary}
              onInsertLibraryExample={handleInsertLibraryExample}
              onAddCustomResource={handleAddCustomResource}
              onRemoveCustomResource={handleRemoveCustomResource}
            />
          )}

          {activeTab === 'decks' && (
            <DeckManager
              decks={decks}
              activeDeck={activeDeck}
              themes={allThemes}
              onSelectDeck={(id) => {
                setActiveDeckId(id);
                setActiveSlideIndex(0);
                setActiveTab('studio');
              }}
              onCreateDeck={handleCreateDeck}
              onDuplicateDeck={handleDuplicateDeck}
              onDeleteDeck={handleDeleteDeck}
              onImportDeckJson={handleImportDeckJson}
              onExportStandaloneHtml={handleOpenExportModal}
              onSaveSnapshot={handleSaveSnapshot}
              onRestoreSnapshot={handleRestoreSnapshot}
              onDeleteSnapshot={handleDeleteSnapshot}
            />
          )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        {importModalState.open && (
          <ImportModal
            isOpen={importModalState.open}
            initialMode={importModalState.mode}
            deck={activeDeck}
            theme={activeTheme}
            onClose={() => setImportModalState((s) => ({ ...s, open: false }))}
            onImportSlides={handleImportSlides}
          />
        )}

        {exportModalDeck && (
          <ExportPresentationModal
            isOpen={Boolean(exportModalDeck)}
            deck={exportModalDeck}
            theme={
              (exportModalDeck && allThemes.find((t) => t.id === exportModalDeck.themeId)) ||
              activeTheme
            }
            onClose={() => setExportModalDeck(null)}
            onExport={handleConfirmExportPresentation}
          />
        )}
      </Suspense>

      {presenting && (
        <PresentationMode
          deck={activeDeck}
          theme={activeTheme}
          initialSlideIndex={activeSlideIndex}
          viewRole="presenter"
          syncSessionId={`deck-${activeDeck.id}`}
          onExportPresentation={() => handleOpenExportModal(activeDeck)}
          onExit={(lastIndex) => {
            setPresenting(false);
            setActiveSlideIndex(lastIndex);
          }}
        />
      )}

      {/* Accessible Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[70] px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-medium shadow-lg border border-slate-800 dark:border-slate-200"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
