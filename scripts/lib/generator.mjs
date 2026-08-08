/**
 * The orchestrator: collected data in, a rendered profile on disk out.
 *
 * It owns the order of operations and nothing else. What each drawing looks like
 * belongs to the drawing, what each page says belongs to the page, and which
 * figures exist belongs to the collector.
 */

import { writeFile } from "node:fs/promises";

import { BRANCH, GUTTER, MODES, PATHS } from "./config.mjs";
import { Theme } from "./theme.mjs";
import { AssetDirectory, OutputDirectory } from "./output-directory.mjs";
import { Links } from "./pages/links.mjs";
import { ReadmePage } from "./pages/readme.mjs";
import { GroupPage } from "./pages/group.mjs";
import { StackPage } from "./pages/stack.mjs";
import { Banner } from "./drawings/banner.mjs";
import { LockIcon } from "./drawings/lock-icon.mjs";
import { KpiStrip } from "./drawings/kpi-strip.mjs";
import { BarChart } from "./drawings/bar-chart.mjs";
import { ActivityChart } from "./drawings/activity-chart.mjs";

export class ProfileGenerator {
  constructor({ profile, data, log, paths = PATHS }) {
    this.profile = profile;
    this.data = data;
    this.log = log;
    this.paths = paths;
    this.stamp = new Date().toISOString().slice(0, 10);
    this.links = new Links(profile.login, BRANCH);
    this.assets = new AssetDirectory(paths.assets, log);
    this.pages = new OutputDirectory(paths.pages, log);
  }

  async run() {
    await this.#drawAssets();
    await this.#renderPages();
    await this.assets.prune();
    await this.pages.prune();
    this.#summarise();
  }

  async #drawAssets() {
    this.log.step("Rendering assets …");
    for (const mode of MODES) {
      const theme = new Theme(mode);
      await this.assets.writeDrawing("banner", mode, new Banner(theme, this.profile.banner.facets));
      await this.assets.writeDrawing("lock", mode, new LockIcon(theme));
      await this.assets.writeDrawing("stats", mode, new KpiStrip(theme, this.#tiles()));
      await this.#drawInstalls(theme, mode);
      await this.#drawCommitCharts(theme, mode);
    }
  }

  /** The profile strip is GitHub only. npm belongs to the packages page, where
   *  the reader is looking at packages; up here it would be one registry's
   *  numbers standing in a row of this site's. */
  #tiles() {
    const d = this.data;
    return [
      [d.repos.length, "Repositories"],
      [d.orgs, "Organisations"],
      [d.prsMerged, "Merged pull requests"],
      [d.commits12mo, "My commits · 12 mo"],
      [d.commitsTotal, "My commits · total"],
    ];
  }

  async #drawInstalls(theme, mode) {
    const m = this.profile.copy.metrics;
    for (const group of this.profile.groups) {
      const installs = this.profile.installsIn(group.id, this.data);
      if (!installs.length) continue;
      const chart = new BarChart(theme, installs, {
        unit: "count", title: m.installs, width: 1060, labelPct: 0.34,
      });
      await this.assets.writeDrawing("installs", mode, chart, `pages/${group.id}`);
    }
  }

  async #drawCommitCharts(theme, mode) {
    const m = this.profile.copy.metrics;
    const d = this.data;

    // Both tiles in the row are rendered at a shared height so they line up.
    const rows = Math.max(d.languages.length, d.perRepo.length);
    // The left tile pads on the right, the right tile on the left, so the whole
    // gutter lands between them and the outer edges stay flush.
    const left = { padRight: GUTTER }, right = { padLeft: GUTTER };

    await this.assets.writeDrawing("languages", mode,
      new BarChart(theme, d.languages, { ...left, title: m.languages, rows }));
    // Repository names are long; give the label column extra room before clipping.
    await this.assets.writeDrawing("perrepo", mode,
      new BarChart(theme, d.perRepo, { ...right, unit: "count", title: m.perrepo, rows, labelPct: 0.46 }));
    await this.assets.writeDrawing("activity", mode,
      new ActivityChart(theme, d.timeline, m.activity));
  }

  async #renderPages() {
    this.log.step("Rendering pages …");
    const shared = { profile: this.profile, links: this.links, stamp: this.stamp };

    const readme = new ReadmePage({ ...shared, data: this.data, log: this.log });
    await writeFile(this.paths.readme, readme.render(), "utf8");

    const pages = [
      ...this.profile.groups.map((group) => new GroupPage({ ...shared, group, data: this.data })),
      new StackPage(shared),
    ];
    for (const page of pages) {
      await this.pages.write(page.filename, page.render());
    }
  }

  #summarise() {
    const d = this.data;
    this.log.step(`\nDone. ${d.repos.length} repos · ${d.orgs} orgs · ${d.packages.length} packages · ${d.commitsTotal} own commits (${d.commits12mo} in 12 mo)`);
    if (this.log.warnings.length) {
      this.log.step(`${this.log.warnings.length} warning(s) above.`);
    }
  }
}
