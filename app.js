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

  Promise.all(['ratings', 'schedule', 'skaters', 'goalies', 'videos', 'site'].map(function (n) {
    return getJSON(n).catch(function () { return null; });
  })).then(function (all) {
    D.ratings = all[0]; D.schedule = all[1] || { games: [] }; D.skaters = all[2] || { players: [] };
    D.goalies = all[3] || { goalies: [] }; D.videos = all[4] || { videos: [] }; D.site = all[5] || {};
    if (!D.ratings) { $('home-last').textContent = 'Ratings data did not load. Try again in a minute.'; return; }
    D.max = D.ratings.team.max_gd || 7;
    D.all = R.gamesFor(D.ratings, { pending: true, cross: true });
    D.official = R.summarize(D.ratings.rated, D.max);
    D.next = (D.schedule.games || []).filter(function (g) { return g.date >= todayIso(); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0] || null;
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
          maps ? el('a', { cls: 'btn', href: maps, rel: 'noopener', target: '_blank', text: 'Directions' }) : null,
          el('a', { cls: 'btn outline', href: icsFor(g), download: 'bandits-' + g.date + '.ics', text: 'Add to calendar' })
        ])
      ]));
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
