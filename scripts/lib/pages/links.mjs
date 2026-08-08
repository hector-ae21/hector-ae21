/**
 * Every URL the generated markdown emits, and the picture element that carries a
 * light and a dark drawing behind one <img>.
 *
 * Assets live under the document that uses them: everything the profile page
 * shows sits directly in profile/assets, and anything a detail page needs of its
 * own goes in profile/assets/pages/<page id>. So a folder answers "who is this
 * for" without anyone having to grep the markdown, and deleting a page takes its
 * pictures with it. `dir` is that sub-path, empty for the README.
 */

import { escapeXml } from "../text.mjs";

export class Links {
  constructor(login, branch) {
    this.login = login;
    this.branch = branch;
  }

  /** Raw asset URLs, absolute and branch-pinned: a profile README is read from
   *  github.com/<user>, where a relative path resolves to nothing useful. */
  assets(dir = "") {
    return `https://raw.githubusercontent.com/${this.login}/${this.login}/${this.branch}/profile/assets${dir ? `/${dir}` : ""}`;
  }

  page(id) {
    return `https://github.com/${this.login}/${this.login}/blob/${this.branch}/profile/pages/${id}.md`;
  }

  repo(fullName) {
    return `https://github.com/${fullName}`;
  }

  get profile() {
    return `https://github.com/${this.login}`;
  }

  get generator() {
    return `https://github.com/${this.login}/${this.login}/blob/${this.branch}/scripts/generate-profile.mjs`;
  }

  picture(base, alt, width = "100%", dir = "") {
    const at = this.assets(dir);
    return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${at}/${base}-dark.svg">
  <img alt="${escapeXml(alt)}" src="${at}/${base}-light.svg" width="${width}">
</picture>`;
  }

  /** The same thing on one line, for use inside a paragraph or a table cell. */
  inlinePicture(base, alt, attrs = 'width="100%"', dir = "") {
    const at = this.assets(dir);
    return `<picture><source media="(prefers-color-scheme: dark)" srcset="${at}/${base}-dark.svg"><img alt="${escapeXml(alt)}" src="${at}/${base}-light.svg" ${attrs}></picture>`;
  }

  /** Two half-width charts per row. Plain images rather than a table: GitHub
   *  draws a border around every table, which would box each chart in a frame.
   *
   *  Left-aligned, not centred: centring splits the leftover width into two side
   *  margins, which pushes the tiles' titles out of line with the full-width
   *  chart below them by an amount that changes with viewport width. */
  chartGrid(pairs) {
    return pairs.map(([a, b]) => `<p>
${this.picture(a.base, a.alt, "48%")}
${this.picture(b.base, b.alt, "48%")}
</p>`).join("\n\n");
  }
}
