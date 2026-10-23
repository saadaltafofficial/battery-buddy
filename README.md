# Battery Buddy — Desktop Companions

A configurable GNOME Shell extension that makes battery reminders difficult to ignore, without changing your laptop's charging controls. Works on GNOME Wayland and X11 using GNOME Shell actors.

## Features

- **Adjustable thresholds:** unplug while charging at 80% and plug in while discharging at 20% by default
- **8 companions:** pirate, cat, robot, ghost, dragon, penguin, fox, owl (system emoji glyphs, no copyrighted character art)
- **Placement:** primary monitor, first non-primary monitor, or monitor under pointer; four starting corners and edge margin
- **Movement:** jump between four corners on click, optional hop animations and duration control
- **Appearance:** change character size and interaction hint
- **Efficiency:** configurable 2–60 second poll interval; sysfs battery state only, no network requests
- **Demo mode:** preview both kinds of reminders without changing charging state

## Install locally

```bash
sudo apt install libglib2.0-bin
./install.sh
# On GNOME Wayland log out and log back in once for first-time registration
gnome-extensions enable battery-buddy-pirate@ignis.local
gnome-extensions prefs battery-buddy-pirate@ignis.local
./demo.sh high
./demo.sh low
./demo.sh stop
```

**Important:** the `demo.sh` script is for local testing and is not included in the GNOME Extensions upload ZIP. The demo request expires after 45 seconds.

## Build a GNOME Extensions submission ZIP

```bash
./package.sh
```

Upload the generated `dist/battery-buddy-gnome.zip` at https://extensions.gnome.org/upload/ after you have tested GNOME compatibility and reviewed/maintained the code. **This repository is not published or approved on extensions.gnome.org yet.** The local installer also needs logout/login for initial GNOME Shell discovery on Wayland.

## Notes and limitations

- This does not set an HP firmware charge threshold or switch off the power adapter. It only reminds you.
- It uses the first available `/sys/class/power_supply/BAT*` battery, which is appropriate for most laptops. It does not yet combine multiple batteries.
- GNOME top chrome is confined to the selected monitor. The panel is intentionally small, but it can overlap desktop windows while visible.
- System emoji rendering depends on your installed fonts.
- The earlier Captain Hook-derived image is excluded from distribution due to copyright concerns.
- Generated with AI for personal use. Before submitting to GNOME Extensions, review and understand the JavaScript and maintain it yourself.

## Development

`node --check extension.js && node --check prefs.js` checks JavaScript syntax; it does **not** establish compatibility with a live GNOME Shell. Run a real GNOME 50 session test and inspect `journalctl --user -b` if an extension error occurs.

License: GPL-3.0-or-later.
