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
