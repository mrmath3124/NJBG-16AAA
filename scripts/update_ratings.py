"""Weekly MYHockey Rankings update for the Bandits 16U parent site.

Loads the team's MYHockey pages in a headless browser, reads the rating, rankings,
Rating Math table and game list, looks up the current rating of each opponent in a
game MYHockey has not rated yet, and writes data/ratings.json.

It refuses to write if the numbers do not check out (see validate()), so a site
change on MYHockey leaves last week's data in place and the workflow reports a
failure instead of publishing nonsense.

Run:  python scripts/update_ratings.py            (live)
      python scripts/update_ratings.py --dry-run  (print, do not write)
"""
import json
import re
import sys
import time
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ratings.json"
CONFIG = {"team_id": 32514, "season": 2026, "age": "16U"}
BASE = "https://myhockeyrankings.com"
USER_AGENT = "Bandits16U-ParentSite/1.0 (weekly, parent-run; one visit per week)"

MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
DATE_RE = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2})$")
TIME_RE = re.compile(r"^(\d{1,2}:\d{2} ?[ap]m|Add Time)$", re.I)
SCORE_RE = re.compile(r"^(\d+) - (\d+)$")
NOTE_RE = re.compile(r"^(SO|OT|OT/SO)$")
MATH_RE = re.compile(
    r"^([A-Z][a-z]{2} \d{1,2})\s+(.+?)\s+([WLT])\s+(\d+)\s*-\s*(\d+)\s+(-?\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(-?\d+\.\d+)\s*$"
)


def iso_date(text, season):
    mon, day = DATE_RE.match(text.strip()).groups()
    m = MONTHS[mon]
    year = season if m >= 7 else season + 1
    return f"{year}-{m:02d}-{int(day):02d}"


def clean_name(name):
    return re.sub(r"\*+$", "", name).strip()


def parse_header(text):
    """Rating, record and rankings from the team page text."""
    out = {}
    m = re.search(r"\nRating\n(\d+\.\d+)\n", text)
    if m:
        out["rating"] = float(m.group(1))
    m = re.search(r"Record \(W-L-T\)\n(\d+-\d+-\d+)", text)
    if m:
        out["record"] = m.group(1)
    for rank, label in re.findall(r"\n(\d+)(?:st|nd|rd|th)\n(USA [^\n]+)", text):
        if "Tier 1" in label:
            out["rank_tier1"], out["tier1_label"] = int(rank), label.strip()
        elif label.strip().endswith("All"):
            out["rank_all"], out["all_label"] = int(rank), label.strip()
    m = re.search(r"maximum goal differential for any one game is (\d+)", text)
    if m:
        out["max_gd"] = int(m.group(1))
    return out


def parse_math(text, season):
    """Rows of the Rating Math table."""
    rows = []
    for line in text.splitlines():
        m = MATH_RE.match(line.strip())
        if not m:
            continue
        d, opp, res, gf, ga, gd, oppr, pts, pm = m.groups()
        rows.append({
            "date": iso_date(d, season), "opponent": clean_name(opp), "result": res,
            "gf": int(gf), "ga": int(ga), "opp_rating": float(oppr), "points": float(pts), "pm": float(pm),
        })
    total = re.search(r"Totals \((\d+) games\)", text)
    return rows, (int(total.group(1)) if total else None)


def parse_games(text, season):
    """Completed games from the Games tab, in page order."""
    start = text.find("Game Scores")
    end = text.find("* league game")
    lines = [l.strip() for l in text[start if start >= 0 else 0:end if end > 0 else None].splitlines() if l.strip()]
    games, i = [], 0
    while i < len(lines):
        if not DATE_RE.match(lines[i]):
            i += 1
            continue
        date = iso_date(lines[i], season)
        j = i + 1
        if j < len(lines) and TIME_RE.match(lines[j]):
            j += 1
        if j >= len(lines):
            break
        opponent = lines[j]
        j += 1
        while j < len(lines) and lines[j] not in ("W", "L", "T") and not DATE_RE.match(lines[j]):
            j += 1  # rink lines
        if j + 1 < len(lines) and lines[j] in ("W", "L", "T") and SCORE_RE.match(lines[j + 1]):
            result = lines[j]
            gf, ga = map(int, SCORE_RE.match(lines[j + 1]).groups())
            k = j + 2
            note = ""
            if k < len(lines) and NOTE_RE.match(lines[k]):
                note = lines[k]
                k += 1
            games.append({"date": date, "opponent": clean_name(opponent), "result": result, "gf": gf, "ga": ga,
                          "note": note, "tournament": opponent.endswith("**"),
                          "league": opponent.endswith("*") and not opponent.endswith("**")})
            i = k
        else:
            i = j
    return games


def split_pending(games, rated):
    """Games on the Games tab that the Math tab does not include yet."""
    pool = {}
    for r in rated:
        key = (r["date"], r["opponent"], r["gf"], r["ga"])
        pool[key] = pool.get(key, 0) + 1
    pending, notes = [], {}
    for g in games:
        key = (g["date"], g["opponent"], g["gf"], g["ga"])
        if pool.get(key):
            pool[key] -= 1
            notes[key] = g["note"]
        else:
            pending.append(g)
    return pending, notes


def is_cross_age(name, age):
    ages = re.findall(r"\b(?:U(\d{2})|(\d{2})U)\b", name)
    found = {a or b for a, b in ages}
    return bool(found) and age.rstrip("U") not in found


def validate(new, old):
    problems = []
    t = new["team"]
    if not (60 <= t.get("rating", 0) <= 100):
        problems.append(f"rating out of range: {t.get('rating')}")
    if not new["rated"]:
        problems.append("no rated games parsed")
    else:
        avg = sum(r["points"] for r in new["rated"]) / len(new["rated"])
        if abs(avg - t["rating"]) > 0.05:
            problems.append(f"average game points {avg:.3f} does not match rating {t['rating']:.2f}")
    if old and len(new["rated"]) < len(old.get("rated", [])) - 2:
        problems.append(f"rated games dropped from {len(old['rated'])} to {len(new['rated'])}")
    for g in new["pending"]:
        if g.get("opp_rating") is None:
            problems.append(f"no opponent rating for {g['opponent']} on {g['date']}")
    return problems


def fetch_live():
    from playwright.sync_api import sync_playwright

    team, season = CONFIG["team_id"], CONFIG["season"]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(user_agent=USER_AGENT)

        def text_of(url, wait_for=None):
            # MYHockey loads the Games and Rating Math tables with a second request after
            # the page opens, and the first page of a fresh visit often comes back without
            # them. Wait for the table text, and reload (up to 4 tries) if it never shows up.
            for attempt in (1, 2, 3, 4):
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(1500)
                if not wait_for:
                    break
                try:
                    page.wait_for_function(
                        "t => document.body && document.body.innerText.includes(t)", arg=wait_for, timeout=30000
                    )
                    break
                except Exception:
                    print(f"warning: '{wait_for}' did not appear on {url} (try {attempt})", file=sys.stderr)
                    time.sleep(5)
            node = page.query_selector("main") or page.query_selector("body")
            return node.inner_text()

        # Math first: the first page of a visit does not always finish loading its
        # games list in a headless browser, but later pages do.
        math_text = text_of(f"{BASE}/team-info/{team}/{season}/math", wait_for="Totals (")
        time.sleep(2)
        games_text = text_of(f"{BASE}/team-info/{team}/{season}/games", wait_for="* league game")
        links = page.eval_on_selector_all(
            "a[href*='team-info'], a[href*='team_info']",
            "els => els.map(e => [e.textContent.trim(), e.getAttribute('href')])",
        )
        header = parse_header(games_text)
        rated, total = parse_math(math_text, season)
        games = parse_games(games_text, season)
        pending, notes = split_pending(games, rated)

        href_by_name = {}
        for name, href in links:
            href_by_name.setdefault(clean_name(name), href)
        for g in pending:
            href = href_by_name.get(g["opponent"])
            g["opp_rating"] = None
            if href:
                time.sleep(2)
                t = text_of(href if href.startswith("http") else BASE + href)
                m = re.search(r"\nRating\n(\d+\.\d+)\n", t)
                g["opp_rating"] = float(m.group(1)) if m else None
        browser.close()
    return header, rated, total, games, pending, notes


def build(header, rated, pending, notes, old):
    team = dict(old.get("team", {})) if old else {}
    team.update(header)
    team.setdefault("name", "New Jersey Bandits 16U")
    team.setdefault("max_gd", 7)
    for r in rated:
        r["note"] = notes.get((r["date"], r["opponent"], r["gf"], r["ga"]), "")
    pend = [{
        "date": g["date"], "opponent": g["opponent"], "result": g["result"], "gf": g["gf"], "ga": g["ga"],
        "note": g["note"], "opp_rating": g.get("opp_rating"), "cross_age": is_cross_age(g["opponent"], CONFIG["age"]),
    } for g in pending]
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
    return {
        "updated": today, "season": CONFIG["season"], "team_id": CONFIG["team_id"],
        "source": f"{BASE}/team_info.php?y={CONFIG['season']}&t={CONFIG['team_id']}",
        "team": team, "rated": rated, "pending": pend,
    }


def same_data(a, b):
    strip = lambda d: {k: v for k, v in d.items() if k != "updated"}
    return strip(a) == strip(b)


def main():
    dry = "--dry-run" in sys.argv
    old = json.loads(OUT.read_text()) if OUT.exists() else None
    header, rated, total, games, pending, notes = fetch_live()
    if total is not None and total != len(rated):
        print(f"warning: Math tab says {total} games, parsed {len(rated)}", file=sys.stderr)
    new = build(header, rated, pending, notes, old)
    problems = validate(new, old)
    if problems:
        print("Not writing ratings.json:\n- " + "\n- ".join(problems), file=sys.stderr)
        sys.exit(1)
    if old and same_data(new, old):
        print("No change since the last update.")
        return
    if dry:
        print(json.dumps(new, indent=1))
        return
    OUT.write_text(json.dumps(new, indent=1) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: rating {new['team']['rating']}, {len(rated)} rated, {len(pending)} not yet rated.")


if __name__ == "__main__":
    main()
