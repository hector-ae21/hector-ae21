/**
 * One detail page per portfolio group: the full listing the profile page keeps
 * one click away.
 *
 * This is where a reader has stopped skimming and started deciding, so it is the
 * one place with badges, install lines and the long description.
 */

import { escapeXml } from "../text.mjs";
import { Badges } from "./badges.mjs";

export class GroupPage {
  constructor({ profile, group, data, links, stamp }) {
    this.profile = profile;
    this.group = group;
    this.data = data;
    this.links = links;
    this.stamp = stamp;
  }

  get id() {
    return this.group.id;
  }

  get filename() {
    return `${this.group.id}.md`;
  }

  render() {
    const c = this.profile.copy.portfolio;
    const body = this.profile.projectsIn(this.group.id).map((p) => this.#project(p)).join("\n\n");

    return `<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json + the GitHub API by
  scripts/generate-profile.mjs. Last generated: ${this.stamp}
-->

# ${escapeXml(this.group.label)}

${escapeXml(this.group.page)}
${this.#installs()}
---

${body || "_No data yet_"}

<sub><a href="${this.links.profile}">← ${c.back}</a></sub>
`;
  }

  #installs() {
    if (!this.profile.installsIn(this.group.id, this.data).length) return "";
    const m = this.profile.copy.metrics;
    return `
${this.links.picture("installs", m.installs, "100%", `pages/${this.group.id}`)}

<sub>${m.installsNote}</sub>
`;
  }

  #project(p) {
    const badges = Badges.for(p);
    const install = p.npm ? `\n\`\`\`bash\nnpm install ${p.npm}\n\`\`\`\n` : "";
    const tech = p.tech.length
      ? `\n<p><sub>${p.tech.map((t) => `<code>${escapeXml(t)}</code>`).join(" ")}</sub></p>\n` : "";

    return `<h2><a href="${this.links.repo(p.repo)}">${escapeXml(p.name)}</a></h2>

<p><sub><b>${escapeXml(p.role)}</b></sub></p>
${badges ? `\n<p>${badges}</p>\n` : ""}
${escapeXml(p.desc)}
${install}${tech}
---`;
  }
}
