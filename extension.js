// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const DEMO = `${GLib.get_user_cache_dir()}/battery-buddy-demo`;
const CHARACTERS = {pirate: '🏴‍☠️', cat: '🐈', robot: '🤖', ghost: '👻', dragon: '🐉', penguin: '🐧', fox: '🦊', owl: '🦉'};

function readFile(path) {
    try { return new TextDecoder().decode(GLib.file_get_contents(path)[1]).trim(); }
    catch { return null; }
}

function batteryInfo() {
    const root = '/sys/class/power_supply';
    const dir = GLib.Dir.open(root, 0);
    let name;
    while ((name = dir.read_name()) !== null) {
        if (!name.startsWith('BAT')) continue;
        const capacity = Number.parseInt(readFile(`${root}/${name}/capacity`), 10);
        const status = readFile(`${root}/${name}/status`)?.toLowerCase();
        if (Number.isFinite(capacity) && status) return {capacity, status};
    }
    return null;
}

export default class BatteryBuddy extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._current = null;
        this._corner = 0;
        this._source = null;
        this._settingsId = this._settings.connect('changed', () => { this._configure(); this._check(); });
        this._monitorId = Main.layoutManager.connect('monitors-changed', () => this._place(false));
        this._widget = new St.BoxLayout({vertical: true, style_class: 'battery-buddy', reactive: true, can_focus: true});
        this._character = new St.Label({style_class: 'battery-buddy-character', text: '🏴‍☠️'});
        this._title = new St.Label({style_class: 'battery-buddy-title', text: ''});
        this._hint = new St.Label({style_class: 'battery-buddy-hint', text: 'Click to make me move'});
        this._widget.add_child(this._character);
        this._widget.add_child(this._title);
        this._widget.add_child(this._hint);
        this._widget.connect('button-press-event', () => { this._hop(); return Clutter.EVENT_STOP; });
        this._widget.hide();
        Main.layoutManager.addTopChrome(this._widget, {affectsStruts: false, trackFullscreen: true});
        this._configure();
        this._check();
    }

    _configure() {
        if (this._source) { GLib.Source.remove(this._source); this._source = null; }
        const seconds = this._settings.get_int('check-interval');
        this._source = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._check();
            return GLib.SOURCE_CONTINUE;
        });
        if (this._widget) this._place(false);
    }

    _demoKind() {
        const data = readFile(DEMO);
        if (!data) return null;
        const [kind, expiry] = data.split(/\s+/);
        return ['high', 'low'].includes(kind) && Number(expiry) > Date.now() / 1000 ? kind : null;
    }

    _check() {
        if (!this._widget) return;
        const battery = batteryInfo();
        const demo = this._demoKind();
        let kind = null;
        let pct = battery?.capacity ?? 0;
        if (demo) { kind = demo; pct = demo === 'high' ? this._settings.get_int('high-threshold') : this._settings.get_int('low-threshold'); }
        else if (battery && this._settings.get_boolean('alerts-enabled')) {
            if (pct >= this._settings.get_int('high-threshold') && ['charging', 'full'].includes(battery.status)) kind = 'high';
            if (pct <= this._settings.get_int('low-threshold') && battery.status === 'discharging') kind = 'low';
        }
        if (!kind) {
            this._current = null;
            this._widget.remove_all_transitions();
            this._widget.hide();
            return;
        }
        const changed = kind !== this._current;
        this._current = kind;
        const character = this._settings.get_string('character');
        this._character.text = CHARACTERS[character] ?? CHARACTERS.pirate;
        this._title.text = kind === 'high' ? `${pct}% · Unplug charger!` : `${pct}% · Plug in charger!`;
        this._hint.visible = this._settings.get_boolean('show-hint');
        this._widget.set_style(`font-size: ${this._settings.get_int('character-size')}px;`);
        if (changed) {
            this._corner = this._settings.get_int('start-corner');
            this._widget.show();
            this._place(false);
            this._widget.opacity = 0;
            this._widget.ease({opacity: 255, duration: 250, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else this._place(false);
    }

    _monitor() {
        const monitors = Main.layoutManager.monitors;
        if (!monitors?.length) return null;
        const option = this._settings.get_string('monitor');
        if (option === 'external') return monitors.find(m => m !== Main.layoutManager.primaryMonitor) ?? monitors[0];
        if (option === 'pointer') {
            const [x, y] = global.get_pointer();
            return monitors.find(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ?? monitors[0];
        }
        return Main.layoutManager.primaryMonitor ?? monitors[0];
    }

    _place(animate) {
        if (!this._widget || !this._current) return;
        const monitor = this._monitor();
        if (!monitor) return;
        const size = this._settings.get_int('character-size');
        const width = Math.max(170, size + 35), height = size + 92;
        const margin = this._settings.get_int('edge-margin');
        this._widget.set_size(width, height);
        const x = this._corner % 2 === 0 ? monitor.x + margin : monitor.x + monitor.width - width - margin;
        const y = this._corner < 2 ? monitor.y + margin + 34 : monitor.y + monitor.height - height - margin;
        this._widget.remove_all_transitions();
        if (animate && this._settings.get_boolean('animate-hops'))
            this._widget.ease({x, y, duration: this._settings.get_int('hop-duration'), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else this._widget.set_position(x, y);
    }

    _hop() {
        if (!this._current) return;
        this._corner = (this._corner + 1) % 4;
        this._place(true);
    }

    disable() {
        if (this._source) GLib.Source.remove(this._source);
        if (this._settingsId) this._settings.disconnect(this._settingsId);
        if (this._monitorId) Main.layoutManager.disconnect(this._monitorId);
        if (this._widget) {
            this._widget.remove_all_transitions();
            Main.layoutManager.removeChrome(this._widget);
            this._widget.destroy();
        }
        this._widget = null;
        this._settings = null;
        this._source = null;
        this._settingsId = null;
        this._monitorId = null;
    }
}
