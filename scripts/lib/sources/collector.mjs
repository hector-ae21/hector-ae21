/**
 * Turns two APIs into the one plain object every drawing and page reads from.
 *
 * The distinguishing rule, and the reason none of this is a third-party widget:
 * every commit figure is *this user's own*, pulled per author out of
 * /stats/contributors, never the repository totals. Counting a repository's
 * whole history as personal output would be flattering and false — most of these
 * repositories have other authors, and three of them are forks whose history
 * predates any of this work.
 *
 * The return value stays a plain serialisable object on purpose: PROFILE_DUMP
 * writes it to disk and PROFILE_FIXTURE reads it back, so layout work can happen
 * without spending API budget.
 */

const WEEK = 604800; // seconds
const TIMELINE_WEEKS = 52;
const LANGUAGE_RANK_LIMIT = 6;
const REPOSITORY_RANK_LIMIT = 10;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

export class ProfileCollector {
  #github;
  #npm;
  #log;

  constructor({ github, npm, log }) {
    this.#github = github;
    this.#npm = npm;
    this.#log = log;
  }

  async collect(profile) {
    const login = profile.login;
    this.#log.step(`Fetching ${login} …`);

    const repos = await this.#repositories(profile);
    this.#log.detail(`${repos.length} public repositories tracked`);

    const totals = await this.#walkRepositories(repos, login);
    const timeline = this.#timeline(totals.weeks);
    const packages = await this.#packages(profile);

    // Merged pull requests, across everything GitHub can see — the one figure
    // here that measures work landing somewhere rather than work happening.
    // Authored would be the flattering number; merged is the one that means
    // something.
    const prs = await this.#github.get(
      `/search/issues?q=${encodeURIComponent(`type:pr author:${login} is:merged`)}&per_page=1`
    );

    return {
      login,
      repos,
      packages,
      prsMerged: prs?.total_count ?? 0,
      recent: this.#recentlyPushed(repos, profile),
      downloads30d: packages.reduce((s, p) => s + (p.downloads || 0), 0),
      commitsTotal: totals.mine,
      commits12mo: timeline.reduce((s, w) => s + w.total, 0),
      // Organisations counted by commits landed, not by membership: being in an
      // org says nothing, having written some of its code does.
      orgs: [...totals.owners].filter((o) => o !== login.toLowerCase()).length,
      timeline,
      languages: this.#rank(totals.languages, LANGUAGE_RANK_LIMIT),
      perRepo: this.#rank(totals.perRepo, REPOSITORY_RANK_LIMIT),
    };
  }

  /** Discover every public repository GitHub attributes a commit to this user.
   *  Search only chooses candidates; /stats/contributors below remains the
   *  source of truth for the actual figures. */
  async #repositories(profile) {
    const login = profile.login;
    const query = encodeURIComponent(`author:${login} is:public`);
    const names = new Set();
    let reportedTotal = 0;

    for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) {
      const result = await this.#github.get(
        `/search/commits?q=${query}&sort=committer-date&order=desc&per_page=${SEARCH_PAGE_SIZE}&page=${page}`
      );
      const items = Array.isArray(result?.items) ? result.items : [];
      reportedTotal = Math.max(reportedTotal, result?.total_count || 0);

      for (const item of items) {
        if (item.repository?.full_name && !item.repository.private) {
          names.add(item.repository.full_name);
        }
      }

      if (items.length < SEARCH_PAGE_SIZE) break;
    }

    if (reportedTotal > SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES) {
      this.#log.warn(
        `GitHub found ${reportedTotal} public commits, but Commit Search exposes at most ${SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES}; older repositories may be missing`
      );
    }

    const repos = [];
    for (const fullName of names) {
      const repo = await this.#github.get(`/repos/${fullName}`);
      if (repo && !repo.private) repos.push(repo);
      else this.#log.warn(`${fullName} is unreadable or private — dropped from the charts`);
    }

    return repos;
  }

  async #walkRepositories(repos, login) {
    const languages = new Map();  // language  → bytes attributable to this user
    const perRepo = new Map();    // repo      → this user's commits
    const weeks = new Map();      // week (ts) → this user's commits
    const owners = new Set();     // accounts this user has actually committed to
    let mine = 0;

    for (const repo of repos) {
      const stats = await this.#github.get(`/repos/${repo.full_name}/stats/contributors`);
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
        owners.add(repo.owner.login.toLowerCase());
        for (const w of me.weeks || []) {
          if (!w.c) continue;
          weeks.set(w.w, (weeks.get(w.w) || 0) + w.c);
        }
      }

      // Language bytes are scaled by this user's share of the repository's
      // commits. Unweighted, a fork of a mature upstream project would hand him
      // tens of thousands of lines of somebody else's PHP; a 2%-authored
      // repository would outweigh one he wrote alone.
      const share = repoTotal > 0 ? myTotal / repoTotal : (repo.fork ? 0 : 1);
      if (share > 0) {
        const bytes = (await this.#github.get(`/repos/${repo.full_name}/languages`)) || {};
        for (const [name, n] of Object.entries(bytes)) {
          languages.set(name, (languages.get(name) || 0) + n * share);
        }
      }

      this.#log.detail(`· ${repo.full_name} — ${myTotal} of ${repoTotal} commits`);
    }

    return { languages, perRepo, weeks, owners, mine };
  }

  /**
   * A dense 52-week series: /stats/contributors only returns weeks with activity
   * for this author, and a line chart drawn from those alone would compress the
   * quiet stretches out of existence and misreport when the work happened.
   *
   * The bucket keys have to land exactly on GitHub's, which are Sunday 00:00
   * UTC. Deriving them arithmetically from the epoch does not work — 1970-01-01
   * was a Thursday, so `floor(now / WEEK) * WEEK` produces Thursday-aligned keys
   * that match nothing and silently yield an all-zero chart.
   */
  #timeline(weeks) {
    const sunday = new Date();
    sunday.setUTCHours(0, 0, 0, 0);
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
    const lastWeek = Math.floor(sunday.getTime() / 1000);

    const timeline = Array.from({ length: TIMELINE_WEEKS }, (_, i) => {
      const week = lastWeek - (TIMELINE_WEEKS - 1 - i) * WEEK;
      return { week, total: weeks.get(week) || 0 };
    });

    // Cheap tripwire for the alignment above: activity that exists but lands in
    // no bucket is the signature of an off-by-one-day key, not of a quiet year.
    const seen = [...weeks.values()].reduce((s, n) => s + n, 0);
    const placed = timeline.reduce((s, w) => s + w.total, 0);
    if (seen > 0 && placed === 0) {
      this.#log.warn("no commit week matched the 52-week window — check the Sunday alignment");
    }
    return timeline;
  }

  async #packages(profile) {
    const packages = [];
    for (const project of profile.projects.filter((p) => p.npm)) {
      const version = await this.#npm.version(project.npm);
      if (!version) {
        this.#log.warn(`${project.npm} is not published on npm — no version badge`);
        continue;
      }
      packages.push({
        name: project.npm,
        version,
        downloads: await this.#npm.monthlyDownloads(project.npm),
      });
    }
    return packages;
  }

  /**
   * The self-filling half of the launcher: what was pushed to most recently,
   * minus anything already pinned by hand and anything on the exclude list.
   * `pushed_at` rather than commit dates on purpose — the question this answers
   * is "where was I last week", and a push is the event that says so.
   */
  #recentlyPushed(repos, profile) {
    const q = profile.quickAccess;
    const named = new Set(
      [...(q.pinned || []).map((p) => p.repo), ...(q.exclude || [])].map((s) => s.toLowerCase())
    );
    return repos
      .filter((r) => !named.has(r.full_name.toLowerCase()))
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
      .slice(0, q.recentCount ?? 5)
      .map((r) => ({ repo: r.full_name, label: r.name, owner: r.owner.login }));
  }

  /** Sort a name→value map descending and fold everything past `limit` into
   *  "Other", so a long tail cannot squeeze the readable rows off the chart. */
  #rank(map, limit) {
    const all = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (all.length <= limit) return all;
    return [
      ...all.slice(0, limit - 1),
      { name: "__other__", value: all.slice(limit - 1).reduce((s, x) => s + x.value, 0) },
    ];
  }
}
