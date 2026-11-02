"""Game notes data for upcoming opponents, from MYHockey Rankings.

Reads data/schedule.json, takes every opponent the Bandits play in the next
WINDOW_DAYS days (and always the very next game's opponent), reads that team's
MYHockey Games page and writes data/opponents.json. The site shows a Game notes
button on the Next game card whenever opponents.json has an entry for that
opponent.

Finding the MYHockey team:
- data/opponent_ids.json maps the name used in schedule.json to a MYHockey team
  id. Edit it by hand if a guess is wrong (the id is the number in the team's
  MYHockey address, e.g. myhockeyrankings.com/team-info/21973/...).
- A name that is not in the file is looked up with MYHockey's search (girls 16U
  teams only) and, if one team clearly matches, added to the file.

Talking points you type into a team's "notes" list in opponents.json are kept.
Teams that are no longer coming up are dropped unless they have notes.

Run:  python scripts/update_opponents.py            (live)
      python scripts/update_opponents.py --dry-run  (print, do not write)
"""
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_ratings as ur  # noqa: E402  (shared MYHockey page parsers)

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE = ROOT / "data" / "schedule.json"
OUT = ROOT / "data" / "opponents.json"
IDS = ROOT / "data" / "opponent_ids.json"
SEASON = ur.CONFIG["season"]
WINDOW_DAYS = 14
BASE = ur.BASE
USER_AGENT = "Bandits16U-ParentSite/1.0 (daily, parent-run; a few team pages per day)"
NOTE = ("Scouting data for upcoming opponents, keyed by the opponent name used in schedule.json. "
        "Written by scripts/update_opponents.py. games rows: [date, opponent, goals for, goals against, OT/SO note]. "
        "Add your own talking points to notes; they are kept.")

# Abbreviations used on the club schedule, expanded to MYHockey's wording.
EXPAND = {"junior": ["jr"], "jr.": ["jr"], "ct": ["connecticut"], "conn": ["connecticut"], "nj": ["new", "jersey"],
          "ny": ["new", "york"], "pa": ["pennsylvania"], "ma": ["massachusetts"], "li": ["long", "island"],
          "mass": ["massachusetts"], "st": ["st"], "saint": ["st"]}
IGNORE = {"16u", "u16", "tier1", "tier2", "tier", "1", "2", "girls", "the", "aaa", "aa", "hockey"}


# ---------- dates and targets ----------

def today_eastern():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date()


def targets(schedule, today, window=WINDOW_DAYS):
    """Opponent names to scout, in game order: everyone in the window, plus the next game."""
    t0, t1 = today.isoformat(), (today + dt.timedelta(days=window)).isoformat()
    games = sorted((g for g in schedule.get("games", []) if g.get("date", "") >= t0 and g.get("opponent")),
                   key=lambda g: g["date"])
    out = []
    for i, g in enumerate(games):
        if (i == 0 or g["date"] <= t1) and g["opponent"] not in out:
            out.append(g["opponent"])
    return out


# ---------- matching a schedule name to a MYHockey team ----------

def words(name):
    s = re.sub(r"[()\[\],']", " ", name)
    return [w for w in s.replace(".", " ").split() if w]


def tokens(name):
    out = []
    for w in words(name):
        lw = w.lower()
        out.extend(EXPAND.get(lw, [lw]))
    return out


def initials_match(abbr, cand):
    """'bk' matches two consecutive words 'bishop kearney'."""
    n = len(abbr)
    return any("".join(w[0] for w in cand[i:i + n]) == abbr for i in range(len(cand) - n + 1))


def score(sched_name, cand_name):
    """(all words matched, extra words, prefers Tier1) for ranking candidates."""
    want = [t for t in tokens(sched_name) if t not in IGNORE]
    have = [t for t in tokens(cand_name) if t not in IGNORE]
    abbrs = {w.lower() for w in words(sched_name) if w.isupper() and 2 <= len(w) <= 3 and w.lower() not in EXPAND}
    hit = 0
    used = set()
    for t in want:
        if t in have:
            hit += 1
            used.add(t)
        elif t in abbrs and initials_match(t, have):
            hit += 1
            i = next(i for i in range(len(have)) if "".join(w[0] for w in have[i:i + len(t)]) == t)
            used.update(have[i:i + len(t)])
    extra = len([t for t in have if t not in used])
    low = cand_name.lower()
    tier = 0 if "tier1" in low.replace(" ", "") else (2 if "tier2" in low.replace(" ", "") else 1)
    return hit == len(want) and hit > 0, extra, tier


def is_girls_16u(c):
    name = c.get("name", "")
    return (c.get("kind") == "team" and c.get("level_desc") == "girls_midget"
            and re.search(r"\b(16U|U16)\b", name) is not None and not re.search(r"\bHS\b", name))


def pick(sched_name, candidates):
    """Best girls 16U team for a schedule name, or None if nothing matches every word."""
    ranked = []
    for c in candidates:
        if not is_girls_16u(c):
            continue
        ok, extra, tier = score(sched_name, c["name"])
        if ok:
            ranked.append((extra, tier, c["name"], c))
    ranked.sort(key=lambda r: r[:3])
    return ranked[0][3] if ranked else None


def expand_word(w):
    lw = w.lower()
    return " ".join(x.capitalize() for x in EXPAND[lw]) if lw in EXPAND else w


def queries(sched_name):
    """Search strings to try, most specific first."""
    w = words(sched_name)
    expanded = " ".join(expand_word(x) for x in w)
    out = [sched_name, expanded]
    long_words = sorted({x for x in w if len(x) >= 5 and x.lower() not in IGNORE and x.lower() not in EXPAND}, key=lambda x: (-len(x), x))
    out += long_words
    seen, uniq = set(), []
    for q in out:
        if q and q.lower() not in seen:
            seen.add(q.lower())
            uniq.append(q)
    return uniq


# ---------- reading an opponent's Games page ----------

TOTALS_RE = re.compile(r"All Games \(W-L-T\):\s*(\d+-\d+-\d+)\.\s*GF=(\d+)\s*GA=(\d+)")


def team_entry(text, team_id, old=None):
    """opponents.json entry from the text of a team's MYHockey Games page."""
    h = ur.parse_header("\n" + text)
    m = re.search(r"\nTeam\n([^\n]+)\n", "\n" + text)
    games = ur.parse_games(text, SEASON)
    rows = [[g["date"], g["opponent"], g["gf"], g["ga"], g["note"]] for g in games]
    w = sum(g["gf"] > g["ga"] for g in games)
    l = sum(g["gf"] < g["ga"] for g in games)
    t = len(games) - w - l
    record, gf, ga = f"{w}-{l}-{t}", sum(g["gf"] for g in games), sum(g["ga"] for g in games)
    tot = TOTALS_RE.search(text)
    if tot and tot.group(1) == record:
        gf, ga = int(tot.group(2)), int(tot.group(3))
    ranks = [f"{r}{'th' if 10 < int(r) % 100 < 14 else {1: 'st', 2: 'nd', 3: 'rd'}.get(int(r) % 10, 'th')} {label.strip()}"
             for r, label in re.findall(r"\n(\d+)(?:st|nd|rd|th)\n(USA [^\n]+)", "\n" + text)]
    return {
        "myhr_name": m.group(1).strip() if m else "",
        "team_id": team_id,
        "rating": h.get("rating"),
        "record": record,
        "gf": gf,
        "ga": ga,
        "ranks": ranks,
        "notes": list((old or {}).get("notes", [])),
        "games": rows,
    }


def check_entry(e):
    problems = []
    if not e["myhr_name"]:
        problems.append("team name not found on the page")
    if not e["rating"] or not (50 <= e["rating"] <= 100):
        problems.append(f"rating missing or out of range ({e['rating']})")
    if not e["games"]:
        problems.append("no completed games found")
    return problems


# ---------- writing ----------

def dumps(data):
    """JSON with one game per line, so the file stays easy to read and edit by hand."""
    text = json.dumps(data, indent=1, ensure_ascii=False)
    return re.sub(r"\[\n\s+(\"\d{4}-\d{2}-\d{2}\"),\n\s+(\".*?\"),\n\s+(\d+),\n\s+(\d+),\n\s+(\".*?\")\n\s+\]",
                  r"[\1, \2, \3, \4, \5]", text) + "\n"


def merge(old_teams, fresh, wanted):
    """New teams dict: fresh entries, old entries we could not refresh, and old ones with notes."""
    teams = {}
    for name in wanted:
        if name in fresh:
            teams[name] = fresh[name]
        elif name in old_teams:
            teams[name] = old_teams[name]
    for name, e in old_teams.items():
        if name not in teams and e.get("notes"):
            teams[name] = e
    return teams


# ---------- live fetch ----------

def fetch_live(names, ids):
    from playwright.sync_api import sync_playwright

    pages, found, problems = {}, {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def fresh():
            ctx = browser.new_context(user_agent=USER_AGENT)
            return ctx, ctx.new_page()

        def search(q):
            ctx, page = fresh()
            try:
                page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
                return page.evaluate(
                    "q => fetch('/services/search/?q=' + encodeURIComponent(q)).then(r => r.json())", q) or []
            finally:
                ctx.close()

        def games_text(team_id):
            url = f"{BASE}/team-info/{team_id}/{SEASON}/games"
            ctx, page = fresh()
            try:
                for attempt in (1, 2, 3, 4):
                    page.goto(url, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(1500)
                    try:
                        page.wait_for_function(
                            "t => document.body && document.body.innerText.includes(t)", arg="* league game", timeout=30000)
                        break
                    except Exception:
                        print(f"warning: games table did not load for {team_id} (try {attempt})", file=sys.stderr)
                        time.sleep(5)
                node = page.query_selector("main") or page.query_selector("body")
                return node.inner_text()
            finally:
                ctx.close()

        for name in names:
            team_id = ids.get(name)
            if not team_id:
                for q in queries(name):
                    time.sleep(2)
                    try:
                        c = pick(name, search(q))
                    except Exception as exc:  # search is a convenience; keep going
                        print(f"warning: search for '{q}' failed: {exc}", file=sys.stderr)
                        c = None
                    if c:
                        team_id = int(c["nbr"])
                        found[name] = (team_id, c["name"])
                        print(f"Matched '{name}' to MYHockey team {team_id} ({c['name']}).")
                        break
            if not team_id:
                problems.append(f"{name}: no MYHockey girls 16U team found. Add its id to data/opponent_ids.json.")
                continue
            time.sleep(3)
            pages[name] = (team_id, games_text(team_id))
        browser.close()
    return pages, found, problems


def main():
    dry = "--dry-run" in sys.argv
    schedule = json.loads(SCHEDULE.read_text())
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    old_teams = old.get("teams", {})
    id_file = json.loads(IDS.read_text()) if IDS.exists() else {"teams": {}}
    ids = {k: int(v) for k, v in id_file.get("teams", {}).items()}

    names = targets(schedule, today_eastern())
    print("Upcoming opponents: " + (", ".join(names) or "none"))
    pages, found, problems = fetch_live(names, ids) if names else ({}, {}, [])

    fresh = {}
    for name, (team_id, text) in pages.items():
        e = team_entry(text, team_id, old_teams.get(name))
        bad = check_entry(e)
        if bad:
            problems.append(f"{name} (MYHockey team {team_id}): " + "; ".join(bad) + ". Kept the previous notes data.")
            continue
        fresh[name] = e
        print(f"{name}: {e['myhr_name']}, rating {e['rating']}, {e['record']}, {len(e['games'])} games.")

    new = {"updated": today_eastern().isoformat(), "source": "MYHockey Rankings team pages", "note": NOTE,
           "teams": merge(old_teams, fresh, names)}
    for name, (team_id, _) in found.items():
        if name in fresh:
            id_file.setdefault("teams", {})[name] = team_id

    if dry:
        print(dumps(new))
    else:
        changed = {k: v for k, v in new.items() if k != "updated"} != {k: v for k, v in old.items() if k != "updated"}
        if changed:
            OUT.write_text(dumps(new))
            print(f"Wrote {OUT.relative_to(ROOT)}: {', '.join(new['teams']) or 'no teams'}.")
        else:
            print("Game notes data unchanged.")
        if found:
            IDS.write_text(json.dumps(id_file, indent=1, ensure_ascii=False) + "\n")

    if problems:
        print("Problems:\n- " + "\n- ".join(problems), file=sys.stderr)
        out = os.environ.get("GITHUB_OUTPUT")
        if out:
            with open(out, "a") as f:
                f.write("problems<<EOF\n" + "\n".join("- " + p for p in problems) + "\nEOF\n")


if __name__ == "__main__":
    main()
