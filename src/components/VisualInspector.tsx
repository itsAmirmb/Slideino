import React, { useMemo, useRef } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  CornerLeftUp,
  Group,
  Hash,
  Image as ImageIcon,
  Italic,
  Layers,
  List,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  Move,
  Square,
  Strikethrough,
  Tag,
  Trash2,
  Type,
  Underline,
  Ungroup,
  Unlink,
  Upload,
  X,
} from 'lucide-react';
import {
  AlignAction,
  EditorCommand,
  ElementStylePatch,
  InsertElementType,
  MultiSelectionSummary,
  SelectedElementInfo,
  Slide,
  SlideLayerItem,
  SlideTheme,
} from '../types/slideino';
import {
  buildGoogleFontUrl,
  extractPrimaryFontName,
  findCatalogFont,
  FONT_CATALOG,
  FONT_CATEGORY_LABELS,
  FontOption,
} from '../data/fonts';

interface VisualInspectorProps {
  editMode: boolean;
  slide: Slide;
  theme: SlideTheme;
  slideDir: 'ltr' | 'rtl';
  availableFonts: string[];
  selectedElement: SelectedElementInfo | null;
  multiSelection: MultiSelectionSummary | null;
  layers: SlideLayerItem[];
  onEnableEditMode: () => void;
  onUpdateSlide: (patch: Partial<Slide>) => void;
  onSendCommand: (command: EditorCommand) => void;
}

const ALIGN_CONTROLS: { action: AlignAction; label: string; icon: React.ElementType }[] = [
  { action: 'left', label: 'Align left', icon: AlignStartVertical },
  { action: 'center-h', label: 'Center horizontally', icon: AlignCenterVertical },
  { action: 'right', label: 'Align right', icon: AlignEndVertical },
  { action: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { action: 'center-v', label: 'Center vertically', icon: AlignCenterHorizontal },
  { action: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
];

function normalizeHexForPicker(color: string, fallback = '#0f172a'): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return fallback;
}

export const VisualInspector: React.FC<VisualInspectorProps> = ({
  editMode,
  slide,
  theme,
  slideDir,
  availableFonts,
  selectedElement,
  multiSelection,
  layers,
  onEnableEditMode,
  onUpdateSlide,
  onSendCommand,
}) => {
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const replaceImageRef = useRef<HTMLInputElement>(null);

  const patchSelected = (patch: ElementStylePatch) => {
    if (!selectedElement) return;
    onSendCommand({
      type: 'update-element',
      id: selectedElement.id,
      patch,
    });
  };

  // Build deduplicated list of fonts already present in this slide or active theme
  const deckFonts = useMemo(() => {
    const names = new Set<string>();
    const addName = (raw: string) => {
      const clean = extractPrimaryFontName(raw);
      if (
        clean &&
        !['sans-serif', 'serif', 'monospace', 'system-ui', '-apple-system', 'cursive', 'fantasy', 'ui-sans-serif', 'ui-serif', 'ui-monospace'].includes(
          clean.toLowerCase()
        )
      ) {
        names.add(clean);
      }
    };
    availableFonts.forEach(addName);
    addName(theme.tokens.fontDisplay);
    addName(theme.tokens.fontBody);
    addName(theme.tokens.fontMono);
    if (selectedElement?.fontFamily) {
      addName(selectedElement.fontFamily);
    }
    return Array.from(names);
  }, [availableFonts, theme.tokens, selectedElement?.fontFamily]);

  const handleFontSelect = (fontName: string) => {
    if (!fontName) return;
    const catalogMatch = findCatalogFont(fontName);
    const alreadyInSlide = availableFonts.some(
      (f) => f.toLowerCase() === fontName.toLowerCase()
    );
    if (catalogMatch) {
      patchSelected({
        fontFamily: catalogMatch.family,
        googleFontUrl: alreadyInSlide ? undefined : buildGoogleFontUrl(catalogMatch),
      });
    } else {
      patchSelected({
        fontFamily: `'${fontName}', sans-serif`,
      });
    }
  };

  const handleInsertImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSendCommand({
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

  const handleReplaceImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedElement) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        patchSelected({ imgSrc: reader.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!editMode) {
    return (
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <MousePointerClick className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold">Visual Canvas Editor</h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Preview Mode is active so links, charts, and interactive scripts run untouched. Switch to Visual Edit to click, drag, resize, and format elements directly on the slide.
          </p>
          <button
            type="button"
            onClick={onEnableEditMode}
            className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer self-start whitespace-nowrap"
          >
            Enable Visual Edit
          </button>
        </div>
      </div>
    );
  }

  // Multi-Selection Inspector (2+ objects selected via Shift+Click)
  if (multiSelection && multiSelection.count > 1) {
    return (
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {multiSelection.count} Objects Selected
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Drag to move together, align, or combine into one group.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'select-element', id: null })}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Clear selection"
              title="Clear Selection (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'group-selected' })}
              className="flex-1 h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              title="Group selected objects (Ctrl/Cmd+G)"
            >
              <Group className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Group Objects</span>
            </button>
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'delete-selected' })}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
              aria-label="Delete selected objects"
              title="Delete Selected (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Align Selection
          </span>
          <div className="grid grid-cols-6 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {ALIGN_CONTROLS.map(({ action, label, icon: Icon }) => (
              <button
                key={action}
                type="button"
                onClick={() => onSendCommand({ type: 'align-selected', alignment: action })}
                aria-label={label}
                title={label}
                className="h-8 inline-flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Selected Items
          </span>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {multiSelection.ids.map((id, index) => (
              <button
                key={id}
                type="button"
                onClick={() => onSendCommand({ type: 'select-element', id })}
                className="w-full text-left px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                title="Focus only this object"
              >
                <span className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  {multiSelection.labels[index] || `Object ${index + 1}`}
                </span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Shift+Click any object on the canvas to add or remove it from this selection.
          </p>
        </div>
      </div>
    );
  }

  // Selected Element Inspector
  if (selectedElement) {
    const isImage = selectedElement.tag === 'img';
    const isNonTextGraphic = ['img', 'hr', 'svg', 'canvas', 'video', 'iframe'].includes(
      selectedElement.tag
    );
    const showTypography =
      !isNonTextGraphic &&
      (selectedElement.kind === 'text' || selectedElement.isTextEditable || selectedElement.hasText);
    const activePrimaryFont = extractPrimaryFontName(selectedElement.fontFamily);
    const matchedDeckFont = deckFonts.find(
      (f) => f.toLowerCase() === activePrimaryFont.toLowerCase()
    );
    const matchedCatalogFont = FONT_CATALOG.find(
      (f) => f.name.toLowerCase() === activePrimaryFont.toLowerCase()
    );
    const resolvedFontValue =
      matchedDeckFont || matchedCatalogFont?.name || activePrimaryFont || 'system-ui';
    const hasCustomFallbackOption = !matchedDeckFont && !matchedCatalogFont;
    const catalogCategories: FontOption['category'][] = ['sans', 'rtl', 'serif', 'mono'];
    const xLabel =
      selectedElement.positionMode === 'absolute' && selectedElement.horizontalAnchor === 'right'
        ? 'Right'
        : 'X';

    return (
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
        {/* Selected Element Header & Quick Actions */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {selectedElement.label}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                <span className="font-sans font-medium text-slate-600 dark:text-slate-300">
                  {selectedElement.friendlyName}
                </span>
                <span aria-hidden="true">·</span>
                <span>&lt;{selectedElement.tag}&gt;</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {selectedElement.width} × {selectedElement.height}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSendCommand({ type: 'select-element', id: null })}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Deselect element"
              title="Deselect (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {selectedElement.hasParent && (
              <button
                type="button"
                onClick={() => onSendCommand({ type: 'select-parent' })}
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                title="Select the enclosing parent box"
              >
                <CornerLeftUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Parent</span>
              </button>
            )}
            {selectedElement.hasParent && (
              <button
                type="button"
                onClick={() =>
                  onSendCommand({ type: 'make-absolute', id: selectedElement.id })
                }
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                title="Unparent: detach this object from its parent container so it moves freely on the slide"
              >
                <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Unparent</span>
              </button>
            )}
            {selectedElement.canUngroup && (
              <button
                type="button"
                onClick={() =>
                  onSendCommand({ type: 'ungroup-selected', id: selectedElement.id })
                }
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-950/70 cursor-pointer whitespace-nowrap"
                title="Ungroup into separate objects (Ctrl/Cmd+Shift+G)"
              >
                <Ungroup className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ungroup</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'duplicate-selected' })}
              className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              title="Duplicate element (Ctrl/Cmd+D)"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy</span>
            </button>
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'reorder-z', direction: 'forward' })}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Bring forward"
              title="Bring Forward"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'reorder-z', direction: 'backward' })}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              aria-label="Send backward"
              title="Send Backward"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSendCommand({ type: 'delete-selected' })}
              className="w-8 h-8 ml-auto inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
              aria-label="Delete selected element"
              title="Delete (Backspace / Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {selectedElement.children && selectedElement.children.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Inside this {selectedElement.friendlyName.toLowerCase()} ({selectedElement.children.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedElement.children.slice(0, 8).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSendCommand({ type: 'select-element', id: child.id })}
                    className="max-w-[160px] h-7 px-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-blue-500 dark:hover:border-blue-500 text-[11px] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    title={`Select <${child.tag}>: ${child.label}`}
                  >
                    <span className="truncate">{child.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Direct Text Content Editor */}
        {selectedElement.isTextEditable && (
          <div className="p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="inspector-text-content"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Text Content
              </label>
              <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { value: '', label: 'Auto' },
                    { value: 'ltr', label: 'LTR' },
                    { value: 'rtl', label: 'RTL' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => patchSelected({ dir: opt.value })}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      selectedElement.dir === opt.value
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="inspector-text-content"
              value={selectedElement.textContent}
              dir={selectedElement.dir || slideDir}
              onChange={(e) => patchSelected({ textContent: e.target.value })}
              rows={3}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-900 dark:text-slate-100 resize-y"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tip: Double-click any text on the slide to edit inline.
            </p>
          </div>
        )}

        {/* Image Source Controls */}
        {isImage && (
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Image</span>
              <input
                ref={replaceImageRef}
                type="file"
                accept="image/*"
                onChange={handleReplaceImageFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => replaceImageRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Upload className="w-3 h-3" aria-hidden="true" />
                <span>Replace File</span>
              </button>
            </div>
            <div>
              <label
                htmlFor="inspector-img-src"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Image URL
              </label>
              <input
                id="inspector-img-src"
                type="text"
                value={selectedElement.imgSrc || ''}
                onChange={(e) => patchSelected({ imgSrc: e.target.value })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="inspector-img-alt"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Alt Text
                </label>
                <input
                  id="inspector-img-alt"
                  type="text"
                  value={selectedElement.imgAlt || ''}
                  onChange={(e) => patchSelected({ imgAlt: e.target.value })}
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="inspector-img-fit"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Fit
                </label>
                <select
                  id="inspector-img-fit"
                  value={selectedElement.objectFit || 'cover'}
                  onChange={(e) => patchSelected({ objectFit: e.target.value })}
                  className="w-full h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Stretch</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Typography Controls */}
        {showTypography && (
          <div className="p-4 flex flex-col gap-3">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Typography
            </span>

            {/* Font Family */}
            <div>
              <label
                htmlFor="inspector-font-family"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Font Family
              </label>
              <select
                id="inspector-font-family"
                value={resolvedFontValue}
                onChange={(e) => handleFontSelect(e.target.value)}
                className="w-full h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                {hasCustomFallbackOption && (
                  <option value={resolvedFontValue}>{resolvedFontValue} (Current)</option>
                )}
                {deckFonts.length > 0 && (
                  <optgroup label="Slide &amp; Deck Fonts">
                    {deckFonts.map((fontName) => (
                      <option key={`deck-${fontName}`} value={fontName}>
                        {fontName}
                      </option>
                    ))}
                  </optgroup>
                )}
                {catalogCategories.map((cat) => {
                  const items = FONT_CATALOG.filter(
                    (f) =>
                      f.category === cat &&
                      !deckFonts.some((d) => d.toLowerCase() === f.name.toLowerCase())
                  );
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={cat} label={FONT_CATEGORY_LABELS[cat]}>
                      {items.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="inspector-font-size"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Size (px)
                </label>
                <input
                  id="inspector-font-size"
                  type="number"
                  min={8}
                  max={240}
                  value={selectedElement.fontSize}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 8) patchSelected({ fontSize: val });
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-font-weight"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Weight
                </label>
                <select
                  id="inspector-font-weight"
                  value={selectedElement.fontWeight}
                  onChange={(e) => patchSelected({ fontWeight: e.target.value })}
                  className="w-full h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <option value="300">Light (300)</option>
                  <option value="400">Regular (400)</option>
                  <option value="500">Medium (500)</option>
                  <option value="600">SemiBold (600)</option>
                  <option value="700">Bold (700)</option>
                  <option value="800">ExtraBold (800)</option>
                  <option value="900">Black (900)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Alignment
                </span>
                <div className="grid grid-cols-4 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  {(
                    [
                      { id: 'left', icon: AlignLeft, label: 'Align left' },
                      { id: 'center', icon: AlignCenter, label: 'Align center' },
                      { id: 'right', icon: AlignRight, label: 'Align right' },
                      { id: 'justify', icon: AlignJustify, label: 'Justify' },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => patchSelected({ textAlign: id })}
                      aria-label={label}
                      aria-pressed={selectedElement.textAlign === id}
                      className={`h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                        selectedElement.textAlign === id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Style
                </span>
                <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      patchSelected({
                        fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic',
                      })
                    }
                    aria-label="Toggle italic"
                    aria-pressed={selectedElement.fontStyle === 'italic'}
                    title="Italic"
                    className={`h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                      selectedElement.fontStyle === 'italic'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchSelected({
                        textDecoration:
                          selectedElement.textDecoration === 'underline' ? 'none' : 'underline',
                      })
                    }
                    aria-label="Toggle underline"
                    aria-pressed={selectedElement.textDecoration === 'underline'}
                    title="Underline"
                    className={`h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                      selectedElement.textDecoration === 'underline'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchSelected({
                        textDecoration:
                          selectedElement.textDecoration === 'line-through'
                            ? 'none'
                            : 'line-through',
                      })
                    }
                    aria-label="Toggle strikethrough"
                    aria-pressed={selectedElement.textDecoration === 'line-through'}
                    title="Strikethrough"
                    className={`h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                      selectedElement.textDecoration === 'line-through'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="inspector-line-height"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Line Height
                </label>
                <input
                  id="inspector-line-height"
                  type="number"
                  step={0.1}
                  min={0.8}
                  max={3}
                  value={selectedElement.lineHeight}
                  onChange={(e) => patchSelected({ lineHeight: e.target.value })}
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-letter-spacing"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Letter Spacing (px)
                </label>
                <input
                  id="inspector-letter-spacing"
                  type="number"
                  step={0.5}
                  min={-5}
                  max={24}
                  value={selectedElement.letterSpacing}
                  onChange={(e) => patchSelected({ letterSpacing: e.target.value })}
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="inspector-text-color"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Text Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="inspector-text-color"
                  type="color"
                  value={normalizeHexForPicker(selectedElement.color, '#ffffff')}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                  className="w-8 h-8 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={selectedElement.color}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                  aria-label="Text color hex"
                  className="flex-1 h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Appearance Controls */}
        <div className="p-4 flex flex-col gap-3">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Appearance</span>

          <div>
            <label
              htmlFor="inspector-bg-color"
              className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
            >
              Fill / Background
            </label>
            <div className="flex items-center gap-2">
              <input
                id="inspector-bg-color"
                type="color"
                value={normalizeHexForPicker(selectedElement.backgroundColor, '#1e293b')}
                onChange={(e) => patchSelected({ backgroundColor: e.target.value })}
                className="w-8 h-8 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={selectedElement.backgroundColor}
                onChange={(e) => patchSelected({ backgroundColor: e.target.value })}
                aria-label="Background color value"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
              />
              {selectedElement.backgroundColor !== 'transparent' && (
                <button
                  type="button"
                  onClick={() => patchSelected({ backgroundColor: 'transparent' })}
                  className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  None
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="inspector-radius"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Radius (px)
              </label>
              <input
                id="inspector-radius"
                type="number"
                min={0}
                max={200}
                value={selectedElement.borderRadius}
                onChange={(e) => patchSelected({ borderRadius: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="inspector-padding"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Padding (px)
              </label>
              <input
                id="inspector-padding"
                type="number"
                min={0}
                max={160}
                value={selectedElement.padding}
                onChange={(e) => patchSelected({ padding: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inspector-opacity"
              className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1"
            >
              <span>Opacity</span>
              <span className="font-mono tabular-nums">{selectedElement.opacity}%</span>
            </label>
            <input
              id="inspector-opacity"
              type="range"
              min={0}
              max={100}
              value={selectedElement.opacity}
              onChange={(e) => patchSelected({ opacity: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
        </div>

        {/* Position & Size Controls */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Position &amp; Size
            </span>
            {(selectedElement.positionMode === 'static' ||
              selectedElement.positionMode === 'relative') && (
              <button
                type="button"
                onClick={() =>
                  onSendCommand({ type: 'make-absolute', id: selectedElement.id })
                }
                className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-blue-500 dark:hover:border-blue-500 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Convert to free absolute positioning anywhere on the slide"
              >
                <Move className="w-3 h-3" aria-hidden="true" />
                <span>Free Move</span>
              </button>
            )}
          </div>
          <div>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Align to Slide
            </span>
            <div className="grid grid-cols-6 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {ALIGN_CONTROLS.map(({ action, label, icon: Icon }) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onSendCommand({ type: 'align-selected', alignment: action })}
                  aria-label={label}
                  title={label}
                  className="h-7 inline-flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="inspector-pos-x"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                {xLabel} (px)
              </label>
              <input
                id="inspector-pos-x"
                type="number"
                value={selectedElement.x}
                onChange={(e) => patchSelected({ x: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="inspector-pos-y"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Y (px)
              </label>
              <input
                id="inspector-pos-y"
                type="number"
                value={selectedElement.y}
                onChange={(e) => patchSelected({ y: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="inspector-width"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Width (px)
              </label>
              <input
                id="inspector-width"
                type="number"
                min={12}
                value={selectedElement.width}
                onChange={(e) => patchSelected({ width: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="inspector-height"
                className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
              >
                Height (px)
              </label>
              <input
                id="inspector-height"
                type="number"
                min={4}
                value={selectedElement.height}
                onChange={(e) => patchSelected({ height: Number(e.target.value) })}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inspector-zindex"
              className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
            >
              Layer Z-Index
            </label>
            <input
              id="inspector-zindex"
              type="number"
              value={selectedElement.zIndex}
              onChange={(e) => patchSelected({ zIndex: Number(e.target.value) })}
              className="w-full h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>
    );
  }

  // Slide Canvas Inspector (when no element is selected)
  const insertItems: { type: InsertElementType; label: string; icon: React.ElementType }[] = [
    { type: 'heading', label: 'Heading', icon: Type },
    { type: 'text', label: 'Text Block', icon: AlignLeft },
    { type: 'bullets', label: 'Bullet List', icon: List },
    { type: 'kpi', label: 'KPI Metric', icon: Hash },
    { type: 'callout', label: 'Callout Box', icon: MessageSquareQuote },
    { type: 'badge', label: 'Tag / Label', icon: Tag },
    { type: 'shape', label: 'Card / Shape', icon: Square },
    { type: 'divider', label: 'Accent Bar', icon: Minus },
    { type: 'arrow', label: 'Arrow', icon: ArrowRight },
  ];

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
      {/* Quick Hint & Insert Blocks */}
      <div className="p-4 flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Insert Object
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Click to select, Shift+Click multiple objects to group or align, or double-click text to edit.
          </p>
        </div>

        <input
          ref={imageUploadRef}
          type="file"
          accept="image/*"
          onChange={handleInsertImageFile}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          {insertItems.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => onSendCommand({ type: 'insert-element', elementType: type })}
              className="h-9 px-2.5 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-white dark:hover:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => imageUploadRef.current?.click()}
            className="h-9 px-2.5 inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate">Image</span>
          </button>
        </div>
      </div>

      {/* Slide Canvas Settings */}
      <div className="p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          Slide Canvas
        </span>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-400">Text Direction</span>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(['ltr', 'rtl'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => onSendCommand({ type: 'set-slide-dir', dir })}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer uppercase ${
                  slideDir === dir
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="canvas-bg-color"
            className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
          >
            Canvas Background Override
          </label>
          <div className="flex items-center gap-2">
            <input
              id="canvas-bg-color"
              type="color"
              value={normalizeHexForPicker(slide.backgroundOverride || theme.tokens.bg, '#0b1220')}
              onChange={(e) => onUpdateSlide({ backgroundOverride: e.target.value })}
              className="w-8 h-8 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={slide.backgroundOverride || ''}
              onChange={(e) =>
                onUpdateSlide({ backgroundOverride: e.target.value || undefined })
              }
              placeholder={`Default (${theme.tokens.bg})`}
              aria-label="Slide background override value"
              className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100"
            />
            {slide.backgroundOverride && (
              <button
                type="button"
                onClick={() => onUpdateSlide({ backgroundOverride: undefined })}
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Slide Layers Outline */}
      <div className="p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Slide Elements</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {layers.length}
          </span>
        </div>

        {layers.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            No selectable elements detected on this slide.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {layers.map((layer, idx) => (
              <button
                key={layer.id}
                type="button"
                onClick={(e) =>
                  onSendCommand({
                    type: 'select-element',
                    id: layer.id,
                    additive: e.shiftKey,
                  })
                }
                className="w-full text-left px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                title="Click to select, Shift+Click to add to selection"
              >
                <span className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  {layer.label}
                </span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                  {layer.tag} · {String(idx + 1).padStart(2, '0')}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Tip: Shift+Click multiple layers to group or align them.
        </p>
      </div>
    </div>
  );
};
