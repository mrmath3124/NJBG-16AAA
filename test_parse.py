"""Parser tests against text captured from the team's MYHockey pages on Oct 13, 2026."""
import sys
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "scripts"))
import update_ratings as u

games_text = (HERE / "fixtures/games.txt").read_text()
math_text = (HERE / "fixtures/math.txt").read_text()

h = u.parse_header("\n" + games_text)
assert h["rating"] == 88.10 and h["record"] == "7-7-0", h
assert h["rank_tier1"] == 45 and h["rank_all"] == 65, h

rated, total = u.parse_math(math_text, 2026)
assert total == 14 and len(rated) == 14, (total, len(rated))
assert rated[0] == {"date": "2026-08-28", "opponent": "Boston Advantage (Blue) 16U", "result": "W", "gf": 2, "ga": 1,
                    "opp_rating": 88.2, "points": 89.2, "pm": 1.1}, rated[0]
assert u.parse_header(math_text).get("max_gd") == 7

games = u.parse_games(games_text, 2026)
assert len(games) == 20, len(games)
assert games[0]["note"] == "SO" and games[0]["tournament"]
assert games[1]["league"] and not games[1]["tournament"]
nh = [g for g in games if g["date"] == "2026-10-11" and "Mountain" in g["opponent"]][0]
assert nh["note"] == "OT/SO" and nh["result"] == "W" and (nh["gf"], nh["ga"]) == (2, 1), nh

pending, notes = u.split_pending(games, rated)
assert [g["date"] for g in pending] == ["2026-10-04", "2026-10-10", "2026-10-10", "2026-10-11", "2026-10-11", "2026-10-12"], pending
assert notes[("2026-08-28", "Boston Advantage (Blue) 16U", 2, 1)] == "SO"

assert u.is_cross_age("Ontario Hockey Academy Maroon (#7094) U18 AA", "16U")
assert not u.is_cross_age("Team Long Island 16U", "16U")
assert not u.is_cross_age("Stateline Hawks", "16U")

for g in pending: g["opp_rating"] = 87.0
new = u.build({**h, "max_gd": 7}, rated, pending, notes, None)
assert u.validate(new, None) == [], u.validate(new, None)
bad = dict(new, team=dict(new["team"], rating=91.0))
assert u.validate(bad, None), "should flag mismatch"
print("parser tests passed")
