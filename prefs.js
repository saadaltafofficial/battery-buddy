// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CHARACTERS = [
    ['pirate', 'Pirate 🏴‍☠️'], ['cat', 'Cat 🐈'], ['robot', 'Robot 🤖'],
    ['ghost', 'Ghost 👻'], ['dragon', 'Dragon 🐉'], ['penguin', 'Penguin 🐧'],
    ['fox', 'Fox 🦊'], ['owl', 'Owl 🦉'],
];
const MONITORS = [['primary', 'Primary monitor'], ['external', 'First non-primary monitor'], ['pointer', 'Monitor under cursor']];
const CORNERS = [['0', 'Top left'], ['1', 'Top right'], ['2', 'Bottom left'], ['3', 'Bottom right']];

export default class BatteryBuddyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 720);
        const page = new Adw.PreferencesPage({title: 'Battery Buddy', icon_name: 'battery-symbolic'});
        window.add(page);

        const battery = new Adw.PreferencesGroup({title: 'Battery reminders', description: 'Reminders clear only when the charger state is corrected.'});
        page.add(battery);
        const enabled = new Adw.SwitchRow({title: 'Enable reminders'});
        settings.bind('alerts-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        battery.add(enabled);
        this._number(battery, settings, 'high-threshold', 'Ask me to unplug at (%)', 50, 100, 5);
        this._number(battery, settings, 'low-threshold', 'Ask me to charge at (%)', 5, 49, 5);
        this._number(battery, settings, 'check-interval', 'Check battery every (seconds)', 2, 60, 1);

        const appearance = new Adw.PreferencesGroup({title: 'Character and appearance'});
        page.add(appearance);
        this._choice(appearance, settings, 'character', 'Desktop companion', CHARACTERS);
        this._number(appearance, settings, 'character-size', 'Character size', 48, 180, 8);
        const hint = new Adw.SwitchRow({title: 'Show click hint'});
        settings.bind('show-hint', hint, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(hint);

        const placement = new Adw.PreferencesGroup({title: 'Screen and positioning'});
        page.add(placement);
        this._choice(placement, settings, 'monitor', 'Choose monitor', MONITORS);
        this._choice(placement, settings, 'start-corner', 'Starting corner', CORNERS, true);
        this._number(placement, settings, 'edge-margin', 'Distance from screen edges', 0, 150, 5);

        const animation = new Adw.PreferencesGroup({title: 'Movement'});
        page.add(animation);
        const animate = new Adw.SwitchRow({title: 'Animate corner hops'});
        settings.bind('animate-hops', animate, 'active', Gio.SettingsBindFlags.DEFAULT);
        animation.add(animate);
        this._number(animation, settings, 'hop-duration', 'Hop duration (milliseconds)', 100, 2000, 50);
    }

    _number(group, settings, key, title, min, max, step) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step, value: settings.get_int(key)}), digits: 0});
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _choice(group, settings, key, title, options, numeric = false) {
        const row = new Adw.ComboRow({title, model: Gtk.StringList.new(options.map(([, label]) => label))});
        const stored = numeric ? String(settings.get_int(key)) : settings.get_string(key);
        row.selected = Math.max(0, options.findIndex(([value]) => value === stored));
        row.connect('notify::selected', () => {
            const value = options[row.selected]?.[0];
            if (value === undefined) return;
            if (numeric) settings.set_int(key, Number(value));
            else settings.set_string(key, value);
        });
        settings.connect(`changed::${key}`, () => {
            const value = numeric ? String(settings.get_int(key)) : settings.get_string(key);
            const index = options.findIndex(([v]) => v === value);
            if (index >= 0 && row.selected !== index) row.selected = index;
        });
        group.add(row);
    }
}
