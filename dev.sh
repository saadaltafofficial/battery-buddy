#!/usr/bin/env bash
# Run Battery Buddy in a separate, throwaway GNOME Shell so you can test changes
# without logging out. Your real session and settings are never touched: everything
# lives in ./dev/ (settings, cache, screenshots).
#
#   ./dev.sh                     windowed GNOME session in a window (needs mutter's devkit)
#   ./dev.sh demo <mode>         send a demo to the windowed session (high, low, party, …)
#   ./dev.sh shot [mode ...]     headless: run demos, save screenshots to dev/shots/
#                                mode can be a demo name, "prefs", or name:seconds to wait longer
#                                e.g. ./dev.sh shot high party ignore:25 celebrate prefs
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD/dev"
UUID='battery-buddy-pirate@ignis.local'
# Wayland socket paths must stay short, so the runtime dir lives under /run/user.
RUN="${XDG_RUNTIME_DIR:-/tmp}/bb-dev"

install_into() {
  local dest="$ROOT/data/gnome-shell/extensions/$UUID"
  rm -rf "$dest"
  mkdir -p "$dest/schemas" "$dest/sounds" "$dest/icons"
  cp extension.js engine.js battery.js characters.js indicator.js personality.js prefs.js metadata.json stylesheet.css "$dest/"
  cp sounds/*.wav "$dest/sounds/"
  cp icons/*.svg "$dest/icons/"
  cp schemas/*.gschema.xml "$dest/schemas/"
  glib-compile-schemas "$dest/schemas"
}

# A tiny helper extension that takes a screenshot whenever dev/shot-request appears.
install_shooter() {
  local dest="$ROOT/data/gnome-shell/extensions/bb-shooter@dev"
  mkdir -p "$dest"
  printf '{"uuid":"bb-shooter@dev","name":"bb shooter","description":"dev screenshots","shell-version":["46","47","48","49","50"]}\n' > "$dest/metadata.json"
  cat > "$dest/extension.js" <<JS
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Shooter extends Extension {
  enable() {
    this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
      const request = '$ROOT/shot-request';
      if (!GLib.file_test(request, GLib.FileTest.EXISTS)) return GLib.SOURCE_CONTINUE;
      const name = new TextDecoder().decode(GLib.file_get_contents(request)[1]).trim();
      GLib.unlink(request);
      const stream = Gio.File.new_for_path('$ROOT/shots/' + name + '.png').replace(null, false, Gio.FileCreateFlags.NONE, null);
      new Shell.Screenshot().screenshot(false, stream).then(() => stream.close(null)).catch(e => console.error(e));
      return GLib.SOURCE_CONTINUE;
    });
  }
  disable() { GLib.Source.remove(this._id); }
}
JS
}

prepare() {
  mkdir -p "$ROOT"/{data,cache,shots,config/glib-2.0/settings} "$RUN"
  chmod 700 "$RUN"
  install_into
  local extensions="'$UUID'"
  if [[ "${1:-}" == shooter ]]; then install_shooter; extensions="'$UUID', 'bb-shooter@dev'"; fi
  local keyfile="$ROOT/config/glib-2.0/settings/keyfile"
  # Keep any settings changed in earlier dev sessions; just make sure the extensions are enabled.
  python3 - "$keyfile" "$extensions" <<'PY'
import configparser, sys
path, extensions = sys.argv[1], sys.argv[2]
c = configparser.ConfigParser(interpolation=None)
c.optionxform = str
c.read(path)
if not c.has_section('org/gnome/shell'): c.add_section('org/gnome/shell')
c['org/gnome/shell']['enabled-extensions'] = f'[{extensions}]'
c['org/gnome/shell']['disable-user-extensions'] = 'false'
c['org/gnome/shell']['welcome-dialog-last-shown-version'] = "'999'"
with open(path, 'w') as f: c.write(f, space_around_delimiters=False)
PY
}

isolated() {
  env XDG_DATA_HOME="$ROOT/data" XDG_CONFIG_HOME="$ROOT/config" XDG_CACHE_HOME="$ROOT/cache" \
      XDG_RUNTIME_DIR="$RUN" GSETTINGS_BACKEND=keyfile "$@"
}

demo() {
  printf '%s %s\n' "$1" "$(($(date +%s)+45))" > "$ROOT/cache/battery-buddy-demo"
}

case "${1:-}" in
  "")
    if ! gnome-shell --help 2>&1 | grep -q -- '--devkit' || ! command -v mutter-devkit >/dev/null 2>&1; then
      echo "The windowed session needs mutter's devkit (GNOME 49+)."
      echo "On Ubuntu/Debian look for a package providing 'mutter-devkit', or use: ./dev.sh shot"
      exit 1
    fi
    prepare
    echo "Starting a test GNOME session. In another terminal: ./dev.sh demo party"
    isolated dbus-run-session -- gnome-shell --devkit --wayland 2>>"$ROOT/session.log"
    ;;
  demo)
    [[ -n "${2:-}" ]] || { echo 'Usage: ./dev.sh demo high|low|party|celebrate|ignore|stop'; exit 1; }
    mkdir -p "$ROOT/cache"
    if [[ "$2" == stop ]]; then rm -f "$ROOT/cache/battery-buddy-demo"; else demo "$2"; fi
    ;;
  shot)
    shift
    modes=("$@")
    [[ ${#modes[@]} -gt 0 ]] || modes=(high party ignore:25 celebrate prefs)
    prepare shooter
    rm -f "$ROOT/cache/battery-buddy-demo" "$ROOT/shot-request"
    # Everything below runs inside its own D-Bus session with the headless shell.
    isolated dbus-run-session -- bash 2>>"$ROOT/session.log" -c '
      ROOT="$1"; UUID="$2"; shift 2
      gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 > "$ROOT/shell.log" 2>&1 &
      shell=$!
      sleep 10
      shot() { echo "$1" > "$ROOT/shot-request"; sleep 1.5; }
      for spec in "$@"; do
        mode="${spec%%:*}"; wait="${spec#*:}"; [[ "$wait" == "$spec" ]] && wait=6
        if [[ "$mode" == prefs ]]; then
          WAYLAND_DISPLAY=wayland-0 gnome-extensions prefs "$UUID" >> "$ROOT/shell.log" 2>&1 || true
          sleep "$wait"; shot prefs
          continue
        fi
        printf "%s %s\n" "$mode" "$(($(date +%s)+45))" > "$ROOT/cache/battery-buddy-demo"
        sleep "$wait"; shot "$mode"
      done
      rm -f "$ROOT/cache/battery-buddy-demo"
      kill "$shell" 2>/dev/null; wait "$shell" 2>/dev/null || true
    ' _ "$ROOT" "$UUID" "${modes[@]}"
    echo "Screenshots in dev/shots/:"; ls "$ROOT/shots"
    if grep -E "JS ERROR|battery-buddy.*(Error|error)" "$ROOT/shell.log" >/dev/null; then
      echo; echo "Errors from the shell (full log in dev/shell.log):"
      grep -E -A3 "JS ERROR|battery-buddy.*(Error|error)" "$ROOT/shell.log" | head -40
    fi
    ;;
  *)
    sed -n '2,11p' "$0"; exit 1 ;;
esac
