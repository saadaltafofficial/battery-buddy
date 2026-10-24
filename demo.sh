#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
 high|low|party|celebrate|ignore) ;;
 stop) rm -f "$HOME/.cache/battery-buddy-demo"; exit 0 ;;
 *)
  cat <<'USAGE'
Usage: ./demo.sh <mode>
  high       "unplug" reminder
  low        "plug in" reminder
  party      every buddy on screen at once
  celebrate  reminder, then the victory dance a few seconds later
  ignore     fast-forward through the "you're ignoring me" stages (about 20 s)
  stop       end the demo
USAGE
  exit 1 ;;
esac
mkdir -p "$HOME/.cache"
printf '%s %s\n' "$1" "$(($(date +%s)+45))" > "$HOME/.cache/battery-buddy-demo"
echo "Showing the $1 demo for up to 45 seconds. Click to jump, right-click to pet, click 5 times fast to make it dizzy."
