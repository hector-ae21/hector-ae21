/**
 * Eleven pixels of padlock, set beside a link to a repository only its owner can
 * open. The one drawing here without a background rectangle: it sits inline in a
 * line of text, so it has to take the colour of whatever is behind it instead of
 * carrying its own — which is why it does not use the inherited canvas.
 *
 * Muted, not accent. It is a caveat, not a badge.
 */

import { Drawing } from "./drawing.mjs";

export class LockIcon extends Drawing {
  render() {
    const th = this.theme;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="12" viewBox="0 0 10 12" role="img">
<path d="M2.85,5.3V3.55a2.15,2.15 0 0 1 4.3,0V5.3" fill="none" stroke="${th.muted}" stroke-width="1.3"/>
<rect x="0.85" y="5.3" width="8.3" height="6.2" rx="1.5" fill="${th.muted}"/>
</svg>
`;
  }
}
