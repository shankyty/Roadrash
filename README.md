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

`build.sh` compiles a small native Cocoa/WKWebView shell (`macos/main.swift`) and bundles the game (`web/`) into `build/Road Rash.app`, then ad-hoc signs it.
If Xcode's license hasn't been accepted, the script falls back to the Command Line Tools toolchain.

To iterate on the game in a browser: `python3 -m http.server 8765 --directory web` and open http://localhost:8765.

## Controls

One hand drives and the other swings the lathi. Press **Tab** on the title or pause screen to switch hands (the choice is saved).

| | Arrows drive (default) | WASD drive |
| --- | --- | --- |
| Gas / brake / steer | ↑ ↓ ← → (right hand) | W S A D (left hand) |
| Swing lathi left / right | **A** / **D** (left hand) | **←** / **→** (right hand) |
| Horn (cows, dogs and traffic move aside) | Space, W or S | Space, ↑ or ↓ |

**Esc** or **P** during a race opens the menu: **Resume**, **Restart race** or **Quit to main menu**. Use ↑/↓ and Enter to choose, or click an option. On the results screen, **Enter** continues and **Esc** returns to the main menu. **V** opens the **sound mixer**, with separate volumes for all sound, race (engine, horn, fights), voices, music and city noise; it's also in the pause menu, and there's a 🔊 button on phones. **M** mutes everything and **N** turns the music on or off.

In the Mac app's **Game** menu: Pause/Resume (⌘P), Restart Race (⌘R), Quit to Main Menu (⇧⌘M), Reload Game (⇧⌘R). **⌃⌘F** toggles full screen.

## 3D

The world is rendered in real 3D with [Three.js](https://threejs.org) (r149, bundled in `web/lib/`, MIT licence). Every vehicle is a 3D model: your auto, the rival autos (their rounded canopies tip over when knocked out, and the lathi swings in 3D), buses, trucks and cars. Cows and dogs are 3D models with walking legs. Buildings are solid blocks with painted shopfronts. Bends and hills are real geometry, so vehicles and buildings keep their depth when you turn.

- **Cameras:** a high **helicopter** view (default) and a low **chase** view. Press **C** to switch; your choice is saved.
- **Classic renderer:** if a device has no WebGL, the original pseudo-3D renderer is used automatically. Add `?2d` to the URL to force it.
- **Code layout:** `web/game.js` runs the race (physics, rivals, audio, HUD) for both renderers and `web/world3d.js` draws it in 3D. Each frame it rebuilds the road around the camera from the track's curves and hills and places the models. Tracks themselves are data: see **Tracks, cities and styles**.

## Gameplay

- 7 races across 4 cities, each with its own skyline:
  - **Mumbai**: Marine Drive, Bandra-Worli Sea Link (night), Western Express Highway and Juhu Beach Road, with the Gateway of India, Taj, Rajabai Tower and Sea Link behind.
  - **Hyderabad**: Charminar Road, with Charminar, Golconda Fort, HITEC City and the Hussain Sagar Buddha behind.
  - **Delhi**: Ring Road, with India Gate, Qutub Minar, Red Fort, the Lotus Temple and Jama Masjid behind.
  - **Chennai**: Marina Beach Road, with the Kapaleeshwarar gopuram, the lighthouse and Chennai Central behind.
- All 7 races are open from the start: pick any of them on the title screen with ← →.
- Drivers who take a lathi hit shout back in their city's street slang (Bambaiya, Dakhni, Dilli or Tamil), and the lines are **spoken aloud** in Hindi or Tamil from where the speaker is on the road: panned to their side, louder when close, with Doppler as you pass. Every rival has their own voice pitch.
- Hawkers at chai stalls and shops call out as you pass, out loud and street-style: *"Vada paaav!"*, *"Bhel puri lelo!"*, *"Chai bole, chaaai!"*, *"Irani chaaai!"*, *"Golgappe, golgappe!"*, *"Sundal, sundaaal!"*.
- Each city has its own background music, all original and generated live in the browser: filmi dholak (Mumbai), qawwali (Hyderabad), bhangra (Delhi) and kuthu with a nadaswaram-style reed (Chennai). Press **N** to turn it on or off.
- Real street and market recordings play in the background of each city, louder where the road is lined with shops.
- The engine is a real Bajaj auto-rickshaw recording: a kick-start at race start, then idle and rev loops that pitch up with your speed.
- Finish in the top 3 to qualify, and **Enter** on the results screen takes you straight to the next race. Prize money and a ₹100 bonus for each rival you knock out go into your wallet, which is saved between sessions.
- Rival autos catch up, ride alongside you and hit you with their own lathis. If your health runs out, you're knocked out for a few seconds.
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
| Style | `web/styles/<id>.js` | How the road is put together, the traffic mix and the handling numbers |

`web/packs.js` lists the packs, with tracks in race order. The files in `web/engine/` check them at startup and build the road and its traffic from them. A mistake in a pack shows a message naming the track and field in place of the title screen.

To add a track, copy a folder under `web/tracks/`, change its `id` and values, and add the id to `web/packs.js`. A track can override any of its style's values, for example `traffic: { count: 40, cows: 0, dogs: 0, oncoming: 0.3 }`.

Run the tests with `node --test tests/*.test.js` (Node 20 or later, nothing to install).

## Installer (DMG)

```bash
./make-dmg.sh
```

This creates `build/RoadRash.dmg`. Open it and drag **Road Rash** into **Applications**.
The app is only ad-hoc signed, not notarized. On another Mac, the first launch needs right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**.

## Releasing a new version

1. Bump `CFBundleShortVersionString` in `macos/Info.plist` and `GAME_VERSION` in `web/game.js`, then run `./make-dmg.sh`.
2. Create the release: `gh release create vX.Y.Z build/RoadRash.dmg`.
3. In `Casks/roadrash.rb`, update `version` and `sha256` (from `shasum -a 256 build/RoadRash.dmg`), then push.

## Deploying the web version

`./deploy-web.sh` publishes the committed `web/` folder to the `gh-pages` branch, which GitHub Pages serves.

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
- Voices: the curses and hawker calls (`web/voices.js`) were generated with Meta's [MMS-TTS](https://huggingface.co/facebook/mms-tts-hin) models, [`facebook/mms-tts-hin`](https://huggingface.co/facebook/mms-tts-hin) and [`facebook/mms-tts-tam`](https://huggingface.co/facebook/mms-tts-tam), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (non-commercial use). They were trimmed, EQ'd and loudness-normalised. To rebuild them, see [`tools/voices/`](tools/voices/): `lines.json` holds each line's text and chosen take, and `make_voices.py` regenerates `web/voices.js` exactly.
- Animals (`web/animals.js`, trimmed and loudness-normalised):
  - Dog bark: ["Dog Bark 9"](https://freesound.org/s/853723/) by **AleXZavesa**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - Dog bark and growl: ["Animal Dog Bark And Growl 01"](https://freesound.org/s/625501/) by abhisheky948, CC0.
  - Cow moos: ["Cow moo #8"](https://freesound.org/s/513565/) by spurioustransients, CC0.
- Truck and bus horns (`web/horns.js`): cut from ["bus_india.WAV"](https://freesound.org/s/22721/) by **Anton** (a busy street in Jaipur), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Music: original compositions, synthesised in real time by the game.
- Engine sound: ["Auto Rickshaw - Start, Idle, Revving"](https://freesound.org/s/261051/) by **kalhan** (recorded at an NID sound-design workshop), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It was trimmed into a start clip plus idle and rev loops, level-adjusted and resampled (`web/sounds.js`).
