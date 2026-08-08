/**
 * The GitHub REST API, with the two failure modes that matter told apart.
 *
 * A missing or unreadable resource is empty and the run continues. Rate limiting
 * is fatal and always has been: swallowing it would let a throttled run replace
 * real figures with zeros and then commit them, which is worse than not running.
 */
export class GitHubClient {
  #token;
  #log;
  #userAgent;

  constructor({ token, log, userAgent = "hector-ae21-profile-generator" }) {
    this.#token = token;
    this.#log = log;
    this.#userAgent = userAgent;
  }

  get authenticated() {
    return Boolean(this.#token);
  }

  /** @returns the parsed body, or null when the resource is empty for us. */
  async get(path, { retries202 = 5 } = {}) {
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": this.#userAgent,
      "x-github-api-version": "2022-11-28",
    };
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers });

      // Statistics endpoints answer 202 while GitHub warms the cache.
      if (res.status === 202 && attempt < retries202) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      if (res.status === 403 || res.status === 429) {
        this.#throwIfThrottled(res);
        this.#log.warn(`403 on ${path} (not rate limiting) — treating as empty`);
        return null;
      }
      if ([202, 404].includes(res.status)) {
        this.#log.warn(`${res.status} on ${path} — treating as empty`);
        return null;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
      return (await res.json()) ?? null;
    }
  }

  /** A 403 is only fatal when the budget is actually spent; GitHub also uses it
   *  for resources this token simply cannot see. */
  #throwIfThrottled(res) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining !== "0" && res.status !== 429) return;

    const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000;
    const mins = reset ? Math.ceil((reset - Date.now()) / 60000) : "?";
    throw new Error(
      `GitHub API rate limit exhausted (resets in ~${mins} min).\n` +
      (this.#token ? "" : "No GITHUB_TOKEN set — unauthenticated runs get only 60 requests/hour.\n") +
      "Refusing to render: a throttled run would replace real figures with zeros."
    );
  }
}
