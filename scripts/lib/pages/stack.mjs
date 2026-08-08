/**
 * The stack page. Nothing on it comes from the API — it is the one page that is
 * pure editorial, which is exactly why it says so in its own first line.
 */

import { escapeXml } from "../text.mjs";
import { StackTable } from "./stack-table.mjs";

export class StackPage {
  constructor({ profile, links, stamp }) {
    this.profile = profile;
    this.links = links;
    this.stamp = stamp;
  }

  get filename() {
    return "stack.md";
  }

  render() {
    const p = this.profile;
    const c = p.copy.portfolio;

    return `<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json by scripts/generate-profile.mjs.
  Last generated: ${this.stamp}
-->

# ${escapeXml(p.stack.heading)}

Everything listed here is in a repository in this account or one I contribute to.
Nothing is here because I read about it once.

${StackTable.render(p.stack)}

<sub><a href="${this.links.profile}">← ${c.back}</a></sub>
`;
  }
}
