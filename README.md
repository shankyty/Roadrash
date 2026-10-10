# Road Rash: Rickshaw Rumble

Road Rash-style combat racing through Mumbai, Hyderabad, Delhi and Chennai. Instead of a motorbike you drive an auto-rickshaw.

## Play in the browser

**https://shankyty.github.io/Roadrash/**

No install needed. It works on any desktop browser, and on phones and tablets with on-screen touch controls: in landscape the buttons sit at the screen edges, and in portrait they sit underneath the game. For full screen on a phone, use **Add to Home Screen** and launch it from there.

## Install with Homebrew

```bash
brew tap shankyty/roadrash https://github.com/shankyty/Roadrash
brew install --cask roadrash
```

This works on Apple Silicon and Intel Macs running macOS 13 or later. You can also download `RoadRash.dmg` from [Releases](https://github.com/shankyty/Roadrash/releases).

## Build & run the Mac app

```bash
./build.sh
open "build/Road Rash.app"
```

`build.sh` compiles a small native Cocoa/WKWebView shell (`macos/main.swift`), builds the game (`npm run build`, see below) into `build/Road Rash.app`, then ad-hoc signs it. It needs Node.js; the first run installs the build's one dependency (esbuild).
If Xcode's license hasn't been accepted, the script falls back to the Command Line Tools toolchain.

To iterate on the game in a browser: `python3 -m http.server 8765 --directory web` and open http://localhost:8765. The source runs as is, one file per script tag, with no build step.

`npm run build` (`tools/build-web.mjs`) makes the deployable copy in `dist/web`: the scripts `index.html` loads are merged, in order, into two minified bundles with content-hashed names. `npm test` runs the tests.

## Controls

One hand drives and the other hits out with your driver's weapon. Press **Tab** on the title or pause screen to switch hands (the choice is saved).

| | Arrows drive (default) | WASD drive |
| --- | --- | --- |
| Gas / brake / steer | ↑ ↓ ← → (right hand) | W S A D (left hand) |
| Hit left / right | **A** / **D** (left hand) | **←** / **→** (right hand) |
| Horn (cows, dogs and traffic move aside) | W or S | ↑ or ↓ |
| Handbrake: hold a steer and pull it to drift | Space | Space |

**Esc** or **P** during a race opens the menu: **Resume**, **Restart race** or **Quit to main menu**. Use ↑/↓ and Enter to choose, or click an option. On the results screen, **Enter** continues and **Esc** returns to the main menu. **V** opens the **sound mixer**, with separate volumes for all sound, race (engine, horn, fights), voices, music and city noise; it's also in the pause menu, and there's a 🔊 button on phones. **M** mutes everything and **N** turns the music on or off.

In the Mac app's **Game** menu: Pause/Resume (⌘P), Restart Race (⌘R), Quit to Main Menu (⇧⌘M), Reload Game (⇧⌘R). **⌃⌘F** toggles full screen.

## 3D

The world is rendered in real 3D with [Three.js](https://threejs.org) (r149, bundled in `web/lib/`, MIT licence). Every vehicle is a 3D model: your auto, the rival autos (their rounded canopies tip over when knocked out, and each driver's weapon or kick swings in 3D), buses, trucks and cars. Cows and dogs are 3D models with walking legs. Buildings are solid blocks with painted shopfronts. Bends and hills are real geometry, so vehicles and buildings keep their depth when you turn.

- **Cameras:** a high **helicopter** view (default) and a low **chase** view. Press **C** to switch; your choice is saved.
- **Classic renderer:** if a device has no WebGL, the original pseudo-3D renderer is used automatically. Add `?2d` to the URL to force it.
- **Code layout:** `web/game/` runs the race for both renderers, one file per concern (`player.js`, `rivals.js`, `traffic.js`, `audio.js`, `hud.js`, …, started by `main.js`). `web/engine/` holds the rules that use no DOM or renderer (track building, traffic driving, junction lights, standings), tested under Node. `web/world3d/` draws it in 3D, one file per model family or stage (`cars.js`, `bus.js`, `scenery.js`, `road.js`, `frame.js`, …; `api.js` is its interface). Each frame it rebuilds the road around the camera from the track's curves and hills and places the models. Tracks themselves are data: see **Tracks, cities and styles**.

## Gameplay

- 7 races across 4 cities, each with its own skyline:
  - **Mumbai**: Marine Drive, Bandra-Worli Sea Link (night), Western Express Highway and Juhu Beach Road, with the Gateway of India, Taj, Rajabai Tower and Sea Link behind.
  - **Hyderabad**: Charminar Road, with Charminar, Golconda Fort, HITEC City and the Hussain Sagar Buddha behind.
  - **Delhi**: Ring Road, with India Gate, Qutub Minar, Red Fort, the Lotus Temple and Jama Masjid behind.
  - **Chennai**: Marina Beach Road, with the Kapaleeshwarar gopuram, the lighthouse and Chennai Central behind.
- All 7 races are open from the start: pick any of them on the title screen with ← →.
- Every race has a style, shown under its name on the title screen:
  - **Speed** (Sea Link, Marina Beach Road): long straights, gentle bends, no junctions and light traffic. The autos are tuned for 100 km/h.
  - **Drift** (Marine Drive, Juhu Beach Road): tight bends one after another. A held drift keeps your speed, carries you round the bend and gives a short boost on the way out. Flat out without sliding, you run wide or tip over.
  - **Traffic** (Western Express Highway, Ring Road): a wide road packed with traffic. Pass a moving vehicle with little room to spare and you get a slipstream; passes in quick succession stack it up to 5 times.
  - **Classic** (Charminar Road): the original mix.
- The first across the line wins on every style. Each track also keeps your best time, best drift score, most close passes and wins, and the results screen marks a new best with a star.
- Drifting and close passes pay a cash bonus on the results screen.
- To drift: above about 25 km/h, hold a steer and pull the handbrake (**Space**), or tap the brake. On a phone, hold a steer button and tap the brake button. Keep steering to hold the slide; let go to straighten up. Only a slide into a bend scores and earns the exit boost.
- Every track has a raised footpath on both sides, and you can drive on it at full speed. Climbing the kerb costs a quarter of your speed and dropping off it about an eighth.
- Chai stalls block the footpath. A hand cart is parked before each one, resting on its handles: drive onto it at 30 km/h or more and you jump. The jump carries on the way the auto was going. Holding the footpath, you clear the stall and land on the footpath; steering at the road, you fly over the traffic and land in a lane. There is no steering in the air.
- A cart also stands on both footpaths before every traffic signal. Take it at 40 km/h or more and you jump the whole junction; pass over the cross traffic and it counts as a flyover.
- Land on a vehicle or a cow and you crash. Hit a cart too slowly or off-centre, or a stall without jumping, and you are wrecked.
- Jumps pay cash on the results screen. A flyover (off the footpath, over a vehicle, into the road) pays more.
- The daring drivers use the footpath and the carts too when traffic holds them up.
- There are 13 drivers, one per city (see **The drivers**). You race as any one of them: pick with **↑** / **↓** on the title screen (remembered); until you pick, you are the driver of the city you're in. A driver who takes a hit shouts back in their own language and their own voice, **spoken aloud** from where they are on the road: panned to their side, louder when close, with Doppler as you pass.
- Hawkers at chai stalls and shops call out as you pass, out loud and street-style: *"Vada paaav!"*, *"Bhel puri lelo!"*, *"Chai bole, chaaai!"*, *"Irani chaaai!"*, *"Golgappe, golgappe!"*, *"Sundal, sundaaal!"*.
- Each city has its own background music, all original and generated live in the browser: filmi dholak (Mumbai), qawwali (Hyderabad), bhangra (Delhi) and kuthu with a nadaswaram-style reed (Chennai). Press **N** to turn it on or off.
- Real street and market recordings play in the background of each city, louder where the road is lined with shops.
- The engine is a real Bajaj auto-rickshaw recording: a kick-start at race start, then idle and rev loops that pitch up with your speed.
- Finish in the top 3 to qualify, and **Enter** on the results screen takes you straight to the next race. Prize money and a ₹100 bonus for each rival you knock out go into your wallet, which is saved between sessions.
- Rival autos catch up, ride alongside you and hit you with their own weapons (or kick). If your health runs out, you're knocked out for a few seconds.
- Watch out for cows, buses, trucks and cars. Crashing into roadside objects wrecks you.
- Traffic is audible: buses, trucks, cars and rival autos have their own engine sounds (positional, with Doppler) and honk like real Indian traffic, especially when you overtake them closely. Cows moo and dogs bark from where they are.
- Stray dogs sleep in the middle of the road, trot across it, and chase your auto barking *"BHOW BHOW!"*. Roadside dogs often sprint alongside your auto for a while, sometimes in pairs. They always leap clear and never get hurt, but swerving around one costs you speed. Honk to wake them and send them off the road.
- Autos only have three wheels, so taking a sharp turn at full speed makes you lean. If you stay in the red, you tip over.
- Clear all 7 races to become **Auto King of India**. Each new tour after that is harder.

## Tracks, cities and styles

Every race is a pack of plain data. Nothing about a particular track lives in the game code.

| Pack | Files | Holds |
| --- | --- | --- |
| Track | `web/tracks/<id>/track.js` | Name, city, style, road seed and length, rivals, traffic counts and the look (sky, fog, road colours, scenery) |
| City | `web/cities/<id>/city.js`, `skyline.js`, `ambience.js` | Street calls, curses, song, billboard ads, bus liveries, the skyline painters and the street recording |
| Style | `web/styles/<id>.js` | How the road is put together, the footpath (width, kerb cost, how far apart the stalls stand), the traffic mix, the handling numbers (top speed, drift, slipstream) and the cash rates |

`web/packs.js` lists the packs, with tracks in race order. The files in `web/engine/` check them at startup and build the road and its traffic from them. A mistake in a pack shows a message naming the track and field in place of the title screen.

To add a track, copy a folder under `web/tracks/`, change its `id` and values, and add the id to `web/packs.js`. A track can override any of its style's values, for example `traffic: { count: 40, cows: 0, dogs: 0, oncoming: 0.3 }`. `road: { footpath: false }` gives a track no footpath.

Run the tests with `node --test tests/*.test.js` (Node 20 or later, nothing to install).

## The drivers

The cast is one data file, `web/drivers.js`: 13 drivers, one per city. Each entry has four parts besides the name, city and a one-line personality:

| Part | Holds |
| --- | --- |
| `look` | Body, trim and hood colours, number plate, rear slogan, `rear: "grille"` for a back with an engine hatch (the slogan is painted above it), an optional `visor` strip and `seat` colour, the driver's shirt and headgear, and a neon colour, different for every driver (shown on night tracks) |
| `voice`, `curses` | How the voice is described to the speech model, and five curses: the bubble text and what is spoken, in native script |
| `weapon` | A swing (bat, hockey stick, umbrella, cane, cloth, shoe, bag, dandiya, lathi, bare hand) or a kick, with its `move` (the path it follows: chop, pull, lowsweep, jab, uppercut, whip, smack, roundhouse, double, slap, sidekick, highkick, volley), its `contact` (where it lands: head, body or low, which also sets how the other auto reacts: rocking and a ducking driver, a sideways knock and lean, or a wheel jerk and skid), power, reach, cooldown, sound, hit words, and `wet` for a spray of water |
| `style` | Pace, speed through bends, aggression, how far they chase you, lane changes, nerve in traffic, start reaction, grudge, and `daring`: whether (and how recklessly) they overtake on the oncoming side |

You drive as the driver you picked on the title screen (or, until you pick, the track city's own). Your seven rivals always include the track city's driver, unless that's you; the rest are a random draw. `node tools/drivers/check.mjs --clips` checks the file and that every curse has a voice clip. The file is strict JSON after `window.RRR_DRIVERS =`, so the voice tools read it too.

To change a voice: `tools/voices/audition.py` makes candidate takes of each curse and an audition page (a copy is kept at `tools/voices/audition.html`). Pick by ear, save the page's picks to a file, then run `apply_picks.py` on it and `make_voices.py --rivals <driver ids>`.

## Installer (DMG)

```bash
./make-dmg.sh
```

This creates `build/RoadRash.dmg`. Open it and drag **Road Rash** into **Applications**.
The app is only ad-hoc signed, not notarized. On another Mac, the first launch needs right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**.

## Releasing a new version

1. Bump `CFBundleShortVersionString` in `macos/Info.plist` and `GAME_VERSION` in `web/game/analytics.js`, then run `./make-dmg.sh`.
2. Create the release: `gh release create vX.Y.Z build/RoadRash.dmg`.
3. In `Casks/roadrash.rb`, update `version` and `sha256` (from `shasum -a 256 build/RoadRash.dmg`), then push.

## Deploying the web version

`./deploy-web.sh` builds the committed `web/` folder and publishes `dist/web` to the `gh-pages` branch, which GitHub Pages serves.

## Analytics

The website uses [GoatCounter](https://www.goatcounter.com): no cookies and no personal data. The dashboard is **https://roadrash-shankyty.goatcounter.com**. As well as page views, it records these events:
- `race-start/<city>/<track>`, for example `race-start/delhi/delhi`, each time a race begins.
- `race-finish/<place>`, for example `race-finish/1st`, when a race ends.
- `device/<kind>/<os>/<browser>`, for example `device/phone/iOS/WhatsApp-in-app`, once per visit. It records which device, OS and browser were used together.
- `error/<component>/<problem>/<OS-browser>`, for example `error/audio/still-suspended-after-pointerup/iOS-Safari`, whenever something goes wrong on a player's device. The component is worked out from the stack trace, and is one of `audio`, `renderer`, `ui`, `player-physics`, `rivals-combat`, `traffic`, `hawkers`, `race-rules`, `track`, `sprites`, `input`, `analytics` or `game-loop`. The event's title holds the details: game version, what the player was doing, OS and browser versions, screen, audio state and volumes, and the top of the stack. Each part of the game is isolated, so a failing component is reported once and the rest keeps running. Problems are also logged to the browser console as `[RoadRash]`.

Nothing is sent from localhost or from the Mac app.

To see a summary of who is playing (countries and states, device + OS + browser combinations, where visitors came from, races per city), download an export from the dashboard (**Settings → Export**) and run:

```bash
./analytics.sh
```

It picks up the newest `goatcounter-export-*.zip` in this folder or in `~/Downloads`; no token is needed. Exports are git-ignored, so visitor data never reaches the repo.

## Credits

- Street ambience (trimmed, loudness-normalised loops in `web/cities/<city>/ambience.js`):
  - Mumbai: ["Mumbai - Market"](https://freesound.org/s/453005/) by Lenguaverde, CC0.
  - Delhi: ["India Streets NewDelhi City"](https://freesound.org/s/263636/) by Alcappuccino, CC0.
  - Chennai: ["Chennai (India) Traffic Ambience 01"](https://freesound.org/s/465712/) by **Nielsvdb**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - Hyderabad: ["Street Ambience India"](https://freesound.org/s/509181/) by guidofm (recorded in Pune), CC0.
- Voices (`web/voices.js`): the drivers' curses were generated with AI4Bharat's [Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts) (Apache 2.0), several takes per line, picked by ear. The hawker calls and the older city curses were generated with Meta's [MMS-TTS](https://huggingface.co/facebook/mms-tts-hin) models, [`facebook/mms-tts-hin`](https://huggingface.co/facebook/mms-tts-hin) and [`facebook/mms-tts-tam`](https://huggingface.co/facebook/mms-tts-tam), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (non-commercial use). They were trimmed, EQ'd and loudness-normalised. To rebuild them, see [`tools/voices/`](tools/voices/): `lines.json` holds each line's text and chosen take, and `make_voices.py` regenerates `web/voices.js` exactly.
- Animals (`web/animals.js`, trimmed and loudness-normalised):
  - Dog bark: ["Dog Bark 9"](https://freesound.org/s/853723/) by **AleXZavesa**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - Dog bark and growl: ["Animal Dog Bark And Growl 01"](https://freesound.org/s/625501/) by abhisheky948, CC0.
  - Cow moos: ["Cow moo #8"](https://freesound.org/s/513565/) by spurioustransients, CC0.
- Truck and bus horns (`web/horns.js`): cut from ["bus_india.WAV"](https://freesound.org/s/22721/) by **Anton** (a busy street in Jaipur), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Music: original compositions, synthesised in real time by the game.
- Engine sound: ["Auto Rickshaw - Start, Idle, Revving"](https://freesound.org/s/261051/) by **kalhan** (recorded at an NID sound-design workshop), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It was trimmed into a start clip plus idle and rev loops, level-adjusted and resampled (`web/sounds.js`).
