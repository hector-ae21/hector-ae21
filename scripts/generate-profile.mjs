#!/usr/bin/env node
/**
 * Renders the github.com/hector-ae21 profile.
 *
 * Reads   : profile/data/content.json   (every word)
 *           the GitHub REST API          (every number)
 *           registry.npmjs.org           (published versions and installs)
 * Writes  : README.md                    (what the profile page shows)
 *           profile/pages/*.md           (one detail page per portfolio group)
 *           profile/assets/**.svg        (banner, charts, lock — light and dark)
 *
 * Nothing in the generated markdown is hand-written, so no sentence is ever
 * maintained in two places. Edit content.json instead.
 *
 * A GitHub profile README cannot run JavaScript, and GitHub publishes no
 * official statistics-image endpoint. So "live" has to mean: a scheduled job
 * recomputes the numbers and commits them. That job is
 * .github/workflows/update-profile.yml.
 *
 * This file is the entry point and nothing else. The work lives in lib/:
 *
 *   config          paths, colour schemes, branch
 *   log             console output and the warning tally
 *   theme           the palette, one instance per colour scheme
 *   text            escaping, number formatting, slugs
 *   profile         content.json wrapped, and the rules that outlive layouts
 *   sources/        GitHubClient, NpmRegistry, ProfileCollector
 *   drawings/       Drawing and its subclasses — one class per picture
 *   pages/          Links, HeaderTable, ReadmePage, GroupPage, StackPage
 *   output-directory  writes files and sweeps whatever it did not write
 *   generator       the order of operations, and nothing else
 *
 * Two environment variables help when working on layout:
 *   PROFILE_FIXTURE=<path>  render from a saved snapshot, no API calls
 *   PROFILE_DUMP=<path>     write the snapshot back out
 *   PROFILE_BRANCH=<name>   branch the asset URLs point at (default: main)
 *
 * No dependencies. Node >= 20 (global fetch).
 */

import { readFile, writeFile } from "node:fs/promises";

import { PATHS } from "./lib/config.mjs";
import { log } from "./lib/log.mjs";
import { Profile } from "./lib/profile.mjs";
import { GitHubClient } from "./lib/sources/github.mjs";
import { NpmRegistry } from "./lib/sources/npm.mjs";
import { ProfileCollector } from "./lib/sources/collector.mjs";
import { ProfileGenerator } from "./lib/generator.mjs";

async function gather(profile) {
  if (process.env.PROFILE_FIXTURE) {
    return JSON.parse(await readFile(process.env.PROFILE_FIXTURE, "utf8"));
  }
  const collector = new ProfileCollector({
    github: new GitHubClient({ token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN, log }),
    npm: new NpmRegistry({ log }),
    log,
  });
  return collector.collect(profile);
}

async function main() {
  const profile = await Profile.load(PATHS.content, log);
  const data = await gather(profile);

  if (process.env.PROFILE_DUMP) {
    await writeFile(process.env.PROFILE_DUMP, JSON.stringify(data, null, 2), "utf8");
  }

  await new ProfileGenerator({ profile, data, log }).run();
}

main().catch((e) => { console.error(e); process.exit(1); });
