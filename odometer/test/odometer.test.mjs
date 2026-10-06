/**
 * Odometer — the arithmetic a drum counter gets wrong.
 *
 * Wrong in practice means: every digit tweened on its own, so 1,099 → 1,100
 * turns three drums at once from the first frame instead of carrying at the
 * end; a drum that jumps backwards at 9 → 0; 10.1 shown as 10.09 because
 * 10.1 × 100 is 1009.9999999999999; a spring that explodes when a tab comes
 * back after two seconds; a live region that reads out every frame.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drumPositions, scaled, quantise, drumsFor, blankZeros, slotsFor, numberStyle, formatValue,
  stepSpring, landed, smear, spin, wrapDelta, drumLight, lampOf, CARRY,
  fitSize, nextStepAt, chamfers, FINISHES, PLATES,
} from '../odometer.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const frac = (p) => p - Math.floor(p);

test('the carry: at 1099.95 the tens and hundreds are mid-roll together; at 1099.5 they have not moved', () => {
  const late = drumPositions(1099.95, 4);
  assert.ok(near(late[0], 9.95, 1e-6), `units ${late[0]}`);
  assert.ok(near(late[1], 9.5, 1e-6), `tens mid-roll: ${late[1]}`);
  assert.ok(near(late[2], 0.5, 1e-6), `hundreds mid-roll: ${late[2]}`);
  assert.ok(near(frac(late[1]), frac(late[2]), 1e-6), 'tens and hundreds turn in lock-step');
  assert.equal(late[3], 1, 'thousands untouched');

  const mid = drumPositions(1099.5, 4);
  assert.ok(near(mid[0], 9.5, 1e-9));
  assert.equal(mid[1], 9, 'tens has not started');
  assert.equal(mid[2], 0, 'hundreds has not started');
  assert.equal(mid[3], 1);

  // The carry window is the last tenth of the units' step, exactly.
  assert.equal(drumPositions(1099.89, 3)[1], 9);
  assert.ok(near(drumPositions(1099.9, 3)[1], 9, 1e-9), 'the carry starts at .9');
  assert.ok(drumPositions(1099.91, 3)[1] > 9.05);
  assert.equal(CARRY, 0.1);
});

test('a carry runs all the way up: 9,999.95 turns every drum together', () => {
  const p = drumPositions(9999.95, 5);
  for (const k of [1, 2, 3]) assert.ok(near(p[k], 9.5, 1e-6), `drum ${k}: ${p[k]}`);
  assert.ok(near(p[4], 0.5, 1e-6), `the new drum rolls in: ${p[4]}`);
  assert.deepEqual(drumPositions(10000, 5), [0, 0, 0, 0, 1]);
});

test('every drum moves forward only, and wraps at 9 → 0 without a jump', () => {
  const count = 5;
  let prev = drumPositions(0, count);
  for (let v = 0.0125; v <= 10000; v += 0.0125) {
    const p = drumPositions(v, count);
    for (let k = 0; k < count; k += 1) {
      assert.ok(p[k] >= 0 && p[k] < 10, `in range at ${v}, drum ${k}: ${p[k]}`);
      const step = wrapDelta(p[k] - prev[k]);
      // Forward only, and never more than one digit in a small step of value.
      assert.ok(step >= -1e-9 && step <= 1.0001, `drum ${k} at ${v}: ${prev[k]} → ${p[k]}`);
    }
    prev = p;
  }
  assert.deepEqual(drumPositions(1100, 4), [0, 0, 1, 1]);
});

test('decimals: the last drum is the last decimal, and binary dust never shows', () => {
  const p = drumPositions(12.345, 4, 2);
  assert.ok(near(p[0], 4.5, 1e-6) && p[1] === 3 && p[2] === 2 && p[3] === 1, `${p}`);
  // 10.1 × 100 is 1009.9999999999999 in binary; the drums must read 10.10.
  assert.equal(scaled(10.1, 2), 1010);
  assert.deepEqual(drumPositions(10.1, 4, 2), [0, 1, 0, 1]);
  assert.equal(quantise(0.1 + 0.2, 2), 0.3);
  assert.equal(Object.is(quantise(-0.001, 2), -0), false, 'never -0: it would print a sign');
});

test('negative values turn the drums by their magnitude', () => {
  assert.deepEqual(drumPositions(-1100, 4), drumPositions(1100, 4));
  assert.equal(drumsFor(-12345.6, 1), 6);
  assert.equal(drumsFor(0), 1);
  assert.equal(drumsFor(0.5, 2), 3);
  assert.equal(drumsFor(999), 3);
  assert.equal(drumsFor(1000), 4);
});

test('leading drums print a blank for their zero; the units and the decimals always print', () => {
  assert.deepEqual(blankZeros(89, 6), [false, false, true, true, true, true]);
  assert.deepEqual(blankZeros(0, 3), [false, true, true]);
  assert.deepEqual(blankZeros(0.05, 4, 2), [false, false, false, true], 'the units drum of 0.05 prints its 0');
  // Mid-roll into a new digit: the hundreds' 0 is still blank, so the 1 rolls in over nothing.
  assert.deepEqual(blankZeros(99.95, 3), [false, false, true]);
  assert.deepEqual(blankZeros(100, 3), [false, false, false]);
});

test('slots: separators stand where the locale breaks, the decimal after the units', () => {
  const kinds = (s) => s.map((x) => (x.kind === 'drum' ? x.k : x.kind[0])).join(' ');
  assert.equal(kinds(slotsFor(6, 0, [3, 6, 9])), '5 4 3 g 2 1 0');
  assert.equal(kinds(slotsFor(7, 2, [3, 6])), '6 5 g 4 3 2 d 1 0', '12,345.67');
  assert.equal(kinds(slotsFor(8, 0, [3, 5, 7])), '7 g 6 5 g 4 3 g 2 1 0', 'en-IN: 1,00,00,000');
  assert.equal(kinds(slotsFor(3, 0, [3], true)), 's 2 1 0', 'a sign plate leads; no separator with nothing left of it');
});

test('locale parts come from Intl: marks, grouping and digit glyphs', () => {
  const us = numberStyle('en-US', 2);
  assert.equal(us.group, ',');
  assert.equal(us.decimal, '.');
  assert.deepEqual(us.breaks.slice(0, 3), [3, 6, 9]);
  assert.deepEqual(us.digits, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const de = numberStyle('de-DE', 2);
  assert.equal(de.group, '.');
  assert.equal(de.decimal, ',');
  assert.deepEqual(numberStyle('en-IN').breaks.slice(0, 4), [3, 5, 7, 9], 'lakh grouping');
  assert.equal(numberStyle('ar-EG').digits[7], '٧', 'drums printed in the locale’s own digits');
  assert.deepEqual(numberStyle('en-US', 0, false).breaks, [], 'no grouping, no separator plates');
  assert.equal(numberStyle('not a locale!!').group, ',', 'a bad locale falls back instead of throwing');
});

test('the text alternative reads like a sentence would: sign, prefix, the locale’s number, suffix', () => {
  assert.equal(formatValue(1099, numberStyle('en-US')), '1,099');
  assert.equal(formatValue(89, numberStyle('en-US'), '$'), '$89');
  assert.equal(formatValue(-12.5, numberStyle('en-US', 2), '$', ' left'), '-$12.50 left');
  assert.equal(formatValue(12480.5, numberStyle('de-DE', 2), '', ' €'), '12.480,50 €');
});

test('the spring lands exactly, with overshoot only below critical damping', () => {
  const run = (damping) => {
    const s = { x: 1099, v: 0 };
    let peak = s.x;
    let frames = 0;
    for (; frames < 600 && !landed(s, 1100); frames += 1) {
      stepSpring(s, 1100, 1 / 60, 140, damping);
      peak = Math.max(peak, s.x);
    }
    return { s, peak, frames };
  };
  const under = run(0.6);
  assert.ok(under.peak > 1100.01, `damping 0.6 overshoots: peak ${under.peak}`);
  const critical = run(1);
  assert.ok(critical.peak <= 1100 + 1e-9, `damping 1 never passes: peak ${critical.peak}`);
  for (const r of [under, run(0.85), critical]) {
    assert.ok(r.frames < 120, `lands within two seconds (${r.frames} frames)`);
    assert.ok(Math.abs(r.s.x - 1100) < 1e-3);
  }
});

test('a huge frame gap does not explode the spring', () => {
  const s = { x: 0, v: 0 };
  stepSpring(s, 1e9, 2.5, 400, 0.4); // a tab returning after 2.5 s, the stiffest, bounciest spring
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.v));
  assert.ok(s.x >= 0 && s.x < 1e9 * 0.5, `one clamped frame of travel, not a launch: ${s.x}`);
  const t = { x: 5, v: 0 };
  stepSpring(t, 5, 2.5);
  assert.equal(t.x, 5, 'at rest stays at rest');
  stepSpring(t, 6, -1);
  assert.equal(t.x, 5, 'a negative dt is no time at all');
});

test('a jump of a million lands exactly: the low drums outrun the cap, the top one never blurs', () => {
  const s = { x: 1099, v: 0 };
  let fastest = 0;
  for (let i = 0; i < 600 && !landed(s, 1_001_099); i += 1) {
    stepSpring(s, 1_001_099, 1 / 60);
    fastest = Math.max(fastest, Math.abs(s.v));
  }
  assert.ok(landed(s, 1_001_099), `landed at ${s.x}`);
  for (let k = 0; k <= 5; k += 1) assert.ok(fastest / 10 ** k > 24, `drum ${k} is past a 24 digit/s cap`);
  assert.equal(smear(fastest / 1e6, 24), 0, `the millions drum stays sharp (peak ${(fastest / 1e6).toFixed(1)} digits/s)`);
});

test('smear and spin: sharp when slow, a free-running blur past the cap', () => {
  assert.equal(smear(0, 24), 0);
  assert.equal(smear(8, 24), 0, 'a third of the cap is still sharp');
  assert.equal(smear(24, 24), 1);
  assert.ok(smear(16, 24) > 0 && smear(16, 24) < 1);
  const slow = spin(3, 4.2, 10, 1, 24, 1 / 60);
  assert.ok(!slow.free && near(slow.pos, 4.2), 'under the cap a drum is where the carry says');
  const fast = spin(3, 7.7, 5000, 1, 24, 1 / 60);
  assert.equal(fast.free, true);
  assert.ok(near(fast.pos, 3 + 24 / 60, 1e-9), 'over the cap it turns at the cap, from where it was');
  assert.ok(near(spin(0.1, 0, 5000, -1, 24, 1 / 60).pos, 9.7, 1e-9), 'backwards wraps too');
  const still = spin(3, 7.7, 5000, 1, 24, 0);
  assert.ok(!still.free && near(still.pos, 7.7), 'no time, no free run');
});

test('the light on a drum agrees with the lamp', () => {
  const above = drumLight(0, 0.3);
  const below = drumLight(180, 0.3);
  const brightest = (rows) => rows.reduce((b, r) => (r.light - r.dark > b.light - b.dark ? r : b));
  assert.ok(brightest(above).at < 0.5, 'a lamp above lights the upper drum');
  assert.ok(brightest(below).at > 0.5, 'a lamp below lights the lower drum');
  for (const rows of [above, below, drumLight(315), drumLight(90)]) {
    assert.ok(rows[0].dark > 0.5 && rows.at(-1).dark > 0.5, 'both lips of the window shade the drum');
    for (const r of rows) assert.ok(r.dark >= 0 && r.dark <= 1 && r.light >= 0 && r.light <= 1);
  }
  const { lx, ly } = lampOf(315);
  assert.ok(lx < 0 && ly < 0, '315° is upper left');
});

test('fit: fills the tighter dimension, ignores a missing one, never chases itself', () => {
  // A counter 5.6 × 2.1 numerals, with 0.22 em of shadow room each side.
  assert.equal(fitSize(1000, 500, 5.6, 2.1), 165.5, 'height-bound');
  assert.equal(fitSize(400, 500, 5.6, 2.1), 66.2, 'width-bound');
  assert.equal(fitSize(400, 0, 5.6, 2.1), 66.2, 'no height of its own: width only');
  assert.equal(fitSize(0, 0, 5.6, 2.1), 72, 'no box at all: the fallback, not a collapse to nothing');
  assert.equal(fitSize(20, 20, 5.6, 2.1), 8, 'never below 8px');
  assert.equal(fitSize(1e6, 1e6, 5.6, 2.1), 400, 'never above 400px');
});

test('a slow tally knows when its next step is due, so it can sleep until then', () => {
  assert.equal(nextStepAt(0, 0, 1), 1000);
  assert.equal(nextStepAt(0, 1500, 1), 2000);
  assert.equal(nextStepAt(0, 1500, 0.25, 1), 1600, '0.25/s in tenths: a step every 400 ms');
  assert.equal(nextStepAt(0, 999, -2), 1000, 'counting down steps as often as counting up');
  assert.equal(nextStepAt(0, 999.9999999, -2), 1500, 'with the tally’s own tolerance: a step due now has been taken');
});

test('housings: every finish comes in a plate, and its chamfers agree with the lamp', () => {
  for (const [name, fin] of Object.entries(FINISHES)) assert.ok(PLATES[fin.plate], `${name} has a housing`);
  const lum = (rgb) => rgb.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0);
  const upperLeft = chamfers(315, 'anodised');
  // Raised edge: top and left face the lamp. Window walls face inward: bottom and right do.
  assert.ok(lum(upperLeft.raise[0]) > lum(upperLeft.raise[2]) && lum(upperLeft.raise[3]) > lum(upperLeft.raise[1]));
  assert.ok(lum(upperLeft.recess[2]) > lum(upperLeft.recess[0]) && lum(upperLeft.recess[1]) > lum(upperLeft.recess[3]));
  const lowerRight = chamfers(135, 'anodised');
  assert.ok(lum(lowerRight.raise[2]) > lum(lowerRight.raise[0]), 'move the lamp and the lit edge moves with it');
  assert.deepEqual(chamfers(315, 'no such plate'), chamfers(315, 'anodised'), 'an unknown housing falls back');
});

