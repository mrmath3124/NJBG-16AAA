/* MYHockey rating math. Pure functions, shared by the page and the tests. */
(function (root) {
  function capMargin(d, max) { return Math.max(-max, Math.min(max, d)); }

  // Every game the basis counts, oldest first.
  function gamesFor(data, opts) {
    var rows = data.rated.map(function (g) { return Object.assign({ rated: true }, g); });
    if (opts && opts.pending) {
      data.pending.forEach(function (g) {
        if (g.cross_age && opts.cross === false) return;
        rows.push(Object.assign({ rated: false }, g));
      });
    }
    return rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function summarize(rows, max) {
    var pts = rows.map(function (r) { return r.opp_rating + capMargin(r.gf - r.ga, max); });
    var sum = pts.reduce(function (s, p) { return s + p; }, 0);
    var last = pts.slice(-10);
    var n = rows.length;
    return {
      games: n,
      rating: sum / n,
      sched: rows.reduce(function (s, r) { return s + r.opp_rating; }, 0) / n,
      agd: rows.reduce(function (s, r) { return s + capMargin(r.gf - r.ga, max); }, 0) / n,
      l10: last.reduce(function (s, p) { return s + p; }, 0) / last.length,
      sum: sum,
      last9: last.slice(1).reduce(function (s, p) { return s + p; }, 0),
      lastCount: last.length
    };
  }

  // Effect of one more game against an opponent rated `opp`, won or lost by `margin`.
  function scenario(b, opp, margin, max) {
    var c = capMargin(margin, max);
    var pts = opp + c;
    var r1 = (b.sum + pts) / (b.games + 1);
    var l10 = b.lastCount >= 10 ? (b.last9 + pts) / 10 : (b.l10 * b.lastCount + pts) / (b.lastCount + 1);
    return { counted: c, pts: pts, r1: r1, pm: pts - r1, dr: r1 - b.rating, l10: l10, dl10: l10 - b.l10 };
  }

  // Smallest whole margin that keeps the rating from dropping.
  function breakEven(b, opp, max) {
    var need = Math.ceil(b.rating - opp - 1e-9);
    if (need > max) return { kind: 'impossible', n: max };
    if (need < -max) return { kind: 'any', n: max };
    return { kind: need > 0 ? 'win' : need === 0 ? 'tie' : 'lose', n: Math.abs(need) };
  }

  var api = { capMargin: capMargin, gamesFor: gamesFor, summarize: summarize, scenario: scenario, breakEven: breakEven };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rating = api;
})(this);
