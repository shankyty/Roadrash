"""Pin the takes picked on the audition page (audition.html, "Show my picks") in web/drivers.js.

  .venv/bin/python apply_picks.py picks.json
  .venv/bin/python make_voices.py --rivals <the drivers it lists>

A pick "deep-s77" becomes that curse's `seed` (77) and, where "deep" isn't the driver's usual voice, its own
`describe`. "current" and "none" leave the curse as it is. A pinned curse is made as that one take, so the
clip the game gets is the one that was heard.
"""
import json, os, re, sys
from audition import describe

DRIVERS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web", "drivers.js")
picks = json.load(open(sys.argv[1], encoding="utf8"))
src = open(DRIVERS, encoding="utf8").read()
blocks = re.split(r'(?=\n  \{\n    "id": ")', src)
changed = []
for i, b in enumerate(blocks[1:], 1):
    did = re.search(r'"id": "([a-z]+)"', b).group(1)
    voice = json.loads(re.search(r'"voice": (\{[^}]*\})', b).group(1))

    def curse(m):
        c = json.loads(m.group(0))
        pick = picks.get(f"{did}|{c['text']}", "current")
        if pick in ("current", "none"):
            return m.group(0)
        kind, seed = pick.rsplit("-s", 1)
        c.pop("describe", None)
        if describe(kind) != voice["describe"]:
            c["describe"] = describe(kind)
        c["seed"] = int(seed)
        if did not in changed:
            changed.append(did)
        return "{ " + json.dumps(c, ensure_ascii=False)[1:-1] + " }"
    blocks[i] = re.sub(r'\{ "text": [^\n]*?\}(?=,?\n)', curse, b)
open(DRIVERS, "w", encoding="utf8").write("".join(blocks))
print("pinned picks for:", ",".join(changed) or "nobody")
