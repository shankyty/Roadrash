# Changelog

## v2.0.0: Rickshaw Rumble goes all-India 🛺🇮🇳

### New cities
The game now has 7 races across 4 cities. Each city has its own hand-painted skyline, time of day, road colours and local billboards.
- **Hyderabad · Charminar Road** at golden hour: Charminar, Golconda Fort, HITEC City's Cyber Towers, the Buddha statue in Hussain Sagar, and Birla Mandir. The billboards advertise Hyderabadi Biryani and Irani Chai.
- **Delhi · Ring Road** on a hazy winter morning: India Gate, Qutub Minar, Red Fort, the Lotus Temple, Rashtrapati Bhavan and Jama Masjid. The billboards advertise Chole Bhature and Paranthe Wali Gali.
- **Chennai · Marina Beach Road** at blazing midday: the Kapaleeshwarar gopuram, the Marina lighthouse, the LIC building and Chennai Central, plus the beach with catamarans. The billboards advertise Filter Kaapi and Idli-Dosa-Vada.
- The Mumbai races (Marine Drive, Bandra-Worli Sea Link, Western Express Highway and Juhu Beach Road) now alternate with the new cities.

### Drivers talk back
Anyone who takes a lathi hit, you or a rival, shouts back in a speech bubble using the local street slang of the race's city:
- Mumbai: *"Abe O Hero!"*, *"Waat laga dunga!"*
- Hyderabad: *"Kya re miyan!"*, *"Nakko re!"*
- Delhi: *"Oye! Jaanta hai mera baap kaun hai?"*
- Chennai: *"Dei! Enna da?!"*, *"Aiyyo!"*

### Real two-stroke engine sound
The old engine sounded like a car. The new one is synthesised as a single-cylinder two-stroke:
- Separate *phut-phut-phut* pops at idle.
- A nasal buzz when you rev it, with a tinny body-panel rattle.
- A misfiring *ring-ding-ding* burble when you lift off the gas.

### Two-hand controls
One hand drives and the other swings the lathi. The key you press matches the direction of the swing.

| Layout | Drive | Lathi | Horn |
| --- | --- | --- | --- |
| Arrows drive (default) | ← ↑ → ↓ | **A** swings left, **D** swings right | Space / W / S |
| WASD drive | W A S D | **←** swings left, **→** swings right | Space / ↑ / ↓ |

Press **Tab** on the title or pause screen to switch layouts. The title and pause screens show a two-hand controls diagram.

### Track select
Use ← → on the title screen to pick any race you've unlocked. Finish in the top 3 to unlock the next one.

### Mac app
- Universal build that runs natively on both Apple Silicon and Intel Macs.
- Requires macOS 13 (Ventura) or later.

### Upgrading
```bash
brew upgrade --cask roadrash
```
New install:
```bash
brew tap shankyty/roadrash https://github.com/shankyty/Roadrash
brew install --cask roadrash
```
Or download **RoadRash.dmg** below and drag it to Applications.

Your wallet and settings carry over from v1.

## v1.0.0
- First release: an auto-rickshaw Road Rash through 4 Mumbai races, with lathi fights, cows and traffic, tip-over physics, and a Mac app installable via DMG or Homebrew.
