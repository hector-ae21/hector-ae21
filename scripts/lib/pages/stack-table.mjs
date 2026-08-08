/**
 * The stack as a table rather than a drawing. The image version was one more
 * picture to load for something that is, in the end, a list of words — and a
 * drawing cannot be selected, searched or read by a screen reader. Everything is
 * set small: it is a reference, not a headline.
 */

import { escapeXml } from "../text.mjs";

export class StackTable {
  static render(stack) {
    const rows = stack.groups.map((g) =>
      `<tr><td valign="top"><sub><b>${escapeXml(g.label)}</b></sub></td><td><sub>${g.items.map((i) => `<code>${escapeXml(i)}</code>`).join(" · ")}</sub></td></tr>`
    ).join("\n");
    return `<table>\n${rows}\n</table>`;
  }
}
