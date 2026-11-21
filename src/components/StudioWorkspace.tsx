import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Group,
  Hash,
  Image as ImageIcon,
  Laptop,
  List,
  Magnet,
  Maximize2,
  MessageSquareQuote,
  Minimize2,
  Minus,
  Moon,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Search,
  Smartphone,
  Square,
  Sun,
  Tablet,
  Tag,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AspectRatio,
  Deck,
  DevicePreview,
  EditorCommand,
  InsertElementType,
  MultiSelectionSummary,
  SelectedElementInfo,
  Slide,
  SlideLayerItem,
  SlideTemplate,
  SlideTheme,
  TransitionType,
} from '../types/slideino';
import { SLIDE_TEMPLATES } from '../data/starterDeck';
import { SlideFrame, SlideFrameHandle } from './SlideFrame';
import { VisualInspector } from './VisualInspector';

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

type InspectorTab = 'design' | 'html' | 'css' | 'notes' | 'settings';

interface SlideEditSnapshot {
  html: string;
  css: string;
  backgroundOverride?: string;
}

interface SlideHistoryStack {
  past: SlideEditSnapshot[];
  future: SlideEditSnapshot[];
}

const MAX_HISTORY_ENTRIES = 50;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  const [leftRailWidth, setLeftRailWidth] = useState(204);
  const [rightInspectorWidth, setRightInspectorWidth] = useState(316);
  const [resizingPanel, setResizingPanel] = useState<'left' | 'right' | null>(null);
  const [canvasZoom, setCanvasZoom] = useState<'fit' | number>('fit');
  const [effectiveScale, setEffectiveScale] = useState(1);
  const [resolvedSlideDims, setResolvedSlideDims] = useState<{
    width: number;
    height: number;
  }>({ width: 1280, height: 720 });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('design');
  const [editMode, setEditMode] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [devicePreview, setDevicePreview] = useState<DevicePreview>('desktop');
  const [slideSearch, setSlideSearch] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);

  const [selectedElement, setSelectedElement] = useState<SelectedElementInfo | null>(null);
  const [multiSelection, setMultiSelection] = useState<MultiSelectionSummary | null>(null);
  const [layers, setLayers] = useState<SlideLayerItem[]>([]);
  const [slideDir, setSlideDir] = useState<'ltr' | 'rtl'>('ltr');
  const [availableFonts, setAvailableFonts] = useState<string[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const stageFrameRef = useRef<SlideFrameHandle>(null);
  const quickImageInputRef = useRef<HTMLInputElement>(null);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const panelResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const historyMapRef = useRef<Record<string, SlideHistoryStack>>({});
  const lastCommittedHtmlRef = useRef<Record<string, SlideEditSnapshot>>({});
  const codeHistoryTimerRef = useRef<number | null>(null);

  const activeSlide = deck.slides[activeSlideIndex] || deck.slides[0];

  // Keep a baseline snapshot for the active slide so the first visual edit can always be undone
  useEffect(() => {
    if (!lastCommittedHtmlRef.current[activeSlide.id]) {
      lastCommittedHtmlRef.current[activeSlide.id] = {
        html: activeSlide.html,
        css: activeSlide.css,
        backgroundOverride: activeSlide.backgroundOverride,
      };
    }
  }, [activeSlide.id, activeSlide.html, activeSlide.css, activeSlide.backgroundOverride]);

  // Clear selection and any pending debounced code history timer when switching slides or leaving edit mode
  useEffect(() => {
    setSelectedElement(null);
    setMultiSelection(null);
    setLayers([]);
    setInsertMenuOpen(false);
    if (codeHistoryTimerRef.current) {
      window.clearTimeout(codeHistoryTimerRef.current);
      codeHistoryTimerRef.current = null;
    }
  }, [activeSlide.id, editMode]);

  useEffect(() => {
    if (!insertMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (insertMenuRef.current && !insertMenuRef.current.contains(e.target as Node)) {
        setInsertMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInsertMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [insertMenuOpen]);

  useEffect(() => {
    return () => {
      if (codeHistoryTimerRef.current) {
        window.clearTimeout(codeHistoryTimerRef.current);
      }
    };
  }, []);

  const getSlideHistory = useCallback((slideId: string): SlideHistoryStack => {
    if (!historyMapRef.current[slideId]) {
      historyMapRef.current[slideId] = { past: [], future: [] };
    }
    return historyMapRef.current[slideId];
  }, []);

  const recordHistorySnapshot = useCallback(
    (slideId: string, prevSnapshot: SlideEditSnapshot, nextSnapshot: SlideEditSnapshot) => {
      if (
        prevSnapshot.html === nextSnapshot.html &&
        prevSnapshot.css === nextSnapshot.css &&
        prevSnapshot.backgroundOverride === nextSnapshot.backgroundOverride
      ) {
        return;
      }
      const stack = getSlideHistory(slideId);
      stack.past.push(prevSnapshot);
      if (stack.past.length > MAX_HISTORY_ENTRIES) {
        stack.past.shift();
      }
      stack.future = [];
      lastCommittedHtmlRef.current[slideId] = nextSnapshot;
      setHistoryTick((t) => t + 1);
    },
    [getSlideHistory]
  );

  const handleUndo = useCallback(() => {
    if (codeHistoryTimerRef.current) {
      window.clearTimeout(codeHistoryTimerRef.current);
      codeHistoryTimerRef.current = null;
    }
    const stack = getSlideHistory(activeSlide.id);
    if (stack.past.length === 0) return;
    const previous = stack.past.pop()!;
    stack.future.push({
      html: activeSlide.html,
      css: activeSlide.css,
      backgroundOverride: activeSlide.backgroundOverride,
    });
    lastCommittedHtmlRef.current[activeSlide.id] = previous;
    setSelectedElement(null);
    setMultiSelection(null);
    onUpdateSlide(activeSlide.id, {
      html: previous.html,
      css: previous.css,
      backgroundOverride: previous.backgroundOverride,
    });
    setHistoryTick((t) => t + 1);
  }, [
    activeSlide.id,
    activeSlide.html,
    activeSlide.css,
    activeSlide.backgroundOverride,
    getSlideHistory,
    onUpdateSlide,
  ]);

  const handleRedo = useCallback(() => {
    if (codeHistoryTimerRef.current) {
      window.clearTimeout(codeHistoryTimerRef.current);
      codeHistoryTimerRef.current = null;
    }
    const stack = getSlideHistory(activeSlide.id);
    if (stack.future.length === 0) return;
    const next = stack.future.pop()!;
    stack.past.push({
      html: activeSlide.html,
      css: activeSlide.css,
      backgroundOverride: activeSlide.backgroundOverride,
    });
    lastCommittedHtmlRef.current[activeSlide.id] = next;
    setSelectedElement(null);
    setMultiSelection(null);
    onUpdateSlide(activeSlide.id, {
      html: next.html,
      css: next.css,
      backgroundOverride: next.backgroundOverride,
    });
    setHistoryTick((t) => t + 1);
  }, [
    activeSlide.id,
    activeSlide.html,
    activeSlide.css,
    activeSlide.backgroundOverride,
    getSlideHistory,
    onUpdateSlide,
  ]);

  const canUndo = useMemo(() => {
    void historyTick;
    return (historyMapRef.current[activeSlide.id]?.past.length || 0) > 0;
  }, [activeSlide.id, historyTick]);

  const canRedo = useMemo(() => {
    void historyTick;
    return (historyMapRef.current[activeSlide.id]?.future.length || 0) > 0;
  }, [activeSlide.id, historyTick]);

  const handleZoomIn = useCallback(() => {
    setCanvasZoom((prev) => {
      const current = prev === 'fit' ? effectiveScale : prev;
      const nextStep = ZOOM_STEPS.find((z) => z > current + 0.04);
      return nextStep ?? 2;
    });
  }, [effectiveScale]);

  const handleZoomOut = useCallback(() => {
    setCanvasZoom((prev) => {
      const current = prev === 'fit' ? effectiveScale : prev;
      const reversed = [...ZOOM_STEPS].reverse();
      const nextStep = reversed.find((z) => z < current - 0.04);
      return nextStep ?? 0.5;
    });
  }, [effectiveScale]);

  const handleToggleFocusCanvas = useCallback(() => {
    const isExpanded = !leftRailOpen && !rightInspectorOpen;
    if (isExpanded) {
      setLeftRailOpen(true);
      setRightInspectorOpen(true);
    } else {
      setLeftRailOpen(false);
      setRightInspectorOpen(false);
    }
  }, [leftRailOpen, rightInspectorOpen]);

  // Drag-resize left and right panels smoothly without iframe pointer capture issues
  useEffect(() => {
    if (!resizingPanel) return;
    const onMove = (e: PointerEvent) => {
      const start = panelResizeStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.startX;
      if (resizingPanel === 'left') {
        setLeftRailWidth(Math.max(156, Math.min(340, Math.round(start.startWidth + dx))));
      } else {
        setRightInspectorWidth(Math.max(264, Math.min(480, Math.round(start.startWidth - dx))));
      }
    };
    const onUp = () => {
      setResizingPanel(null);
      panelResizeStartRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [resizingPanel]);

  // Host keyboard shortcuts for Undo/Redo and Zoom when not focused in a native text input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      } else if (mod && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (mod && e.key === '0') {
        e.preventDefault();
        setCanvasZoom('fit');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleZoomIn, handleZoomOut]);

  const handleVisualHtmlChange = useCallback(
    (newHtml: string, commit: boolean) => {
      const baseline = lastCommittedHtmlRef.current[activeSlide.id] || {
        html: activeSlide.html,
        css: activeSlide.css,
        backgroundOverride: activeSlide.backgroundOverride,
      };
      if (commit) {
        recordHistorySnapshot(activeSlide.id, baseline, {
          html: newHtml,
          css: activeSlide.css,
          backgroundOverride: activeSlide.backgroundOverride,
        });
      }
      onUpdateSlide(activeSlide.id, { html: newHtml });
    },
    [
      activeSlide.id,
      activeSlide.html,
      activeSlide.css,
      activeSlide.backgroundOverride,
      onUpdateSlide,
      recordHistorySnapshot,
    ]
  );

  const handleSlideFieldUpdateWithHistory = useCallback(
    (patch: Partial<Slide>, immediate = false) => {
      const slideId = activeSlide.id;
      const baseline = lastCommittedHtmlRef.current[slideId] || {
        html: activeSlide.html,
        css: activeSlide.css,
        backgroundOverride: activeSlide.backgroundOverride,
      };
      const nextSnap: SlideEditSnapshot = {
        html: patch.html !== undefined ? patch.html : activeSlide.html,
        css: patch.css !== undefined ? patch.css : activeSlide.css,
        backgroundOverride:
          'backgroundOverride' in patch
            ? patch.backgroundOverride
            : activeSlide.backgroundOverride,
      };

      onUpdateSlide(slideId, patch);

      if (immediate) {
        recordHistorySnapshot(slideId, baseline, nextSnap);
        return;
      }

      if (codeHistoryTimerRef.current) {
        window.clearTimeout(codeHistoryTimerRef.current);
      }
      codeHistoryTimerRef.current = window.setTimeout(() => {
        recordHistorySnapshot(slideId, baseline, nextSnap);
      }, 650);
    },
    [
      activeSlide.id,
      activeSlide.html,
      activeSlide.css,
      activeSlide.backgroundOverride,
      onUpdateSlide,
      recordHistorySnapshot,
    ]
  );

  const handleSendEditorCommand = useCallback((command: EditorCommand) => {
    stageFrameRef.current?.sendCommand(command);
  }, []);

  const handleToggleSnap = () => {
    const next = !snapEnabled;
    setSnapEnabled(next);
    handleSendEditorCommand({ type: 'set-snap', enabled: next });
  };

  const handleQuickImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleSendEditorCommand({
          type: 'insert-element',
          elementType: 'image',
          imgSrc: reader.result,
          imgAlt: file.name.replace(/\.[^.]+$/, ''),
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleElementSelect = useCallback(
    (element: SelectedElementInfo | null, multi: MultiSelectionSummary | null) => {
      setSelectedElement(element);
      setMultiSelection(multi);
    },
    []
  );

  const quickObjectMenuItems: {
    type: InsertElementType;
    label: string;
    detail: string;
    icon: React.ElementType;
  }[] = [
    { type: 'heading', label: 'Heading', detail: 'Bold slide title', icon: Type },
    { type: 'text', label: 'Text Block', detail: 'Editable paragraph', icon: AlignLeft },
    { type: 'bullets', label: 'Bullet List', detail: 'Key takeaways list', icon: List },
    { type: 'kpi', label: 'KPI Metric Card', detail: 'Big number + label', icon: Hash },
    { type: 'callout', label: 'Callout Box', detail: 'Highlighted quote / note', icon: MessageSquareQuote },
    { type: 'badge', label: 'Tag / Label', detail: 'Inline status badge', icon: Tag },
    { type: 'shape', label: 'Card / Shape', detail: 'Rounded container box', icon: Square },
    { type: 'divider', label: 'Accent Bar', detail: 'Divider line', icon: Minus },
    { type: 'arrow', label: 'Arrow', detail: 'Directional connector', icon: ArrowRight },
  ];

  const handleLayersChange = useCallback(
    (nextLayers: SlideLayerItem[], dir: 'ltr' | 'rtl', fonts: string[]) => {
      setLayers(nextLayers);
      setSlideDir(dir);
      setAvailableFonts(fonts);
      if (!snapEnabled) {
        stageFrameRef.current?.sendCommand({ type: 'set-snap', enabled: false });
      }
    },
    [snapEnabled]
  );

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
    handleSlideFieldUpdateWithHistory({ [field]: next });
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
            <option value="auto">Auto (Fit Content)</option>
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

          {/* Toggle Right Inspector */}
          <button
            type="button"
            onClick={() => setRightInspectorOpen((v) => !v)}
            className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer shrink-0 ${
              rightInspectorOpen
                ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            aria-label={rightInspectorOpen ? 'Hide inspector panel' : 'Show inspector panel'}
            title="Toggle Inspector Panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3-Pane Studio Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Transparent shield while dragging panel splitters so the slide iframe never swallows mouse events */}
        {resizingPanel && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" aria-hidden="true" />
        )}

        {/* Left Slide Navigator Rail */}
        {leftRailOpen && (
          <>
            <aside
              aria-label="Slide navigator"
              style={{ '--left-rail-w': `${leftRailWidth}px` } as React.CSSProperties}
              className="w-full lg:w-[var(--left-rail-w)] shrink-0 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col max-h-56 lg:max-h-none"
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
                            sharedCss={deck.sharedCss}
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
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize slide list panel"
              onPointerDown={(e) => {
                e.preventDefault();
                panelResizeStartRef.current = { startX: e.clientX, startWidth: leftRailWidth };
                setResizingPanel('left');
              }}
              onDoubleClick={() => setLeftRailWidth(204)}
              title="Drag to resize slide list (double-click to reset)"
              className="hidden lg:block w-1.5 -ml-0.5 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-500/35 active:bg-blue-500/50 transition-colors z-10"
            />
          </>
        )}

        {/* Center Focal Stage */}
        <section
          aria-label="Live slide canvas"
          className="flex-1 min-w-0 min-h-[340px] flex flex-col bg-slate-100/80 dark:bg-slate-950"
        >
          {/* Stage Editing Bar */}
          <div className="px-4 sm:px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Visual Edit vs Preview Segmented Control */}
              <div
                role="group"
                aria-label="Canvas mode"
                className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  aria-pressed={editMode}
                  className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    editMode
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <MousePointer2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Visual Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  aria-pressed={!editMode}
                  className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !editMode
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Preview</span>
                </button>
              </div>

              <span className="w-px h-4 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

              {/* Undo / Redo */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                  aria-label="Undo slide edit"
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                  aria-label="Redo slide edit"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Insert & Snap Controls (Visual Edit Mode) */}
            {editMode && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSendEditorCommand({ type: 'insert-element', elementType: 'text' })
                  }
                  className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Insert text block"
                >
                  <Type className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">Text</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSendEditorCommand({ type: 'insert-element', elementType: 'shape' })
                  }
                  className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Insert card or shape"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">Shape</span>
                </button>
                <input
                  ref={quickImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleQuickImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => quickImageInputRef.current?.click()}
                  className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Insert image from computer"
                >
                  <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">Image</span>
                </button>

                {/* Ready-to-Use Presentation Objects Popover */}
                <div ref={insertMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setInsertMenuOpen((v) => !v)}
                    aria-expanded={insertMenuOpen}
                    aria-haspopup="menu"
                    className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      insertMenuOpen
                        ? 'border-blue-600/40 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    title="Insert ready-made slide objects (Bullet List, KPI Card, Callout, Tag, Arrow...)"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Objects</span>
                    <ChevronDown className="w-3 h-3 opacity-70" aria-hidden="true" />
                  </button>

                  {insertMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-40"
                    >
                      <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        Insert Presentation Object
                      </div>
                      {quickObjectMenuItems.map(({ type, label, detail, icon: Icon }) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            handleSendEditorCommand({ type: 'insert-element', elementType: type });
                            setInsertMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5 cursor-pointer"
                        >
                          <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-tight">
                              {label}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {detail}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contextual Group / Ungroup Quick Action */}
                {multiSelection && multiSelection.count > 1 && (
                  <button
                    type="button"
                    onClick={() => handleSendEditorCommand({ type: 'group-selected' })}
                    className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Group selected objects (Ctrl/Cmd+G)"
                  >
                    <Group className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Group ({multiSelection.count})</span>
                  </button>
                )}

                {selectedElement?.canUngroup && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSendEditorCommand({ type: 'ungroup-selected', id: selectedElement.id })
                    }
                    className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-950/70 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Ungroup selected container (Ctrl/Cmd+Shift+G)"
                  >
                    <Ungroup className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ungroup</span>
                  </button>
                )}

                <span className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleToggleSnap}
                  aria-pressed={snapEnabled}
                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    snapEnabled
                      ? 'border-blue-600/40 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title="Toggle smart alignment snap guides (hold Alt while dragging to bypass)"
                >
                  <Magnet className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Snap</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleFocusCanvas}
                  aria-pressed={!leftRailOpen && !rightInspectorOpen}
                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !leftRailOpen && !rightInspectorOpen
                      ? 'border-blue-600/40 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title={
                    !leftRailOpen && !rightInspectorOpen
                      ? 'Restore side panels'
                      : 'Expand slide canvas (hide side panels)'
                  }
                >
                  {!leftRailOpen && !rightInspectorOpen ? (
                    <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span className="hidden xl:inline">
                    {!leftRailOpen && !rightInspectorOpen ? 'Restore' : 'Expand'}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.deltaY < 0) handleZoomIn();
                else if (e.deltaY > 0) handleZoomOut();
              }
            }}
            className={`flex-1 min-h-0 flex items-center justify-center overflow-hidden ${
              canvasZoom === 'fit' ? 'p-2.5 sm:p-3.5' : 'p-0'
            }`}
          >
            <div
              className={`w-full h-full ${
                canvasZoom === 'fit' ? deviceWidthClass : 'max-w-full'
              } mx-auto flex items-center justify-center transition-[max-width] duration-200`}
            >
              <div
                className={`w-full h-full flex items-center justify-center overflow-hidden ${
                  canvasZoom === 'fit'
                    ? 'rounded-lg shadow-sm border border-slate-200/90 dark:border-slate-800 bg-slate-200/35 dark:bg-slate-900/40'
                    : 'bg-slate-200/45 dark:bg-slate-950'
                }`}
              >
                <SlideFrame
                  ref={stageFrameRef}
                  slide={activeSlide}
                  theme={activeTheme}
                  libraries={deck.libraries}
                  customResources={deck.customResources}
                  sharedCss={deck.sharedCss}
                  aspectRatio={deck.aspectRatio}
                  editMode={editMode}
                  zoom={canvasZoom}
                  onScaleChange={setEffectiveScale}
                  onDimensionsChange={setResolvedSlideDims}
                  onForwardKey={handleStageKeyForward}
                  onVisualHtmlChange={handleVisualHtmlChange}
                  onElementSelect={handleElementSelect}
                  onLayersChange={handleLayersChange}
                  onEditorUndo={handleUndo}
                  onEditorRedo={handleRedo}
                />
              </div>
            </div>
          </div>

          {/* Stage Footer Transport & Zoom Bar */}
          <div className="px-3 sm:px-5 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[180px] sm:max-w-[240px]">
                {activeSlide.title}
              </span>
              <span aria-hidden="true" className="hidden md:inline">·</span>
              <span className="hidden md:inline whitespace-nowrap truncate">
                {editMode
                  ? multiSelection && multiSelection.count > 1
                    ? `${multiSelection.count} objects selected · Drag to move · Ctrl+G to group`
                    : selectedElement
                    ? `Selected: ${selectedElement.friendlyName} · Drag to move · Shift+Click to add`
                    : 'Click to select · Shift+Click multiple to group'
                  : activeTheme.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {deck.aspectRatio === 'auto' && (
                <span
                  className="hidden sm:inline-flex items-center px-2 h-7 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  title="Auto-detected slide canvas size"
                >
                  Auto {resolvedSlideDims.width}×{resolvedSlideDims.height}
                </span>
              )}
              {/* Canvas Zoom Controls */}
              {deck.aspectRatio !== 'fluid' && (
                <div
                  role="group"
                  aria-label="Canvas zoom controls"
                  className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Zoom out canvas"
                    title="Zoom Out (Ctrl/Cmd -)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <select
                    aria-label="Canvas zoom level"
                    value={canvasZoom === 'fit' ? 'fit' : String(canvasZoom)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCanvasZoom(val === 'fit' ? 'fit' : Number(val));
                    }}
                    className="h-7 px-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] tabular-nums text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="fit">Fit ({Math.round(effectiveScale * 100)}%)</option>
                    <option value="0.5">50%</option>
                    <option value="0.75">75%</option>
                    <option value="1">100% (1:1 Sharp)</option>
                    <option value="1.25">125%</option>
                    <option value="1.5">150%</option>
                    <option value="2">200%</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Zoom in canvas"
                    title="Zoom In (Ctrl/Cmd +)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>

                  {canvasZoom !== 'fit' && (
                    <button
                      type="button"
                      onClick={() => setCanvasZoom('fit')}
                      className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                      title="Reset zoom to fit screen (Ctrl/Cmd 0)"
                    >
                      Fit
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectSlide(Math.max(0, activeSlideIndex - 1))}
                disabled={activeSlideIndex === 0}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 min-w-[48px] text-center">
                {String(activeSlideIndex + 1).padStart(2, '0')} /{' '}
                {String(deck.slides.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => onSelectSlide(Math.min(deck.slides.length - 1, activeSlideIndex + 1))}
                disabled={activeSlideIndex === deck.slides.length - 1}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                aria-label="Next slide"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Right Design, Code & Properties Inspector */}
        {rightInspectorOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize inspector panel"
              onPointerDown={(e) => {
                e.preventDefault();
                panelResizeStartRef.current = {
                  startX: e.clientX,
                  startWidth: rightInspectorWidth,
                };
                setResizingPanel('right');
              }}
              onDoubleClick={() => setRightInspectorWidth(316)}
              title="Drag to resize inspector (double-click to reset)"
              className="hidden lg:block w-1.5 -mr-0.5 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-500/35 active:bg-blue-500/50 transition-colors z-10"
            />
            <aside
              aria-label="Slide design, code, and settings inspector"
              style={{ '--right-inspector-w': `${rightInspectorWidth}px` } as React.CSSProperties}
              className="w-full lg:w-[var(--right-inspector-w)] shrink-0 bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col min-h-[300px] lg:min-h-0"
            >
            {/* Inspector Tabs */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Slide inspector tabs"
                className="flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full"
              >
                {(
                  [
                    { id: 'design', label: 'Design' },
                    { id: 'html', label: 'HTML' },
                    { id: 'css', label: 'CSS' },
                    { id: 'notes', label: 'Notes' },
                    { id: 'settings', label: 'Slide' },
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
              {inspectorTab === 'design' && (
                <VisualInspector
                  editMode={editMode}
                  slide={activeSlide}
                  theme={activeTheme}
                  slideDir={slideDir}
                  availableFonts={availableFonts}
                  selectedElement={selectedElement}
                  multiSelection={multiSelection}
                  layers={layers}
                  onEnableEditMode={() => setEditMode(true)}
                  onUpdateSlide={(patch) => handleSlideFieldUpdateWithHistory(patch, true)}
                  onSendCommand={handleSendEditorCommand}
                />
              )}

              {inspectorTab === 'html' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>HTML Markup (Synced with Canvas)</span>
                    </span>
                    <span className="font-mono tabular-nums">{activeSlide.html.length} chars</span>
                  </div>
                  <textarea
                    value={activeSlide.html}
                    onChange={(e) =>
                      handleSlideFieldUpdateWithHistory({ html: e.target.value })
                    }
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
                    onChange={(e) =>
                      handleSlideFieldUpdateWithHistory({ css: e.target.value })
                    }
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
                          handleSlideFieldUpdateWithHistory(
                            { backgroundOverride: e.target.value || undefined },
                            true
                          )
                        }
                        placeholder={`Inherits theme (${activeTheme.tokens.bg})`}
                        className="flex-1 h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                      />
                      {activeSlide.backgroundOverride && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSlideFieldUpdateWithHistory(
                              { backgroundOverride: undefined },
                              true
                            )
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
          </>
        )}
      </div>
    </div>
  );
};
