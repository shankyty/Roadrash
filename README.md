# Road Rash: Rickshaw Rumble

Road Rash-style combat racing through Mumbai, Hyderabad, Delhi and Chennai. Instead of a motorbike you drive an auto-rickshaw.

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
| Horn (cows and traffic move aside) | Space, W or S | Space, ↑ or ↓ |

Also: **P** or **Esc** pauses, **M** mutes. In the Mac app, **⌘R** restarts to the title screen and **⌃⌘F** toggles full screen.

## Gameplay

- 7 races across 4 cities, each with its own skyline:
  - **Mumbai**: Marine Drive, Bandra-Worli Sea Link (night), Western Express Highway and Juhu Beach Road, with the Gateway of India, Taj, Rajabai Tower and Sea Link behind.
  - **Hyderabad**: Charminar Road, with Charminar, Golconda Fort, HITEC City and the Hussain Sagar Buddha behind.
  - **Delhi**: Ring Road, with India Gate, Qutub Minar, Red Fort, the Lotus Temple and Jama Masjid behind.
  - **Chennai**: Marina Beach Road, with the Kapaleeshwarar gopuram, the lighthouse and Chennai Central behind.
- Pick any unlocked race on the title screen with ← →.
- Drivers who take a lathi hit shout back in their city's street slang: Bambaiya, Dakhni, Dilli or Tamil.
- The engine is a synthesised two-stroke: *phut-phut* at idle, a buzz when revved, and a misfiring burble off the gas.
- Finish in the top 3 to qualify for the next race. Prize money and a ₹100 bonus for each rival you knock out go into your wallet, which is saved between sessions.
- Rival autos catch up, ride alongside you and hit you with their own lathis. If your health runs out, you're knocked out for a few seconds.
- Watch out for cows, buses, trucks and cars. Crashing into roadside objects wrecks you.
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
