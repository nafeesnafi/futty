// Run with: node --test games/spacesuit-explorer/test/validate.test.js
// Checks the mission-readiness rules without a browser.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['data.js', 'validate.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx);
const SSE = ctx.window.SSE;

// The one correct outfit for each mission (optional slots left empty).
function solution(m) {
  const o = {};
  for (const [slot, rule] of Object.entries(m.slots)) if (rule.need) o[slot] = rule.need[0];
  return o;
}

test('every mission has a rule and hint for every slot', () => {
  for (const m of SSE.MISSIONS) for (const s of SSE.SLOTS) {
    assert.ok(m.slots[s.id], `${m.id} missing rule for ${s.id}`);
    assert.ok(m.hints[s.id], `${m.id} missing hint for ${s.id}`);
  }
});

test('all item ids referenced by missions exist', () => {
  for (const m of SSE.MISSIONS) for (const rule of Object.values(m.slots)) for (const id of rule.need || rule.optional || []) {
    assert.ok(SSE.item(id), `${m.id} references unknown item ${id}`);
  }
});

test('the correct outfit passes each mission at 100%', () => {
  for (const m of SSE.MISSIONS) {
    const v = SSE.validate(m.id, solution(m));
    assert.strictEqual(v.ready, true, `${m.id}: ${JSON.stringify(v.problems)}`);
    assert.strictEqual(v.readiness, 100);
  }
});

test('an empty outfit is never ready', () => {
  for (const m of SSE.MISSIONS) assert.strictEqual(SSE.validate(m.id, {}).ready, false);
});

test('spacewalk without life support is blocked and names the backpack', () => {
  const o = solution(SSE.mission('spacewalk'));
  delete o.backpack;
  const v = SSE.validate('spacewalk', o);
  assert.strictEqual(v.ready, false);
  assert.ok(v.readiness < 100);
  assert.strictEqual(v.problems.map((p) => p.slot).join(), 'backpack');
  assert.strictEqual(v.problems[0].status, 'missing');
  assert.ok(v.problems[0].hint);
});

test('swapping any single slot for any other item never stays fully ready, unless it is an allowed option', () => {
  for (const m of SSE.MISSIONS) {
    const base = solution(m);
    for (const item of SSE.ITEMS) {
      const rule = m.slots[item.slot];
      const allowed = (rule.need || rule.optional || []).includes(item.id);
      const v = SSE.validate(m.id, { ...base, [item.slot]: item.id });
      if (allowed) assert.strictEqual(v.ready, true, `${m.id} + ${item.id}`);
      else {
        assert.strictEqual(v.ready, false, `${m.id} wrongly accepts ${item.id}`);
        assert.ok(v.readiness < 100);
      }
    }
  }
});

test('helmet that does not fit the suit is incompatible', () => {
  // Right helmet for the spacewalk, but wearing the Moon suit.
  const o = { ...solution(SSE.mission('spacewalk')), suit: 'lunar-suit' };
  const v = SSE.validate('spacewalk', o);
  assert.strictEqual(v.slots.helmet.status, 'incompatible');
  assert.strictEqual(v.slots.suit.status, 'wrong');
});

test('fake items always fail and extras on "none" slots fail', () => {
  const o = { ...solution(SSE.mission('spacewalk')), backpack: 'scuba' };
  assert.strictEqual(SSE.validate('spacewalk', o).slots.backpack.status, 'fake');
  const lunar = { ...solution(SSE.mission('lunar')), tether: 'safety-tether' };
  assert.strictEqual(SSE.validate('lunar', lunar).slots.tether.status, 'extra');
});

test('Life in Orbit: optional headset and socks are fine, a helmet is not', () => {
  const o = solution(SSE.mission('orbit'));
  assert.strictEqual(SSE.validate('orbit', { ...o, comms: 'headset', boots: 'station-socks' }).ready, true);
  assert.strictEqual(SSE.validate('orbit', { ...o, helmet: 'eva-helmet' }).ready, false);
});

test('compat() describes items for the info panel', () => {
  assert.strictEqual(SSE.compat('spacewalk', {}, 'eva-suit').tone, 'good');
  assert.strictEqual(SSE.compat('spacewalk', {}, 'scuba').tone, 'bad');
  assert.strictEqual(SSE.compat('lunar', {}, 'safety-tether').tone, 'warn');
});
