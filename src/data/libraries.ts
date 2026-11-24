import { LibraryConfig, LibraryDefinition } from '../types/slideino';

export const DEFAULT_LIBRARIES: LibraryConfig = {
  tailwind: true,
  revealjs: true,
  katex: true,
  mermaid: true,
  chartjs: true,
  highlightjs: true,
  lucide: true,
  gsap: true,
  fontawesome: false,
  animatecss: true,
  d3: false,
};

export const LIBRARY_CATALOG: LibraryDefinition[] = [
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    version: '3.4 Runtime',
    category: 'styling',
    description:
      'Utility-first CSS runtime so pasted AI slides using Tailwind flex, grid, spacing, and typography classes render accurately.',
    usageHint: '<div class="grid grid-cols-3 gap-6 p-12">',
    exampleTitle: 'Tailwind Utility Grid',
    exampleHtml: `<div class="h-full flex flex-col justify-between p-14">
  <div>
    <p class="text-sm font-medium tracking-wide opacity-70 mb-3">Responsive Utility Layout</p>
    <h1 class="text-5xl font-bold tracking-tight leading-tight max-w-3xl">
      Compose complex layouts with zero stylesheet friction
    </h1>
  </div>
  <div class="grid grid-cols-3 gap-6 mt-10">
    <div class="p-6 rounded-xl border" style="background: var(--slide-surface); border-color: var(--slide-border);">
      <p class="text-xs font-mono opacity-60 mb-2">01. Layout</p>
      <h3 class="text-xl font-semibold mb-2">Fluid CSS Grid</h3>
      <p class="text-sm opacity-75 leading-relaxed">Auto-fitting columns adapt cleanly to 16:9, 4:3, and mobile screens.</p>
    </div>
    <div class="p-6 rounded-xl border" style="background: var(--slide-surface); border-color: var(--slide-border);">
      <p class="text-xs font-mono opacity-60 mb-2">02. Tokens</p>
      <h3 class="text-xl font-semibold mb-2">Theme Inheritance</h3>
      <p class="text-sm opacity-75 leading-relaxed">Combine Tailwind utilities with Slideino CSS custom properties.</p>
    </div>
    <div class="p-6 rounded-xl border" style="background: var(--slide-surface); border-color: var(--slide-border);">
      <p class="text-xs font-mono opacity-60 mb-2">03. Contrast</p>
      <h3 class="text-xl font-semibold mb-2">Accessible Defaults</h3>
      <p class="text-sm opacity-75 leading-relaxed">High-legibility typography and clean spacing out of the box.</p>
    </div>
  </div>
</div>`,
    exampleCss: '',
    exampleNotes: 'Demonstrates Tailwind CSS runtime classes working alongside Slideino theme variables.',
  },
  {
    id: 'revealjs',
    name: 'Reveal.js Compat',
    version: '5.x Layout',
    category: 'styling',
    description:
      'Supports Reveal.js decks and layout classes (.r-hstack, .r-vstack, .r-stack, .r-fit-text, .fragment) and auto-splits imported Reveal.js <section> slides with speaker notes.',
    usageHint: '<section class="r-vstack"><h1 class="r-fit-text">...</h1><div class="fragment">',
    exampleTitle: 'Reveal.js Layout & Fragments',
    exampleHtml: `<section class="reveal-demo r-vstack">
  <p class="kicker">Reveal.js Compatibility</p>
  <h1 class="r-fit-text">Built for Reveal.js Decks</h1>
  <div class="r-hstack cards">
    <div class="card fragment fade-up">
      <i data-lucide="layout-template" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <h3>Layout Helpers</h3>
      <p>Use <code>.r-hstack</code>, <code>.r-vstack</code>, <code>.r-stack</code>, and <code>.r-fit-text</code> out of the box.</p>
    </div>
    <div class="card fragment fade-up">
      <i data-lucide="layers" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <h3>Smart Deck Import</h3>
      <p>Paste any Reveal.js HTML deck to split horizontal &amp; vertical <code>&lt;section&gt;</code> slides automatically.</p>
    </div>
    <div class="card fragment fade-up">
      <i data-lucide="notebook-pen" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <h3>Speaker Notes</h3>
      <p>Any <code>&lt;aside class="notes"&gt;</code> tag is extracted straight into Presenter Notes.</p>
    </div>
  </div>
</section>`,
    exampleCss: `.reveal-demo { height: 100%; padding: var(--slide-padding); gap: 24px; align-items: stretch; justify-content: center; }
.kicker { margin: 0; font-size: 14px; font-weight: 600; color: var(--slide-accent); }
.reveal-demo h1 { margin: 0; font-family: var(--slide-font-display); font-weight: 700; line-height: 1.08; }
.cards { gap: 20px; align-items: stretch; margin-top: 12px; }
.card { flex: 1; padding: 26px; border-radius: var(--slide-radius); background: var(--slide-surface); border: 1px solid var(--slide-border); display: flex; flex-direction: column; gap: 12px; }
.card h3 { margin: 0; font-size: 20px; font-weight: 600; }
.card p { margin: 0; font-size: 15px; color: var(--slide-muted); line-height: 1.6; }
.card code { font-family: var(--slide-font-mono); font-size: 13px; color: var(--slide-accent); }`,
    exampleNotes: 'Reveal.js layout helpers, fragments, and <aside class="notes"> work seamlessly in Slideino.',
  },
  {
    id: 'mermaid',
    name: 'Mermaid.js',
    version: '11.x',
    category: 'diagrams',
    description:
      'Automatically renders flowcharts, sequence diagrams, Gantt charts, entity-relationship graphs, and architecture maps.',
    usageHint: '<div class="mermaid">graph LR; A-->B;</div>',
    exampleTitle: 'Mermaid Architecture Flow',
    exampleHtml: `<div class="slide-shell">
  <div class="slide-header">
    <span class="kicker">Diagram Engine</span>
    <h1>Automated Rendering Pipeline</h1>
  </div>
  <div class="diagram-stage">
    <div class="mermaid">
flowchart LR
    A[AI Prompt & HTML] --> B{Slideino Parser}
    B --> C[Theme CSS Tokens]
    B --> D[Library Runtime]
    C --> E[Sandboxed Stage]
    D --> E
    E --> F[Live Presentation]
    E --> G[Standalone HTML]
    </div>
  </div>
</div>`,
    exampleCss: `.slide-shell { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: space-between; }
.kicker { font-size: 14px; font-weight: 500; color: var(--slide-accent); display: block; margin-bottom: 10px; }
h1 { font-family: var(--slide-font-display); font-size: 46px; font-weight: 700; margin: 0; line-height: 1.15; }
.diagram-stage { flex: 1; display: flex; align-items: center; justify-content: center; margin-top: 28px; padding: 32px; border-radius: var(--slide-radius); background: var(--slide-surface); border: 1px solid var(--slide-border); }
.mermaid { width: 100%; display: flex; justify-content: center; }`,
    exampleNotes: 'Mermaid diagrams automatically adapt to light and dark themes inside the sandbox.',
  },
  {
    id: 'katex',
    name: 'KaTeX Math',
    version: '0.16',
    category: 'math-code',
    description:
      'Fast LaTeX equation typesetting supporting inline ($x^2$) and block ($$...$$) scientific and financial formulas.',
    usageHint: '$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$',
    exampleTitle: 'KaTeX Equations',
    exampleHtml: `<div class="math-slide">
  <p class="eyebrow">Mathematical Typesetting</p>
  <h1>Attention &amp; Information Entropy</h1>
  <div class="formula-grid">
    <div class="formula-box">
      <span class="label">Scaled Dot-Product Attention</span>
      <div class="eq">$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$</div>
    </div>
    <div class="formula-box">
      <span class="label">Shannon Information Entropy</span>
      <div class="eq">$$H(X) = -\\sum_{i=1}^{n} P(x_i) \\log_2 P(x_i)$$</div>
    </div>
  </div>
</div>`,
    exampleCss: `.math-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 24px; }
.eyebrow { margin: 0; font-size: 14px; color: var(--slide-accent); font-weight: 600; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 46px; line-height: 1.12; }
.formula-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 12px; }
.formula-box { background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); padding: 28px 36px; }
.label { font-size: 13px; color: var(--slide-muted); display: block; margin-bottom: 14px; }
.eq { font-size: 26px; }`,
    exampleNotes: 'KaTeX auto-renders both inline and display equations without layout flicker.',
  },
  {
    id: 'chartjs',
    name: 'Chart.js',
    version: '4.4',
    category: 'diagrams',
    description:
      'Interactive canvas charts (bar, line, doughnut, radar, scatter) powered by inline scripts or declarative canvas blocks.',
    usageHint: 'new Chart(ctx, { type: "bar", data: ... })',
    exampleTitle: 'Chart.js Visualization',
    exampleHtml: `<div class="chart-slide">
  <div class="top-row">
    <div>
      <p class="kicker">Quarterly Performance</p>
      <h1>ARR Growth Trajectory</h1>
    </div>
    <div class="metric">
      <span class="value">$4.82M</span>
      <span class="sub">Q4 Projected Run Rate</span>
    </div>
  </div>
  <div class="canvas-wrap">
    <canvas id="demoChart"></canvas>
  </div>
</div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('demoChart');
    if (!el || typeof Chart === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--slide-accent').trim() || '#2563eb';
    const text = cs.getPropertyValue('--slide-text').trim() || '#0f172a';
    const border = cs.getPropertyValue('--slide-border').trim() || '#e2e8f0';
    new Chart(el, {
      type: 'bar',
      data: {
        labels: ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26'],
        datasets: [{
          label: 'ARR ($M)',
          data: [1.4, 1.9, 2.5, 3.1, 3.9, 4.82],
          backgroundColor: accent,
          borderRadius: 6,
          barPercentage: 0.55
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: text, font: { size: 14 } } },
          y: { grid: { color: border }, ticks: { color: text, font: { size: 14 } } }
        }
      }
    });
  });
</script>`,
    exampleCss: `.chart-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; gap: 28px; }
.top-row { display: flex; justify-content: space-between; align-items: flex-end; }
.kicker { margin: 0 0 8px; font-size: 14px; color: var(--slide-accent); font-weight: 600; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 44px; line-height: 1.1; }
.metric { text-align: right; }
.value { display: block; font-family: var(--slide-font-mono); font-size: 40px; font-weight: 700; color: var(--slide-accent); }
.sub { font-size: 13px; color: var(--slide-muted); }
.canvas-wrap { flex: 1; min-height: 0; padding: 24px; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); }`,
    exampleNotes: 'Chart.js dynamically reads your active Slideino theme accent and border variables.',
  },
  {
    id: 'highlightjs',
    name: 'Highlight.js',
    version: '11.10',
    category: 'math-code',
    description:
      'Automatic syntax highlighting for 190+ programming languages inside standard <pre><code> blocks.',
    usageHint: '<pre><code class="language-ts">...</code></pre>',
    exampleTitle: 'Syntax-Highlighted Code',
    exampleHtml: `<div class="code-slide">
  <p class="kicker">Code Walkthrough</p>
  <h1>Zero-Allocation Stream Parser</h1>
  <pre><code class="language-typescript">export async function* streamSlides(source: ReadableStream&lt;string&gt;) {
  let buffer = '';
  for await (const chunk of source) {
    buffer += chunk;
    const parts = buffer.split('\\n---\\n');
    buffer = parts.pop() ?? '';
    for (const slide of parts) {
      yield slide.trim();
    }
  }
  if (buffer.trim()) yield buffer.trim();
}</code></pre>
</div>`,
    exampleCss: `.code-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 20px; }
.kicker { margin: 0; font-size: 14px; color: var(--slide-accent); font-weight: 600; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 42px; }
pre { margin: 0; border-radius: var(--slide-radius); overflow: hidden; border: 1px solid var(--slide-border); font-size: 18px; line-height: 1.65; }
pre code { padding: 28px 32px !important; font-family: var(--slide-font-mono) !important; }`,
    exampleNotes: 'Highlight.js automatically picks a light or dark color scheme based on the active theme.',
  },
  {
    id: 'lucide',
    name: 'Lucide Icons',
    version: '0.460',
    category: 'icons-motion',
    description:
      'Crisp, consistent stroke-based SVG icon set initialized automatically for any <i data-lucide="..."> element.',
    usageHint: '<i data-lucide="layers" class="w-6 h-6"></i>',
    exampleTitle: 'Lucide Icon Feature Grid',
    exampleHtml: `<div class="icon-slide">
  <h1>Built for Crisp Visual Signifiers</h1>
  <div class="grid-3">
    <div class="cell">
      <i data-lucide="layers" style="width:28px;height:28px;color:var(--slide-accent);"></i>
      <h3>Modular Layers</h3>
      <p>Clean vector icons scale without pixelation on 4K displays.</p>
    </div>
    <div class="cell">
      <i data-lucide="shield-check" style="width:28px;height:28px;color:var(--slide-accent);"></i>
      <h3>Sandboxed Runtime</h3>
      <p>Every slide runs inside an isolated iframe boundary.</p>
    </div>
    <div class="cell">
      <i data-lucide="accessibility" style="width:28px;height:28px;color:var(--slide-accent);"></i>
      <h3>Keyboard Native</h3>
      <p>Full arrow navigation, presenter notes, and contrast checks.</p>
    </div>
  </div>
</div>`,
    exampleCss: `.icon-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 36px; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 44px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.cell { padding: 28px; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); display: flex; flex-direction: column; gap: 14px; }
.cell h3 { margin: 0; font-size: 20px; font-weight: 600; }
.cell p { margin: 0; font-size: 15px; color: var(--slide-muted); line-height: 1.6; }`,
    exampleNotes: 'Lucide automatically replaces data-lucide attributes with inline SVG icons.',
  },
  {
    id: 'gsap',
    name: 'GSAP',
    version: '3.12',
    category: 'icons-motion',
    description:
      'Industry-standard JavaScript animation engine for precision timelines, staggered card entrances, morphing counters, and smooth 60fps slide choreography.',
    usageHint: "gsap.from('.card', { y: 24, opacity: 0, stagger: 0.1 })",
    exampleTitle: 'GSAP Choreographed Motion',
    exampleHtml: `<div class="gsap-slide">
  <div class="gsap-head">
    <p class="kicker">GSAP 3.12 Timeline</p>
    <h1>Precision Motion Choreography</h1>
    <p class="lead">Staggered timelines, spring eases, and animated counters run smoothly at 60fps—and auto-settle in thumbnails.</p>
  </div>
  <div class="gsap-grid">
    <div class="gsap-card">
      <i data-lucide="gauge" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <span class="kpi" data-target="60" data-suffix=" fps">60 fps</span>
      <span class="lbl">GPU-Accelerated Tweens</span>
    </div>
    <div class="gsap-card">
      <i data-lucide="sparkles" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <span class="kpi" data-target="120" data-suffix=" ms">120 ms</span>
      <span class="lbl">Stagger Cadence</span>
    </div>
    <div class="gsap-card">
      <i data-lucide="layers" style="width:24px;height:24px;color:var(--slide-accent);"></i>
      <span class="kpi" data-target="100" data-suffix="%">100%</span>
      <span class="lbl">Timeline Control</span>
    </div>
  </div>
</div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap === 'undefined') return;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.gsap-head > *', { y: 20, opacity: 0, duration: 0.55, stagger: 0.09 })
      .from('.gsap-card', { y: 28, opacity: 0, scale: 0.96, duration: 0.6, stagger: 0.12 }, '-=0.25');
    document.querySelectorAll('.kpi').forEach((el) => {
      const target = Number(el.getAttribute('data-target') || 0);
      const suffix = el.getAttribute('data-suffix') || '';
      const obj = { val: 0 };
      gsap.to(obj, {
        val: target,
        duration: 0.95,
        delay: 0.25,
        ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(obj.val) + suffix; }
      });
    });
  });
</script>`,
    exampleCss: `.gsap-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 36px; }
.gsap-head { max-width: 820px; display: flex; flex-direction: column; gap: 12px; }
.kicker { margin: 0; font-size: 14px; font-weight: 600; color: var(--slide-accent); }
.gsap-head h1 { margin: 0; font-family: var(--slide-font-display); font-size: 48px; line-height: 1.1; }
.lead { margin: 0; font-size: 18px; color: var(--slide-muted); line-height: 1.55; }
.gsap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.gsap-card { padding: 28px; border-radius: var(--slide-radius); background: var(--slide-surface); border: 1px solid var(--slide-border); display: flex; flex-direction: column; gap: 10px; }
.kpi { font-family: var(--slide-font-mono); font-size: 40px; font-weight: 700; color: var(--slide-text); font-variant-numeric: tabular-nums; }
.lbl { font-size: 14px; color: var(--slide-muted); }`,
    exampleNotes: 'GSAP timelines animate entrances cleanly in Presentation Mode and automatically jump to their final state in thumbnails and reduced-motion mode.',
  },
  {
    id: 'fontawesome',
    name: 'Font Awesome 6',
    version: '6.6 Free',
    category: 'icons-motion',
    description:
      'Classic icon font library frequently referenced by AI HTML generators using <i class="fa-solid fa-..."> markup.',
    usageHint: '<i class="fa-solid fa-compass"></i>',
    exampleTitle: 'Font Awesome Icons',
    exampleHtml: `<div class="fa-slide">
  <h1>Font Awesome 6 Compatibility</h1>
  <p class="lead">Legacy and AI-generated HTML templates using <code>fa-solid</code> classes work without edits.</p>
  <div class="row">
    <div class="item"><i class="fa-solid fa-compass"></i><span>Navigation</span></div>
    <div class="item"><i class="fa-solid fa-chart-line"></i><span>Analytics</span></div>
    <div class="item"><i class="fa-solid fa-code"></i><span>Engineering</span></div>
    <div class="item"><i class="fa-solid fa-globe"></i><span>Global Scale</span></div>
  </div>
</div>`,
    exampleCss: `.fa-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 24px; }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 44px; }
.lead { margin: 0; font-size: 18px; color: var(--slide-muted); }
.row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 16px; }
.item { padding: 28px 20px; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); display: flex; flex-direction: column; align-items: center; gap: 14px; font-weight: 600; }
.item i { font-size: 28px; color: var(--slide-accent); }`,
    exampleNotes: 'Enable Font Awesome whenever your AI-generated slides rely on fa-solid or fa-regular icons.',
  },
  {
    id: 'animatecss',
    name: 'Animate.css',
    version: '4.1',
    category: 'icons-motion',
    description:
      'Drop-in CSS entrance animations (fadeInUp, fadeIn, zoomIn) that automatically honor prefers-reduced-motion.',
    usageHint: '<h1 class="animate__animated animate__fadeInUp">',
    exampleTitle: 'Choreographed Entrance',
    exampleHtml: `<div class="anim-slide">
  <p class="animate__animated animate__fadeIn kicker">Motion System</p>
  <h1 class="animate__animated animate__fadeInUp">Restrained, Intentional Choreography</h1>
  <p class="animate__animated animate__fadeInUp animate__delay-1s sub">
    Entrance curves settle briskly and automatically disable when the viewer prefers reduced motion.
  </p>
</div>`,
    exampleCss: `.anim-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; max-width: 900px; gap: 18px; }
.kicker { margin: 0; font-size: 14px; font-weight: 600; color: var(--slide-accent); }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 54px; line-height: 1.1; }
.sub { margin: 0; font-size: 20px; color: var(--slide-muted); line-height: 1.6; }`,
    exampleNotes: 'Animate.css works seamlessly with Slideino accessibility media queries.',
  },
  {
    id: 'd3',
    name: 'D3.js',
    version: '7.9',
    category: 'diagrams',
    description:
      'Data-driven SVG visualization engine for custom geographic maps, treemaps, network graphs, and scientific plots.',
    usageHint: 'd3.select("#viz").append("svg")',
    exampleTitle: 'D3.js Custom SVG Plot',
    exampleHtml: `<div class="d3-slide">
  <div>
    <p class="kicker">D3.js Data Visualization</p>
    <h1>Latency Distribution by Region</h1>
  </div>
  <div id="d3-target" class="viz-box"></div>
</div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof d3 === 'undefined') return;
    const data = [
      { region: 'US-East', ms: 18 },
      { region: 'EU-Central', ms: 24 },
      { region: 'AP-Tokyo', ms: 31 },
      { region: 'US-West', ms: 21 },
      { region: 'SA-East', ms: 42 }
    ];
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--slide-accent').trim() || '#2563eb';
    const text = cs.getPropertyValue('--slide-text').trim() || '#0f172a';
    const svg = d3.select('#d3-target').append('svg').attr('viewBox', '0 0 900 320').style('width', '100%').style('height', '100%');
    const x = d3.scaleBand().domain(data.map(d => d.region)).range([60, 860]).padding(0.35);
    const y = d3.scaleLinear().domain([0, 50]).range([260, 30]);
    svg.selectAll('rect').data(data).join('rect')
      .attr('x', d => x(d.region)).attr('y', d => y(d.ms))
      .attr('width', x.bandwidth()).attr('height', d => 260 - y(d.ms))
      .attr('rx', 6).attr('fill', accent);
    svg.selectAll('text.lbl').data(data).join('text').attr('class', 'lbl')
      .attr('x', d => x(d.region) + x.bandwidth() / 2).attr('y', 290)
      .attr('text-anchor', 'middle').attr('fill', text).attr('font-size', 15).text(d => d.region);
    svg.selectAll('text.val').data(data).join('text').attr('class', 'val')
      .attr('x', d => x(d.region) + x.bandwidth() / 2).attr('y', d => y(d.ms) - 10)
      .attr('text-anchor', 'middle').attr('fill', text).attr('font-size', 15).attr('font-weight', 600).text(d => d.ms + ' ms');
  });
</script>`,
    exampleCss: `.d3-slide { height: 100%; padding: var(--slide-padding); display: flex; flex-direction: column; gap: 28px; }
.kicker { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--slide-accent); }
h1 { margin: 0; font-family: var(--slide-font-display); font-size: 44px; }
.viz-box { flex: 1; background: var(--slide-surface); border: 1px solid var(--slide-border); border-radius: var(--slide-radius); padding: 24px; }`,
    exampleNotes: 'D3.js enables bespoke SVG charts, maps, and interactive data visualisations.',
  },
];
