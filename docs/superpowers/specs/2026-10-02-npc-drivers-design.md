# NPC drivers: a config-driven cast with city looks, voices and driving styles

Date: 2026-10-02. Target: the web game (`web/`, v3.3.4 on main). The Unreal fork is out of scope; the
config is plain JSON so the fork can read it later.

## Problem

Rival autos are anonymous. `web/game.js` hardcodes ten names (`RIVAL_NAMES`) and seven palettes
(`RIVAL_COLORS`), shuffles them, and rolls each rival's driving numbers at random per race. Every rival
curses in the slang of the track's city, and all curse audio comes from two TTS voices (one Hindi, one
Tamil, Meta MMS) varied only by playback pitch, so they sound robotic and alike.

## Goal

A fixed cast of thirteen drivers, one per city, defined entirely in one config file. Each driver has a
name and personality, an auto that looks like the autos of their city, a voice of their own that curses
in their own language, a driving style of their own, and their own local way of attacking: a weapon from
their city, or a kick.

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
  "tag": "Flat out on the straights, and his hockey stick lands like a tractor",
  "look": {
    "body": "#1e8e3e", "trim": "#ff8f00", "canopy": "#f5c400",
    "plate": "CH 01 TA", "slogan": "CHAK DE PHATTE",
    "shirt": "#f5f5f5", "headgear": "turban", "headgearColor": "#e65100",
    "neon": "#ff9100"
  },
  "voice": { "lang": "pa", "describe": "A male speaker with a deep voice speaks in a very loud, angry tone with a high pitch and a fast pace, shouting with great emotional depth. The speech is very expressive and animated.", "seed": 23, "rate": 1.0 },
  "curses": [ { "text": "OYE KHOTEYA!", "say": "ਓਏ ਖੋਤਿਆ!" } ],
  "weapon": { "kind": "swing", "shape": "hockey", "color": "#c8a165", "power": 1.4, "reach": 1.15,
              "cooldown": 1.3, "sound": "wood",
              "hitWords": ["HOCKEY!", "CHAK DE!", "DHISHOOM!"] },
  "style": {
    "pace": 0.02, "bends": 0.30, "aggression": 1.0, "chase": 900,
    "weave": [4, 8], "nerve": 0.5, "launch": [0.1, 0.3], "grudge": 1.0
  }
}
```

`headgear` is one of `none`, `turban`, `safa`, `cap`, `pallu`. `neon` is a colour, or `null` for an auto
without neon lights. Each driver has five curses: `text` is the bubble
(Latin capitals, as today), `say` is what the voice speaks in native script.

### Style numbers

Each replaces a value that is random or constant in `updateRivals` / `setupRace` today. The track's
`skill` and the difficulty still scale everything; a style only moves a driver around that baseline.

| Field | Meaning | Today | Range |
|---|---|---|---|
| `pace` | added to the top-speed factor (`track.skill * diff + pace ± 0.01`, clamped 0.7 to 1.02) | random −0.06 to +0.02 | −0.06 to +0.02 |
| `bends` | how much speed is lost in a full curve | 0.22 | 0.12 to 0.32 |
| `aggression` | attack rate (divides the attack cooldown); 0 means never attacks unprovoked | random 0.6 to 1.2 | 0 to 1.3 |
| `chase` | distance (track units) within which they come at you to fight | 900 | 500 to 1300 |
| `weave` | seconds between lane changes, [min, max] | [3, 8] | [1.5, 4] to [6, 12] |
| `nerve` | 0 to 1: side gap left when passing traffic (0.22 down to 0.10) and how late they brake behind it | gap 0.16 | 0 to 1 |
| `launch` | reaction time at the start, [min, max] seconds | [0.05, 0.5] | within 0.05 to 0.6 |
| `grudge` | for 10 s after you hit them, aggression becomes `max(aggression, 0.8) × grudge` | 1 | 1 to 2.5 |

Balance rule: the cast's mean `pace` stays at −0.02 (today's mean), the mean weapon `power` stays near
1.0, and no driver is best at everything.

## The cast

| City | Driver | Curses in | Style in one line |
|---|---|---|---|
| Mumbai | Ganpat | Bambaiya Hindi | Weaves through traffic with tight gaps, changes lanes often |
| Delhi | Bunty | Delhi Hindi | Bully: hunts you from far, swings often, fast on straights, sloppy in bends |
| Hyderabad | Saleem | Dakhni | Slow off the line and relaxed, but holds a grudge and slaps fast |
| Chennai | Murugan | Tamil | Fearless: brakes late, high pace, rarely fights |
| Kolkata | Bablu-da | Bengali | Steady and defensive, holds his lane, seldom swings |
| Chandigarh | Jassi (the Sardar) | Punjabi | Fastest on straights, hardest hitter, slow in bends |
| Guwahati | Jintu | Assamese | Hill driver: quickest through bends, calm |
| Jaipur | Banwari | Marwari-flavoured Hindi | Showy and erratic, sudden lane changes |
| Bengaluru | Manju | Kannada | Patient and consistent, quick start, brakes early for traffic |
| Lucknow | Nawab | Lakhnavi Urdu | "Pehle aap": never swings first, polite even when cursing, strong grudge once hit |
| Varanasi | Bhola | Bhojpuri (Banarasi) | Mast-maula: unhurried and never comes looking for you, but pull alongside and the gamchha cracks at once |
| Patna | Lallan | Magahi-flavoured Hindi | Brawler: never backs off in traffic, swings a lot, average pace |
| Ahmedabad | Kokila-ben (the cast's one woman driver) | Gujarati | No-nonsense: fast steady pace, clean through bends, scolds more than she swings, but never forgets a hit |

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
| Bhola | green / saffron / yellow | UP 65 | white kurta, red gamchha tied round the head |
| Lallan | blue / yellow / yellow | BR 01 | checked shirt, no headgear |
| Kokila-ben | green / bandhani red / yellow | GJ 01 | sari, pallu over the head; slogan AAVJO |

These are config values, so any of them can be changed without touching code.

### Neon lights

Five of the autos carry neon strip lights, the way decked-out autos do: Ganpat (magenta), Bunty (blue),
Murugan (green), Jassi (orange) and Banwari (pink). The rest have `"neon": null`. Neon only shows on
night tracks (`theme.night`, today only Mumbai's Sea Link); by day those autos look like the others.

### Weapons

Each driver attacks in their own way. `weapon.kind` is `swing` (an arm swings something, as the lathi
does today) or `kick` (a leg shoots out of the auto's open side). Three drivers kick; nobody else
shares a weapon.

| Driver | Attack | Power | Reach | Cooldown | Hit words |
|---|---|---|---|---|---|
| Jassi | hockey stick | 1.4 | 1.15 | 1.3 | HOCKEY!, CHAK DE! |
| Ganpat | cricket bat | 1.3 | 1.05 | 1.3 | SIXER!, DHISHOOM! |
| Murugan | kick, film-hero style | 1.25 | 0.8 | 1.2 | KICK-U!, DISHUM! |
| Jintu | kick, footballer's | 1.2 | 0.85 | 1.1 | GOAL!, DHAM! |
| Lallan | oiled lathi | 1.15 | 1.2 | 1.2 | LATTH!, DHISHOOM! |
| Bunty | kick | 1.1 | 0.8 | 1.0 | LAAT!, DHAM! |
| Manju | laptop bag swung by the strap | 1.1 | 0.9 | 1.2 | THUD!, DHAM! |
| Bablu-da | umbrella | 0.9 | 1.1 | 1.0 | CHHATA!, DHOPAASH! |
| Nawab | walking cane | 0.9 | 1.1 | 0.9 | CHHADI!, SATAAK! |
| Saleem | open-hand slap (no weapon) | 0.8 | 0.8 | 0.8 | JHAAPAD!, CHATAAK! |
| Banwari | jooti (his shoe) | 0.8 | 0.85 | 0.8 | JOOTI!, PATAAK! |
| Kokila-ben | dandiya sticks | 0.75 | 0.9 | 0.7 | DANDIYA!, THAK THAK! |
| Bhola | wet gamchha, cracked like a whip | 0.7 | 1.2 | 0.7 | SATAAK!, CHATAAK! |

Power, reach and cooldown are multiples of today's lathi (1.0 each). Heavy weapons hit hard but are slow
to come round again; light ones sting less but come fast. The cast's mean power is about 1.0, so races
are no harder overall than today.

Weapon fields:

| Field | Meaning |
|---|---|
| `kind` | `swing` or `kick` |
| `shape` | for a swing, what is drawn in the hand: `lathi`, `bat`, `hockey`, `umbrella`, `cane`, `cloth`, `shoe`, `bag`, `dandiya`, `hand` |
| `color` | main colour of the weapon (a kick uses the driver's trouser colour) |
| `power` | damage of a hit, as a multiple of the lathi's (0.7 to 1.4) |
| `reach` | sideways reach, as a multiple of the lathi's (0.8 to 1.2); a kick is short, a hockey stick long |
| `cooldown` | time before the next attack, as a multiple of the lathi's (0.7 to 1.3); combines with `style.aggression` |
| `sound` | impact sound: `wood` (today's thwack), `slap` or `thud` |
| `hitWords` | the comic popup words when it lands, replacing the shared `HIT_WORDS` for this driver |

How hard a hit lands is a property of the weapon alone; the style numbers no longer carry it. You keep
the lathi (1.0 across the board).

### Who you are (added 2026-10-02, after the first build)

You race as the driver of the track's city: their auto, voice, curses and weapon (its power and reach, and
its cooldown as the length of your swing). Your rivals are a random draw from the other drivers, so the
home driver is never a rival. The grid rule below ("always included") is superseded by this.

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
- **Attacks.** `startAttack` and `resolveAttack` use the attacker's `weapon`: `power` scales the damage,
  `cooldown` scales the wait before the next attack, `reach` scales the sideways range at which a rival
  starts an attack and at which it lands, the popup word comes from `hitWords`,
  and `Sfx.hit` takes the `sound` variant. In 3D the auto's swing arm carries a mesh built from `shape`
  (simple primitives), and a kicking driver gets a leg that pivots out from the footboard instead. In 2D
  `drawLathi` becomes `drawAttack`, drawing the same shapes as strokes, or a leg for a kick.
- **Curses.** `curse(who)` picks from the rival's own `curses` and plays the clip keyed
  `"<id>|<text>"`. The random `voicePitch` goes; `voice.rate` is the only playback adjustment. Your own
  driver still curses in the track city's slang (the existing `CURSES` table, now used only for you).
- **2D sprites.** `makeTuk` takes the slogan; `SP.rivals` is built from the cast.
- **3D autos.** `autoModel(pal, rearCanvas, look)` paints the driver's shirt and sleeve from
  `look.shirt` and adds the headgear (turban and safa: a wrapped shape over the head; cap: a flat one; pallu: cloth draped
  over the head and one shoulder).
- **Neon.** On a night track, an auto with `look.neon` gets glowing strips in that colour along the foot
  of the tub and the edge of the hood, and a soft pool of the same colour on the road beneath it. The
  strips are unlit materials, so they glow in the dark like the headlamp does. In 2D the sprite gets a
  glowing line along the tub and a coloured glow under it. Traffic autos and your auto have no neon.
- **Traffic autos.** Autos in traffic take the track city's livery instead of a random rival palette, so
  Delhi's streets have green and yellow autos. They have no named driver, slogan or weapon.
- **HUD and screens.** The nearest-rival bar and the results table show `NAME · CITY`. The start screen
  names the local driver with their `tag`.
- **Debug hook.** `window.__rrr` exposes `drivers` and `pickGrid` for checks.

## Voices (`tools/voices/`)

`make_voices.py` gains a second engine, AI4Bharat Indic Parler-TTS (`ai4bharat/indic-parler-tts`,
Apache 2.0), used for all curses:

- **Rival curses** come from `web/drivers.js`: each line is spoken with the driver's `describe` prompt
  (written the way the model was trained: who speaks, in what tone, pitch and pace; a named speaker gives
  the same voice every time). Without a pinned `seed`, three takes are made and the highest-pitched one
  (the most shouted) is kept, then goes through the existing shout chain (compressor, soft clip, presence boost),
  retuned so it no longer pitch-shifts the voice. 13 drivers × 5 lines = 65 clips, keyed `"<id>|<text>"`.
- **Your curses** (28 lines in `lines.json`) are regenerated with Parler using one Hindi and one Tamil
  speaker that no rival uses.
- **Hawker calls** (20 lines) stay on MMS, untouched.

`voices.js` grows from 48 to about 113 clips, roughly 355 KB to 830 KB. The credits line adds Indic
Parler-TTS.

Speaker plan: Bengali, Kannada, Assamese, Tamil and Punjabi have their own named speakers, Lucknow
uses an Urdu voice, and Kokila-ben uses a female Gujarati speaker (the only female voice in the cast). The model has
no Bhojpuri or Magahi voice, so Bhola's Bhojpuri and Lallan's Magahi lines are written in Devanagari and
spoken by a Hindi or Maithili speaker. The Hindi-script drivers (Mumbai, Delhi, Jaipur, Varanasi, Patna,
Hyderabad) share the model's Hindi speakers, so they are separated by description (pitch, pace,
gruffness) and, where it sounds better, by a neighbouring language's speaker (Marathi for Mumbai, Telugu
or Urdu for Hyderabad, Maithili for Patna or Varanasi).

Risks, tested before the full run:

1. Punjabi is only unofficially supported by the model. Fallback: Punjabi lines with a Hindi speaker.
2. The six Hindi-script drivers may sound too alike. Fallback: neighbouring-language speakers as above.
3. `python3` here is 3.14; if torch or parler-tts lack wheels for it, the venv uses an older Python.

So the first build step is a sample run: Jassi's and Ganpat's five clips each, sent for a listen. The
rest are generated only after those are accepted.

## Checks

The web game has no test runner; checks are a script plus the running game.

- `tools/drivers/check.mjs` (node): loads `drivers.js`, checks the schema and ranges, one driver per
  city, every track city has a driver, mean `pace` is −0.02 ± 0.005, mean weapon `power` is 1.0 ± 0.05, and every curse has a clip in
  `voices.js`. Run before each release.
- In the browser preview through `window.__rrr`: for each of the seven tracks, `setupRace` 50 times and
  confirm the home driver is always on the grid and nobody appears twice; step a race and confirm style
  fields change behaviour (Jintu's bend speed above Jassi's, Jassi's hockey stick lands from further out
  than Bunty's kick, Nawab never swings before being hit, Bhola never chases from beyond his short range).
- Screenshots of all thirteen autos in 3D and in 2D (`?2d`), and of each attack mid-swing or mid-kick; the five neon
  autos on the Sea Link at night, and the same five by day showing no neon.
- No console errors over a full race on a Mumbai and a Chennai track.

## Out of scope

The Unreal fork, new tracks for the new cities, hawker voices, and the player's choice of driver or
weapon.

## Delivery

Built in the `worktree-npc-drivers` worktree off main. Another session has a track-config refactor in
progress on `game.js`; rebase on main before release. Ships as a normal release (web and Homebrew), with
the version re-read from main at release time.
