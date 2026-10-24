// Generated with AI for personal use.
// Top bar menu: battery status, streak, snooze, summon, preferences.
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const BuddyIndicator = GObject.registerClass(
class BuddyIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.5, 'Battery Buddy');
        this._ext = ext;
        this.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(`${ext.path}/icons/battery-buddy-symbolic.svg`),
            style_class: 'system-status-icon',
        }));

        const info = text => {
            const item = new PopupMenu.PopupMenuItem(text, {reactive: false});
            this.menu.addMenuItem(item);
            return item;
        };
        this._battery = info('');
        this._streak = info('');
        this._health = info('');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._snoozed = info('');
        this._snooze15 = this.menu.addAction('Snooze for 15 minutes', () => ext.snooze(15));
        this._snooze60 = this.menu.addAction('Snooze for 1 hour', () => ext.snooze(60));
        this._resume = this.menu.addAction('Resume reminders', () => ext.snooze(0));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Summon buddy', () => ext.summon());
        this.menu.addAction('Preferences', () => ext.openPreferences());
        this.menu.connect('open-state-changed', (_menu, open) => { if (open) this.sync(); });
        this.sync();
    }

    sync() {
        const s = this._ext.statusInfo();
        this._battery.label.text = s.battery;
        this._streak.label.text = s.streak;
        this._health.label.text = s.health ?? '';
        this._health.visible = Boolean(s.health);
        this._snoozed.label.text = s.snoozedUntil ? `Snoozed until ${s.snoozedUntil}` : '';
        this._snoozed.visible = Boolean(s.snoozedUntil);
        this._resume.visible = Boolean(s.snoozedUntil);
    }
});
