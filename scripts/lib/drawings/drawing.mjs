/**
 * Base class for everything drawn as SVG, plus the animation every chart shares.
 *
 * A subclass implements render() and gets a canvas, a text primitive and the
 * palette. Nothing here knows what it is drawing; the size and the shapes belong
 * to the subclass, and the wrapper, the background and the motion do not.
 */

import { FONT } from "../theme.mjs";
import { escapeXml } from "../text.mjs";

/**
 * Every chart draws itself once when the image loads: bars grow from their own
 * left edge, the activity line draws itself end to end, tiles rise into place.
 * It runs once and holds — this is a page being read, not a dashboard being
 * watched, and a loop would keep pulling the eye back to a number that has not
 * changed.
 *
 * All of it is CSS inside the SVG, because an SVG loaded through <img> runs
 * declarative animation and no script. Two details make it work rather than
 * merely play:
 *
 *  - `both` as fill-mode. Without it a staggered bar would flash at full width
 *    during its delay and then snap back to zero to start.
 *  - `pathLength="1"` on the activity line. It renormalises the path so a dash
 *    of 1 covers it exactly, whatever its real length, and the reveal is a
 *    single offset from 1 to 0 with no measuring.
 *
 * The reduced-motion block has to restate the finished values, not just switch
 * the animation off: the resting state of a bar is scaleX(0), so cancelling the
 * animation without it would leave the chart empty for exactly the readers who
 * asked for less movement.
 */
export const MOTION = `<style>
@keyframes grow{from{transform:scaleX(0)}}
@keyframes rise{from{opacity:0;transform:translateY(9px)}}
@keyframes fade{from{opacity:0}}
@keyframes draw{to{stroke-dashoffset:0}}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow .9s cubic-bezier(.22,1,.36,1) var(--d,0s) both}
.rise{animation:rise .7s cubic-bezier(.22,1,.36,1) var(--d,0s) both}
.fade{animation:fade .8s ease-out var(--d,0s) both}
.draw{animation:draw 1.7s ease-out .1s both}
@media (prefers-reduced-motion:reduce){
.bar,.rise,.fade,.draw{animation:none;transform:none;opacity:1;stroke-dashoffset:0}
}
</style>`;

/** How far apart successive rows or tiles start, in seconds. Small enough to
 *  read as one gesture, large enough that the order is visible. */
export const STAGGER = 0.07;

export class Drawing {
  constructor(theme) {
    if (new.target === Drawing) throw new Error("Drawing is abstract");
    this.theme = theme;
  }

  /** @returns {string} the complete SVG document. */
  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }

  toString() {
    return this.render();
  }

  /** A `<text>` at a baseline. Anchoring rather than measuring: the reader's
   *  font metrics are not ours, so centring is left to the renderer. */
  text(x, y, s, { size = 12, fill, weight = 400, anchor = "start" } = {}) {
    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(s)}</text>`;
  }

  /** The document wrapper, with the surface painted first so the drawing never
   *  depends on what it happens to sit on. */
  canvas(w, h, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<rect width="${w}" height="${h}" fill="${this.theme.surface}"/>
${body}
</svg>
`;
  }

  /** The per-element animation offset, as an inline custom property. Custom
   *  properties inherit and `animation-delay` does not, so one declaration on a
   *  group keeps everything inside it in step. */
  delay(index, step = STAGGER) {
    return `--d:${(index * step).toFixed(2)}s`;
  }
}
