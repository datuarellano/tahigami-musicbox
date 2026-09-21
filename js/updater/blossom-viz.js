// Blossom visualizer - bare renderer, extracted from the D1-40 Visualizer
// Electron app (~/Desktop/PROJECTS 2026/D1-40 Visualizer). That app also
// draws backgrounds, a 600-particle system, and a status HUD; none of that
// ships here. This module is just the SVG blossom artwork, its jitter
// shimmer, and the puncture ring that pops on each note.
//
// Dependency-free ESM, browser APIs only (DOMParser, DOMMatrix, Path2D,
// fetch, requestAnimationFrame, Canvas2D). No globals are read or written -
// everything lives on the BlossomViz instance - so this file drops into any
// page unmodified: raw <script type="module"> (Soundlab) or a bundler
// import (the Webpage Updater, Vite).
//
// Protocol: reads the firmware's `!TRIG p=<puncture> b=<blossom_type>
// a=<algo>` line (see printTrigLine() in src/debug_params.cpp, FW_PROTO 3+).
// parseTrigLine() is exported so a host's serial/websocket handler and this
// module's own instance method both parse it identically.

export const BLOSSOM_KEYS = ["DAHON", "BITUIN", "ALON", "BUNDOK"];
// ^ index == firmware's blossom_type (0=Leaf 1=Radial 2=Wave 3=Mountain),
// per BLOSSOM_COLORS' comment in tools/soundlab/public/app.js and
// indicateBlossom() in include/parameters.h.

const BASE_W = 2560; // native SVG viewBox - all four blossom assets share it
const BASE_H = 1440;
const BLOSSOM_FADE_MS = 400; // fade-in when switching to a new blossom key
const JITTER_DEFAULT = 1.0; // px of per-frame random translate (threads/punctures)
const JITTER_CHAOS = 2.0;
const BLINK_CYCLE_MS = 150; // chaos-mode alpha strobe period
const PUNCTURE_RADIUS = 24.053; // ring base radius, SVG units
const PUNCTURE_POP_MS = 300; // ring pop duration
const PUNCTURE_POP_SCALE = 1.4; // ring pop peak scale
const FIT_PUNCTURES_PADDING_FACTOR = 0.2; // 'punctures' fit: pad the puncture
// bbox by this fraction of its own size on each side, to leave room for the
// petals/threads that extend beyond the puncture points themselves

// Per-blossom color identity (petals render white; only punctures/ring take
// the blossom's color). bgUrl/textColor/textIds from the original app are
// dropped - no backgrounds, no word-outline text in this mini renderer.
const BLOSSOM_CONFIG = {
  BITUIN: { svgFile: "blossom_bituin.svg", punctureColor: [198, 158, 57], ringColor: [198, 158, 57] },
  DAHON: { svgFile: "blossom_dahon.svg", punctureColor: [17, 87, 0], ringColor: [17, 87, 0] },
  BUNDOK: { svgFile: "blossom_bundok.svg", punctureColor: [186, 15, 0], ringColor: [186, 15, 0] },
  ALON: { svgFile: "blossom_alon.svg", punctureColor: [0, 46, 120], ringColor: [0, 46, 120] },
};

// Everything drawn in a fixed color lives here, not hardcoded in the draw
// functions, so a host on a different background (e.g. the Webpage
// Updater's white page vs. Soundlab's near-black panel) can override it in
// one place instead of forking the renderer. Pass a `theme` option to the
// constructor, or call setTheme() later - see README "Theming".
const DEFAULT_THEME = {
  threadColor: [255, 255, 255], // petal/thread outline fill+stroke
  threadLineWidth: 2,
  defaultColor: [255, 255, 255], // any untagged path (role "other")
  defaultLineWidth: 1,
  punctureStrokeColor: [255, 255, 255], // ring drawn around each puncture dot
  punctureLineWidth: 12,
  ringHoleColor: [0, 0, 0], // the pop-ring's center disc - set this to your
  // page background color, not literal black, on anything but a dark page
  labelColor: [255, 255, 255], // debug puncture-index labels
  // Per-blossom accent (puncture fill + ring stroke). Keyed like
  // BLOSSOM_CONFIG; omit a key to keep that blossom's built-in color -
  // only given keys are overridden.
  blossomColors: {},
};

// Puncture centers in SVG-native (2560x1440) space, keyed by blossom then
// puncture id. These are the circle/path centers baked into the artwork
// (ported verbatim from the Visualizer's hand-extracted tables) - kept as a
// literal table rather than derived at parse time because DAHON's punctures
// are outline <path>s, not <circle>s, so there's no cheap runtime way to
// recover their centers from the SVG alone.
const puncturePositions = {
  BITUIN: [
    [0, 1282.322, 751.36], [1, 1137.606, 1116.727], [2, 1092.568, 934.375],
    [3, 875.509, 845.203], [4, 1087.862, 671.226], [5, 982.763, 397.9],
    [6, 1200.801, 569.586], [7, 1257.199, 323.273], [8, 1330.974, 507.161],
    [9, 1457.26, 473.839], [10, 1436.207, 672.187], [11, 1679.491, 752.689],
    [12, 1409.526, 859.078], [13, 1347.053, 1019.277],
  ],
  DAHON: [
    [0, 1061.183, 1120.221], [1, 1136.205, 1058.791], [2, 1006.522, 875.315],
    [3, 1006.522, 765.37], [4, 1081.125, 574.87], [5, 1239.681, 447.281],
    [6, 1354.089, 376.425], [7, 1480.765, 316.776], [8, 1533.809, 476.632],
    [9, 1543.889, 581.849], [10, 1554.624, 696.238], [11, 1541.858, 875.369],
    [12, 1385.954, 1046.444], [13, 1180.383, 954.973], [14, 1258.283, 880.831],
    [15, 1285.15, 786.462], [16, 1303.15, 687.967], [17, 1335.07, 599.37],
    [18, 1398.213, 522.144], [19, 1441.735, 440.632],
  ],
  BUNDOK: [
    [0, 1155.13, 1108.64], [1, 996.95, 1018.62], [2, 877.71, 934.97],
    [3, 936.54, 677.49], [4, 998.74, 765.26], [5, 1110.45, 427.83],
    [6, 1169.73, 682.21], [7, 1271.13, 331.36], [8, 1378.27, 586.66],
    [9, 1449.31, 508.96], [10, 1552.42, 843.17], [11, 1617.82, 681.43],
    [12, 1682.29, 934.08], [13, 1558.71, 1018.5], [14, 1392.39, 1108.64],
  ],
  ALON: [
    [0, 1173.08, 1075.69], [1, 1110.79, 757.5], [2, 1061.15, 909.54],
    [3, 989.62, 683.23], [4, 923.13, 830.08], [5, 876.44, 680.08],
    [6, 952.06, 520.63], [7, 1033.2, 609.46], [8, 1110.76, 675.11],
    [9, 1193.63, 610.31], [10, 1296.17, 446.51], [11, 1356.27, 680.61],
    [12, 1438.92, 364.31], [13, 1526.46, 684.23], [14, 1606.96, 602.3],
    [15, 1683.56, 757.63], [16, 1565.17, 988.66], [17, 1463.32, 828.59],
    [18, 1363.59, 763.26], [19, 1276.24, 825.32],
  ],
};

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function smoothStep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3.0 - 2.0 * clamped);
}

// SVG transform-attribute string -> DOMMatrix. Handles the subset of the
// transform grammar Affinity Designer's export actually emits.
function parseTransform(transformStr) {
  const transform = new DOMMatrix();
  const parts = transformStr.match(/\w+\([^)]*\)/g);
  if (!parts) return transform;
  return parts.reduce((matrix, part) => {
    const [name, rawParams] = part.split("(");
    const params = rawParams.replace(")", "").split(/[,\s]+/).filter(Boolean).map(Number);
    let next = new DOMMatrix();
    switch (name.trim()) {
      case "matrix":
        next = new DOMMatrix(params);
        break;
      case "translate":
        next = new DOMMatrix().translate(params[0] || 0, params[1] || 0);
        break;
      case "scale":
        next = new DOMMatrix().scale(params[0] || 1, params.length > 1 ? params[1] : params[0] || 1);
        break;
      case "rotate":
        if (params.length > 2) {
          next = new DOMMatrix().translate(params[1], params[2]).rotate(params[0]).translate(-params[1], -params[2]);
        } else {
          next = new DOMMatrix().rotate(params[0] || 0);
        }
        break;
      case "skewX":
        next = new DOMMatrix().skewX(params[0] || 0);
        break;
      case "skewY":
        next = new DOMMatrix().skewY(params[0] || 0);
        break;
      default:
        return matrix;
    }
    return matrix.multiply(next);
  }, transform);
}

// SVG source -> flat list of {path: Path2D, matrix, role, id}. `role` is
// "threads" | "punctures" | "other", read off the ancestor <g id="..."> chain
// - that group naming is load-bearing, it's the only place style/jitter
// rules come from. Word-outline text (`id="text_*"`, siblings of #blossom)
// is dropped here: at panel scale it renders as illegible noise, and the
// panel already carries its own heading.
function parseSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  const drawables = [];

  function walk(node, matrix, ancestors) {
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    const id = node.getAttribute ? node.getAttribute("id") : null;
    if (id && id.startsWith("text_")) return; // drop word-outline text entirely

    let nextMatrix = matrix;
    if (node.getAttribute) {
      const transformAttr = node.getAttribute("transform");
      if (transformAttr) nextMatrix = matrix.multiply(parseTransform(transformAttr));
    }
    const nextAncestors = id ? ancestors.concat(id) : ancestors;
    const role = nextAncestors.includes("threads")
      ? "threads"
      : nextAncestors.includes("punctures")
        ? "punctures"
        : "other";

    if (tag === "path") {
      const d = node.getAttribute("d");
      if (d) drawables.push({ path: new Path2D(d), matrix: nextMatrix, role, id });
    } else if (tag === "circle") {
      const cx = parseFloat(node.getAttribute("cx") || "0");
      const cy = parseFloat(node.getAttribute("cy") || "0");
      const r = parseFloat(node.getAttribute("r") || "0");
      const path = new Path2D();
      path.arc(cx, cy, r, 0, Math.PI * 2);
      drawables.push({ path, matrix: nextMatrix, role, id });
    } else if (tag === "ellipse") {
      const cx = parseFloat(node.getAttribute("cx") || "0");
      const cy = parseFloat(node.getAttribute("cy") || "0");
      const rx = parseFloat(node.getAttribute("rx") || "0");
      const ry = parseFloat(node.getAttribute("ry") || "0");
      const path = new Path2D();
      path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      drawables.push({ path, matrix: nextMatrix, role, id });
    } else if (tag === "rect") {
      const width = parseFloat(node.getAttribute("width") || "0");
      const height = parseFloat(node.getAttribute("height") || "0");
      if (width >= BASE_W - 1 && height >= BASE_H - 1) return; // full-frame background rect
      const x = parseFloat(node.getAttribute("x") || "0");
      const y = parseFloat(node.getAttribute("y") || "0");
      const path = new Path2D();
      path.rect(x, y, width, height);
      drawables.push({ path, matrix: nextMatrix, role, id });
    } else if (tag === "polygon" || tag === "polyline") {
      const raw = node.getAttribute("points") || "";
      const points = raw.trim().split(/[\s,]+/).map(Number).filter((v) => !Number.isNaN(v));
      if (points.length >= 4) {
        const path = new Path2D();
        path.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
        if (tag === "polygon") path.closePath();
        drawables.push({ path, matrix: nextMatrix, role, id });
      }
    }

    if (node.children) {
      for (const child of node.children) walk(child, nextMatrix, nextAncestors);
    }
  }

  walk(root, new DOMMatrix(), []);
  return { drawables };
}

class PunctureAnimation {
  constructor(id) {
    this.punctureId = id;
    this.scale = 1.0;
    this.startTime = performance.now();
  }

  update(now) {
    const elapsed = now - this.startTime;
    if (elapsed < PUNCTURE_POP_MS) {
      let t = elapsed / PUNCTURE_POP_MS;
      t = 1.0 - Math.pow(1.0 - t, 3); // cubic ease-out
      this.scale = 1.0 + (PUNCTURE_POP_SCALE - 1.0) * t;
    } else {
      this.scale = PUNCTURE_POP_SCALE;
    }
  }
}

// `!TRIG p=<puncture> b=<blossom_type> a=<algo>` -> {puncture, blossom, algo}
// (numbers), or null if `raw` isn't a !TRIG line. Shared here so every
// consumer (Soundlab, the Webpage Updater, this module's own trigFromLine())
// parses the wire format identically.
export function parseTrigLine(raw) {
  if (!raw || !raw.startsWith("!TRIG")) return null;
  const m = raw.match(/p=(-?\d+)\s+b=(-?\d+)\s+a=(-?\d+)/);
  if (!m) return null;
  return { puncture: Number(m[1]), blossom: Number(m[2]), algo: Number(m[3]) };
}

// Shallow-merges a partial theme over DEFAULT_THEME. `blossomColors` merges
// one level deeper (per-key) so overriding one blossom's accent doesn't
// drop the others back to their built-in color.
function mergeTheme(base, partial) {
  const merged = { ...base, ...partial, blossomColors: { ...base.blossomColors } };
  if (partial && partial.blossomColors) {
    for (const [key, colors] of Object.entries(partial.blossomColors)) {
      merged.blossomColors[key] = { ...merged.blossomColors[key], ...colors };
    }
  }
  return merged;
}

function resolveKey(blossom) {
  if (typeof blossom === "number") return BLOSSOM_KEYS[blossom] || null;
  if (typeof blossom === "string") {
    const upper = blossom.toUpperCase();
    return BLOSSOM_CONFIG[upper] ? upper : null;
  }
  return null;
}

export class BlossomViz {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {string} [options.assetBase="./assets/"] - directory the
   *   blossom_*.svg files are served from, trailing slash required.
   * @param {"punctures"|"frame"} [options.fit="punctures"] - "punctures"
   *   contain-fits the puncture bounding box (right for a boxed panel);
   *   "frame" cover-fits the full 2560x1440 artwork frame edge-to-edge
   *   (matches the original full-bleed Visualizer behaviour).
   * @param {boolean} [options.debug=false] - draw puncture index labels.
   * @param {number} [options.jitter=1.0] - px of shimmer jitter, normal mode.
   * @param {object} [options.theme] - partial override of DEFAULT_THEME
   *   (line/shape colors + widths) - see README "Theming". Merged over the
   *   defaults, so pass only what you want to change.
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assetBase = options.assetBase ?? "./assets/";
    this.fit = options.fit ?? "punctures";
    this.debug = options.debug ?? false;
    this.jitter = options.jitter ?? JITTER_DEFAULT;
    this.theme = mergeTheme(DEFAULT_THEME, options.theme);

    this._blossoms = {}; // key -> {drawables} cache, populated by _loadBlossom
    this._loading = {}; // key -> in-flight fetch/parse promise
    this._currentKey = "";
    this._fadeStart = 0;
    this._chaos = false;
    this._activePop = null;
    this._rafId = null;
    this._cssW = 0;
    this._cssH = 0;
    this._destroyed = false;

    this._onVisibility = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", this._onVisibility);
    this._resize();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this._cssW = rect.width;
    this._cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this._dpr = dpr;
  }

  async _loadBlossom(key) {
    if (this._blossoms[key]) return this._blossoms[key];
    if (this._loading[key]) return this._loading[key];
    const config = BLOSSOM_CONFIG[key];
    this._loading[key] = fetch(this.assetBase + config.svgFile)
      .then((res) => {
        if (!res.ok) throw new Error(`blossom-viz: SVG fetch failed (${res.status}) for ${config.svgFile}`);
        return res.text();
      })
      .then((text) => {
        const parsed = parseSvg(text);
        this._blossoms[key] = parsed;
        delete this._loading[key];
        return parsed;
      })
      .catch((err) => {
        delete this._loading[key];
        console.warn("[blossom-viz]", err);
        throw err;
      });
    return this._loading[key];
  }

  /**
   * Switch the displayed blossom. Accepts a name ("DAHON") or the firmware's
   * blossom_type index (0-3). Idempotent - re-setting the current blossom is
   * a no-op, so a 1Hz status poll can call this every tick without
   * restarting the fade-in each time.
   */
  async setBlossom(blossom) {
    const key = resolveKey(blossom);
    if (!key || key === this._currentKey) return;
    try {
      await this._loadBlossom(key);
    } catch {
      return; // fetch/parse failed - stay on whatever was showing, already warned
    }
    if (this._destroyed) return;
    this._currentKey = key;
    this._fadeStart = performance.now();
  }

  /**
   * Pop the ring on `punctureIndex`. Always restarts the pop animation, even
   * if it's the same index as last time - repeated notes on one puncture
   * must visibly re-fire.
   */
  trigger(punctureIndex) {
    if (punctureIndex == null || punctureIndex < 0) return;
    this._activePop = new PunctureAnimation(punctureIndex);
  }

  /**
   * Convenience wrapper: parse a raw `!TRIG` line and apply it directly.
   * Awaits setBlossom() before triggering - setBlossom() is only
   * synchronous once a blossom's SVG is already cached (see
   * _loadBlossom()); the first time a given type is shown in this tab it's
   * a real fetch(), tens of ms. blossom_type is re-randomized on every
   * device boot, so a reflash commonly lands on a type this tab hasn't
   * shown yet. Without the await, every !TRIG arriving during that fetch
   * fired trigger() immediately against whichever graph was still current
   * - drawing the NEW firmware's puncture index against the OLD graph's
   * puncture-position table. Reads as a puncture lighting up in the wrong
   * place relative to the note playing, for as long as the fetch takes.
   */
  async applyTrigLine(raw) {
    const t = parseTrigLine(raw);
    if (!t) return null;
    await this.setBlossom(t.blossom);
    this.trigger(t.puncture);
    return t;
  }

  setChaos(active) {
    this._chaos = !!active;
  }

  /**
   * Apply a partial theme override on top of whatever theme is already set
   * (starting from DEFAULT_THEME) - e.g. `viz.setTheme({ threadColor: [0,0,0],
   * ringHoleColor: [255,255,255] })` for a white page. Takes effect next
   * frame; no reload of the SVG assets needed since color is applied at
   * draw time, not baked into the parsed paths.
   */
  setTheme(theme) {
    this.theme = mergeTheme(this.theme, theme);
  }

  /** Blank the panel - use on device disconnect. */
  clear() {
    this._currentKey = "";
    this._activePop = null;
  }

  _fitPunctures(key) {
    const positions = puncturePositions[key];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [, x, y] of positions) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const pad = Math.max(w, h) * FIT_PUNCTURES_PADDING_FACTOR;
    const scale = Math.min(this._cssW / (w + pad * 2), this._cssH / (h + pad * 2));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { scale, offsetX: this._cssW / 2 - cx * scale, offsetY: this._cssH / 2 - cy * scale };
  }

  _fitFrame() {
    const scale = Math.max(this._cssW / BASE_W, this._cssH / BASE_H);
    return {
      scale,
      offsetX: (this._cssW - BASE_W * scale) / 2,
      offsetY: (this._cssH - BASE_H * scale) / 2,
    };
  }

  _drawDrawable(drawable, style, jitterAmount) {
    const ctx = this.ctx;
    const { path, matrix } = drawable;
    ctx.save();
    if (jitterAmount > 0) {
      ctx.translate(randRange(-jitterAmount, jitterAmount), randRange(-jitterAmount, jitterAmount));
    }
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (style.fill) ctx.fill(path);
    if (style.lineWidth > 0) ctx.stroke(path);
    ctx.restore();
  }

  _renderBlossom(key, alpha, scale, offsetX, offsetY) {
    const ctx = this.ctx;
    const config = BLOSSOM_CONFIG[key];
    const svg = this._blossoms[key];
    if (!config || !svg) return;

    const theme = this.theme;
    const punctureColor = theme.blossomColors[key]?.punctureColor ?? config.punctureColor;
    const jitterAmount = this._chaos ? JITTER_CHAOS : this.jitter;
    const threadsStyle = {
      fill: `rgba(${theme.threadColor.join(",")},${alpha})`,
      stroke: `rgba(${theme.threadColor.join(",")},${alpha})`,
      lineWidth: theme.threadLineWidth,
    };
    const punctureStyle = {
      fill: `rgba(${punctureColor.join(",")},${alpha})`,
      stroke: `rgba(${theme.punctureStrokeColor.join(",")},${alpha})`,
      lineWidth: theme.punctureLineWidth,
    };
    const defaultStyle = {
      fill: `rgba(${theme.defaultColor.join(",")},${alpha})`,
      stroke: `rgba(${theme.defaultColor.join(",")},${alpha})`,
      lineWidth: theme.defaultLineWidth,
    };

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    for (const drawable of svg.drawables) {
      const style = drawable.role === "threads" ? threadsStyle
        : drawable.role === "punctures" ? punctureStyle
          : defaultStyle;
      const useJitter = drawable.role === "threads" || drawable.role === "punctures";
      this._drawDrawable(drawable, style, useJitter ? jitterAmount : 0);
    }
    ctx.restore();
  }

  _drawPunctureRing(key, scale, offsetX, offsetY, alpha) {
    if (!this._activePop) return;
    const ctx = this.ctx;
    const config = BLOSSOM_CONFIG[key];
    const theme = this.theme;
    const ringColor = theme.blossomColors[key]?.ringColor ?? config.ringColor;
    const positions = puncturePositions[key] || [];
    const match = positions.find((item) => item[0] === this._activePop.punctureId);
    if (!match) return;

    const canvasX = offsetX + match[1] * scale;
    const canvasY = offsetY + match[2] * scale;
    const ringRadius = PUNCTURE_RADIUS * this._activePop.scale * scale;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${ringColor.join(",")},${alpha * (230 / 255)})`;
    ctx.lineWidth = 16 * scale;
    ctx.arc(canvasX, canvasY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Center disc reads as a "hole" only when it matches the host's
    // background - set theme.ringHoleColor to that, not literal black.
    ctx.fillStyle = `rgba(${theme.ringHoleColor.join(",")},${alpha})`;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, ringRadius / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPunctureLabels(key, scale, offsetX, offsetY, alpha) {
    const ctx = this.ctx;
    const positions = puncturePositions[key] || [];
    ctx.save();
    ctx.fillStyle = `rgba(${this.theme.labelColor.join(",")},${alpha * (220 / 255)})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${13 * scale}px Arial, sans-serif`;
    for (const [id, x, y] of positions) {
      ctx.fillText(String(id), offsetX + x * scale, offsetY + y * scale);
    }
    ctx.restore();
  }

  _frame = (now) => {
    if (this._destroyed) return;
    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._cssW, this._cssH);

    const key = this._currentKey;
    if (key && this._blossoms[key]) {
      const { scale, offsetX, offsetY } = this.fit === "frame" ? this._fitFrame() : this._fitPunctures(key);

      let alpha = smoothStep((now - this._fadeStart) / BLOSSOM_FADE_MS);
      if (this._chaos && now % BLINK_CYCLE_MS < BLINK_CYCLE_MS / 2) alpha *= 0.7;

      if (this._activePop) this._activePop.update(now);

      this._renderBlossom(key, alpha, scale, offsetX, offsetY);
      this._drawPunctureRing(key, scale, offsetX, offsetY, alpha);
      if (this.debug) this._drawPunctureLabels(key, scale, offsetX, offsetY, alpha);
    }

    this._rafId = requestAnimationFrame(this._frame);
  };

  start() {
    if (this._rafId != null || this._destroyed) return;
    this._rafId = requestAnimationFrame(this._frame);
  }

  stop() {
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  destroy() {
    this._destroyed = true;
    this.stop();
    this._resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this._onVisibility);
  }
}
