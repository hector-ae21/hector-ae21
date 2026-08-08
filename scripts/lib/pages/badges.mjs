/**
 * Per-project badges from shields.io.
 *
 * The one place a third-party service earns its keep, and the one place these
 * belong: a detail page, where somebody is deciding whether to install the
 * thing. shields re-reads GitHub and npm on every page load, so version, licence
 * and last commit are live without this repository committing anything.
 *
 * Deliberately not used on the profile page. Tested 2026-08-06:
 * github-readme-stats returned DEPLOYMENT_PAUSED, github-profile-summary-cards
 * 500, star-history 503 and contrib.rocks would not connect — so every aggregate
 * here stays self-generated. shields' dynamic-JSON badge cannot stand in either:
 * pointed at api.github.com it renders "invalid", since it calls the API
 * unauthenticated.
 */

import { escapeXml } from "../text.mjs";

const HOST = "https://img.shields.io";
const STYLE = "style=flat-square&color=0969da&labelColor=1f2328";

export class Badges {
  static for(project) {
    const img = (url, alt) => `<img alt="${escapeXml(alt)}" src="${url}">`;
    const out = [];
    if (project.npm) {
      out.push(img(`${HOST}/npm/v/${project.npm}?${STYLE}&label=npm`, "npm version"));
      out.push(img(`${HOST}/npm/dm/${project.npm}?${STYLE}&label=downloads`, "npm downloads"));
    }
    if (project.repo) {
      out.push(img(`${HOST}/github/license/${project.repo}?${STYLE}&label=license`, "license"));
      out.push(img(`${HOST}/github/last-commit/${project.repo}?${STYLE}&label=last%20commit`, "last commit"));
    }
    return out.join(" ");
  }
}
