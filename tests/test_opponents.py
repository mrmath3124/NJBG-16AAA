"""Tests for the Game notes updater, using text and search results captured from MYHockey on Nov 2, 2026."""
import datetime as dt
import json
import sys
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "scripts"))
import update_opponents as o

# --- which opponents get notes ---
sched = {"games": [
    {"date": "2026-10-31", "opponent": "Philadelphia Jr Flyers"},
    {"date": "2026-11-06", "opponent": "BK Selects"},
    {"date": "2026-11-06", "opponent": "Rochester Jr. Americans"},
    {"date": "2026-11-07", "opponent": "CT Junior Rangers"},
    {"date": "2026-11-14", "opponent": "Stateline Hawks"},
    {"date": "2026-11-15", "opponent": "Skaneateles"},
    {"date": "2026-11-22", "opponent": "Princeton Tiger Lilies"},
]}
assert o.targets(sched, dt.date(2026, 11, 2)) == ["BK Selects", "Rochester Jr. Americans", "CT Junior Rangers",
                                                  "Stateline Hawks", "Skaneateles"], o.targets(sched, dt.date(2026, 11, 2))
assert o.targets(sched, dt.date(2026, 11, 6), window=0) == ["BK Selects", "Rochester Jr. Americans"]
# The next game counts even when it is weeks away.
assert o.targets(sched, dt.date(2026, 11, 16), window=3) == ["Princeton Tiger Lilies"]
assert o.targets(sched, dt.date(2026, 12, 1)) == []

# --- matching schedule names to MYHockey search results ---
def team(nbr, name, level="girls_midget"):
    return {"kind": "team", "nbr": nbr, "name": name, "level_desc": level}

selects = [team(21973, "Bishop Kearney Selects 16U"), team(27446, "Bishop Kearney Selects 16U AAA", "Midget"),
           team(22926, "Bishop Kearney Selects 19U"), team(31437, "Fore River Selects 14U", "girls_bantam"),
           team(13523, "New Hampshire Selects 16U A", "Midget"), {"kind": "association", "nbr": 1, "name": "Bishop Kearney Selects"}]
americans = [team(32725, "Boston Americans (Tier1) 16U"), team(32293, "Rochester Jr Americans (Renelt) 16U AA", "Midget"),
             team(32295, "Rochester Jr Americans (Tier1) 16U"), team(34029, "Rochester Jr Americans (Tier2) 16U")]
rangers = [team(35959, "Connecticut Jr Rangers 16U"), team(34816, "Connecticut Jr Rangers 19U")]
princeton = [team(11689, "Princeton Girls HS"), team(37540, "Princeton Tiger Lilies (Black) 19U"),
             team(9805, "Princeton Tiger Lilies (Tier1) 16U"), team(34452, "Princeton Tiger Lilies (Tier2) 16U")]
colonials = [team(10801, "New Jersey Colonials (Tier1) 16U"), team(29990, "New Jersey Colonials (Tier2) 16U"),
             team(14316, "New Jersey Colonials (Tier1) 19U")]
skan = [team(16109, "Skaneateles HS"), team(26373, "Skaneateles Lakers 16U")]
flyers = [team(9363, "Philadelphia Jr Flyers (Black) 16U"), team(24455, "Philadelphia Jr Flyers (Tier1) 16U")]

assert o.pick("BK Selects", selects)["nbr"] == 21973
assert o.pick("Rochester Jr. Americans", americans)["nbr"] == 32295
assert o.pick("CT Junior Rangers", rangers)["nbr"] == 35959
assert o.pick("Princeton Tiger Lilies", princeton)["nbr"] == 9805
assert o.pick("NJ Colonials", colonials)["nbr"] == 10801
assert o.pick("Skaneateles", skan)["nbr"] == 26373
assert o.pick("Philadelphia Jr Flyers", flyers)["nbr"] == 24455
assert o.pick("Stateline Hawks", selects) is None
assert o.pick("Rochester Jr. Americans", [team(30015, "Rochester Edge 19U")]) is None

assert o.queries("CT Junior Rangers") == ["CT Junior Rangers", "Connecticut Jr Rangers", "Rangers"], o.queries("CT Junior Rangers")
assert o.queries("BK Selects")[-1] == "Selects"

# --- reading an opponent's Games page ---
text = (HERE / "fixtures/opponent_games.txt").read_text()
e = o.team_entry(text, 21973, {"notes": ["Big, fast forwards."], "games": []})
assert o.check_entry(e) == [], o.check_entry(e)
assert e["myhr_name"] == "Bishop Kearney Selects 16U" and e["team_id"] == 21973 and e["rating"] == 94.97, e
assert e["ranks"] == ["5th USA Girls 16U Tier 1", "5th USA Girls 16U All"], e["ranks"]
assert e["record"] == "7-2-0" and (e["gf"], e["ga"]) == (42, 10), e
assert len(e["games"]) == 9, len(e["games"])  # the two Preview games are not played yet
assert e["games"][0] == ["2026-09-04", "Windy City Storm 16U", 6, 0, ""], e["games"][0]
assert e["games"][2] == ["2026-09-05", "Calgary Fire (Black) U18 AAA", 2, 1, "SO"], e["games"][2]
assert e["games"][3][4] == "OT/SO" and e["games"][-1] == ["2026-11-01", "Chicago Mission 16U", 1, 2, ""], e["games"]
assert e["notes"] == ["Big, fast forwards."]
assert o.check_entry(dict(e, rating=None, games=[]))

# --- the file keeps hand-written notes and stays readable ---
old = {"Philadelphia Jr Flyers": {"notes": []}, "Princeton Tiger Lilies": {"notes": ["Keep it simple."]},
       "CT Junior Rangers": {"notes": [], "rating": 80.0}}
teams = o.merge(old, {"BK Selects": e}, ["BK Selects", "CT Junior Rangers"])
assert list(teams) == ["BK Selects", "CT Junior Rangers", "Princeton Tiger Lilies"], list(teams)
assert teams["CT Junior Rangers"]["rating"] == 80.0  # kept when a refresh fails

out = o.dumps({"teams": {"BK Selects": e}})
assert '["2026-09-05", "Calgary Fire (Black) U18 AAA", 2, 1, "SO"]' in out, out
assert json.loads(out)["teams"]["BK Selects"] == e

# The live opponents.json and id map must parse and point at real schedule names.
live = json.loads((HERE.parent / "data/opponents.json").read_text())
ids = json.loads((HERE.parent / "data/opponent_ids.json").read_text())["teams"]
names = {g["opponent"] for g in json.loads((HERE.parent / "data/schedule.json").read_text())["games"]}
assert set(ids) <= names | set(live["teams"]), set(ids) - names
print("opponent tests passed")
