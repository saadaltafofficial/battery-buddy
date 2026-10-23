import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BAT = '/sys/class/power_supply/BAT0';
const DEMO = `${GLib.get_home_dir()}/.cache/battery-buddy-demo`;
const POLL_SECONDS = 3;
const CORNER_MARGIN = 18;

function readText(path) {
    try { return new TextDecoder().decode(GLib.file_get_contents(path)[1]).trim(); }
    catch (_) { return null; }
}

export default class BatteryBuddyPirate extends Extension {
    enable() {
        this._tickId = null;
        this._currentKind = null;
        this._corner = 0;
        this._lastDemo = null;
        this._animating = false;
        this._container = new St.BoxLayout({vertical: true, style_class: 'pirate-root', reactive: true, can_focus: true});
        const file = Gio.File.new_for_path(`${this.path}/pirate.png`);
        this._image = new St.Icon({gicon: new Gio.FileIcon({file}), icon_size: 190,
            style_class: 'pirate-image'});
        this._container.add_child(this._image);
        this._label = new St.Label({style_class: 'pirate-message', text: ''});
        this._container.add_child(this._label);
        this._action = new St.Button({label: 'Got it? Catch me!', style_class: 'pirate-button', can_focus: true});
        this._action.connect('clicked', () => this._hop());
        this._container.add_child(this._action);
        // The actor is the only clickable region; no fullscreen overlay and no giant modal.
        this._container.hide();
        Main.layoutManager.addTopChrome(this._container, {affectsStruts: false, trackFullscreen: true});
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._place(false));
        this._poll();
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _poll() {
        const demo = readText(DEMO);
        let kind = null;
        let pct = Number.parseInt(readText(`${BAT}/capacity`), 10);
        const status = readText(`${BAT}/status`)?.toLowerCase();
        if (demo) {
            const [requested, expiresText] = demo.split(' ');
            if (Number(expiresText) > Math.floor(Date.now() / 1000) && ['high', 'low'].includes(requested)) {
                kind = requested;
                pct = requested === 'high' ? 80 : 20;
            }
        }
        if (!kind) {
            if (pct >= 80 && ['charging', 'full'].includes(status)) kind = 'high';
            if (pct <= 20 && status === 'discharging') kind = 'low';
        }
        if (kind === this._currentKind) {
            if (kind) this._refreshLabel(kind, pct);
            return;
        }
        this._currentKind = kind;
        if (!kind) {
            this._container.remove_all_transitions();
            this._container.hide();
            return;
        }
        this._corner = 0;
        this._refreshLabel(kind, pct);
        this._container.show();
        this._place(false);
        this._container.opacity = 0;
        this._container.ease({opacity: 255, duration: 350, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _refreshLabel(kind, pct) {
        const s = kind === 'high' ? `🔌 ${pct}% — Unplug, mate!` : `⚡ ${pct}% — Plug me in!`;
        if (this._label.text !== s) this._label.text = s;
    }

    _place(animated) {
        if (!this._container || !this._currentKind) return;
        const mon = Main.layoutManager.primaryMonitor ?? Main.layoutManager.monitors[0];
        if (!mon) return;
        // Four positions, always within the actual primary monitor rectangle.
        const width = 230, height = 275;
        this._container.set_size(width, height);
        const x = (this._corner % 2 === 0) ? mon.x + CORNER_MARGIN : mon.x + mon.width - width - CORNER_MARGIN;
        const y = (this._corner < 2) ? mon.y + 45 : mon.y + mon.height - height - CORNER_MARGIN;
        if (!animated) { this._container.set_position(x, y); return; }
        this._container.remove_all_transitions();
        this._container.ease({x, y, duration: 520, mode: Clutter.AnimationMode.EASE_OUT_BACK});
    }

    _hop() {
        if (!this._currentKind) return;
        this._corner = (this._corner + 1) % 4;
        this._place(true);
    }

    disable() {
        if (this._tickId) { GLib.Source.remove(this._tickId); this._tickId = null; }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._container) {
            this._container.remove_all_transitions();
            Main.layoutManager.removeChrome(this._container);
            this._container.destroy();
            this._container = null;
        }
    }
}
