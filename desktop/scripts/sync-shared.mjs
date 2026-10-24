// Copies the code shared with the GNOME extension into app/shared/ and turns the
// GSettings schema into defaults.json, so both versions use the same settings.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'app', 'shared');

fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(path.join(out, 'sounds'), {recursive: true});
for (const file of ['engine.js', 'characters.js', 'personality.js']) {
    fs.copyFileSync(path.join(repo, file), path.join(out, file));
}
for (const file of fs.readdirSync(path.join(repo, 'sounds'))) {
    if (file.endsWith('.wav')) fs.copyFileSync(path.join(repo, 'sounds', file), path.join(out, 'sounds', file));
}

// Parse the handful of GVariant forms the schema uses: b, i, x, s, as.
function parseDefault(type, text) {
    text = text.trim();
    if (type === 'b') return text === 'true';
    if (type === 'i' || type === 'x') return Number(text);
    if (type === 's') return text.replace(/^'(.*)'$/s, '$1');
    if (type === 'as') return [...text.matchAll(/'([^']*)'/g)].map(m => m[1]);
    throw new Error(`Unsupported schema type ${type}`);
}

const xml = fs.readFileSync(path.join(repo, 'schemas', 'org.gnome.shell.extensions.battery-buddy.gschema.xml'), 'utf8');
const keys = {};
for (const m of xml.matchAll(/<key name="([^"]+)" type="([^"]+)">([\s\S]*?)<\/key>/g)) {
    const [, name, type, body] = m;
    const value = parseDefault(type, body.match(/<default>([\s\S]*?)<\/default>/)[1]);
    const range = body.match(/<range min="(-?\d+)" max="(-?\d+)"\/>/);
    const summary = body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '';
    keys[name] = {type, default: value, summary, ...(range ? {min: Number(range[1]), max: Number(range[2])} : {})};
}
// Desktop-only settings.
keys['start-at-login'] = {type: 'b', default: true, summary: 'Start Battery Buddy when you sign in'};

fs.writeFileSync(path.join(out, 'defaults.json'), JSON.stringify(keys, null, 2));
console.log(`Synced shared code and ${Object.keys(keys).length} settings into app/shared/`);
