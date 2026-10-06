/**
 * FAQ Index — TACTILE UI block, cut 4 (00.4).
 *
 * Questions about an agent-infrastructure product ("Lode") as a card-index
 * drawer: a slim recessed tray of warm-white index cards standing one behind
 * another, each question typed along a card's top edge with its subject on a
 * staggered tab. Open one and it is lifted out of the drawer and opens to
 * show the answer typed on the card's ruled face. The drawer's front plate
 * carries a label holder and a cup pull; after it, the "Ask us" key.
 *
 * Mechanism: native <details>/<summary> — one card is one disclosure, and
 * the cards share a `name` so only one opens at a time (optional). The card
 * lifts with a transform and a deeper shadow; its face opens by the
 * platform's own details-content transition (interpolate-size), so nothing
 * is measured and nothing runs at rest. Cards further back sit a shade darker
 * and a hair narrower, as they would a finger's depth into the drawer.
 *
 * Paper is paper in either finish; the drawer is aluminium or graphite. The
 * typing is Geist Mono (the card's own type, like a display's glyphs);
 * everything else is Instrument Sans.
 *
 * Accessibility: a section named by its h2; each question a summary (a
 * disclosure button with its expanded state), the answer its content;
 * keyboard: Tab to a card, Enter or Space to open or close. Reduced motion:
 * the card opens at once, lifted, with nothing in flight.
 */

/** The questions, written for this block. The product, its prices and its limits are invented. */
export const CARDS = Object.freeze([
  Object.freeze({
    id: 'billing', tab: 'Pricing',
    q: 'How is a run billed?',
    a: 'By the second an agent is awake: $0.000018 per GB-second, with the first 400,000 GB-seconds each month free. Sleeping between tool calls costs nothing, and a stopped run stops billing the second it stops.',
  }),
  Object.freeze({
    id: 'retention', tab: 'Data',
    q: 'How long do you keep run traces?',
    a: '30 days on Team, 365 on Scale, and as long as you like when you host Lode yourself. When the window closes a trace is deleted, not archived; until then you can export it as OpenTelemetry.',
  }),
  Object.freeze({
    id: 'sso', tab: 'SSO',
    q: 'Do you support SSO and SCIM?',
    a: 'Yes, on Scale: SAML 2.0 and OIDC with Okta, Entra ID, Google Workspace or any standard provider, and SCIM 2.0 for provisioning. Roles follow your groups, so leaving the company leaves Lode.',
  }),
  Object.freeze({
    id: 'uptime', tab: 'Uptime',
    q: 'What uptime do you commit to?',
    a: '99.95% a month for the control plane on Team and 99.99% on Scale, with service credits in the contract. Runs already started keep running if the control plane is down; only new starts wait. The last 90 days are on the status page.',
  }),
  Object.freeze({
    id: 'limits', tab: 'Limits',
    q: 'What are the rate limits?',
    a: '1,000 run starts a minute and 50 concurrent runs per project on Team; 10,000 and 2,000 on Scale. Over the limit, a start waits in a queue for up to 30 seconds before it answers 429 with a Retry-After.',
  }),
  Object.freeze({
    id: 'self-host', tab: 'Hosting',
    q: 'Can we host Lode ourselves?',
    a: 'Yes. The runtime ships as a Helm chart and as a single binary for bare metal, air-gapped if you need it, licensed per node. The control plane can stay with us or move in with you.',
  }),
  Object.freeze({
    id: 'region', tab: 'Security',
    q: 'Where does our data live?',
    a: 'In the region you choose when you create a project (Frankfurt, Dublin, Virginia, Oregon or Singapore) and nowhere else. The SOC 2 Type II and ISO 27001 reports are in the trust centre.',
  }),
]);

export const FINISHES = Object.freeze(['auto', 'aluminium', 'graphite']);
export const OPEN_AT = Object.freeze(['none', '1', '2', '3', '4', '5', '6', '7']);

export const DEFAULTS = Object.freeze({
  label: 'Questions',
  title: 'Asked before you sign.',
  lead: 'The questions every platform team asks in its first week, filed where you can find them. Pull a card to read it.',
  drawer: 'Lode · Q–Z',
  count: 7,
  open: '1',
  single: true,
  askNote: 'Not in the drawer? A person answers, usually within the hour.',
  askLabel: 'Ask us',
  askHref: 'mailto:hello@lode.example',
  finish: 'auto',
});

/** Tabs sit at three stations along the top edge, as a filing clerk staggers them. */
export const TAB_STATIONS = Object.freeze([0.04, 0.37, 0.7]);
export const tabStation = (i) => TAB_STATIONS[i % TAB_STATIONS.length];

/** How far into the drawer a card stands: 0 at the front, 1 at the back. */
export const depthOf = (i, n) => (n <= 1 ? 0 : (n - 1 - i) / (n - 1));

/** The index printed on a card: Q.01, Q.02… */
export const cardNumber = (i) => `Q.${String(i + 1).padStart(2, '0')}`;

/** A link the Ask key may carry: a page, a path, mail or a phone — never a script. */
export const safeHref = (h, fallback = DEFAULTS.askHref) => {
  const s = String(h ?? '').trim();
  return /^(https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/)/i.test(s) ? s : fallback;
};

export function normalise(opts = {}, prev = DEFAULTS) {
  const o = { ...prev, ...opts };
  for (const k of ['label', 'title', 'lead', 'drawer', 'askNote', 'askLabel']) o[k] = String(o[k] ?? '');
  o.askHref = safeHref(o.askHref);
  o.count = Math.min(CARDS.length, Math.max(3, Math.round(Number(o.count)) || DEFAULTS.count));
  o.open = OPEN_AT.includes(String(o.open)) ? String(o.open) : DEFAULTS.open;
  if (o.open !== 'none' && Number(o.open) > o.count) o.open = 'none';
  o.single = o.single !== false && o.single !== 'false';
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

let seq = 0;

/**
 * @param {HTMLElement} host
 * @param {object} opts see DEFAULTS
 * @returns {{ root: HTMLElement, update(opts: object): void, destroy(): void, open(i: number): void }}
 */
export function mount(host, opts = {}) {
  let o = normalise(opts);
  const uid = `fq${(seq += 1)}`;
  const root = document.createElement('section');
  root.className = 'fq';
  root.dataset.block = 'faq-drawer';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  host.append(root);

  const render = () => {
    const n = o.count;
    const cards = CARDS.slice(0, n).map((c, i) => `<details class="fq-card"${o.single ? ` name="${uid}"` : ''}${o.open === String(i + 1) ? ' open' : ''} style="--k: ${i}; --depth: ${depthOf(i, n).toFixed(3)}; --tab-at: ${tabStation(i)}">
      <summary class="fq-edge">
        <span class="fq-tab" aria-hidden="true">${esc(c.tab)}</span>
        <span class="fq-no" aria-hidden="true">${cardNumber(i)}</span>
        <span class="fq-q">${esc(c.q)}</span>
        <span class="fq-mark" aria-hidden="true"></span>
      </summary>
      <div class="fq-face"><p class="fq-a">${esc(c.a)}</p><p class="fq-filed" aria-hidden="true">Filed under ${esc(c.tab)} · ${cardNumber(i)}</p></div>
    </details>`).join('');
    root.innerHTML = `<div class="fq-wrap">
  <header class="fq-head">
    <p class="fq-label"></p>
    <h2 class="fq-title" id="${uid}-title"></h2>
    <p class="fq-lead"></p>
  </header>
  <div class="fq-cabinet">
    <div class="fq-drawer">
      <div class="fq-tray">${cards}</div>
      <div class="fq-front" aria-hidden="true">
        <span class="fq-holder"><span class="fq-holder-card"></span></span>
        <span class="fq-pull"></span>
      </div>
    </div>
    <div class="fq-ask">
      <p class="fq-note"></p>
      <a class="fq-key" href="${esc(o.askHref)}"></a>
    </div>
  </div>
</div>`;
    root.querySelector('.fq-label').textContent = o.label;
    root.querySelector('.fq-title').textContent = o.title;
    root.querySelector('.fq-lead').textContent = o.lead;
    root.querySelector('.fq-holder-card').textContent = o.drawer;
    root.querySelector('.fq-note').textContent = o.askNote;
    root.querySelector('.fq-key').textContent = o.askLabel;
  };

  const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const applyFinish = () => {
    const f = resolveFinish(o.finish, host.closest('[data-finish]')?.dataset.finish, dark?.matches, host.closest('[data-tone="light"], [data-tone="dark"]')?.dataset.tone);
    if (root.dataset.finish !== f) root.dataset.finish = f;
  };
  const finishObs = new MutationObserver(applyFinish);
  finishObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-finish'], subtree: true });
  dark?.addEventListener('change', applyFinish);

  render();
  applyFinish();

  return {
    root,
    /** Open card i (0-based), as a click would. */
    open(i) {
      const d = root.querySelectorAll('.fq-card')[i];
      if (d) d.open = true;
    },
    update(next = {}) {
      o = normalise(next, o);
      render();
      applyFinish();
    },
    destroy() {
      finishObs.disconnect();
      dark?.removeEventListener('change', applyFinish);
      root.remove();
    },
  };
}

export default { mount };
