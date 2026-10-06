/**
 * Odometer — TACTILE UI.
 *
 * A mechanical drum counter as a number display: numerals printed on drums
 * that turn behind a window, the way an odometer, a tally counter or a petrol
 * pump register shows a number. Three mechanisms:
 *
 *   1. The carry. Only the last drum is driven; every other drum moves only
 *      while the drum to its right passes from 9 to 0. The first carry takes
 *      the last tenth of the last drum's step, and every carry above it turns
 *      in lock-step with the drum below, so 1,099 → 1,100 rolls the tens and
 *      the hundreds over TOGETHER at the very end of the units' turn. A number
 *      ticker that tweens each digit on its own cannot do that, and it is the
 *      whole reason this reads as a machine. `drumPositions` is that rule as a
 *      pure function of one continuous value.
 *   2. A spring on the value, not on the digits. A new value is a target; the
 *      continuous value springs toward it (optional overshoot), and every drum
 *      follows from the carry rule. A drum turning faster than the spin cap is
 *      drawn turning AT the cap, smeared: a jump of millions spins the low drums
 *      as a blur while the high ones visibly roll, and all of them land exactly.
 *   3. Light that does not turn. A drum is a cylinder on a horizontal axle, so
 *      the light on it depends only on height in the window, never on how far
 *      it has turned. One overlay per drum, computed once from the lamp, gives
 *      the darkening toward the top and bottom and the specular band along the
 *      drum; the numerals roll through it. The faces are real DOM text on a
 *      ten-sided CSS 3D drum, so the figures are crisp and truly foreshortened.
 *
 * It costs nothing at rest: the loop runs only while a value is travelling,
 * sleeps once it lands — a slow tally sleeps between its steps too — pauses off
 * screen and in a hidden tab, and a two-second frame gap cannot blow up the
 * spring.
 *
 * The housing is a machined plate in a material that belongs to the drums
 * (black anodised aluminium for ink drums, satin steel for bone, blackened
 * brass worn bright at the edges for brass): diamond-cut chamfers lit by the
 * one lamp, countersunk screws, an optional paint-filled engraved label, and a
 * cover glass with the lamp's reflection in it and a refracting edge.
 *
 * `size: 'fit'` (the default) fills the host's box — a preview stage, a tile,
 * a phone — and follows it; a number fixes the numeral size and shrinks only
 * when the host is narrower.
 *
 * The number is text. A visually hidden element holds the formatted value and
 * announces it politely once it has LANDED — never each frame; while counting
 * it stops announcing and is kept current for anyone who reads it; a counter
 * set `announce: false` (a tally beside the real content) never announces. The
 * drums are aria-hidden. Reduced motion: the value changes instantly, nothing spins,
 * no frame is requested.
 *
 * The numerals are Big Shoulders Bold (SIL OFL 1.1), shipped beside the CSS as
 * WOFF2 with its licence, so the drums print the same figures on every
 * platform. No dependencies, no image. The exported helpers are pure and
 * tested in Node.
 */

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** How much of the last drum's step the first carry takes. The brief: the last tenth. */
export const CARRY = 0.1;

/** More drums than a double can count exactly would lie about the last digit. */
export const MAX_DRUMS = 15;

const wrap10 = (p) => ((p % 10) + 10) % 10;
/** A change of drum position folded into [-5, 5): 9.9 → 0.1 is +0.2, not -9.8. */
export const wrapDelta = (d) => wrap10(d + 5) - 5;

/** |value| in units of the last drum, with binary dust removed: 10.1 at two decimals is 1010, not 1009.9999999999999. */
export function scaled(value, decimals = 0) {
  const n = Math.abs(value) * 10 ** decimals;
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-6 ? r : n;
}

/** The value rounded to what the drums can show. */
export function quantise(value, decimals = 0) {
  const f = 10 ** decimals;
  const q = Math.round(value * f) / f;
  return q === 0 ? 0 : q; // never -0: it would print a sign
}

/**
 * Every drum's position in [0, 10) for a continuous value; index 0 is the
 * last (least significant) drum. The last drum turns with the value. Drum k
 * turns only while drum k-1 passes from 9 to 0: the first carry over the last
 * `carry` of that step, every carry above it in lock-step with the drum below.
 */
export function drumPositions(value, count, decimals = 0, carry = CARRY) {
  const n = scaled(value, decimals);
  const out = new Array(count);
  if (count < 1) return out;
  let below = n % 10;
  out[0] = below;
  for (let k = 1; k < count; k += 1) {
    const w = k === 1 ? carry : 1;
    const digit = Math.floor(n / 10 ** k) % 10;
    below = digit + clamp((below - 10 + w) / w, 0, 1);
    out[k] = below;
  }
  return out;
}

/** How many drums a value needs: its integer digits (at least one) plus the decimals. */
export function drumsFor(value, decimals = 0) {
  const whole = Math.floor(Math.abs(value));
  return (whole >= 1 ? String(whole).length : 1) + decimals;
}

/**
 * Which drums print their zero. A leading drum — nothing but zeros at and
 * above it — has a blank where its 0 would be, so 89 on six drums reads "89",
 * not "000089". The units and the decimals always print.
 */
export function blankZeros(value, count, decimals = 0) {
  const n = scaled(value, decimals);
  return Array.from({ length: count }, (_, k) => k > decimals && n < 10 ** k);
}

/**
 * Left to right: the sign plate, then drums and fixed separator plates. A
 * group separator stands to the right of the integer drum whose place is a
 * locale break (3, 6, 9… or 3, 5, 7… in en-IN); the decimal plate stands to
 * the right of the units drum.
 */
export function slotsFor(count, decimals, breaks = [], signed = false) {
  const out = signed ? [{ kind: 'sign' }] : [];
  for (let k = count - 1; k >= 0; k -= 1) {
    out.push({ kind: 'drum', k });
    const j = k - decimals;
    if (j > 0 && breaks.includes(j)) out.push({ kind: 'group', k });
    if (k === decimals && decimals > 0) out.push({ kind: 'decimal', k });
  }
  return out;
}

/**
 * A locale's number, taken apart: the group and decimal marks, the minus
 * sign, the ten digit glyphs the drums are printed with, and where the group
 * breaks fall. Read from Intl.NumberFormat parts, so en-IN's lakh grouping,
 * fr-FR's narrow space and ar-EG's digits all come from the platform.
 */
export function numberStyle(locale = 'en-US', decimals = 0, grouping = true) {
  let nf;
  try {
    nf = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
  } catch {
    nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
  }
  const loc = nf.resolvedOptions().locale;
  const parts = nf.formatToParts(888888888888888n);
  const ints = parts.filter((p) => p.type === 'integer').map((p) => p.value.length);
  const breaks = [];
  let acc = 0;
  for (let i = ints.length - 1; i > 0; i -= 1) {
    acc += ints[i];
    breaks.push(acc);
  }
  const group = parts.find((p) => p.type === 'group')?.value ?? '';
  const decimal = new Intl.NumberFormat(loc, { minimumFractionDigits: 1 }).formatToParts(1.5)
    .find((p) => p.type === 'decimal')?.value ?? '.';
  const minus = new Intl.NumberFormat(loc).formatToParts(-1).find((p) => p.type === 'minusSign')?.value ?? '-';
  const plain = new Intl.NumberFormat(loc, { useGrouping: false });
  const digits = Array.from({ length: 10 }, (_, i) => plain.format(i));
  return { nf, locale: loc, group, decimal, minus, digits, breaks };
}

/** The value as a sentence reads it: sign, prefix, the locale's number, suffix. */
export function formatValue(value, style, prefix = '', suffix = '') {
  const body = style.nf.format(Math.abs(value));
  return `${value < 0 ? style.minus : ''}${prefix}${body}${suffix}`;
}

/**
 * Advance the value's spring. The step is clamped to 1/30 s and sub-stepped
 * at 1/120 s: a background tab that returns with a 2.5 s frame gap advances
 * one sane frame instead of launching the drums.
 */
export function stepSpring(s, target, dt, stiffness = 140, damping = 0.85) {
  const c = 2 * damping * Math.sqrt(stiffness);
  let left = clamp(dt, 0, 1 / 30);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 120);
    s.v += (stiffness * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
  return s;
}

/** Landed: within a thousandth of the last drum's step, and still. */
export function landed(s, target, decimals = 0) {
  const lsd = 10 ** -decimals;
  const tol = Math.max(lsd * 1e-3, Math.abs(target) * 1e-15);
  return Math.abs(target - s.x) <= tol && Math.abs(s.v) < lsd * 0.02;
}

/** How smeared a drum is from its speed in digits per second: none below a third of the cap, all of it at the cap. */
export function smear(speed, cap) {
  const t = clamp((speed - cap / 3) / (cap - cap / 3), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * A drum turning faster than the cap is DRAWN turning at the cap: past it a
 * frame skips more than half a digit, the figures strobe and can even appear
 * to run backwards. Returns the drawn position and whether it free-runs.
 */
export function spin(phase, truePos, speed, dir, cap, dt) {
  if (speed > cap && dt > 0) return { pos: wrap10(phase + dir * cap * dt), free: true };
  return { pos: wrap10(truePos), free: false };
}

/** Screen direction toward the lamp: 0° is from above, clockwise; y points down. */
export function lampOf(light) {
  const t = (light * Math.PI) / 180;
  return { lx: Math.sin(t), ly: -Math.cos(t) };
}

// Drum geometry, in em of the numeral size. Ten faces: the radius follows
// from the face (the chord between two numerals).
export const FACE = 1.12;
export const RADIUS = FACE / (2 * Math.tan(Math.PI / 10));
export const WINDOW = 1.56;

/** The family name the stylesheet gives the bundled face. */
export const FACE_FAMILY = 'Odometer Figures';

/**
 * The numeral size that fills a box: the object's width and height are
 * linear in its numeral size (every length is in em), plus a margin of
 * `pad` em on each side for the plate's shadow. A missing dimension (0) does
 * not constrain; with neither, `fallback`.
 */
export function fitSize(availW, availH, perW, perH, { pad = 0.22, min = 8, max = 400, fallback = 72 } = {}) {
  const byW = availW > 0 && perW > 0 ? availW / (perW + 2 * pad) : Infinity;
  const byH = availH > 0 && perH > 0 ? availH / (perH + 2 * pad) : Infinity;
  const s = Math.min(byW, byH);
  return clamp(Number.isFinite(s) ? Math.floor(s * 10) / 10 : fallback, min, max);
}

/**
 * When the next step of a tally is due, in ms after `t0`: the tally adds one
 * last-drum step every |1 / rate| s (value per second).
 */
export function nextStepAt(t0, now, rate, decimals = 0) {
  const every = (10 ** -decimals / Math.abs(rate)) * 1000;
  return t0 + (Math.floor((now - t0) / every + 1e-9) + 1) * every;
}

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The light on a drum from the top of the window (0) to the bottom (1):
 * `dark` is how much black to lay over the printed surface, `light` how much
 * lamp. Lambert from the lamp 38° off the line of sight, a specular band where
 * the drum's normal bisects lamp and eye, and occlusion where the window's lip
 * hides the drum as it curves away.
 */
export function drumLight(light, gloss = 0.2, samples = 21, radius = RADIUS, half = WINDOW / 2) {
  const { lx, ly } = lampOf(light);
  const E = Math.sin((38 * Math.PI) / 180);
  const Z = Math.cos((38 * Math.PI) / 180);
  const L = [lx * E, ly * E, Z];
  // The band lies where the normal (in the drum's plane of turn) is nearest
  // the half-vector. A lamp to the side still lights the band; it is fainter.
  const hy = L[1];
  const hz = L[2] + 1;
  const hl = Math.hypot(hy, hz);
  const side = 1 - 0.45 * Math.abs(lx);
  const out = [];
  for (let i = 0; i < samples; i += 1) {
    const at = i / (samples - 1);
    const y = (-1 + 2 * at) * half;
    const s = clamp(-y / radius, -1, 1);
    const c = Math.sqrt(1 - s * s);
    const ny = -s;
    const dif = Math.max(0, ny * L[1] + c * L[2]) / Z;
    const spec = gloss * side * Math.max(0, (ny * hy + c * hz) / hl) ** 90;
    const ao = smoothstep(0.42, 1, Math.abs(y) / half) * 0.72;
    const b = dif * (1 - ao);
    out.push({ at, dark: clamp(1 - b, 0, 0.94), light: clamp((b - 1) * 0.45 + spec, 0, 1) });
  }
  return out;
}

// ------------------------------------------------------------------ the object

let probe;
/**
 * How far to move a figure down so its ink, not its line box, sits on the
 * drum's centre line. Digits stand on the baseline, above the descender
 * space, so a centred line box puts them high: the next figure peeks in at
 * the bottom of the window and none at the top. Measured from the font the
 * page actually resolved — the bundled face once it has loaded, a fallback
 * before — and measured again when the face arrives.
 */
function opticalLift(cs) {
  try {
    probe ??= document.createElement('canvas').getContext('2d');
    probe.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    const m = probe.measureText('0123456789');
    const A = m.fontBoundingBoxAscent / 100;
    const D = m.fontBoundingBoxDescent / 100;
    const gA = m.actualBoundingBoxAscent / 100;
    const gD = m.actualBoundingBoxDescent / 100;
    const lift = (D - A + gA - gD) / 2;
    return Number.isFinite(lift) ? clamp(lift, -0.2, 0.2) : 0;
  } catch {
    return 0;
  }
}

/**
 * Housings. `base` is the plate's body, `light`/`dark` its lit and shaded
 * tones; `edge`/`edgeDark` the metal a chamfer cuts down to (a diamond-cut
 * edge on anodised aluminium is bright bare aluminium, on blackened brass it
 * is brass); `ink` the paint in the engraving; `screw` the screws' metal.
 */
export const PLATES = Object.freeze({
  anodised: Object.freeze({ base: '#232427', light: '#5e626a', dark: '#0a0b0d', ink: '#e9e2d1', edge: '#f4f6f8', edgeDark: '#2b2e33', screw: '#c9ced4', brush: 0.5 }),
  steel: Object.freeze({ base: '#a8adb3', light: '#f4f6f8', dark: '#3d4247', ink: '#1b1d20', edge: '#ffffff', edgeDark: '#565b61', screw: '#bfc4ca', brush: 0.7 }),
  graphite: Object.freeze({ base: '#393b40', light: '#8e939a', dark: '#111214', ink: '#e2e5e9', edge: '#e9ecef', edgeDark: '#2a2c30', screw: '#c4c9cf', brush: 0.55 }),
  blackened: Object.freeze({ base: '#2a241b', light: '#6b5838', dark: '#0e0b07', ink: '#dcb96f', edge: '#f6dfa0', edgeDark: '#4e3810', screw: '#c7a256', brush: 0.5 }),
});

/**
 * Drum finishes, each in the housing it would be sold in. `red` is the
 * signal drum (the classic odometer tenths).
 */
export const FINISHES = Object.freeze({
  ink: Object.freeze({ drum: '#1a1b1d', figure: '#ece4d2', plate: 'anodised', gloss: 0.34, tint: '255, 250, 240' }),
  bone: Object.freeze({ drum: '#e6dfd0', figure: '#17181a', plate: 'steel', gloss: 0.14, tint: '255, 252, 245' }),
  steel: Object.freeze({ drum: '#5e646b', figure: '#f6f8f9', plate: 'graphite', gloss: 0.5, tint: '240, 246, 252' }),
  brass: Object.freeze({ drum: '#b48a3a', figure: '#1f1507', plate: 'blackened', gloss: 0.55, tint: '255, 236, 190' }),
});

export const SIGNAL = Object.freeze({ drum: '#d93a2b', figure: '#fff3e6' });

export const BEZELS = Object.freeze(['slot', 'cells', 'bare']);
export const REDS = Object.freeze(['none', 'last', 'decimals']);

const DEFAULTS = Object.freeze({
  value: 0,
  decimals: 0,
  prefix: '',
  suffix: '',
  locale: 'en-US',
  grouping: true,
  digits: 1,
  zeros: false,
  finish: 'ink',
  red: 'none',
  bezel: 'slot',
  stiffness: 140,
  damping: 0.85,
  maxSpin: 24,
  count: 0,
  wear: 0.35,
  light: 315,
  size: 'fit',
  label: '',
  sound: false,
  announce: true,
});

function normalise(opts, previous) {
  const o = { ...DEFAULTS, ...previous, ...opts };
  o.decimals = clamp(Math.round(+o.decimals || 0), 0, 6);
  o.digits = clamp(Math.round(+o.digits || 1), 1, MAX_DRUMS - o.decimals);
  o.prefix = String(o.prefix ?? '').slice(0, 8);
  o.suffix = String(o.suffix ?? '').slice(0, 24);
  o.label = String(o.label ?? '').slice(0, 32);
  o.locale = String(o.locale || 'en-US');
  o.grouping = o.grouping !== false;
  o.zeros = !!o.zeros;
  if (!FINISHES[o.finish]) o.finish = 'ink';
  if (!REDS.includes(o.red)) o.red = 'none';
  if (!BEZELS.includes(o.bezel)) o.bezel = 'slot';
  o.stiffness = clamp(+o.stiffness || 140, 10, 1000);
  o.damping = clamp(+o.damping || 0.85, 0.2, 2);
  o.maxSpin = clamp(+o.maxSpin || 24, 3, 120);
  o.count = Number.isFinite(+o.count) ? +o.count : 0;
  o.wear = clamp(+o.wear || 0, 0, 1);
  o.light = ((+o.light || 0) % 360 + 360) % 360;
  // 'fit' (or 0) fills the host; a number is the numeral size in px.
  o.size = +o.size > 0 ? clamp(+o.size, 8, 400) : 'fit';
  o.sound = !!o.sound;
  // false: an ambient counter (a tally beside the real content) is read in place, never announced.
  o.announce = o.announce !== false;
  return o;
}

/** The largest magnitude the drums can hold at these decimals. */
const limitFor = (decimals) => (10 ** (MAX_DRUMS - decimals) - 1) / 10 ** decimals;

/** A stable pseudo-random number in [0, 1) per drum and purpose: wear must not change between renders. */
const hash = (i, salt) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const STRUCTURE = ['decimals', 'locale', 'grouping', 'digits', 'zeros', 'finish', 'red', 'bezel', 'prefix', 'suffix', 'label', 'wear'];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Put a drum's faces where position `pos` puts them. Each face carries its
 * whole transform under a flat parent with perspective: nesting the faces in
 * a rotating preserve-3d drum is the obvious build, and Chrome culls the face
 * above the axle in it at some viewport sizes (a black cap on every drum at 0).
 * Only faces that can reach the window are placed: a face spans ±18° and the
 * window shows ±27° of the drum, so nothing past 45° is ever seen. Hiding the
 * rest matters — every face kept visible costs a layer and a repaint.
 */
function turn(faces, pos) {
  for (let i = 0; i < 10; i += 1) {
    const a = wrapDelta(pos - i) * 36; // degrees from the front, in [-180, 180)
    const f = faces[i];
    const show = Math.abs(a) < 47;
    if (show !== f.show) {
      f.el.style.visibility = show ? '' : 'hidden';
      f.show = show;
    }
    if (show) f.el.style.transform = `translateZ(calc(var(--od-r) * -1)) rotateX(${a.toFixed(3)}deg) translateZ(var(--od-r))`;
  }
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => {
  const pa = hex(a);
  const pb = hex(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(', ')})`;
};

/**
 * How much lamp a 45° chamfer takes, per side (top, right, bottom, left).
 * `recess` is a window cut into the plate, whose walls face inward; otherwise
 * the plate's own raised edge, whose walls face out. Same lamp as the drums.
 */
export function bevel(light, recess) {
  const { lx, ly } = lampOf(light);
  const E = Math.sin((38 * Math.PI) / 180);
  const Z = Math.cos((38 * Math.PI) / 180);
  const s = recess ? 1 : -1;
  const k = Math.SQRT1_2;
  const lit = (nx, ny) => clamp(k * (nx * lx * E + ny * ly * E) + k * Z, 0, 1);
  return [lit(0, s), lit(-s, 0), lit(0, -s), lit(s, 0)];
}

/**
 * The chamfer colours, per side (top, right, bottom, left): each side's angle
 * to the lamp mixes the plate's bare-metal edge from dark to lit. `raise` is
 * the plate's outer edge, `recess` the window's walls.
 */
export function chamfers(light, plate = 'anodised') {
  const p = PLATES[plate] ?? PLATES.anodised;
  const tone = (b) => mixHex(p.edgeDark, p.edge, 0.7 * clamp((b - 0.3) / 0.62, 0, 1) ** 1.3);
  return { raise: bevel(light, false).map(tone), recess: bevel(light, true).map(tone) };
}

const rgba = (rgb, a) => `rgba(${rgb}, ${a.toFixed(3)})`;
const f3 = (n) => Number(n.toFixed(3));

export class Odometer {
  constructor(host, opts = {}) {
    if (!host) throw new Error('Odometer needs a host element');
    this.host = host;
    this.o = normalise(opts);
    this.mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!this.mq?.matches;

    this.target = this.#clampValue(this.o.value);
    this.s = { x: this.target, v: 0 };
    this.visible = false;
    this.raf = 0;
    this.last = 0;
    this.lastInt = Math.floor(scaled(this.target, this.o.decimals));
    this.lastTick = 0;
    this.lastText = 0;
    this.counting = null;
    this.timer = 0;

    const root = el('div', 'od');
    root.dataset.object = 'odometer';
    root.dataset.state = 'asleep';
    // The number is text: this is what a screen reader reads, copies and hears.
    this.text = el('span', 'od-text');
    this.text.setAttribute('aria-live', this.o.announce ? 'polite' : 'off');
    this.text.setAttribute('aria-atomic', 'true');
    this.plate = el('div', 'od-plate');
    this.plate.setAttribute('aria-hidden', 'true');
    root.append(this.text, this.plate);
    this.root = root;
    // The first value is content, not news: it is in place before the live
    // region reaches the page, so nothing announces a number nobody changed.
    this.style = numberStyle(this.o.locale, this.o.decimals, this.o.grouping);
    this.text.textContent = formatValue(this.target, this.style, this.o.prefix, this.o.suffix);
    host.append(root);

    this.on = {
      motion: (e) => {
        this.reduced = e.matches;
        if (this.reduced) this.#jump();
        this.#restartCount();
        this.#wake();
      },
      visibility: () => {
        if (document.hidden) this.#sleep();
        else this.#wake();
      },
      gesture: () => this.#armAudio(),
    };
    this.mq?.addEventListener?.('change', this.on.motion);
    document.addEventListener('visibilitychange', this.on.visibility);

    this.#build();
    this.#paint(0);
    if (this.o.sound) this.#listenForGesture();
    // The face arrives after the first build (it is invisible until then, not
    // a fallback that jumps): measure the figures again once it has.
    document.fonts?.load?.(`700 1em "${FACE_FAMILY}"`).then(() => {
      if (this.root.isConnected) { this.#dress(); this.#fit(); }
    }, () => {});

    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.seen = true;
      if (this.visible) this.#wake();
    });
    this.io.observe(root);
    // Fit: the counter fills its host and follows it. A fixed size keeps its
    // numeral size and shrinks only when the host is narrower.
    this.ro = new ResizeObserver(() => this.#fit());
    this.ro.observe(host);

    if (this.o.count) this.count(this.o.count);
  }

  /** The value the drums are going to (or showing, once landed). */
  get value() { return this.target; }

  get state() { return this.root.dataset.state; }

  /**
   * Roll to a new value. `instant` jumps without spinning; so does reduced
   * motion, and so does a counter known to be off screen or in a hidden tab:
   * nobody can watch that roll, and its text must not wait for them to.
   */
  setValue(v, { instant = false } = {}) {
    const t = this.#clampValue(v);
    if (!Number.isFinite(t)) return this;
    this.target = t;
    if (this.counting) {
      this.counting.base = t;
      this.counting.t0 = performance.now();
    }
    if (instant || this.reduced || (this.seen && !this.visible) || document.hidden) {
      this.#jump();
      return this;
    }
    this.#grow();
    this.#wake();
    return this;
  }

  /**
   * A live tally: add `rate` (value per second, negative counts down) in
   * whole steps of the last drum, until count(0). Each step rolls like any
   * other change; fast enough, the steps blend into a steady spin.
   */
  count(rate = 1) {
    const r = Number.isFinite(+rate) ? +rate : 0;
    this.o.count = r;
    this.counting = r ? { rate: r, base: this.target, t0: performance.now() } : null;
    this.#live();
    this.#restartCount();
    this.#wake();
    return this;
  }

  /** Change options in place. A `value` rolls to it; everything else redraws. */
  update(opts = {}) {
    const prev = this.o;
    this.o = normalise(opts, this.o);
    if (STRUCTURE.some((k) => prev[k] !== this.o[k])) {
      this.target = this.#clampValue(this.target);
      this.s.x = this.#clampValue(this.s.x);
      this.#build();
    } else if (prev.light !== this.o.light || prev.size !== this.o.size) {
      this.#dress();
      this.#fit();
    }
    this.#paint(0);
    if (this.o.sound && !prev.sound) this.#listenForGesture();
    if (this.o.announce !== prev.announce) this.#live();
    if ('count' in opts && this.o.count !== (this.counting?.rate ?? 0)) this.count(this.o.count);
    if ('value' in opts && this.#clampValue(opts.value) !== this.target) this.setValue(opts.value);
    else this.#announce();
    return this;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.timer);
    clearTimeout(this.stepTimer);
    this.io.disconnect();
    this.ro.disconnect();
    this.mq?.removeEventListener?.('change', this.on.motion);
    document.removeEventListener('visibilitychange', this.on.visibility);
    this.#stopListening();
    this.audio?.close?.();
    this.root.remove();
  }

  // ---------------------------------------------------------------- values

  #clampValue(v) {
    const lim = limitFor(this.o.decimals);
    return quantise(clamp(Number.isFinite(+v) ? +v : 0, -lim, lim), this.o.decimals);
  }

  /** Straight to the target: reduced motion, `instant`, or a restart. */
  #jump() {
    this.s.x = this.target;
    this.s.v = 0;
    this.#grow();
    this.#shrink();
    this.#paint(0);
    this.#announce();
    this.lastInt = Math.floor(scaled(this.target, this.o.decimals));
  }

  // ---------------------------------------------------------------- the build

  /** Drums and plates for the current count, sign and locale. */
  #build() {
    const o = this.o;
    this.style = numberStyle(o.locale, o.decimals, o.grouping);
    this.count_ = Math.min(MAX_DRUMS, Math.max(
      o.digits + o.decimals, drumsFor(this.target, o.decimals), drumsFor(this.s.x, o.decimals),
    ));
    this.signed = this.target < 0 || this.s.x < 0;
    const root = this.root;
    root.dataset.bezel = o.bezel;
    root.dataset.finish = o.finish;

    const win = el('div', 'od-window');
    this.drums = [];
    this.seps = [];
    this.signEl = null;
    // Born in the state they show: a blank toggled after the first style pass
    // would fade out on page load, a ghost "00" in the leading drums.
    const blanks = o.zeros ? null : blankZeros(this.s.x, this.count_, o.decimals);
    for (const slot of slotsFor(this.count_, o.decimals, o.grouping ? this.style.breaks : [], this.signed)) {
      if (slot.kind === 'drum') win.append(this.#drum(slot.k, !!blanks?.[slot.k]));
      else {
        const glyph = slot.kind === 'sign' ? this.style.minus : slot.kind === 'group' ? this.style.group : this.style.decimal;
        const sep = el('span', `od-sep od-${slot.kind}`);
        sep.append(el('span', 'od-glyph', glyph));
        const shown = slot.kind === 'sign' ? this.s.x < 0 : slot.kind === 'group' ? !blanks?.[slot.k] : true;
        sep.classList.toggle('od-off', !shown);
        if (slot.kind === 'sign') this.signEl = sep;
        if (slot.kind === 'group') this.seps.push({ el: sep, k: slot.k, shown });
        win.append(sep);
      }
    }
    win.append(el('span', 'od-glass'));
    this.plate.replaceChildren(win);
    if (o.prefix) this.plate.append(el('span', 'od-prefix', o.prefix));
    if (o.suffix) this.plate.append(el('span', /^\s*[^\p{L}\p{N}]{1,2}\s*$/u.test(o.suffix) ? 'od-suffix od-mark' : 'od-suffix', o.suffix));
    // A paint-filled engraving under the window, ruled out to its edges.
    if (o.label) {
      const label = el('span', 'od-label');
      label.append(el('span', 'od-label-t', o.label));
      this.plate.append(label);
    }
    // Two countersunk screws, each driven home at its own angle.
    if (o.bezel !== 'bare') {
      for (const side of ['l', 'r']) {
        const screw = el('span', `od-screw od-screw-${side}`);
        screw.style.setProperty('--od-slot', `${Math.round(hash(side === 'l' ? 1 : 2, 7) * 180)}deg`);
        this.plate.append(screw);
      }
    }
    this.window = win;
    this.#dress();
    this.#fit();
  }

  #drum(k, blank) {
    const o = this.o;
    const cell = el('span', 'od-cell');
    const red = o.red === 'last' ? k === 0 : o.red === 'decimals' ? (o.decimals ? k < o.decimals : k === 0) : false;
    if (red) cell.classList.add('od-red');
    const rot = el('span', 'od-rot');
    const w = o.wear;
    const faces = [];
    for (let i = 0; i < 10; i += 1) {
      const face = el('span', 'od-face');
      faces.push({ el: face, show: null });
      // Print registration: every figure was stamped a hair off true.
      const ink = el('span', 'od-ink');
      ink.style.transform = `translate(${f3((hash(k * 10 + i, 3) - 0.5) * 0.03 * w)}em, ${f3((hash(k * 10 + i, 4) - 0.5) * 0.026 * w)}em)`;
      ink.style.setProperty('--ink', String(f3(1 - hash(k * 10 + i, 5) * 0.22 * w)));
      ink.append(el('span', 'od-n', this.style.digits[i]), el('span', 'od-m', this.style.digits[i]));
      face.append(ink);
      rot.append(face);
    }
    cell.append(rot, el('span', 'od-lens'));
    // Wear: each drum sits a little off its detent and has a little play on
    // the axle. Stable per drum, so the number never shimmers between renders.
    const drum = {
      k,
      cell,
      rot,
      faces,
      zero: faces[0].el,
      offset: (hash(k, 1) - 0.5) * 0.09 * w,
      shown: NaN,
      phase: 0,
      blur: 0,
      b: -1,
      blank,
      free: false,
    };
    drum.zero.classList.toggle('od-blank', blank);
    cell.style.marginLeft = `${f3((hash(k, 2) - 0.5) * 0.024 * w)}em`;
    this.drums[k] = drum;
    return cell;
  }

  /** Everything the lamp and the finish decide, as custom properties. */
  #dress() {
    const o = this.o;
    const fin = FINISHES[o.finish];
    const plate = PLATES[fin.plate];
    const { lx, ly } = lampOf(o.light);
    const s = this.root.style;
    const set = (k, v) => s.setProperty(k, v);
    set('--od-drum', fin.drum);
    set('--od-figure', fin.figure);
    set('--od-signal', SIGNAL.drum);
    set('--od-signal-figure', SIGNAL.figure);
    set('--od-metal', plate.base);
    set('--od-metal-light', plate.light);
    set('--od-metal-dark', plate.dark);
    set('--od-plate-ink', plate.ink);
    set('--od-edge', plate.edge);
    set('--od-edge-dark', plate.edgeDark);
    set('--od-screw', plate.screw);
    set('--od-brush', String(plate.brush));

    const shade = drumLight(o.light, fin.gloss);
    const stops = (f) => shade.map((p) => `${f(p)} ${(p.at * 100).toFixed(1)}%`).join(', ');
    set('--od-shade', `linear-gradient(180deg, ${stops((p) => `rgba(0, 0, 0, ${p.dark.toFixed(3)})`)})`);
    set('--od-spec', `linear-gradient(180deg, ${stops((p) => rgba(fin.tint, p.light))})`);

    const e = (n) => `${f3(n)}em`;
    // In numeral-size units, for the small text on the plate whose own em is tiny.
    const u = (n) => `calc(var(--od-size) * ${f3(n)})`;
    const ang = Math.round(o.light + 180);
    set('--od-lift', e(opticalLift(getComputedStyle(this.root))));
    // Diamond-cut chamfers: the window's walls and the plate's edge are cut
    // through the finish to bare metal, each side lit by the lamp.
    // Each side takes its own tone from its angle to the lamp; over that, the
    // specular hot spot, brightest at one corner and gone by the middle.
    const cut = chamfers(o.light, fin.plate);
    set('--od-recess', cut.recess.join(' '));
    set('--od-raise', cut.raise.join(' '));
    const hot = (deg) => `linear-gradient(${deg}deg, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0.22) 22%, rgba(255, 255, 255, 0) 52%)`;
    set('--od-raise-hot', hot(ang));
    set('--od-recess-hot', hot(Math.round(o.light)));
    // Edges facing the lamp are lit, the far ones dark; shadows fall away from it.
    set('--od-rim', `linear-gradient(90deg, rgba(${lx < 0 ? '255, 255, 255' : '0, 0, 0'}, ${f3(0.1 + 0.12 * Math.abs(lx))}) 0, transparent 9%, transparent 91%, rgba(${lx < 0 ? '0, 0, 0' : '255, 255, 255'}, ${f3(0.1 + 0.12 * Math.abs(lx))}) 100%)`);
    // A plate on a surface: a tight contact shadow, then the soft one the lamp throws.
    set('--od-plate-shadow', [
      `${e(-lx * 0.012)} ${e(-ly * 0.012)} ${e(0.018)} rgba(0, 0, 0, 0.5)`,
      `${e(-lx * 0.05)} ${e(-ly * 0.05)} ${e(0.1)} rgba(0, 0, 0, 0.26)`,
      `${e(-lx * 0.16)} ${e(-ly * 0.16)} ${e(0.42)} rgba(0, 0, 0, 0.3)`,
    ].join(', '));
    // Brushed metal lights as a band across its grain, on the lamp's side, and
    // falls off away from the lamp.
    const band = Math.round(50 + lx * 26);
    set('--od-plate-sheen', [
      `linear-gradient(90deg, rgba(255, 255, 255, 0) ${band - 26}%, rgba(255, 255, 255, 0.075) ${band}%, rgba(255, 255, 255, 0) ${band + 26}%)`,
      `linear-gradient(${ang}deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.03) 36%, rgba(0, 0, 0, 0.04) 60%, rgba(0, 0, 0, 0.26))`,
    ].join(', '));
    set('--od-chamfer', [
      `${e(-lx * 0.016)} ${e(-ly * 0.016)} 0 rgba(255, 255, 255, 0.1)`,
      `${e(lx * 0.016)} ${e(ly * 0.016)} 0 rgba(0, 0, 0, 0.45)`,
    ].join(', '));
    // The window's own walls: the lip on the lamp side throws a shadow onto
    // the drums, the far wall catches a thread of light. Then the cover
    // glass's edge: a bright rim where it meets the frame, a dark refraction
    // band just inside it, and the green of float glass seen through its
    // thickness.
    set('--od-wall', [
      `inset ${e(-lx * 0.05)} ${e(-ly * 0.05)} ${e(0.07)} rgba(0, 0, 0, 0.66)`,
      `inset ${e(lx * 0.012)} ${e(ly * 0.012)} 0 rgba(255, 255, 255, 0.1)`,
      `inset 0 0 0 ${e(0.007)} rgba(255, 255, 255, 0.12)`,
      `inset 0 0 0 ${e(0.022)} rgba(0, 0, 0, 0.2)`,
      `inset 0 0 ${e(0.07)} ${e(0.018)} rgba(120, 170, 150, 0.1)`,
    ].join(', '));
    // The cover glass: the lamp's reflection is a softbox, a pane of light
    // with a clean far edge, lying across the lamp's corner of the glass; a
    // faint second pane from the room; and a sliver of the lamp along the
    // glass's lamp-side edges, seen through the glass's thickness.
    set('--od-glass', [
      `linear-gradient(${ang}deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.12) 17%, rgba(255, 255, 255, 0.05) 31%, rgba(255, 255, 255, 0) 31.6%)`,
      `linear-gradient(${ang}deg, rgba(255, 255, 255, 0) 52%, rgba(255, 255, 255, 0.028) 53%, rgba(255, 255, 255, 0.012) 60%, rgba(255, 255, 255, 0) 60.5%)`,
      `linear-gradient(${ly <= 0 ? 180 : 0}deg, rgba(255, 255, 255, ${f3(0.04 + 0.12 * Math.abs(ly))}), rgba(255, 255, 255, 0) ${e(0.05)})`,
      `linear-gradient(${lx <= 0 ? 90 : 270}deg, rgba(255, 255, 255, ${f3(0.02 + 0.08 * Math.abs(lx))}), rgba(255, 255, 255, 0) ${e(0.04)})`,
    ].join(', '));
    // Paint-filled engraving: the lip nearest the lamp shades the groove,
    // the far wall catches the light.
    set('--od-engrave', `${u(-lx * 0.009)} ${u(-ly * 0.009)} 0 rgba(255, 255, 255, 0.22), ${u(lx * 0.007)} ${u(ly * 0.007)} 0 rgba(0, 0, 0, 0.55)`);
    set('--od-groove', `inset ${u(lx * 0.006)} ${u(ly * 0.006)} 0 rgba(0, 0, 0, 0.6), inset ${u(-lx * 0.006)} ${u(-ly * 0.006)} 0 rgba(255, 255, 255, 0.2)`);
    set('--od-screw-hl', `${Math.round(50 + lx * 30)}% ${Math.round(50 + ly * 30)}%`);
    set('--od-screw-sink', `inset ${e(lx * 0.012)} ${e(ly * 0.012)} ${e(0.014)} rgba(0, 0, 0, 0.75), inset ${e(-lx * 0.008)} ${e(-ly * 0.008)} 0 rgba(255, 255, 255, 0.16)`);
    set('--od-screw-shadow', `${e(-lx * 0.01)} ${e(-ly * 0.01)} ${e(0.014)} rgba(0, 0, 0, 0.7)`);

    // One camera for the whole window: each drum's vanishing point is the
    // window's centre, so the outer drums are seen very slightly from the side.
    const px = parseFloat(getComputedStyle(this.root).fontSize) || 72;
    const mid = this.window.offsetWidth / 2;
    for (const d of this.drums) {
      if (d) d.rot.style.perspectiveOrigin = `${f3((mid - d.cell.offsetLeft) / px)}em 50%`;
    }
  }

  /**
   * Fit mode fills the host's box; a fixed size shrinks only to fit its
   * width. The host is measured with the counter taken out of it: a host that
   * takes its size from its content has none of its own, and the counter must
   * not chase itself — it falls back to 72px numerals.
   */
  #fit() {
    if (!this.root.isConnected) return;
    const host = this.host;
    const cs = getComputedStyle(host);
    const pad = (k) => parseFloat(cs[k]) || 0;
    const now = parseFloat(this.root.style.getPropertyValue('--od-size')) || 72;
    const perW = this.root.offsetWidth / now;
    const perH = this.root.offsetHeight / now;
    let want;
    if (this.o.size === 'fit') {
      const shown = this.root.style.display;
      this.root.style.display = 'none';
      const w = host.clientWidth - pad('paddingLeft') - pad('paddingRight');
      const h = host.clientHeight - pad('paddingTop') - pad('paddingBottom');
      this.root.style.display = shown;
      want = fitSize(w, h, perW, perH);
    } else {
      const avail = host.clientWidth - pad('paddingLeft') - pad('paddingRight');
      want = avail > 0 && perW > 0 ? Math.min(this.o.size, Math.floor((avail / perW) * 10) / 10) : this.o.size;
    }
    if (Math.abs(want - now) > 0.05 || !this.root.style.getPropertyValue('--od-size')) {
      this.root.style.setProperty('--od-size', `${Math.max(8, want)}px`);
    }
  }

  /** More drums (or a sign plate) the moment a travelling value needs them. */
  #grow() {
    const need = Math.min(MAX_DRUMS, Math.max(drumsFor(this.target, this.o.decimals), drumsFor(this.s.x, this.o.decimals)));
    const signed = this.target < 0 || this.s.x < 0;
    if (need > this.count_ || (signed && !this.signed)) this.#build();
  }

  /** And fewer once it has landed, never below the reserved `digits`. */
  #shrink() {
    const need = Math.min(MAX_DRUMS, Math.max(this.o.digits + this.o.decimals, drumsFor(this.target, this.o.decimals)));
    if (need < this.count_ || (this.signed && this.target >= 0)) this.#build();
  }

  // ---------------------------------------------------------------- drawing

  #paint(dt) {
    const o = this.o;
    const x = this.s.x;
    const pos = drumPositions(x, this.count_, o.decimals);
    const lsdSpeed = Math.abs(this.s.v) * 10 ** o.decimals;
    // |x| is what the drums show, so below zero they turn the other way.
    const dir = Math.sign(this.s.v) * (x < 0 ? -1 : 1);
    const cap = o.maxSpin;
    const blanks = o.zeros ? null : blankZeros(x, this.count_, o.decimals);
    let moving = false;
    for (const d of this.drums) {
      const speed = lsdSpeed / 10 ** d.k;
      const r = spin(d.phase, pos[d.k] + d.offset, speed, dir, cap, dt);
      let want;
      if (r.free) want = 1;
      else {
        // A carry is fast even when the value is slow: measure what the drum
        // actually did this frame, so a flick over is smeared too.
        const moved = dt > 0 && Number.isFinite(d.shown) ? Math.abs(wrapDelta(r.pos - d.shown)) / dt : 0;
        want = d.free ? 1 : smear(Math.max(speed, moved), cap);
      }
      d.free = r.free;
      d.phase = r.pos;
      d.blur = want >= d.blur || dt === 0 ? want : d.blur + (want - d.blur) * (1 - Math.exp(-dt / 0.07));
      if (d.blur < 0.01) d.blur = 0;
      if (d.blur) moving = true;
      if (!(Math.abs(r.pos - d.shown) < 1e-5)) {
        turn(d.faces, r.pos);
        d.shown = r.pos;
      }
      const b = Math.round(d.blur * 50) / 50;
      if (b !== d.b) {
        d.rot.style.setProperty('--b', String(b));
        d.b = b;
      }
      const blank = blanks ? blanks[d.k] : false;
      if (blank !== d.blank) {
        d.zero.classList.toggle('od-blank', blank);
        d.blank = blank;
      }
    }
    for (const sep of this.seps) {
      const shown = !blanks || !blanks[sep.k];
      if (shown !== sep.shown) {
        sep.el.classList.toggle('od-off', !shown);
        sep.shown = shown;
      }
    }
    if (this.signEl) this.signEl.classList.toggle('od-off', !(x < 0 || (x === 0 && this.target < 0)));
    return moving;
  }

  /** Announced politely unless counting (a tally is kept current, not read out) or told not to. */
  #live() {
    this.text.setAttribute('aria-live', this.counting || !this.o.announce ? 'off' : 'polite');
  }

  /** Politely, and only a landed value: never a frame's worth of digits. */
  #announce() {
    const t = formatValue(this.target, this.style, this.o.prefix, this.o.suffix);
    if (this.text.textContent !== t) this.text.textContent = t;
  }

  // ---------------------------------------------------------------- the loop

  #countTarget(now) {
    const c = this.counting;
    const lsd = 10 ** -this.o.decimals;
    const steps = Math.floor((Math.abs(c.rate) * (now - c.t0)) / 1000 / lsd + 1e-9);
    return this.#clampValue(c.base + Math.sign(c.rate) * steps * lsd);
  }

  /** Counting under reduced motion: the tally still advances, by jumps, with no frames. */
  #restartCount() {
    clearInterval(this.timer);
    this.timer = 0;
    if (!this.counting || !this.reduced) return;
    const lsd = 10 ** -this.o.decimals;
    const every = Math.max(100, (lsd / Math.abs(this.counting.rate)) * 1000);
    this.timer = setInterval(() => {
      this.target = this.#countTarget(performance.now());
      this.s.x = this.target;
      this.#grow();
      this.#paint(0);
      this.text.textContent = formatValue(this.target, this.style, this.o.prefix, this.o.suffix);
    }, every);
  }

  #frame = (t) => {
    this.raf = 0;
    const dt = this.last ? (t - this.last) / 1000 : 1 / 60;
    this.last = t;
    const o = this.o;
    if (this.counting) {
      const next = this.#countTarget(performance.now());
      if (next !== this.target) {
        this.target = next;
        this.#grow();
      }
      // Kept current for anyone who reads it, announced to no one.
      if (t - this.lastText > 1000) {
        this.lastText = t;
        this.text.textContent = formatValue(this.target, this.style, o.prefix, o.suffix);
      }
    }
    stepSpring(this.s, this.target, dt, o.stiffness, o.damping);
    const done = !this.counting && landed(this.s, this.target, o.decimals);
    if (done) {
      this.s.x = this.target;
      this.s.v = 0;
    }
    const n = Math.floor(scaled(this.s.x, o.decimals));
    if (n !== this.lastInt) {
      this.lastInt = n;
      this.#tick(Math.abs(this.s.v) * 10 ** o.decimals);
    }
    const smeared = this.#paint(dt);
    if (done && !smeared) {
      this.#shrink();
      this.#paint(0);
      this.#announce();
      this.#sleep();
      return;
    }
    // A slow tally has landed its step and the next is a while off: sleep
    // until it is due instead of drawing still drums at 60 Hz.
    if (this.counting && !smeared && landed(this.s, this.target, o.decimals)) {
      const now = performance.now();
      const wait = nextStepAt(this.counting.t0, now, this.counting.rate, o.decimals) - now;
      if (wait > 60) {
        this.s.x = this.target;
        this.s.v = 0;
        this.#paint(0);
        this.text.textContent = formatValue(this.target, this.style, o.prefix, o.suffix);
        this.#sleep();
        this.stepTimer = setTimeout(() => { this.stepTimer = 0; this.#wake(); }, wait);
        return;
      }
    }
    if (!this.visible || document.hidden) this.#sleep();
    else this.raf = requestAnimationFrame(this.#frame);
  };

  #wake() {
    clearTimeout(this.stepTimer);
    this.stepTimer = 0;
    if (this.reduced || this.raf || !this.visible || document.hidden) return;
    const idle = !this.counting && landed(this.s, this.target, this.o.decimals) && this.drums.every((d) => !d.blur);
    if (idle) return;
    this.root.dataset.state = 'running';
    this.last = 0;
    this.raf = requestAnimationFrame(this.#frame);
  }

  #sleep() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stepTimer);
    this.stepTimer = 0;
    this.raf = 0;
    this.root.dataset.state = 'asleep';
  }

  // ---------------------------------------------------------------- sound

  /** The audio context may only start inside a user gesture, so wait for one. */
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
      const len = Math.floor(this.audio.sampleRate * 0.016);
      this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    } catch { /* no audio device: the counter must still count */ }
  }

  /** A soft tick per step of the last drum, never more than one per 45 ms; a spin whirrs rather than rattles. */
  #tick(speed) {
    if (!this.o.sound || !this.audio || this.audio.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    try {
      const ctx = this.audio;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1900;
      band.Q.value = 3.2;
      const gain = ctx.createGain();
      gain.gain.value = 0.16 / (1 + speed / 30);
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start();
    } catch { /* never let sound break the display */ }
  }
}

export default Odometer;
