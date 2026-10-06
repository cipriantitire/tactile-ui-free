/**
 * Machined Footer — TACTILE UI block, cut 3 (00.3).
 *
 * A site footer made as the bottom panel of a device: a screwed face plate
 * with a row of machined vents, the brand and a changelog field with its one
 * contrast key, four columns of links printed on the plate, a recessed status
 * window with a real lamp (green, amber or red), a two-position finish
 * selector that switches the whole page between aluminium and graphite, and
 * along the base the legal line and a stamped build number.
 *
 * Mechanism: CSS and a little DOM. The finish selector is a native radio
 * group dressed as a slide switch; it writes `data-finish` on <html> and
 * remembers it in localStorage['tui-finish'] exactly as the kit's own key does,
 * and follows a finish changed elsewhere. The changelog form validates with
 * the platform (type=email, required), says how to fix a mistake, and either
 * posts to `action` or fires `mf-subscribe` with the address.
 *
 * Cost at rest: nothing runs. The thumb slides 180ms; reduced motion snaps.
 *
 * Accessibility: a <footer> (contentinfo when it is the page's), a nav named
 * "Footer" with an h2 per column, a status line whose words say what the lamp
 * means, a fieldset with a legend for the selector, a labelled field whose
 * hint is live and tied to it.
 */

export const COLUMNS = Object.freeze([
  Object.freeze({ id: 'product', title: 'Product', links: Object.freeze(['Runtime', 'Deploys', 'Traces', 'Pricing', 'Changelog']) }),
  Object.freeze({ id: 'docs', title: 'Docs', links: Object.freeze(['Quickstart', 'API reference', 'CLI', 'SDKs', 'Self-hosting']) }),
  Object.freeze({ id: 'company', title: 'Company', links: Object.freeze(['About', 'Customers', 'Careers', 'Security', 'Contact']) }),
  Object.freeze({ id: 'legal', title: 'Legal', links: Object.freeze(['Terms', 'Privacy', 'DPA', 'Sub-processors', 'Cookies']) }),
]);

/** What the lamp in the status window says, in words beside it. */
export const STATUSES = Object.freeze({
  normal: Object.freeze({ lamp: 'green', words: 'All systems normal', detail: '99.99% uptime over 90 days' }),
  degraded: Object.freeze({ lamp: 'amber', words: 'Degraded: slower cold starts in eu-west', detail: 'Investigating since 14:02 UTC' }),
  outage: Object.freeze({ lamp: 'red', words: 'Partial outage: run scheduling', detail: 'Next update in 15 minutes' }),
});

export const FINISHES = Object.freeze(['auto', 'aluminium', 'graphite']);
export const STORAGE_KEY = 'tui-finish';

export const DEFAULTS = Object.freeze({
  brand: 'Lode',
  tagline: 'The runtime for agents that touch production.',
  status: 'normal',
  newsletter: true,
  action: '',
  finishSwitch: true,
  rev: '2026.09',
  build: '4f2a91c',
  legal: '© 2026 Lode Systems Ltd. Registered in England and Wales.',
  finish: 'auto',
});

/** A kebab slug for a link's href: "API reference" → "api-reference". */
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

/** The stamp on the base, as a fitter would read it. */
export const stamp = (rev, build) => `Rev. ${rev} · Build ${build}`;

/** Only a plausible address passes; the platform's own check runs in the browser. */
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

/** What the hint under the field says for an address. */
export function hintFor(value) {
  const v = String(value).trim();
  if (!v) return { error: true, text: 'Add your email address, e.g. you@company.example.' };
  if (!v.includes('@')) return { error: true, text: 'Add the @ and the part after it, e.g. you@company.example.' };
  if (!looksLikeEmail(v)) return { error: true, text: 'Add the part after the @, e.g. you@company.example.' };
  return { error: false, text: `Added. The next changelog reaches ${v} on Thursday.` };
}

export function normalise(opts = {}, prev = DEFAULTS) {
  const o = { ...prev, ...opts };
  for (const k of ['brand', 'tagline', 'action', 'rev', 'build', 'legal']) o[k] = String(o[k] ?? '');
  if (!STATUSES[o.status]) o.status = DEFAULTS.status;
  o.newsletter = o.newsletter !== false && o.newsletter !== 'false';
  o.finishSwitch = o.finishSwitch !== false && o.finishSwitch !== 'false';
  if (!FINISHES.includes(o.finish)) o.finish = 'auto';
  // A form may post only to http(s) or a relative path: never javascript: or data:.
  if (o.action && !/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(o.action.trim())) o.action = '';
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
 * @returns {{ root: HTMLElement, update(opts: object): void, destroy(): void, setStatus(s: string): void }}
 */
export function mount(host, opts = {}) {
  let o = normalise(opts);
  const uid = `mf${(seq += 1)}`;
  const root = document.createElement('footer');
  root.className = 'mf';
  root.dataset.block = 'machined-footer';
  host.append(root);
  const page = document.documentElement;
  const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  const render = () => {
    const st = STATUSES[o.status];
    const cols = COLUMNS.map((c) => `<div class="mf-col">
        <h2 class="mf-h" id="${uid}-${c.id}">${c.title}</h2>
        <ul role="list" aria-labelledby="${uid}-${c.id}">${c.links.map((l) => `<li><a href="#${slug(l)}">${esc(l)}</a></li>`).join('')}</ul>
      </div>`).join('');
    root.dataset.status = o.status;
    root.innerHTML = `<div class="mf-wrap">
  <div class="mf-panel">
    <span class="mf-screw mf-screw--tl" aria-hidden="true"></span><span class="mf-screw mf-screw--tr" aria-hidden="true"></span>
    <span class="mf-screw mf-screw--bl" aria-hidden="true"></span><span class="mf-screw mf-screw--br" aria-hidden="true"></span>
    <div class="mf-top">
      <div class="mf-brandcol">
        <a class="mf-brand" href="#top"><span class="mf-lamp" data-lamp="green" data-on aria-hidden="true"></span><span data-f="brand"></span></a>
        <p class="mf-tag" data-f="tagline"></p>
        ${o.newsletter ? `<form class="mf-form" novalidate${o.action ? ` action="${esc(o.action)}" method="post"` : ''}>
          <label class="mf-label" for="${uid}-email">Changelog, every other Thursday</label>
          <div class="mf-combo">
            <input class="mf-input" id="${uid}-email" name="email" type="email" required autocomplete="email" placeholder="you@company.example" aria-describedby="${uid}-hint">
            <button class="mf-key" type="submit">Subscribe</button>
          </div>
          <p class="mf-hint" id="${uid}-hint" aria-live="polite">One email, no tracking pixels. Leave any time.</p>
        </form>` : ''}
      </div>
      <nav class="mf-nav" aria-label="Footer">${cols}</nav>
      <div class="mf-vents" aria-hidden="true"></div>
    </div>
    <div class="mf-strip">
      <p class="mf-status" role="status"><span class="mf-lamp" data-lamp="${st.lamp}" data-on aria-hidden="true"></span><span class="mf-status-words" data-f="words">${esc(st.words)}</span><span class="mf-status-detail" data-f="detail">${esc(st.detail)}</span><a class="mf-status-link" href="#status">Status page<span aria-hidden="true"> →</span></a></p>
      ${o.finishSwitch ? `<fieldset class="mf-finish">
        <legend class="mf-label">Finish</legend>
        <div class="mf-slide">
          <label class="mf-pos"><input type="radio" name="${uid}-finish" value="aluminium"><span>Aluminium</span></label>
          <span class="mf-track" aria-hidden="true"><span class="mf-thumb"></span></span>
          <label class="mf-pos"><input type="radio" name="${uid}-finish" value="graphite"><span>Graphite</span></label>
        </div>
      </fieldset>` : ''}
    </div>
    <div class="mf-base">
      <p class="mf-legal" data-f="legal"></p>
      <p class="mf-stamp" data-f="stamp"></p>
    </div>
  </div>
</div>`;
    const $ = (f) => root.querySelector(`[data-f="${f}"]`);
    $('brand').textContent = o.brand;
    $('tagline').textContent = o.tagline;
    $('legal').textContent = o.legal;
    $('stamp').textContent = stamp(o.rev, o.build);
    syncSwitch();
  };

  // ---------------------------------------------------------------- the finish: its own, and the page's selector
  const pageFinish = () => {
    const f = page.dataset.finish;
    const t = page.dataset.tone;
    return f === 'aluminium' || f === 'graphite' ? f : ((t === 'light' || t === 'dark' ? t === 'dark' : dark?.matches) ? 'graphite' : 'aluminium');
  };
  const applyFinish = () => {
    const f = resolveFinish(o.finish, host.closest('[data-finish]')?.dataset.finish, dark?.matches, host.closest('[data-tone="light"], [data-tone="dark"]')?.dataset.tone);
    if (root.dataset.finish !== f) root.dataset.finish = f;
  };
  function syncSwitch() {
    const f = pageFinish();
    for (const r of root.querySelectorAll('.mf-finish input')) r.checked = r.value === f;
  }
  const onFinishObs = () => { applyFinish(); syncSwitch(); };
  const finishObs = new MutationObserver(onFinishObs);
  finishObs.observe(page, { attributes: true, attributeFilter: ['data-finish'], subtree: true });
  dark?.addEventListener('change', onFinishObs);

  const onChange = (e) => {
    const r = e.target;
    if (!r.matches?.('.mf-finish input') || !r.checked) return;
    page.dataset.finish = r.value;
    try { localStorage.setItem(STORAGE_KEY, r.value); } catch { /* the choice lasts the page */ }
  };

  // ---------------------------------------------------------------- the changelog field
  const onSubmit = (e) => {
    const form = e.target.closest('.mf-form');
    if (!form) return;
    const input = form.querySelector('input');
    const hint = form.querySelector('.mf-hint');
    const h = hintFor(input.value);
    const bad = h.error || !input.checkValidity();
    form.toggleAttribute('data-error', bad);
    input.setAttribute('aria-invalid', String(bad));
    if (bad) {
      e.preventDefault();
      hint.textContent = h.error ? h.text : hintFor('x@').text;
      input.focus();
      return;
    }
    root.dispatchEvent(new CustomEvent('mf-subscribe', { bubbles: true, detail: { email: input.value.trim() } }));
    if (o.action) return; // the platform posts it
    e.preventDefault();
    hint.textContent = h.text;
    form.setAttribute('data-done', '');
    input.value = '';
  };
  const onInput = (e) => {
    const form = e.target.closest?.('.mf-form');
    if (!form || !form.hasAttribute('data-error')) return;
    if (!hintFor(e.target.value).error) {
      form.removeAttribute('data-error');
      e.target.setAttribute('aria-invalid', 'false');
    }
  };
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);

  render();
  applyFinish();

  return {
    root,
    /** Set the lamp and its words from outside: 'normal' | 'degraded' | 'outage'. */
    setStatus(s) {
      o = normalise({ status: s }, o);
      const st = STATUSES[o.status];
      root.dataset.status = o.status;
      root.querySelector('.mf-status .mf-lamp').dataset.lamp = st.lamp;
      root.querySelector('[data-f="words"]').textContent = st.words;
      root.querySelector('[data-f="detail"]').textContent = st.detail;
    },
    update(next = {}) {
      o = normalise(next, o);
      render();
      applyFinish();
    },
    destroy() {
      root.removeEventListener('change', onChange);
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('input', onInput);
      finishObs.disconnect();
      dark?.removeEventListener('change', onFinishObs);
      root.remove();
    },
  };
}

export default { mount };
