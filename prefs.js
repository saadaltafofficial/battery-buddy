// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {batteryInfo} from './battery.js';
import {CHARACTERS, drawCharacter, isNight, seasonFor} from './characters.js';
import {ACCESSORIES, STARTERS, UNLOCKS} from './personality.js';

const MONITORS = [['primary', 'Primary monitor'], ['external', 'First non-primary monitor'], ['pointer', 'Monitor under cursor']];
const STATS = [
    'streak', 'best-streak', 'day-streak', 'streak-day', 'obeyed', 'reminders', 'unplugged-early', 'charge-spared',
    'batteries-caught', 'week-obeyed', 'week-reminders', 'week-best',
];
const ACCESSORY_CHOICES = [['best', 'Best one earned'], ['none', 'None'], ['shades', 'Sunglasses 😎'], ['crown', 'Crown 👑']];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function available(settings) {
    const unlocked = settings.get_strv('unlocked');
    const all = settings.get_boolean('unlock-all');
    return CHARACTERS.filter(([id]) => all || STARTERS.includes(id) || unlocked.includes(id));
}

export default class BatteryBuddyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._handlers = [];
        window.set_default_size(620, 760);
        window.connect('close-request', () => {
            for (const id of this._handlers) settings.disconnect(id);
            this._handlers = [];
            return false;
        });
        window.add(this._mainPage(settings));
        window.add(this._statsPage(settings, window));
    }

    _watch(settings, keys, callback) {
        for (const key of keys) this._handlers.push(settings.connect(`changed::${key}`, callback));
        callback();
    }

    _mainPage(settings) {
        const page = new Adw.PreferencesPage({title: 'Battery Buddy', icon_name: 'battery-symbolic'});

        const battery = new Adw.PreferencesGroup({title: 'Battery reminders', description: 'Reminders clear only when the charger state is corrected.'});
        page.add(battery);
        this._switch(battery, settings, 'alerts-enabled', 'Enable reminders');
        this._number(battery, settings, 'high-threshold', 'Ask me to unplug at (%)', 50, 100, 5);
        this._number(battery, settings, 'low-threshold', 'Ask me to charge at (%)', 5, 49, 5);
        this._number(battery, settings, 'check-interval', 'Check battery every (seconds)', 2, 60, 1);
        this._switch(battery, settings, 'show-estimate', 'Show time left', 'For example "18% · plug in · 40 min left"');

        const appearance = new Adw.PreferencesGroup({title: 'Character and appearance'});
        page.add(appearance);
        appearance.add(this._preview(settings));
        appearance.add(this._characterRow(settings));
        this._number(appearance, settings, 'character-size', 'Character size', 48, 180, 8);
        this._switch(appearance, settings, 'show-hint', 'Show click hint');

        const fun = new Adw.PreferencesGroup({title: 'Fun', description: 'Try them out with ./demo.sh party, celebrate or ignore.'});
        page.add(fun);
        this._switch(fun, settings, 'escalate', 'Get pushier when ignored', 'After 2 min it hurries, after 5 it follows your mouse, after 10 it stomps in the middle of the screen');
        this._switch(fun, settings, 'helpers', 'Call for backup', 'A second buddy joins after 10 minutes of being ignored');
        this._switch(fun, settings, 'cameos', 'Short visits', 'Cheers when you plug in, yawns after suspend, sweats when the CPU runs hot');
        this._choice(fun, settings, 'accessory', 'Accessory', ACCESSORY_CHOICES,
            `Sunglasses at a ${ACCESSORIES.shades} streak, crown at ${ACCESSORIES.crown}`);
        this._switch(fun, settings, 'seasonal', 'Seasonal outfits and night mode', 'Pumpkin for Halloween, Santa hat in December, sleepy after midnight');
        this._switch(fun, settings, 'sounds', 'Play sounds', 'Each buddy has its own little noise');

        const quiet = new Adw.PreferencesGroup({title: 'Quiet times'});
        page.add(quiet);
        this._switch(quiet, settings, 'show-indicator', 'Top bar menu', 'Snooze, summon your buddy, see your streak');
        this._switch(quiet, settings, 'quiet-when-sharing', 'Hide while sharing or recording the screen');
        this._switch(quiet, settings, 'respect-dnd', 'Hide during Do Not Disturb');
        this._switch(quiet, settings, 'weekly-report', 'Weekly summary', 'A notification on Sunday evening with your week');

        const placement = new Adw.PreferencesGroup({title: 'Screen and positioning'});
        page.add(placement);
        this._choice(placement, settings, 'monitor', 'Choose monitor', MONITORS);
        this._number(placement, settings, 'edge-margin', 'Distance from screen edges', 0, 150, 5);

        const animation = new Adw.PreferencesGroup({title: 'Movement'});
        page.add(animation);
        this._switch(animation, settings, 'roam', 'Walk around the screen', 'When off, the buddy stays put until you click it');
        this._number(animation, settings, 'walk-speed', 'Walking speed (pixels per second)', 20, 300, 10);
        this._number(animation, settings, 'hop-duration', 'Jump duration when clicked (milliseconds)', 200, 2000, 50);
        return page;
    }

    _statsPage(settings, window) {
        const page = new Adw.PreferencesPage({title: 'Stats', icon_name: 'starred-symbolic'});

        const streak = new Adw.PreferencesGroup({title: 'Your streak', description: `A reminder counts as fixed in time if you sort out the charger within 5 minutes.`});
        page.add(streak);
        const rows = {
            streak: this._stat(streak, 'Current streak'),
            best: this._stat(streak, 'Best streak'),
            days: this._stat(streak, 'Day streak', 'Days with reminders fixed in time and none ignored'),
            obeyed: this._stat(streak, 'Fixed in time'),
            early: this._stat(streak, 'Unplugged before 100%'),
            spared: this._stat(streak, 'Top-of-charge avoided', 'Percentage points you didn\'t charge past your unplug reminder, added up'),
            caught: this._stat(streak, 'Bonus batteries caught', 'Click a buddy 5 times fast, then catch what it drops'),
        };
        const week = new Adw.PreferencesGroup({title: 'This week'});
        page.add(week);
        const weekRows = {
            fixed: this._stat(week, 'Fixed in time'),
            best: this._stat(week, 'Best streak'),
        };
        this._watch(settings, STATS, () => {
            const n = key => settings.get_int(key);
            rows.streak.label = n('streak') > 0 ? `${plural(n('streak'), 'reminder')} in a row 🔥` : 'No streak yet';
            rows.best.label = plural(n('best-streak'), 'reminder');
            rows.days.label = plural(n('day-streak'), 'day');
            rows.obeyed.label = `${n('obeyed')} of ${n('reminders')}`;
            rows.early.label = plural(n('unplugged-early'), 'time');
            rows.spared.label = `≈ ${(n('charge-spared') / 100).toFixed(1)} full charges`;
            rows.caught.label = String(n('batteries-caught'));
            weekRows.fixed.label = `${n('week-obeyed')} of ${n('week-reminders')}`;
            weekRows.best.label = plural(n('week-best'), 'reminder');
        });

        page.add(this._healthGroup(settings));

        const rewards = new Adw.PreferencesGroup({title: 'Accessories', description: 'Earned with your best streak, and kept for good.'});
        page.add(rewards);
        const rewardRows = Object.entries(ACCESSORIES).map(([id, need]) => {
            const row = new Adw.ActionRow({title: id === 'shades' ? 'Sunglasses 😎' : 'Crown 👑'});
            const icon = new Gtk.Image();
            row.add_suffix(icon);
            rewards.add(row);
            return {row, icon, need};
        });
        this._watch(settings, ['best-streak'], () => {
            const best = settings.get_int('best-streak');
            for (const {row, icon, need} of rewardRows) {
                row.subtitle = best >= need ? 'Earned' : `Reach a ${need} streak (best so far: ${best})`;
                icon.icon_name = best >= need ? 'object-select-symbolic' : 'changes-prevent-symbolic';
            }
        });

        const buddies = new Adw.PreferencesGroup({title: 'Buddies'});
        page.add(buddies);
        const lockRows = CHARACTERS.map(([id, name]) => {
            const row = new Adw.ActionRow({title: name});
            const icon = new Gtk.Image();
            row.add_suffix(icon);
            buddies.add(row);
            return {id, row, icon};
        });
        this._watch(settings, ['unlocked', 'unlock-all'], () => {
            const open = available(settings).map(([id]) => id);
            for (const {id, row, icon} of lockRows) {
                const unlocked = open.includes(id);
                row.subtitle = unlocked ? (STARTERS.includes(id) ? 'Starter buddy' : 'Unlocked') : UNLOCKS[id] ?? '';
                icon.icon_name = unlocked ? 'object-select-symbolic' : 'changes-prevent-symbolic';
            }
        });
        this._switch(buddies, settings, 'unlock-all', 'Unlock everyone now', 'Skip the challenges and use any buddy');

        const reset = new Adw.PreferencesGroup();
        page.add(reset);
        const resetRow = new Adw.ActionRow({title: 'Reset stats', subtitle: 'Clears streaks and counts. Unlocked buddies stay unlocked.'});
        const button = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
        button.connect('clicked', () => {
            const dialog = new Adw.AlertDialog({heading: 'Reset stats?', body: 'Your streaks and counts will go back to zero.'});
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('reset', 'Reset');
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect('response', (_d, response) => {
                if (response === 'reset') for (const key of STATS) settings.reset(key);
            });
            dialog.present(window);
        });
        resetRow.add_suffix(button);
        reset.add(resetRow);
        return page;
    }

    // Battery health now, and how it has changed since Battery Buddy started tracking it.
    _healthGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Battery health', description: 'How much charge the battery can still hold compared with when it was new. Recorded once a day.'});
        const now = this._stat(group, 'Capacity now');
        const cycles = this._stat(group, 'Charge cycles');
        const change = this._stat(group, 'Change since tracking began');
        const chart = new Gtk.DrawingArea({content_height: 90, hexpand: true, margin_top: 8});
        let points = [];
        chart.set_draw_func((_area, cr, width, height) => {
            if (points.length < 2) {
                cr.setSourceRGBA(0.5, 0.5, 0.5, 0.8);
                cr.moveTo(8, height / 2 + 4);
                cr.setFontSize(12);
                cr.showText('The chart appears after a couple of days of tracking.');
                return;
            }
            const values = points.map(p => p.health);
            const lo = Math.floor(Math.min(...values) - 1), hi = Math.ceil(Math.max(...values) + 1);
            const x = i => 8 + (i / (points.length - 1)) * (width - 16);
            const y = v => height - 10 - ((v - lo) / (hi - lo)) * (height - 20);
            cr.setLineWidth(2.5);
            cr.setSourceRGB(0.21, 0.52, 0.89);
            points.forEach((p, i) => (i ? cr.lineTo(x(i), y(p.health)) : cr.moveTo(x(i), y(p.health))));
            cr.stroke();
            cr.setSourceRGBA(0.5, 0.5, 0.5, 0.9);
            cr.setFontSize(11);
            cr.moveTo(8, 12);
            cr.showText(`${hi}%`);
            cr.moveTo(8, height - 1);
            cr.showText(`${lo}%`);
        });
        group.add(new Gtk.Frame({child: chart, margin_top: 12}));
        this._watch(settings, ['health-log'], () => {
            points = settings.get_strv('health-log').map(entry => {
                const [date, health, count] = entry.split(':');
                return {date, health: Number(health), cycles: count ? Number(count) : null};
            }).filter(p => Number.isFinite(p.health));
            const live = batteryInfo();
            const latest = live?.health ?? points[points.length - 1]?.health;
            now.label = latest ? `${latest.toFixed(1)}% of original` : 'Not reported by this laptop';
            cycles.label = live?.cycles ? String(live.cycles) : '—';
            if (points.length && latest) {
                const diff = latest - points[0].health;
                change.label = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} points since ${points[0].date}`;
            } else {
                change.label = '—';
            }
            chart.queue_draw();
        });
        return group;
    }

    _stat(group, title, subtitle = '') {
        const row = new Adw.ActionRow({title, subtitle});
        const label = new Gtk.Label({css_classes: ['dim-label']});
        row.add_suffix(label);
        group.add(row);
        return label;
    }

    // Only unlocked buddies can be picked; the list updates when a new one is earned.
    _characterRow(settings) {
        const row = new Adw.ComboRow({title: 'Desktop companion'});
        let options = [];
        let updating = false;
        row.connect('notify::selected', () => {
            const value = options[row.selected]?.[0];
            if (!updating && value && value !== settings.get_string('character')) settings.set_string('character', value);
        });
        this._watch(settings, ['unlocked', 'unlock-all', 'character'], () => {
            updating = true;
            options = available(settings);
            const current = settings.get_string('character');
            if (!options.some(([id]) => id === current)) options.push(CHARACTERS.find(([id]) => id === current) ?? CHARACTERS[0]);
            row.model = Gtk.StringList.new(options.map(([, label]) => label));
            row.selected = Math.max(0, options.findIndex(([id]) => id === current));
            updating = false;
        });
        return row;
    }

    // A small animated stage that shows the chosen character walking back and forth.
    _preview(settings) {
        const area = new Gtk.DrawingArea({content_height: 150, hexpand: true, margin_top: 6, margin_bottom: 6});
        const start = GLib.get_monotonic_time();
        area.set_draw_func((_area, cr, width, height) => {
            const t = (GLib.get_monotonic_time() - start) / 1e6;
            const size = Math.min(130, height);
            const travel = Math.max(0, width - size - 20);
            // 0-4s walk right, 4-5s rest, 5-9s walk left, 9-10s rest
            const c = t % 10;
            const walking = c < 4 || (c >= 5 && c < 9);
            const progress = c < 4 ? c / 4 : c < 5 ? 1 : c < 9 ? 1 - (c - 5) / 4 : 0;
            const mood = Math.floor(t / 10) % 2 === 0 ? 'high' : 'low';
            const date = new Date();
            const seasonal = settings.get_boolean('seasonal');
            cr.translate(10 + travel * progress, height - size);
            drawCharacter(cr, settings.get_string('character'), size, {
                t, phase: walking ? t * 8 : 0, moving: walking, facing: c < 5 ? 1 : -1,
                blink: t % 3.2 < 0.15, mood, air: 0,
                season: seasonal ? seasonFor(date) : null, night: seasonal && isNight(date),
            });
        });
        area.add_tick_callback(() => { area.queue_draw(); return GLib.SOURCE_CONTINUE; });
        return new Gtk.Frame({child: area, margin_bottom: 12});
    }

    _switch(group, settings, key, title, subtitle = '') {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _number(group, settings, key, title, min, max, step) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step, value: settings.get_int(key)}), digits: 0});
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _choice(group, settings, key, title, options, subtitle = '') {
        const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(options.map(([, label]) => label))});
        row.selected = Math.max(0, options.findIndex(([value]) => value === settings.get_string(key)));
        row.connect('notify::selected', () => {
            const value = options[row.selected]?.[0];
            if (value !== undefined) settings.set_string(key, value);
        });
        this._watch(settings, [key], () => {
            const index = options.findIndex(([v]) => v === settings.get_string(key));
            if (index >= 0 && row.selected !== index) row.selected = index;
        });
        group.add(row);
    }
}
