// Renders the app and tray icons with the real character drawing code.
// Run with GJS (it ships with GNOME):  gjs -m scripts/make-icons.js
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import {drawCharacter} from '../../characters.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));

function roundRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function appIcon(size, file) {
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
    const cr = new Cairo.Context(surface);
    const k = size / 512;
    cr.scale(k, k);
    const bg = new Cairo.LinearGradient(0, 0, 512, 512);
    bg.addColorStopRGB(0, 0.55, 0.42, 0.98);
    bg.addColorStopRGB(1, 0.31, 0.2, 0.75);
    roundRect(cr, 24, 24, 464, 464, 104);
    cr.setSource(bg);
    cr.fill();
    cr.save();
    cr.translate(46, 40);
    drawCharacter(cr, 'pirate', 420, {t: 1.2, phase: 0, moving: false, facing: 1, blink: false, mood: 'high', air: 0});
    cr.restore();
    surface.writeToPNG(file);
}

// A friendly battery face that reads at 16-32 px on light and dark task bars.
function trayIcon(size, file) {
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
    const cr = new Cairo.Context(surface);
    cr.scale(size / 32, size / 32);
    cr.setSourceRGB(0.14, 0.15, 0.2);
    roundRect(cr, 12, 1, 8, 4, 1.5);
    cr.fill();
    roundRect(cr, 5, 3.5, 22, 27, 5);
    cr.setSourceRGB(0.35, 0.85, 0.54);
    cr.fillPreserve();
    cr.setSourceRGB(0.14, 0.15, 0.2);
    cr.setLineWidth(2.4);
    cr.stroke();
    for (const x of [12, 20]) {
        cr.arc(x, 14.5, 2.2, 0, 2 * Math.PI);
        cr.fill();
    }
    cr.setLineWidth(2.2);
    cr.setLineCap(1);
    cr.arc(16, 18.5, 5, 0.2 * Math.PI, 0.8 * Math.PI);
    cr.stroke();
    surface.writeToPNG(file);
}

appIcon(512, `${root}/build/icon.png`);
appIcon(256, `${root}/app/icons/app.png`);
trayIcon(32, `${root}/app/icons/tray.png`);
trayIcon(64, `${root}/app/icons/tray@2x.png`);
print('Icons written to build/ and app/icons/');
