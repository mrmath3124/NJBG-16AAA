# Bandits 16U parent site

A mobile-first page for NJ Bandits Girls 16U AAA families: the MYHockey rating and the math behind it, games, player and goalie stats, and Hudl links. Parent-run, not an official club site.

Live at `https://mrmath3124.github.io/NJBG-16AAA/` once GitHub Pages is on.

## How it updates

- **Ratings and results** refresh themselves. The `Update ratings` workflow runs every Wednesday at 9:30 am and 1:30 pm Eastern, reads the team's MYHockey pages and rewrites `data/ratings.json`. If MYHockey changes its pages and the numbers stop adding up, the workflow leaves last week's data in place and opens an issue, which GitHub emails to you.
- To refresh by hand: **Actions** tab, **Update ratings**, **Run workflow**.

## What you edit by hand

All in the `data` folder. On GitHub, open the file, click the pencil, edit, then **Commit changes**. The site updates in about a minute.

| File | What goes in it |
| --- | --- |
| `schedule.json` | Upcoming games: `date` (YYYY-MM-DD), `time`, `opponent`, `rink`, `town`, `arrive`, and `opp_rating` if you know it |
| `goalies.json` | Goalie lines: `name` (First L.), `number`, `gp`, `sa`, `ga`, and `full_games` (full-game equivalents, for split games) |
| `skaters.json` | Skater lines: `name` (First L.), `number`, `gp`, `g`, `a`, `pim`, and `hudl` (a link, optional) |
| `videos.json` | Hudl links: `game_date`, `opponent`, `label`, `url`, and `player` (optional) |
| `site.json` | Announcement, rinks, disclaimer |

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
- `tests/` — parser and math tests (`python tests/test_parse.py`, `node tests/test_rating.js`)
