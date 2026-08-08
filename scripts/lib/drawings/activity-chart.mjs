/**
 * Weekly commits over the last year, as a line that draws itself.
 *
 * The series is dense by construction — see the collector — so the quiet
 * stretches are as visible as the busy ones. A chart that only plotted the weeks
 * with activity would squeeze the gaps out and misreport when the work happened.
 */

import { Drawing, MOTION } from "./drawing.mjs";

const W = 1060;
const TICKS = 8;

export class ActivityChart extends Drawing {
  constructor(theme, timeline, title = "") {
    super(theme);
    this.timeline = timeline;
    this.title = title;
  }

  render() {
    const th = this.theme;
    const H = this.title ? 210 : 190;
    const m = { top: this.title ? 38 : 16, right: 8, bottom: 28, left: 40 };
    const head = this.title
      ? this.text(0, 16, this.title, { size: 12, weight: 700, fill: th.primary })
      : "";

    if (this.timeline.length < 2) {
      return this.canvas(W, m.top + 50, `<g>${head}
${this.text(W / 2, m.top + 24, "No data yet", { size: 12, fill: th.muted, anchor: "middle" })}</g>`);
    }

    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const max = Math.max(...this.timeline.map((w) => w.total), 1);
    // Even, with headroom, so the midpoint tick is whole and the peak does not
    // touch the top gridline.
    const niceMax = Math.max(2, Math.ceil((max * 1.1) / 2) * 2);
    const X = (i) => m.left + (i / (this.timeline.length - 1)) * iw;
    const Y = (v) => m.top + ih - (v / niceMax) * ih;

    const line = this.timeline
      .map((w, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(w.total).toFixed(1)}`).join("");
    const area = `${line}L${X(this.timeline.length - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z`;

    return this.canvas(W, H, `${MOTION}
<g>
${head}
${this.#gridlines(m, Y, niceMax)}
<path class="fade" style="--d:.5s" d="${area}" fill="${th.brandSoft}"/>
<path class="draw" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" d="${line}" fill="none" stroke="${th.brand}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
<line x1="${m.left}" y1="${Y(0)}" x2="${W - m.right}" y2="${Y(0)}" stroke="${th.axis}" stroke-width="1"/>
${this.#monthLabels(X, H)}
</g>`);
  }

  #gridlines(m, Y, niceMax) {
    const th = this.theme;
    return [0, niceMax / 2, niceMax].map((v) =>
      `<line x1="${m.left}" y1="${Y(v)}" x2="${W - m.right}" y2="${Y(v)}" stroke="${th.grid}" stroke-width="1"/>
${this.text(m.left - 8, Y(v) + 4, String(Math.round(v)), { size: 10, fill: th.muted, anchor: "end" })}`
    ).join("\n");
  }

  /** Evenly spaced ticks. Labelling every month change instead drops whichever
   *  months fall too close together, which reads as a bug rather than thinning. */
  #monthLabels(X, H) {
    const month = new Intl.DateTimeFormat("en", { month: "short" });
    return Array.from({ length: TICKS }, (_, k) => {
      const i = Math.round((k / (TICKS - 1)) * (this.timeline.length - 1));
      const anchor = k === 0 ? "start" : k === TICKS - 1 ? "end" : "middle";
      return this.text(X(i), H - 8, month.format(new Date(this.timeline[i].week * 1000)),
        { size: 10, fill: this.theme.muted, anchor });
    }).join("\n");
  }
}
