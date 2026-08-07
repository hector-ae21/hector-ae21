#!/usr/bin/env node
/**
 * Renders the github.com/hector-ae21 profile.
 *
 * Reads   : profile/data/content.json   (every word)
 *           the GitHub REST API          (every number)
 *           registry.npmjs.org           (published versions)
 * Writes  : README.md                    (what the profile page shows)
 *           profile/pages/*.md           (one detail page per portfolio group)
 *           profile/assets/*.svg         (banner, cards, charts, nav pills, stack
 *                                         — every one in light and dark)
 *
 * Both output directories are swept at the end of a run: anything in them this
 * run did not write no longer has anything in content.json behind it, and is
 * deleted rather than left to rot.
 *
 * Nothing in the generated markdown is hand-written, so no sentence is ever
 * maintained in two places. Edit content.json instead.
 *
 * A GitHub profile README cannot run JavaScript, and GitHub publishes no official
 * statistics-image endpoint. So "live" has to mean: a scheduled job recomputes the
 * numbers and commits them. That job is .github/workflows/update-profile.yml.
 *
 * The distinguishing choice here versus an organisation profile: every commit
 * figure is *this user's own*, pulled per author out of /stats/contributors,
 * never the repository totals. Counting a repository's whole history as personal
 * output would be flattering and false — most of these repositories have other
 * authors, and three of them are forks whose history predates any of this work.
 *
 * The second rule follows from the first: nothing without a public repository is
 * rendered at all. A card naming private work is a claim the reader is asked to
 * take on trust, which is the opposite of what the rest of this page is for.
 *
 * No dependencies. Node >= 20 (global fetch).
 */

import { readFile, writeFile, mkdir, readdir, unlink, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "profile", "assets");
const PAGES = join(ROOT, "profile", "pages");
const MODES = ["light", "dark"];
const BRANCH = process.env.PROFILE_BRANCH || "main";

/* ── palette ────────────────────────────────────────────────────────────────
 * Every chart is single-hue: bar length and line height carry the values, row
 * labels carry the identities. Nothing is encoded in colour alone, so no
 * categorical ramp is needed and colour-vision separation is not in play.
 *
 * The accent is GitHub's own blue, stepped per mode and checked against the real
 * canvases the images land on rather than a reference surface:
 *   light  #0969da on #ffffff → 5.19:1  (>= 3:1 for marks, >= 4.5:1 for text)
 *   dark   #58a6ff on #0d1117 → 7.49:1
 * Both clear the text threshold, which matters because the nav pills put label
 * text on the accent rather than only drawing shapes with it.
 */
const THEME = {
  light: {
    surface: "#ffffff", primary: "#1f2328", secondary: "#59636e", muted: "#818b98",
    grid: "#e4e8ed", axis: "#d0d7de", brand: "#0969da", brandSoft: "rgba(9,105,218,0.10)",
    onBrand: "#ffffff",
  },
  dark: {
    surface: "#0d1117", primary: "#f0f6fc", secondary: "#9198a1", muted: "#6e7681",
    grid: "#21262d", axis: "#30363d", brand: "#58a6ff", brandSoft: "rgba(88,166,255,0.14)",
    onBrand: "#0d1117",
  },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// Half the gutter between two grid tiles, in chart units. Applied only to a
// tile's inner edge, so none of it is wasted as an outer margin and the outer
// edges stay flush with the full-width charts above and below.
//
// It has to be generous: what faces across the gutter is the left tile's value
// column against the right tile's label column — text against text. Anything
// tighter and "79.7%" reads as though it belongs to the neighbour's row.
const GUTTER = 30;

/* ── github api ─────────────────────────────────────────────────────────── */

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warned = [];
const warn = (m) => { warned.push(m); console.warn(`  ! ${m}`); };

async function api(path, { retries202 = 5 } = {}) {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "hector-ae21-profile-generator",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    // Statistics endpoints answer 202 while GitHub warms the cache.
    if (res.status === 202 && attempt < retries202) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    // Rate limiting is fatal, never "empty". Swallowing it would let a throttled
    // run overwrite good charts with zeros and commit them.
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0" || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000;
        const mins = reset ? Math.ceil((reset - Date.now()) / 60000) : "?";
        throw new Error(
          `GitHub API rate limit exhausted (resets in ~${mins} min).\n` +
          (token ? "" : "No GITHUB_TOKEN set — unauthenticated runs get only 60 requests/hour.\n") +
          "Refusing to render: a throttled run would replace real figures with zeros."
        );
      }
      warn(`403 on ${path} (not rate limiting) — treating as empty`);
      return null;
    }
    if ([202, 404].includes(res.status)) {
      warn(`${res.status} on ${path} — treating as empty`);
      return null;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
    return (await res.json()) ?? null;
  }
}

async function npmVersion(pkg) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) return null;
    return (await res.json())?.["dist-tags"]?.latest ?? null;
  } catch {
    warn(`npm registry unreachable for ${pkg}`);
    return null;
  }
}

/** Last 30 days of installs. The one usage figure on this profile that is not a
 *  commit: it says somebody other than the author runs the code, which stars do
 *  not. Registry and downloads are separate services — a package can resolve
 *  here and still have no download record, so a null is normal, not a failure. */
async function npmDownloads(pkg) {
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`);
    if (!res.ok) return null;
    const n = (await res.json())?.downloads;
    return Number.isFinite(n) ? n : null;
  } catch {
    warn(`npm downloads unreachable for ${pkg}`);
    return null;
  }
}

/* ── collection ─────────────────────────────────────────────────────────── */

const WEEK = 604800; // seconds

async function collect(content) {
  const login = content.user.login;
  console.log(`Fetching ${login} …`);

  const user = await api(`/users/${login}`);
  const owned = ((await api(`/users/${login}/repos?per_page=100&type=owner`)) || [])
    .filter((r) => !r.archived && !content.tracked.excludeOwned.includes(r.name));

  // Forks are kept deliberately: three of them (the Moodle plugins and theme) are
  // where the actual work happened. What stops them distorting the language chart
  // is the commit-share weighting below, not exclusion.
  const extra = [];
  for (const full of content.tracked.contributions) {
    const r = await api(`/repos/${full}`);
    if (r && !r.private) extra.push(r);
    else warn(`${full} is unreadable or private — dropped from the charts`);
  }

  const repos = [...owned, ...extra];
  console.log(`  ${repos.length} public repositories tracked`);

  const languages = new Map();  // language  → bytes attributable to this user
  const perRepo = new Map();    // repo      → this user's commits
  const perOwner = new Map();   // owner     → this user's commits
  const perYear = new Map();    // year      → this user's commits
  const weeks = new Map();      // week (ts) → this user's commits
  let mine = 0;

  for (const repo of repos) {
    const stats = await api(`/repos/${repo.full_name}/stats/contributors`);
    const rows = Array.isArray(stats) ? stats : [];
    const me = rows.find((c) => c.author?.login?.toLowerCase() === login.toLowerCase());
    const repoTotal = rows.reduce((s, c) => s + (c.total || 0), 0);
    const myTotal = me?.total || 0;

    if (myTotal > 0) {
      mine += myTotal;
      // Qualified with the owner for anything not in this account: on its own,
      // a row reading "core" says nothing about whose core it is.
      const rowName = repo.owner.login.toLowerCase() === login.toLowerCase()
        ? repo.name : repo.full_name;
      perRepo.set(rowName, (perRepo.get(rowName) || 0) + myTotal);
      perOwner.set(repo.owner.login, (perOwner.get(repo.owner.login) || 0) + myTotal);
      for (const w of me.weeks || []) {
        if (!w.c) continue;
        weeks.set(w.w, (weeks.get(w.w) || 0) + w.c);
        const year = new Date(w.w * 1000).getUTCFullYear();
        perYear.set(year, (perYear.get(year) || 0) + w.c);
      }
    }

    // Language bytes are scaled by this user's share of the repository's commits.
    // Unweighted, a fork of a mature upstream project would hand him tens of
    // thousands of lines of somebody else's PHP; a 2%-authored repository would
    // outweigh one he wrote alone.
    const share = repoTotal > 0 ? myTotal / repoTotal : (repo.fork ? 0 : 1);
    if (share > 0) {
      for (const [name, bytes] of Object.entries(
        (await api(`/repos/${repo.full_name}/languages`)) || {}
      )) {
        languages.set(name, (languages.get(name) || 0) + bytes * share);
      }
    }

    console.log(`  · ${repo.full_name} — ${myTotal} of ${repoTotal} commits`);
  }

  // A dense 52-week series: /stats/contributors only returns weeks with activity
  // for this author, and a line chart drawn from those alone would compress the
  // quiet stretches out of existence and misreport when the work happened.
  //
  // The bucket keys have to land exactly on GitHub's, which are Sunday 00:00 UTC.
  // Deriving them arithmetically from the epoch does not work — 1970-01-01 was a
  // Thursday, so `floor(now / WEEK) * WEEK` produces Thursday-aligned keys that
  // match nothing and silently yield an all-zero chart.
  const sunday = new Date();
  sunday.setUTCHours(0, 0, 0, 0);
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const lastWeek = Math.floor(sunday.getTime() / 1000);
  const timeline = Array.from({ length: 52 }, (_, i) => {
    const week = lastWeek - (51 - i) * WEEK;
    return { week, total: weeks.get(week) || 0 };
  });
  // Cheap tripwire for the alignment above: activity that exists but lands in no
  // bucket is the signature of an off-by-one-day key, not of a quiet year.
  const seen = [...weeks.values()].reduce((s, n) => s + n, 0);
  const placed = timeline.reduce((s, w) => s + w.total, 0);
  if (seen > 0 && placed === 0) warn("no commit week matched the 52-week window — check the Sunday alignment");

  const packages = [];
  for (const p of content.projects.filter((p) => p.npm)) {
    const version = await npmVersion(p.npm);
    if (!version) { warn(`${p.npm} is not published on npm — no version badge`); continue; }
    packages.push({ name: p.npm, version, downloads: await npmDownloads(p.npm) });
  }

  // Repository language, keyed by full name, for the featured cards. Taken from
  // the repository record rather than re-derived: the card states what GitHub
  // shows on the repository itself, so the two never disagree.
  const repoLanguage = Object.fromEntries(repos.map((r) => [r.full_name, r.language]));

  // The self-filling half of the launcher: what was pushed to most recently,
  // minus anything already pinned by hand and anything on the exclude list.
  // `pushed_at` rather than commit dates on purpose — the question this answers
  // is "where was I last week", and a push is the event that says so.
  const q = content.quickAccess || {};
  const named = new Set([...(q.pinned || []).map((p) => p.repo), ...(q.exclude || [])]
    .map((s) => s.toLowerCase()));
  const recent = repos
    .filter((r) => !named.has(r.full_name.toLowerCase()))
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, q.recentCount ?? 5)
    .map((r) => ({ repo: r.full_name, label: r.name, owner: r.owner.login }));

  return {
    login, user, repos, packages, repoLanguage, recent,
    downloads30d: packages.reduce((s, p) => s + (p.downloads || 0), 0),
    commitsTotal: mine,
    commits12mo: timeline.reduce((s, w) => s + w.total, 0),
    orgs: [...perOwner.keys()].filter((o) => o.toLowerCase() !== login.toLowerCase()).length,
    timeline,
    languages: rank(languages, 6),
    perRepo: rank(perRepo, 6),
    perOwner: rank(perOwner, 6),
    perYear: [...perYear.entries()].sort((a, b) => a[0] - b[0])
      .map(([name, value]) => ({ name: String(name), value })),
  };
}

/** Sort a name→value map descending and fold everything past `limit` into "Other". */
function rank(map, limit) {
  const all = [...map.entries()].map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (all.length <= limit) return all;
  return [
    ...all.slice(0, limit - 1),
    { name: "__other__", value: all.slice(limit - 1).reduce((s, x) => s + x.value, 0) },
  ];
}

/* ── svg primitives ─────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (n) => n >= 1000
  ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`.replace(".0k", "k")
  : String(Math.round(n));

const text = (x, y, s, { size = 12, fill, weight = 400, anchor = "start" } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const svg = (w, h, body, th) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<rect width="${w}" height="${h}" fill="${th.surface}"/>
${body}
</svg>
`;

/* Approximate advance width, in ems, for the system sans stack. Exact metrics
 * would need the font file, which is the reader's, not ours. Only pill *width*
 * depends on this — every label is drawn with text-anchor="middle" at the pill's
 * centre, so an imprecise estimate makes a pill slightly roomy or snug and never
 * pushes the text off-centre. */
const NARROW = "iIl|!.,;:'`()[]{}-";
const WIDE = "mMWQ@%&";
function width(s, size) {
  let ems = 0;
  for (const ch of String(s)) {
    if (ch === " ") ems += 0.28;
    else if (NARROW.includes(ch)) ems += 0.31;
    else if (WIDE.includes(ch)) ems += 0.90;
    else if (ch >= "A" && ch <= "Z") ems += 0.68;
    else if (ch >= "0" && ch <= "9") ems += 0.57;
    else ems += 0.55;
  }
  return ems * size;
}

/** Greedy word wrap against the estimate above. SVG has no flow text: a run of
 *  prose is only as many <text> elements as you cut it into yourself. Anything
 *  past `maxLines` is dropped and the last line gets an ellipsis, so an over-long
 *  description degrades to a clipped sentence instead of overflowing the card. */
function wrap(s, maxWidth, size, maxLines) {
  const lines = [];
  let line = "";
  for (const word of String(s).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next, size) > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumed = lines.join(" ");
    if (consumed.length < s.length - 1) {
      let t = last;
      while (t && width(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
      lines[maxLines - 1] = `${t.replace(/[\s,;.]+$/, "")}…`;
    }
  }
  return lines;
}

/* ── banner ─────────────────────────────────────────────────────────────────
 * The strip above everything else. It carries no name and no job title: GitHub
 * prints both in the sidebar immediately to its left, and spending the one image
 * everybody sees first on a repeat of the two lines beside it is a waste of the
 * best space on the page.
 *
 * What it shows instead is the spread of the work — one chip per facet, so no
 * single thing stands in for the whole account. A drawing of exactly one idea
 * makes a good illustration and a bad banner: it announces that this person does
 * that, and by omission that they do nothing else.
 *
 * It moves, and it moves in CSS. An SVG loaded through <img> runs declarative
 * animation but no script, which is the whole reason this can breathe at all on
 * a page that cannot execute anything. Everything honours prefers-reduced-motion.
 *
 * Each glyph is drawn on a 24×24 box, stroked and never filled, so the parent
 * group sets colour and weight once for all of them.
 */
const GLYPHS = {
  braces: `<path d="M9.2,3 C6.7,3 6.7,5.2 6.7,7.2 C6.7,10 4.6,10.6 4.6,12 C4.6,13.4 6.7,14 6.7,16.8 C6.7,18.8 6.7,21 9.2,21"/>
<path d="M14.8,3 C17.3,3 17.3,5.2 17.3,7.2 C17.3,10 19.4,10.6 19.4,12 C19.4,13.4 17.3,14 17.3,16.8 C17.3,18.8 17.3,21 14.8,21"/>`,
  package: `<path d="M12,2.8 L20.3,7.2 V16.8 L12,21.2 L3.7,16.8 V7.2 Z"/>
<path d="M3.7,7.2 L12,11.6 L20.3,7.2"/><path d="M12,11.6 V21.2"/>`,
  database: `<ellipse cx="12" cy="6.4" rx="7.6" ry="3.4"/>
<path d="M4.4,6.4 V17.6 C4.4,19.5 7.8,21 12,21 C16.2,21 19.6,19.5 19.6,17.6 V6.4"/>
<path d="M4.4,12 C4.4,13.9 7.8,15.4 12,15.4 C16.2,15.4 19.6,13.9 19.6,12"/>`,
  shield: `<path d="M12,2.6 L20,5.9 V12.1 C20,16.7 16.6,20 12,21.4 C7.4,20 4,16.7 4,12.1 V5.9 Z"/>`,
  cap: `<path d="M12,3.4 L22,8.3 L12,13.2 L2,8.3 Z"/>
<path d="M6.4,10.4 V16 C6.4,16 8.6,18.6 12,18.6 C15.4,18.6 17.6,16 17.6,16 V10.4"/>
<path d="M20.6,9.6 V15.2"/>`,
  flask: `<path d="M9.6,3 V9.4 L4.6,17.9 C3.8,19.3 4.8,21 6.4,21 H17.6 C19.2,21 20.2,19.3 19.4,17.9 L14.4,9.4 V3"/>
<path d="M8,3 H16"/><path d="M6.7,15.6 H17.3"/>`,
};

function banner(content, mode) {
  const th = THEME[mode];
  const facets = content.banner.facets;
  const W = 1060, H = 168, chip = 46, half = chip / 2;

  const n = facets.length;
  const xs = facets.map((_, i) => 120 + (n > 1 ? (i * (W - 240)) / (n - 1) : (W - 240) / 2));
  // A small stagger rather than a straight row: a level line of icons reads as a
  // toolbar, and this is not a list of buttons.
  const ys = facets.map((_, i) => 80 + [8, -6, 12, -10, 6, -4][i % 6]);

  // Horizontal tangents at every chip, so the thread through them is a wave and
  // not a zigzag of straight segments meeting at corners.
  const thread = `M${xs[0]},${ys[0]} ` + xs.slice(1).map((x, i) => {
    const dx = (x - xs[i]) * 0.45;
    return `C${xs[i] + dx},${ys[i]} ${x - dx},${ys[i + 1]} ${x},${ys[i + 1]}`;
  }).join(" ");

  const chips = facets.map((f, i) => {
    const cx = xs[i], cy = ys[i];
    // --d is a custom property because those inherit and animation-delay does
    // not: one declaration here keeps a chip and its own halo in step.
    return `<g class="chip" style="--d:${(-i * 0.9).toFixed(1)}s">
<rect class="halo" x="${cx - 31}" y="${cy - 31}" width="62" height="62" rx="19" fill="${th.brand}"/>
<rect x="${cx - half}" y="${cy - half}" width="${chip}" height="${chip}" rx="13" fill="${th.brandSoft}" stroke="${th.brand}" stroke-opacity="0.4" stroke-width="1.2"/>
<g transform="translate(${cx - 12},${cy - 12})" fill="none" stroke="${th.brand}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[f.glyph] || ""}</g>
${text(cx, cy + 45, f.label, { size: 10, weight: 600, fill: th.muted, anchor: "middle" })}
</g>`;
  }).join("\n");

  return svg(W, H, `<defs>
<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1.3" cy="1.3" r="1.3" fill="${th.muted}"/></pattern>
</defs>
<style>
.chip{animation:bob 6.5s ease-in-out var(--d,0s) infinite}
.halo{opacity:.05;animation:pulse 6.5s ease-in-out var(--d,0s) infinite}
.flow{animation:flow 4.2s linear infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes pulse{0%,100%{opacity:.04}50%{opacity:.17}}
@keyframes flow{to{stroke-dashoffset:-260}}
@media (prefers-reduced-motion:reduce){.chip,.halo,.flow{animation:none}}
</style>
<rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.16"/>
<path d="${thread}" fill="none" stroke="${th.axis}" stroke-width="1.6"/>
<path class="flow" d="${thread}" fill="none" stroke="${th.brand}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="20 240"/>
${chips}`, th);
}

/* ── featured cards ─────────────────────────────────────────────────────────
 * The repository "pin" card, drawn here instead of fetched from one of the
 * public card services. Two reasons, both from checking rather than taste:
 * those cards lead with stars and forks, which on these repositories are 1 and 2
 * and would undersell working software; and two of the four have no GitHub
 * description at all, so the card would render half empty. Drawing it locally
 * puts the sentence *I* wrote on the card, swaps stars for monthly installs, and
 * keeps the whole page on one palette. */
const CARD = { W: 520, pad: 20, descTop: 82, lineH: 17, descSize: 11.5, maxLines: 3 };

const cardText = (p) => p.short || p.desc;
const cardLines = (p) =>
  wrap(cardText(p), CARD.W - CARD.pad * 2, CARD.descSize, CARD.maxLines).length;

/** `lines` is the tallest description across the whole set, not this card's own.
 *  Two cards sit side by side at the same rendered width, so they have to be the
 *  same height or the shorter one hangs; sizing every card to the longest text
 *  keeps them level without reserving three lines for a card that uses two. */
function repoCard(project, data, mode, lines = CARD.maxLines) {
  const th = THEME[mode];
  const { W, pad, descTop, lineH, descSize } = CARD;
  const divider = descTop + (lines - 1) * lineH + lineH;
  const footY = divider + 23.5;
  const H = footY + 19.5;

  const pkg = data.packages.find((p) => p.name === project.npm);
  const language = data.repoLanguage?.[project.repo] || project.tech[0] || "";
  const owner = project.repo ? project.repo.split("/")[0] : null;

  const desc = wrap(cardText(project), W - pad * 2, descSize, lines)
    .map((line, i) => text(pad, descTop + i * lineH, line, { size: descSize, fill: th.secondary }));

  const foot = [
    pkg ? `v${pkg.version}` : null,
    pkg?.downloads ? `${fmt(pkg.downloads)} installs/mo` : null,
  ].filter(Boolean).join("  ·  ");

  return svg(W, H, `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${th.surface}" stroke="${th.axis}" stroke-width="1"/>
${text(pad, 36, project.name, { size: 15.5, weight: 700, fill: th.brand })}
${text(pad, 56, [owner, project.role].filter(Boolean).join(" · "), { size: 10.5, weight: 600, fill: th.muted })}
${desc.join("\n")}
<line x1="${pad}" y1="${divider}" x2="${W - pad}" y2="${divider}" stroke="${th.grid}" stroke-width="1"/>
${language ? `<circle cx="${pad + 4.5}" cy="${footY - 4}" r="4.5" fill="${th.brand}"/>
${text(pad + 16, footY, language, { size: 11, weight: 600, fill: th.secondary })}` : ""}
${foot ? text(W - pad, footY, foot, { size: 11, fill: th.secondary, anchor: "end" }) : ""}`, th);
}

/* ── nav pills ──────────────────────────────────────────────────────────────
 * GitHub markdown has no button and no CSS, so a link bar is a row of images,
 * each wrapped in its own anchor. Drawing them here rather than pulling badges
 * from shields.io keeps the bar on the same palette as the charts, costs the
 * reader no third-party request, and cannot break when that service is down.
 * Solid for the portfolio sections (the primary route into the site), outlined
 * for links that leave it. */
function pill(label, variant, mode) {
  const th = THEME[mode];
  const size = 12, H = 30, padX = 15;
  const W = Math.round(width(label, size) + padX * 2);
  const solid = variant === "solid";
  const box = solid
    ? `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="7" fill="${th.brand}"/>`
    : `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="7" fill="${th.brandSoft}" stroke="${th.axis}" stroke-width="1"/>`;
  return svg(W, H, `${box}
${text(W / 2, 19.5, label, { size, weight: 600, anchor: "middle", fill: solid ? th.onBrand : th.primary })}`, th);
}

/* ── lock ───────────────────────────────────────────────────────────────────
 * Eleven pixels of padlock, set beside a link to a repository only its owner can
 * open. The one asset here drawn without a background rectangle: it sits inline
 * in a line of text, so it has to take the colour of whatever is behind it
 * instead of carrying its own. Muted, not accent — it is a caveat, not a badge.
 */
function lockIcon(mode) {
  const th = THEME[mode];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="12" viewBox="0 0 10 12" role="img">
<path d="M2.85,5.3V3.55a2.15,2.15 0 0 1 4.3,0V5.3" fill="none" stroke="${th.muted}" stroke-width="1.3"/>
<rect x="0.85" y="5.3" width="8.3" height="6.2" rx="1.5" fill="${th.muted}"/>
</svg>
`;
}

/* ── stack board ────────────────────────────────────────────────────────────
 * One image rather than one pill per technology: nothing here is a link, so
 * splitting it into forty files would buy nothing and cost forty requests. Laid
 * out with wrapping so a row of long names does not run off the canvas. */
function stackBoard(stack, mode) {
  const th = THEME[mode];
  const W = 1060, labelW = 150, size = 12, chipH = 26, gapX = 8, gapY = 8, padX = 13;
  const rowGap = 18;
  let y = 4;
  const parts = [];

  for (const group of stack.groups) {
    const startY = y;
    let x = labelW, lines = 1;
    const chips = [];
    for (const item of group.items) {
      const w = Math.round(width(item, size) + padX * 2);
      if (x + w > W) { x = labelW; y += chipH + gapY; lines++; }
      chips.push(`<rect x="${x}" y="${y}" width="${w}" height="${chipH}" rx="6" fill="${th.brandSoft}" stroke="${th.axis}" stroke-width="1"/>
${text(x + w / 2, y + 17.5, item, { size, weight: 500, fill: th.primary, anchor: "middle" })}`);
      x += w + gapX;
    }
    // The group label is centred against the block its chips occupy, so a
    // two-line group does not leave its label floating at the top.
    const blockH = lines * chipH + (lines - 1) * gapY;
    parts.push(text(0, startY + blockH / 2 + 4, group.label.toUpperCase(),
      { size: 10, weight: 700, fill: th.muted }));
    parts.push(chips.join("\n"));
    y += chipH + rowGap;
  }

  return svg(W, y - rowGap + 6, parts.join("\n"), th);
}

/* ── chart: KPI strip ───────────────────────────────────────────────────── */

function kpiStrip(data, mode) {
  const th = THEME[mode];
  const tiles = [
    [fmt(data.repos.length), "Repositories"],
    [fmt(data.orgs), "Organisations"],
    [fmt(data.packages.length), "Packages"],
    [fmt(data.downloads30d || 0), "Installs · 30 days"],
    [fmt(data.commits12mo), "My commits · 12 mo"],
    [fmt(data.commitsTotal), "My commits · total"],
  ];
  // H must clear the tallest glyph plus the label: the value sits on a baseline
  // at y=50 with a 34px face and the label baseline at y=72, so anything under
  // ~86 clips the numbers top and bottom.
  const W = 1060, H = 86, pad = 4, cw = (W - pad * 2) / tiles.length;

  const body = tiles.map(([value, label], i) => {
    const cx = pad + cw * i + cw / 2;
    const divider = i === 0 ? ""
      : `<line x1="${pad + cw * i}" y1="24" x2="${pad + cw * i}" y2="${H - 24}" stroke="${th.grid}" stroke-width="1"/>`;
    return `${divider}
${text(cx, 50, value, { size: 34, weight: 700, fill: th.primary, anchor: "middle" })}
${text(cx, 72, label.toUpperCase(), { size: 10, weight: 600, fill: th.muted, anchor: "middle" })}`;
  }).join("\n");

  return svg(W, H, body, th);
}

/* ── chart: ranked horizontal bars ───────────────────────────────────────
 * Comparing magnitudes, not reading a part-to-whole split, so these are separate
 * bars rather than one stacked bar. That matters with the real data: language
 * shares are heavily skewed, and inside a stacked bar the small classes collapse
 * into slivers narrower than the segment gap — literally invisible. Separate
 * rows give every class a readable bar and a direct label. */
function barRows(items, mode, { unit = "%", title = "", width: W = 520, labelPct = 0.26, rows = 0, padLeft = 0, padRight = 0 } = {}) {
  const th = THEME[mode];
  const labelW = Math.round(W * labelPct), valueW = Math.round(W * 0.12);
  const rowH = 28, barH = 11, r = 5;
  const top = title ? 34 : 8;
  // `rows` reserves a fixed number of slots so two charts sitting side by side in
  // the grid end up the same height. Without it the browser baseline-aligns them
  // and the shorter one visibly sags.
  const slots = Math.max(rows, items.length);
  // Labels are clipped to what actually fits: a long repository name at 11px
  // would otherwise run straight under its own bar.
  const maxChars = Math.max(6, Math.floor((labelW - 8) / 6.1));
  const clip = (s) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
  const head = title ? text(0, 16, title, { size: 12, weight: 700, fill: th.primary }) : "";

  if (!items.length) {
    return svg(W + padLeft + padRight, top + 40, `<g transform="translate(${padLeft},0)">${head}
${text(W / 2, top + 20, "No data yet", { size: 12, fill: th.muted, anchor: "middle" })}</g>`, th);
  }

  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const max = Math.max(...items.map((i) => i.value)) || 1;
  const trackW = W - labelW - valueW;
  const label = (i) => (i.name === "__other__" ? "Other" : i.name);
  const value = (i) => unit === "%" ? `${((i.value / total) * 100).toFixed(1)}%` : fmt(i.value);

  const body = items.map((item, i) => {
    const y = top + i * rowH, mid = y + barH / 2;
    // Scaled against the largest value, not the total, so a small class still
    // renders as a bar you can see and compare.
    const w = Math.max(2, (item.value / max) * trackW);
    return `${text(0, mid + 4, clip(label(item)), { size: 11, weight: 600, fill: th.primary })}
<rect x="${labelW}" y="${y}" width="${trackW}" height="${barH}" rx="${r}" fill="${th.grid}"/>
<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="${r}" fill="${th.brand}"/>
${text(W, mid + 4, value(item), { size: 11, fill: th.secondary, anchor: "end" })}`;
  }).join("\n");

  // Horizontal breathing room is baked into the canvas rather than added between
  // the images in markdown: the only separator that survives GitHub's sanitiser
  // is a run of &nbsp;, whose width depends on the reader's font. Padding here is
  // measured in the chart's own units and scales with it.
  return svg(W + padLeft + padRight, top + slots * rowH + 6,
    `<g transform="translate(${padLeft},0)">\n${head}\n${body}\n</g>`, th);
}

/* ── chart: weekly commit activity ──────────────────────────────────────── */

function activityChart(timeline, mode, title = "") {
  const th = THEME[mode];
  const W = 1060, H = title ? 210 : 190;
  const m = { top: title ? 38 : 16, right: 8, bottom: 28, left: 40 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const head = title ? text(0, 16, title, { size: 12, weight: 700, fill: th.primary }) : "";

  if (timeline.length < 2) {
    return svg(W, m.top + 50, `<g>${head}
${text(W / 2, m.top + 24, "No data yet", { size: 12, fill: th.muted, anchor: "middle" })}</g>`, th);
  }

  const max = Math.max(...timeline.map((w) => w.total), 1);
  // Even, with headroom, so the midpoint tick is whole and the peak does not
  // touch the top gridline.
  const niceMax = Math.max(2, Math.ceil((max * 1.1) / 2) * 2);
  const X = (i) => m.left + (i / (timeline.length - 1)) * iw;
  const Y = (v) => m.top + ih - (v / niceMax) * ih;

  const grid = [0, niceMax / 2, niceMax].map((v) =>
    `<line x1="${m.left}" y1="${Y(v)}" x2="${W - m.right}" y2="${Y(v)}" stroke="${th.grid}" stroke-width="1"/>
${text(m.left - 8, Y(v) + 4, String(Math.round(v)), { size: 10, fill: th.muted, anchor: "end" })}`
  ).join("\n");

  const line = timeline.map((w, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(w.total).toFixed(1)}`).join("");
  const area = `${line}L${X(timeline.length - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z`;

  // Evenly spaced ticks. Labelling every month change instead drops whichever
  // months fall too close together, which reads as a bug rather than thinning.
  const monthFmt = new Intl.DateTimeFormat("en", { month: "short" });
  const ticks = 8;
  const xLabels = Array.from({ length: ticks }, (_, k) => {
    const i = Math.round((k / (ticks - 1)) * (timeline.length - 1));
    const anchor = k === 0 ? "start" : k === ticks - 1 ? "end" : "middle";
    return text(X(i), H - 8, monthFmt.format(new Date(timeline[i].week * 1000)),
      { size: 10, fill: th.muted, anchor });
  }).join("\n");

  return svg(W, H, `<g>
${head}
${grid}
<path d="${area}" fill="${th.brandSoft}"/>
<path d="${line}" fill="none" stroke="${th.brand}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
<line x1="${m.left}" y1="${Y(0)}" x2="${W - m.right}" y2="${Y(0)}" stroke="${th.axis}" stroke-width="1"/>
${xLabels}
</g>`, th);
}

/* ── markdown rendering ─────────────────────────────────────────────────── */

/* Assets live under the document that uses them: everything the profile page
 * shows sits directly in profile/assets, and anything a detail page needs of its
 * own goes in profile/assets/pages/<page id>. So a folder answers "who is this
 * for" without anyone having to grep the markdown, and deleting a page takes its
 * pictures with it. `dir` is that sub-path, empty for the README. */
const RAW = (login, dir = "") =>
  `https://raw.githubusercontent.com/${login}/${login}/${BRANCH}/profile/assets${dir ? `/${dir}` : ""}`;
const PAGE = (login, id) => `https://github.com/${login}/${login}/blob/${BRANCH}/profile/pages/${id}.md`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function picture(login, base, alt, w = "100%", dir = "") {
  return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${RAW(login, dir)}/${base}-dark.svg">
  <img alt="${esc(alt)}" src="${RAW(login, dir)}/${base}-light.svg" width="${w}">
</picture>`;
}

/** Two half-width charts per row. Plain images rather than a table: GitHub draws
 *  a border around every table, which would box each chart in a frame. */
function chartGrid(login, pairs) {
  // Left-aligned, not centred: centring splits the leftover width into two side
  // margins, which pushes the tiles' titles out of line with the full-width
  // chart below them by an amount that changes with viewport width.
  return pairs.map(([a, b]) => `<p>
${picture(login, a.base, a.alt, "48%")}
${picture(login, b.base, b.alt, "48%")}
</p>`).join("\n\n");
}

/** A row of linked pill images. No whitespace between the anchors on a line
 *  would butt them together; a single space is what gives the bar its spacing,
 *  since GitHub strips any style attribute that could do it properly. */
function navBar(login, items) {
  return items.map((it) => {
    const name = `nav-${slug(it.label)}`;
    return `<a href="${it.href}"><picture><source media="(prefers-color-scheme: dark)" srcset="${RAW(login)}/${name}-dark.svg"><img alt="${esc(it.label)}" src="${RAW(login)}/${name}-light.svg" height="30"></picture></a>`;
  }).join(" ");
}

/* ── per-project badges (shields.io) ─────────────────────────────────────
 * The one place a third-party service earns its keep: shields.io re-reads GitHub
 * and npm on every page load, so version, licence and last-commit are live
 * without this repository committing anything.
 *
 * Used only for per-repository facts, because that is all it can do. Tested
 * 2026-08-06: github-readme-stats returned DEPLOYMENT_PAUSED,
 * github-profile-summary-cards 500, star-history 503 and contrib.rocks would not
 * connect — so every aggregate on this profile stays self-generated. shields.io's
 * dynamic-JSON badge cannot stand in either: pointed at api.github.com it renders
 * "invalid", since it calls the API unauthenticated. */
const SHIELD = "https://img.shields.io";
const STYLE = "style=flat-square&color=0969da&labelColor=1f2328";

function badges(p) {
  const img = (url, alt) => `<img alt="${esc(alt)}" src="${url}">`;
  const out = [];
  if (p.npm) {
    out.push(img(`${SHIELD}/npm/v/${p.npm}?${STYLE}&label=npm`, "npm version"));
    out.push(img(`${SHIELD}/npm/dm/${p.npm}?${STYLE}&label=downloads`, "npm downloads"));
  }
  if (p.repo) {
    out.push(img(`${SHIELD}/github/license/${p.repo}?${STYLE}&label=license`, "license"));
    out.push(img(`${SHIELD}/github/last-commit/${p.repo}?${STYLE}&label=last%20commit`, "last commit"));
  }
  return out.join(" ");
}

/** Two linked cards per row. Not a table: GitHub frames every table cell, and
 *  each card already draws its own border — the two together read as a box in a
 *  box. Plain images inside a paragraph, same trick as the chart grid. */
function featuredGrid(login, projects) {
  const cell = (p) =>
    `<a href="https://github.com/${p.repo}"><picture><source media="(prefers-color-scheme: dark)" srcset="${RAW(login)}/card-${slug(p.name)}-dark.svg"><img alt="${esc(p.name)}" src="${RAW(login)}/card-${slug(p.name)}-light.svg" width="48%"></picture></a>`;
  const rows = [];
  for (let i = 0; i < projects.length; i += 2) {
    rows.push(`<p>\n${projects.slice(i, i + 2).map(cell).join("\n")}\n</p>`);
  }
  return rows.join("\n\n");
}

/* ── quick access ───────────────────────────────────────────────────────────
 * Rows of bare repository links near the top, the way a bookmarks bar works.
 * This is the half of the page that is for its owner rather than for a visitor:
 * fifteen slots, ten of them nailed down by hand and five that reorder
 * themselves by what was pushed to last.
 *
 * The rows are unlabelled and separated by a rule, which is all the grouping a
 * reader needs — a heading over three links describes less than the links do.
 * Right-aligned, so the ragged ends of a link row line up instead of leaving a
 * different gap on every line.
 *
 * The two markers stay quiet: italic for the automatic five, a padlock for what
 * is private. Neither is explained anywhere, on purpose. A padlock needs no
 * caption, and this block is for the person who already knows.
 */
function quickAccess(content, data, login) {
  const q = content.quickAccess;
  if (!q) return "";

  const pinned = (q.pinned || []).slice(0, q.maxPinned ?? 10);
  if ((q.pinned || []).length > pinned.length) {
    warn(`quickAccess.pinned holds ${q.pinned.length} entries but maxPinned is ${q.maxPinned} — the rest are not shown`);
  }

  const lock = `<picture><source media="(prefers-color-scheme: dark)" srcset="${RAW(login)}/lock-dark.svg"><img alt="private" src="${RAW(login)}/lock-light.svg" height="11"></picture>`;

  const items = [
    ...pinned.map((p) => ({ ...p, label: p.label || p.repo.split("/")[1] })),
    // An automatic entry lands in a row by who owns it, since that is the only
    // thing about it this side knows: mine goes under Personal, anything else
    // under Organisations. Those keep the owner in the label — two accounts here
    // both have a repository whose bare name says nothing about whose it is.
    ...(data.recent || []).map((r) => {
      const mine = r.owner.toLowerCase() === login.toLowerCase();
      return { repo: r.repo, label: mine ? r.label : r.repo, row: mine ? "personal" : "orgs", recent: true };
    }),
  ];

  const rows = (q.rows || []).map((row) => {
    const links = items.filter((i) => i.row === row.id).map((i) => {
      const name = i.recent ? `<em>${esc(i.label)}</em>` : esc(i.label);
      return `<a href="https://github.com/${i.repo}">${name}</a>${i.private ? ` ${lock}` : ""}`;
    });
    // An empty row is dropped rather than left as a rule with nothing under it.
    return links.length ? `<p align="right">${links.join(" / ")}</p>` : null;
  }).filter(Boolean);

  return rows.length ? `<hr>\n${rows.join("\n<hr>\n")}\n<hr>` : "";
}

/** One line under the cards pointing at the full listings. The nav pills at the
 *  top go to the same places; this repeats them where someone who just finished
 *  reading the cards is actually looking. */
function moreLine(content, login) {
  const links = content.groups.map((g) => `<a href="${PAGE(login, g.id)}">${esc(g.label)}</a>`)
    .concat(`<a href="${PAGE(login, "stack")}">${esc(content.stack.heading)}</a>`);
  return `<sub>${esc(content.copy.featured.more)}: ${links.join(" · ")}</sub>`;
}

function renderPage(content, group, login) {
  const c = content.copy.portfolio;
  const stamp = new Date().toISOString().slice(0, 10);
  const items = content.projects.filter((p) => p.group === group.id);

  const body = items.map((p) => {
    const href = `https://github.com/${p.repo}`;
    const heading = `<h2><a href="${href}">${esc(p.name)}</a></h2>`;
    const meta = p.role;
    const badgeRow = badges(p);
    const install = p.npm ? `\n\`\`\`bash\nnpm install ${p.npm}\n\`\`\`\n` : "";
    const tech = p.tech.length
      ? `\n<p><sub>${p.tech.map((t) => `<code>${esc(t)}</code>`).join(" ")}</sub></p>\n` : "";
    return `${heading}

<p><sub><b>${esc(meta)}</b></sub></p>
${badgeRow ? `\n<p>${badgeRow}</p>\n` : ""}
${esc(p.desc)}
${install}${tech}
---`;
  }).join("\n\n");

  return `<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json + the GitHub API by
  scripts/generate-profile.mjs. Last generated: ${stamp}
-->

# ${esc(group.label)}

${esc(group.page)}

---

${body || "_No data yet_"}

<sub><a href="https://github.com/${login}">← ${c.back}</a></sub>
`;
}

function renderStackPage(content, login) {
  const c = content.copy.portfolio;
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = content.stack.groups.map((g) =>
    `| **${esc(g.label)}** | ${g.items.map((i) => `\`${esc(i)}\``).join(" · ")} |`).join("\n");

  return `<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json by scripts/generate-profile.mjs.
  Last generated: ${stamp}
-->

# ${esc(content.stack.heading)}

Everything listed here is in a repository in this account or one I contribute to.
Nothing is here because I read about it once.

| | |
|---|---|
${rows}

${picture(login, "stack", "Stack")}

<sub><a href="https://github.com/${login}">← ${c.back}</a></sub>
`;
}

function renderReadme(content, data) {
  const login = content.user.login;
  const c = content.copy;
  const stamp = new Date().toISOString().slice(0, 10);
  const featured = content.projects.filter((p) => p.featured);

  const sections = content.nav.sections.map((s) => ({
    label: s.label,
    href: s.to === "stack" ? PAGE(login, "stack") : PAGE(login, s.to),
  }));

  const grid = chartGrid(login, [
    [{ base: "languages", alt: c.metrics.languages }, { base: "peryear", alt: c.metrics.peryear }],
    [{ base: "perrepo", alt: c.metrics.perrepo }, { base: "perowner", alt: "My commits by owner" }],
  ]);

  // No <h1>: GitHub prints the account's name and bio in the sidebar beside this
  // column, so a heading here would be the third copy of the same two lines.
  const bannerAlt = `What I work on: ${content.banner.facets.map((f) => f.label).join(", ")}`;

  return `<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json + the GitHub API by
  scripts/generate-profile.mjs, on a schedule. Edit the JSON, not this.
  Last generated: ${stamp}
-->

${picture(login, "banner", bannerAlt)}

<p align="center">${navBar(login, sections)}</p>

<p align="center">${navBar(login, content.nav.elsewhere)}</p>

${quickAccess(content, data, login)}

${picture(login, "stats", "Profile statistics")}

## ${content.about.heading}

${content.about.body.join("\n\n")}

> ${content.about.quote}

## ${c.featured.heading}

${featuredGrid(login, featured)}

${moreLine(content, login)}

## ${c.metrics.heading}

<sub>${c.metrics.note}</sub>

${grid}

${picture(login, "activity", c.metrics.activity)}

## ${content.stack.heading}

${picture(login, "stack", "Stack")}

---

<p align="center">
  <em>${esc(c.footer)}</em><br>
  <a href="${content.user.linkedin}">LinkedIn</a> ·
  <a href="${content.user.orcid}">ORCID</a> ·
  <a href="${content.user.npm}">npm</a> ·
  <a href="https://github.com/${login}">GitHub</a><br>
  <sub>${esc(content.user.location)} · updated ${stamp} · generated by <a href="https://github.com/${login}/${login}/blob/${BRANCH}/scripts/generate-profile.mjs">generate-profile.mjs</a></sub>
</p>
`;
}

/* ── main ───────────────────────────────────────────────────────────────── */

/** Delete files under `dir` that this run did not write, and any folder left
 *  empty afterwards. `keep` holds paths relative to `dir`, matching how the
 *  writer recorded them. */
async function prune(dir, keep, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await prune(full, keep, rel);
      if ((await readdir(full)).length === 0) {
        await rmdir(full);
        console.log(`  - removed empty ${rel}/`);
      }
      continue;
    }
    if (keep.has(rel)) continue;
    await unlink(full);
    console.log(`  - removed stale ${rel}`);
  }
}

async function main() {
  const content = JSON.parse(await readFile(join(ROOT, "profile", "data", "content.json"), "utf8"));

  // Nothing without a public repository reaches the page. Private work used to be
  // listed as unlinked cards; every one of those was a name a visitor could not
  // check and could not open. Enforced here rather than by remembering to leave
  // it out of the JSON.
  const unlinked = content.projects.filter((p) => !p.repo);
  if (unlinked.length) warn(`dropped, no public repository: ${unlinked.map((p) => p.name).join(", ")}`);
  content.projects = content.projects.filter((p) => p.repo);

  // PROFILE_FIXTURE=<path> renders from a saved snapshot instead of calling the
  // API — useful for working on layout without spending API budget.
  // PROFILE_DUMP=<path> writes the snapshot back out.
  const data = process.env.PROFILE_FIXTURE
    ? JSON.parse(await readFile(process.env.PROFILE_FIXTURE, "utf8"))
    : await collect(content);
  if (process.env.PROFILE_DUMP) {
    await writeFile(process.env.PROFILE_DUMP, JSON.stringify(data, null, 2), "utf8");
  }

  await mkdir(ASSETS, { recursive: true });
  await mkdir(PAGES, { recursive: true });

  console.log("Rendering assets …");
  const written = new Set();
  const featured = content.projects.filter((p) => p.featured);
  const featuredLines = Math.max(1, ...featured.map(cardLines));
  for (const mode of MODES) {
    // `dir` is the sub-folder under profile/assets, keyed to the document that
    // uses the asset: "" for the README, "pages/<id>" for a detail page.
    const w = async (n, c, dir = "") => {
      const file = `${n}-${mode}.svg`;
      written.add(dir ? `${dir}/${file}` : file);
      const target = join(ASSETS, ...(dir ? dir.split("/") : []));
      await mkdir(target, { recursive: true });
      await writeFile(join(target, file), c, "utf8");
    };

    for (const it of content.nav.sections) await w(`nav-${slug(it.label)}`, pill(it.label, "solid", mode));
    for (const it of content.nav.elsewhere) await w(`nav-${slug(it.label)}`, pill(it.label, "ghost", mode));
    for (const p of featured) await w(`card-${slug(p.name)}`, repoCard(p, data, mode, featuredLines));

    await w("banner", banner(content, mode));
    await w("lock", lockIcon(mode));
    await w("stack", stackBoard(content.stack, mode));
    await w("stats", kpiStrip(data, mode));

    const m = content.copy.metrics;
    // Each grid row is rendered at a shared height so the two tiles line up.
    const rowA = Math.max(data.languages.length, data.perYear.length);
    const rowB = Math.max(data.perRepo.length, data.perOwner.length);
    // Left-column tiles pad on the right, right-column tiles pad on the left, so
    // the whole gutter lands between them and the outer edges stay flush.
    const L = { padRight: GUTTER }, R = { padLeft: GUTTER };

    await w("languages", barRows(data.languages, mode, { ...L, title: m.languages, rows: rowA }));
    await w("peryear", barRows(data.perYear, mode, { ...R, unit: "count", title: m.peryear, rows: rowA }));
    // Repository names are long; give the label column extra room before clipping.
    await w("perrepo", barRows(data.perRepo, mode, { ...L, unit: "count", title: m.perrepo, rows: rowB, labelPct: 0.46 }));
    await w("perowner", barRows(data.perOwner, mode, { ...R, unit: "count", title: m.perowner, rows: rowB, labelPct: 0.46 }));
    await w("activity", activityChart(data.timeline, mode, m.activity));
  }

  console.log("Rendering pages …");
  const pages = new Set(["stack.md"]);
  await writeFile(join(ROOT, "README.md"), renderReadme(content, data), "utf8");
  for (const group of content.groups) {
    pages.add(`${group.id}.md`);
    await writeFile(join(PAGES, `${group.id}.md`), renderPage(content, group, content.user.login), "utf8");
  }
  await writeFile(join(PAGES, "stack.md"), renderStackPage(content, content.user.login), "utf8");

  // Everything under assets/ and pages/ is output, so anything left there that
  // this run did not write is output of a shape the JSON no longer describes:
  // the pill for a renamed section, the card for a project that moved. Nothing
  // links to it and nothing would ever notice it again, so it goes.
  await prune(ASSETS, written);
  await prune(PAGES, pages);

  console.log(`\nDone. ${data.repos.length} repos · ${data.orgs} orgs · ${data.packages.length} packages · ${data.commitsTotal} own commits (${data.commits12mo} in 12 mo)`);
  if (warned.length) console.log(`${warned.length} warning(s) above.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
