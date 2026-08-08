/**
 * Everything under the banner that is a link: where you can go inside the
 * profile, centred, and the launcher rows, ranged right.
 *
 * A table, for one reason: a table row border is the only hairline GitHub
 * markdown will draw. Drawn pills cost an image request each and cannot be
 * selected; <hr> is a quarter-em band with 24px of margin either side; a
 * one-pixel image reads as a picture of a line, not a line. The surrounding box
 * is the price of the rule between the rows.
 *
 * The banner is the first cell rather than a picture above the table, and that
 * is load-bearing: GitHub lays tables out at `width: max-content`, so a table of
 * short link rows shrinks to hug them and drifts off to the left of a full-width
 * page. A wide image in the first cell is what holds the box open. Navigation
 * shares that cell, because a rule between the picture and the three links that
 * say what it is a picture of divides nothing worth dividing.
 *
 * The launcher half is for the owner rather than a visitor: fifteen slots, ten
 * pinned by hand and five that reorder themselves by what was pushed to last.
 * Its two markers stay quiet and unexplained on purpose — italic for the
 * automatic five, a padlock for what is private. A padlock needs no caption, and
 * this block is for the person who already knows.
 */

import { escapeXml } from "../text.mjs";

export class HeaderTable {
  constructor({ profile, data, links, log }) {
    this.profile = profile;
    this.data = data;
    this.links = links;
    this.log = log;
  }

  render(banner) {
    const nav = this.#navigation();
    const rows = this.#launcherRows();

    // Everything set small. This is the index, not the page: it should be
    // legible and stay out of the way of the first thing anyone actually reads.
    return `<table width="100%">
<tr><td align="center">${banner}${nav ? `<br><sub>${nav}</sub>` : ""}</td></tr>
${rows.map((r) => `<tr><td align="right"><sub>${r}</sub></td></tr>`).join("\n")}
</table>`;
  }

  /** Where you can go from here, joined by a middot. Repositories use a slash,
   *  the way a path is written; that contrast is what separates the two kinds of
   *  link now that there is no rule between them. */
  #navigation() {
    return this.profile.nav.sections
      .map((s) => `<a href="${this.links.page(s.to)}">${escapeXml(s.label)}</a>`)
      .join(" · ");
  }

  #launcherRows() {
    const q = this.profile.quickAccess;
    const items = this.#items();

    // A pinned entry pointing at a row that does not exist is a typo and worth
    // saying so. An automatic one is not: deleting a row is how you say "I do
    // not want those here", and the run should not complain about being obeyed.
    const ids = new Set((q.rows || []).map((r) => r.id));
    const lost = items.filter((i) => !i.recent && !ids.has(i.row));
    if (lost.length) {
      this.log.warn(`quickAccess row missing for: ${lost.map((i) => `${i.repo} (${i.row})`).join(", ")}`);
    }

    return (q.rows || [])
      .map((row) => items.filter((i) => i.row === row.id).map((i) => this.#link(i)).join(" / "))
      .filter(Boolean);
  }

  #items() {
    const q = this.profile.quickAccess;
    const pinned = (q.pinned || []).slice(0, q.maxPinned ?? 10);
    if ((q.pinned || []).length > pinned.length) {
      this.log.warn(`quickAccess.pinned holds ${q.pinned.length} entries but maxPinned is ${q.maxPinned} — the rest are not shown`);
    }

    const login = this.profile.login.toLowerCase();
    return [
      ...pinned.map((p) => ({ ...p, label: p.label || p.repo.split("/")[1] })),
      // An automatic entry lands in a row by who owns it, since that is the only
      // thing about it this side knows: mine under `personal`, anything else
      // under `orgs`. Those keep the owner in the label — two accounts here both
      // have a repository whose bare name says nothing about whose it is.
      ...(this.data.recent || []).map((r) => {
        const mine = r.owner.toLowerCase() === login;
        return { repo: r.repo, label: mine ? r.label : r.repo, row: mine ? "personal" : "orgs", recent: true };
      }),
    ];
  }

  #link(item) {
    const name = item.recent ? `<em>${escapeXml(item.label)}</em>` : escapeXml(item.label);
    // Lock first: it qualifies the link that follows, and trailing it would put
    // the mark where the next separator goes. Sized against the small type it
    // sits in, not the body text.
    const lock = item.private
      ? `${this.links.inlinePicture("lock", "private", 'height="10"')} `
      : "";
    return `${lock}<a href="${this.links.repo(item.repo)}">${name}</a>`;
  }
}
