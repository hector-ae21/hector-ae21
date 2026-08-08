/**
 * The palette, one instance per colour scheme.
 *
 * Every chart is single-hue: bar length and line height carry the values, row
 * labels carry the identities. Nothing is encoded in colour alone, so no
 * categorical ramp is needed and colour-vision separation is not in play.
 *
 * The accent is GitHub's own blue, stepped per mode and checked against the real
 * canvases the images land on rather than a reference surface:
 *   light  #0969da on #ffffff → 5.19:1  (>= 3:1 for marks, >= 4.5:1 for text)
 *   dark   #58a6ff on #0d1117 → 7.49:1
 * Both clear the text threshold, not only the 3:1 one for marks, because some of
 * these images set label text on the accent rather than only drawing with it.
 */

const PALETTES = {
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

/** The system stack, named rather than shipped: a webfont in an SVG would be a
 *  second request for a drawing whose whole point is being one small file. */
export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export class Theme {
  constructor(mode) {
    if (!PALETTES[mode]) throw new Error(`unknown theme: ${mode}`);
    this.mode = mode;
    Object.assign(this, PALETTES[mode]);
  }
}
