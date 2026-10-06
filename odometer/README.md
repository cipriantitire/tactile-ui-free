# tactile-odometer

A mechanical drum counter for the web that carries like the real thing.

On a real odometer a drum only moves while the one to its right is carrying,
so 1,099 → 1,100 rolls the last three drums over together, right at the end of
the units' turn. Most animated counters move every digit on its own, so
nothing carries. This one does.

Vanilla ES module and CSS, no dependencies, no build step. MIT.

**[Play with it →](https://tactileui.dev/objects/odometer)**

![1,099 rolling to 1,100: the last three drums carry together](demo.gif)

## Install

```sh
npm install tactile-odometer
```

Or straight from a CDN:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tactile-odometer/odometer.css">
<script type="module">
  import Odometer from 'https://cdn.jsdelivr.net/npm/tactile-odometer/odometer.mjs';
</script>
```

## Use

```html
<div id="seats" style="width: 480px; height: 160px"></div>

<script type="module">
  // with a bundler; without one, use the CDN URLs above
  import Odometer from 'tactile-odometer';
  import 'tactile-odometer/odometer.css';

  const seats = new Odometer(document.getElementById('seats'), { value: 1099 });

  seats.setValue(1100);        // rolls, and carries
  seats.setValue(4821.75);     // springs there; fast drums spin, slow ones roll
  seats.count(1);              // a live tally, +1 a second (0 stops it)
  seats.update({ finish: 'brass' });
  seats.destroy();             // removes everything it added
</script>
```

It works in React, Vue, Svelte or anything else that can hand it an element:
create it in an effect or `onMount`, call `destroy()` on unmount.

### As a custom element

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tactile-odometer/odometer.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/tactile-odometer/element.mjs"></script>

<tactile-odometer value="1099" digits="4" finish="brass" style="width:480px;height:160px"></tactile-odometer>
```

Every option below is an attribute of the same name (`maxSpin` is `max-spin`).
Set `el.value = 1100` or the `value` attribute to roll it; `el.odometer` is the
Odometer itself. It's made when the element joins the page and destroyed when
it leaves.

### Options

| Option | Default | What it does |
|---|---|---|
| `value` | `0` | The number to start on |
| `decimals` | `0` | Drums after the decimal point (0 to 6) |
| `prefix`, `suffix` | `''` | Printed on the plate either side of the window: `$`, `km`, `seats left` |
| `locale` | `'en-US'` | Group and decimal marks, grouping pattern and digit glyphs, from `Intl.NumberFormat` |
| `grouping` | `true` | Fixed plates between drums: 1,099 rather than 1099 |
| `digits` | `1` | Whole-number drums to reserve, so a growing number doesn't move the layout |
| `zeros` | `false` | Print 001,099 like a car odometer, instead of blanks |
| `finish` | `'ink'` | `ink`, `bone`, `steel` or `brass`, each in its own housing |
| `red` | `'none'` | Signal-red drums: `last`, or all the `decimals` (the classic tenths) |
| `bezel` | `'slot'` | One `slot` across the drums, `cells` like a tally counter, or `bare` to sit in a line of text |
| `stiffness` | `140` | How hard the value is pulled to a new number |
| `damping` | `0.85` | Below 1 it overshoots and winds back; 1 and above it arrives without passing |
| `maxSpin` | `24` | Digits per second; past this a drum is drawn spinning at the cap, blurred, instead of strobing |
| `count` | `0` | A live tally per second, in steps of the last drum; negative counts down |
| `wear` | `0.35` | Drums a little off their detents, figures a little off register |
| `light` | `315` | Where the lamp is, in degrees (0 is above, clockwise) |
| `size` | `'fit'` | `'fit'` fills the host and follows it; a number is the numeral size in px |
| `label` | `''` | Engraved into the plate under the window |
| `sound` | `false` | A soft tick per step of the last drum (a whirr when it spins), once the page has had a click or key press |
| `announce` | `true` | Announce the landed value to screen readers; `false` for an ambient tally |

### Methods

- `setValue(n, { instant })`: spring to a new value, or jump with `instant: true`
- `count(rate)`: tally `rate` per second; `count(0)` stops
- `update(options)`: change any option
- `destroy()`: stop and remove everything
- `value`, `state`: the target value, and `running` or `asleep`

## How the carry works

Only the last drum is driven. Every other drum moves only while the drum to
its right passes 9 → 0. The first carry takes the last tenth of the units'
step, and every carry above it turns in lock-step with the drum below, which is
why the carries all roll together at the end.

That rule is one pure function of a single continuous value:

```js
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
```

The value itself is a spring, so the whole counter animates one number and
every drum follows from this. `scaled()` removes float dust, so 10.1 at two
decimals is 1010, not 1009.9999999999999.

The rest:

- **The light doesn't turn.** A drum is a cylinder on a horizontal axle, so
  the light on it depends only on height in the window, not on how far it has
  turned. One overlay per drum, computed once from the lamp; the numerals roll
  through it.
- **Real text.** The faces are DOM text on a ten-sided CSS 3D drum, so the
  figures are crisp and properly foreshortened.
- **The numerals** are Big Shoulders Bold, bundled, so the drums print the same
  figures everywhere. The font loads `block` and the figures are re-centred on
  it once it lands, so nothing jumps.

## Accessibility and cost

- The drums are `aria-hidden`. The number is a visually hidden text element,
  announced politely once the value has landed: never every frame.
- Reduced motion: the value changes instantly, nothing spins, no frame is
  requested.
- It costs nothing at rest. The loop runs only while a value is travelling,
  sleeps once it lands, sleeps between the steps of a slow tally, and pauses
  off screen and in a hidden tab. A tab that comes back after two seconds
  can't blow up the spring.

## Compared

| | tactile-odometer | odometer.js (HubSpot) | NumberFlow |
|---|---|---|---|
| 1,099 → 1,100 | tens and hundreds carry together at the end of the units' turn | every digit column slides at once, over the same duration | each digit animates on its own |
| Dependencies | none | none | one small one (`esm-env`), plus React, Vue and Svelte packages |
| Screen readers | real text, announced once when it lands | not built in | described as accessible |
| Reduced motion | instant change | not built in | respected by default |
| Big jumps | fast drums blur at a spin cap, slow ones roll | each column slides through its ribbon | digits transition |

The odometer.js column is from its source (`animateSlide` builds one ribbon
per digit column and slides them together). The NumberFlow column is from its
docs and npm, and from watching it; its docs don't describe the carry. If
anything here is wrong, open an issue and I'll fix the table.

## Tests

```sh
npm test
```

The pure parts (the carry, the spring, formatting, fitting, the light) are
tested in Node with `node:test`.

## Where it's from

It's the free piece of [Tactile UI](https://tactileui.dev), a library of
interface objects that work like the hardware they're drawn from: a pin
screen, a Chladni plate, a detent dial, a cassette. The rest are paid; this
one is MIT, for everyone.

Made by [Ciprian Titire](https://titi.re).

## Licence

MIT. The numerals, `big-shoulders-bold.woff2`, are under the SIL Open Font
License 1.1; see `BigShoulders-OFL.txt`.
