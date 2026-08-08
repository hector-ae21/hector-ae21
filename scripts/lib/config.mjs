/**
 * Where everything lives, and the two knobs the environment can turn.
 *
 * Paths are resolved from this file rather than from the working directory, so
 * the generator behaves the same whether it is run from the repository root, from
 * scripts/, or by a scheduled job that starts somewhere else entirely.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root: scripts/lib/ is two levels down from it. */
export const ROOT = join(HERE, "..", "..");

export const PATHS = {
  root: ROOT,
  content: join(ROOT, "profile", "data", "content.json"),
  assets: join(ROOT, "profile", "assets"),
  pages: join(ROOT, "profile", "pages"),
  readme: join(ROOT, "README.md"),
};

/** Every drawing is rendered once per colour scheme and picked by <picture>. */
export const MODES = ["light", "dark"];

/** Asset URLs are absolute and branch-pinned, because a profile README is read
 *  from github.com/<user> where relative paths resolve to nothing useful. */
export const BRANCH = process.env.PROFILE_BRANCH || "main";

/** Path to this generator, as written in the footer of what it generates. */
export const GENERATOR = "scripts/generate-profile.mjs";

/* Half the gutter between two grid tiles, in chart units. Applied only to a
 * tile's inner edge, so none of it is wasted as an outer margin and the outer
 * edges stay flush with the full-width charts above and below.
 *
 * It has to be generous: what faces across the gutter is the left tile's value
 * column against the right tile's label column — text against text. Anything
 * tighter and "79.7%" reads as though it belongs to the neighbour's row. */
export const GUTTER = 30;
