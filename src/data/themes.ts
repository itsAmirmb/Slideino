import { SlideTheme } from '../types/slideino';

export const BUILT_IN_THEMES: SlideTheme[] = [
  {
    id: 'atelier-light',
    name: 'Atelier Light',
    description: 'Clean gallery white paper, deep charcoal typography, and cobalt accent for executive briefings.',
    isBuiltIn: true,
    isDark: false,
    tokens: {
      bg: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#0F172A',
      muted: '#475569',
      accent: '#2563EB',
      border: '#E2E8F0',
      fontDisplay: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontBody: "'DM Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseFontSize: 18,
      radius: 12,
      padding: 64,
    },
    customCss: '',
  },
  {
    id: 'obsidian-studio',
    name: 'Obsidian Studio',
    description: 'Deep slate canvas with optical-compensated snow ink and crisp sky-blue interactive accents.',
    isBuiltIn: true,
    isDark: true,
    tokens: {
      bg: '#0B1120',
      surface: '#111827',
      text: '#F8FAFC',
      muted: '#94A3B8',
      accent: '#38BDF8',
      border: '#1E293B',
      fontDisplay: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontBody: "'DM Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseFontSize: 18,
      radius: 12,
      padding: 64,
    },
    customCss: '',
  },
  {
    id: 'swiss-editorial',
    name: 'Swiss Editorial',
    description: 'Warm archival paper paired with Playfair Display headings and restrained vermilion accents.',
    isBuiltIn: true,
    isDark: false,
    tokens: {
      bg: '#FAF8F5',
      surface: '#F2EFE9',
      text: '#141413',
      muted: '#57534E',
      accent: '#C2410C',
      border: '#E5E0D8',
      fontDisplay: "'Playfair Display', Georgia, serif",
      fontBody: "'DM Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseFontSize: 18,
      radius: 6,
      padding: 68,
    },
    customCss: '',
  },
  {
    id: 'botanical-noir',
    name: 'Botanical Noir',
    description: 'Deep forest slate canvas with Fraunces editorial serif headings and crisp sage highlights.',
    isBuiltIn: true,
    isDark: true,
    tokens: {
      bg: '#0D1916',
      surface: '#142621',
      text: '#F1F5F3',
      muted: '#9CB0A8',
      accent: '#84CC16',
      border: '#213B34',
      fontDisplay: "'Fraunces', Georgia, serif",
      fontBody: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseFontSize: 18,
      radius: 10,
      padding: 64,
    },
    customCss: '',
  },
  {
    id: 'high-contrast-aaa',
    name: 'High-Contrast AAA',
    description: 'Maximum-legibility WCAG AAA monochrome palette with vivid gold focus accents for large auditoriums.',
    isBuiltIn: true,
    isDark: true,
    tokens: {
      bg: '#000000',
      surface: '#111111',
      text: '#FFFFFF',
      muted: '#E2E8F0',
      accent: '#FACC15',
      border: '#525252',
      fontDisplay: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontBody: "'DM Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseFontSize: 20,
      radius: 8,
      padding: 64,
    },
    customCss: 'body { letter-spacing: 0.015em; }',
  },
];

export const FONT_OPTIONS = {
  display: [
    { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', system-ui, sans-serif" },
    { label: 'Playfair Display (Serif)', value: "'Playfair Display', Georgia, serif" },
    { label: 'Fraunces (Editorial Serif)', value: "'Fraunces', Georgia, serif" },
    { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
    { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  ],
  body: [
    { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
    { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', system-ui, sans-serif" },
    { label: 'Georgia Serif', value: 'Georgia, Cambria, serif' },
    { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  ],
  mono: [
    { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { label: 'System Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  ],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return Number.isNaN(r) ? null : [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return Number.isNaN(r) ? null : [r, g, b];
  }
  return null;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return 1;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastGrade(ratio: number): {
  label: 'AAA' | 'AA' | 'Large Only' | 'Low';
  passesAA: boolean;
} {
  if (ratio >= 7) return { label: 'AAA', passesAA: true };
  if (ratio >= 4.5) return { label: 'AA', passesAA: true };
  if (ratio >= 3) return { label: 'Large Only', passesAA: false };
  return { label: 'Low', passesAA: false };
}

export function isColorDark(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.22;
}
