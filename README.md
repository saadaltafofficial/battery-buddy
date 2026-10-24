# Battery Buddy — Desktop Companions

A configurable GNOME Shell extension that makes battery reminders difficult to ignore, without changing your laptop's charging controls. Works on GNOME Wayland and X11 using GNOME Shell actors.

## Features

- **Adjustable thresholds:** unplug while charging at 80% and plug in while discharging at 20% by default
- **8 animated companions:** pirate, cat, robot, ghost, dragon, penguin, fox, owl — original vector drawings (`characters.js`) with walk cycles, blinking, wagging tails and flapping wings
- **Moods:** the buddy is excited (sparkles, happy hops, dragon fire puffs) when you should unplug and tired (sleepy eyes, sweat drop, slower walk) when you should charge
- **Personality:** every character speaks its own lines (`personality.js`) in a comic speech bubble; a small pill under its feet shows the battery level, what to do, and time left ("18% · plug in · 40m left")
- **Squash & stretch:** buddies crouch before a jump, stretch in the air, squish when they land, and breathe while idle
- **Top bar menu:** battery status, streak and battery health at a glance; snooze for 15 minutes or an hour; summon your buddy; open preferences
- **Quiet times:** stays hidden while you share or record your screen, and during Do Not Disturb
- **Short visits:** pops in to cheer when you plug in, yawns when the laptop wakes from suspend, and sweats when the CPU passes 85 °C
- **Party chat:** in party mode, buddies that meet say hello to each other
- **Gets pushier when ignored:** after 2 minutes it hurries and grumbles, after 5 it follows your mouse, after 10 it stomps in the middle of the screen and a second buddy turns up to help
- **Victory dance:** fix the charger and the buddy does a backflip in a burst of confetti, thanks you, and walks off
- **Click reactions:** left-click to make it jump, click 5 times quickly to make it dizzy (spiral eyes, wobbly walk), right-click to pet it (heart)
- **Mini-game:** a dizzy buddy drops a bonus battery; click it within 3 seconds for an extra streak point
- **Stats and streaks:** the Stats tab in preferences tracks reminders fixed in time, your streak, this week, and how often you unplugged before 100%
- **Accessories:** sunglasses at a 10-reminder streak, a crown at 30
- **Weekly report:** a notification on Sunday evening summing up your week
- **Battery health:** a daily reading of how much charge the battery still holds versus new, with a chart in the Stats tab
- **Multiple batteries:** laptops with BAT0 and BAT1 are treated as one battery
- **Unlockable buddies:** start with pirate, cat and robot; earn penguin, fox, owl and dragon by fixing reminders (and find the secret way to get the ghost), or switch on "Unlock everyone now"
- **Seasonal touches:** pumpkin around Halloween, Santa hat in December, party hat on New Year, sleepy Zzz after midnight
- **Sounds (off by default):** a short synthesized noise for each buddy, plus jump and victory sounds (`tools/make-sounds.py` regenerates them)
- **Roaming:** the buddy walks to random spots on the screen, pauses, looks around, then wanders on; click it and it jumps somewhere else
- **Placement:** primary monitor, first non-primary monitor, or monitor under pointer; edge margin keeps it away from screen edges
- **Appearance:** character size, interaction hint, walking speed, jump duration, and a live animated preview in preferences
- **Efficiency:** configurable 2–60 second poll interval; sysfs battery state only, no network requests
- **Demo mode:** preview both kinds of reminders without changing charging state

## Install locally

```bash
sudo apt install libglib2.0-bin
./install.sh
# On GNOME Wayland log out and log back in once for first-time registration
gnome-extensions enable battery-buddy-pirate@ignis.local
gnome-extensions prefs battery-buddy-pirate@ignis.local
./demo.sh high        # "unplug" reminder
./demo.sh low         # "plug in" reminder
./demo.sh party       # every buddy on screen at once
./demo.sh celebrate   # reminder, then the victory dance
./demo.sh ignore      # fast-forward through the "you're ignoring me" stages (~20 s)
./demo.sh stop
```

**Important:** the `demo.sh` script is for local testing and is not included in the GNOME Extensions upload ZIP. The demo request expires after 45 seconds.e

## Uninstall

```bash
./uninstall.sh          # disable and remove the extension, keep your settings
./uninstall.sh --purge  # also clear saved settings
```

Log out and back in afterwards so GNOME Shell fully unloads it.

## Build a GNOME Extensions submission ZIP

```bash
./package.sh
```

Upload the generated `dist/battery-buddy-gnome.zip` at https://extensions.gnome.org/upload/ after you have tested GNOME compatibility and reviewed/maintained the code. **This repository is not published or approved on extensions.gnome.org yet.** The local installer also needs logout/login for initial GNOME Shell discovery on Wayland.

## Notes and limitations

- This does not set an HP firmware charge threshold or switch off the power adapter. It only reminds you.
- Battery data comes straight from `/sys/class/power_supply/BAT*`. Time estimates and health need the kernel to report energy (or charge) and power values; some laptops don't, and then those parts are simply hidden.
- GNOME top chrome is confined to the selected monitor. The panel is intentionally small, but it can overlap desktop windows while visible.
- The earlier Captain Hook-derived image is excluded from distribution due to copyright concerns.
- Generated with AI for personal use. Before submitting to GNOME Extensions, review and understand the JavaScript and maintain it yourself.

## Development

GNOME Shell on Wayland can't reload extension code, so changes to `extension.js`, `characters.js`, `personality.js`, `battery.js` or `indicator.js` normally need a log out. `dev.sh` avoids that by starting a separate, throwaway GNOME Shell with its own settings in `dev/`:

```bash
./dev.sh shot                               # headless: run demos and save screenshots to dev/shots/
./dev.sh shot high party ignore:25 prefs    # pick demos; name:seconds waits longer before the screenshot
./dev.sh                                    # a full test session in a window (needs mutter's devkit)
./dev.sh demo party                         # send a demo to that windowed session
```

Changes to `prefs.js` only need the preferences window closed and reopened.

`node --check extension.js && node --check prefs.js` checks JavaScript syntax; it does **not** establish compatibility with a live GNOME Shell. Run a real GNOME 50 session test and inspect `journalctl --user -b` if an extension error occurs.

License: GPL-3.0-or-later.
