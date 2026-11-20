import { Deck, SlideTemplate } from '../types/slideino';
import { DEFAULT_LIBRARIES } from './libraries';

export const HERO_ARCHITECTURAL_IMG = '/src/assets/images/slide_keynote_architecture_1795201757539.jpg';
export const STUDIO_EDITORIAL_IMG = '/src/assets/images/slide_studio_editorial_1795201757898.jpg';

export function createStarterDeck(): Deck {
  const now = new Date().toISOString();

  return {
    id: 'deck-slideino-showcase',
    title: 'Slideino Showcase — Modern HTML Presentations',
    description:
      'Demonstrates native HTML/CSS slides enhanced with Chart.js, Mermaid, KaTeX, Highlight.js, Tailwind CSS, and responsive custom themes.',
    themeId: 'atelier-light',
    aspectRatio: '16:9',
    defaultTransition: 'fade',
    libraries: { ...DEFAULT_LIBRARIES },
    customResources: [],
    updatedAt: now,
    snapshots: [
      {
        id: 'snap-initial',
        message: 'Initial showcase deck setup',
        createdAt: now,
        slideCount: 6,
        themeId: 'atelier-light',
        libraries: { ...DEFAULT_LIBRARIES },
        slides: [],
      },
    ],
    slides: [
      {
        id: 'slide-1-cover',
        title: 'Title Cover — Architectural HTML Slides',
        transition: 'fade',
        notes:
          'Welcome the audience. Highlight that this entire presentation is rendered from pure HTML and CSS generated with AI, styled dynamically by Slideino themes and scaled responsively for any screen.',
        html: `<div class="hero-stage">
  <img
    src="${HERO_ARCHITECTURAL_IMG}"
    alt="Minimalist architectural limestone and glass pavilion over calm water"
    class="hero-media"
  />
  <div class="hero-scrim"></div>
  <div class="hero-content">
    <div class="hero-meta">Slideino Presentation Runtime &middot; 2026 Edition</div>
    <h1 class="hero-title">Precision Slides Built Directly in HTML &amp; CSS</h1>
    <p class="hero-subtitle">
      Paste AI-generated slide code and present immediately with Tailwind CSS, Mermaid diagrams, KaTeX formulas, Chart.js graphs, and accessible custom themes.
    </p>
    <div class="hero-footer">
      <span>Prepared for Product &amp; Engineering Teams</span>
      <span class="slide-num">01 / 06</span>
    </div>
  </div>
</div>`,
        css: `.hero-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  color: #ffffff;
  background: #0f172a;
}
.hero-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 42%;
}
.hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(10, 15, 28, 0.92) 0%,
    rgba(10, 15, 28, 0.58) 46%,
    rgba(10, 15, 28, 0.16) 100%
  );
}
.hero-content {
  position: relative;
  z-index: 2;
  width: 100%;
  padding: 64px 72px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.hero-meta {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.8);
}
.hero-title {
  margin: 0;
  font-family: var(--slide-font-display);
  font-size: 58px;
  font-weight: 700;
  line-height: 1.08;
  max-width: 880px;
  letter-spacing: -0.02em;
}
.hero-subtitle {
  margin: 0;
  font-size: 20px;
  line-height: 1.55;
  max-width: 740px;
  color: rgba(241, 245, 249, 0.9);
}
.hero-footer {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.78);
}
.slide-num {
  font-family: var(--slide-font-mono);
  font-variant-numeric: tabular-nums;
}`,
      },
      {
        id: 'slide-2-chart',
        title: 'Data Visualization — Chart.js Integration',
        transition: 'slide',
        notes:
          'Point out how Chart.js reads the active Slideino CSS variables (--slide-accent, --slide-text, --slide-border) so switching from Atelier Light to Obsidian Studio or High-Contrast AAA automatically re-themes the chart.',
        html: `<div class="data-layout">
  <header class="data-head">
    <div>
      <p class="eyebrow">02 &middot; Live Canvas Visualization</p>
      <h1>Quarterly Engineering Velocity</h1>
    </div>
    <div class="kpi-strip">
      <div class="kpi">
        <span class="kpi-val">98.4%</span>
        <span class="kpi-lbl">Render Fidelity</span>
      </div>
      <div class="kpi">
        <span class="kpi-val">142 ms</span>
        <span class="kpi-lbl">Median Build</span>
      </div>
    </div>
  </header>

  <div class="chart-card">
    <canvas id="velocityChart"></canvas>
  </div>

  <footer class="data-foot">
    <span>Source: Internal Slide Rendering Benchmark (1,200 AI-generated decks)</span>
    <span class="mono">Chart.js 4.4 Runtime</span>
  </footer>
</div>

<script>
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('velocityChart');
  if (!canvas) return;
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--slide-accent').trim() || '#2563eb';
  const text = cs.getPropertyValue('--slide-text').trim() || '#0f172a';
  const muted = cs.getPropertyValue('--slide-muted').trim() || '#64748b';
  const border = cs.getPropertyValue('--slide-border').trim() || '#e2e8f0';

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const values = [42, 54, 61, 73, 79, 88, 94, 98];

  if (typeof Chart !== 'undefined') {
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'First-Pass Render Accuracy (%)',
            data: values,
            borderColor: accent,
            backgroundColor: accent + '1f',
            borderWidth: 3,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: accent,
            fill: true,
            tension: 0.32
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { padding: 12, displayColors: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: muted, font: { size: 14, family: 'JetBrains Mono, monospace' } }
          },
          y: {
            min: 20,
            max: 105,
            grid: { color: border },
            ticks: {
              color: muted,
              font: { size: 13, family: 'JetBrains Mono, monospace' },
              callback: (v) => v + '%'
            }
          }
        }
      }
    });
  } else {
    // Graceful native Canvas 2D fallback if offline
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth - 48;
    const h = canvas.height = canvas.parentElement.clientHeight - 48;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 30 + ((h - 70) / 4) * i;
      ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(w - 20, y); ctx.stroke();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = 60 + ((w - 100) / (values.length - 1)) * i;
      const y = h - 40 - ((v - 20) / 85) * (h - 70);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '13px monospace';
    labels.forEach((lbl, i) => {
      const x = 60 + ((w - 100) / (labels.length - 1)) * i;
      ctx.fillText(lbl, x - 12, h - 14);
    });
  }
});
</script>`,
        css: `.data-layout {
  height: 100%;
  padding: var(--slide-padding);
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.data-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--slide-accent);
}
h1 {
  margin: 0;
  font-family: var(--slide-font-display);
  font-size: 44px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.kpi-strip {
  display: flex;
  gap: 36px;
}
.kpi {
  text-align: right;
}
.kpi-val {
  display: block;
  font-family: var(--slide-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 34px;
  font-weight: 700;
  color: var(--slide-text);
  line-height: 1.1;
}
.kpi-lbl {
  font-size: 13px;
  color: var(--slide-muted);
}
.chart-card {
  flex: 1;
  min-height: 0;
  padding: 28px 32px;
  background: var(--slide-surface);
  border: 1px solid var(--slide-border);
  border-radius: var(--slide-radius);
}
.data-foot {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--slide-muted);
}
.mono {
  font-family: var(--slide-font-mono);
}`,
      },
      {
        id: 'slide-3-mermaid',
        title: 'Architecture Diagram — Mermaid.js Pipeline',
        transition: 'slide',
        notes:
          'Explain how Slideino isolates pasted AI code inside an opaque-origin sandbox while still injecting Mermaid, KaTeX, Highlight.js, and custom theme variables automatically.',
        html: `<div class="arch-slide">
  <div class="arch-head">
    <p class="eyebrow">03 &middot; Declarative Diagrams</p>
    <h1>Isolated Multi-Library Rendering Pipeline</h1>
    <p class="lead">Mermaid syntax compiles directly into crisp SVG diagrams synced with your active Slideino theme.</p>
  </div>

  <div class="diagram-container">
    <div class="mermaid">
flowchart LR
    A[AI-Generated HTML & CSS] --> B[Slideino Compiler]
    B --> C[Theme CSS Variables]
    B --> D[Library Loader]
    C --> E[Sandboxed Iframe Stage]
    D --> E
    E --> F[Responsive 16:9 / 4:3 View]
    E --> G[Accessible Presenter Mode]
    </div>
  </div>

  <div class="arch-notes">
    <div>
      <strong>Opaque Sandbox</strong>
      <span>Scripts run freely inside isolated iframes without touching host app storage.</span>
    </div>
    <div>
      <strong>Theme Synchronization</strong>
      <span>Mermaid detects dark or light canvas tokens automatically on every switch.</span>
    </div>
    <div>
      <strong>Zero Build Step</strong>
      <span>Paste HTML directly from any AI model and present in under two seconds.</span>
    </div>
  </div>
</div>`,
        css: `.arch-slide {
  height: 100%;
  padding: var(--slide-padding);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--slide-accent);
}
h1 {
  margin: 0 0 8px;
  font-family: var(--slide-font-display);
  font-size: 42px;
  line-height: 1.12;
  letter-spacing: -0.02em;
}
.lead {
  margin: 0;
  font-size: 17px;
  color: var(--slide-muted);
}
.diagram-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--slide-surface);
  border: 1px solid var(--slide-border);
  border-radius: var(--slide-radius);
  padding: 28px;
  overflow: hidden;
}
.mermaid {
  width: 100%;
  display: flex;
  justify-content: center;
}
.arch-notes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding-top: 8px;
  border-top: 1px solid var(--slide-border);
}
.arch-notes strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.arch-notes span {
  font-size: 14px;
  color: var(--slide-muted);
  line-height: 1.5;
}`,
      },
      {
        id: 'slide-4-katex',
        title: 'Technical Formulas — KaTeX Typesetting',
        transition: 'fade',
        notes:
          'Scientific, machine learning, and financial decks often break when copied into traditional slide tools. Slideino supports KaTeX auto-rendering natively.',
        html: `<div class="katex-slide">
  <div class="left-col">
    <p class="eyebrow">04 &middot; Scientific &amp; Mathematical Typesetting</p>
    <h1>Publication-Grade Equations Without Screenshots</h1>
    <p class="copy">
      Write standard LaTeX delimiters like <code>$E = mc^2$</code> inline or wrap display equations in double dollar signs. KaTeX renders sharp vector glyphs at every zoom level.
    </p>
    <div class="legend">
      <div class="legend-row">
        <span class="sym">$\mathcal{L}(\theta)$</span>
        <span>Cross-entropy objective across token sequence</span>
      </div>
      <div class="legend-row">
        <span class="sym">$D_{\mathrm{KL}}$</span>
        <span>Kullback-Leibler divergence penalty term</span>
      </div>
    </div>
  </div>

  <div class="right-col">
    <div class="eq-panel">
      <span class="eq-title">Transformer Attention Mechanism</span>
      <div class="eq-body">$$\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\!\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$$</div>
    </div>
    <div class="eq-panel">
      <span class="eq-title">Regularized Optimization Objective</span>
      <div class="eq-body">$$\\min_{\\theta}\\; \\mathbb{E}_{(x,y) \\sim \\mathcal{D}}\\big[\\mathcal{L}(f_\\theta(x), y)\\big] + \\beta\\, D_{\\mathrm{KL}}(p_\\theta \\parallel p_{\\mathrm{ref}})$$</div>
    </div>
  </div>
</div>`,
        css: `.katex-slide {
  height: 100%;
  padding: var(--slide-padding);
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 48px;
  align-items: center;
}
.eyebrow {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--slide-accent);
}
h1 {
  margin: 0 0 18px;
  font-family: var(--slide-font-display);
  font-size: 42px;
  line-height: 1.12;
  letter-spacing: -0.02em;
}
.copy {
  margin: 0 0 28px;
  font-size: 17px;
  line-height: 1.65;
  color: var(--slide-muted);
}
.copy code {
  font-family: var(--slide-font-mono);
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--slide-surface);
  border: 1px solid var(--slide-border);
  color: var(--slide-text);
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 20px;
  border-top: 1px solid var(--slide-border);
}
.legend-row {
  display: flex;
  align-items: baseline;
  gap: 16px;
  font-size: 15px;
  color: var(--slide-muted);
}
.sym {
  min-width: 72px;
  color: var(--slide-text);
  font-weight: 600;
}
.right-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.eq-panel {
  padding: 30px 32px;
  background: var(--slide-surface);
  border: 1px solid var(--slide-border);
  border-radius: var(--slide-radius);
}
.eq-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--slide-muted);
  margin-bottom: 16px;
}
.eq-body {
  font-size: 22px;
  overflow-x: auto;
}`,
      },
      {
        id: 'slide-5-code-media',
        title: 'Editorial Code Walkthrough — Highlight.js',
        transition: 'slide',
        notes:
          'Show how cleanly code walkthroughs pair with editorial imagery. Highlight.js handles 190+ languages and switches syntax palettes automatically.',
        html: `<div class="split-slide">
  <div class="code-col">
    <p class="eyebrow">05 &middot; Syntax Highlighting &amp; Editorial Media</p>
    <h1>Theme-Aware Code Blocks</h1>
    <p class="desc">
      Use standard semantic <code>&lt;pre&gt;&lt;code&gt;</code> tags from any AI assistant. Slideino applies accessible typography and syntax colors automatically.
    </p>
    <pre><code class="language-css">/* Slides inherit active theme tokens */
.metric-card {
  background: var(--slide-surface);
  color: var(--slide-text);
  border: 1px solid var(--slide-border);
  border-radius: var(--slide-radius);
  font-family: var(--slide-font-body);
}</code></pre>
  </div>

  <div class="media-col">
    <img
      src="${STUDIO_EDITORIAL_IMG}"
      alt="Architectural studio notebook, fountain pen, and aluminum ruler on linen table"
      class="editorial-img"
    />
    <p class="caption">Every theme token updates typography, borders, and syntax contrast simultaneously.</p>
  </div>
</div>`,
        css: `.split-slide {
  height: 100%;
  padding: var(--slide-padding);
  display: grid;
  grid-template-columns: 1.25fr 0.9fr;
  gap: 44px;
  align-items: center;
}
.eyebrow {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--slide-accent);
}
h1 {
  margin: 0 0 14px;
  font-family: var(--slide-font-display);
  font-size: 40px;
  line-height: 1.12;
  letter-spacing: -0.02em;
}
.desc {
  margin: 0 0 24px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--slide-muted);
}
pre {
  margin: 0;
  border-radius: var(--slide-radius);
  border: 1px solid var(--slide-border);
  overflow: hidden;
  font-size: 15px;
  line-height: 1.65;
}
pre code {
  padding: 24px 26px !important;
  font-family: var(--slide-font-mono) !important;
}
.media-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  justify-content: center;
}
.editorial-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--slide-radius);
  border: 1px solid var(--slide-border);
}
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--slide-muted);
  line-height: 1.5;
}`,
      },
      {
        id: 'slide-6-tailwind-summary',
        title: 'Accessibility & Export — Tailwind Utility Grid',
        transition: 'fade',
        notes:
          'Close by reminding viewers they can press G for Slide Grid, N for Presenter View with Speaker Notes and Timer, or export the entire deck as a single standalone HTML file.',
        html: `<div class="h-full flex flex-col justify-between p-16">
  <div class="max-w-3xl">
    <p class="text-sm font-semibold mb-3" style="color: var(--slide-accent);">06 &middot; Ready for Every Room</p>
    <h1 class="text-5xl font-bold tracking-tight leading-tight mb-4" style="font-family: var(--slide-font-display);">
      Responsive, Accessible, and Portable by Design
    </h1>
    <p class="text-lg leading-relaxed" style="color: var(--slide-muted);">
      Built with Tailwind CSS support, live WCAG contrast verification, full keyboard control, and single-file standalone HTML export.
    </p>
  </div>

  <div class="grid grid-cols-3 gap-6 my-8">
    <div class="p-7 border flex flex-col gap-3" style="background: var(--slide-surface); border-color: var(--slide-border); border-radius: var(--slide-radius);">
      <i data-lucide="keyboard" style="width: 24px; height: 24px; color: var(--slide-accent);"></i>
      <h3 class="text-xl font-semibold">Keyboard &amp; Screen Reader</h3>
      <p class="text-sm leading-relaxed" style="color: var(--slide-muted);">
        Navigate with arrows, press G for grid overview, N for presenter notes, and B for blackout.
      </p>
    </div>

    <div class="p-7 border flex flex-col gap-3" style="background: var(--slide-surface); border-color: var(--slide-border); border-radius: var(--slide-radius);">
      <i data-lucide="palette" style="width: 24px; height: 24px; color: var(--slide-accent);"></i>
      <h3 class="text-xl font-semibold">Custom Theme Engine</h3>
      <p class="text-sm leading-relaxed" style="color: var(--slide-muted);">
        Create reusable visual systems with real-time WCAG AA/AAA contrast checking.
      </p>
    </div>

    <div class="p-7 border flex flex-col gap-3" style="background: var(--slide-surface); border-color: var(--slide-border); border-radius: var(--slide-radius);">
      <i data-lucide="download" style="width: 24px; height: 24px; color: var(--slide-accent);"></i>
      <h3 class="text-xl font-semibold">Standalone HTML Export</h3>
      <p class="text-sm leading-relaxed" style="color: var(--slide-muted);">
        Download a self-contained presentation file you can open in any browser or commit to Git.
      </p>
    </div>
  </div>

  <div class="pt-5 border-t flex items-center justify-between text-sm" style="border-color: var(--slide-border); color: var(--slide-muted);">
    <span>Slideino &middot; Open HTML Presentation Studio</span>
    <span style="font-family: var(--slide-font-mono);">Press G for Grid &middot; N for Presenter View</span>
  </div>
</div>`,
        css: '',
      },
    ],
  };
}

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  {
    id: 'tpl-blank',
    name: 'Blank Canvas',
    summary: 'Clean starter container inheriting active theme variables.',
    html: `<div class="slide-root">
  <h1>Untitled Slide</h1>
  <p>Paste your AI-generated HTML here or edit directly in the inspector.</p>
</div>`,
    css: `.slide-root {
  height: 100%;
  padding: var(--slide-padding);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}
h1 {
  margin: 0;
  font-family: var(--slide-font-display);
  font-size: 48px;
}
p {
  margin: 0;
  font-size: 20px;
  color: var(--slide-muted);
}`,
    notes: '',
  },
  {
    id: 'tpl-hero',
    name: 'Statement Hero',
    summary: 'Bold typographic opening slide with subtle footer metadata.',
    html: `<div class="statement">
  <span class="kicker">Section Overview</span>
  <h1>A Clear Thesis Drives Every Great Presentation</h1>
  <p class="sub">Concise supporting context framed with generous whitespace and disciplined contrast.</p>
  <div class="rule"></div>
</div>`,
    css: `.statement {
  height: 100%;
  padding: var(--slide-padding);
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 960px;
  gap: 20px;
}
.kicker {
  font-size: 14px;
  font-weight: 600;
  color: var(--slide-accent);
}
h1 {
  margin: 0;
  font-family: var(--slide-font-display);
  font-size: 56px;
  line-height: 1.08;
  letter-spacing: -0.02em;
}
.sub {
  margin: 0;
  font-size: 22px;
  color: var(--slide-muted);
  line-height: 1.55;
}
.rule {
  width: 72px;
  height: 3px;
  background: var(--slide-accent);
  margin-top: 12px;
}`,
    notes: 'Introduce the core thesis of this section.',
  },
  {
    id: 'tpl-two-col',
    name: 'Two-Column Comparison',
    summary: 'Balanced side-by-side comparison cards for trade-offs or before/after.',
    html: `<div class="compare">
  <div>
    <span class="kicker">Strategic Comparison</span>
    <h1>Legacy Decks vs. Web-Native Slides</h1>
  </div>
  <div class="cols">
    <div class="panel">
      <h3>Traditional Slide Files</h3>
      <ul>
        <li>Static screenshots of charts and equations</li>
        <li>Proprietary binary formats incompatible with Git</li>
        <li>Manual re-formatting for every aspect ratio</li>
      </ul>
    </div>
    <div class="panel highlight">
      <h3>Slideino HTML Slides</h3>
      <ul>
        <li>Interactive Chart.js, Mermaid, KaTeX, and D3 visuals</li>
        <li>Plain-text HTML/CSS ready for AI iteration and Git diffs</li>
        <li>Instant theme switching with WCAG contrast validation</li>
      </ul>
    </div>
  </div>
</div>`,
    css: `.compare {
  height: 100%;
  padding: var(--slide-padding);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 32px;
}
.kicker { font-size: 14px; font-weight: 600; color: var(--slide-accent); display: block; margin-bottom: 8px; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 42px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.panel { padding: 32px; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); }
.panel.highlight { border-color: var(--slide-accent); }
.panel h3 { margin: 0 0 18px; font-size: 22px; }
.panel ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 14px; color: var(--slide-muted); line-height: 1.5; }`,
    notes: 'Walk through the three core advantages on the right.',
  },
  {
    id: 'tpl-metrics',
    name: 'Key Metrics Grid',
    summary: 'Three large tabular metrics with concise narrative captions.',
    html: `<div class="metrics-slide">
  <div>
    <span class="kicker">Impact Summary</span>
    <h1>Measured Outcomes Over Six Months</h1>
  </div>
  <div class="stats">
    <div class="stat">
      <div class="num">3.4&times;</div>
      <div class="lbl">Faster Deck Authoring</div>
      <p>Direct HTML paste from AI workflows eliminates manual layout rebuilds.</p>
    </div>
    <div class="stat">
      <div class="num">100%</div>
      <div class="lbl">Keyboard Accessible</div>
      <p>Screen reader announcements, reduced motion, and AAA theme options.</p>
    </div>
    <div class="stat">
      <div class="num">0 KB</div>
      <div class="lbl">Vendor Lock-In</div>
      <p>Export self-contained HTML or portable JSON whenever you need.</p>
    </div>
  </div>
</div>`,
    css: `.metrics-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 40px; }
.kicker { font-size: 14px; font-weight: 600; color: var(--slide-accent); display: block; margin-bottom: 8px; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 44px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.stat { padding: 32px; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); }
.num { font-family: var(--slide-font-mono); font-variant-numeric: tabular-nums; font-size: 52px; font-weight: 700; color: var(--slide-accent); line-height: 1.05; margin-bottom: 12px; }
.lbl { font-size: 18px; font-weight: 600; margin-bottom: 10px; }
.stat p { margin: 0; font-size: 15px; color: var(--slide-muted); line-height: 1.55; }`,
    notes: 'Highlight each metric and its supporting evidence.',
  },
];
