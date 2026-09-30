# Road Rash: Rickshaw Rumble

Road Rash-style combat racing through Mumbai. Instead of a motorbike you drive an auto-rickshaw.

## Build & run the Mac app

```bash
./build.sh
open "build/Road Rash.app"
```

`build.sh` compiles a small native Cocoa/WKWebView shell (`macos/main.swift`) and bundles the game (`web/`) into `build/Road Rash.app`, then ad-hoc signs it.
If Xcode's license hasn't been accepted, the script falls back to the Command Line Tools toolchain.

To iterate on the game in a browser: `python3 -m http.server 8765 --directory web` and open http://localhost:8765.

## Controls

| Key | Action |
| --- | --- |
| ↑ / W | Accelerate |
| ↓ / S | Brake |
| ← → / A D | Steer |
| Z / J | Swing lathi left |
| X / K | Swing lathi right |
| H / Space | Horn (cows and traffic move aside) |
| P / Esc | Pause |
| M | Mute |
| ⌘R | Restart to title (Mac app) |
| ⌃⌘F | Full screen (Mac app) |

## Gameplay

- 4 Mumbai races, all with the Mumbai skyline behind them: Marine Drive (sunset), Bandra-Worli Sea Link (night), Western Express Highway (hazy afternoon) and Juhu Beach Road (morning).
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
