/** String helpers shared by the drawings and the markdown. */

/** Escapes for both XML and the HTML GitHub allows in markdown — the same five
 *  characters matter in each, so one function covers both. */
export const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 1959 → "2k", 621 → "621". Thousands are rounded to one decimal below ten
 *  thousand and to none above, because a tile is read at a glance and the extra
 *  digit buys nothing at that size. */
export const formatCount = (n) => n >= 1000
  ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`.replace(".0k", "k")
  : String(Math.round(n));

/** A label turned into a filename fragment. */
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
