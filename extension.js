// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
//
// GNOME Shell side of Battery Buddy: draws buddies with St/Clutter, reads settings
// from GSettings and hands everything else to the shared engine (engine.js).
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {batteryInfo, cpuTemperature, readFile} from './battery.js';
import {drawCharacter} from './characters.js';
import {Engine} from './engine.js';
import {BuddyIndicator} from './indicator.js';

const DEMO = `${GLib.get_user_cache_dir()}/battery-buddy-demo`;
const OUTLINE = [0x23 / 255, 0x27 / 255, 0x33 / 255];
const monotonic = () => GLib.get_monotonic_time() / 1e6;

// St.BoxLayout switched from `vertical` to `orientation` in GNOME 48.
function verticalBox(params) {
    const box = new St.BoxLayout(params);
    if ('orientation' in box) box.orientation = Clutter.Orientation.VERTICAL;
    else box.vertical = true;
    return box;
}

function roundRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

// GSettings with plain JS values in and out, whatever the key's type.
class SettingsStore {
    constructor(settings) {
        this._settings = settings;
        this._types = new Map();
    }

    get(key) {
        return this._settings.get_value(key).recursiveUnpack();
    }

    set(key, value) {
        if (!this._types.has(key)) this._types.set(key, this._settings.settings_schema.get_key(key).get_value_type().dup_string());
        this._settings.set_value(key, new GLib.Variant(this._types.get(key), value));
    }
}

// The cartoon speech bubble: white, outlined, with a tail pointing down at the buddy.
const PAD_X = 12, PAD_Y = 7, TAIL = 10, STROKE = 2.4;

class Speech {
    constructor(maxWidth) {
        this.maxWidth = maxWidth;
        this.text = '';
        this.actor = new St.DrawingArea({x_align: Clutter.ActorAlign.CENTER, visible: false});
        this.actor.connect('repaint', area => this._paint(area));
    }

    set(text) {
        if (text === this.text) return;
        this.text = text;
        this.actor.visible = Boolean(text);
        if (!text) return;
        const font = St.ThemeContext.get_for_stage(global.stage).get_font().copy();
        font.set_weight(Pango.Weight.BOLD);
        const layout = this.actor.create_pango_layout(text);
        layout.set_font_description(font);
        layout.set_alignment(Pango.Alignment.CENTER);
        layout.set_wrap(Pango.WrapMode.WORD_CHAR);
        layout.set_width((this.maxWidth - 2 * PAD_X - 2 * STROKE) * Pango.SCALE);
        // Shrink the layout to the text so short lines get a snug bubble.
        const [w] = layout.get_pixel_size();
        layout.set_width((w + 1) * Pango.SCALE);
        const [, h] = layout.get_pixel_size();
        this._layout = layout;
        this.actor.set_size(Math.ceil(w + 1 + 2 * PAD_X + 2 * STROKE), Math.ceil(h + 2 * PAD_Y + 2 * STROKE + TAIL));
        this.actor.queue_repaint();
    }

    _paint(area) {
        const cr = area.get_context();
        const [sw] = area.get_surface_size();
        const width = this.actor.width, height = this.actor.height;
        if (width > 0) cr.scale(sw / width, sw / width);
        const x = STROKE, y = STROKE, w = width - 2 * STROKE, h = height - 2 * STROKE - TAIL;
        const r = Math.min(16, h / 2), cx = width / 2;
        cr.newPath();
        cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
        cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
        cr.lineTo(cx + 7, y + h);
        cr.lineTo(cx + 1, y + h + TAIL);
        cr.lineTo(cx - 6, y + h);
        cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
        cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
        cr.closePath();
        cr.setSourceRGB(1, 1, 1);
        cr.fillPreserve();
        cr.setSourceRGB(...OUTLINE);
        cr.setLineWidth(STROKE);
        cr.setLineJoin(1);
        cr.stroke();
        if (this._layout) {
            cr.moveTo(x + PAD_X, y + PAD_Y);
            PangoCairo.show_layout(cr, this._layout);
        }
        cr.$dispose();
    }
}

// How a buddy looks on GNOME: speech bubble, drawing, status pill and click hint, stacked.
class BuddyView {
    constructor(buddy, onClick) {
        this._buddy = buddy;
        const center = Clutter.ActorAlign.CENTER;
        this.widget = verticalBox({style_class: 'battery-buddy', reactive: true});
        this.speech = new Speech(240);
        this.area = new St.DrawingArea({x_align: center});
        this.area.connect('repaint', area => this._paint(area));
        this.pill = new St.BoxLayout({style_class: 'battery-buddy-pill', x_align: center});
        this.meter = new St.DrawingArea({style_class: 'battery-buddy-meter', y_align: center});
        this.meter.set_size(22, 12);
        this.meter.connect('repaint', area => this._paintMeter(area));
        this.label = new St.Label({style_class: 'battery-buddy-pill-label', y_align: center});
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this.pill.add_child(this.meter);
        this.pill.add_child(this.label);
        this.hint = new St.Label({style_class: 'battery-buddy-hint', text: 'click · right-click to pet', x_align: center, visible: false});
        this.widget.add_child(this.speech.actor);
        this.widget.add_child(this.area);
        this.widget.add_child(this.pill);
        this.widget.add_child(this.hint);
        this.widget.connect('button-press-event', (_actor, event) => {
            onClick(buddy, event.get_button());
            return Clutter.EVENT_STOP;
        });
        // The shell can destroy chrome on its own (e.g. while shutting down); stop touching it then.
        this.widget.connect('destroy', () => { this.widget = null; });
        Main.layoutManager.addTopChrome(this.widget, {affectsStruts: false, trackFullscreen: true});
    }

    get width() {
        return this.widget?.width ?? 0;
    }

    resize(size) {
        if (!this.widget) return;
        this._size = size;
        this.area.set_size(size, size);
        const width = Math.max(240, size + 30);
        this.widget.set_width(width);
        this.speech.maxWidth = width;
    }

    offsets() {
        if (!this.widget) return {top: 0, below: 0};
        const spacing = 2;
        const top = this.speech.actor.visible ? this.speech.actor.height + spacing : 0;
        let below = 0;
        for (const actor of [this.pill, this.hint]) {
            if (actor.visible) below += actor.get_preferred_height(-1)[1] + spacing;
        }
        return {top, below};
    }

    place(x, y) {
        this.widget?.set_position(x, y);
    }

    setSpeech(text) {
        if (this.widget) this.speech.set(text);
    }

    setStatus(text, pct, mood) {
        if (!this.widget) return;
        this.label.text = text;
        this.meter.visible = pct !== null;
        this._pct = pct ?? 0;
        this._mood = mood;
        this.meter.queue_repaint();
    }

    setPillVisible(visible) {
        if (this.widget) this.pill.visible = visible;
    }

    setHintVisible(visible) {
        if (this.widget) this.hint.visible = visible;
    }

    redraw() {
        if (this.widget) this.area.queue_repaint();
    }

    fadeIn() {
        if (!this.widget) return;
        this.widget.opacity = 0;
        this.widget.ease({opacity: 255, duration: 300, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    fadeOut(ms, accelerate, onDone) {
        if (!this.widget) { onDone(); return; }
        this.widget.remove_all_transitions();
        this.widget.ease({
            opacity: 0, duration: ms,
            mode: accelerate ? Clutter.AnimationMode.EASE_IN_QUAD : Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: onDone,
        });
    }

    drawingOrigin() {
        return this.widget ? this.area.get_transformed_position() : [0, 0];
    }

    _paint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        if (this._buddy.s) drawCharacter(cr, this._buddy.character, Math.min(width, height), this._buddy.drawState());
        cr.$dispose();
    }

    // Little battery icon in the status pill, filled to the current level.
    _paintMeter(area) {
        const cr = area.get_context();
        const [sw] = area.get_surface_size();
        cr.scale(sw / 22, sw / 22);
        const color = this._mood === 'low' ? [1, 0.45, 0.31] : [0.35, 0.85, 0.54];
        cr.setSourceRGB(...color);
        cr.setLineWidth(1.5);
        roundRect(cr, 0.75, 0.75, 18, 10.5, 2.5);
        cr.stroke();
        cr.rectangle(19.5, 3.5, 2, 5);
        cr.fill();
        const fill = Math.max(1.5, (14 * this._pct) / 100);
        roundRect(cr, 2.75, 2.75, fill, 6.5, 1.2);
        cr.fill();
        cr.$dispose();
    }

    destroy() {
        if (!this.widget) return;
        const widget = this.widget;
        widget.remove_all_transitions();
        Main.layoutManager.removeChrome(widget);
        widget.destroy();
        this.widget = null;
    }
}

// A bonus battery that drops after the buddy gets dizzy. Click it within 3 seconds.
class Pickup {
    constructor(x, y, onCatch, onMiss) {
        this._onCatch = onCatch;
        this._onMiss = onMiss;
        this.actor = new St.DrawingArea({reactive: true, width: 28, height: 38});
        this.actor.set_pivot_point(0.5, 0.5);
        this.actor.connect('repaint', area => this._paint(area));
        this.actor.connect('button-press-event', () => { this._finish(true); return Clutter.EVENT_STOP; });
        Main.layoutManager.addTopChrome(this.actor, {affectsStruts: false, trackFullscreen: true});
        this.actor.set_position(Math.round(x), Math.round(y - 70));
        this.actor.ease({y: Math.round(y), duration: 800, mode: Clutter.AnimationMode.EASE_OUT_BOUNCE});
        this._blinkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            this._blinkId = 0;
            this.actor?.ease({opacity: 70, duration: 160, repeatCount: 5, autoReverse: true});
            return GLib.SOURCE_REMOVE;
        });
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            this._timeoutId = 0;
            this._finish(false);
            return GLib.SOURCE_REMOVE;
        });
    }

    _finish(caught) {
        if (!this.actor || this._finished) return;
        this._finished = true;
        this.actor.remove_all_transitions();
        this.actor.reactive = false;
        this.actor.ease({
            opacity: 0, scale_x: caught ? 1.8 : 0.6, scale_y: caught ? 1.8 : 0.6,
            duration: 250, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.destroy(),
        });
        (caught ? this._onCatch : this._onMiss)();
    }

    _paint(area) {
        const cr = area.get_context();
        const [sw] = area.get_surface_size();
        cr.scale(sw / 28, sw / 28);
        roundRect(cr, 10, 1.5, 8, 4, 1.5);
        roundRect(cr, 3, 4.5, 22, 31, 4.5);
        cr.setSourceRGB(1, 0.84, 0.25);
        cr.fillPreserve();
        cr.setSourceRGB(...OUTLINE);
        cr.setLineWidth(2.2);
        cr.stroke();
        // Lightning bolt
        cr.newPath();
        cr.moveTo(16, 9);
        cr.lineTo(9.5, 21);
        cr.lineTo(14, 21);
        cr.lineTo(12, 31);
        cr.lineTo(19, 17.5);
        cr.lineTo(14.5, 17.5);
        cr.closePath();
        cr.setSourceRGB(...OUTLINE);
        cr.fill();
        cr.$dispose();
    }

    destroy() {
        if (this._blinkId) GLib.Source.remove(this._blinkId);
        if (this._timeoutId) GLib.Source.remove(this._timeoutId);
        this._blinkId = this._timeoutId = 0;
        if (this.actor) {
            this.actor.remove_all_transitions();
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
            this.actor = null;
        }
    }
}

export default class BatteryBuddy extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._sounds = global.display.get_sound_player?.() ?? null;
        this._monitorIndex = null;
        this._lastWall = null;
        this._lastMono = null;
        this._last = null;
        this._engine = new Engine(this._platform());

        this._signals = [
            [this._settings, this._settings.connect('changed', (_settings, key) => this._onSetting(key))],
            [this._notifications, this._notifications.connect('changed::show-banners', () => this._check())],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._engine.onMonitorsChanged())],
        ];
        // Screen sharing / recording indicators in the top bar tell us when to keep quiet.
        for (const role of ['screenSharing', 'screenRecording']) {
            const indicator = Main.panel.statusArea[role];
            if (indicator) this._signals.push([indicator, indicator.connect('notify::visible', () => this._check())]);
        }

        // A frame-clock driven loop moves and redraws the buddies while any are visible.
        this._timeline = new Clutter.Timeline({actor: global.stage, duration: 1000, repeat_count: -1});
        this._frameId = this._timeline.connect('new-frame', () => {
            const t = monotonic();
            const dt = this._last === null ? 0 : t - this._last;
            this._last = t;
            this._engine.tick(dt);
        });

        this._syncIndicator();
        this._configure();
        this._detectResume();
        this._engine.start();
    }

    // Everything the shared engine needs from GNOME.
    _platform() {
        return {
            settings: new SettingsStore(this._settings),
            battery: () => batteryInfo(),
            cpuTemperature: () => cpuTemperature(),
            sharing: () => {
                const area = Main.panel.statusArea;
                return Boolean(area.screenSharing?.visible || area.screenRecording?.visible);
            },
            dnd: () => !this._notifications.get_boolean('show-banners'),
            demo: () => readFile(DEMO),
            monotonic,
            pickMonitor: () => { this._monitorIndex = null; },
            workArea: () => {
                const monitor = this._monitor();
                return monitor ? Main.layoutManager.getWorkAreaForMonitor(monitor.index) : null;
            },
            pointer: () => {
                const [x, y] = global.get_pointer();
                return [x, y];
            },
            createView: buddy => new BuddyView(buddy, (b, button) => this._engine.click(b, button)),
            createPickup: (x, y, onCatch, onMiss) => new Pickup(x, y, onCatch, onMiss),
            notify: (title, body) => {
                try { Main.notify(title, body); } catch {}
            },
            play: name => {
                if (!this._sounds) return;
                try {
                    this._sounds.play_from_file(Gio.File.new_for_path(`${this.path}/sounds/${name}.wav`), 'Battery Buddy', null);
                } catch (e) {
                    console.warn(`Battery Buddy: could not play ${name}: ${e.message}`);
                }
            },
            setActive: active => {
                if (active && !this._timeline.is_playing()) {
                    this._last = null;
                    this._timeline.start();
                } else if (!active) {
                    this._timeline.stop();
                }
            },
            statusChanged: () => this._indicator?.sync(),
        };
    }

    _onSetting(key) {
        if (key === 'check-interval') this._configure();
        if (key === 'show-indicator') this._syncIndicator();
        this._engine.onSetting(key);
    }

    _syncIndicator() {
        const want = this._settings.get_boolean('show-indicator');
        if (want && !this._indicator) {
            this._indicator = new BuddyIndicator(this);
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } else if (!want && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _configure() {
        if (this._source) { GLib.Source.remove(this._source); this._source = null; }
        const seconds = this._settings.get_int('check-interval');
        this._source = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._check();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _check() {
        this._detectResume();
        this._engine.check();
    }

    // Monotonic time stops during suspend while the wall clock keeps going.
    _detectResume() {
        const wall = Date.now() / 1000, mono = monotonic();
        if (this._lastWall !== null && (wall - this._lastWall) - (mono - this._lastMono) > 60) this._engine.onResume();
        this._lastWall = wall;
        this._lastMono = mono;
    }

    _monitor() {
        const monitors = Main.layoutManager.monitors;
        if (!monitors?.length) return null;
        // Pick the monitor once per appearance so buddies don't teleport when the pointer moves.
        if (this._monitorIndex !== null && monitors[this._monitorIndex]) return monitors[this._monitorIndex];
        const option = this._settings.get_string('monitor');
        let monitor = Main.layoutManager.primaryMonitor ?? monitors[0];
        if (option === 'external') monitor = monitors.find(m => m !== Main.layoutManager.primaryMonitor) ?? monitors[0];
        if (option === 'pointer') {
            const [x, y] = global.get_pointer();
            monitor = monitors.find(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ?? monitors[0];
        }
        this._monitorIndex = monitor.index;
        return monitor;
    }

    // ---- Called from the top bar menu ----

    snooze(minutes) {
        this._engine.snooze(minutes);
    }

    summon() {
        this._engine.summon();
    }

    statusInfo() {
        return this._engine.statusInfo();
    }

    disable() {
        if (this._source) GLib.Source.remove(this._source);
        for (const [object, id] of this._signals ?? []) object.disconnect(id);
        if (this._timeline) {
            this._timeline.stop();
            this._timeline.disconnect(this._frameId);
        }
        this._engine?.stop();
        this._indicator?.destroy();
        this._indicator = null;
        this._engine = null;
        this._signals = null;
        this._timeline = null;
        this._frameId = null;
        this._sounds = null;
        this._notifications = null;
        this._settings = null;
        this._source = null;
    }
}
