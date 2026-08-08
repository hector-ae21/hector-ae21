/**
 * The strip above everything else. It carries no name and no job title: GitHub
 * prints both in the sidebar immediately to its left, and spending the one image
 * everybody sees first on a repeat of the two lines beside it is a waste of the
 * best space on the page.
 *
 * What it shows instead is the spread of the work — one chip per facet, so no
 * single thing stands in for the whole account. A drawing of exactly one idea
 * makes a good illustration and a bad banner: it announces that this person does
 * that, and by omission that they do nothing else.
 *
 * It moves, and it moves in CSS. An SVG loaded through <img> runs declarative
 * animation but no script, which is the whole reason this can breathe at all on
 * a page that cannot execute anything. Everything honours prefers-reduced-motion.
 *
 * Unlike the charts, this loop never ends: here the movement is texture rather
 * than a value being revealed, so there is nothing for it to finish saying.
 */

import { Drawing } from "./drawing.mjs";

/** Each glyph is drawn on a 24×24 box, stroked and never filled, so the parent
 *  group sets colour and weight once for all of them. */
export const GLYPHS = {
  braces: `<path d="M9.2,3 C6.7,3 6.7,5.2 6.7,7.2 C6.7,10 4.6,10.6 4.6,12 C4.6,13.4 6.7,14 6.7,16.8 C6.7,18.8 6.7,21 9.2,21"/>
<path d="M14.8,3 C17.3,3 17.3,5.2 17.3,7.2 C17.3,10 19.4,10.6 19.4,12 C19.4,13.4 17.3,14 17.3,16.8 C17.3,18.8 17.3,21 14.8,21"/>`,
  package: `<path d="M12,2.8 L20.3,7.2 V16.8 L12,21.2 L3.7,16.8 V7.2 Z"/>
<path d="M3.7,7.2 L12,11.6 L20.3,7.2"/><path d="M12,11.6 V21.2"/>`,
  database: `<ellipse cx="12" cy="6.4" rx="7.6" ry="3.4"/>
<path d="M4.4,6.4 V17.6 C4.4,19.5 7.8,21 12,21 C16.2,21 19.6,19.5 19.6,17.6 V6.4"/>
<path d="M4.4,12 C4.4,13.9 7.8,15.4 12,15.4 C16.2,15.4 19.6,13.9 19.6,12"/>`,
  shield: `<path d="M12,2.6 L20,5.9 V12.1 C20,16.7 16.6,20 12,21.4 C7.4,20 4,16.7 4,12.1 V5.9 Z"/>`,
  cap: `<path d="M12,3.4 L22,8.3 L12,13.2 L2,8.3 Z"/>
<path d="M6.4,10.4 V16 C6.4,16 8.6,18.6 12,18.6 C15.4,18.6 17.6,16 17.6,16 V10.4"/>
<path d="M20.6,9.6 V15.2"/>`,
  flask: `<path d="M9.6,3 V9.4 L4.6,17.9 C3.8,19.3 4.8,21 6.4,21 H17.6 C19.2,21 20.2,19.3 19.4,17.9 L14.4,9.4 V3"/>
<path d="M8,3 H16"/><path d="M6.7,15.6 H17.3"/>`,
};

const W = 1060;
const H = 168;
const CHIP = 46;
/** A small stagger rather than a straight row: a level line of icons reads as a
 *  toolbar, and this is not a list of buttons. */
const WAVE = [8, -6, 12, -10, 6, -4];

export class Banner extends Drawing {
  constructor(theme, facets) {
    super(theme);
    this.facets = facets;
  }

  render() {
    const th = this.theme;
    const n = this.facets.length;
    const xs = this.facets.map((_, i) => 120 + (n > 1 ? (i * (W - 240)) / (n - 1) : (W - 240) / 2));
    const ys = this.facets.map((_, i) => 80 + WAVE[i % WAVE.length]);

    return this.canvas(W, H, `<defs>
<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1.3" cy="1.3" r="1.3" fill="${th.muted}"/></pattern>
</defs>
${this.#style()}
<rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.16"/>
${this.#thread(xs, ys)}
${this.#chips(xs, ys)}`);
  }

  #style() {
    return `<style>
.chip{animation:bob 6.5s ease-in-out var(--d,0s) infinite}
.halo{opacity:.05;animation:pulse 6.5s ease-in-out var(--d,0s) infinite}
.flow{animation:flow 4.2s linear infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes pulse{0%,100%{opacity:.04}50%{opacity:.17}}
@keyframes flow{to{stroke-dashoffset:-260}}
@media (prefers-reduced-motion:reduce){.chip,.halo,.flow{animation:none}}
</style>`;
  }

  /** Horizontal tangents at every chip, so the thread through them is a wave and
   *  not a zigzag of straight segments meeting at corners. The pulse is a second
   *  copy of the same path, dashed and sliding. */
  #thread(xs, ys) {
    const th = this.theme;
    const d = `M${xs[0]},${ys[0]} ` + xs.slice(1).map((x, i) => {
      const dx = (x - xs[i]) * 0.45;
      return `C${xs[i] + dx},${ys[i]} ${x - dx},${ys[i + 1]} ${x},${ys[i + 1]}`;
    }).join(" ");

    return `<path d="${d}" fill="none" stroke="${th.axis}" stroke-width="1.6"/>
<path class="flow" d="${d}" fill="none" stroke="${th.brand}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="20 240"/>`;
  }

  #chips(xs, ys) {
    const th = this.theme;
    const half = CHIP / 2;

    return this.facets.map((facet, i) => {
      const cx = xs[i], cy = ys[i];
      // Negative delays put each chip at a different point of the same loop, so
      // they drift out of phase instead of bobbing in unison.
      return `<g class="chip" style="--d:${(-i * 0.9).toFixed(1)}s">
<rect class="halo" x="${cx - 31}" y="${cy - 31}" width="62" height="62" rx="19" fill="${th.brand}"/>
<rect x="${cx - half}" y="${cy - half}" width="${CHIP}" height="${CHIP}" rx="13" fill="${th.brandSoft}" stroke="${th.brand}" stroke-opacity="0.4" stroke-width="1.2"/>
<g transform="translate(${cx - 12},${cy - 12})" fill="none" stroke="${th.brand}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[facet.glyph] || ""}</g>
${this.text(cx, cy + 45, facet.label, { size: 10, weight: 600, fill: th.muted, anchor: "middle" })}
</g>`;
    }).join("\n");
  }
}
