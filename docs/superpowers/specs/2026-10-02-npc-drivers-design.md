# NPC drivers: a config-driven cast with city looks, voices and driving styles

Date: 2026-10-02. Target: the web game (`web/`, v3.3.4 on main). The Unreal fork is out of scope; the
config is plain JSON so the fork can read it later.

## Problem

Rival autos are anonymous. `web/game.js` hardcodes ten names (`RIVAL_NAMES`) and seven palettes
(`RIVAL_COLORS`), shuffles them, and rolls each rival's driving numbers at random per race. Every rival
curses in the slang of the track's city, and all curse audio comes from two TTS voices (one Hindi, one
Tamil, Meta MMS) varied only by playback pitch, so they sound robotic and alike.

## Goal

A fixed cast of eleven drivers, one per city, defined entirely in one config file. Each driver has a
name and personality, an auto that looks like the autos of their city, a voice of their own that curses
in their own language, and a driving style of their own.

## The config: `web/drivers.js`

`window.RRR_DRIVERS = [ ... ];` where the array is strict JSON (double quotes, no comments, no trailing
commas), so `tools/voices/make_voices.py` and later the Unreal fork can parse it by taking the text
between the first `[` and the last `]`. Loaded by a `<script>` tag before `game.js`, like `voices.js`.

One entry per driver:

```json
{
  "id": "jassi",
  "name": "JASSI",
  "city": "chandigarh",
  "cityName": "CHANDIGARH",
  "tag": "Flat out on the straights, and his lathi lands like a tractor",
  "look": {
    "body": "#1e8e3e", "trim": "#ff8f00", "canopy": "#f5c400",
    "plate": "CH 01 TA", "slogan": "CHAK DE PHATTE",
    "shirt": "#f5f5f5", "headgear": "turban", "headgearColor": "#e65100"
  },
  "voice": { "lang": "pan", "speaker": "Gurpreet", "describe": "a loud, deep, hearty man shouting angrily, fast", "rate": 1.0 },
  "curses": [ { "text": "OYE KHOTEYA!", "say": "ਓਏ ਖੋਤਿਆ!" } ],
  "style": {
    "pace": 0.02, "bends": 0.30, "aggression": 1.0, "power": 1.3, "chase": 900,
    "weave": [4, 8], "nerve": 0.5, "launch": [0.1, 0.3], "grudge": 1.0
  }
}
```

`headgear` is one of `none`, `turban`, `safa`, `cap`. Each driver has five curses: `text` is the bubble
(Latin capitals, as today), `say` is what the voice speaks in native script.

### Style numbers

Each replaces a value that is random or constant in `updateRivals` / `setupRace` today. The track's
`skill` and the difficulty still scale everything; a style only moves a driver around that baseline.

| Field | Meaning | Today | Range |
|---|---|---|---|
| `pace` | added to the top-speed factor (`track.skill * diff + pace ± 0.01`, clamped 0.7 to 1.02) | random −0.06 to +0.02 | −0.06 to +0.02 |
| `bends` | how much speed is lost in a full curve | 0.22 | 0.12 to 0.32 |
| `aggression` | swing rate (divides the lathi cooldown) | random 0.6 to 1.2 | 0.4 to 1.3 |
| `power` | multiplies the damage of their hits | 1 | 0.8 to 1.3 |
| `chase` | distance (track units) within which they come at you to fight | 900 | 500 to 1300 |
| `weave` | seconds between lane changes, [min, max] | [3, 8] | [1.5, 4] to [6, 12] |
| `nerve` | 0 to 1: side gap left when passing traffic (0.22 down to 0.10) and how late they brake behind it | gap 0.16 | 0 to 1 |
| `launch` | reaction time at the start, [min, max] seconds | [0.05, 0.5] | within 0.05 to 0.6 |
| `grudge` | aggression multiplier for 10 s after you hit them | 1 | 1 to 2.5 |

Balance rule: the cast's mean `pace` stays at −0.02 (today's mean), and no driver is best at everything.

## The cast

| City | Driver | Curses in | Style in one line |
|---|---|---|---|
| Mumbai | Ganpat | Bambaiya Hindi | Weaves through traffic with tight gaps, changes lanes often |
| Delhi | Bunty | Delhi Hindi | Bully: hunts you from far, swings often, fast on straights, sloppy in bends |
| Hyderabad | Saleem | Dakhni | Slow off the line and relaxed, but holds a grudge and hits hard |
| Chennai | Murugan | Tamil | Fearless: brakes late, high pace, rarely fights |
| Kolkata | Bablu-da | Bengali | Steady and defensive, holds his lane, seldom swings |
| Chandigarh | Jassi (the Sardar) | Punjabi | Fastest on straights, heaviest lathi, slow in bends |
| Guwahati | Jintu | Assamese | Hill driver: quickest through bends, calm |
| Jaipur | Banwari | Marwari-flavoured Hindi | Showy and erratic, sudden lane changes |
| Bengaluru | Manju | Kannada | Patient and consistent, quick start, brakes early for traffic |
| Lucknow | Nawab | Lakhnavi Urdu | "Pehle aap": never swings first, polite even when cursing, strong grudge once hit |
| Patna | Lallan | Bhojpuri-flavoured Hindi | Brawler: never backs off in traffic, swings a lot, average pace |

Curses stay as mild as today's (street slang, no real abuse). Characters are affectionate, not mocking.

### Looks

Each auto carries its city's familiar livery, its state's plate and a local slogan on the rear in place
of HORN OK PLEASE. Several cities share green and yellow in real life, so those differ by trim colour,
slogan and the driver figure.

| Driver | Body / trim / hood | Plate | Driver figure |
|---|---|---|---|
| Ganpat | black / yellow / yellow | MH 02 | white shirt, Gandhi cap |
| Bunty | green / yellow / yellow | DL 1R | bright shirt, no headgear |
| Saleem | yellow / black / black | TS 09 | kurta, skull cap |
| Murugan | yellow / black / yellow | TN 09 | khaki shirt, no headgear |
| Bablu-da | green / yellow band / black | WB 04 | white kurta, no headgear |
| Jassi | green / orange / yellow | CH 01 | turban |
| Jintu | green / red and white (gamosa) / yellow | AS 01 | gamosa scarf colour, no headgear |
| Banwari | yellow / pink / black | RJ 14 | Rajasthani safa |
| Manju | green / red and yellow / yellow | KA 05 | khaki shirt, no headgear |
| Nawab | green / cream / yellow | UP 32 | cream kurta, cap |
| Lallan | blue / yellow / yellow | BR 01 | gamchha colour, no headgear |

These are config values, so any of them can be changed without touching code.

## Game changes (`web/game.js`, `web/world3d.js`, `web/index.html`)

- **Loading.** `index.html` loads `drivers.js`. On start the game validates each entry (required fields,
  style numbers in range); a bad entry is reported through `reportError` and skipped, and if fewer than
  seven valid drivers remain the missing ones are filled from a built-in plain driver so a race always
  starts.
- **Grid.** New pure function `pickGrid(city, n, rng)`: the driver whose `city` matches the track's city
  is always included; the other `n − 1` are a random draw from the rest. Grid slots stay random.
  `RIVAL_NAMES` and `RIVAL_COLORS` are removed.
- **Rivals.** `setupRace` builds each rival from its driver: name, look and style. `updateRivals` and
  `resolveAttack` read the style fields in place of the constants in the table above. `grudge` starts a
  10 s timer when you hit that rival.
- **Curses.** `curse(who)` picks from the rival's own `curses` and plays the clip keyed
  `"<id>|<text>"`. The random `voicePitch` goes; `voice.rate` is the only playback adjustment. Your own
  driver still curses in the track city's slang (the existing `CURSES` table, now used only for you).
- **2D sprites.** `makeTuk` takes the slogan; `SP.rivals` is built from the cast.
- **3D autos.** `autoModel(pal, rearCanvas, look)` paints the driver's shirt and lathi sleeve from
  `look.shirt` and adds the headgear (turban and safa: a wrapped shape over the head; cap: a flat one).
- **Traffic autos.** Autos in traffic take the track city's livery instead of a random rival palette, so
  Delhi's streets have green and yellow autos. They have no named driver, slogan or lathi.
- **HUD and screens.** The nearest-rival bar and the results table show `NAME · CITY`. The start screen
  names the local driver with their `tag`.
- **Debug hook.** `window.__rrr` exposes `drivers` and `pickGrid` for checks.

## Voices (`tools/voices/`)

`make_voices.py` gains a second engine, AI4Bharat Indic Parler-TTS (`ai4bharat/indic-parler-tts`,
Apache 2.0), used for all curses:

- **Rival curses** come from `web/drivers.js`: each line is spoken by the driver's `speaker` with their
  `describe` prompt, then goes through the existing shout chain (compressor, soft clip, presence boost),
  retuned so it no longer pitch-shifts the voice. 11 drivers × 5 lines = 55 clips, keyed `"<id>|<text>"`.
- **Your curses** (28 lines in `lines.json`) are regenerated with Parler using one Hindi and one Tamil
  speaker that no rival uses.
- **Hawker calls** (20 lines) stay on MMS, untouched.

`voices.js` grows from 48 to about 103 clips, roughly 355 KB to 760 KB. The credits line adds Indic
Parler-TTS.

Speaker plan: Bengali, Kannada, Assamese, Tamil and Punjabi have their own named speakers. Lucknow uses
an Urdu voice. The Hindi variants (Mumbai, Delhi, Jaipur, Patna, Hyderabad) share the model's Hindi
speakers, so they are separated by description (pitch, pace, gruffness) and, where it sounds better,
by a neighbouring language's speaker (Marathi for Mumbai, Telugu for Hyderabad, Maithili for Patna).

Risks, tested before the full run:

1. Punjabi is only unofficially supported by the model. Fallback: Punjabi lines with a Hindi speaker.
2. The five Hindi-variant drivers may sound too alike. Fallback: neighbouring-language speakers as above.
3. `python3` here is 3.14; if torch or parler-tts lack wheels for it, the venv uses an older Python.

So the first build step is a sample run: Jassi's and Ganpat's five clips each, sent for a listen. The
rest are generated only after those are accepted.

## Checks

The web game has no test runner; checks are a script plus the running game.

- `tools/drivers/check.mjs` (node): loads `drivers.js`, checks the schema and ranges, one driver per
  city, every track city has a driver, mean `pace` is −0.02 ± 0.005, and every curse has a clip in
  `voices.js`. Run before each release.
- In the browser preview through `window.__rrr`: for each of the seven tracks, `setupRace` 50 times and
  confirm the home driver is always on the grid and nobody appears twice; step a race and confirm style
  fields change behaviour (Jintu's bend speed above Jassi's, Nawab never swings before being hit).
- Screenshots of all eleven autos in 3D and in 2D (`?2d`).
- No console errors over a full race on a Mumbai and a Chennai track.

## Out of scope

The Unreal fork, new tracks for the new cities, hawker voices, and the player's choice of driver.

## Delivery

Built in the `worktree-npc-drivers` worktree off main. Another session has a track-config refactor in
progress on `game.js`; rebase on main before release. Ships as a normal release (web and Homebrew), with
the version re-read from main at release time.
