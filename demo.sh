#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
 high|low) ;;
 stop) rm -f "$HOME/.cache/battery-buddy-demo"; exit 0 ;;
 *) echo 'Usage: ./demo.sh high|low|stop'; exit 1 ;;
esac
mkdir -p "$HOME/.cache"
printf '%s %s\n' "$1" "$(($(date +%s)+45))" > "$HOME/.cache/battery-buddy-demo"
echo "Showing $1 demo for up to 45 seconds. Click the character or button to make him jump."
