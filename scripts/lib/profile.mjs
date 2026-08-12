/**
 * content.json, wrapped.
 *
 * Every word and every editorial choice on the profile lives in that file; this
 * class is the only thing that reads it, so the pages ask questions like
 * "projects in this group" instead of reaching into a JSON shape.
 *
 * It also enforces the rule that outlives any particular layout: nothing without
 * a public repository reaches the page. Private work used to be listed as
 * unlinked cards, and every one of those was a name a visitor could not check
 * and could not open. Enforced here rather than by remembering to leave it out
 * of the JSON.
 */

import { readFile } from "node:fs/promises";

export class Profile {
  static async load(path, log) {
    return new Profile(JSON.parse(await readFile(path, "utf8")), log);
  }

  constructor(content, log) {
    this.content = content;

    const unlinked = content.projects.filter((p) => !p.repo);
    if (unlinked.length && log) {
      log.warn(`dropped, no public repository: ${unlinked.map((p) => p.name).join(", ")}`);
    }
    this.projects = content.projects.filter((p) => p.repo);
  }

  get user() { return this.content.user; }
  get login() { return this.content.user.login; }
  get opening() { return this.content.opening; }
  get nav() { return this.content.nav; }
  get banner() { return this.content.banner; }
  get about() { return this.content.about; }
  get stack() { return this.content.stack; }
  get copy() { return this.content.copy; }
  get groups() { return this.content.groups; }
  get quickAccess() { return this.content.quickAccess || {}; }

  projectsIn(groupId) {
    return this.projects.filter((p) => p.group === groupId);
  }

  /** Alt text for the banner, built from what it actually draws so the two
   *  cannot drift apart. */
  get bannerAlt() {
    return `What I work on: ${this.banner.facets.map((f) => f.label).join(", ")}`;
  }

  /**
   * Monthly installs per package in a group, biggest first. Empty when the group
   * has fewer than two published packages, which is how the caller decides
   * whether the chart exists at all: a page of Moodle plugins has no npm figures
   * to draw, and a ranked bar chart of one bar ranks nothing.
   */
  installsIn(groupId, data) {
    const items = this.projectsIn(groupId)
      .filter((p) => p.npm)
      .map((p) => ({
        name: p.npm,
        value: data.packages.find((x) => x.name === p.npm)?.downloads || 0,
      }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);
    return items.length > 1 ? items : [];
  }
}
