// Rating math tests against numbers verified on Oct 13, 2026.
const assert = require('assert');
const R = require('../assets/js/rating.js');
const data = require('../data/ratings.json');
const near = (a, b, t = 0.005) => assert(Math.abs(a - b) <= t, `${a} != ${b}`);

const off = R.summarize(data.rated, 7);
near(off.rating, 88.101); near(off.sched, 88.386); near(off.agd, -0.286); near(off.l10, 87.921);
const after = R.summarize(R.gamesFor(data, { pending: true, cross: true }), 7);
assert.strictEqual(after.games, 20); near(after.rating, 88.150, 0.002); near(after.l10, 87.940, 0.002);
const noX = R.summarize(R.gamesFor(data, { pending: true, cross: false }), 7);
assert.strictEqual(noX.games, 19); near(noX.rating, 88.126, 0.002);
near(R.scenario(after, 88.1, 2, 7).pm, 1.86, 0.01);
near(R.scenario(after, 88.1, 1, 7).pm, 0.91, 0.01);
near(R.scenario(after, 88.1, -1, 7).pm, -1.00, 0.01);
assert.strictEqual(R.scenario(after, 88.1, 9, 7).counted, 7);
// every published plus-minus reproduces against the official rating
data.rated.forEach(g => near(g.opp_rating + R.capMargin(g.gf - g.ga, 7) - 88.10, g.pm, 0.011));
assert.deepStrictEqual(R.breakEven(after, 80, 7), { kind: 'impossible', n: 7 });
assert.deepStrictEqual(R.breakEven(after, 88.1, 7), { kind: 'win', n: 1 });
console.log('rating tests passed');
