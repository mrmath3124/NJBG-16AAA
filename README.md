# Bandits 16U parent site

A mobile-first page for NJ Bandits Girls 16U AAA families: the MYHockey rating and the math behind it, games, player and goalie stats, and Hudl links. Parent-run, not an official club site.

Live at `https://mrmath3124.github.io/NJBG-16AAA/` once GitHub Pages is on.

## How it updates

- **Ratings and results** refresh themselves. The `Update ratings` workflow runs every Wednesday at 9:30 am and 1:30 pm Eastern, reads the team's MYHockey pages and rewrites `data/ratings.json`. If MYHockey changes its pages and the numbers stop adding up, the workflow leaves last week's data in place and opens an issue, which GitHub emails to you.
- To refresh by hand: **Actions** tab, **Update ratings**, **Run workflow**.
- **Game notes** build themselves. The `Update game notes` workflow runs every morning and whenever `schedule.json` changes. It reads MYHockey for every opponent in the next two weeks (and always the next game) and rewrites `data/opponents.json`, so the Game notes button shows up next to Directions as soon as a new team is up next. It finds each team through `data/opponent_ids.json`; a name it has not seen is looked up on MYHockey and added. If it can't find a team, it opens an issue. To refresh by hand: **Actions**, **Update game notes**, **Run workflow**.

## What you edit by hand

All in the `data` folder. On GitHub, open the file, click the pencil, edit, then **Commit changes**. The site updates in about a minute.

| File | What goes in it |
| --- | --- |
| `schedule.json` | Upcoming games: `date` (YYYY-MM-DD), `time`, `opponent`, `rink`, `town`, `arrive`, and `opp_rating` if you know it |
| `goalies.json` | Each goalie: `name` (First L.), `number`, and a `games` list, one line per game: `date`, `opp` (the MYHockey team name), `score` (the final, us first, e.g. `"2-3"`), `sa` (shots she faced), `ga` (actual goals while she was in net), and `"full": true` if she played the whole game. The site works out the season line, the opponent-strength table and the game log from this list. A goalie without a `games` list can use season totals instead: `gp`, `sa`, `ga`, `full_games` |
| `skaters.json` | Skater lines: `name` (First L.), `number`, `gp`, `g`, `a`, `pim`, and `hudl` (a link, optional) |
| `videos.json` | Hudl links: `game_date`, `opponent`, `label`, `url`, and `player` (optional) |
| `site.json` | Announcement, rinks, disclaimer |
| `opponent_ids.json` | MYHockey team id for each opponent name in `schedule.json` (the number in the team's MYHockey address). Fix a wrong match here |
| `opponents.json` | Written by the Game notes workflow. You can type your own talking points into a team's `notes` list; they are kept |

Example `goalies.json` game line (a split game, so GAA counts it as half a game):

```json
{"date": "2026-11-07", "opp": "Connecticut Jr Rangers 16U", "score": "2-3", "sa": 13, "ga": 1}
```

The opponent-strength table groups each goalie's games by the opponent's MYHockey rating compared with ours: tougher (1.00 or more above), even, and easier (1.00 or more below). It matches each game to MYHockey by date and final score, so a game shows up there once MYHockey has rated it.

Example `schedule.json` row:

```json
{"date": "2026-11-07", "time": "10:15 am", "opponent": "Princeton Tiger Lilies", "rink": "[RINK]", "town": "[TOWN]", "arrive": "9:30 am", "opp_rating": 87.0}
```

## Privacy

Players appear as first name and last initial, as on the club site. No birthdates, schools or hometowns. The site asks search engines not to list it (`robots.txt` and a `noindex` tag), but anyone with the link can open it.

## Files

- `index.html`, `assets/` — the page (Bandits Hockey Design System, dark theme)
- `assets/js/rating.js` — the rating math, shared with the tests
- `scripts/update_ratings.py` — the weekly MYHockey reader
- `scripts/update_opponents.py` — the daily Game notes reader for upcoming opponents
- `tests/` — parser and math tests (`python tests/test_parse.py`, `python tests/test_opponents.py`, `node tests/test_rating.js`)
