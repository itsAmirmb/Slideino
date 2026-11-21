export type WorkspaceTab = 'studio' | 'themes' | 'libraries' | 'decks';

export type AspectRatio = '16:9' | '16:10' | '4:3' | '9:16' | 'fluid';

export type TransitionType = 'fade' | 'slide' | 'zoom' | 'none';

export type DevicePreview = 'desktop' | 'tablet' | 'mobile';

export type LibraryId =
  | 'tailwind'
  | 'katex'
  | 'mermaid'
  | 'chartjs'
  | 'highlightjs'
  | 'lucide'
  | 'fontawesome'
  | 'animatecss'
  | 'd3';

export type LibraryCategory = 'styling' | 'diagrams' | 'math-code' | 'icons-motion';

export interface LibraryDefinition {
  id: LibraryId;
  name: string;
  version: string;
  category: LibraryCategory;
  description: string;
  usageHint: string;
  exampleTitle: string;
  exampleHtml: string;
  exampleCss: string;
  exampleNotes: string;
}

export type LibraryConfig = Record<LibraryId, boolean>;

export interface CustomResource {
  id: string;
  label: string;
  type: 'script' | 'style';
  url: string;
}

export interface Slide {
  id: string;
  title: string;
  html: string;
  css: string;
  notes: string;
  transition: TransitionType;
  hidden?: boolean;
  backgroundOverride?: string;
  standalone?: boolean;
}

export interface SlideTheme {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  isDark: boolean;
  tokens: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    border: string;
    fontDisplay: string;
    fontBody: string;
    fontMono: string;
    baseFontSize: number;
    radius: number;
    padding: number;
  };
  customCss: string;
}

export interface DeckSnapshot {
  id: string;
  message: string;
  createdAt: string;
  slideCount: number;
  slides: Slide[];
  themeId: string;
  libraries: LibraryConfig;
  sharedCss?: string;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  themeId: string;
  aspectRatio: AspectRatio;
  defaultTransition: TransitionType;
  libraries: LibraryConfig;
  customResources: CustomResource[];
  sharedCss?: string;
  slides: Slide[];
  snapshots: DeckSnapshot[];
  updatedAt: string;
}

export interface SlideTemplate {
  id: string;
  name: string;
  summary: string;
  html: string;
  css: string;
  notes: string;
}

export const ASPECT_RATIO_DIMENSIONS: Record<
  Exclude<AspectRatio, 'fluid'>,
  { width: number; height: number; label: string }
> = {
  '16:9': { width: 1280, height: 720, label: '16:9 Widescreen' },
  '16:10': { width: 1280, height: 800, label: '16:10 Display' },
  '4:3': { width: 1024, height: 768, label: '4:3 Classic' },
  '9:16': { width: 720, height: 1280, label: '9:16 Vertical' },
};

export type InsertElementType =
  | 'heading'
  | 'text'
  | 'bullets'
  | 'kpi'
  | 'callout'
  | 'badge'
  | 'shape'
  | 'divider'
  | 'arrow'
  | 'image';

export type AlignAction = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';

export interface MultiSelectionSummary {
  count: number;
  ids: string[];
  labels: string[];
}

export interface SlideLayerItem {
  id: string;
  tag: string;
  label: string;
  kind: 'text' | 'image' | 'shape' | 'container';
  zIndex: number;
}

export interface SelectedElementInfo {
  id: string;
  tag: string;
  friendlyName: string;
  label: string;
  kind: 'text' | 'image' | 'shape' | 'container';
  hasParent: boolean;
  canUngroup: boolean;
  hasText: boolean;
  isTextEditable: boolean;
  textContent: string;
  dir: 'ltr' | 'rtl' | '';
  children: SlideLayerItem[];
  // Geometry (in slide canvas px)
  positionMode: 'absolute' | 'relative' | 'static' | 'fixed' | 'sticky';
  horizontalAnchor: 'left' | 'right';
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Typography
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
  lineHeight: string;
  letterSpacing: string;
  // Appearance
  backgroundColor: string;
  borderRadius: number;
  opacity: number;
  padding: number;
  // Image specific
  imgSrc?: string;
  imgAlt?: string;
  objectFit?: string;
}

export interface ElementStylePatch {
  textContent?: string;
  dir?: 'ltr' | 'rtl' | '';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  fontFamily?: string;
  googleFontUrl?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  lineHeight?: string;
  letterSpacing?: string;
  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
  imgSrc?: string;
  imgAlt?: string;
  objectFit?: string;
}

export type EditorCommand =
  | { type: 'select-element'; id: string | null; additive?: boolean }
  | { type: 'select-parent' }
  | { type: 'update-element'; id: string; patch: ElementStylePatch }
  | { type: 'delete-selected' }
  | { type: 'duplicate-selected' }
  | { type: 'reorder-z'; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'make-absolute'; id?: string }
  | { type: 'group-selected' }
  | { type: 'ungroup-selected'; id?: string }
  | { type: 'align-selected'; alignment: AlignAction }
  | { type: 'insert-element'; elementType: InsertElementType; imgSrc?: string; imgAlt?: string }
  | { type: 'set-slide-dir'; dir: 'ltr' | 'rtl' }
  | { type: 'set-snap'; enabled: boolean }
  | { type: 'request-layers' };
