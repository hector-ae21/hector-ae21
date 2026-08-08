/**
 * The npm registry, and the separate service that counts installs.
 *
 * They are two hosts with two shapes, which is why a package can resolve here
 * and still have no download record: a null from `monthlyDownloads` is normal,
 * not a failure.
 */
export class NpmRegistry {
  #log;

  constructor({ log }) {
    this.#log = log;
  }

  /** The version on the `latest` dist-tag, or null if the name is unpublished. */
  async version(pkg) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${pkg}`, {
        // The abbreviated document: this needs one field out of a manifest that
        // is otherwise megabytes of version history.
        headers: { accept: "application/vnd.npm.install-v1+json" },
      });
      if (!res.ok) return null;
      return (await res.json())?.["dist-tags"]?.latest ?? null;
    } catch {
      this.#log.warn(`npm registry unreachable for ${pkg}`);
      return null;
    }
  }

  /** Installs over the last 30 days. The one usage figure on this profile that
   *  is not a commit: it says somebody other than the author runs the code,
   *  which a star does not. */
  async monthlyDownloads(pkg) {
    try {
      const res = await fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`);
      if (!res.ok) return null;
      const n = (await res.json())?.downloads;
      return Number.isFinite(n) ? n : null;
    } catch {
      this.#log.warn(`npm downloads unreachable for ${pkg}`);
      return null;
    }
  }
}
