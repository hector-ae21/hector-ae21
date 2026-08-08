/**
 * An output directory that knows what it wrote.
 *
 * Everything under profile/assets and profile/pages is generated, so anything
 * left there that a run did not write is output of a shape content.json no
 * longer describes: the pill for a renamed section, the card for a project that
 * moved. Nothing links to it and nothing would ever notice it again, so the run
 * sweeps it out rather than leaving it to rot.
 */

import { mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class OutputDirectory {
  #written = new Set();

  constructor(root, log) {
    this.root = root;
    this.log = log;
  }

  /** @param relative path inside this directory, with forward slashes. */
  async write(relative, contents) {
    this.#written.add(relative);
    const target = join(this.root, ...relative.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }

  /** Records a path as expected without writing it — for files another writer
   *  produces but this directory still owns for pruning purposes. */
  keep(relative) {
    this.#written.add(relative);
  }

  async prune() {
    await mkdir(this.root, { recursive: true });
    await this.#sweep(this.root, "");
  }

  async #sweep(dir, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.#sweep(full, relative);
        // A folder that only existed to hold deleted files goes with them.
        if ((await readdir(full)).length === 0) {
          await rmdir(full);
          this.log.removed(`removed empty ${relative}/`);
        }
        continue;
      }

      if (this.#written.has(relative)) continue;
      await unlink(full);
      this.log.removed(`removed stale ${relative}`);
    }
  }
}

/** The assets directory, which names its files by drawing and colour scheme. */
export class AssetDirectory extends OutputDirectory {
  /** @param dir sub-folder keyed to the document that uses the asset: "" for the
   *             README, "pages/<id>" for a detail page. */
  async writeDrawing(name, mode, drawing, dir = "") {
    const file = `${name}-${mode}.svg`;
    await this.write(dir ? `${dir}/${file}` : file, drawing.render());
  }
}
