/**
 * Pull-cord Bulb — Tactile UI.
 *
 * A pendant lamp that is a switch. A spun-aluminium shade (or a tube, or a
 * bare lamp holder) hangs from a ceiling cup on its cable; beside the bulb
 * hangs a thin textile cord with a turned acorn at its end. Pull it down: the
 * switch resists, then snaps; the filament warms up; let go and the cord
 * springs back and swings, and the lamp sways with it.
 *
 * Mechanisms:
 *   1. The rig. The pull cord is a chain of stiff tension-only springs under
 *      gravity, stepped at 1/16000 s (so a 3 mm cord cannot stretch like
 *      rubber) and hung from a spring-loaded plunger inside the lamp. The
 *      plunger has a detent: its force rises, peaks and snaps down when the
 *      latch trips, and the latch re-arms on the way back with a softer tick.
 *      The visitor's hand is a stiff spring to the acorn, so under load the
 *      acorn visibly lags the pointer and catches up at the snap. The lamp is
 *      a damped pendulum; the cord pulls it at its anchor, so a tug tilts it.
 *   2. The filament. Electrical heating against T⁴ radiation: it heats in
 *      ~130 ms and cools along T ∝ (1 + 3t/τ)^(-1/3) — fast at first, then a
 *      dull red ember that lingers. Its colour is the blackbody colour of its
 *      temperature, so it goes red → orange → warm white on the way up.
 *   3. Light fixed in the room. Every turned part is shaded per pixel from
 *      its profile with the room lamp (upper left by default). The dome and
 *      the glass are split: the body turns with the sway, the sheen does not
 *      (it is drawn unrotated, clipped to the turned silhouette). When the
 *      bulb is on it lights the inside of the shade and throws the scallop a
 *      real downlight throws on the wall behind it, computed from the rim's
 *      cut-off, on its own canvas blended `screen` onto the page — within
 *      the object's box, faded at its edges, never a page overlay.
 *
 * Cost at rest: nothing. The loop sleeps once the rig is still and the
 * filament has settled, pauses off screen and in a hidden tab, and a 2.5 s
 * frame gap advances one clamped frame. Sprites are baked once per size and
 * finish; a frame is a dozen drawImage calls and two short paths.
 *
 * Accessibility: the root is `role="switch"` with `aria-checked` and a label;
 * Space and Enter pull the cord (the same physical pull, animated); a click
 * or tap anywhere on it pulls too. It fires `change`. The canvases are
 * aria-hidden. Touch: the acorn's 44 px grip takes the drag
 * (`touch-action: none`), the rest of the box still scrolls the page.
 *
 * Reduced motion: the switch still works and nothing moves. State changes
 * instantly, the glow steps instead of ramping, and no frame is requested.
 *
 * With `target` it is a finish switch: on is aluminium, off is graphite,
 * written to the target's `data-finish` — and, on the page root, remembered
 * in localStorage['tui-finish'] exactly as the site's own finish key does.
 *
 * No dependencies. The exported helpers are pure and tested in Node.
 */

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the room lamp

/** Screen direction toward the room lamp: 0° is from above, clockwise, y down. */
export function lampOf(light) {
  const t = (light * Math.PI) / 180;
  return { lx: Math.sin(t), ly: -Math.cos(t) };
}

/** The room lamp as a 3D unit vector (x right, y down, z toward the viewer), `off` degrees off the line of sight. */
export function lampVector(light, off = 55) {
  const { lx, ly } = lampOf(light);
  const e = (off * Math.PI) / 180;
  return [lx * Math.sin(e), ly * Math.sin(e), Math.cos(e)];
}

// ---------------------------------------------------------------- the filament

/** Blackbody colour at T kelvin, 0–255 per channel (Tanner Helland's fit). */
export function blackbody(T) {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((v) => Math.round(clamp(v, 0, 255)));
}

/**
 * The filament's thermal constants. `tau` is the warm-up time scale: the
 * electrical power heats the coil at warm/tau kelvin per second while it is
 * cold; radiation (∝ T⁴) balances it exactly at the warm temperature.
 * `draper` is where a hot body starts to glow a dull red.
 */
export const FILAMENT = Object.freeze({ room: 300, draper: 760, tau: 0.15, subStep: 1 / 600, maxStep: 1 / 30 });

/**
 * Advance the filament temperature. C·dT/dt = P·on − k(T⁴ − T_room⁴), with P
 * and k chosen so it settles at `warm`. Clamped and sub-stepped: a tab that
 * returns after 2.5 s advances one sane frame.
 */
export function stepFilament(T, on, dt, warm = 2700, tau = FILAMENT.tau) {
  const Tr = FILAMENT.room;
  const rate = warm / tau;
  const span = warm ** 4 - Tr ** 4;
  let t = clamp(Number.isFinite(T) ? T : Tr, Tr, warm);
  let left = clamp(dt, 0, FILAMENT.maxStep);
  while (left > 1e-9) {
    const h = Math.min(left, FILAMENT.subStep);
    t += rate * ((on ? 1 : 0) - (t ** 4 - Tr ** 4) / span) * h;
    left -= h;
  }
  return clamp(t, Tr, warm);
}

/** How brightly the filament glows, 0–1, as drawn: nothing below the Draper point, full at the warm temperature. */
export const glowOf = (T, warm = 2700) => clamp((T - FILAMENT.draper) / (warm - FILAMENT.draper), 0, 1) ** 1.6;

// ---------------------------------------------------------------- the switch

/**
 * The pull switch, in metres and newtons. The plunger travels `travel`; the
 * latch trips at `click` and re-arms below `reset`. While armed the force
 * rises (`preload` + `rate`·e) with a detent bump before the trip; once
 * tripped the over-centre spring lets go and the force drops to `after` of
 * the rate — that drop is the snap.
 */
export const SWITCH = Object.freeze({
  travel: 0.014, click: 0.009, reset: 0.0035, preload: 1.2, rate: 500, bump: 3, bumpAt: 0.78, bumpWidth: 0.3, after: 0.35,
  mass: 0.004, damping: 1.4,
});

/** The force the switch pushes back with at extension `e`. */
export function switchForce(e, armed, sw = SWITCH) {
  if (e <= 0) return sw.preload;
  if (!armed) return sw.preload + sw.rate * sw.after * e;
  const c = sw.click * sw.bumpAt;
  const w = sw.click * sw.bumpWidth;
  return sw.preload + sw.rate * e + sw.bump * Math.exp(-(((e - c) / w) ** 2));
}

// ---------------------------------------------------------------- the lamp

/**
 * The lamps, in metres, in the pendant's own frame: x right, y down from
 * where the cable enters the top. `bulb` is where the glass meets the cap;
 * `anchor` is where the pull cord leaves the switch; `cord` is the default
 * pull-cord length; `mass` and `cm` make the pendulum.
 */
export const STYLES = Object.freeze({
  dome: Object.freeze({ left: 0.143, right: 0.143, bottom: 0.19, rim: 0.155, R: 0.14, bulb: 0.105, anchor: [0.056, 0.153], cord: 0.26, mass: 1.1, cm: 0.09 }),
  tube: Object.freeze({ left: 0.075, right: 0.075, bottom: 0.28, rim: 0.25, R: 0.072, bulb: 0.19, anchor: [0.05, 0.248], cord: 0.24, mass: 0.9, cm: 0.13 }),
  bare: Object.freeze({ left: 0.032, right: 0.056, bottom: 0.17, rim: 0.062, R: 0.0205, bulb: 0.084, anchor: [0.047, 0.042], cord: 0.2, mass: 0.35, cm: 0.05 }),
});

/** The A60 glass: neck radius, sphere radius, and the sphere centre below the cap. */
export const BULB = Object.freeze({ neck: 0.0135, R: 0.03, centre: 0.05 });
export const ACORN = Object.freeze({ len: 0.04, r: 0.0088, mass: 0.016 });
export const CANOPY = Object.freeze({ r: 0.04, h: 0.02 });
/** How much of the view is from below: the rim of a shade reads as an ellipse this flat. */
export const ELEVATION = 0.18;
/** Room kept below the acorn for a full pull, and the least cable between ceiling and lamp. */
const PULL_ROOM = 0.042;
const MIN_DROP = 0.035;

/**
 * Fit the lamp into a box W × H (CSS px). Returns the scale `S` (px per
 * metre), the cable drop `Ls` (m) that fills the height, and where the
 * ceiling pivot sits. A tall narrow box (a toggle hanging from a nav) is
 * width-bound and gets a long cable; a wide hero is height-bound.
 */
export function layout(W, H, style = 'dome', cord = 1) {
  const st = STYLES[style] ?? STYLES.dome;
  const Lp = st.cord * clamp(+cord || 1, 0.4, 2);
  const left = st.left;
  const right = Math.max(st.right, st.anchor[0] + ACORN.r);
  const span = left + right + 0.05;
  const below = Math.max(st.bottom, st.anchor[1] + Lp + ACORN.len + PULL_ROOM) + 0.012;
  const above = CANOPY.h + ELEVATION * CANOPY.r;
  const byW = W > 0 ? W / span : Infinity;
  const byH = H > 0 ? H / (above + MIN_DROP + below) : Infinity;
  let S = Math.min(byW, byH);
  if (!Number.isFinite(S) || S <= 0) S = 400;
  const Ls = Math.max(MIN_DROP, (H > 0 ? H / S : 0) - above - below);
  return {
    S, Ls, Lp, below, above,
    axisX: (W > 0 ? W / 2 : 0) + ((left - right) / 2) * S,
    pivotY: CANOPY.h * S,
  };
}

// ---------------------------------------------------------------- the rig

export const RIG = Object.freeze({
  segments: 12, nodeMass: 0.0008, ks: 40000, slack: 0.02, kd: 1.2, air: 4, g: 9.81,
  subStep: 1 / 16000, maxStep: 1 / 30,
  hand: 800, handMax: 12, handZeta: 0.8,
  swayZeta: 0.3, minPendulum: 0.6,
});

/**
 * A rig at rest: the cord hanging straight from the anchor, the switch
 * seated and armed, the lamp plumb. Positions in metres from the ceiling
 * pivot, y down.
 */
export function makeRig({ style = 'dome', Ls = 0.3, Lp } = {}) {
  const st = STYLES[style] ?? STYLES.dome;
  const N = RIG.segments;
  const len = Lp ?? st.cord;
  const n = N + 1; // node 0 is the anchor (on the lamp), 1…N the cord, N the acorn
  const r = {
    style, st, N, Ls, seg: len / N,
    x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
    m: new Float64Array(n), fx: new Float64Array(n), fy: new Float64Array(n),
    theta: 0, omega: 0, e: 0, ev: 0, armed: true, tension: 0,
  };
  for (let i = 1; i <= N; i += 1) r.m[i] = i === N ? ACORN.mass : RIG.nodeMass;
  const L = Math.max(RIG.minPendulum, Ls + st.cm);
  r.L = L;
  r.I = st.mass * L * L;
  r.cTheta = 2 * RIG.swayZeta * Math.sqrt(st.mass * RIG.g * L * r.I);
  const [ax, ay] = anchorOf(r);
  for (let i = 1; i <= N; i += 1) { r.x[i] = ax; r.y[i] = ay + i * r.seg; }
  r.x[0] = ax;
  r.y[0] = ay;
  return r;
}

/** Where the cord leaves the lamp, in the room, for the lamp's current angle. */
export function anchorOf(r, theta = r.theta) {
  const [lx, ly] = r.st.anchor;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const d = r.Ls + ly;
  return [d * s + lx * c, d * c - lx * s];
}

/** A point of the lamp's own frame, in the room. */
export function lampPoint(r, lx, ly, theta = r.theta) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const d = r.Ls + ly;
  return [d * s + lx * c, d * c - lx * s];
}

function substep(r, h, hand, events) {
  const { N, x, y, vx, vy, m, fx, fy } = r;
  const sw = SWITCH;
  const s = Math.sin(r.theta);
  const c = Math.cos(r.theta);
  const [lax, lay] = r.st.anchor;
  const d = r.Ls + lay;
  // The anchor rides on the lamp: position and velocity from the pendulum.
  const Ax = d * s + lax * c;
  const Ay = d * c - lax * s;
  const dAx = d * c - lax * s;
  const dAy = -d * s - lax * c;
  x[0] = Ax; y[0] = Ay; vx[0] = dAx * r.omega; vy[0] = dAy * r.omega;

  for (let i = 1; i <= N; i += 1) {
    fx[i] = -RIG.air * m[i] * vx[i];
    fy[i] = m[i] * RIG.g - RIG.air * m[i] * vy[i];
  }
  // A cord pulls hard and barely pushes back: stiff in tension, soft in
  // compression (a textile cord's own stiffness), damped either way. A spring
  // that switched off at its rest length would chatter there for ever.
  let T0 = 0;
  let t0x = 0;
  let t0y = 1;
  for (let k = 0; k < N; k += 1) {
    const dx = x[k + 1] - x[k];
    const dy = y[k + 1] - y[k];
    const L = Math.hypot(dx, dy) || 1e-9;
    const rest = r.seg + (k === 0 ? r.e : 0);
    const ux = dx / L;
    const uy = dy / L;
    const rv = (vx[k + 1] - vx[k]) * ux + (vy[k + 1] - vy[k]) * uy;
    const stretch = L - rest;
    const f = (stretch > 0 ? RIG.ks : RIG.ks * RIG.slack) * stretch + RIG.kd * rv;
    if (k > 0) { fx[k] += f * ux; fy[k] += f * uy; }
    fx[k + 1] -= f * ux;
    fy[k + 1] -= f * uy;
    if (k === 0) { T0 = Math.max(0, f); t0x = ux; t0y = uy; }
  }
  if (hand && hand.node >= 1 && hand.node <= N) {
    const j = hand.node;
    let hx = RIG.hand * (hand.x - x[j]);
    let hy = RIG.hand * (hand.y - y[j]);
    const F = Math.hypot(hx, hy);
    if (F > RIG.handMax) { hx *= RIG.handMax / F; hy *= RIG.handMax / F; }
    const ch = 2 * RIG.handZeta * Math.sqrt(RIG.hand * m[j]);
    fx[j] += hx - ch * vx[j];
    fy[j] += hy - ch * vy[j];
  }
  for (let i = 1; i <= N; i += 1) {
    vx[i] += (fx[i] / m[i]) * h;
    vy[i] += (fy[i] / m[i]) * h;
    x[i] += vx[i] * h;
    y[i] += vy[i] * h;
  }
  // The plunger: pulled by the cord's tension, pushed back by the switch.
  r.ev += ((T0 - switchForce(r.e, r.armed) - sw.damping * r.ev) / sw.mass) * h;
  r.e += r.ev * h;
  if (r.e < 0) { r.e = 0; if (r.ev < 0) r.ev = 0; }
  if (r.e > sw.travel) { r.e = sw.travel; if (r.ev > 0) r.ev = 0; }
  if (r.armed && r.e >= sw.click) { r.armed = false; events.push('click'); }
  else if (!r.armed && r.e <= sw.reset) { r.armed = true; events.push('reset'); }
  // The lamp: a damped pendulum, pulled at the anchor by the cord.
  const Q = T0 * (t0x * dAx + t0y * dAy);
  const st = r.st;
  r.omega += ((-st.mass * RIG.g * r.L * Math.sin(r.theta) - r.cTheta * r.omega + Q) / r.I) * h;
  r.theta += r.omega * h;
  r.tension = T0;
}

/**
 * Advance the rig by `dt` seconds (clamped to 1/30 s, sub-stepped at
 * 1/16000 s). `hand` is null or { node, x, y }: a stiff spring from that node
 * toward a point, capped at 12 N like a hand that stops pulling at the stop.
 * Returns the switch events in order: 'click' when the latch trips (the
 * lamp toggles), 'reset' when it re-arms.
 */
export function stepRig(r, dt, hand = null) {
  const events = [];
  let left = clamp(Number.isFinite(dt) ? dt : 0, 0, RIG.maxStep);
  while (left > 1e-9) {
    const h = Math.min(left, RIG.subStep);
    substep(r, h, hand, events);
    left -= h;
  }
  return events;
}

/** Still, to within `eps` m/s everywhere (the caller scales it to a fraction of a pixel). */
export function rigSettled(r, eps = 0.002) {
  for (let i = 1; i <= r.N; i += 1) if (Math.abs(r.vx[i]) > eps || Math.abs(r.vy[i]) > eps) return false;
  if (Math.abs(r.omega) * (r.Ls + 0.3) > eps) return false;
  return Math.abs(r.ev) <= eps;
}

/** Stop dead: what the loop does once motion is below a hundredth of a pixel a frame. */
export function freezeRig(r) {
  r.vx.fill(0);
  r.vy.fill(0);
  r.omega = 0;
  r.ev = 0;
}

/** Let a new rig hang for a while so it wakes up already still. */
export function settleRig(r, seconds = 2) {
  for (let t = 0; t < seconds; t += 1 / 60) stepRig(r, 1 / 60);
  freezeRig(r);
  return r;
}

/** Where the acorn hangs at rest (the last node), for the programmed pull. */
export const acornOf = (r) => [r.x[r.N], r.y[r.N]];

/** The depth of a full programmed pull below rest, in metres: past the stop, with the hand's lag. */
export const PULL_DEPTH = SWITCH.travel + 0.014;

// ---------------------------------------------------------------- the light on the wall

/**
 * The downlight on the wall behind the lamp, 0–1, at a wall point (x, y)
 * metres from the bulb's centre (y down), the wall `d` behind it. Inverse
 * square and cosine; light is stopped by the shade (a ray that crosses the
 * rim plane inside the rim) or, for the bare holder, by the holder above.
 * The edge is soft by the bulb's size; the white inside of a shade adds to
 * what goes down.
 */
export function wallLight(x, y, style = 'dome', d = 0.2) {
  const st = STYLES[style] ?? STYLES.dome;
  const r2 = x * x + y * y + d * d;
  const bulbY = st.bulb + BULB.centre; // lamp frame
  const flat = Math.sqrt(x * x + d * d);
  // The bulb is not a point: sample it top to bottom, so the rim's cut-off
  // softens by the bulb's own size, as a real shade's does.
  const n = 7;
  let seen = 0;
  for (let k = 0; k < n; k += 1) {
    const yb = (k / (n - 1) - 0.5) * 1.6 * BULB.R;
    const ry = y - yb; // the ray, from this part of the bulb
    const rim = st.rim - (bulbY + yb); // the rim plane, relative to it (negative: above)
    let v = 1;
    if (style === 'bare') {
      if (ry < 0 && rim < 0) v = (rim / ry) * flat > st.R ? 1 : 0;
    } else if (rim < 0) {
      if (ry < 0) v = (rim / ry) * flat > st.R ? 1 : 0;
    } else {
      v = ry > 0 && (rim / ry) * flat < st.R ? 1 : 0;
    }
    seen += v;
  }
  const E = ((d * d * d) / r2 ** 1.5) * (seen / n);
  const down = y / Math.sqrt(r2);
  return E * (1 + 0.8 * Math.max(0, down));
}

// ---------------------------------------------------------------- tuning

export const FINISHES = Object.freeze(['auto', 'aluminium', 'graphite']);
export const SHADES = Object.freeze(Object.keys(STYLES));
export const BULBS = Object.freeze(['clear', 'frosted']);

/**
 * The materials. `metal` is the shade, holder, ceiling cup and acorn;
 * `cord` the textile cable and pull cord; the inside of a shade is white
 * enamel on both finishes, as on the real thing.
 */
export const MATERIALS = Object.freeze({
  aluminium: Object.freeze({
    key: 'aluminium', metal: '#bdbfbc', amb: 0.22, kd: 0.74, ks: 0.1, gloss: 7, env: 0.04, grain: 0.035,
    cord: '#c9c8c2', cordDark: '#8e8d88', cordLight: '#f4f3ee', shadow: 0.3, lip: 0.55,
  }),
  graphite: Object.freeze({
    key: 'graphite', metal: '#2b2c30', amb: 0.24, kd: 0.8, ks: 0.1, gloss: 7, env: 0.04, grain: 0.05,
    cord: '#232426', cordDark: '#0d0d0e', cordLight: '#6a6b6f', shadow: 0.42, lip: 0.28,
  }),
});

/** The page's object tokens `auto` reads the lamp's material from (`--tui-obj-frame` …), when a page carries them. */
export const LOOK = Object.freeze(['frame', 'edge']);
const ENAMEL = '#efebe2';
const MILK = '#f2f0ea';
/** Where tungsten burns to at its hottest: not white, a warm cream. */
const HOT = [255, 243, 212];

/** Where the wall is behind the lamp (m), and how far the room lamp's shadow falls on it. */
export const WALL = Object.freeze({ distance: 0.12, shadow: 0.03, blur: 0.022 });

export const TUNING = Object.freeze({
  rig: RIG, switch: SWITCH, filament: FILAMENT, elevation: ELEVATION, pullDepth: PULL_DEPTH, wall: WALL, maxDpr: 2,
  glowLevels: 16,
});

// ================================================================ drawing
// Everything below runs only in a browser.

const GLOW_LEVELS = 16;
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
const css = (rgb, a = 1) => `rgba(${rgb.map((v) => Math.round(v)).join(', ')}, ${clamp(a, 0, 1).toFixed(3)})`;
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1));
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
let probe = null;
/** Any opaque CSS colour (hex, rgb(), oklch() …) as #rrggbb, the form the maths here reads: painted as one pixel and read back. */
const hex = (value) => {
  probe ??= canvasOf(1, 1).getContext('2d', { willReadFrequently: true });
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};
const hexOf = (rgb) => `#${((1 << 24) | (Math.round(rgb[0]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[2])).toString(16).slice(1)}`;

/**
 * The lamp's material from a page's object tokens: its metal is the finish's
 * `--tui-obj-frame`, its cord the same metal with the finish's edge for the
 * light on it, its shadow the finish's own; a matte finish (chalk) takes no
 * sheen and no reflection. The shading numbers are the two named materials'.
 */
export function materialFrom(frame, edge, shadow, matte, glow = 0) {
  const rgb = hexRgb(frame);
  const to = (t) => hexOf(mixRgb(rgb, hexRgb(edge), t));
  return Object.freeze({
    key: `page|${frame}|${edge}|${shadow}|${matte ? 1 : 0}|${glow}`,
    metal: frame, amb: 0.23, kd: 0.77, ks: matte ? 0 : 0.1, gloss: 7, env: matte ? 0 : 0.04, grain: matte ? 0.06 : 0.04,
    // A finish that glows (Phosphor, Night) has a frame as dark as the wall behind it: its cord and its acorn are drawn in its edge colour, so they read.
    ...(glow > 0 ? { acorn: to(0.5) } : {}),
    cord: glow > 0 ? to(0.55) : frame, cordDark: glow > 0 ? to(0.25) : hexOf(mixRgb(rgb, [0, 0, 0], 0.45)), cordLight: glow > 0 ? hexOf(hexRgb(edge)) : to(0.35),
    shadow: clamp(shadow, 0, 1),
    // A bright metal has a bright rolled lip; a dark one a dim one.
    lip: (rgb[0] + rgb[1] + rgb[2]) / 765 > 0.45 ? 0.55 : 0.28,
  });
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** A premultiplied, linear-light paint buffer, turned into a canvas at the end. */
class Paint {
  constructor(w, h) { this.w = Math.max(1, Math.ceil(w)); this.h = Math.max(1, Math.ceil(h)); this.d = new Float32Array(this.w * this.h * 4); }
  over(i, j, r, g, b, a) {
    if (a <= 0 || i < 0 || j < 0 || i >= this.w || j >= this.h) return;
    const k = (j * this.w + i) * 4;
    const d = this.d;
    const ia = 1 - a;
    d[k] = r * a + d[k] * ia;
    d[k + 1] = g * a + d[k + 1] * ia;
    d[k + 2] = b * a + d[k + 2] * ia;
    d[k + 3] = a + d[k + 3] * ia;
  }
  canvas() {
    const c = canvasOf(this.w, this.h);
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    const o = img.data;
    const d = this.d;
    for (let k = 0; k < d.length; k += 4) {
      const a = d[k + 3];
      if (a <= 0.0005) continue;
      o[k] = SRGB[Math.round(clamp(d[k] / a, 0, 1) * 4096)];
      o[k + 1] = SRGB[Math.round(clamp(d[k + 1] / a, 0, 1) * 4096)];
      o[k + 2] = SRGB[Math.round(clamp(d[k + 2] / a, 0, 1) * 4096)];
      o[k + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

/**
 * A turned part — a surface of revolution about the vertical axis — seen a
 * little from below, painted pixel by pixel. `r(y)` is its radius (m) down
 * its height y0…y1 (m, lamp frame). Its top edge is straight (`cut`, as where
 * it meets something) or the front arc of its top circle (`arc`); its bottom
 * edge is the front arc of its bottom circle, below which a `solid` part
 * shows its underside and an open shade shows nothing (its inside is drawn
 * separately). `shade(nx, ny, nz, x, y)` returns linear [r, g, b, a].
 */
function turned(buf, fr, part, shade, under) {
  const { k, ox, oy } = fr;
  const s = ELEVATION;
  const { y0, y1 } = part;
  const r0 = part.r(y0);
  const r1 = part.r(y1);
  let rmax = 0;
  for (let t = 0; t <= 48; t += 1) rmax = Math.max(rmax, part.r(y0 + ((y1 - y0) * t) / 48));
  const jTop = Math.max(0, Math.floor(oy + (y0 - s * r0) * k) - 1);
  const jBot = Math.min(buf.h - 1, Math.ceil(oy + (y1 + s * r1) * k) + 1);
  const iL = Math.max(0, Math.floor(ox - rmax * k) - 1);
  const iR = Math.min(buf.w - 1, Math.ceil(ox + rmax * k) + 1);
  const dy = Math.max((y1 - y0) / 300, 1e-5);
  for (let j = jTop; j <= jBot; j += 1) {
    const y = (j + 0.5 - oy) / k;
    const yc = clamp(y, y0, y1);
    const r = part.r(yc);
    const ya = Math.max(y0, yc - dy);
    const yb = Math.min(y1, yc + dy);
    const dr = yb > ya ? (part.r(yb) - part.r(ya)) / (yb - ya) : 0;
    const ca = 1 / Math.sqrt(1 + dr * dr);
    const sa = dr * ca;
    for (let i = iL; i <= iR; i += 1) {
      const x = (i + 0.5 - ox) / k;
      const ax = Math.abs(x);
      const bot = y1 - s * r1 * Math.sqrt(Math.max(0, 1 - (x / r1) ** 2));
      const cb = clamp((bot - y) * k + 0.5, 0, 1);
      if (r > 0 && ax < r + 1 / k) {
        const cx = clamp((r - ax) * k + 0.5, 0, 1);
        const top = part.top === 'arc' ? y0 - s * r0 * Math.sqrt(Math.max(0, 1 - (x / r0) ** 2)) : y0;
        const ct = clamp((y - top) * k + 0.5, 0, 1);
        const cov = cx * ct * cb;
        if (cov > 0) {
          const q = clamp(x / r, -1, 1);
          const c = shade(q * ca, -sa, Math.sqrt(1 - q * q) * ca, x, y);
          buf.over(i, j, c[0], c[1], c[2], c[3] * cov);
        }
      }
      if (under && ax < r1 + 1 / k) {
        const e = (y - y1) / (s * r1);
        const d = 1 - Math.hypot(x / r1, e);
        const cu = clamp(d * s * r1 * k + 0.5, 0, 1) * (1 - cb);
        if (cu > 0) {
          const c = under(x / r1, e, x, y);
          buf.over(i, j, c[0], c[1], c[2], c[3] * cu);
        }
      }
    }
  }
}

/** Cheap stable noise in [0, 1) for a 2D point. */
const hashXY = (x, y) => {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Bead-blasted metal or soft-touch paint under the room lamp: ambient from the ceiling, Lambert, a broad sheen. */
function metalShader(mat, L, V, { spec = true, sheenOnly = false } = {}) {
  const albedo = hexLin(mat.metal);
  const H = norm3([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
  const grain = mat.grain ?? 0;
  return (nx, ny, nz, x = 0, y = 0) => {
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    const ndh = Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]);
    // Bead-blast: a fine, even grain in the surface, fixed to the part.
    const bead = grain ? 1 + grain * (hashXY(x * 9000, y * 9000) - 0.5) : 1;
    const ndv = nx * V[0] + ny * V[1] + nz * V[2];
    const ry = 2 * ndv * ny - V[1];
    const sky = smooth(-0.15, 0.85, -ry);
    const sp = (spec ? mat.ks * ndh ** mat.gloss : 0) + mat.env * (0.25 + 0.75 * sky) * (0.4 + 0.6 * (1 - Math.max(0, ndv)) ** 2);
    if (sheenOnly) return [1, 1, 1, clamp(sp * 2.4, 0, 0.85)];
    // A rough surface darkens toward the silhouette, where it is seen at a graze.
    const graze = 0.62 + 0.38 * Math.max(0, ndv) ** 0.7;
    const lit = (mat.amb * (0.55 + 0.45 * Math.max(0, -ny) + 0.25 * Math.max(0, nz)) + mat.kd * Math.max(0, ndl)) * graze;
    const v = bead * lit + sp * 1.4;
    return [albedo[0] * v, albedo[1] * v, albedo[2] * v, 1];
  };
}

/** The underside of a solid turned part: a flat face turned away from the lamp, lit only by the room. */
const undersideShader = (mat) => {
  const albedo = hexLin(mat.metal);
  return (qx, e) => {
    const l = mat.amb * (0.32 + 0.12 * e) * (1 - 0.25 * qx * qx);
    return [albedo[0] * l, albedo[1] * l, albedo[2] * l, 1];
  };
};

/** The A60 envelope's radius at y (m) below the cap. */
export function bulbRadius(y) {
  const { neck, R, centre } = BULB;
  if (y <= 0) return neck;
  if (y <= centre) return neck + (R - neck) * Math.sin((y / centre) * (Math.PI / 2)) ** 1.35;
  const t = y - centre;
  return t >= R ? 0 : Math.sqrt(R * R - t * t);
}

/** Canvas helpers that draw in metres of the lamp frame. */
function withFrame(g, fr) { g.setTransform(fr.k, 0, 0, fr.k, fr.ox, fr.oy); }

/** The glass outline as a Path2D, in metres, cap at y = top. */
function bulbPath(top) {
  const p = new Path2D();
  const steps = 96;
  const bottom = BULB.centre + BULB.R;
  // Denser toward the bottom, where the round of the glass turns fastest.
  const at = (i) => bottom * (1 - (1 - i / steps) ** 2);
  for (let i = 0; i <= steps; i += 1) {
    const y = at(i);
    const x = -bulbRadius(y);
    if (i === 0) p.moveTo(x, top + y); else p.lineTo(x, top + y);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const y = at(i);
    p.lineTo(bulbRadius(y), top + y);
  }
  p.closePath();
  return p;
}

/** A turned outline as a Path2D (m): the profile down one side, the front arc of the bottom, up the other. */
function turnedPath(r, y0, y1, { topArc = false } = {}) {
  const p = new Path2D();
  const s = ELEVATION;
  const n = 40;
  const r0 = r(y0);
  const r1 = r(y1);
  if (topArc) {
    for (let i = 0; i <= n; i += 1) {
      const a = Math.PI + (Math.PI * i) / n;
      const x = r0 * Math.cos(a);
      const y = y0 + s * r0 * Math.sin(a);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  } else {
    p.moveTo(-r0, y0);
    p.lineTo(r0, y0);
  }
  for (let i = 0; i <= n; i += 1) { const y = y0 + ((y1 - y0) * i) / n; p.lineTo(r(y), y); }
  for (let i = 0; i <= n; i += 1) {
    const a = (Math.PI * i) / n;
    p.lineTo(r1 * Math.cos(a), y1 - s * r1 * Math.sin(a));
  }
  for (let i = n; i >= 0; i -= 1) { const y = y0 + ((y1 - y0) * i) / n; p.lineTo(-r(y), y); }
  p.closePath();
  return p;
}

/** The parts of each lamp as profiles, in the lamp frame (m). */
function partsOf(style) {
  const st = STYLES[style];
  if (style === 'dome') {
    const top = 0.02;
    const skirt = 0.14;
    return {
      grip: { r: () => 0.0085, y0: -0.004, y1: 0.028, top: 'cut' },
      shell: {
        r: (y) => (y >= skirt ? st.R : Math.max(0.021, st.R * Math.sqrt(Math.max(0, 1 - (1 - (y - top) / (skirt - top)) ** 2)) ** 0.92)),
        y0: top, y1: st.rim, top: 'cut', world: true,
      },
    };
  }
  if (style === 'tube') {
    return {
      grip: { r: () => 0.0085, y0: -0.004, y1: 0.03, top: 'cut' },
      shell: { r: () => st.R, y0: 0.024, y1: st.rim, top: 'arc' },
    };
  }
  return {
    holder: {
      // Turned aluminium: a shoulder, the body, two cut grooves near the mouth.
      r: (y) => {
        if (y < 0.006) return 0.0105 + (0.0205 - 0.0105) * smooth(0, 0.006, y);
        const g1 = Math.exp(-(((y - 0.046) / 0.0011) ** 2));
        const g2 = Math.exp(-(((y - 0.051) / 0.0011) ** 2));
        return 0.0205 - 0.0012 * (g1 + g2);
      },
      y0: 0, y1: st.rim, top: 'cut',
    },
    base: {
      r: (y) => 0.0132 + 0.0009 * Math.cos(((y - st.rim) / 0.0036) * Math.PI * 2),
      y0: st.rim, y1: st.bulb, top: 'cut',
    },
    pod: { r: () => 0.0075, x: st.anchor[0], y0: 0.012, y1: st.anchor[1], top: 'arc' },
  };
}

/**
 * Everything the frame loop draws that does not move by itself, for one
 * finish at one size: the lamp's body (turning with the sway), the sheen on
 * the dome and the glass (not turning), the inside of the shade dark and
 * lit, the bulb cold and at GLOW_LEVELS temperatures, the ceiling cup, the
 * acorn, the shadows, and the scallop of light on the wall.
 */
function bake(o, lay, dpr, mat) {
  const st = STYLES[o.shade];
  const S = lay.S;
  const k = S * dpr; // device px per metre
  const L = lampVector(o.light);
  const V = norm3([0, ELEVATION, Math.sqrt(1 - ELEVATION ** 2)]);
  const parts = partsOf(o.shade);
  const out = { mat, dpr, S };
  const bulbTop = st.bulb;
  const bc = bulbTop + BULB.centre; // bulb centre, lamp frame

  // The lamp's sprite frame: generous around the lamp, origin at the cable entry.
  const padX = 0.02;
  const lampW = Math.max(st.left, st.right, st.anchor[0] + 0.012) + padX;
  const lampTop = -0.012;
  const lampBottom = Math.max(st.bottom, st.rim + ELEVATION * st.R) + 0.012;
  const fr = { k, ox: lampW * k, oy: -lampTop * k, w: 2 * lampW * k, h: (lampBottom - lampTop) * k };
  out.frame = { ox: lampW * S, oy: -lampTop * S, w: 2 * lampW * S, h: (lampBottom - lampTop) * S };

  // ---- the inside of the shade, cold and lit
  if (parts.shell) {
    const R = st.R;
    const rim = st.rim;
    const enamel = hexLin(ENAMEL);
    const warm = blackbody(o.warmth).map((v) => toLin(v));
    const off = new Paint(fr.w, fr.h);
    const on = new Paint(fr.w, fr.h);
    const s = ELEVATION;
    for (let j = 0; j < fr.h; j += 1) {
      const y = (j + 0.5 - fr.oy) / k;
      if (y < rim - s * R - 0.002 || y > rim + s * R + 0.002) continue;
      for (let i = 0; i < fr.w; i += 1) {
        const x = (i + 0.5 - fr.ox) / k;
        if (Math.abs(x) > R + 0.002) continue;
        const e = (y - rim) / (s * R);
        const d = 1 - Math.hypot(x / R, e);
        const cov = clamp(d * s * R * k + 0.5, 0, 1);
        if (cov <= 0) continue;
        // v: 0 at the front lip, 1 at the far lip.
        const front = rim - s * R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
        const back = rim + s * R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
        const v = clamp((y - front) / Math.max(1e-6, back - front), 0, 1);
        const lipBand = Math.exp(-((((1 - d) * s * R * k) / 1.6) ** 2)); // the far lip, seen edge on
        const lo = 0.012 + 0.045 * v * v + 0.07 * lipBand;
        off.over(i, j, enamel[0] * lo, enamel[1] * lo, enamel[2] * lo, cov);
        // Lit: the enamel near the bulb burns brightest; the far lip catches it edge on.
        const near = Math.exp(-((x / (R * 0.75)) ** 2)) * (0.55 + 0.45 * v);
        // The enamel right round the bulb is the brightest thing in the shade, and burns toward white.
        const hot = Math.exp(-((x * x + (y - rim) ** 2 * 9) / (2 * 0.05 * 0.05)));
        const hi = 0.3 + 0.75 * near + 0.3 * hot + 0.5 * lipBand;
        const w = clamp(hi - 0.9, 0, 1) * 0.55;
        const c = [warm[0] * enamel[0] * hi, warm[1] * enamel[1] * hi, warm[2] * enamel[2] * hi];
        on.over(i, j, c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w, cov);
      }
    }
    // The switch body hangs from the socket beside the bulb, into the opening.
    out.inside = off.canvas();
    const pod = canvasOf(fr.w, fr.h);
    const pg = pod.getContext('2d');
    withFrame(pg, fr);
    const ax = st.anchor[0];
    const ay = st.anchor[1];
    const podGrad = pg.createLinearGradient(ax - 0.006, 0, ax + 0.006, 0);
    const pm = hexRgb(mat.metal);
    podGrad.addColorStop(0, css(mixRgb(pm, [0, 0, 0], 0.55)));
    podGrad.addColorStop(0.35, css(mixRgb(pm, [255, 255, 255], 0.08)));
    podGrad.addColorStop(1, css(mixRgb(pm, [0, 0, 0], 0.7)));
    pg.save();
    const clipIn = new Path2D();
    clipIn.ellipse(0, rim, R, s * R, 0, 0, Math.PI * 2);
    pg.clip(clipIn);
    pg.fillStyle = podGrad;
    pg.fillRect(ax - 0.0055, rim - s * R - 0.01, 0.011, ay - (rim - s * R - 0.01));
    pg.fillStyle = 'rgba(0, 0, 0, 0.55)';
    pg.beginPath(); pg.ellipse(ax, ay, 0.0055, 0.0055 * s, 0, 0, Math.PI * 2); pg.fill();
    pg.restore();
    out.pod = pod;
    out.insideOn = on.canvas();
  }

  // ---- the bulb, cold
  const glass = new Paint(fr.w, fr.h);
  const glassSheen = new Paint(fr.w, fr.h);
  const bulbPart = { r: (y) => bulbRadius(y - bulbTop), y0: bulbTop, y1: bulbTop + BULB.centre + BULB.R * 0.999, top: 'cut' };
  const room = (Rx, Ry, Rz) => {
    // The room in a reflection: a bright ceiling, a darker floor, and the lamp as a softbox.
    const ceiling = 0.07 + 0.2 * smooth(-0.2, 0.9, -Ry);
    const bx = Math.abs(Rx - L[0]);
    const by = Math.abs(Ry - L[1]);
    const box = (1 - smooth(0.13, 0.19, bx)) * (1 - smooth(0.08, 0.13, by)) * (Rz > 0 ? 1 : 0);
    return ceiling + 18 * box;
  };
  const Lh = Math.hypot(L[0], L[1]) || 1;
  if (o.bulb === 'frosted') {
    // Milk glass: it takes the room's light on the lit side, scatters it to a brighter edge, and lets the dark inside of the shade show through underneath.
    const milk = hexLin(MILK);
    const H = norm3([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
    turned(glass, fr, { ...bulbPart, bottom: 'none' }, (nx, ny, nz) => {
      const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const ndv = Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]);
      const side = Math.max(0, (nx * L[0] + ny * L[1]) / Lh);
      const wrap = clamp((nx * L[0] + ny * L[1] + nz * L[2] + 0.35) / 1.35, 0, 1); // light wraps round milk glass
      const l = 0.05 + 0.6 * wrap ** 1.4 + 0.07 * ndv + 0.04 * Math.max(0, -ny) + 0.24 * (1 - ndv) ** 2.2 * side;
      return [milk[0] * l, milk[1] * l, milk[2] * l, 0.74 + 0.24 * (1 - ndv) ** 1.3];
    });
    turned(glassSheen, fr, { ...bulbPart, bottom: 'none' }, (nx, ny, nz) => {
      const ndh = Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]);
      return [1, 1, 1, 0.07 * ndh ** 5 + 0.08 * ndh ** 14];
    });
  } else {
    // Clear glass: nearly nothing where it is seen face on, a dark thick edge where it grazes, a bright hairline where the room lamp catches that edge.
    turned(glass, fr, { ...bulbPart, bottom: 'none' }, (nx, ny, nz) => {
      const ndv = Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]);
      const edge = 1 - ndv;
      const side = Math.max(0, (nx * L[0] + ny * L[1]) / Lh);
      const dark = 0.05 + 0.34 * edge ** 2.6;
      const rim = clamp(0.03 * side + 0.5 * edge ** 3 * side ** 1.4, 0, 0.9);
      const a = rim + dark * (1 - rim);
      return [rim / a, rim / a * 0.98, rim / a * 0.95, a];
    });
    turned(glassSheen, fr, { ...bulbPart, bottom: 'none' }, (nx, ny, nz) => {
      const ndv = Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]);
      const F = 0.04 + 0.96 * (1 - ndv) ** 5;
      const Rx = 2 * ndv * nx - V[0];
      const Ry = 2 * ndv * ny - V[1];
      const Rz = 2 * ndv * nz - V[2];
      // The back of the envelope reflects the room again, smaller and upside down.
      const Rbx = 2 * ndv * -nx - V[0];
      const Rby = 2 * ndv * -ny - V[1];
      const v = F * room(Rx, Ry, Rz) + 0.35 * F * room(Rbx, Rby, Rz);
      return [1, 1, 1, clamp(v, 0, 1)];
    });
  }
  const bulbCold = glass.canvas();
  if (o.bulb === 'clear') drawColdMount(bulbCold.getContext('2d'), fr, bulbTop, bc, L);
  if (o.shade === 'bare') drawThreadsShadow(bulbCold.getContext('2d'), fr, bulbTop);
  out.bulb = bulbCold;
  out.bulbSheen = glassSheen.canvas();
  out.glassPath = bulbPath(bulbTop);

  // ---- the lamp body: turns with the sway
  const body = new Paint(fr.w, fr.h);
  const sheen = new Paint(fr.w, fr.h);
  const shadeBody = metalShader(mat, L, V);
  const under = undersideShader(mat);
  if (o.shade === 'bare') {
    turned(body, fr, { ...parts.holder, bottom: 'solid' }, shadeBody, under);
    turned(body, fr, { ...parts.base, bottom: 'cut' }, metalShader({ ...MATERIALS.aluminium, metal: '#b9bab6', ks: 0.5, gloss: 30 }, L, V));
    // The switch pod on its arm.
    const pod = parts.pod;
    turned(body, { ...fr, ox: fr.ox + pod.x * k }, { ...pod, bottom: 'solid' }, shadeBody, under);
  } else {
    turned(body, fr, { ...parts.grip, bottom: 'cut' }, shadeBody);
    if (parts.shell.world) {
      // The dome: body here, its sheen in a layer that does not turn.
      turned(body, fr, { ...parts.shell, bottom: 'open' }, metalShader(mat, L, V, { spec: false }));
      turned(sheen, fr, { ...parts.shell, bottom: 'open', r: (y) => parts.shell.r(y) + 0.004 }, metalShader(mat, L, V, { sheenOnly: true }));
    } else {
      turned(body, fr, { ...parts.shell, bottom: 'open' }, shadeBody);
    }
  }
  out.body = body.canvas();
  const bg = out.body.getContext('2d');
  withFrame(bg, fr);
  if (o.shade === 'bare') drawPodArm(bg, st, mat);
  if (parts.shell) drawLip(bg, st, mat);
  if (parts.shell?.world) out.sheen = sheen.canvas();
  if (parts.shell) {
    out.shellPath = turnedPath(parts.shell.r, parts.shell.y0 - 0.001, st.rim, { topArc: parts.shell.top === 'arc' });
    const lip = new Path2D();
    lip.ellipse(0, st.rim, st.R - 0.0015, ELEVATION * (st.R - 0.0015), 0, Math.PI, Math.PI * 2);
    out.lipPath = lip;
  }

  // ---- the bulb at temperature. Its own small frame around the bulb, with the
  // shade already cut out of it, so the loop draws one screen-blended sprite.
  const gk = BLOOM * 2 * k;
  const gfr = { k, ox: BLOOM * k, oy: (BLOOM - bc) * k, w: gk, h: gk };
  const gsx = fr.ox - BLOOM * k;
  const gsy = fr.oy + (bc - BLOOM) * k;
  out.glowFrame = { x: -BLOOM * S, y: (bc - BLOOM) * S, w: 2 * BLOOM * S };
  out.glow = [];
  for (let lv = 1; lv <= GLOW_LEVELS; lv += 1) {
    const T = FILAMENT.draper + ((o.warmth - FILAMENT.draper) * lv) / GLOW_LEVELS;
    const gl = glowOf(T, o.warmth);
    const col = blackbody(T);
    let c;
    if (o.bulb === 'frosted') {
      const p = new Paint(gfr.w, gfr.h);
      const lin = mixRgb(col, HOT, 0.2 * gl).map(toLin);
      const fy = bc - 0.004;
      turned(p, gfr, { ...bulbPart, bottom: 'none' }, (nx, ny, nz, x, y) => {
        const ndv = Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]);
        const hot = Math.exp(-((x * x + (y - fy) ** 2) / 0.00022));
        const e = gl * (0.7 + 0.3 * ndv) * (0.75 + 1.3 * hot);
        const w = clamp(e - 0.9, 0, 1) * 0.65; // past full, the core burns toward white
        return [lin[0] + (1 - lin[0]) * w, lin[1] + (1 - lin[1]) * w, lin[2] + (1 - lin[2]) * w, clamp(e, 0, 1)];
      });
      c = p.canvas();
      drawBloom(c.getContext('2d'), gfr, bc, bc - 0.004, col, gl, 0.32);
    } else {
      c = canvasOf(gfr.w, gfr.h);
      drawHotMount(c.getContext('2d'), gfr, bulbTop, bc, col, gl);
    }
    const cg2 = c.getContext('2d');
    cg2.setTransform(1, 0, 0, 1, 0, 0);
    cg2.globalCompositeOperation = 'destination-out';
    cg2.drawImage(out.body, -gsx, -gsy);
    out.glow.push(c);
  }

  // ---- the ceiling cup
  const cupW = CANOPY.r + 0.01;
  const cfr = { k, ox: cupW * k, oy: (CANOPY.h + 0.004) * k, w: 2 * cupW * k, h: (CANOPY.h + 0.004 + ELEVATION * CANOPY.r + 0.006) * k };
  const cup = new Paint(cfr.w, cfr.h);
  turned(cup, cfr, { r: (y) => CANOPY.r - 0.0015 * smooth(-0.004, 0, y), y0: -CANOPY.h - 0.004, y1: 0, top: 'cut', bottom: 'solid' }, shadeBody, under);
  out.cup = cup.canvas();
  const cg = out.cup.getContext('2d');
  withFrame(cg, cfr);
  cg.fillStyle = 'rgba(0, 0, 0, 0.5)';
  cg.beginPath(); cg.ellipse(0, 0, 0.0065, 0.0065 * ELEVATION, 0, 0, Math.PI * 2); cg.fill();
  out.cupFrame = { ox: cupW * S, oy: (CANOPY.h + 0.004) * S, w: 2 * cupW * S, h: cfr.h / dpr };

  // ---- the acorn: turned, hanging from its ferrule
  const aw = ACORN.r + 0.004;
  const afr = { k, ox: aw * k, oy: 0.003 * k, w: 2 * aw * k, h: (ACORN.len + 0.008) * k };
  const acorn = new Paint(afr.w, afr.h);
  const acornR = (y) => {
    const t = clamp(y / ACORN.len, 0, 1);
    const body = ACORN.r * Math.sin(Math.PI * t ** 1.55) ** 0.72;
    return Math.max(t < 0.2 ? 0.0024 : 0, body);
  };
  turned(acorn, afr, { r: acornR, y0: 0, y1: ACORN.len * 0.999, top: 'cut', bottom: 'none' }, metalShader({ ...mat, metal: mat.acorn ?? mat.metal, ks: mat.ks * 1.4, gloss: mat.gloss * 1.6 }, L, V));
  out.acorn = acorn.canvas();
  const ag = out.acorn.getContext('2d');
  withFrame(ag, afr);
  ag.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ag.lineWidth = 0.0006;
  const ringY = ACORN.len * 0.34;
  ag.beginPath(); ag.ellipse(0, ringY, acornR(ringY) * 0.98, acornR(ringY) * ELEVATION * 0.98, 0, 0, Math.PI); ag.stroke();
  out.acornFrame = { ox: aw * S, oy: 0.003 * S, w: 2 * aw * S, h: afr.h / dpr };

  // ---- shadows on the wall: soft silhouettes, blurred once
  const sd = Math.max(0.5, dpr / 2);
  const blurPx = WALL.blur * S * sd;
  const sil = (w, h, ox, oy, paint) => {
    const pad = Math.ceil(blurPx * 2.5);
    const c = canvasOf(w * sd + pad * 2, h * sd + pad * 2);
    const g = c.getContext('2d');
    g.filter = `blur(${blurPx.toFixed(2)}px)`;
    g.setTransform(S * sd, 0, 0, S * sd, ox * sd + pad, oy * sd + pad);
    g.fillStyle = '#000';
    paint(g);
    return { c, ox: ox + pad / sd, oy: oy + pad / sd, w: c.width / sd, h: c.height / sd };
  };
  out.lampShadow = sil(out.frame.w, out.frame.h, out.frame.ox, out.frame.oy, (g) => {
    if (out.shellPath) g.fill(out.shellPath);
    if (out.shellPath) { g.beginPath(); g.ellipse(0, st.rim, st.R, ELEVATION * st.R, 0, 0, Math.PI * 2); g.fill(); }
    g.fill(out.glassPath);
    if (o.shade === 'bare') {
      g.fillRect(-0.0205, 0, 0.041, st.bulb);
      g.fillRect(st.anchor[0] - 0.0075, 0.012, 0.015, st.anchor[1] - 0.012);
      g.fillRect(0.015, 0.018, st.anchor[0] - 0.015, 0.008);
    } else {
      g.fillRect(-0.0085, 0, 0.017, 0.03);
    }
  });
  out.acornShadow = sil(out.acornFrame.w, out.acornFrame.h, out.acornFrame.ox, out.acornFrame.oy, (g) => {
    g.beginPath();
    for (let i = 0; i <= 30; i += 1) { const y = (ACORN.len * i) / 30; g.lineTo(acornR(y), y); }
    for (let i = 30; i >= 0; i -= 1) { const y = (ACORN.len * i) / 30; g.lineTo(-acornR(y), y); }
    g.fill();
  });
  out.cupShadow = sil(out.cupFrame.w, out.cupFrame.h, out.cupFrame.ox, out.cupFrame.oy, (g) => {
    g.fillRect(-CANOPY.r, -CANOPY.h, 2 * CANOPY.r, CANOPY.h);
    g.beginPath(); g.ellipse(0, 0, CANOPY.r, ELEVATION * CANOPY.r, 0, 0, Math.PI * 2); g.fill();
  });
  out.shadowScale = sd;

  // ---- the scallop on the wall, at a quarter of the light canvas's resolution
  const q = 0.3;
  const reach = 0.9;
  const pw = Math.ceil(2 * reach * S * q);
  const ph = Math.ceil(2 * reach * S * q);
  const pool = canvasOf(pw, ph);
  const pctx = pool.getContext('2d');
  const img = pctx.createImageData(pw, ph);
  const warmRgb = mixRgb(blackbody(o.warmth), [255, 244, 228], 0.15);
  for (let j = 0; j < ph; j += 1) {
    const y = (j + 0.5) / (S * q) - reach;
    for (let i = 0; i < pw; i += 1) {
      const x = (i + 0.5) / (S * q) - reach;
      const E = wallLight(x, y, o.shade, WALL.distance);
      const a = 0.7 * (1 - Math.exp(-1.1 * E));
      const p = (j * pw + i) * 4;
      img.data[p] = warmRgb[0];
      img.data[p + 1] = warmRgb[1];
      img.data[p + 2] = warmRgb[2];
      img.data[p + 3] = Math.round(255 * a * smooth(reach, reach * 0.8, Math.hypot(x, y)));
    }
  }
  pctx.putImageData(img, 0, 0);
  out.pool = { c: pool, w: 2 * reach * S, h: 2 * reach * S, ox: reach * S, oy: reach * S };
  out.bulbCentre = bc;
  out.warmRgb = blackbody(o.warmth);
  return out;
}

/** The E27 cap's shadow on the neck of the glass (bare holder). */
function drawThreadsShadow(g, fr, top) {
  withFrame(g, fr);
  const grad = g.createLinearGradient(0, top, 0, top + 0.01);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.save();
  g.clip(bulbPath(top));
  g.fillRect(-0.03, top, 0.06, 0.01);
  g.restore();
}

/**
 * The mount inside a clear bulb (m, lamp frame): the glass stem's press, two
 * lead-in wires, a support wire and the coil strung between the leads. The
 * coil is a helix seen a little from the side, so its turns lean.
 */
function mountPaths(bc) {
  const pressY = bc - 0.013;
  const fy = bc - 0.0045;
  const fx = 0.0085;
  const coil = new Path2D();
  const turns = 13;
  const steps = turns * 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ph = t * turns * Math.PI * 2;
    const x = -fx + 2 * fx * t + 0.0004 * (Math.cos(ph) - 1);
    const y = fy + 0.0012 * Math.sin(Math.PI * t) + 0.00055 * Math.sin(ph);
    if (i === 0) coil.moveTo(x, y); else coil.lineTo(x, y);
  }
  const leads = new Path2D();
  leads.moveTo(-0.0022, pressY);
  leads.lineTo(-fx, fy);
  leads.moveTo(0.0022, pressY);
  leads.lineTo(fx, fy);
  leads.moveTo(0, pressY);
  leads.lineTo(0, fy + 0.001);
  return { pressY, fy, coil, leads };
}

/** Half the side of the bulb's light sprite (m): the bloom spreads this far from the filament. */
const BLOOM = 0.075;

/** Cold clear bulb: the stem in glass, the wires and the coil in bright metal that the room lamp catches on one side. */
function drawColdMount(g, fr, top, bc, L) {
  withFrame(g, fr);
  const { pressY, coil, leads } = mountPaths(bc);
  const h = Math.hypot(L[0], L[1]) || 1;
  const tx = (L[0] / h) * 0.00016;
  const ty = (L[1] / h) * 0.00016;
  // The stem: a flared glass tube from the cap down to the press, its walls and its foot catching the light.
  const stem = new Path2D();
  stem.moveTo(-0.0056, top + 0.002);
  stem.quadraticCurveTo(-0.0033, top + 0.012, -0.0029, pressY);
  stem.lineTo(0.0029, pressY);
  stem.quadraticCurveTo(0.0033, top + 0.012, 0.0056, top + 0.002);
  stem.closePath();
  const tube = g.createLinearGradient(-0.0056, 0, 0.0056, 0);
  tube.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  tube.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
  tube.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  g.fillStyle = tube;
  g.fill(stem);
  g.strokeStyle = 'rgba(240, 244, 248, 0.3)';
  g.lineWidth = 0.0004;
  g.stroke(stem);
  g.fillStyle = 'rgba(255, 255, 255, 0.14)';
  g.beginPath(); g.ellipse(0, pressY, 0.0034, 0.0013, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(240, 244, 248, 0.34)';
  g.lineWidth = 0.00035;
  g.beginPath(); g.ellipse(0, pressY, 0.0034, 0.0013, 0, 0, Math.PI); g.stroke();
  // Nickel-plated wire: a dark body, a bright thread on the lit side.
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(96, 92, 88, 0.95)';
  g.lineWidth = 0.0007;
  g.stroke(leads);
  g.save();
  g.translate(tx, ty);
  g.strokeStyle = 'rgba(236, 232, 224, 0.75)';
  g.lineWidth = 0.00024;
  g.stroke(leads);
  g.restore();
  // The coil: cold tungsten, dull grey with a warm cast, a hard thread of light along its top.
  g.strokeStyle = 'rgba(88, 80, 72, 1)';
  g.lineWidth = 0.00115;
  g.stroke(coil);
  g.save();
  g.translate(tx, ty * 1.6);
  g.strokeStyle = 'rgba(206, 190, 168, 0.8)';
  g.lineWidth = 0.00036;
  g.stroke(coil);
  g.restore();
}

/**
 * The light a lit bulb puts round itself, drawn under whatever is already on
 * the sprite: a wide, soft bloom that spills past the glass onto the enamel.
 */
function drawBloom(g, fr, bc, fy, col, gl, a0) {
  withFrame(g, fr);
  g.globalCompositeOperation = 'destination-over';
  const R = BLOOM - 0.005;
  const bloom = g.createRadialGradient(0, fy, 0, 0, fy, R);
  for (let i = 0; i <= 10; i += 1) {
    const r = i / 10;
    bloom.addColorStop(r, css(col, a0 * gl * Math.exp(-((r * 2.5) ** 2)) * (1 - r ** 3)));
  }
  g.fillStyle = bloom;
  g.fillRect(-BLOOM, bc - BLOOM, 2 * BLOOM, 2 * BLOOM);
  g.globalCompositeOperation = 'source-over';
}

/**
 * A lit clear bulb: the coil white-hot in the middle and orange at its edges,
 * the leads it lights, the whole envelope full of warm light with a brighter
 * limb where it piped to the edge, and the bloom round it.
 */
function drawHotMount(g, fr, top, bc, col, gl) {
  withFrame(g, fr);
  const { fy, coil, leads } = mountPaths(bc);
  const white = mixRgb(col, HOT, 0.75);
  g.save();
  g.clip(bulbPath(top));
  // The envelope is full of light but still glass: warmest and brightest round the coil,
  // dimmer toward the thick edge, so the rim reads as a rim and the reflection has a ground.
  const fill = g.createRadialGradient(0, fy, 0, 0, fy, 0.034);
  fill.addColorStop(0, css(HOT, 0.7 * gl));
  fill.addColorStop(0.3, css(mixRgb(col, HOT, 0.7), 0.7 * gl));
  fill.addColorStop(0.65, css(mixRgb(col, HOT, 0.3), 0.42 * gl));
  fill.addColorStop(1, css(col, 0.26 * gl));
  g.fillStyle = fill;
  g.fillRect(-0.04, top, 0.08, 0.1);
  // The limb: the glass piped bright at its edge, a soft band and a thin hot line on it.
  g.lineJoin = 'round';
  g.strokeStyle = css(mixRgb(col, HOT, 0.25), 0.34 * gl);
  g.lineWidth = 0.0028;
  g.stroke(bulbPath(top));
  g.strokeStyle = css(mixRgb(col, HOT, 0.7), 0.9 * gl);
  g.lineWidth = 0.00075;
  g.stroke(bulbPath(top));
  g.restore();
  g.lineCap = 'round';
  g.strokeStyle = css(mixRgb(col, HOT, 0.3), 0.7 * gl);
  g.lineWidth = 0.0006;
  g.stroke(leads);
  // The coil's own halo, then its orange, then its white-hot thread.
  g.strokeStyle = css(col, 0.14 * gl);
  g.lineWidth = 0.0052;
  g.stroke(coil);
  g.strokeStyle = css(col, 0.26 * gl);
  g.lineWidth = 0.0032;
  g.stroke(coil);
  g.strokeStyle = css(mixRgb(col, HOT, 0.5 * gl), Math.min(1, 0.5 + gl));
  g.lineWidth = 0.002;
  g.stroke(coil);
  g.strokeStyle = css(mixRgb(col, HOT, 0.6 + 0.4 * gl), Math.min(1, 0.3 + gl));
  g.lineWidth = 0.001;
  g.stroke(coil);
  const core = g.createRadialGradient(0, fy, 0, 0, fy, 0.03);
  core.addColorStop(0, css(HOT, 0.5 * gl ** 1.2));
  core.addColorStop(0.35, css(mixRgb(col, HOT, 0.7), 0.4 * gl ** 1.2));
  core.addColorStop(1, css(col, 0));
  g.fillStyle = core;
  g.fillRect(-0.031, fy - 0.031, 0.062, 0.062);
  drawBloom(g, fr, bc, fy, col, gl, 0.6);
}

/** The bare holder's switch pod hangs on a short turned arm. */
function drawPodArm(g, st, mat) {
  const m = hexRgb(mat.metal);
  const y = 0.022;
  const grad = g.createLinearGradient(0, y - 0.0035, 0, y + 0.0035);
  grad.addColorStop(0, css(mixRgb(m, [255, 255, 255], 0.35)));
  grad.addColorStop(0.45, css(m));
  grad.addColorStop(1, css(mixRgb(m, [0, 0, 0], 0.6)));
  g.fillStyle = grad;
  g.fillRect(0.019, y - 0.0033, st.anchor[0] - 0.0075 - 0.019 + 0.0005, 0.0066);
}

/** The shade's rolled lip: a catch-light along its front edge, a hairline of shadow under it. */
function drawLip(g, st, mat) {
  const R = st.R;
  const lit = mat.lip;
  g.lineWidth = 0.0012;
  g.strokeStyle = `rgba(255, 255, 255, ${lit})`;
  g.beginPath(); g.ellipse(0, st.rim - 0.0011, R - 0.0006, ELEVATION * R, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
  g.lineWidth = 0.0007;
  g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath(); g.ellipse(0, st.rim, R, ELEVATION * R, 0, Math.PI, Math.PI * 2); g.stroke();
}

// ================================================================ the object

const DEFAULTS = Object.freeze({
  on: true,
  shade: 'dome',
  bulb: 'clear',
  finish: 'auto',
  warmth: 2700,
  cord: 1,
  light: 315,
  label: 'Light',
  target: null,
  sound: false,
});

function normalise(opts, previous) {
  const o = { ...DEFAULTS, ...previous, ...opts };
  o.on = o.on !== false;
  if (!STYLES[o.shade]) o.shade = 'dome';
  if (!BULBS.includes(o.bulb)) o.bulb = 'clear';
  if (!FINISHES.includes(o.finish)) o.finish = 'auto';
  o.warmth = clamp(Math.round(+o.warmth || 2700), 1900, 3400);
  o.cord = clamp(+o.cord || 1, 0.5, 1.6);
  o.light = ((+o.light || 0) % 360 + 360) % 360;
  o.label = String(o.label ?? '').slice(0, 40).trim() || 'Light';
  o.sound = o.sound === true;
  return o;
}

const STRUCTURE = ['shade', 'bulb', 'finish', 'warmth', 'cord', 'light'];
const KEY = 'tui-finish';

export class PullCord {
  constructor(host, opts = {}) {
    if (!host) throw new Error('PullCord needs a host element');
    this.host = host;
    this.o = normalise(opts);
    this.mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!this.mq?.matches;
    this.dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

    const root = document.createElement('div');
    root.className = 'pc';
    root.dataset.object = 'pull-cord';
    root.dataset.state = 'asleep';
    root.setAttribute('role', 'switch');
    root.tabIndex = 0;
    const layer = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); return c; };
    this.cvShadow = layer('pc-shadow');
    this.cvLight = layer('pc-light');
    this.cvLamp = layer('pc-lamp');
    this.cvGlow = layer('pc-glow');
    this.grip = document.createElement('span');
    this.grip.className = 'pc-grip';
    this.grip.setAttribute('aria-hidden', 'true');
    root.append(this.cvShadow, this.cvLight, this.cvLamp, this.cvGlow, this.grip);
    this.root = root;
    host.append(root);

    this.raf = 0;
    this.last = 0;
    this.visible = false;
    this.hand = null;
    this.drag = null;
    this.pullRun = null;
    this.cache = new Map();
    this.drawn = {};

    this.on = {
      down: (e) => this.#down(e),
      move: (e) => this.#move(e),
      up: (e) => this.#up(e),
      click: (e) => this.#click(e),
      key: (e) => this.#key(e),
      motion: (e) => { this.reduced = e.matches; this.#rest(); this.#draw(true); this.#wake(); },
      scheme: () => { this.#followFinish(); this.#followSystem(); },
      visibility: () => { if (document.hidden) this.#sleep(); else this.#wake(); },
      gesture: () => this.#armAudio(),
    };
    root.addEventListener('pointerdown', this.on.down);
    root.addEventListener('pointermove', this.on.move);
    root.addEventListener('pointerup', this.on.up);
    root.addEventListener('pointercancel', this.on.up);
    root.addEventListener('click', this.on.click);
    root.addEventListener('keydown', this.on.key);
    this.mq?.addEventListener?.('change', this.on.motion);
    this.dark?.addEventListener?.('change', this.on.scheme);
    document.addEventListener('visibilitychange', this.on.visibility);

    this.#bindTarget();
    this.lit = this.target ? this.#targetOn() : this.o.on;
    this.T = this.lit ? this.o.warmth : FILAMENT.room;
    this.#aria();
    if (this.target) this.#applyTarget(false);
    this.#bindFinish();
    if (this.o.sound) this.#listenForGesture();

    this.ro = new ResizeObserver(() => this.#build());
    this.ro.observe(root);
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.#wake(); else this.#sleep();
    });
    this.io.observe(root);
    this.#build();
  }

  /** Whether the lamp is lit. */
  get checked() { return this.lit; }

  get state() { return this.root.dataset.state; }

  /** Pull the cord: the same physical pull a hand makes, animated. Toggles when the switch clicks. */
  pull() {
    if (this.reduced || !this.rig) { this.#toggle(true); return this; }
    if (this.pullRun || this.drag) return this;
    const [x, y] = acornOf(this.rig);
    this.pullRun = { t0: -1, x, y };
    this.#wake(true);
    return this;
  }

  toggle() { return this.pull(); }

  /** Set the lamp without a pull (no `change` event). `instant` skips the filament's warm-up. */
  set(on, { instant = false } = {}) {
    const next = !!on;
    if (next !== this.lit) {
      this.lit = next;
      this.#aria();
      if (this.target) this.#applyTarget(false);
    }
    if (instant || this.reduced) { this.T = this.lit ? this.o.warmth : FILAMENT.room; this.#draw(true); }
    this.#wake(true);
    return this;
  }

  update(opts = {}) {
    const prev = this.o;
    this.o = normalise(opts, this.o);
    this.#aria();
    if (opts.target !== undefined && opts.target !== prev.target) { this.#bindTarget(); if (this.target) this.set(this.#targetOn(), { instant: true }); }
    if (this.o.sound && !prev.sound) this.#listenForGesture();
    if (this.o.finish !== prev.finish) this.#bindFinish();
    if (STRUCTURE.some((k) => prev[k] !== this.o[k])) {
      if (prev.warmth !== this.o.warmth && this.lit) this.T = this.o.warmth;
      this.cache.clear();
      this.#build();
    }
    if ('on' in opts && !this.target && this.o.on !== this.lit) this.set(this.o.on);
    return this;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.io.disconnect();
    this.finishObs?.disconnect();
    this.targetObs?.disconnect();
    this.mq?.removeEventListener?.('change', this.on.motion);
    this.dark?.removeEventListener?.('change', this.on.scheme);
    document.removeEventListener('visibilitychange', this.on.visibility);
    const r = this.root;
    r.removeEventListener('pointerdown', this.on.down);
    r.removeEventListener('pointermove', this.on.move);
    r.removeEventListener('pointerup', this.on.up);
    r.removeEventListener('pointercancel', this.on.up);
    r.removeEventListener('click', this.on.click);
    r.removeEventListener('keydown', this.on.key);
    this.#stopListening();
    this.audio?.close?.();
    this.cache.clear();
    r.remove();
  }

  // ---------------------------------------------------------------- finish and target

  /**
   * The material the lamp is made in: the one asked for, or on `auto` the
   * page's object tokens (`--tui-obj-frame`, `-edge`, `-shadow`, `-matte`), so
   * it is made in whatever finish the page is in. A page without them gets
   * graphite when it is dark and aluminium when it is light.
   */
  #material() {
    if (this.o.finish !== 'auto') return MATERIALS[this.o.finish];
    const s = getComputedStyle(this.host);
    const v = (k) => s.getPropertyValue(`--tui-obj-${k}`).trim();
    if (v('frame')) return materialFrom(hex(v('frame')), hex(v('edge') || v('frame')), parseFloat(v('shadow')) || 0.34, v('matte') === '1', clamp(parseFloat(v('glow')) || 0, 0, 1));
    const t = this.host.closest?.('[data-tone="light"], [data-tone="dark"]')?.dataset.tone;
    return (t ?? (this.dark?.matches ? 'dark' : 'light')) === 'dark' ? MATERIALS.graphite : MATERIALS.aluminium;
  }

  #bindFinish() {
    this.finishObs?.disconnect();
    this.finishObs = null;
    if (this.o.finish !== 'auto') return;
    // The page's finish, wherever on the page it is set: the lamp is drawn again when it changes.
    this.finishObs = new MutationObserver(() => this.#followFinish());
    this.finishObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-finish', 'data-tone'], subtree: true });
  }

  #followFinish() {
    if (!this.lay || this.o.finish !== 'auto') return;
    if (this.sprites?.mat.key !== this.#material().key) { this.#sprites(); this.#draw(true); }
  }

  #bindTarget() {
    this.targetObs?.disconnect();
    this.targetObs = null;
    const t = this.o.target;
    this.target = typeof t === 'string' ? document.querySelector(t) : t instanceof Element ? t : null;
    if (!this.target) return;
    this.targetObs = new MutationObserver(() => {
      const on = this.#targetOn();
      if (on !== this.lit) this.set(on);
    });
    this.targetObs.observe(this.target, { attributes: true, attributeFilter: ['data-finish'] });
  }

  /** On is aluminium (lights on), off is graphite. With nothing set, the visitor's choice, then their system. */
  #targetOn() {
    const f = this.target.dataset.finish;
    if (f === 'aluminium' || f === 'graphite') return f === 'aluminium';
    let stored = null;
    if (this.target === document.documentElement) try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
    if (stored === 'aluminium' || stored === 'graphite') return stored === 'aluminium';
    return !this.dark?.matches;
  }

  #applyTarget(remember) {
    const f = this.lit ? 'aluminium' : 'graphite';
    if (this.target.dataset.finish !== f) this.target.dataset.finish = f;
    if (remember && this.target === document.documentElement) try { localStorage.setItem(KEY, f); } catch { /* the choice lasts the page */ }
  }

  /** Until the visitor has chosen, the page finish keeps following the system, as the site's own key does. */
  #followSystem() {
    if (this.target !== document.documentElement) return;
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch { /* none */ }
    if (!stored) this.set(!this.dark?.matches);
  }

  #aria() {
    this.root.setAttribute('aria-checked', String(this.lit));
    this.root.setAttribute('aria-label', this.o.label);
    this.root.dataset.on = String(this.lit);
  }

  #toggle(user) {
    this.lit = !this.lit;
    this.#aria();
    if (this.target) this.#applyTarget(user);
    if (this.reduced) { this.T = this.lit ? this.o.warmth : FILAMENT.room; this.#draw(true); }
    this.#sound('click');
    if (user) this.root.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { on: this.lit } }));
    this.#wake(true);
  }

  // ---------------------------------------------------------------- build

  #build() {
    if (!this.root.isConnected) return;
    const rect = this.root.getBoundingClientRect();
    const W = Math.round(rect.width);
    const H = Math.round(rect.height);
    if (!W || !H) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const same = this.lay && this.W === W && this.H === H && this.dpr === dpr && this.layKey === `${this.o.shade}|${this.o.cord}`;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    if (!same) {
      this.lay = layout(W, H, this.o.shade, this.o.cord);
      this.layKey = `${this.o.shade}|${this.o.cord}`;
      this.rig = settleRig(makeRig({ style: this.o.shade, Ls: this.lay.Ls, Lp: this.lay.Lp }), 1.2);
      this.cache.clear();
      this.pullRun = null;
      this.drag = null;
      this.hand = null;
    }
    const ld = Math.max(0.5, dpr / 2);
    this.ld = ld;
    for (const [cv, d] of [[this.cvLamp, dpr], [this.cvGlow, dpr], [this.cvShadow, ld], [this.cvLight, ld]]) {
      const w = Math.max(1, Math.round(W * d));
      const h = Math.max(1, Math.round(H * d));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    }
    this.#edgeMask();
    this.#sprites();
    this.#draw(true);
    this.#wake();
  }

  #sprites() {
    const mat = this.#material();
    const key = `${mat.key}|${this.o.shade}|${this.o.bulb}|${this.o.warmth}|${this.o.light}|${this.lay.S.toFixed(3)}|${this.dpr}`;
    if (!this.cache.has(key)) this.cache.set(key, bake(this.o, this.lay, this.dpr, mat));
    this.sprites = this.cache.get(key);
  }

  /** The light on the wall dies out before the edge of the box, whatever its shape: it is the object's, not the page's. */
  #edgeMask() {
    const w = this.cvLight.width;
    const h = this.cvLight.height;
    const c = canvasOf(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let j = 0; j < h; j += 1) {
      const v = ((j + 0.5) / h) * 2 - 1;
      for (let i = 0; i < w; i += 1) {
        const u = ((i + 0.5) / w) * 2 - 1;
        // A rounded-rectangle distance: square-ish in the middle, round at the corners.
        const r = (Math.abs(u) ** 4 + Math.abs(v) ** 4) ** 0.25;
        img.data[(j * w + i) * 4 + 3] = Math.round(255 * (1 - smooth(0.55, 0.98, r)));
      }
    }
    g.putImageData(img, 0, 0);
    this.mask = c;
  }

  /** Put the rig at rest (reduced motion: the lamp hangs still). */
  #rest() {
    if (!this.lay) return;
    this.rig = settleRig(makeRig({ style: this.o.shade, Ls: this.lay.Ls, Lp: this.lay.Lp }), 1.2);
    this.pullRun = null;
    this.drag = null;
    this.hand = null;
    this.T = this.lit ? this.o.warmth : FILAMENT.room;
  }

  // ---------------------------------------------------------------- input

  #local(e) {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  #world(p) { return [(p.x - this.lay.axisX) / this.lay.S, (p.y - this.lay.pivotY) / this.lay.S]; }

  #px(x, y) { return [this.lay.axisX + x * this.lay.S, this.lay.pivotY + y * this.lay.S]; }

  /** The cord node under the pointer (the acorn first), or 0. */
  #nearest(p, touch) {
    const r = this.rig;
    const [axp, ayp] = this.#px(r.x[r.N], r.y[r.N] + ACORN.len * 0.45);
    const reach = Math.max(22, ACORN.len * 0.6 * this.lay.S);
    if (Math.hypot(p.x - axp, p.y - ayp) <= reach) return r.N;
    if (touch) return 0;
    let best = 0;
    let bd = Math.max(10, 0.012 * this.lay.S);
    for (let i = 2; i < r.N; i += 1) {
      const [x, y] = this.#px(r.x[i], r.y[i]);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  #down(e) {
    if (e.button !== 0) return;
    const p = this.#local(e);
    this.downAt = { x: p.x, y: p.y, t: performance.now(), moved: false };
    if (this.reduced || !this.rig || this.pullRun) return;
    const j = this.#nearest(p, e.pointerType === 'touch' && e.target !== this.grip);
    if (!j) return;
    const [wx, wy] = this.#world(p);
    this.drag = { id: e.pointerId, node: j, dx: this.rig.x[j] - wx, dy: this.rig.y[j] - wy, x0: this.rig.x[j], y0: this.rig.y[j] };
    this.hand = { node: j, x: this.rig.x[j], y: this.rig.y[j] };
    try { this.root.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    this.root.classList.add('pc-held');
    this.#armAudioIfWanted();
    this.#wake(true);
  }

  #move(e) {
    if (this.downAt && !this.downAt.moved) {
      const p = this.#local(e);
      if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 2) this.downAt.moved = true;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const [wx, wy] = this.#world(this.#local(e));
    const lp = this.lay.Lp;
    // A hand cannot pull the cord through the ceiling or out of the room.
    this.hand.x = clamp(wx + this.drag.dx, this.drag.x0 - 0.55 * lp, this.drag.x0 + 0.55 * lp);
    this.hand.y = clamp(wy + this.drag.dy, this.drag.y0 - 0.6 * lp, this.drag.y0 + PULL_DEPTH + 0.03);
    this.#wake(true);
  }

  #up(e) {
    if (this.drag && e.pointerId === this.drag.id) {
      this.drag = null;
      this.hand = null;
      this.root.classList.remove('pc-held');
      // A tug is not a click: a hand that moved the cord, or held it, has already done what it meant to.
      if (this.downAt?.moved || performance.now() - (this.downAt?.t ?? 0) > 350) this.suppress = true;
      this.#wake(true);
    }
  }

  #click(e) {
    if (this.suppress) { this.suppress = false; e.preventDefault(); return; }
    this.#armAudioIfWanted();
    this.pull();
  }

  #key(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    this.#armAudioIfWanted();
    this.pull();
  }

  // ---------------------------------------------------------------- the loop

  #frame = (t) => {
    this.raf = 0;
    this.inFrame = true;
    const dt = this.last ? Math.min((t - this.last) / 1000, 1 / 30) : 1 / 60;
    this.last = t;
    const r = this.rig;
    let hand = this.hand;
    if (this.pullRun) {
      const run = this.pullRun;
      if (run.t0 < 0) run.t0 = t;
      const el = (t - run.t0) / 1000;
      const k = clamp(el / 0.17, 0, 1);
      const depth = PULL_DEPTH * k * k * (3 - 2 * k);
      hand = { node: r.N, x: run.x, y: run.y + depth };
      if (el > 0.26) { this.pullRun = null; hand = null; }
    }
    for (const ev of stepRig(r, dt, hand)) {
      if (ev === 'click') this.#toggle(true);
      else this.#sound('reset');
    }
    const want = this.lit ? this.o.warmth : FILAMENT.room;
    this.T = stepFilament(this.T, this.lit, dt, this.o.warmth);
    this.#draw();
    const eps = (0.04 * 60) / this.lay.S; // a twenty-fifth of a pixel a frame
    const still = !hand && !this.pullRun && !this.drag && rigSettled(r, eps);
    // Settled: lit, within 3 K of its warmth; dark, below the Draper point, where it
    // no longer glows (radiating T⁴ away, the last few hundred kelvin take minutes).
    const cool = this.lit ? Math.abs(this.T - want) < 3 : this.T < FILAMENT.draper;
    if (cool && this.T !== want) { this.T = want; this.#draw(); }
    if (still) freezeRig(r);
    this.inFrame = false;
    if ((still && cool) || (!this.visible && !this.pullRun && !this.drag) || document.hidden) this.#sleep();
    else this.raf = requestAnimationFrame(this.#frame);
  };

  #wake(force = false) {
    // A pull or a drag someone is making runs even before the observer has said the cord is on screen
    // (it can be late on a busy device); otherwise that press would be lost.
    const handled = this.pullRun || this.drag;
    if (this.reduced || this.raf || this.inFrame || (!this.visible && !handled) || document.hidden || !this.rig) return;
    if (!force && !this.pullRun && !this.drag) {
      const want = this.lit ? this.o.warmth : FILAMENT.room;
      if (rigSettled(this.rig, 1e-6) && this.T === want) return;
    }
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

  #draw(all = false) {
    const sp = this.sprites;
    const r = this.rig;
    if (!sp || !r) return;
    const S = this.lay.S;
    const d = this.dpr;
    const st = STYLES[this.o.shade];
    const glow = this.reduced ? (this.lit ? 1 : 0) : glowOf(this.T, this.o.warmth);
    const theta = r.theta;
    const [topX, topY] = this.#px(Math.sin(theta) * r.Ls, Math.cos(theta) * r.Ls);
    const [pvX, pvY] = this.#px(0, 0);
    const mat = sp.mat;
    const boost = clamp(26 / (ACORN.len * S), 1, 2.4); // small lamps draw their cord and acorn a little heavier

    // The cord as a smooth path, in CSS px.
    const pts = [];
    for (let i = 0; i <= r.N; i += 1) pts.push(this.#px(r.x[i], r.y[i]));
    const cordPath = (ox = 0, oy = 0) => {
      const p = new Path2D();
      p.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (let i = 1; i < pts.length - 1; i += 1) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        p.quadraticCurveTo(pts[i][0] + ox, pts[i][1] + oy, mx + ox, my + oy);
      }
      p.lineTo(pts[r.N][0] + ox, pts[r.N][1] + oy);
      return p;
    };
    const last = pts[r.N];
    const prev = pts[r.N - 1];
    const acornAng = Math.atan2(last[0] - prev[0], last[1] - prev[1]);

    // ---- shadows (the room lamp, on the wall), only when something moved
    const moved = all || this.#changed(theta, last, glow);
    if (moved) {
      const g = this.cvShadow.getContext('2d');
      const ld = this.ld;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.cvShadow.width, this.cvShadow.height);
      const { lx, ly } = lampOf(this.o.light);
      const ox = -lx * WALL.shadow * S;
      const oy = -ly * WALL.shadow * S;
      g.setTransform(ld, 0, 0, ld, 0, 0);
      g.globalAlpha = mat.shadow;
      const cs = sp.cupShadow;
      g.drawImage(sp.cupShadow.c, pvX + ox - cs.ox, pvY + oy - cs.oy, cs.w, cs.h);
      const blur = WALL.blur * S;
      // A thin cord's shadow spreads over the blur: as wide as the blur, as dark as the cord is thick.
      // The same blur as the lamp's own shadow; a 3 mm cord under a soft room
      // light leaves little more than a smudge, and that is what it gets.
      const soft = (path, w) => {
        g.save();
        g.filter = `blur(${(blur * 0.45 * ld).toFixed(1)}px)`;
        g.lineCap = 'round';
        g.strokeStyle = '#000';
        g.lineWidth = w * 1.6;
        g.globalAlpha = mat.shadow * 0.9;
        g.stroke(path);
        g.restore();
      };
      const cable = new Path2D();
      cable.moveTo(pvX + ox, pvY + oy);
      cable.lineTo(topX + ox, topY + oy);
      soft(cable, 0.0055 * S);
      soft(cordPath(ox, oy), 0.0034 * S * boost);
      g.globalAlpha = mat.shadow;
      g.save();
      g.translate(topX + ox, topY + oy);
      g.rotate(-theta);
      const ls = sp.lampShadow;
      g.drawImage(ls.c, -ls.ox, -ls.oy, ls.w, ls.h);
      g.restore();
      g.save();
      g.translate(last[0] + ox, last[1] + oy);
      g.rotate(-acornAng);
      g.scale(boost, boost);
      const as = sp.acornShadow;
      g.drawImage(as.c, -as.ox, -as.oy, as.w, as.h);
      g.restore();
      g.globalAlpha = 1;

      // ---- the light on the wall
      const lg = this.cvLight.getContext('2d');
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.clearRect(0, 0, this.cvLight.width, this.cvLight.height);
      if (glow > 0.002) {
        const [bx, by] = this.#px(...lampPoint(r, 0, sp.bulbCentre));
        lg.setTransform(ld, 0, 0, ld, 0, 0);
        lg.translate(bx, by);
        lg.rotate(-theta);
        // A narrow box can only hold a column of it: there, keep it a faint wash, not a stripe.
        lg.globalAlpha = glow * (0.3 + 0.7 * smooth(60, 240, Math.min(this.W, this.H)));
        lg.drawImage(sp.pool.c, -sp.pool.ox, -sp.pool.oy, sp.pool.w, sp.pool.h);
        lg.globalAlpha = 1;
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.globalCompositeOperation = 'destination-in';
        lg.drawImage(this.mask, 0, 0);
        lg.globalCompositeOperation = 'source-over';
      }
    }

    // ---- the lamp
    const g = this.cvLamp.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cvLamp.width, this.cvLamp.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    // The cable, pivot to lamp.
    this.#cable(g, [[pvX, pvY], [topX, topY]], 0.0055 * S, mat, 0);
    const cf = sp.cupFrame;
    g.drawImage(sp.cup, pvX - cf.ox, pvY - cf.oy, cf.w, cf.h);

    const f = sp.frame;
    const turn = () => { g.setTransform(d, 0, 0, d, 0, 0); g.translate(topX, topY); g.rotate(-theta); };
    const still = () => { g.setTransform(d, 0, 0, d, 0, 0); g.translate(topX, topY); };
    const blit = (c) => g.drawImage(c, -f.ox, -f.oy, f.w, f.h);
    // Clip to a turned outline (paths are in metres), then draw a layer that does not turn.
    const clipTurned = (path) => { turn(); g.scale(S, S); g.clip(path); };

    turn();
    if (sp.inside) {
      blit(sp.inside);
      if (glow > 0.002) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow; blit(sp.insideOn); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      blit(sp.pod);
    }
    blit(sp.bulb);
    g.save();
    clipTurned(sp.glassPath);
    still();
    blit(sp.bulbSheen);
    g.restore();
    turn();
    blit(sp.body);
    if (sp.sheen) {
      g.save();
      clipTurned(sp.shellPath);
      still();
      blit(sp.sheen);
      g.restore();
    }
    // The filament's light is added to whatever is behind the glass, so it
    // goes on its own screen-blended layer, with the shade cut out of it.
    const lvl = Math.round(clamp((this.T - FILAMENT.draper) / (this.o.warmth - FILAMENT.draper), 0, 1) * GLOW_LEVELS);
    const showGlow = this.reduced ? (this.lit ? GLOW_LEVELS : 0) : lvl;
    const gg = this.cvGlow.getContext('2d');
    if (showGlow > 0 || this.glowShown) {
      gg.setTransform(1, 0, 0, 1, 0, 0);
      gg.clearRect(0, 0, this.cvGlow.width, this.cvGlow.height);
      this.glowShown = showGlow > 0;
      if (showGlow > 0) {
        gg.setTransform(d, 0, 0, d, 0, 0);
        gg.translate(topX, topY);
        gg.rotate(-theta);
        const gf = sp.glowFrame;
        gg.drawImage(sp.glow[showGlow - 1], gf.x, gf.y, gf.w, gf.w);
        // The room lamp's reflection stays on the lit glass, fixed to the room as the lamp sways.
        gg.save();
        gg.setTransform(d, 0, 0, d, 0, 0);
        gg.translate(topX, topY);
        gg.rotate(-theta);
        gg.scale(S, S);
        gg.clip(sp.glassPath);
        gg.setTransform(d, 0, 0, d, 0, 0);
        gg.translate(topX, topY);
        gg.globalAlpha = 0.5 + 0.5 * glow;
        gg.drawImage(sp.bulbSheen, -f.ox, -f.oy, f.w, f.h);
        gg.rotate(-theta);
        gg.globalCompositeOperation = 'destination-out'; // the shade stands in front of the part of the glass above its rim
        gg.drawImage(sp.body, -f.ox, -f.oy, f.w, f.h);
        gg.restore();
      }
    }
    if (sp.lipPath && glow > 0.002) {
      turn();
      g.scale(S, S);
      g.strokeStyle = css(sp.warmRgb, 0.85 * glow);
      g.lineWidth = 0.0014;
      g.stroke(sp.lipPath);
    }

    // ---- the pull cord and the acorn
    g.setTransform(d, 0, 0, d, 0, 0);
    const cw = Math.max(1.1, 0.0034 * S * boost);
    const [bx, by] = this.#px(...lampPoint(r, 0, sp.bulbCentre));
    this.#cable(g, pts, cw, mat, r.e * S, glow > 0.002 ? { x: bx, y: by, glow, rgb: sp.warmRgb } : null, cordPath());
    g.save();
    g.translate(last[0], last[1]);
    g.rotate(-acornAng);
    g.scale(boost, boost);
    const af = sp.acornFrame;
    g.drawImage(sp.acorn, -af.ox, -af.oy, af.w, af.h);
    if (glow > 0.002) {
      // The bulb's light on the side of the acorn that faces it.
      const toB = Math.atan2(bx - last[0], by - last[1]) + acornAng;
      const dist = Math.hypot(bx - last[0], by - last[1]) / S;
      const a = 0.45 * glow * clamp(0.02 / (dist * dist + 0.004), 0, 1);
      const hx = Math.sin(toB) * ACORN.r * 0.55 * S;
      const hy = ACORN.len * 0.62 * S + Math.cos(toB) * ACORN.r * 0.3 * S;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = css(sp.warmRgb, a);
      g.beginPath();
      g.ellipse(hx, hy, ACORN.r * 0.28 * S, ACORN.len * 0.22 * S, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // The grip follows the acorn.
    const gx = last[0] + Math.sin(acornAng) * ACORN.len * 0.45 * S * boost;
    const gy = last[1] + Math.cos(acornAng) * ACORN.len * 0.45 * S * boost;
    this.grip.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`;
    // The focus ring hugs the acorn; the grip around it stays 44 px.
    const ring = clamp(ACORN.len * S * boost + 12, 24, 44);
    if (ring !== this.ring) { this.ring = ring; this.grip.style.setProperty('--pc-ring', `${ring.toFixed(1)}px`); }
  }

  /** Did anything the shadow or the wall light shows move by a tenth of a pixel? */
  #changed(theta, last, glow) {
    const p = this.drawn;
    const S = this.lay.S;
    const moved = p.theta === undefined || Math.abs(theta - p.theta) * S * 0.6 > 0.1 || Math.hypot(last[0] - p.ax, last[1] - p.ay) > 0.1 || Math.abs(glow - p.glow) > 0.002;
    if (moved) { p.theta = theta; p.ax = last[0]; p.ay = last[1]; p.glow = glow; }
    return moved;
  }

  /**
   * A textile cord through `pts` (CSS px): its colour, a braid that travels
   * with the cord as it is pulled out of the switch, a thread of the room
   * lamp on the side facing it, and — when the bulb is on — its warm light on
   * the side facing the bulb.
   */
  #cable(g, pts, w, mat, slide, warm, path) {
    let p = path;
    if (!p) { p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i += 1) p.lineTo(pts[i][0], pts[i][1]); }
    const { lx, ly } = lampOf(this.o.light);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = mat.cordDark;
    g.lineWidth = w;
    g.stroke(p);
    g.strokeStyle = mat.cord;
    g.lineWidth = w * 0.72;
    g.stroke(p);
    if (w > 2.2) {
      g.setLineDash([w * 0.55, w * 0.55]);
      g.lineDashOffset = -slide;
      g.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      g.lineWidth = w * 0.7;
      g.stroke(p);
      g.setLineDash([]);
    }
    g.save();
    g.translate(lx * w * 0.2, ly * w * 0.2);
    g.strokeStyle = mat.cordLight;
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max(0.5, w * 0.26);
    g.stroke(p);
    g.restore();
    if (warm) {
      const mid = pts[Math.floor(pts.length / 2)];
      const dx = warm.x - mid[0];
      const dy = warm.y - mid[1];
      const dist = Math.hypot(dx, dy) || 1;
      const a = warm.glow * clamp((0.06 * this.lay.S) / dist, 0, 1) * 0.9;
      g.save();
      g.translate((dx / dist) * w * 0.22, (dy / dist) * w * 0.22);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = css(warm.rgb, a);
      g.lineWidth = Math.max(0.5, w * 0.3);
      g.stroke(p);
      g.restore();
    }
  }

  // ---------------------------------------------------------------- sound

  #armAudioIfWanted() { if (this.o.sound) this.#armAudio(); }

  #listenForGesture() {
    if (this.audio || this.listening) return;
    this.listening = true;
    addEventListener('pointerdown', this.on.gesture, true);
    addEventListener('keydown', this.on.gesture, true);
  }

  #stopListening() {
    if (!this.listening) return;
    this.listening = false;
    removeEventListener('pointerdown', this.on.gesture, true);
    removeEventListener('keydown', this.on.gesture, true);
  }

  #armAudio() {
    this.#stopListening();
    try {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx || this.audio) return;
      this.audio = new Ctx();
      const len = Math.floor(this.audio.sampleRate * 0.02);
      this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 6;
    } catch { /* no audio device: the switch must still switch */ }
  }

  /** The switch: a hard plastic snap on the pull, a softer tick as it re-arms. */
  #sound(kind) {
    if (!this.o.sound || !this.audio || this.audio.state !== 'running') return;
    try {
      const ctx = this.audio;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = kind === 'click' ? 2600 : 4200;
      band.Q.value = kind === 'click' ? 2.2 : 3.5;
      const gain = ctx.createGain();
      gain.gain.value = kind === 'click' ? 0.5 : 0.14;
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(t);
      if (kind === 'click') {
        const body = ctx.createOscillator();
        body.frequency.setValueAtTime(190, t);
        body.frequency.exponentialRampToValueAtTime(90, t + 0.04);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.18, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        body.connect(bg).connect(ctx.destination);
        body.start(t);
        body.stop(t + 0.06);
      }
    } catch { /* never let sound break the switch */ }
  }
}

export default PullCord;
