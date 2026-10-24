// Settings saved as JSON in the user's app-data folder, validated against the
// same keys, types and ranges as the GNOME schema (app/shared/defaults.json).
import fs from 'node:fs';
import path from 'node:path';

export class Store {
    constructor(file, defaults) {
        this.file = file;
        this.defaults = defaults;
        this.values = {};
        this._listeners = new Set();
        this._timer = null;
        let saved = {};
        try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
        for (const [key, spec] of Object.entries(defaults)) {
            this.values[key] = key in saved ? this._coerce(key, saved[key]) : structuredClone(spec.default);
        }
    }

    get(key) {
        return this.values[key];
    }

    all() {
        return structuredClone(this.values);
    }

    set(key, value) {
        if (!(key in this.defaults)) throw new Error(`Unknown setting ${key}`);
        value = this._coerce(key, value);
        if (JSON.stringify(value) === JSON.stringify(this.values[key])) return;
        this.values[key] = value;
        this._save();
        for (const fn of this._listeners) fn(key, value);
    }

    reset(key) {
        this.set(key, structuredClone(this.defaults[key].default));
    }

    onChange(fn) {
        this._listeners.add(fn);
    }

    _coerce(key, value) {
        const spec = this.defaults[key];
        switch (spec.type) {
        case 'b':
            return Boolean(value);
        case 'i':
        case 'x': {
            let n = Math.round(Number(value));
            if (!Number.isFinite(n)) n = spec.default;
            if (spec.min !== undefined) n = Math.max(spec.min, n);
            if (spec.max !== undefined) n = Math.min(spec.max, n);
            return n;
        }
        case 'as':
            return Array.isArray(value) ? value.map(String) : structuredClone(spec.default);
        default:
            return String(value ?? spec.default);
        }
    }

    // Write at most every 200 ms, atomically, so a crash never leaves half a file.
    _save() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), 200);
    }

    flush() {
        clearTimeout(this._timer);
        this._timer = null;
        fs.mkdirSync(path.dirname(this.file), {recursive: true});
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2));
        fs.renameSync(tmp, this.file);
    }
}
