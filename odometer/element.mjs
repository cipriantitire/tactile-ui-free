/**
 * <tactile-odometer>: the Odometer as a custom element, for plain HTML,
 * Angular, Astro, Rails or anything else that renders elements.
 *
 *   <script type="module" src="tactile-odometer/element.mjs"></script>
 *   <tactile-odometer value="1099" digits="4" style="width:480px;height:160px"></tactile-odometer>
 *
 *   el.value = 1100;          // or el.setAttribute('value', 1100): rolls, and carries
 *   el.odometer.count(1);     // the Odometer itself, for anything else
 *
 * Every option is an attribute of the same name (see the README). Numbers are
 * read as numbers; grouping, zeros, sound and announce are true unless set to
 * "false". The counter is made when the element joins the page and destroyed
 * when it leaves. The stylesheet is still yours to load.
 */
import Odometer from './odometer.mjs';

const NUMBERS = ['decimals', 'digits', 'stiffness', 'damping', 'maxSpin', 'count', 'wear', 'light', 'size'];
const STRINGS = ['prefix', 'suffix', 'locale', 'finish', 'red', 'bezel', 'label'];
const BOOLEANS = ['grouping', 'zeros', 'sound', 'announce'];
// Attributes are lower-cased by HTML, so maxSpin is written max-spin.
const attr = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export class TactileOdometer extends HTMLElement {
  static observedAttributes = ['value', ...[...NUMBERS, ...STRINGS, ...BOOLEANS].map(attr)];
  #odometer = null;

  /** The Odometer inside, once the element is on the page. */
  get odometer() { return this.#odometer; }
  get value() { return this.#odometer?.value ?? Number(this.getAttribute('value') ?? 0); }
  set value(v) { this.setAttribute('value', String(v)); }

  #options() {
    const o = {};
    for (const k of NUMBERS) if (this.hasAttribute(attr(k))) o[k] = k === 'size' && this.getAttribute('size') === 'fit' ? 'fit' : Number(this.getAttribute(attr(k)));
    for (const k of STRINGS) if (this.hasAttribute(attr(k))) o[k] = this.getAttribute(attr(k));
    for (const k of BOOLEANS) if (this.hasAttribute(attr(k))) o[k] = this.getAttribute(attr(k)) !== 'false';
    return o;
  }

  connectedCallback() {
    if (this.#odometer) return;
    if (!this.style.display) this.style.display = 'block';
    this.#odometer = new Odometer(this, { ...this.#options(), value: Number(this.getAttribute('value') ?? 0) });
  }

  disconnectedCallback() {
    this.#odometer?.destroy();
    this.#odometer = null;
  }

  attributeChangedCallback(name, old, value) {
    if (!this.#odometer || old === value) return;
    if (name === 'value') this.#odometer.setValue(Number(value));
    else this.#odometer.update(this.#options());
  }
}

if (!customElements.get('tactile-odometer')) customElements.define('tactile-odometer', TactileOdometer);
export default TactileOdometer;
