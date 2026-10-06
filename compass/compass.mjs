/**
 * Compass — Tactile UI.
 *
 * A heading instrument: a printed card floating in liquid turns under a
 * fixed lubber line, inside a turned bezel with a knurled grip. A fixed hub
 * over the pivot carries a small lit display with the bearing ("274° W").
 * Turn the bezel — or drag anywhere on the dial — and the card swings after
 * it through the liquid, passes the mark and settles back, the way a real
 * liquid-damped compass does.
 *
 * Mechanisms:
 *   1. The card is a damped rotational spring toward the target bearing,
 *      always the short way round (359° → 1° goes through 0°, never through
 *      180°), clamped to 1/30 s and sub-stepped at 1/240 s. Damping is the
 *      liquid: 0.1 rings for seconds, 1 arrives without passing.
 *   2. The bezel is the hand: it turns in 1° detents, directly under the
 *      pointer, and its index marks the bearing; the card catches up and
 *      "boxes" its N under the index.
 *   3. Light fixed in the room. The turning print is split from everything
 *      the lamp decides. The card and the bezel's printing are sprites that
 *      turn; the housing, the bezel's face, the glass sheen, the lip's shadow
 *      across the card and the hub's shadow are baked once and never turn.
 *      The knurl is lit tooth by tooth by where each tooth IS, not where it
 *      was cut: three phases of the knurl, one per degree of its 3° pitch,
 *      are baked and chosen by the bezel's angle.
 *
 * Cost at rest: nothing. The loop runs only while the card moves, sleeps
 * when it settles, pauses off screen and in a hidden tab; a 2.5 s frame gap
 * advances one clamped frame. A frame is five drawImage calls.
 *
 * Accessibility: the root is `role="slider"` (0–359 degrees) with
 * aria-valuenow and aria-valuetext ("274 degrees, west"); arrows step 1°,
 * Shift or Page keys 10°, Home is north. It fires `input` as the value
 * changes and `change` when a drag or key commits it. The canvas and the
 * display are aria-hidden. `readonly` makes it a wind or heading readout.
 *
 * Reduced motion: it points instantly; no frame is requested.
 *
 * A device's own compass can drive it (`useSensor()`, which asks for
 * permission; off by default).
 *
 * No dependencies. The exported helpers are pure and tested in Node.
 */

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- angles

/** Any angle into [0, 360). */
export const wrap360 = (a) => ((a % 360) + 360) % 360;

/** Any angle into (−180, 180]: the short way round. */
export function wrap180(a) {
  const w = wrap360(a + 180) - 180;
  return w === -180 ? 180 : w;
}

/** The pointer's angle around a centre, degrees clockwise from straight up (screen y down). */
export const angleAt = (cx, cy, x, y) => wrap360((Math.atan2(x - cx, cy - y) * 180) / Math.PI);

/** The sixteen winds. */
export const WINDS = Object.freeze([
  ['N', 'north'], ['NNE', 'north-northeast'], ['NE', 'northeast'], ['ENE', 'east-northeast'],
  ['E', 'east'], ['ESE', 'east-southeast'], ['SE', 'southeast'], ['SSE', 'south-southeast'],
  ['S', 'south'], ['SSW', 'south-southwest'], ['SW', 'southwest'], ['WSW', 'west-southwest'],
  ['W', 'west'], ['WNW', 'west-northwest'], ['NW', 'northwest'], ['NNW', 'north-northwest'],
]);

/** The wind a bearing falls in: { short: 'W', long: 'west' }. */
export function windOf(deg) {
  const [short, long] = WINDS[Math.round(wrap360(deg) / 22.5) % 16];
  return { short, long };
}

/** Whole degrees, 0–359. */
export const whole = (deg) => Math.round(wrap360(deg)) % 360;

/** What a screen reader says: "274 degrees, west". */
export const valueText = (deg) => `${whole(deg)} degrees, ${windOf(whole(deg)).long}`;

/** What the display shows: "274°", three digits like an instrument ("004°"). */
export const readout = (deg) => `${String(whole(deg)).padStart(3, '0')}°`;

/** The step a key makes, or null: arrows ±1 (Shift ±10), Page keys ±10, Home to north. */
export function keyStep(key, shift = false) {
  const n = shift ? 10 : 1;
  switch (key) {
    case 'ArrowUp': case 'ArrowRight': return { by: n };
    case 'ArrowDown': case 'ArrowLeft': return { by: -n };
    case 'PageUp': return { by: 10 };
    case 'PageDown': return { by: -10 };
    case 'Home': return { to: 0 };
    default: return null;
  }
}

// ---------------------------------------------------------------- the card

/**
 * The card's natural frequency (Hz) and default damping ratio: a liquid
 * compass card swings about once a second and settles in two or three.
 */
export const CARD = Object.freeze({ freq: 1, zeta: 0.6, subStep: 1 / 240, maxStep: 1 / 30 });

/**
 * Advance the card: θ̈ = ω₀²·wrap180(target − θ) − 2ζω₀·θ̇, in degrees. The
 * heading θ is continuous (it may run past 360); the error is always the
 * short way round. Clamped to 1/30 s and sub-stepped: a tab that returns
 * after 2.5 s advances one frame.
 */
export function stepCard(s, target, dt, zeta = CARD.zeta, freq = CARD.freq) {
  const w0 = 2 * Math.PI * freq;
  const k = w0 * w0;
  const c = 2 * clamp(zeta, 0.02, 3) * w0;
  let left = clamp(Number.isFinite(dt) ? dt : 0, 0, CARD.maxStep);
  while (left > 1e-9) {
    const h = Math.min(left, CARD.subStep);
    s.v += (k * wrap180(target - s.h) - c * s.v) * h;
    s.h += s.v * h;
    left -= h;
  }
  return s;
}

/** Settled: within a fiftieth of a degree and nearly still. */
export const cardSettled = (s, target, eps = 0.02) => Math.abs(wrap180(target - s.h)) < eps && Math.abs(s.v) < eps * 4;

// ---------------------------------------------------------------- the print

export const STYLES = Object.freeze(['degrees', 'cardinal', 'aviation']);

/**
 * What a card style prints, in fractions of the card's radius. `ticks`:
 * { deg, len, w } from the outer edge inward; `labels`: { deg, text, r, size,
 * bold }. `fine` adds the 1° ticks a card only prints when it is big enough.
 */
export function cardMarks(style = 'degrees', fine = true) {
  const ticks = [];
  const labels = [];
  const every = fine && style !== 'aviation' ? 1 : 5;
  for (let d = 0; d < 360; d += every) {
    if (d % 10 === 0) ticks.push({ deg: d, len: 0.13, w: 0.011 });
    else if (d % 5 === 0) ticks.push({ deg: d, len: 0.085, w: 0.008 });
    else ticks.push({ deg: d, len: 0.05, w: 0.005 });
  }
  const cardinals = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  if (style === 'degrees') {
    for (let d = 30; d < 360; d += 30) labels.push({ deg: d, text: String(d), r: 0.72, size: 0.105, bold: false });
    labels.push({ deg: 0, text: 'N', r: 0.72, size: 0.13, bold: true });
  } else if (style === 'cardinal') {
    for (const [d, t] of Object.entries(cardinals)) labels.push({ deg: +d, text: t, r: 0.62, size: 0.2, bold: true });
    for (const [d, t] of [[45, 'NE'], [135, 'SE'], [225, 'SW'], [315, 'NW']]) labels.push({ deg: d, text: t, r: 0.64, size: 0.1, bold: false });
    for (let d = 30; d < 360; d += 30) if (d % 90) labels.push({ deg: d, text: String(d), r: 0.78, size: 0.068, bold: false });
  } else {
    for (let d = 30; d < 360; d += 30) if (d % 90) labels.push({ deg: d, text: String(d / 10), r: 0.7, size: 0.15, bold: false });
    for (const [d, t] of Object.entries(cardinals)) labels.push({ deg: +d, text: t, r: 0.7, size: 0.17, bold: true });
  }
  return { ticks, labels };
}

// ---------------------------------------------------------------- the instrument

/** Radii, as fractions of the dial's radius. */
export const RINGS = Object.freeze({
  knurl: 0.945, bezelIn: 0.835, lipIn: 0.79, window: 0.79, card: 0.755, hub: 0.27,
});

/** The knurl's pitch in degrees; the bezel turns in 1° detents, so three phases cover it. */
export const KNURL = 3;

export const FINISHES = Object.freeze(['auto', 'aluminium', 'graphite']);

/**
 * Materials: `bezel` the turned grip, `lip` the fixed ring the glass sits
 * in, `card` and `ink` the print. Aluminium wears a warm-white card and a
 * reflective LCD; graphite a black card and a VFD.
 */
export const MATERIALS = Object.freeze({
  aluminium: Object.freeze({
    key: 'aluminium', dark: false, glow: 0,
    bezel: '#c4c6c3', lip: '#2c2d30', hub: '#c9cbc8', card: '#eeebe3', ink: '#17181a', bezelInk: '#1d1e20',
    amb: 0.26, kd: 0.72, ks: 0.14, gloss: 10, grain: 0.035, shadow: 0.34, display: 'lcd',
  }),
  graphite: Object.freeze({
    key: 'graphite', dark: true, glow: 0,
    bezel: '#2f3034', lip: '#161719', hub: '#2c2d31', card: '#141517', ink: '#e8e5de', bezelInk: '#d9d6cf',
    amb: 0.3, kd: 0.8, ks: 0.12, gloss: 9, grain: 0.05, shadow: 0.5, display: 'vfd',
  }),
});

/**
 * `finish: 'auto'` follows the page. Aluminium, Porcelain and Daylight have
 * the aluminium dial and AMOLED the graphite one, pixel for pixel; Graphite,
 * Black, Phosphor, Night, Paper and E-paper (`page`) are drawn from the page's
 * object tokens, in each finish's own language: anodised metal with bright cut
 * edges, black glass traced in the display's light, dim metal with its print
 * lit from inside, a matte printed dial. A finish not listed goes by the
 * page's tone.
 */
export const AUTO = Object.freeze({
  aluminium: 'aluminium', graphite: 'page', porcelain: 'aluminium', black: 'page', paper: 'page', phosphor: 'page',
  daylight: 'aluminium', night: 'page', 'e-paper': 'page', amoled: 'graphite',
});

/** The finishes whose page is dark, for a page that names its finish and no tone. */
const DARK = Object.freeze(['graphite', 'black', 'phosphor', 'night', 'amoled']);

/** The dial drawn: the finish asked for, or on `auto` the page's finish's, then its tone, then the system's. */
export function resolveMaterial(own, around, prefersDark, tone) {
  if (own !== 'auto') return own;
  if (AUTO[around]) return AUTO[around];
  return (tone === 'light' || tone === 'dark' ? tone === 'dark' : prefersDark) ? 'graphite' : 'aluminium';
}

/** The page's object tokens a `page` dial is made from (--tui-obj-plate ... --tui-obj-mark). */
export const LOOK = Object.freeze(['plate', 'dark', 'body', 'lite', 'spec', 'env', 'frame', 'edge', 'mark']);

/** Two #rrggbb colours mixed, as #rrggbb. */
export const blend = (a, b, t) => {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  return `#${((1 << 24) | pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).reduce((n, v) => (n << 8) | v, 0)).toString(16).slice(1)}`;
};

/**
 * The dial in a page's own material, from its object tokens. On a dark
 * finish the bezel is the finish's frame lifted a third toward its body, the
 * glass its plate, the print its mark; on a light one the bezel is the frame,
 * the card the finish's body and edge, the lip its dark side shaded. A matte
 * finish (chalk) takes no sheen. A finish that glows lights its print from
 * within and traces the bezel's rim and the glass's lip in its edge colour.
 */
export function materialFrom(t, dark) {
  const matte = !!t.matte;
  return Object.freeze({
    key: ['page', dark ? 'dark' : 'light', ...LOOK.map((k) => t[k]), t.shadow, matte ? 1 : 0, t.glow].join('|'),
    dark, glow: t.glow, edge: t.edge,
    bezel: dark ? blend(t.frame, t.body, 0.33) : t.frame,
    lip: dark ? blend(t.plate, t.frame, 0.5) : blend(t.dark, '#000000', 0.6),
    hub: dark ? blend(t.frame, t.body, 0.25) : t.plate,
    card: dark ? blend(t.plate, t.frame, 0.55) : blend(t.body, t.edge, 0.5),
    ink: t.mark, bezelInk: t.mark,
    amb: dark ? 0.3 : 0.26, kd: dark ? 0.8 : 0.72, ks: matte ? 0 : dark ? 0.12 : 0.14, gloss: dark ? 9 : 10, grain: dark ? 0.05 : 0.035,
    shadow: t.shadow, display: dark ? 'vfd' : 'lcd',
  });
}

/** Screen direction toward the lamp: 0° is from above, clockwise, y down. */
export function lampOf(light) {
  const t = (light * Math.PI) / 180;
  return { lx: Math.sin(t), ly: -Math.cos(t) };
}

/** The lamp as a 3D unit vector for a dial facing the viewer, `off` degrees off the line of sight. */
export function lampVector(light, off = 48) {
  const { lx, ly } = lampOf(light);
  const e = (off * Math.PI) / 180;
  return [lx * Math.sin(e), ly * Math.sin(e), Math.cos(e)];
}

/**
 * The height of the fixed metal (units of the dial radius) at radius r: the
 * bezel's flat face and rounded edge, the step down to the lip ring, the lip
 * ring and its chamfer into the window. The knurl adds its teeth on top.
 */
export function housingHeight(r) {
  if (r > 1) return 0;
  const edge = 0.055;
  if (r > 1 - edge) { const t = (r - (1 - edge)) / edge; return 0.06 * Math.sqrt(Math.max(0, 1 - t * t)); }
  if (r > RINGS.bezelIn + 0.012) return 0.06;
  if (r > RINGS.bezelIn) return 0.045 + 0.015 * smooth(RINGS.bezelIn, RINGS.bezelIn + 0.012, r);
  if (r > RINGS.lipIn + 0.008) return 0.045;
  if (r > RINGS.lipIn) return 0.02 + 0.025 * smooth(RINGS.lipIn, RINGS.lipIn + 0.008, r);
  return 0;
}

// ================================================================ drawing
// Everything below runs only in a browser.

const SRGB = (() => {
  const t = new Uint8ClampedArray(4097);
  for (let i = 0; i <= 4096; i += 1) {
    const v = i / 4096;
    t[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  }
  return t;
})();
const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexLin = (h) => hexRgb(h).map(toLin);
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(', ')}, ${clamp(a, 0, 1).toFixed(3)})`;
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
let hexProbe = null;
/** Any opaque CSS colour (hex, rgb(), oklch() ...) as #rrggbb, the form the maths here reads: painted as one pixel and read back. */
const cssHex = (value) => {
  hexProbe ??= canvasOf(1, 1);
  const g = hexProbe.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 1, 1);
  g.fillStyle = '#000000';
  g.fillStyle = value;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return `#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}`;
};

/** The page's object tokens as hex colours and numbers, or null on a page without them. */
export function readLook(el) {
  const s = getComputedStyle(el);
  const v = (k) => s.getPropertyValue(`--tui-obj-${k}`).trim();
  if (!v('frame')) return null;
  const t = Object.fromEntries(LOOK.map((k) => [k, cssHex(v(k) || v('frame'))]));
  t.shadow = clamp(parseFloat(v('shadow')) || 0.4, 0, 1);
  t.glow = clamp(parseFloat(v('glow')) || 0, 0, 1);
  t.matte = v('matte') === '1';
  return t;
}
const hashXY = (x, y) => {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Paint a heightfield of turned metal, pixel by pixel, into ImageData.
 * `z(r, a)` in units of the dial radius; `albedo(r)` picks the material. The
 * normal comes from finite differences, so the knurl's teeth light by their
 * own flanks.
 */
function paintMetal(img, W, H, cx, cy, R, dpr, { z, material, r0 = 0, r1 = 1, grain = 0.04, L, mats }) {
  const d = img.data;
  const H3 = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
  const px = 1 / (R * dpr); // one device pixel, in dial radii
  const j0 = Math.max(0, Math.floor(cy - r1 * R * dpr) - 1);
  const j1 = Math.min(H - 1, Math.ceil(cy + r1 * R * dpr) + 1);
  const i0 = Math.max(0, Math.floor(cx - r1 * R * dpr) - 1);
  const i1 = Math.min(W - 1, Math.ceil(cx + r1 * R * dpr) + 1);
  const at = (x, y) => { const r = Math.hypot(x, y); return z(r, (Math.atan2(x, -y) * 180) / Math.PI); };
  for (let j = j0; j <= j1; j += 1) {
    const y = (j + 0.5 - cy) / (R * dpr);
    for (let i = i0; i <= i1; i += 1) {
      const x = (i + 0.5 - cx) / (R * dpr);
      const r = Math.hypot(x, y);
      const cov = clamp((r1 - r) / px + 0.5, 0, 1) * clamp((r - r0) / px + 0.5, 0, 1);
      if (cov <= 0) continue;
      const dzx = (at(x + px, y) - at(x - px, y)) / (2 * px);
      const dzy = (at(x, y + px) - at(x, y - px)) / (2 * px);
      const nl = Math.hypot(dzx, dzy, 1);
      const nx = -dzx / nl;
      const ny = -dzy / nl;
      const nz = 1 / nl;
      const m = mats[material(r)];
      const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const ndh = Math.max(0, nx * H3[0] + ny * H3[1] + nz * H3[2]);
      const bead = 1 + grain * (hashXY(i * 7.3, j * 3.1) - 0.5);
      const lit = (m.amb * (0.7 + 0.3 * nz) + m.kd * ndl) * bead + m.ks * ndh ** m.gloss;
      const k = (j * W + i) * 4;
      const a = cov * 255;
      const ia = 1 - cov;
      d[k] = SRGB[Math.round(clamp(m.lin[0] * lit, 0, 1) * 4096)] * cov + d[k] * ia;
      d[k + 1] = SRGB[Math.round(clamp(m.lin[1] * lit, 0, 1) * 4096)] * cov + d[k + 1] * ia;
      d[k + 2] = SRGB[Math.round(clamp(m.lin[2] * lit, 0, 1) * 4096)] * cov + d[k + 2] * ia;
      d[k + 3] = Math.max(d[k + 3], a);
    }
  }
}

/** The knurl's teeth: rounded ridges every KNURL degrees on the bezel's outer edge. */
const knurlHeight = (r, a, phase) => {
  const base = housingHeight(r);
  if (r < RINGS.knurl - 0.004 || r > 1) return base;
  const t = (((a - phase) / KNURL) % 1 + 1) % 1;
  const ridge = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  return base - 0.011 * (1 - ridge) * smooth(RINGS.knurl - 0.004, RINGS.knurl + 0.01, r);
};

/**
 * The dome bends the card seen through it. The bend is radial, so it commutes
 * with the card's turning: bake it into the card sprite once and the card
 * turns under it for free. Through the body of the dome the print is lifted a
 * little toward the lip; through the shoulder (the outer 3% of the window) it
 * is compressed hard, so the card's edge and the dark bowl beyond are squeezed
 * into a few pixels. `DOME` is where the shoulder begins, as a fraction of the window.
 */
const DOME = 0.968;
function refractCard(canvas, Rpx) {
  const S = canvas.width;
  const c = S / 2;
  const gx = canvas.getContext('2d');
  const src = gx.getImageData(0, 0, S, S).data;
  const out = new ImageData(new Uint8ClampedArray(src), S, S);
  const o = out.data;
  const win = RINGS.window;
  const sh = win * DOME;
  const lift = 0.018;
  const k = (win - sh) > 0 ? ((RINGS.card + 0.06 - (sh - lift)) / (win - sh) - 1) : 0; // the shoulder's end lands 0.06 past the card
  const bend = (p) => {
    if (p <= sh) return p - lift * smooth(0.5, sh, p);
    const u = (p - sh) / (win - sh);
    return sh - lift + (win - sh) * (u + k * u * u * u);
  };
  const acc = [0, 0, 0, 0];
  const tap = (x, y, w) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    for (let q = 0; q < 4; q += 1) {
      const xi = x0 + (q & 1);
      const yi = y0 + (q >> 1);
      if (xi < 0 || yi < 0 || xi >= S || yi >= S) continue;
      const wq = w * ((q & 1 ? fx : 1 - fx) * (q >> 1 ? fy : 1 - fy));
      const j = (yi * S + xi) * 4;
      const a = (src[j + 3] / 255) * wq;
      acc[0] += src[j] * a; acc[1] += src[j + 1] * a; acc[2] += src[j + 2] * a; acc[3] += a;
    }
  };
  const lo = Math.max(0, Math.floor(c - win * Rpx) - 1);
  const hi = Math.min(S - 1, Math.ceil(c + win * Rpx) + 1);
  for (let j = lo; j <= hi; j += 1) {
    const dy = j + 0.5 - c;
    for (let i = lo; i <= hi; i += 1) {
      const dx = i + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const p = r / Rpx;
      if (p < 0.5 || p > win) continue;
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      const n = p > sh - 0.01 ? 4 : 1; // squeezed hard, so look along the pixel a few times
      for (let t = 0; t < n; t += 1) {
        const pt = clamp(p + ((t + 0.5) / n - 0.5) / Rpx, 0.001, win);
        const s = (bend(pt) * Rpx) / r;
        tap(c + dx * s - 0.5, c + dy * s - 0.5, 1 / n);
      }
      const q = (j * S + i) * 4;
      const a = acc[3];
      if (a <= 1e-4) { o[q] = o[q + 1] = o[q + 2] = o[q + 3] = 0; continue; }
      o[q] = acc[0] / a; o[q + 1] = acc[1] / a; o[q + 2] = acc[2] / a; o[q + 3] = a * 255;
    }
  }
  gx.putImageData(out, 0, 0);
}

/**
 * Everything baked for one size and finish. `D` is the dial's diameter
 * (CSS px), `pad` the margin around it for its shadow.
 */
function bake(o, D, pad, dpr, m) {
  const finish = m.key;
  const gr = m.dark;
  const glow = m.glow;
  const R = D / 2;
  const size = D + pad * 2;
  const W = Math.ceil(size * dpr);
  const cx = (pad + R) * dpr;
  const cy = (pad + R) * dpr;
  const L = lampVector(o.light);
  const { lx, ly } = lampOf(o.light);
  const mats = {
    bezel: { ...m, lin: hexLin(m.bezel) },
    lip: { ...m, lin: hexLin(m.lip), ks: m.ks * 1.4, gloss: m.gloss * 1.6 },
    hub: { ...m, lin: hexLin(m.hub) },
  };
  const out = { finish, D, pad, dpr, size };

  // ---- the base: the shadow on the page, the housing, the bowl
  const base = canvasOf(W, W);
  const g = base.getContext('2d');
  g.save();
  g.filter = `blur(${(R * 0.07 * dpr).toFixed(1)}px)`;
  g.fillStyle = `rgba(0, 0, 0, ${m.shadow})`;
  g.beginPath(); g.arc(cx - lx * R * 0.05 * dpr, cy - ly * R * 0.05 * dpr, R * dpr * 0.99, 0, Math.PI * 2); g.fill();
  g.filter = `blur(${(R * 0.015 * dpr).toFixed(1)}px)`;
  g.fillStyle = `rgba(0, 0, 0, ${m.shadow * 0.9})`;
  g.beginPath(); g.arc(cx - lx * R * 0.012 * dpr, cy - ly * R * 0.012 * dpr, R * dpr, 0, Math.PI * 2); g.fill();
  g.restore();
  // The bowl under the glass, and the card's own shadow on it.
  g.fillStyle = gr ? '#070708' : '#0d0e10';
  g.beginPath(); g.arc(cx, cy, RINGS.window * R * dpr, 0, Math.PI * 2); g.fill();
  const img = g.getImageData(0, 0, W, W);
  const material = (r) => (r > RINGS.bezelIn ? 'bezel' : 'lip');
  paintMetal(img, W, W, cx, cy, R, dpr, { z: (r) => housingHeight(r), material, r0: RINGS.window, r1: 1, grain: m.grain, L, mats });
  g.putImageData(img, 0, 0);
  out.base = base;

  // ---- the knurl, lit where each tooth is: one sprite per degree of its pitch
  out.knurl = [];
  for (let p = 0; p < KNURL; p += 1) {
    const c = canvasOf(W, W);
    const cg = c.getContext('2d');
    const im = cg.createImageData(W, W);
    paintMetal(im, W, W, cx, cy, R, dpr, { z: (r, a) => knurlHeight(r, a, p), material: () => 'bezel', r0: RINGS.knurl - 0.006, r1: 1, grain: m.grain, L, mats });
    cg.putImageData(im, 0, 0);
    out.knurl.push(c);
  }

  // ---- the bezel's printing, which turns
  const bp = canvasOf(W, W);
  const bg = bp.getContext('2d');
  bg.setTransform(dpr, 0, 0, dpr, cx, cy);
  bg.fillStyle = m.bezelInk;
  // A finish that glows lights its printing from within.
  if (glow) { bg.shadowColor = m.bezelInk; bg.shadowBlur = glow * R * dpr * 0.05; }
  const face = (RINGS.bezelIn + RINGS.knurl) / 2;
  // The course index: a solid triangle pointing in at the card.
  bg.beginPath();
  bg.moveTo(0, -R * (RINGS.bezelIn + 0.012));
  bg.lineTo(-R * 0.034, -R * (RINGS.knurl - 0.018));
  bg.lineTo(R * 0.034, -R * (RINGS.knurl - 0.018));
  bg.closePath();
  bg.fill();
  for (let d = 0; d < 360; d += 10) {
    if (d === 0) continue;
    const a = (d * Math.PI) / 180;
    const big = d % 90 === 0;
    bg.save();
    bg.rotate(a);
    if (big) { bg.beginPath(); bg.arc(0, -R * face, R * 0.013, 0, Math.PI * 2); bg.fill(); } else { bg.fillRect(-R * 0.0035, -R * (face + 0.012), R * 0.007, R * 0.024); }
    bg.restore();
  }
  out.bezelPrint = bp;

  // ---- the card, which turns
  const Rc = RINGS.card * R;
  const cs = Math.ceil(2 * RINGS.window * R * dpr) + 2; // to the window: the dome shows a little beyond the card's own edge
  const card = canvasOf(cs, cs);
  const kg = card.getContext('2d');
  kg.setTransform(dpr, 0, 0, dpr, cs / 2, cs / 2);
  kg.fillStyle = m.card;
  kg.beginPath(); kg.arc(0, 0, Rc, 0, Math.PI * 2); kg.fill();
  // A printed card is not flat white: a faint grain of the stock.
  kg.fillStyle = gr ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.03)';
  kg.beginPath(); kg.arc(0, 0, Rc * 0.985, 0, Math.PI * 2); kg.lineWidth = Rc * 0.012; kg.strokeStyle = kg.fillStyle; kg.stroke();
  const { ticks, labels } = cardMarks(o.card, Rc > 90);
  kg.fillStyle = m.ink;
  if (glow) { kg.shadowColor = m.ink; kg.shadowBlur = glow * R * dpr * 0.05; }
  for (const t of ticks) {
    kg.save();
    kg.rotate((t.deg * Math.PI) / 180);
    const w = Math.max(0.6 / dpr * 1.5, t.w * Rc);
    kg.fillRect(-w / 2, -Rc * 0.965, w, t.len * Rc);
    kg.restore();
  }
  // North: a solid triangle at the rim.
  kg.beginPath();
  kg.moveTo(0, -Rc * 0.965);
  kg.lineTo(-Rc * 0.05, -Rc * 0.83);
  kg.lineTo(Rc * 0.05, -Rc * 0.83);
  kg.closePath();
  kg.fill();
  const family = o.font;
  // A small card does not print what nobody could read: under 6.5 px, a label is left off.
  for (const l of labels.filter((x) => x.size * Rc >= 6.5)) {
    kg.save();
    kg.rotate((l.deg * Math.PI) / 180);
    kg.translate(0, -l.r * Rc);
    kg.font = `${l.bold ? 700 : 500} ${(l.size * Rc).toFixed(2)}px ${family}`;
    kg.textAlign = 'center';
    kg.textBaseline = 'middle';
    if ('letterSpacing' in kg) kg.letterSpacing = `${(l.size * Rc * 0.02).toFixed(2)}px`;
    kg.fillText(l.text, 0, 0);
    kg.restore();
  }
  refractCard(card, R * dpr);
  out.card = card;
  out.cardSize = cs;

  // ---- everything fixed above the card: shadows on it, the hub, the lubber, the glass
  const over = canvasOf(W, W);
  const og = over.getContext('2d');
  og.setTransform(dpr, 0, 0, dpr, cx, cy);
  const win = RINGS.window * R;
  og.save();
  og.beginPath(); og.arc(0, 0, win, 0, Math.PI * 2); og.clip();
  // The lip stands above the card: its shadow across the card on the lamp's side.
  const lip = og.createRadialGradient(lx * R * 0.05, ly * R * 0.05, win * 0.82, lx * R * 0.05, ly * R * 0.05, win * 1.04);
  lip.addColorStop(0, 'rgba(0, 0, 0, 0)');
  lip.addColorStop(0.6, `rgba(0, 0, 0, ${gr ? 0.35 : 0.22})`);
  lip.addColorStop(1, `rgba(0, 0, 0, ${gr ? 0.7 : 0.5})`);
  og.fillStyle = lip;
  og.fillRect(-win, -win, win * 2, win * 2);
  // The hub's shadow on the card, away from the lamp.
  og.save();
  og.filter = `blur(${(R * 0.03 * dpr).toFixed(1)}px)`;
  og.fillStyle = `rgba(0, 0, 0, ${gr ? 0.6 : 0.34})`;
  og.beginPath(); og.arc(-lx * R * 0.04, -ly * R * 0.04, RINGS.hub * R, 0, Math.PI * 2); og.fill();
  og.restore();
  // The glass: a thick dome over the card. Its shoulder (where the card is
  // compressed, see `refractCard`) is lit on the lamp's side and dark on the
  // other; the lamp's softbox is caught in the dome, crisp; a thread of light
  // runs through the glass to the far edge, where it meets the lip.
  {
    const shoulder = win * DOME;
    const hair = Math.max(0.8, R * 0.005);
    const la = Math.atan2(ly, lx);
    const along = (r0, r1) => og.createLinearGradient(lx * r0, ly * r0, lx * r1, ly * r1);
    const stops = (grad, list) => { for (const [t, a, c = '255, 255, 255'] of list) grad.addColorStop(t, `rgba(${c}, ${a})`); return grad; };
    og.save();
    og.beginPath(); og.arc(0, 0, win, 0, Math.PI * 2); og.clip();
    // The body: never perfectly clear. A neutral veil, and the dome's shading along the lamp's axis.
    og.fillStyle = gr ? 'rgba(168, 182, 182, 0.035)' : 'rgba(110, 128, 126, 0.075)';
    og.fillRect(-win, -win, win * 2, win * 2);
    og.fillStyle = stops(along(win, -win), [[0, gr ? 0.06 : 0.09], [0.5, 0], [1, gr ? 0 : 0.12, '8, 14, 14']]);
    og.fillRect(-win, -win, win * 2, win * 2);
    // Thickness: the edge of the glass bends and darkens what is behind it.
    og.fillStyle = stops(og.createRadialGradient(0, 0, win * 0.84, 0, 0, win), [
      [0, 0, '8, 14, 14'], [0.5, 0.05, '8, 14, 14'], [0.8, gr ? 0.2 : 0.16, '8, 14, 14'], [1, gr ? 0.5 : 0.44, '8, 14, 14'],
    ]);
    og.fillRect(-win, -win, win * 2, win * 2);
    // The shoulder faces the lamp on its side: a soft band of light in the bevel.
    og.lineWidth = win - shoulder;
    og.strokeStyle = stops(along(win, -win), [[0, gr ? 0.3 : 0.4], [0.3, gr ? 0.08 : 0.1], [0.5, 0]]);
    og.beginPath(); og.arc(0, 0, (win + shoulder) / 2, 0, Math.PI * 2); og.stroke();
    // Where the flat meets the shoulder: a line of light, brightest toward the lamp.
    og.lineWidth = hair;
    og.strokeStyle = stops(along(win, -win), [[0, gr ? 0.5 : 0.7], [0.35, gr ? 0.14 : 0.2], [0.65, 0.05], [1, 0.05]]);
    og.beginPath(); og.arc(0, 0, shoulder, 0, Math.PI * 2); og.stroke();
    // The softbox in the dome: a pane curved to it, its outer edge clean, its inner edge held.
    const a1 = la - 0.55;
    const a2 = la + 0.55;
    const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
    const outer = win * 0.91;
    const [x1, y1] = P(a1, outer);
    const [x2, y2] = P(a2, outer);
    // On a sheet of its own, so its ends can thin away without touching what is under it.
    const sheet = canvasOf(W, W);
    const sg = sheet.getContext('2d');
    sg.setTransform(dpr, 0, 0, dpr, cx, cy);
    sg.beginPath();
    sg.arc(0, 0, outer, a1, a2);
    sg.quadraticCurveTo(Math.cos(la) * win * 0.6, Math.sin(la) * win * 0.6, x1, y1);
    sg.closePath();
    const paneG = sg.createLinearGradient(lx * outer, ly * outer, lx * win * 0.66, ly * win * 0.66);
    stops(paneG, [[0, gr ? 0.17 : 0.24], [1, gr ? 0.03 : 0.05]]);
    sg.fillStyle = paneG;
    sg.fill();
    sg.globalCompositeOperation = 'destination-in';
    const ends = sg.createLinearGradient(x1, y1, x2, y2);
    stops(ends, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]);
    sg.fillStyle = ends;
    sg.fillRect(-win, -win, win * 2, win * 2);
    og.save();
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.drawImage(sheet, 0, 0);
    og.restore();
    og.lineWidth = hair;
    const streak = og.createLinearGradient(x1, y1, x2, y2);
    og.strokeStyle = stops(streak, [[0, 0], [0.5, gr ? 0.36 : 0.55], [1, 0]]);
    og.beginPath(); og.arc(0, 0, outer - hair / 2, a1, a2); og.stroke();
    // The lip's contact, and the thread of light that has crossed the glass to the far edge.
    og.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    og.beginPath(); og.arc(0, 0, win - hair / 2, 0, Math.PI * 2); og.stroke();
    og.strokeStyle = stops(along(win, -win), [[0, 0], [0.55, 0], [1, gr ? 0.36 : 0.42]]);
    og.beginPath(); og.arc(0, 0, win - hair * 1.5, 0, Math.PI * 2); og.stroke();
    og.restore();
  }
  // The lubber: a fine wire across the glass at twelve, above the card, with its shadow on it.
  const lub0 = -win;
  const lub1 = -Rc * 0.8; // across the graduations only, clear of the print inside them
  const wire = Math.max(1.1, R * 0.008);
  og.lineCap = 'butt';
  og.strokeStyle = `rgba(0, 0, 0, ${gr ? 0.55 : 0.28})`;
  og.lineWidth = wire * 1.6;
  og.beginPath(); og.moveTo(-lx * R * 0.018, lub0 - ly * R * 0.018); og.lineTo(-lx * R * 0.018, lub1 - ly * R * 0.018); og.stroke();
  og.strokeStyle = gr ? '#d9d6cf' : '#1a1b1d';
  og.lineWidth = wire;
  og.beginPath(); og.moveTo(0, lub0); og.lineTo(0, lub1); og.stroke();
  og.restore();
  // A finish that glows traces the bezel's outer rim and the glass's lip in its edge colour, lit.
  if (glow) {
    og.save();
    og.shadowColor = m.edge;
    og.shadowBlur = glow * R * dpr * 0.06;
    og.strokeStyle = rgba(m.edge, 0.85);
    og.lineWidth = Math.max(0.8, R * 0.006);
    og.beginPath(); og.arc(0, 0, R * 0.996, 0, Math.PI * 2); og.stroke();
    og.beginPath(); og.arc(0, 0, win * 1.006, 0, Math.PI * 2); og.stroke();
    og.restore();
  }

  // The hub: a turned boss over the pivot, fixed to the glass.
  const hubImg = og.getImageData(0, 0, W, W);
  paintMetal(hubImg, W, W, cx, cy, R, dpr, {
    z: (r) => (r > RINGS.hub ? 0 : 0.04 * Math.sqrt(Math.max(0, 1 - Math.max(0, (r - (RINGS.hub - 0.03)) / 0.03) ** 2))),
    material: () => 'hub', r0: 0, r1: RINGS.hub, grain: m.grain, L, mats,
  });
  og.putImageData(hubImg, 0, 0);
  og.setTransform(dpr, 0, 0, dpr, cx, cy);
  // The display window cut into the hub, and its lip.
  const dw = RINGS.hub * R * 1.36;
  const dh = RINGS.hub * R * 0.92;
  out.display = { w: dw, h: dh };
  og.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(og, -dw / 2 - 1, -dh / 2 - 1, dw + 2, dh + 2, Math.min(dh * 0.18, 6) + 1);
  og.fill();

  out.over = over;
  return out;
}

function roundRect(g, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

// ================================================================ the object

const DEFAULTS = Object.freeze({
  bearing: 0,
  damping: CARD.zeta,
  card: 'cardinal',
  finish: 'auto',
  size: 'fit',
  light: 315,
  label: 'Heading',
  readonly: false,
  display: true,
  font: '"Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
});

function normalise(opts, previous) {
  const o = { ...DEFAULTS, ...previous, ...opts };
  o.bearing = whole(Number.isFinite(+o.bearing) ? +o.bearing : 0);
  o.damping = clamp(+o.damping || CARD.zeta, 0.1, 1.5);
  if (!STYLES.includes(o.card)) o.card = 'cardinal';
  if (!FINISHES.includes(o.finish)) o.finish = 'auto';
  o.size = +o.size > 0 ? clamp(+o.size, 64, 1200) : 'fit';
  o.light = ((+o.light || 0) % 360 + 360) % 360;
  o.label = String(o.label ?? '').slice(0, 40).trim() || 'Heading';
  o.readonly = o.readonly === true;
  o.display = o.display !== false;
  o.font = String(o.font || DEFAULTS.font);
  return o;
}

const STRUCTURE = ['card', 'finish', 'light', 'size', 'font', 'display'];

export class Compass {
  constructor(host, opts = {}) {
    if (!host) throw new Error('Compass needs a host element');
    this.host = host;
    this.o = normalise(opts);
    this.mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!this.mq?.matches;
    this.dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    this.target = this.o.bearing;
    this.s = { h: this.target, v: 0 };

    const root = document.createElement('div');
    root.className = 'cp';
    root.dataset.object = 'compass';
    root.dataset.state = 'asleep';
    root.setAttribute('role', 'slider');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '359');
    root.tabIndex = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.screen = document.createElement('span');
    this.screen.className = 'cp-display';
    this.screen.setAttribute('aria-hidden', 'true');
    this.deg = document.createElement('span');
    this.deg.className = 'cp-deg';
    this.wind = document.createElement('span');
    this.wind.className = 'cp-wind';
    this.screen.append(this.deg, this.wind);
    root.append(this.canvas, this.screen);
    this.root = root;
    host.append(root);

    this.raf = 0;
    this.last = 0;
    this.visible = false;
    this.drag = null;
    this.cache = new Map();
    this.shown = null;

    this.on = {
      down: (e) => this.#down(e),
      move: (e) => this.#move(e),
      up: (e) => this.#up(e),
      key: (e) => this.#key(e),
      motion: (e) => { this.reduced = e.matches; if (this.reduced) this.#jump(); this.#wake(); },
      scheme: () => this.#followFinish(),
      visibility: () => { if (document.hidden) this.#sleep(); else this.#wake(); },
      sensor: (e) => this.#sensor(e),
    };
    root.addEventListener('pointerdown', this.on.down);
    root.addEventListener('pointermove', this.on.move);
    root.addEventListener('pointerup', this.on.up);
    root.addEventListener('pointercancel', this.on.up);
    root.addEventListener('keydown', this.on.key);
    this.mq?.addEventListener?.('change', this.on.motion);
    this.dark?.addEventListener?.('change', this.on.scheme);
    document.addEventListener('visibilitychange', this.on.visibility);

    this.#aria();
    this.#bindFinish();
    this.ro = new ResizeObserver(() => this.#fit());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.#wake(); else this.#sleep();
    });
    this.io.observe(root);
    document.fonts?.ready?.then(() => { if (this.root.isConnected) { this.cache.clear(); this.#fit(true); } });
    this.#fit(true);
  }

  /** The bearing the compass is set to, 0–359. */
  get value() { return this.target; }

  /** Where the card is pointing right now (it lags the value while it swings). */
  get heading() { return wrap360(this.s.h); }

  get state() { return this.root.dataset.state; }

  /** Turn to a bearing. `instant` (or reduced motion) points at once. No events: that is for the visitor's own changes. */
  setValue(v, { instant = false } = {}) {
    if (!Number.isFinite(+v)) return this;
    this.target = whole(+v);
    this.#aria();
    if (instant || this.reduced) this.#jump();
    else this.#wake();
    return this;
  }

  update(opts = {}) {
    const prev = this.o;
    this.o = normalise(opts, this.o);
    if (this.o.finish !== prev.finish) this.#bindFinish();
    if (STRUCTURE.some((k) => prev[k] !== this.o[k])) { this.cache.clear(); this.#fit(true); }
    this.#aria();
    if ('bearing' in opts && this.o.bearing !== this.target && !this.drag) this.setValue(this.o.bearing);
    return this;
  }

  /**
   * Let the device's own compass drive it. Asks for permission where the
   * platform wants a gesture for it (iOS), so call it from a click. Resolves
   * true when listening. `stopSensor()` lets go.
   */
  async useSensor() {
    const D = globalThis.DeviceOrientationEvent;
    if (!D) return false;
    try {
      if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
    } catch { return false; }
    this.stopSensor();
    this.sensorEvent = 'ondeviceorientationabsolute' in globalThis ? 'deviceorientationabsolute' : 'deviceorientation';
    addEventListener(this.sensorEvent, this.on.sensor);
    return true;
  }

  stopSensor() {
    if (this.sensorEvent) removeEventListener(this.sensorEvent, this.on.sensor);
    this.sensorEvent = null;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stopSensor();
    this.ro.disconnect();
    this.io.disconnect();
    this.finishObs?.disconnect();
    this.mq?.removeEventListener?.('change', this.on.motion);
    this.dark?.removeEventListener?.('change', this.on.scheme);
    document.removeEventListener('visibilitychange', this.on.visibility);
    const r = this.root;
    r.removeEventListener('pointerdown', this.on.down);
    r.removeEventListener('pointermove', this.on.move);
    r.removeEventListener('pointerup', this.on.up);
    r.removeEventListener('pointercancel', this.on.up);
    r.removeEventListener('keydown', this.on.key);
    this.cache.clear();
    r.remove();
  }

  // ---------------------------------------------------------------- finish

  /**
   * The material drawn: the one asked for, or on `auto` the page's finish
   * around the host: a named dial, or `page`, made from its object tokens
   * (a page without them gets graphite when it is dark, aluminium when light).
   */
  #material() {
    const name = resolveMaterial(this.o.finish, this.host.closest('[data-finish]')?.dataset.finish, this.dark?.matches,
      this.host.closest('[data-tone="light"], [data-tone="dark"]')?.dataset.tone);
    if (name !== 'page') return MATERIALS[name];
    const t = readLook(this.host);
    const tone = this.host.closest('[data-tone="light"], [data-tone="dark"]')?.dataset.tone;
    const around = this.host.closest('[data-finish]')?.dataset.finish;
    const dark = AUTO[around] ? DARK.includes(around) : (tone ?? (this.dark?.matches ? 'dark' : 'light')) === 'dark';
    return t ? materialFrom(t, dark) : dark ? MATERIALS.graphite : MATERIALS.aluminium;
  }

  #bindFinish() {
    this.finishObs?.disconnect();
    this.finishObs = null;
    if (this.o.finish !== 'auto') return;
    // The page's finish, wherever on the page it is set: the dial is drawn again when it changes.
    this.finishObs = new MutationObserver(() => this.#followFinish());
    this.finishObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-finish', 'data-tone'], subtree: true });
  }

  #followFinish() {
    if (!this.sprites || this.o.finish !== 'auto') return;
    if (this.sprites.finish !== this.#material().key) { this.#sprites(); this.#draw(); }
  }

  // ---------------------------------------------------------------- layout

  /** The dial fills the host's box (fit) or takes its size, shrinking only to fit. */
  #fit(force = false) {
    if (!this.root.isConnected) return;
    const cs = getComputedStyle(this.host);
    const pad = (k) => parseFloat(cs[k]) || 0;
    const shown = this.root.style.display;
    this.root.style.display = 'none';
    const w = this.host.clientWidth - pad('paddingLeft') - pad('paddingRight');
    const h = this.host.clientHeight - pad('paddingTop') - pad('paddingBottom');
    this.root.style.display = shown;
    let D;
    if (this.o.size === 'fit') D = Math.min(w > 0 ? w : Infinity, h > 0 ? h : Infinity) * 0.9;
    else D = Math.min(this.o.size, w > 0 ? w * 0.96 : Infinity);
    if (!Number.isFinite(D) || D <= 0) D = 240;
    D = Math.max(64, Math.floor(D));
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (!force && D === this.D && dpr === this.dpr) return;
    this.D = D;
    this.dpr = dpr;
    this.pad = Math.ceil(D * 0.09);
    this.root.style.width = `${D}px`;
    this.root.style.height = `${D}px`;
    this.root.style.setProperty('--cp-d', `${D}px`);
    const size = D + this.pad * 2;
    this.canvas.style.inset = `${-this.pad}px`;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    const px = Math.ceil(size * dpr);
    if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
    this.#sprites();
    this.#draw();
    this.#wake();
  }

  #sprites() {
    const mat = this.#material();
    const key = `${mat.key}|${this.o.card}|${this.o.light}|${this.D}|${this.dpr}|${this.o.font}`;
    if (!this.cache.has(key)) this.cache.set(key, bake(this.o, this.D, this.pad, this.dpr, mat));
    this.sprites = this.cache.get(key);
    const disp = this.sprites.display;
    // The material drawn, never `auto`; `page` for a dial made from the page's tokens.
    this.root.dataset.finish = mat.key.split('|')[0];
    this.screen.dataset.kind = mat.display;
    this.screen.style.width = `${disp.w.toFixed(1)}px`;
    this.screen.style.height = `${disp.h.toFixed(1)}px`;
    this.screen.hidden = !this.o.display || this.D < 96;
  }

  // ---------------------------------------------------------------- values

  #aria() {
    this.root.setAttribute('aria-valuenow', String(this.target));
    this.root.setAttribute('aria-valuetext', valueText(this.target));
    this.root.setAttribute('aria-label', this.o.label);
    this.root.setAttribute('aria-readonly', String(this.o.readonly));
    this.root.classList.toggle('cp-readonly', this.o.readonly);
  }

  #jump() {
    this.s.h = this.target;
    this.s.v = 0;
    this.#draw();
  }

  /** The visitor changed it: input now, change when committed. */
  #set(v, commit) {
    const t = whole(v);
    if (t !== this.target) {
      this.target = t;
      this.#aria();
      this.root.dispatchEvent(new Event('input', { bubbles: true }));
      if (this.reduced) this.#jump(); else this.#wake();
    }
    if (commit && this.committed !== this.target) {
      this.committed = this.target;
      this.root.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  #sensor(e) {
    let h = null;
    if (Number.isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && Number.isFinite(e.alpha)) h = 360 - e.alpha;
    if (h !== null) this.setValue(h);
  }

  // ---------------------------------------------------------------- input

  #centre() {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
  }

  #down(e) {
    if (e.button !== 0 || this.o.readonly) return;
    const c = this.#centre();
    const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
    if (d > c.R || d < c.R * 0.08) return;
    this.committed = this.target;
    this.drag = { id: e.pointerId, a: angleAt(c.x, c.y, e.clientX, e.clientY), t: this.target, turned: 0 };
    try { this.root.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    this.root.classList.add('cp-held');
  }

  #move(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const c = this.#centre();
    const a = angleAt(c.x, c.y, e.clientX, e.clientY);
    // Accumulate the turn the short way round each move, so whole turns count.
    this.drag.turned += wrap180(a - this.drag.a);
    this.drag.a = a;
    this.#set(this.drag.t - this.drag.turned, false);
  }

  #up(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.root.classList.remove('cp-held');
    this.#set(this.target, true);
  }

  #key(e) {
    if (this.o.readonly) return;
    const k = keyStep(e.key, e.shiftKey);
    if (!k) return;
    e.preventDefault();
    this.committed = this.target;
    this.#set('to' in k ? k.to : this.target + k.by, true);
  }

  // ---------------------------------------------------------------- the loop

  #frame = (t) => {
    this.raf = 0;
    const dt = this.last ? (t - this.last) / 1000 : 1 / 60;
    this.last = t;
    stepCard(this.s, this.target, dt, this.o.damping);
    const done = cardSettled(this.s, this.target);
    if (done) { this.s.h = this.target; this.s.v = 0; }
    this.#draw();
    if (done || !this.visible || document.hidden) this.#sleep();
    else this.raf = requestAnimationFrame(this.#frame);
  };

  #wake() {
    if (this.reduced) { this.#jump(); return; }
    if (this.raf || !this.visible || document.hidden || !this.sprites) return;
    if (cardSettled(this.s, this.target)) return;
    this.root.dataset.state = 'running';
    this.last = 0;
    this.raf = requestAnimationFrame(this.#frame);
  }

  #sleep() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.dataset.state = 'asleep';
  }

  // ---------------------------------------------------------------- drawing

  #draw() {
    const sp = this.sprites;
    if (!sp) return;
    const g = this.canvas.getContext('2d');
    const d = this.dpr;
    const W = this.canvas.width;
    const c = (this.pad + this.D / 2) * d;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.drawImage(sp.base, 0, 0);
    // The bezel: its knurl lit where each tooth is, its printing turning with it.
    const rho = wrap360(-this.target);
    g.drawImage(sp.knurl[Math.round(rho) % KNURL], 0, 0);
    g.setTransform(1, 0, 0, 1, c, c);
    g.rotate((rho * Math.PI) / 180);
    g.drawImage(sp.bezelPrint, -c, -c);
    // The card, turning under everything fixed.
    g.setTransform(1, 0, 0, 1, c, c);
    g.rotate((-this.s.h * Math.PI) / 180);
    g.imageSmoothingQuality = 'high';
    g.drawImage(sp.card, -sp.cardSize / 2, -sp.cardSize / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(sp.over, 0, 0);
    // The display reads the card as it swings, not the value it is going to.
    const h = whole(this.s.h);
    if (h !== this.shown) {
      this.shown = h;
      this.deg.textContent = readout(h);
      this.wind.textContent = windOf(h).short;
    }
  }
}

export default Compass;
