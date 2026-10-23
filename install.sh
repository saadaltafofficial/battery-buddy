#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
UUID='battery-buddy-pirate@ignis.local'
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEST/schemas"
install -m644 extension.js prefs.js metadata.json stylesheet.css "$DEST/"
install -m644 schemas/*.gschema.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas"
if systemctl --user --quiet is-active battery-buddy.service; then
  systemctl --user disable --now battery-buddy.service
fi
printf 'Installed Battery Buddy v3 to %s\n' "$DEST"
printf 'Log out and log back in after a first-time install on Wayland.\n'
printf 'Then run: gnome-extensions enable %s\n' "$UUID"
printf 'Preferences: gnome-extensions prefs %s\n' "$UUID"
