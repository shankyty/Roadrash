# Road Rash: Rickshaw Rumble

Road Rash-style combat racing through Mumbai, Hyderabad, Delhi and Chennai. Instead of a motorbike you drive an auto-rickshaw.

## Play in the browser

**https://shankyty.github.io/Roadrash/**

No install needed. It works on any desktop browser, and on phones and tablets in landscape with on-screen touch controls.

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

**Esc** or **P** during a race opens the menu: **Resume**, **Restart race** or **Quit to main menu**. Use ↑/↓ and Enter to choose, or click an option. On the results screen, **Enter** continues and **Esc** returns to the main menu. **M** mutes all sound, and **N** turns the music on or off.

In the Mac app's **Game** menu: Pause/Resume (⌘P), Restart Race (⌘R), Quit to Main Menu (⇧⌘M), Reload Game (⇧⌘R). **⌃⌘F** toggles full screen.

## Gameplay

- 7 races across 4 cities, each with its own skyline:
  - **Mumbai**: Marine Drive, Bandra-Worli Sea Link (night), Western Express Highway and Juhu Beach Road, with the Gateway of India, Taj, Rajabai Tower and Sea Link behind.
  - **Hyderabad**: Charminar Road, with Charminar, Golconda Fort, HITEC City and the Hussain Sagar Buddha behind.
  - **Delhi**: Ring Road, with India Gate, Qutub Minar, Red Fort, the Lotus Temple and Jama Masjid behind.
  - **Chennai**: Marina Beach Road, with the Kapaleeshwarar gopuram, the lighthouse and Chennai Central behind.
- All 7 races are open from the start: pick any of them on the title screen with ← →.
- Drivers who take a lathi hit shout back in their city's street slang: Bambaiya, Dakhni, Dilli or Tamil.
- Hawkers at chai stalls and shops call out as you pass, in local lingo: *"Vada pav! Garam garam!"*, *"Irani chai, aao miyan!"*, *"Chole bhature, aa jao!"*, *"Kaapi! Kaapi!"*.
- Each city has its own background music, all original and generated live in the browser: filmi dholak (Mumbai), qawwali (Hyderabad), bhangra (Delhi) and kuthu with a nadaswaram-style reed (Chennai). Press **N** to turn it on or off.
- Real street and market recordings play in the background of each city, louder where the road is lined with shops.
- The engine is a real Bajaj auto-rickshaw recording: a kick-start at race start, then idle and rev loops that pitch up with your speed.
- Finish in the top 3 to qualify, and **Enter** on the results screen takes you straight to the next race. Prize money and a ₹100 bonus for each rival you knock out go into your wallet, which is saved between sessions.
- Rival autos catch up, ride alongside you and hit you with their own lathis. If your health runs out, you're knocked out for a few seconds.
- Watch out for cows, buses, trucks and cars. Crashing into roadside objects wrecks you.
- Stray dogs sleep in the middle of the road, trot across it, and chase your auto barking *"BHOW BHOW!"*. Roadside dogs often sprint alongside your auto for a while, sometimes in pairs. They always leap clear and never get hurt, but swerving around one costs you speed. Honk to wake them and send them off the road.
- Autos only have three wheels, so taking a sharp turn at full speed makes you lean. If you stay in the red, you tip over.
- Clear all 4 races to become **Auto King of India**. Each new tour after that is harder.

## Installer (DMG)

```bash
./make-dmg.sh
```

This creates `build/RoadRash.dmg`. Open it and drag **Road Rash** into **Applications**.
The app is only ad-hoc signed, not notarized. On another Mac, the first launch needs right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**.

## Releasing a new version

1. Bump `CFBundleShortVersionString` in `macos/Info.plist`, then run `./make-dmg.sh`.
2. Create the release: `gh release create vX.Y.Z build/RoadRash.dmg`.
3. In `Casks/roadrash.rb`, update `version` and `sha256` (from `shasum -a 256 build/RoadRash.dmg`), then push.

## Deploying the web version

`./deploy-web.sh` publishes the committed `web/` folder to the `gh-pages` branch, which GitHub Pages serves.

## Credits

- Street ambience (trimmed, loudness-normalised loops in `web/ambience-*.js`):
  - Mumbai: ["Mumbai - Market"](https://freesound.org/s/453005/) by Lenguaverde, CC0.
  - Delhi: ["India Streets NewDelhi City"](https://freesound.org/s/263636/) by Alcappuccino, CC0.
  - Chennai: ["Chennai (India) Traffic Ambience 01"](https://freesound.org/s/465712/) by **Nielsvdb**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - Hyderabad: ["Street Ambience India"](https://freesound.org/s/509181/) by guidofm (recorded in Pune), CC0.
- Music: original compositions, synthesised in real time by the game.
- Engine sound: ["Auto Rickshaw - Start, Idle, Revving"](https://freesound.org/s/261051/) by **kalhan** (recorded at an NID sound-design workshop), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It was trimmed into a start clip plus idle and rev loops, level-adjusted and resampled (`web/sounds.js`).
