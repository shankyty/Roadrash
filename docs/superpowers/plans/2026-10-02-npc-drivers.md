# NPC Drivers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web game's anonymous random rivals with a config-driven cast of thirteen city drivers, each with their own auto, voice, driving style and attack.

**Architecture:** One data file, `web/drivers.js` (`window.RRR_DRIVERS`, strict JSON), is the single source for the game, the voice generator and the checker. `game.js` builds rivals from it and reads style and weapon numbers where it used constants; `world3d.js` and the 2D painters draw looks, weapons and neon from it; `tools/voices/make_voices.py` speaks each driver's curses with Indic Parler-TTS.

**Tech Stack:** Plain browser JS (no build step, no test runner), three.js, Web Audio; Python (torch, transformers, parler-tts, ffmpeg) for voices; node for the checker.

**Spec:** `docs/superpowers/specs/2026-10-02-npc-drivers-design.md`

## Global Constraints

- `web/drivers.js` body is strict JSON between the first `[` and the last `]`.
- Thirteen drivers, one per city; every track city (mumbai, hyderabad, delhi, chennai) has one.
- Mean `style.pace` is −0.02 ± 0.005; mean `weapon.power` is 1.0 ± 0.05.
- The track city's driver is always on the grid; nobody appears twice.
- The player keeps the lathi (power, reach, cooldown 1.0) and the track city's curses.
- Curses stay mild street slang.
- Work only in the `worktree-npc-drivers` worktree; rebase on `origin/main` before release.
- No release until the new voices exist (a rival with a silent curse is a regression).

## File map

| File | Responsibility |
|---|---|
| `web/drivers.js` (new) | The cast: identity, look, voice, curses, weapon, style |
| `tools/drivers/check.mjs` (new) | Schema, ranges, balance, one driver per city, every curse has a clip (`--clips`) |
| `web/index.html` | Load `drivers.js` before `game.js` |
| `web/game.js` | Validation, `pickGrid`, rivals from drivers, style and weapon numbers, curses, 2D painting, HUD |
| `web/world3d.js` | Driver figure and headgear, weapon meshes, kick leg, neon, preview kinds |
| `tools/voices/make_voices.py` | Parler engine for curses; reads `web/drivers.js` |

---

### Task 1: The cast and its checker

**Files:** Create `web/drivers.js`, `tools/drivers/check.mjs`.

**Produces:** `window.RRR_DRIVERS: Driver[]` with the schema in the spec. Style numbers:

| id | pace | bends | aggression | chase | weave | nerve | launch | grudge |
|---|---|---|---|---|---|---|---|---|
| ganpat | −0.02 | 0.20 | 0.9 | 900 | [1.5,4] | 0.9 | [0.1,0.35] | 1 |
| bunty | 0.01 | 0.30 | 1.3 | 1300 | [3,7] | 0.6 | [0.1,0.4] | 1.3 |
| saleem | −0.03 | 0.22 | 0.5 | 700 | [5,10] | 0.4 | [0.45,0.6] | 2.2 |
| murugan | 0.02 | 0.18 | 0.5 | 600 | [3,7] | 1.0 | [0.1,0.3] | 1 |
| bablu | −0.04 | 0.20 | 0.4 | 600 | [6,12] | 0.2 | [0.2,0.45] | 1.2 |
| jassi | 0.02 | 0.32 | 1.0 | 900 | [4,8] | 0.5 | [0.1,0.3] | 1 |
| jintu | −0.03 | 0.12 | 0.6 | 700 | [4,8] | 0.6 | [0.15,0.4] | 1 |
| banwari | −0.03 | 0.26 | 0.9 | 900 | [1.5,4] | 0.7 | [0.05,0.5] | 1.2 |
| manju | −0.02 | 0.18 | 0.6 | 700 | [5,10] | 0.1 | [0.05,0.15] | 1 |
| nawab | −0.03 | 0.20 | 0 | 800 | [5,10] | 0.4 | [0.2,0.45] | 2.5 |
| bhola | −0.05 | 0.16 | 1.3 | 500 | [6,12] | 0.5 | [0.3,0.55] | 1.5 |
| lallan | −0.03 | 0.24 | 1.2 | 1100 | [3,7] | 1.0 | [0.15,0.4] | 1.5 |
| kokila | 0.00 | 0.14 | 0.5 | 600 | [5,10] | 0.5 | [0.1,0.25] | 2.0 |

Looks, weapons (power, reach, cooldown, hit words) and neon colours are the spec's tables.

- [ ] Write `check.mjs`: parse `drivers.js` by slicing `[`…`]`; assert required fields, ranges from the spec, unique ids and cities, track cities covered, five curses each with `text` and `say`, balance means. With `--clips`, also assert `"<id>|<text>"` is a key of `RRR_VOICES` in `web/voices.js`. Exit 1 with one line per failure.
- [ ] Run `node tools/drivers/check.mjs` — fails: `drivers.js` missing.
- [ ] Write `web/drivers.js` with all thirteen drivers.
- [ ] Run `node tools/drivers/check.mjs` — passes. Commit.

### Task 2: Rivals built from drivers

**Files:** Modify `web/index.html` (script tag), `web/game.js` (constants near line 41, `buildSharedSprites`, `setupRace`, `updateRivals`, `resolveAttack`, traffic auto palette near line 2625, `window.__rrr`).

**Produces:**
- `DRIVERS`: validated copy of `window.RRR_DRIVERS`; invalid entries reported with `reportError('drivers', …)` and dropped; padded with `PLAIN_DRIVER` clones up to seven.
- `pickGrid(city, n, rng = Math.random) → Driver[]`: home driver first if one exists, then a shuffle of the rest, cut to `n`, then shuffled for grid order.
- Rival fields: `driver`, `style`, `weapon`, `grudgeT`, `name`, `palette` (= `driver.look`).

Formulas (replacing today's constants):
- `top = MAX_SPEED * clamp(track.skill * diff + style.pace + rand(-0.01, 0.01), 0.7, 1.02)`
- `delay = rand(...style.launch)`, `laneT = rand(...style.weave)`
- bend target: `r.top * (1 - style.bends * |curve| / 6)`; engaged: `|dz| < style.chase`
- traffic side gap: `(r.nw + nearest.nw) / 2 + lerp(0.22, 0.10, style.nerve)`; speed match when `nd < lerp(450, 200, style.nerve)`
- attack: `aggr = r.grudgeT > 0 ? max(style.aggression, 0.8) * style.grudge : style.aggression`; no attack if `aggr === 0`; start when `|dx| < 0.72 * weapon.reach`; `r.cd = rand(0.9, 2.0) * weapon.cooldown / aggr / (1 + round * 0.1)`
- `resolveAttack`: rival damage `× weapon.power`, lands when `|dx| < 0.8 * weapon.reach`; when the player hits a rival, `rival.grudgeT = 10`; popup word from `weapon.hitWords`; `Sfx.hit(weapon.sound)`.
- Traffic autos: palette is the track city's driver look (body, trim, canopy only).

- [ ] Implement; expose `drivers` and `pickGrid` on `window.__rrr`.
- [ ] Verify in the preview: for each of the 7 tracks, 50 × `setupRace()` — home driver present, no duplicates, rival count unchanged; no console errors. Commit.

### Task 3: Looks in 2D and 3D

**Files:** `web/game.js` (`makeTuk(body, trim, canopy, plate, slogan)`, `SP.rivals` keyed by driver id, `drawTuk` neon), `web/world3d.js` (`autoModel(pal, rearCanvas, look)`, model preview kind `rival:<id>`).

- [ ] 2D: slogan replaces HORN OK PLEASE (font shrinks to fit 200 px); `SP.rivalOf[id]`; traffic autos use a sprite of the city livery.
- [ ] 3D: shirt colour on torso and sleeve; headgear meshes (`turban`, `safa`, `cap`, `pallu`); Kokila-ben's sari colour is `look.shirt`.
- [ ] Neon: when `theme.night` and `look.neon`, 3D adds unlit strips along the tub foot and hood edge plus an additive ground disc; 2D draws a glow line and under-glow. Hidden by day.
- [ ] Verify with screenshots: all thirteen in 3D and `?2d`; neon on Sea Link, none by day. Commit.

### Task 4: Attacks

**Files:** `web/game.js` (`drawLathi` → `drawAttack(x, y, w, h, atk, weapon)`, `Sfx.hit(kind)`), `web/world3d.js` (weapon mesh per `shape`, kick leg, `placeAuto` animation).

- [ ] 3D: `weaponMesh(weapon)` for `lathi, bat, hockey, umbrella, cane, cloth, shoe, bag, dandiya, hand`; a `leg` group pivoting at the footboard for `kind: "kick"`; `placeAuto` animates arm or leg.
- [ ] 2D: the same shapes as strokes; a leg for kicks.
- [ ] `Sfx.hit(kind)`: `wood` (today's), `slap` (bright short noise), `thud` (low).
- [ ] Verify: screenshot each attack mid-swing; in a stepped race Jassi's hit lands at `|dx|` 0.85 where Bunty's does not; Nawab never attacks before being hit. Commit.

### Task 5: Curses and screens

**Files:** `web/game.js` (`curse`, HUD bar, start screen, results, credits).

- [ ] `curse(who)`: a rival picks from `driver.curses`, bubble shows `text`, clip key `"<id>|<text>"`, `clipRate = driver.voice.rate`; the player is unchanged.
- [ ] HUD bar and results show `NAME · CITY`; start screen adds the local driver line with their `tag`; credits add Indic Parler-TTS.
- [ ] Verify by screenshot. Commit.

### Task 6: Voices

**Files:** `tools/voices/make_voices.py`, `web/voices.js`.

Blocked on access: `ai4bharat/indic-parler-tts` is a gated model and the Hugging Face login on this Mac has not accepted its terms (HTTP 403). The user accepts them on the model page; nothing else changes.

- [ ] `uv venv --python 3.12 tools/voices/.venv`; install torch, transformers, parler-tts, scipy, numpy.
- [ ] Add `parler(text, description)` and a `--only <id,id>` flag; rival curses read from `web/drivers.js`, description = `"<speaker>'s voice: <describe>. Very clear audio, close microphone, no background noise."`; shout chain without `asetrate`.
- [ ] Sample run: `--only jassi,ganpat` → send the ten clips to the user. Wait for acceptance.
- [ ] Full run; player curses via Parler; hawkers stay MMS. `node tools/drivers/check.mjs --clips` passes. Commit.

### Task 7: Release

- [ ] Rebase on `origin/main`; rerun the checker and a full race on Marine Drive, Sea Link and Marina Beach Road with no console errors.
- [ ] Re-read branch, `GAME_VERSION` and latest tag; bump the minor version; CHANGELOG entry; release to web and Homebrew from this worktree with `set -euo pipefail`; verify with `brew upgrade`.
