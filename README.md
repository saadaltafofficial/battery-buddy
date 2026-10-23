# Battery Buddy Pirate (GNOME Shell / Wayland)

A **real GNOME Shell desktop extension** for the HP OMEN running Ubuntu 26.04. Small cutout of your supplied pirate; no big background window. The pirate hops between four **primary monitor** corners whenever clicked. It disappears when the battery condition is corrected, not when clicked. Polls sysfs every 3 seconds.

Conditions: **80%+ and charging/full** → unplug; **20%- and discharging** → plug in. No power-system changes are made.

## Install/update

```bash
cd ~/Downloads
unzip -o battery-buddy-pirate.zip
cd battery-buddy-pirate
./install.sh
```

On **GNOME Wayland**, **log out and back in** to load a new extension. Then:

```bash
gnome-extensions enable battery-buddy-pirate@ignis.local
./demo.sh high
./demo.sh low
./demo.sh stop
```

If not visible, check `gnome-extensions list`, `gnome-extensions info battery-buddy-pirate@ignis.local` and GNOME Shell logs: `journalctl --user -b /usr/bin/gnome-shell --no-pager -n 100` (service exec path may differ).

## Disable

```bash
gnome-extensions disable battery-buddy-pirate@ignis.local
```

To restore the older popup daemon (if still installed): `systemctl --user enable --now battery-buddy.service`.

## Notes

- New extension loading on Wayland generally needs one log-out/log-in; `Alt+F2 r` is not a safe replacement on Wayland.
- The character appears on the *primary* monitor, not both. It doesn't block the rest of the desktop.
- This app only observes battery state. It cannot cap charging on HP hardware.
- The transparent character is extracted from your uploaded reference image, not the rendered desktop mockup.
- A third-party GNOME extension executes inside the GNOME Shell process; disable it if you observe shell issues. This build is not yet tested on your machine.
