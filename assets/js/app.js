/* Bandits 16U parent site. Reads data/*.json and fills the page. All data is written as text, never as HTML. */
(function () {
  'use strict';
  var R = window.Rating;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['home', 'rating', 'games', 'stats', 'video', 'info'];

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'cls') e.className = props[k];
      else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function f2(x) { return x.toFixed(2); }
  function sg(x) { var r = Number(x.toFixed(2)); return r === 0 ? '0.00' : (r > 0 ? '+' : '-') + Math.abs(r).toFixed(2); }
  function tone(x) { var r = Number(x.toFixed(2)); return r > 0 ? 'up' : r < 0 ? 'down' : ''; }
  function ord(n) { var m = n % 100, k = n % 10; return n + (m > 10 && m < 14 ? 'th' : k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th'); }
  function day(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function longDay(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function resultText(g) { return (g.gf > g.ga ? 'W' : g.gf < g.ga ? 'L' : 'T') + ' ' + g.gf + '-' + g.ga; }
  function tile(label, value, sub, brand) {
    return el('div', { cls: 'tile' + (brand ? ' brand' : '') }, [
      el('span', { cls: 'label', text: label }), el('span', { cls: 'big', text: value }), sub ? el('span', { cls: 'sub', text: sub }) : null
    ]);
  }
  function getJSON(name) {
    return fetch('data/' + name + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(name); return r.json(); });
  }

  var D = {};
  var W = { opp: null, gf: 3, ga: 2, pending: true, cross: true };

  Promise.all(['ratings', 'schedule', 'skaters', 'goalies', 'videos', 'site', 'opponents'].map(function (n) {
    return getJSON(n).catch(function () { return null; });
  })).then(function (all) {
    D.ratings = all[0]; D.schedule = all[1] || { games: [] }; D.skaters = all[2] || { players: [] };
    D.goalies = all[3] || { goalies: [] }; D.videos = all[4] || { videos: [] }; D.site = all[5] || {};
    D.opps = (all[6] && all[6].teams) || {}; D.oppsUpdated = all[6] && all[6].updated;
    if (!D.ratings) { $('home-last').textContent = 'Ratings data did not load. Try again in a minute.'; return; }
    D.max = D.ratings.team.max_gd || 7;
    D.all = R.gamesFor(D.ratings, { pending: true, cross: true });
    D.official = R.summarize(D.ratings.rated, D.max);
    D.next = (D.schedule.games || []).filter(function (g) { return g.date >= todayIso(); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0] || null;
    if (D.next && !D.next.opp_rating && D.opps[D.next.opponent]) D.next.opp_rating = D.opps[D.next.opponent].rating;
    W.opp = D.next && D.next.opp_rating ? D.next.opp_rating : D.ratings.team.rating;
    renderFrame(); renderHome(); renderRating(); renderGames(); renderStats(); renderVideo(); renderInfo();
    wireWhatIf(); drawWhatIf();
    route();
  });

  /* ---------- frame and routing ---------- */
  function renderFrame() {
    if (D.site.team_label) $('team-label').textContent = D.site.team_label;
    if (D.site.disclaimer) $('disclaimer').textContent = D.site.disclaimer;
    $('updated').textContent = 'Updated ' + day(D.ratings.updated);
  }
  function route() {
    var v = (location.hash || '#home').slice(1);
    if (VIEWS.indexOf(v) < 0) v = 'home';
    VIEWS.forEach(function (n) { $('view-' + n).hidden = n !== v; });
    document.querySelectorAll('.tabs a').forEach(function (a) {
      if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- home ---------- */
  function renderHome() {
    var games = D.all, team = D.ratings.team;
    // Next game
    var nx = $('home-next');
    if (D.next) {
      var g = D.next, place = [g.rink, g.town].filter(Boolean).join(', ');
      var maps = g.map_url || (place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place) : null);
      nx.appendChild(el('section', { cls: 'next', 'aria-label': 'Next game' }, [
        el('span', { cls: 'label', text: 'Next game' }),
        el('h3', { text: 'vs ' + g.opponent }),
        el('p', { style: 'margin:0', text: longDay(g.date) + (g.time ? ' · ' + g.time : '') + (place ? ' · ' + place : '') + (g.arrive ? ' · arrive ' + g.arrive : '') }),
        el('div', { cls: 'actions' }, [
          D.opps[g.opponent] ? el('button', { cls: 'btn gold', type: 'button', id: 'notes-open', 'aria-haspopup': 'dialog', text: 'Game notes' }) : null,
          maps ? el('a', { cls: 'btn', href: maps, rel: 'noopener', target: '_blank', text: 'Directions' }) : null,
          el('a', { cls: 'btn outline', href: icsFor(g), download: 'bandits-' + g.date + '.ics', text: 'Add to calendar' })
        ])
      ]));
      if ($('notes-open')) $('notes-open').addEventListener('click', function () { openNotes(g); });
    } else {
      nx.appendChild(el('section', { cls: 'next', 'aria-label': 'Next game' }, [
        el('span', { cls: 'label', text: 'Next game' }), el('h3', { text: 'Schedule coming soon' }),
        el('p', { cls: 'note', text: 'Upcoming games, rinks and arrival times will show here.' })
      ]));
    }
    // Last result and streak
    var last = games[games.length - 1], lr = resultText(last).charAt(0), streak = 0;
    for (var i = games.length - 1; i >= 0 && resultText(games[i]).charAt(0) === lr; i--) streak++;
    var word = { W: 'win', L: 'loss', T: 'tie' }[lr];
    var box = $('home-last');
    box.append(
      el('span', { cls: 'label', text: 'Last result · ' + day(last.date) }),
      el('div', { cls: 'score-row' }, [
        el('span', { cls: 'score-big ' + (lr === 'W' ? 'up' : lr === 'L' ? 'down' : ''), text: resultText(last) + (last.note ? ' ' + last.note : '') }),
        el('span', { text: 'vs ' + last.opponent })
      ]),
      el('span', { cls: 'sub', text: streak > 1 ? streak + ' straight ' + { win: 'wins', loss: 'losses', tie: 'ties' }[word] : '' })
    );
    // Tiles
    var w = 0, l = 0, t = 0;
    games.forEach(function (g) { if (g.gf > g.ga) w++; else if (g.gf < g.ga) l++; else t++; });
    $('home-tiles').append(
      tile('Rating', f2(team.rating), 'Last update', true),
      tile('Tier 1 rank', ord(team.rank_tier1), team.tier1_label),
      tile('Record', w + '-' + l + '-' + t, 'All games'),
      tile('Last 10', f2(D.official.l10), 'Rated games')
    );
    // What the score does (vs next opponent, else an example)
    var b = R.summarize(games, D.max);
    var opp = D.next && D.next.opp_rating ? D.next.opp_rating : team.rating;
    var rows = [3, 2, 1, -1].map(function (m) {
      var s = R.scenario(b, opp, m, D.max);
      return el('div', null, [el('span', { text: m > 0 ? 'Win by ' + m : 'Lose by ' + (-m) }), el('b', { cls: 'num ' + tone(s.pm), text: sg(s.pm) })]);
    });
    $('home-what').append(
      el('div', { cls: 'sechead' }, [el('h2', { text: 'What the score does' }), el('div', { cls: 'rule' })]),
      el('p', { cls: 'note', text: D.next && D.next.opp_rating ? 'Plus-minus for the game against ' + D.next.opponent + ' (' + f2(opp) + ').' : 'Plus-minus for the game against a team rated ' + f2(opp) + ' (example).' }),
      el('div', { cls: 'list' }, rows),
      el('a', { href: '#rating', text: 'Try any score' })
    );
    // Recent games
    games.slice(-5).reverse().forEach(function (g) {
      $('home-recent').appendChild(el('div', null, [
        el('span', null, [el('b', { cls: g.gf > g.ga ? 'up' : g.gf < g.ga ? 'down' : '', text: resultText(g) }), ' ' + g.opponent + (g.note ? ' (' + g.note + ')' : '')]),
        el('span', { cls: 'muted', text: day(g.date) })
      ]));
    });
    var np = (D.skaters.players || []).length, ng = (D.goalies.goalies || []).length, nv = (D.videos.videos || []).length;
    if (np) $('soon-players').textContent = np + ' players';
    if (ng) $('soon-goalies').textContent = ng + (ng === 1 ? ' goalie' : ' goalies');
    if (nv) $('soon-video').textContent = nv + ' videos';
  }

  /* ---------- game notes (scouting for the next opponent) ---------- */
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function wlt(rows) {
    var w = 0, l = 0, t = 0, f = 0, a = 0;
    rows.forEach(function (r) { f += r.gf; a += r.ga; if (r.gf > r.ga) w++; else if (r.gf < r.ga) l++; else t++; });
    return { w: w, l: l, t: t, gf: f, ga: a, rec: w + '-' + l + '-' + t };
  }
  function scores(rows) { return rows.map(function (r) { return resultText(r) + (r.note ? ' ' + r.note : ''); }).join(', '); }
  function per(n, d) { return d ? (n / d).toFixed(1) : '0'; }

  function scout(g) {
    var O = D.opps[g.opponent], us = D.ratings.team, me = norm(us.name);
    var their = O.games.map(function (r) { return { date: r[0], opponent: r[1], gf: r[2], ga: r[3], note: r[4] || '' }; })
      .filter(function (r) { return norm(r.opponent) !== me; });
    var ours = D.all.filter(function (r) { return norm(r.opponent) !== norm(O.myhr_name); });
    var h2h = D.all.filter(function (r) { return norm(r.opponent) === norm(O.myhr_name); });
    var by = {};
    ours.forEach(function (r) { var k = norm(r.opponent); (by[k] = by[k] || { name: r.opponent, us: [], them: [] }).us.push(r); });
    their.forEach(function (r) { var k = norm(r.opponent); if (by[k]) by[k].them.push(r); });
    var common = Object.keys(by).map(function (k) { return by[k]; }).filter(function (c) { return c.them.length; })
      .sort(function (a, b) { return a.us[0].date < b.us[0].date ? -1 : 1; });
    var gp = O.games.length, ourAll = wlt(D.all);
    return { O: O, us: us, their: their, h2h: h2h, common: common, gp: gp, ourAll: ourAll, gap: O.rating - us.rating };
  }

  function talkingPoints(S) {
    var O = S.O, tp = [], gap = S.gap, b = R.summarize(D.all, D.max), be = R.breakEven(b, O.rating, D.max);
    if (gap >= 1) {
      tp.push('They are rated ' + f2(gap) + ' higher, so MYHockey expects them to win by about ' + Math.round(gap) + '. ' +
        (be.kind === 'lose' ? 'Even a loss by ' + be.n + ' or fewer keeps our rating from dropping, so every goal and every save counts until the final buzzer.' : 'Keeping it close is the goal.'));
    } else if (gap <= -1) {
      tp.push('We are rated ' + f2(-gap) + ' higher, so MYHockey expects us to win by about ' + Math.round(-gap) + '. ' +
        (be.kind === 'win' ? 'A win by ' + be.n + ' or more keeps our rating climbing. Keep playing hard with a lead.' : ''));
    } else {
      tp.push('The ratings are within a goal of each other (' + f2(O.rating) + ' vs ' + f2(S.us.rating) + '). It is a toss-up, so effort and small plays will decide it.');
    }
    var gapg = O.ga / S.gp, gfpg = O.gf / S.gp;
    if (gapg <= 1.5) tp.push('They allow only ' + gapg.toFixed(1) + ' goals a game. Chances will be scarce: get pucks to the net and go hard for rebounds.');
    else if (gapg >= 3) tp.push('They allow ' + gapg.toFixed(1) + ' goals a game. Shooting early and often should pay off.');
    if (gfpg >= 3) tp.push('They score ' + gfpg.toFixed(1) + ' goals a game. Backchecking and staying out of the penalty box will matter.');
    else if (gfpg <= 1.5) tp.push('They score only ' + gfpg.toFixed(1) + ' goals a game, so an early goal or two is a big cushion.');
    var close = S.their.filter(function (r) { return Math.abs(r.gf - r.ga) <= 1 || r.note; }).length;
    if (S.their.length && close / S.their.length >= 0.3) tp.push(close + ' of their ' + S.their.length + ' games were decided by one goal or went to OT or a shootout. Expect it to be tight late; finish every shift.');
    var last5 = wlt(O.games.slice(-5).map(function (r) { return { gf: r[2], ga: r[3] }; }));
    tp.push('They are ' + last5.rec + ' in their last 5 games.');
    var best = S.common.map(function (c) {
      var u = wlt(c.us), t = wlt(c.them);
      return { c: c, diff: (t.gf - t.ga) / c.them.length - (u.gf - u.ga) / c.us.length };
    }).sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); })[0];
    if (best) tp.push('Both teams played ' + best.c.name + ': they went ' + scores(best.c.them) + '; we went ' + scores(best.c.us) + '.');
    if (S.h2h.length) tp.push('We have already played them this season: ' + scores(S.h2h) + '.');
    return tp;
  }

  function questions(gap) {
    if (gap >= 1) return ['What is one battle you can win every shift, even against a strong team?', 'How do we keep going if we fall behind early?'];
    if (gap <= -1) return ['How do we stay sharp if we get an early lead?', 'What is one thing you want to do better than last game?'];
    return ['What will you do differently in the last five minutes of a tie game?', 'What is one small play that could swing this game?'];
  }

  function openNotes(g) {
    var S = scout(g), O = S.O, us = S.us, dlg = $('notes');
    if (!dlg) { dlg = el('dialog', { id: 'notes', cls: 'notes', 'aria-labelledby': 'notes-title' }); document.body.appendChild(dlg); }
    dlg.textContent = '';
    var ourGp = D.all.length;
    function side(title, rating, rank, rec, gf, ga, n) {
      return el('div', null, [el('span', { cls: 'label', text: title }), el('span', { cls: 'big', text: f2(rating) }),
        el('span', { cls: 'sub', text: (rank ? rank + ' · ' : '') + rec }),
        el('span', { cls: 'sub', text: per(gf, n) + ' goals for, ' + per(ga, n) + ' against per game' })]);
    }
    var common = S.common.length ? el('div', { cls: 'common' }, S.common.map(function (c) {
      return el('div', null, [el('b', { text: c.name }),
        el('span', null, ['Us: ', el('span', { cls: 'num', text: scores(c.us) })]),
        el('span', null, ['Them: ', el('span', { cls: 'num', text: scores(c.them) })])]);
    })) : el('p', { cls: 'note', text: 'No shared opponents yet.' });
    var cu = wlt([].concat.apply([], S.common.map(function (c) { return c.us; }))),
      ct = wlt([].concat.apply([], S.common.map(function (c) { return c.them; })));
    var kids = [
      el('div', { cls: 'notes-head' }, [
        el('div', null, [el('span', { cls: 'label', text: 'Game notes' }), el('h3', { id: 'notes-title', text: 'vs ' + g.opponent }),
          el('p', { cls: 'note', text: longDay(g.date) + (g.time ? ' · ' + g.time : '') })]),
        el('button', { cls: 'close-x', type: 'button', 'aria-label': 'Close game notes', text: '×' })
      ]),
      el('h4', { text: 'The matchup' }),
      el('div', { cls: 'vs' }, [
        side('Bandits', us.rating, us.rank_tier1 ? ord(us.rank_tier1) + ' Tier 1' : '', S.ourAll.rec, S.ourAll.gf, S.ourAll.ga, ourGp),
        side(g.opponent, O.rating, (O.ranks[0] || '').replace('USA Girls 16U ', ''), O.record, O.gf, O.ga, S.gp)
      ]),
      el('h4', { text: 'Head to head' }),
      el('p', { style: 'margin:0', text: S.h2h.length ? scores(S.h2h) : 'First meeting this season.' }),
      el('h4', { text: 'Teams we have both played' }),
      S.common.length ? el('p', { cls: 'note', text: 'Against these teams we are ' + cu.rec + ' (' + cu.gf + '-' + cu.ga + ' in goals); they are ' + ct.rec + ' (' + ct.gf + '-' + ct.ga + ').' }) : null,
      common,
      el('h4', { text: 'Talking points' }),
      el('ul', null, talkingPoints(S).map(function (t) { return el('li', { text: t }); })),
      O.notes && O.notes.length ? el('h4', { text: 'Notes' }) : null,
      O.notes && O.notes.length ? el('ul', null, O.notes.map(function (t) { return el('li', { text: t }); })) : null,
      el('h4', { text: 'Ask your player' }),
      el('ul', null, questions(S.gap).map(function (t) { return el('li', { text: t }); })),
      el('p', { cls: 'note' }, ['Numbers from ', el('a', { href: 'https://myhockeyrankings.com/team-info/' + O.team_id + '/' + D.ratings.season + '/games', rel: 'noopener', target: '_blank', text: 'MYHockey Rankings' }),
        D.oppsUpdated ? ', as of ' + day(D.oppsUpdated) + '.' : '.', ' These are conversation ideas from the stats, not coaching instructions.'])
    ];
    dlg.appendChild(el('div', { cls: 'notes-in' }, kids));
    dlg.querySelector('.close-x').addEventListener('click', function () { closeNotes(dlg); });
    dlg.onclick = function (e) { if (e.target === dlg) closeNotes(dlg); };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeNotes(dlg) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); var b = $('notes-open'); if (b) b.focus(); }

  function icsFor(g) {
    var d = g.date.replace(/-/g, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bandits16U//EN', 'BEGIN:VEVENT',
      'UID:' + d + '-' + encodeURIComponent(g.opponent) + '@bandits16u', 'DTSTAMP:' + d + 'T000000Z',
      'DTSTART;VALUE=DATE:' + d, 'SUMMARY:Bandits 16U vs ' + g.opponent + (g.time ? ' ' + g.time : ''),
      'LOCATION:' + [g.rink, g.town].filter(Boolean).join(', '), 'END:VEVENT', 'END:VCALENDAR'];
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  /* ---------- rating ---------- */
  function renderRating() {
    var team = D.ratings.team, o = D.official;
    $('cap').textContent = String(D.max);
    $('rating-tiles').append(
      tile('Rating', f2(team.rating), 'Last update', true),
      tile('Schedule', f2(o.sched), 'Average opponent'),
      tile('Goal margin', sg(o.agd), 'Average per game'),
      tile('Last 10', f2(o.l10), 'Rated games'),
      tile('Tier 1', ord(team.rank_tier1), team.tier1_label),
      tile('All teams', ord(team.rank_all), team.all_label)
    );
    var tb = $('math').querySelector('tbody');
    D.all.slice().reverse().forEach(function (g) {
      var pts = g.opp_rating + R.capMargin(g.gf - g.ga, D.max);
      var pm = g.rated ? g.pm : null;
      tb.appendChild(el('tr', null, [
        el('td', { cls: 'l', text: day(g.date) }),
        el('td', { cls: 'l wrap', text: g.opponent + (g.rated ? '' : ' *') }),
        el('td', { text: resultText(g) + (g.note ? ' ' + g.note : '') }),
        el('td', { text: f2(g.opp_rating) }),
        el('td', { text: f2(pts) }),
        el('td', { cls: pm == null ? 'muted' : tone(pm), text: pm == null ? '—' : sg(pm) })
      ]));
    });
    $('math-note').textContent = '* Not yet rated. Points are the opponent rating plus the capped margin. Plus-minus is measured against the rating, so it is blank until MYHockey rates the game. Source: MYHockey Rankings, ' + day(D.ratings.updated) + '.';
    var cross = D.ratings.pending.some(function (g) { return g.cross_age; });
    $('w-cross-wrap').hidden = !cross;
  }

  function wireWhatIf() {
    var opp = $('w-opp'), oppR = $('w-opp-r');
    opp.addEventListener('input', function () { var v = parseFloat(opp.value); if (isFinite(v) && v >= 60 && v <= 99.99) { W.opp = v; drawWhatIf(); } });
    opp.addEventListener('blur', function () { opp.value = String(W.opp); });
    oppR.addEventListener('input', function () { W.opp = Number(oppR.value); drawWhatIf(); });
    $('w-gf').addEventListener('input', function (e) { W.gf = Number(e.target.value); drawWhatIf(); });
    $('w-ga').addEventListener('input', function (e) { W.ga = Number(e.target.value); drawWhatIf(); });
    $('w-pending').addEventListener('change', function (e) { W.pending = e.target.checked; drawWhatIf(); });
    $('w-cross').addEventListener('change', function (e) { W.cross = e.target.checked; drawWhatIf(); });
  }

  function drawWhatIf() {
    if (!D.ratings) return;
    var b = R.summarize(R.gamesFor(D.ratings, { pending: W.pending, cross: W.cross }), D.max);
    var opp = W.opp, margin = W.gf - W.ga, s = R.scenario(b, opp, margin, D.max);
    if (document.activeElement !== $('w-opp')) $('w-opp').value = String(opp);
    $('w-opp-r').value = String(opp);
    $('w-gf-o').textContent = String(W.gf); $('w-ga-o').textContent = String(W.ga);
    $('w-cross').disabled = !W.pending;
    var word = margin > 0 ? 'Win' : margin < 0 ? 'Loss' : 'Tie';
    $('w-res').textContent = word + ' ' + W.gf + '-' + W.ga + (Math.abs(margin) > D.max ? ' (counts as ' + (margin > 0 ? '+' : '-') + D.max + ')' : '');
    $('w-pm').textContent = sg(s.pm); $('w-pm').className = 'score-big ' + tone(s.pm);
    $('w-r1').textContent = f2(s.r1); $('w-r1-sub').textContent = f2(b.rating) + ' before, ' + sg(s.dr);
    $('w-l10').textContent = f2(s.l10); $('w-l10-sub').textContent = f2(b.l10) + ' before, ' + sg(s.dl10);
    $('w-pts').textContent = f2(opp) + (s.counted >= 0 ? ' + ' : ' - ') + Math.abs(s.counted) + ' = ' + f2(s.pts);
    var be = R.breakEven(b, opp, D.max);
    $('w-be').textContent = be.kind === 'impossible' ? 'Not possible: even a ' + be.n + '-goal win lowers it'
      : be.kind === 'any' ? 'Any result: even a ' + be.n + '-goal loss raises it'
      : be.kind === 'win' ? 'Win by ' + be.n + ' or more'
      : be.kind === 'tie' ? 'Any result that is not a loss' : 'Lose by no more than ' + be.n;
    $('w-goal').textContent = (1 / (b.games + 1)).toFixed(3) + ' rating points';
    var tb = $('w-ladder').querySelector('tbody'); tb.replaceChildren();
    for (var m = D.max; m >= -D.max; m--) {
      var r = R.scenario(b, opp, m, D.max);
      var lab = m === 0 ? 'Tie' : (m > 0 ? 'Win by ' : 'Lose by ') + Math.abs(m) + (Math.abs(m) === D.max ? '+' : '');
      tb.appendChild(el('tr', { cls: m === s.counted ? 'sel' : '' }, [
        el('td', { cls: 'l', text: lab }), el('td', { text: f2(r.pts) }), el('td', { cls: tone(r.pm), text: sg(r.pm) }),
        el('td', { text: f2(r.r1) }), el('td', { text: f2(r.l10) })
      ]));
    }
  }

  /* ---------- games ---------- */
  function renderGames() {
    var up = (D.schedule.games || []).filter(function (g) { return g.date >= todayIso(); });
    if (!up.length) $('games-upcoming').appendChild(el('div', null, [el('span', { cls: 'muted', text: 'Upcoming games will show here.' })]));
    up.forEach(function (g) {
      $('games-upcoming').appendChild(el('div', null, [
        el('span', { text: 'vs ' + g.opponent + (g.rink ? ' · ' + g.rink : '') }), el('span', { cls: 'muted', text: longDay(g.date) + (g.time ? ' ' + g.time : '') })
      ]));
    });
    D.all.slice().reverse().forEach(function (g) {
      $('games-results').appendChild(el('div', null, [
        el('span', null, [el('b', { cls: g.gf > g.ga ? 'up' : g.gf < g.ga ? 'down' : '', text: resultText(g) }), ' ' + g.opponent + (g.note ? ' (' + g.note + ')' : '') + (g.rated ? '' : ' · not yet rated')]),
        el('span', { cls: 'muted', text: day(g.date) })
      ]));
    });
  }

  /* ---------- stats ---------- */
  var sortKey = 'pts', sortDir = -1;
  function renderStats() {
    drawSkaters();
    $('skaters').querySelectorAll('th button').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.sort; if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; }
        $('skaters').querySelectorAll('th').forEach(function (th) { th.removeAttribute('aria-sort'); });
        b.parentNode.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending');
        drawSkaters();
      });
    });
    var gb = $('goalies').querySelector('tbody'), gs = D.goalies.goalies || [];
    if (!gs.length) gb.appendChild(el('tr', null, [el('td', { cls: 'l muted', colspan: '6', text: 'Goalie stats are on the way.' })]));
    gs.forEach(function (g) {
      var sv = g.sa ? (g.sa - g.ga) / g.sa : null;
      var gaa = g.full_games ? g.ga / g.full_games : g.gp ? g.ga / g.gp : null;
      gb.appendChild(el('tr', null, [
        el('td', { cls: 'l', text: (g.number ? '#' + g.number + ' ' : '') + g.name }), el('td', { text: String(g.gp) }), el('td', { text: String(g.sa) }),
        el('td', { text: String(g.ga) }), el('td', { text: sv == null ? '—' : sv.toFixed(3).replace(/^0/, '') }), el('td', { text: gaa == null ? '—' : gaa.toFixed(2) })
      ]));
    });
    $('goalies-note').textContent = (D.goalies.source_label || '') + (D.goalies.updated ? ', updated ' + day(D.goalies.updated) : '') + '. GAA uses full-game equivalents when a goalie splits games.';
    var sn = $('skaters-note');
    sn.append((D.skaters.source_label || 'League stats') + (D.skaters.updated ? ', updated ' + day(D.skaters.updated) : '') + '. ');
    if (D.skaters.source_url) sn.appendChild(el('a', { href: D.skaters.source_url, rel: 'noopener', target: '_blank', text: 'Source' }));
  }
  function drawSkaters() {
    var tb = $('skaters').querySelector('tbody'); tb.replaceChildren();
    var ps = (D.skaters.players || []).slice();
    if (!ps.length) { tb.appendChild(el('tr', null, [el('td', { cls: 'l muted', colspan: '7', text: 'Player stats are on the way.' })])); return; }
    ps.forEach(function (p) { p.pts = (p.g || 0) + (p.a || 0); });
    ps.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (sortKey === 'name') return sortDir * String(x).localeCompare(String(y));
      return sortDir * ((x || 0) - (y || 0)) || String(a.name).localeCompare(String(b.name));
    });
    ps.forEach(function (p) {
      var vid = p.hudl ? el('a', { cls: 'play', href: p.hudl, rel: 'noopener', target: '_blank', 'aria-label': 'Watch ' + p.name + ' on Hudl' }) : el('span', { cls: 'muted', text: '—' });
      if (p.hudl) vid.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
      tb.appendChild(el('tr', null, [
        el('td', { cls: 'l', text: (p.number ? '#' + p.number + ' ' : '') + p.name }), el('td', { text: String(p.gp || 0) }),
        el('td', { text: String(p.g || 0) }), el('td', { text: String(p.a || 0) }), el('td', { text: String(p.pts) }),
        el('td', { text: String(p.pim || 0) }), el('td', null, [vid])
      ]));
    });
  }

  /* ---------- video and info ---------- */
  function renderVideo() {
    var vs = (D.videos.videos || []).slice().sort(function (a, b) { return a.game_date < b.game_date ? 1 : -1; });
    if (!vs.length) $('videos').appendChild(el('div', null, [el('span', { cls: 'muted', text: 'Hudl links will show here, by game.' })]));
    vs.forEach(function (v) {
      $('videos').appendChild(el('div', null, [
        el('a', { href: v.url, rel: 'noopener', target: '_blank', text: (v.label || 'Game video') + ' · vs ' + v.opponent + (v.player ? ' · ' + v.player : '') }),
        el('span', { cls: 'muted', text: day(v.game_date) })
      ]));
    });
  }
  function renderInfo() {
    var box = $('info-body');
    if (D.site.announcement) box.appendChild(el('p', { style: 'margin:0', text: D.site.announcement }));
    (D.site.rinks || []).forEach(function (r) {
      box.appendChild(el('p', { style: 'margin:0' }, [el('b', { text: r.name }), ' ' + (r.address || '') + ' ', r.map_url ? el('a', { href: r.map_url, rel: 'noopener', target: '_blank', text: 'Map' }) : null]));
    });
    box.appendChild(el('h3', { text: 'Where the numbers come from' }));
    box.appendChild(el('ul', { style: 'margin:0;padding-left:20px' }, [
      el('li', null, ['Rating and results: ', el('a', { href: D.ratings.source, rel: 'noopener', target: '_blank', text: 'MYHockey Rankings' }), ', refreshed every Wednesday.']),
      el('li', { text: 'Player stats: league and tournament score sheets.' }),
      el('li', { text: 'Goalie stats: the team goalie stat sheet.' }),
      el('li', { text: 'Video: Hudl.' })
    ]));
    box.appendChild(el('p', { cls: 'note', text: 'Players are listed by first name and last initial. ' + (D.site.disclaimer || '') }));
  }
})();
