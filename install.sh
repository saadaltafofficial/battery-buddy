#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID='battery-buddy-pirate@ignis.local'
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEST" "$HOME/.cache"
install -m644 "$HERE/extension.js" "$HERE/metadata.json" "$HERE/stylesheet.css" "$HERE/pirate.png" "$DEST/"
# The old daemon opens duplicate large GTK windows; safely stop only its service.
if systemctl --user --quiet is-active battery-buddy.service; then
    systemctl --user disable --now battery-buddy.service
fi
printf '\nInstalled GNOME extension files to %s\n' "$DEST"
printf 'GNOME session: %s, Shell: ' "${XDG_SESSION_TYPE:-unknown}"
gnome-shell --version 2>/dev/null || true
printf '\nIMPORTANT: On Wayland, LOG OUT and LOG BACK IN once to load a newly installed extension.\n'
printf 'Then run: gnome-extensions enable %s\n' "$UUID"
printf 'Demo: %s/demo.sh high\n' "$HERE"
printf 'Disable: gnome-extensions disable %s\n' "$UUID"
