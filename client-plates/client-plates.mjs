/**
 * Engraved Client Plates — TACTILE UI block, cut 2 (00.2).
 *
 * "Used in production by…": the clients of an agent-infrastructure product
 * as small metal name plates fixed to the desk — each with four slotted
 * screws or two rivets, a chamfered edge, and the company's mark and name CUT
 * INTO the plate, not printed on it. On aluminium the cut is filled with dark
 * enamel; on graphite the plate is anodised black and the cut shows bright
 * metal. Under each plate, optionally, one quiet number.
 *
 * Mechanism: CSS and inline SVG. The engraving is one drop-shadow pair on the
 * whole engraved group (mark and type alike): a dark line on the upper wall of
 * every cut, a lit lip on the lower one — the lamp is fixed above left. The
 * screws' slots are turned the way a fitter leaves them (a stable angle from
 * the company's name); their sheen does not turn with them.
 *
 * Motion: static by default. `motion: 'drift'` sets the plates on a slow belt
 * in a recessed channel (a duplicated track, translateX only), with a Pause
 * key; it pauses on hover, on focus, off screen, and never runs under reduced
 * motion, where the plates stand in their grid.
 *
 * Accessibility: a section named by its h2; the plates are a list; every
 * name is real text (the marks and the screws are hidden); the drifting
 * duplicate is aria-hidden and inert.
 */

/** The clients, invented for this block: believable companies from the product's world. */
export const CLIENTS = Object.freeze([
  Object.freeze({ id: 'fenmoor', name: 'Fenmoor', kind: 'Energy co-op', type: 'caps', fix: 'screws', mark: 'fen', stat: '4,100 meters read every hour' }),
  Object.freeze({ id: 'allard', name: 'Allard', kind: 'Robotics lab', type: 'caps', fix: 'rivets', mark: 'hex', stat: '96 robot cells on one scheduler' }),
  Object.freeze({ id: 'lading', name: 'Lading', kind: 'Freight API', type: 'title', fix: 'screws', mark: 'crates', stat: '2.3 M shipments routed a month' }),
  Object.freeze({ id: 'understudy', name: 'understudy', kind: 'Agent studio', type: 'lower', fix: 'rivets', mark: 'pair', stat: '312 agents in production' }),
  Object.freeze({ id: 'northmere', name: 'Northmere', kind: 'Water telemetry', type: 'caps', fix: 'screws', mark: 'drop', stat: '11,400 sensors on one bus' }),
  Object.freeze({ id: 'tallyman', name: 'Tallyman', kind: 'Ledger API', type: 'title', fix: 'rivets', mark: 'tally', stat: '£1.2 bn reconciled nightly' }),
  Object.freeze({ id: 'cairnfield', name: 'Cairnfield', kind: 'Solar farms', type: 'caps', fix: 'screws', mark: 'cairn', stat: '38 MW behind one dashboard' }),
  Object.freeze({ id: 'seastack', name: 'seastack', kind: 'Edge inference', type: 'lower', fix: 'rivets', mark: 'stacks', stat: '40 edge sites, one fleet' }),
]);

/** Engraved marks on a 32 grid: strokes and fills are both cut, so both read the same in either finish. */
export const MARKS = Object.freeze({
  fen: '<path d="M7 17a9 9 0 0 1 18 0z" fill="currentColor"/><path d="M4 21h24M8 25h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  hex: '<path d="M16 3.5 27 9.75v12.5L16 28.5 5 22.25V9.75z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" fill="none"/><path d="M11 20.5l5-4.5 5 4.5M16 16v-5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  crates: '<rect x="4" y="16" width="11" height="11" rx="1" fill="currentColor"/><rect x="17" y="16" width="11" height="11" rx="1" fill="currentColor"/><rect x="10.5" y="4" width="11" height="10" rx="1" fill="currentColor"/>',
  pair: '<circle cx="12" cy="16" r="8.5" stroke="currentColor" stroke-width="2.4" fill="none"/><circle cx="20" cy="16" r="8.5" fill="currentColor"/>',
  drop: '<path d="M16 4.5c4.8 6.2 7.5 10.5 7.5 14a7.5 7.5 0 0 1-15 0c0-3.5 2.7-7.8 7.5-14z" fill="currentColor"/><path d="M4 28h24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  tally: '<path d="M7 6v20M12 6v20M17 6v20M22 6v20M4 22 26 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  cairn: '<ellipse cx="16" cy="24.6" rx="10.5" ry="3.6" fill="currentColor"/><ellipse cx="14.8" cy="17.4" rx="7.2" ry="3.1" fill="currentColor"/><ellipse cx="16.6" cy="11" rx="4.4" ry="2.5" fill="currentColor"/><circle cx="25" cy="6.5" r="2.6" fill="currentColor"/>',
  stacks: '<path d="M7 27V12M13 27V6M19 27V14M25 27V19" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M3 27.5h26" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
});

export const FINISHES = Object.freeze(['auto', 'aluminium', 'graphite']);
export const MOTIONS = Object.freeze(['static', 'drift']);
export const FIXINGS = Object.freeze(['mixed', 'screws', 'rivets']);

export const DEFAULTS = Object.freeze({
  label: 'Customers',
  title: 'Used in production by',
  note: '1,940 teams run agents on Lode, from co-ops to banks.',
  count: 6,
  stats: true,
  fixing: 'mixed',
  motion: 'static',
  speed: 40,
  finish: 'auto',
});

/** A stable small number from a string: the same plate is always fitted the same way. */
export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** How a fitter left the four slots: angles in degrees, stable per plate, never all alike. */
export function slotAngles(name, n = 4) {
  const h = hash(name);
  return Array.from({ length: n }, (_, i) => ((h >>> (i * 7)) % 180) - 90);
}

/**
 * Type sizes on a plate are shares of its width (cqi). The advance of each
 * style, per character with its tracking, in ems of Instrument Sans Bold:
 * enough to fit a name to the room between the mark and the far fixing.
 */
export const ADVANCE = Object.freeze({ caps: 0.87, title: 0.58, lower: 0.56, kind: 0.84 });
export const BASE_SIZE = Object.freeze({ caps: 9.6, title: 12, lower: 12, kind: 4 });
/** The room for the name, in cqi: 100 − 2 × 12 inset − 17 mark − 5 gap. */
export const ROOM = 54;

/** How much a line of engraving must shrink to fit: 1 when it fits already. */
export function fitScale(text, style, room = ROOM) {
  const w = [...String(text)].length * ADVANCE[style] * BASE_SIZE[style];
  return w <= room ? 1 : Math.max(0.5, Math.floor((room / w) * 1000) / 1000);
}

/** The fixing a plate gets. */
export const fixingFor = (client, fixing) => (fixing === 'mixed' ? client.fix : fixing);

/** Seconds for one lap of the belt: the same pace (px/s) whatever the count. */
export const lapSeconds = (count, speed) => Math.round((count * 260) / Math.max(10, speed));

/** Columns per composition: one row where it fits, else a grid. */
export function columns(count, width) {
  if (width >= 1000) return count <= 6 ? count : Math.ceil(count / 2);
  if (width >= 600) return count === 4 || count === 8 ? 4 : 3;
  return 2;
}

export function normalise(opts = {}, prev = DEFAULTS) {
  const o = { ...prev, ...opts };
  for (const k of ['label', 'title', 'note']) o[k] = String(o[k] ?? '');
  o.count = Math.min(CLIENTS.length, Math.max(4, Math.round(Number(o.count)) || DEFAULTS.count));
  o.stats = o.stats !== false && o.stats !== 'false';
  if (!FIXINGS.includes(o.fixing)) o.fixing = DEFAULTS.fixing;
  if (!MOTIONS.includes(o.motion)) o.motion = DEFAULTS.motion;
  o.speed = Math.min(80, Math.max(10, Math.round(Number(o.speed)) || DEFAULTS.speed));
  if (!FINISHES.includes(o.finish)) o.finish = 'auto';
  return o;
}

export function resolveFinish(own, around, prefersDark, tone) {
  if (own === 'aluminium' || own === 'graphite') return own;
  if (around === 'aluminium' || around === 'graphite') return around;
  // Any other finish around it (another family's: porcelain, black) by its tone.
  if (tone === 'light' || tone === 'dark') return tone === 'dark' ? 'graphite' : 'aluminium';
  return prefersDark ? 'graphite' : 'aluminium';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A slotted screw: the head and its sheen stay put; only the slot is turned. */
const screw = (deg) => `<svg class="cpl-screw" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.4" class="cpl-sink"/><circle cx="6" cy="6" r="4.3" class="cpl-head"/><ellipse cx="4.6" cy="4.3" rx="2" ry="1.4" class="cpl-shine"/><g transform="translate(.3 .45)"><path d="M2.7 6h6.6" class="cpl-slot-lip" transform="rotate(${deg} 6 6)"/></g><path d="M2.7 6h6.6" class="cpl-slot" transform="rotate(${deg} 6 6)"/></svg>`;
const rivet = () => '<svg class="cpl-rivet" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.3" class="cpl-sink"/><circle cx="6" cy="6" r="4.5" class="cpl-dome"/><circle cx="5.55" cy="5.5" r="4" class="cpl-dome-lo"/><ellipse cx="4.7" cy="4.5" rx="1.9" ry="1.4" class="cpl-shine"/></svg>';

function plateHtml(c, o, uid) {
  const fix = fixingFor(c, o.fixing);
  const a = slotAngles(c.name);
  const fixings = fix === 'screws'
    ? `<span class="cpl-fix cpl-fix--tl">${screw(a[0])}</span><span class="cpl-fix cpl-fix--tr">${screw(a[1])}</span><span class="cpl-fix cpl-fix--bl">${screw(a[2])}</span><span class="cpl-fix cpl-fix--br">${screw(a[3])}</span>`
    : `<span class="cpl-fix cpl-fix--l">${rivet()}</span><span class="cpl-fix cpl-fix--r">${rivet()}</span>`;
  return `<div class="cpl-plate" data-fix="${fix}" data-type="${c.type}" style="--fit: ${fitScale(c.name, c.type)}; --fit-kind: ${fitScale(c.kind, 'kind')}">
      ${fixings}
      <div class="cpl-cut">
        <svg class="cpl-mark" viewBox="0 0 32 32" aria-hidden="true">${MARKS[c.mark]}</svg>
        <p class="cpl-name" id="${uid}-${c.id}"><span class="cpl-word">${esc(c.name)}</span><span class="cpl-kind">${esc(c.kind)}</span></p>
      </div>
    </div>`;
}

/**
 * The cut, as one SVG filter: a band of shadow along the upper-left wall
 * inside every stroke (the wall that faces away from the lamp) and a lit lip
 * just below-right of it (the wall that faces the lamp). Flood colours come
 * from the finish's tokens, so the same filter cuts both plates.
 */
const engraveDefs = (uid) => `<svg class="cpl-defs" aria-hidden="true" focusable="false"><filter id="${uid}-cut" x="-4%" y="-12%" width="108%" height="130%" color-interpolation-filters="sRGB">
  <feOffset in="SourceAlpha" dx="0.35" dy="0.8" result="down"/>
  <feFlood class="cpl-f-lip" result="lipColour"/>
  <feComposite in="lipColour" in2="down" operator="in" result="lip"/>
  <feOffset in="SourceAlpha" dx="0.5" dy="1.1" result="shifted"/>
  <feComposite in="SourceAlpha" in2="shifted" operator="out" result="upperWall"/>
  <feFlood class="cpl-f-wall" result="wallColour"/>
  <feComposite in="wallColour" in2="upperWall" operator="in" result="wall"/>
  <feMerge><feMergeNode in="lip"/><feMergeNode in="SourceGraphic"/><feMergeNode in="wall"/></feMerge>
</filter></svg>`;

let seq = 0;

/**
 * @param {HTMLElement} host
 * @param {object} opts see DEFAULTS
 * @returns {{ root: HTMLElement, update(opts: object): void, destroy(): void, readonly paused: boolean }}
 */
export function mount(host, opts = {}) {
  let o = normalise(opts);
  const uid = `cpl${(seq += 1)}`;
  const root = document.createElement('section');
  root.className = 'cpl';
  root.dataset.block = 'client-plates';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  host.append(root);
  let paused = false;

  const render = () => {
    const list = CLIENTS.slice(0, o.count);
    const items = (dup) => list.map((c) => `<li class="cpl-item">
    ${plateHtml(c, o, dup ? `${uid}d` : uid)}
    ${o.stats ? `<p class="cpl-stat">${esc(c.stat)}</p>` : ''}
  </li>`).join('');
    root.dataset.count = String(o.count);
    root.dataset.motion = o.motion;
    root.dataset.stats = String(o.stats);
    root.dataset.paused = String(paused);
    root.style.setProperty('--cpl-lap', `${lapSeconds(o.count, o.speed)}s`);
    root.style.setProperty('--cpl-engrave', `url(#${uid}-cut)`);
    root.style.setProperty('--cpl-cols-wide', String(columns(o.count, 1000)));
    root.style.setProperty('--cpl-cols-mid', String(columns(o.count, 600)));
    const drift = o.motion === 'drift';
    root.innerHTML = `${engraveDefs(uid)}<div class="cpl-wrap">
  <header class="cpl-head">
    <div>
      <p class="cpl-label"></p>
      <h2 class="cpl-title" id="${uid}-title"></h2>
    </div>
    <div class="cpl-side">
      <p class="cpl-note"></p>
      ${drift ? `<button type="button" class="cpl-key" data-f="pause" aria-pressed="${paused}">${paused ? 'Resume' : 'Pause'}</button>` : ''}
    </div>
  </header>
  <div class="cpl-belt"><div class="cpl-track">
    <ul class="cpl-list" role="list">${items(false)}</ul>${drift ? `<ul class="cpl-list cpl-list--dup" role="list" aria-hidden="true" inert>${items(true)}</ul>` : ''}
  </div></div>
</div>`;
    root.querySelector('.cpl-label').textContent = o.label;
    root.querySelector('.cpl-title').textContent = o.title;
    root.querySelector('.cpl-note').textContent = o.note;
  };

  const onClick = (e) => {
    const key = e.target.closest('[data-f="pause"]');
    if (!key) return;
    paused = !paused;
    root.dataset.paused = String(paused);
    key.setAttribute('aria-pressed', String(paused));
    key.textContent = paused ? 'Resume' : 'Pause';
  };
  root.addEventListener('click', onClick);

  const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const applyFinish = () => {
    const f = resolveFinish(o.finish, host.closest('[data-finish]')?.dataset.finish, dark?.matches, host.closest('[data-tone="light"], [data-tone="dark"]')?.dataset.tone);
    if (root.dataset.finish !== f) root.dataset.finish = f;
  };
  const finishObs = new MutationObserver(applyFinish);
  finishObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-finish'], subtree: true });
  dark?.addEventListener('change', applyFinish);

  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => { root.dataset.visible = String(e.isIntersecting); })
    : null;
  io?.observe(root);

  render();
  applyFinish();

  return {
    root,
    get paused() { return paused; },
    update(next = {}) {
      o = normalise(next, o);
      render();
      applyFinish();
    },
    destroy() {
      root.removeEventListener('click', onClick);
      finishObs.disconnect();
      dark?.removeEventListener('change', applyFinish);
      io?.disconnect();
      root.remove();
    },
  };
}

export default { mount };
