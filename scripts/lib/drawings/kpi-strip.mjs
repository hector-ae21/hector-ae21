/**
 * The row of headline figures.
 *
 * A zero is dropped rather than drawn: a tile reading 0 spends the same space as
 * a real figure to say that nothing happened, and this should be a summary, not
 * a scorecard with gaps in it.
 */

import { Drawing, MOTION } from "./drawing.mjs";
import { formatCount } from "../text.mjs";

const W = 1060;
/** H must clear the tallest glyph plus the label: the value sits on a baseline
 *  at y=50 with a 34px face and the label baseline at y=72, so anything under
 *  ~86 clips the numbers top and bottom. */
const H = 86;
const PAD = 4;

export class KpiStrip extends Drawing {
  /** @param tiles [count, label] pairs, in the order they should read. */
  constructor(theme, tiles) {
    super(theme);
    this.tiles = tiles.filter(([count]) => count > 0);
  }

  render() {
    const th = this.theme;
    const cw = (W - PAD * 2) / (this.tiles.length || 1);

    const body = this.tiles.map(([count, label], i) => {
      const cx = PAD + cw * i + cw / 2;
      const divider = i === 0 ? ""
        : `<line x1="${PAD + cw * i}" y1="24" x2="${PAD + cw * i}" y2="${H - 24}" stroke="${th.grid}" stroke-width="1"/>`;
      return `${divider}
<g class="rise" style="${this.delay(i)}">
${this.text(cx, 50, formatCount(count), { size: 34, weight: 700, fill: th.primary, anchor: "middle" })}
${this.text(cx, 72, label.toUpperCase(), { size: 10, weight: 600, fill: th.muted, anchor: "middle" })}
</g>`;
    }).join("\n");

    return this.canvas(W, H, `${MOTION}\n${body}`);
  }
}
