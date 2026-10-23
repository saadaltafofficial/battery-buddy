#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python3 - <<'PY'
import pathlib,zipfile
root=pathlib.Path('.')
files=['extension.js','prefs.js','metadata.json','stylesheet.css','schemas/org.gnome.shell.extensions.battery-buddy.gschema.xml']
with zipfile.ZipFile('dist/battery-buddy-gnome.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in files:z.write(root/name,name)
print('Created dist/battery-buddy-gnome.zip')
PY
