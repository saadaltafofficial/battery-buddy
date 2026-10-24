#!/usr/bin/env bash
set -euo pipefail
UUID='battery-buddy-pirate@ignis.local'
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

if command -v gnome-extensions >/dev/null 2>&1; then
  gnome-extensions disable "$UUID" 2>/dev/null || true
fi

if [[ -d "$DEST" ]]; then
  rm -rf "$DEST"
  printf 'Removed %s\n' "$DEST"
else
  printf 'Battery Buddy is not installed at %s\n' "$DEST"
fi

rm -f "$HOME/.cache/battery-buddy-demo"

if [[ "${1:-}" == "--purge" ]]; then
  dconf reset -f /org/gnome/shell/extensions/battery-buddy/ 2>/dev/null || true
  printf 'Cleared saved Battery Buddy settings.\n'
else
  printf 'Saved settings were kept. Run ./uninstall.sh --purge to clear them too.\n'
fi
printf 'Log out and back in to fully unload it from GNOME Shell.\n'
