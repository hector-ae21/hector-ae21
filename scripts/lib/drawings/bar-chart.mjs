/**
 * Ranked horizontal bars.
 *
 * Comparing magnitudes, not reading a part-to-whole split, so these are separate
 * bars rather than one stacked bar. That matters with the real data: language
 * shares are heavily skewed, and inside a stacked bar the small classes collapse
 * into slivers narrower than the segment gap — literally invisible. Separate
 * rows give every class a readable bar and a direct label.
 */

import { Drawing, MOTION } from "./drawing.mjs";
import { formatCount } from "../text.mjs";

const ROW_H = 28;
const BAR_H = 11;
const RADIUS = 5;

export class BarChart extends Drawing {
  /**
   * @param items    {name, value}[], already ranked
   * @param unit     "%" for share of the total, anything else for raw counts
   * @param rows     minimum slots to reserve, so two charts side by side match
   * @param labelPct how much of the width the label column may take
   * @param padLeft/padRight  gutter baked into the canvas rather than the page
   */
  constructor(theme, items, {
    unit = "%", title = "", width = 520, labelPct = 0.26,
    rows = 0, padLeft = 0, padRight = 0,
  } = {}) {
    super(theme);
    this.items = items;
    this.unit = unit;
    this.title = title;
    this.width = width;
    this.labelPct = labelPct;
    this.rows = rows;
    this.padLeft = padLeft;
    this.padRight = padRight;
  }

  get #top() {
    return this.title ? 34 : 8;
  }

  get #head() {
    return this.title
      ? this.text(0, 16, this.title, { size: 12, weight: 700, fill: this.theme.primary })
      : "";
  }

  render() {
    return this.items.length ? this.#chart() : this.#empty();
  }

  #empty() {
    const W = this.width, top = this.#top;
    return this.canvas(W + this.padLeft + this.padRight, top + 40,
      `<g transform="translate(${this.padLeft},0)">${this.#head}
${this.text(W / 2, top + 20, "No data yet", { size: 12, fill: this.theme.muted, anchor: "middle" })}</g>`);
  }

  #chart() {
    const th = this.theme;
    const W = this.width, top = this.#top;
    const labelW = Math.round(W * this.labelPct);
    const valueW = Math.round(W * 0.12);
    const trackW = W - labelW - valueW;

    // `rows` reserves a fixed number of slots so two charts sitting side by side
    // in the grid end up the same height. Without it the browser baseline-aligns
    // them and the shorter one visibly sags.
    const slots = Math.max(this.rows, this.items.length);

    const total = this.items.reduce((s, i) => s + i.value, 0) || 1;
    const max = Math.max(...this.items.map((i) => i.value)) || 1;
    const clip = this.#clipper(labelW);

    const body = this.items.map((item, i) => {
      const y = top + i * ROW_H, mid = y + BAR_H / 2;
      // Scaled against the largest value, not the total, so a small class still
      // renders as a bar you can see and compare.
      const w = Math.max(2, (item.value / max) * trackW);
      // Each row starts a beat after the one above, so the chart fills top-down
      // rather than all at once — the order of the ranking is the order it draws.
      const d = this.delay(i);
      return `${this.text(0, mid + 4, clip(this.#label(item)), { size: 11, weight: 600, fill: th.primary })}
<rect x="${labelW}" y="${y}" width="${trackW}" height="${BAR_H}" rx="${RADIUS}" fill="${th.grid}"/>
<rect class="bar" style="${d}" x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${BAR_H}" rx="${RADIUS}" fill="${th.brand}"/>
<g class="fade" style="${d}">${this.text(W, mid + 4, this.#value(item, total), { size: 11, fill: th.secondary, anchor: "end" })}</g>`;
    }).join("\n");

    // Horizontal breathing room is baked into the canvas rather than added
    // between the images in markdown: the only separator that survives GitHub's
    // sanitiser is a run of &nbsp;, whose width depends on the reader's font.
    // Padding here is measured in the chart's own units and scales with it.
    return this.canvas(W + this.padLeft + this.padRight, top + slots * ROW_H + 6,
      `${MOTION}\n<g transform="translate(${this.padLeft},0)">\n${this.#head}\n${body}\n</g>`);
  }

  /** Labels are clipped to what actually fits: a long repository name at 11px
   *  would otherwise run straight under its own bar. */
  #clipper(labelW) {
    const maxChars = Math.max(6, Math.floor((labelW - 8) / 6.1));
    return (s) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
  }

  #label(item) {
    return item.name === "__other__" ? "Other" : item.name;
  }

  #value(item, total) {
    return this.unit === "%"
      ? `${((item.value / total) * 100).toFixed(1)}%`
      : formatCount(item.value);
  }
}
