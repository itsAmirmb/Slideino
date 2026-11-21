import { Deck, SlideTheme } from '../types/slideino';
import { BUILT_IN_THEMES } from '../data/themes';
import { createStarterDeck } from '../data/starterDeck';
import { DEFAULT_LIBRARIES } from '../data/libraries';

const STORAGE_KEYS = {
  DECKS: 'slideino.v1.decks',
  ACTIVE_DECK: 'slideino.v1.activeDeckId',
  CUSTOM_THEMES: 'slideino.v1.customThemes',
  UI_DARK_MODE: 'slideino.v1.uiDarkMode',
} as const;

export function isValidHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DECKS);
    if (!raw) {
      const starter = createStarterDeck();
      starter.snapshots[0].slides = starter.slides;
      return [starter];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const starter = createStarterDeck();
      starter.snapshots[0].slides = starter.slides;
      return [starter];
    }
    return parsed.map((d) => ({
      ...d,
      libraries: { ...DEFAULT_LIBRARIES, ...(d.libraries || {}) },
      customResources: Array.isArray(d.customResources) ? d.customResources : [],
      sharedCss: typeof d.sharedCss === 'string' ? d.sharedCss : undefined,
      snapshots: Array.isArray(d.snapshots) ? d.snapshots : [],
      slides: Array.isArray(d.slides) && d.slides.length > 0 ? d.slides : createStarterDeck().slides.slice(0, 1),
    }));
  } catch {
    const starter = createStarterDeck();
    starter.snapshots[0].slides = starter.slides;
    return [starter];
  }
}

export function saveDecks(decks: Deck[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DECKS, JSON.stringify(decks));
  } catch {
    // Retry without older snapshots if storage quota was exceeded by large imported decks
    try {
      const compactDecks = decks.map((d) => ({
        ...d,
        snapshots: d.snapshots.slice(0, 1),
      }));
      localStorage.setItem(STORAGE_KEYS.DECKS, JSON.stringify(compactDecks));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
}

export function loadActiveDeckId(decks: Deck[]): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_DECK);
    if (saved && decks.some((d) => d.id === saved)) {
      return saved;
    }
  } catch {
    // Fallback
  }
  return decks[0]?.id ?? '';
}

export function saveActiveDeckId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_DECK, id);
  } catch {
    // Ignore
  }
}

export function loadCustomThemes(): SlideTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_THEMES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) => t && typeof t.id === 'string' && typeof t.name === 'string' && t.tokens
    );
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: SlideTheme[]): void {
  try {
    const customOnly = themes.filter((t) => !t.isBuiltIn);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_THEMES, JSON.stringify(customOnly));
  } catch {
    // Ignore
  }
}

export function getAllThemes(customThemes: SlideTheme[]): SlideTheme[] {
  return [...BUILT_IN_THEMES, ...customThemes.filter((t) => !t.isBuiltIn)];
}

export function loadUiDarkMode(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.UI_DARK_MODE);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Fallback
  }
  return false;
}

export function saveUiDarkMode(dark: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.UI_DARK_MODE, String(dark));
  } catch {
    // Ignore
  }
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateImportedDeckJson(raw: string): Deck | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.title !== 'string' || !Array.isArray(obj.slides) || obj.slides.length === 0) {
      return null;
    }
    const validSlides = obj.slides
      .filter((s: unknown) => s && typeof s === 'object' && typeof (s as { html?: unknown }).html === 'string')
      .map((s: Record<string, unknown>, idx: number) => ({
        id: `slide-${Date.now()}-${idx}`,
        title: typeof s.title === 'string' ? s.title.slice(0, 120) : `Slide ${idx + 1}`,
        html: String(s.html),
        css: typeof s.css === 'string' ? s.css : '',
        notes: typeof s.notes === 'string' ? s.notes : '',
        transition: ['fade', 'slide', 'zoom', 'none'].includes(String(s.transition))
          ? (s.transition as Deck['defaultTransition'])
          : 'fade',
        hidden: Boolean(s.hidden),
        backgroundOverride: typeof s.backgroundOverride === 'string' ? s.backgroundOverride : undefined,
        standalone: typeof s.standalone === 'boolean' ? s.standalone : undefined,
      }));

    if (validSlides.length === 0) return null;

    const validResources = Array.isArray(obj.customResources)
      ? obj.customResources.filter(
          (r: Record<string, unknown>) =>
            r &&
            typeof r.url === 'string' &&
            isValidHttpsUrl(r.url) &&
            (r.type === 'script' || r.type === 'style')
        )
      : [];

    return {
      id: `deck-${Date.now()}`,
      title: obj.title.slice(0, 120),
      description: typeof obj.description === 'string' ? obj.description.slice(0, 400) : '',
      themeId: typeof obj.themeId === 'string' ? obj.themeId : 'atelier-light',
      aspectRatio: ['auto', '16:9', '16:10', '4:3', '9:16', 'fluid'].includes(String(obj.aspectRatio))
        ? (obj.aspectRatio as Deck['aspectRatio'])
        : '16:9',
      defaultTransition: ['fade', 'slide', 'zoom', 'none'].includes(String(obj.defaultTransition))
        ? (obj.defaultTransition as Deck['defaultTransition'])
        : 'fade',
      libraries: { ...DEFAULT_LIBRARIES, ...(obj.libraries || {}) },
      customResources: validResources,
      sharedCss: typeof obj.sharedCss === 'string' ? obj.sharedCss : undefined,
      slides: validSlides,
      snapshots: [],
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function validateImportedThemeJson(raw: string): SlideTheme | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || typeof obj.name !== 'string' || !obj.tokens) {
      return null;
    }
    const base = BUILT_IN_THEMES[0].tokens;
    const t = obj.tokens as Record<string, unknown>;
    return {
      id: `theme-custom-${Date.now()}`,
      name: obj.name.slice(0, 80),
      description: typeof obj.description === 'string' ? obj.description.slice(0, 240) : 'Imported custom theme',
      isBuiltIn: false,
      isDark: Boolean(obj.isDark),
      tokens: {
        bg: typeof t.bg === 'string' ? t.bg : base.bg,
        surface: typeof t.surface === 'string' ? t.surface : base.surface,
        text: typeof t.text === 'string' ? t.text : base.text,
        muted: typeof t.muted === 'string' ? t.muted : base.muted,
        accent: typeof t.accent === 'string' ? t.accent : base.accent,
        border: typeof t.border === 'string' ? t.border : base.border,
        fontDisplay: typeof t.fontDisplay === 'string' ? t.fontDisplay : base.fontDisplay,
        fontBody: typeof t.fontBody === 'string' ? t.fontBody : base.fontBody,
        fontMono: typeof t.fontMono === 'string' ? t.fontMono : base.fontMono,
        baseFontSize: typeof t.baseFontSize === 'number' ? Math.min(28, Math.max(12, t.baseFontSize)) : 18,
        radius: typeof t.radius === 'number' ? Math.min(32, Math.max(0, t.radius)) : 12,
        padding: typeof t.padding === 'number' ? Math.min(120, Math.max(16, t.padding)) : 64,
      },
      customCss: typeof obj.customCss === 'string' ? obj.customCss : '',
    };
  } catch {
    return null;
  }
}
