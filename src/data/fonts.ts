export interface FontOption {
  name: string;
  family: string;
  category: 'sans' | 'rtl' | 'serif' | 'mono';
  googleSpec: string;
}

export const FONT_CATALOG: FontOption[] = [
  // Sans-Serif (Latin & UI)
  {
    name: 'Inter',
    family: "'Inter', sans-serif",
    category: 'sans',
    googleSpec: 'Inter:ital,wght@0,300..900;1,300..900',
  },
  {
    name: 'Plus Jakarta Sans',
    family: "'Plus Jakarta Sans', sans-serif",
    category: 'sans',
    googleSpec: 'Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800',
  },
  {
    name: 'DM Sans',
    family: "'DM Sans', sans-serif",
    category: 'sans',
    googleSpec: 'DM+Sans:ital,wght@0,300..800;1,300..800',
  },
  {
    name: 'Space Grotesk',
    family: "'Space Grotesk', sans-serif",
    category: 'sans',
    googleSpec: 'Space+Grotesk:wght@300..700',
  },
  {
    name: 'Poppins',
    family: "'Poppins', sans-serif",
    category: 'sans',
    googleSpec: 'Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600',
  },
  {
    name: 'Montserrat',
    family: "'Montserrat', sans-serif",
    category: 'sans',
    googleSpec: 'Montserrat:ital,wght@0,300..900;1,300..900',
  },
  {
    name: 'Manrope',
    family: "'Manrope', sans-serif",
    category: 'sans',
    googleSpec: 'Manrope:wght@300..800',
  },
  {
    name: 'Roboto',
    family: "'Roboto', sans-serif",
    category: 'sans',
    googleSpec: 'Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400;1,700',
  },
  {
    name: 'Open Sans',
    family: "'Open Sans', sans-serif",
    category: 'sans',
    googleSpec: 'Open+Sans:ital,wght@0,300..800;1,300..800',
  },
  {
    name: 'Lato',
    family: "'Lato', sans-serif",
    category: 'sans',
    googleSpec: 'Lato:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700',
  },

  // Persian & Arabic (RTL)
  {
    name: 'Vazirmatn',
    family: "'Vazirmatn', sans-serif",
    category: 'rtl',
    googleSpec: 'Vazirmatn:wght@300..900',
  },
  {
    name: 'Noto Sans Arabic',
    family: "'Noto Sans Arabic', sans-serif",
    category: 'rtl',
    googleSpec: 'Noto+Sans+Arabic:wght@300..900',
  },
  {
    name: 'Cairo',
    family: "'Cairo', sans-serif",
    category: 'rtl',
    googleSpec: 'Cairo:wght@300..900',
  },
  {
    name: 'Tajawal',
    family: "'Tajawal', sans-serif",
    category: 'rtl',
    googleSpec: 'Tajawal:wght@300;400;500;700;800;900',
  },
  {
    name: 'Readex Pro',
    family: "'Readex Pro', sans-serif",
    category: 'rtl',
    googleSpec: 'Readex+Pro:wght@300..700',
  },
  {
    name: 'Lalezar',
    family: "'Lalezar', cursive",
    category: 'rtl',
    googleSpec: 'Lalezar',
  },

  // Serif & Editorial
  {
    name: 'Playfair Display',
    family: "'Playfair Display', serif",
    category: 'serif',
    googleSpec: 'Playfair+Display:ital,wght@0,400..900;1,400..900',
  },
  {
    name: 'Fraunces',
    family: "'Fraunces', serif",
    category: 'serif',
    googleSpec: 'Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..800',
  },
  {
    name: 'Merriweather',
    family: "'Merriweather', serif",
    category: 'serif',
    googleSpec: 'Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700',
  },
  {
    name: 'Lora',
    family: "'Lora', serif",
    category: 'serif',
    googleSpec: 'Lora:ital,wght@0,400..700;1,400..700',
  },
  {
    name: 'Newsreader',
    family: "'Newsreader', serif",
    category: 'serif',
    googleSpec: 'Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700',
  },

  // Monospace
  {
    name: 'JetBrains Mono',
    family: "'JetBrains Mono', monospace",
    category: 'mono',
    googleSpec: 'JetBrains+Mono:ital,wght@0,400..700;1,400..700',
  },
  {
    name: 'IBM Plex Mono',
    family: "'IBM Plex Mono', monospace",
    category: 'mono',
    googleSpec: 'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    name: 'Fira Code',
    family: "'Fira Code', monospace",
    category: 'mono',
    googleSpec: 'Fira+Code:wght@400..700',
  },
];

export const FONT_CATEGORY_LABELS: Record<FontOption['category'], string> = {
  sans: 'Sans-Serif',
  rtl: 'Persian & Arabic (RTL)',
  serif: 'Serif & Editorial',
  mono: 'Monospace',
};

export function extractPrimaryFontName(fontFamilyCss: string): string {
  if (!fontFamilyCss) return '';
  const first = fontFamilyCss.split(',')[0] || '';
  return first.replace(/^[\s'"]+|[\s'"]+$/g, '');
}

export function findCatalogFont(fontNameOrCss: string): FontOption | undefined {
  const primary = extractPrimaryFontName(fontNameOrCss).toLowerCase();
  if (!primary) return undefined;
  return FONT_CATALOG.find((f) => f.name.toLowerCase() === primary);
}

export function buildGoogleFontUrl(option: FontOption): string {
  return `https://fonts.googleapis.com/css2?family=${option.googleSpec}&display=swap`;
}

/**
 * Inspects slide HTML/CSS (plus optional theme font tokens) for any catalog Google Fonts referenced
 * in font-family declarations, skipping any font names already provided via @font-face in sharedCss
 * or the slide HTML itself, and skipping any already loaded by an explicit Google Fonts <link>.
 */
export function buildAutoGoogleFontsLink(
  html: string,
  css: string,
  sharedCss?: string,
  extraFontSources?: string
): string {
  const combinedSource = `${html}\n${css}\n${extraFontSources || ''}`;
  if (!combinedSource.trim()) return '';

  // Collect fonts already defined via @font-face so we never override embedded local/base64 fonts
  const embeddedFonts = new Set<string>();
  const fontFaceSource = `${sharedCss || ''}\n${html}\n${css}`;
  const ffRegex = /@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^'";}]+)['"]?/gi;
  let ffMatch: RegExpExecArray | null;
  while ((ffMatch = ffRegex.exec(fontFaceSource)) !== null) {
    const clean = ffMatch[1].trim().toLowerCase();
    if (clean) embeddedFonts.add(clean);
  }

  // Also skip families already explicitly requested via a Google Fonts <link> in standalone HTML
  const existingGFontLinks = (
    html.match(/https?:\/\/fonts\.googleapis\.com\/css2?\?[^"'<>]+/gi) || []
  )
    .join(' ')
    .toLowerCase();

  const specs: string[] = [];
  const lowerSource = combinedSource.toLowerCase();

  for (const font of FONT_CATALOG) {
    const lowerName = font.name.toLowerCase();
    if (embeddedFonts.has(lowerName)) continue;
    if (existingGFontLinks.includes(lowerName.replace(/\s+/g, '+'))) continue;
    if (lowerSource.includes(lowerName)) {
      specs.push(`family=${font.googleSpec}`);
    }
  }

  if (specs.length === 0) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${specs.join('&')}&display=swap" data-slideino-autofont="true">`;
}
