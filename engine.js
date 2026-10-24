// Generated with AI for personal use.
// The platform-independent brain of Battery Buddy: reminders, moods, escalation,
// stats, unlocks, visits and movement. It never touches GNOME or Electron directly;
// a "platform" object supplies battery data, settings, drawing surfaces and timers.
// Used by the GNOME extension (extension.js) and the desktop app (desktop/).
//
// platform = {
//   settings: {get(key), set(key, value)}
//   battery()          -> {capacity, status, minutes, health, cycles} | null
//   cpuTemperature()   -> °C | null
//   sharing()          -> true while the screen is shared/recorded/presenting
//   dnd()              -> true during Do Not Disturb
//   demo()             -> "kind expiry" demo request | null
//   monotonic()        -> seconds from a clock that never jumps
//   pickMonitor()      -> choose the screen for the next appearance
//   workArea()         -> {x, y, width, height} | null, in the same coordinates as pointer()
//   pointer()          -> [x, y]
//   createView(buddy)  -> view (see Buddy below)
//   createPickup(x, y, onCatch, onMiss) -> {destroy()}
//   notify(title, body), play(soundName)
//   setActive(bool)    -> start/stop calling engine.tick(dt) every frame
//   statusChanged()    -> refresh any menu showing statusInfo()
// }
import {CHARACTERS, isNight, seasonFor} from './characters.js';
import {ACCESSORIES, LINES, SHARED, STARTERS, fill, pick} from './personality.js';

export const DEMO_KINDS = ['high', 'low', 'party', 'celebrate', 'ignore'];

// Seconds a reminder has been ignored before each escalation stage:
// 1 hurries and grumbles, 2 follows the mouse, 3 stomps in the middle and calls a helper.
const STAGES = [0, 120, 300, 600];
// Fixing the charger within this many seconds counts towards your streak.
const OBEY_WINDOW = 300;
// CPU temperature (°C) at which the buddy starts to overheat.
const HOT = 85;
// How long short visits stay, in seconds.
const VISITS = {summon: 30, plugged: 6, resume: 7};
// Settings the engine writes itself; changing them shouldn't reset anything.
export const STAT_KEYS = new Set([
    'streak', 'best-streak', 'day-streak', 'streak-day', 'obeyed', 'reminders', 'unplugged-early', 'charge-spared', 'unlocked',
    'week-start', 'week-obeyed', 'week-reminders', 'week-best', 'last-report', 'health-log', 'batteries-caught',
]);

const rand = (a, b) => a + Math.random() * (b - a);
const ease = p => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
export const nameOf = id => CHARACTERS.find(([c]) => c === id)?.[1] ?? id;
const linesOf = id => LINES[id] ?? LINES.pirate;
const clock = date => (date ?? new Date()).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
const pad = n => String(n).padStart(2, '0');
const dayString = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Monday of the date's week, as YYYY-MM-DD.
function weekOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return dayString(d);
}

// Compact, for the status pill: "40m", "1h 31m", "2h".
export function formatMinutes(minutes) {
    const m = Math.round(minutes);
    if (m < 60) return `${m}m`;
    return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

// One character on screen. s.x / s.y is the top-left of the character drawing;
// the view puts the speech bubble above it and the status pill below.
//
// view = {
//   width                      total widget width
//   offsets()                  -> {top, below}: space above/below the drawing
//   resize(size), place(x, y)  widget top-left
//   setSpeech(text), setStatus(text, pct|null, mood)
//   setPillVisible(bool), setHintVisible(bool)
//   redraw()                   repaint using buddy.drawState()
//   fadeIn(), fadeOut(ms, accelerate, onDone)
//   drawingOrigin()            -> [x, y] of the drawing, in platform coordinates
//   destroy()
// }
export class Buddy {
    constructor(engine, character, role, size) {
        this.engine = engine;
        this.character = character;
        this.role = role; // 'main', 'helper' or 'party'
        this.clicks = [];
        this.done = false;
        this.fading = false;
        this.s = null;
        this._quote = '';
        this._sayUntil = 0;
        this._hintUntil = 0;
        this.view = engine.platform.createView(this);
        this.view.setPillVisible(role !== 'helper');
        this.resize(size);
        this.setStatus('', null, 'high');
    }

    resize(size) {
        this.size = size;
        this.view.resize(size);
    }

    setStatus(text, pct, mood) {
        this.view.setStatus(text, pct, mood);
    }

    spawn(x, y, facing, mood, {hint = false} = {}) {
        this.s = {
            x, y, t: 0, phase: 0, facing, mood,
            mode: 'idle', wait: rand(0.4, 1.2), blink: 0, blinkIn: rand(1, 3),
            air: 0, spin: 0, squash: 1, land: 0, moving: false, jump: null,
            dizzy: 0, heart: 0, angry: false, stomp: false, hot: false,
            winAt: null, exitAt: null, leaving: false, quoteIn: rand(18, 30),
        };
        this.view.setHintVisible(hint);
        this._hintUntil = hint ? 8 : 0;
        this._place();
        this.view.fadeIn();
    }

    // The resting line. Short-lived reactions (say) temporarily replace it.
    setQuote(text) {
        this._quote = text;
        if (!this._sayUntil) this.view.setSpeech(text);
    }

    say(text, seconds) {
        this.view.setSpeech(text);
        this._sayUntil = (this.s?.t ?? 0) + seconds;
    }

    leaveAfter(seconds) {
        if (this.s) this.s.exitAt = this.s.t + seconds;
    }

    pet(text) {
        this.s.heart = 1.4;
        this.say(text, 3);
    }

    makeDizzy(text) {
        const s = this.s;
        s.dizzy = 4;
        s.jump = null;
        if (s.mode === 'jump') { s.mode = 'idle'; s.wait = 0.5; }
        this.say(text, 4);
    }

    celebrate(text) {
        const s = this.s;
        if (!s || this.fading || s.leaving) return;
        s.winAt = s.t;
        s.exitAt = s.t + 2.4;
        s.mood = 'high';
        s.dizzy = 0;
        s.stomp = false;
        s.angry = false;
        this.view.setPillVisible(true);
        this.setStatus('✓ thank you!', 100, 'high');
        this.view.setHintVisible(false);
        this.setQuote(text);
        this._startJump(s.x, s.y, 0.9, this.size * 0.55, true);
    }

    fadeOut() {
        if (this.fading) return;
        this.fading = true;
        this.view.fadeOut(300, false, () => { this.done = true; });
    }

    keepInside(b) {
        const s = this.s;
        if (!s || !b || s.leaving) return;
        s.x = Math.min(Math.max(s.x, b.minX), b.maxX);
        s.y = Math.min(Math.max(s.y, b.minY), b.maxY);
        s.jump = null;
        s.mode = 'idle';
        s.wait = 0.3;
    }

    _startJump(tx, ty, duration, height, flip = false) {
        const s = this.s;
        s.jump = {fx: s.x, fy: s.y, tx, ty, p: 0, duration, height, flip};
        s.mode = 'jump';
        if (Math.abs(tx - s.x) > 1) s.facing = tx > s.x ? 1 : -1;
    }

    hop() {
        this._startJump(this.s.x, this.s.y, 0.45, this.size * 0.28);
    }

    jumpAway(b, duration) {
        const s = this.s;
        if (!b) return;
        let tx = rand(b.minX, b.maxX), ty = rand(b.minY, b.maxY);
        // Try for a landing spot well away from the current one.
        for (let i = 0; i < 6 && Math.hypot(tx - s.x, ty - s.y) < (b.maxX - b.minX) / 3; i++) {
            tx = rand(b.minX, b.maxX);
            ty = rand(b.minY, b.maxY);
        }
        const dist = Math.hypot(tx - s.x, ty - s.y);
        this._startJump(tx, ty, duration, Math.min(220, 60 + dist * 0.2));
    }

    _walkTo(tx, ty) {
        const s = this.s;
        s.tx = tx;
        s.ty = ty;
        s.mode = 'walk';
    }

    // Stand just to the side of the pointer, with feet roughly level with it.
    _aimAtPointer(b, [px, py]) {
        const s = this.s;
        const side = px + 40 + this.size > b.maxX + this.size ? -(this.size + 40) : 40;
        s.tx = Math.min(Math.max(px + side, b.minX), b.maxX);
        s.ty = Math.min(Math.max(py - this.size + 20, b.minY), b.maxY);
    }

    _decide(env) {
        const s = this.s, b = env.bounds;
        s.stomp = false;
        if (s.exitAt !== null && s.t >= s.exitAt) {
            if (!s.leaving && b) this._leave(b);
            else s.wait = 0.3;
            return;
        }
        if (s.winAt !== null) { s.wait = 0.3; return; }
        if (!b) { s.wait = 1; return; }
        if (env.behaviour === 'follow') {
            this._aimAtPointer(b, env.pointer);
            if (Math.hypot(s.tx - s.x, s.ty - s.y) > 8) s.mode = 'walk';
            else s.wait = 0.3;
            return;
        }
        if (env.behaviour === 'center') {
            const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
            if (Math.hypot(cx - s.x, cy - s.y) > 6) {
                this._walkTo(cx, cy);
            } else {
                s.stomp = true;
                s.wait = rand(1.5, 3);
                if (Math.random() < 0.4) s.facing = -s.facing;
            }
            return;
        }
        const r = Math.random();
        if (s.mood === 'high' && r < 0.25) {
            this.hop(); // happy hop in place
        } else if (r < 0.4) {
            s.facing = -s.facing; // look around
            s.wait = rand(0.8, 2);
        } else if (env.behaviour === 'roam') {
            // Prefer strolling near the bottom of the screen, with the occasional trip upwards.
            const ty = Math.random() < 0.6 ? rand(b.minY + (b.maxY - b.minY) * 0.7, b.maxY) : rand(b.minY, b.maxY);
            this._walkTo(rand(b.minX, b.maxX), ty);
        } else {
            s.wait = rand(1, 3);
        }
    }

    // Walk towards the nearest side while fading away.
    _leave(b) {
        const s = this.s;
        s.leaving = true;
        this._walkTo(s.x < (b.minX + b.maxX) / 2 ? s.x - 120 : s.x + 120, s.y);
        this.view.fadeOut(1500, true, () => { this.done = true; });
    }

    // Squash and stretch: a vertical scale around the feet.
    _squash(dt) {
        const s = this.s;
        if (s.jump) {
            const p = s.jump.p;
            if (s.jump.flip) return 1;
            // Crouch on take-off, stretch while moving fast, normal at the top of the arc.
            return p < 0.12 ? 1 - 0.18 * Math.sin((p / 0.12) * Math.PI) : 1 + 0.14 * Math.abs(Math.cos(p * Math.PI));
        }
        if (s.land > 0) {
            s.land = Math.max(0, s.land - dt);
            return 1 - 0.22 * Math.sin((1 - s.land / 0.24) * Math.PI);
        }
        if (s.moving) return 1 - 0.06 * (1 - Math.abs(Math.sin(s.phase))) ** 3; // a little give on each step
        if (s.stomp) return 1 - 0.1 * (1 - Math.abs(Math.sin(s.t * 11)));
        return 1 + 0.015 * Math.sin(s.t * 2.2); // breathing
    }

    tick(dt, env) {
        const s = this.s;
        s.t += dt;
        s.blinkIn -= dt;
        if (s.blinkIn <= 0) { s.blink = 0.15; s.blinkIn = rand(2, 5); }
        s.blink = Math.max(0, s.blink - dt);
        s.dizzy = Math.max(0, s.dizzy - dt);
        s.heart = Math.max(0, s.heart - dt);
        s.hot = env.hot;
        s.air = 0;
        s.spin = 0;

        if (s.mode === 'jump' && s.jump) {
            const j = s.jump;
            j.p = Math.min(1, j.p + dt / j.duration);
            const e = ease(j.p);
            s.x = j.fx + (j.tx - j.fx) * e;
            s.y = j.fy + (j.ty - j.fy) * e;
            s.air = Math.sin(j.p * Math.PI) * j.height;
            if (j.flip) s.spin = -ease(j.p) * Math.PI * 2 * s.facing;
            if (j.p >= 1) { s.jump = null; s.mode = 'idle'; s.wait = rand(0.6, 1.5); s.land = 0.24; }
        } else if (s.mode === 'walk') {
            if (env.behaviour === 'follow' && !s.leaving && env.bounds) this._aimAtPointer(env.bounds, env.pointer);
            const speed = env.speed * (s.mood === 'low' ? 0.6 : 1) * (s.dizzy > 0 ? 0.4 : 1) * (s.leaving ? 1.5 : 1);
            const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy), step = speed * dt;
            if (Math.abs(dx) > 1) s.facing = dx > 0 ? 1 : -1;
            const stuck = env.behaviour === 'stay' && !s.leaving;
            if (dist <= step || stuck) {
                if (!stuck) { s.x = s.tx; s.y = s.ty; }
                s.mode = 'idle';
                s.wait = ['follow', 'center'].includes(env.behaviour) ? 0.3 : rand(1.2, 4);
            } else {
                s.x += (dx / dist) * step;
                s.y += (dy / dist) * step;
                s.phase += step / (this.size * 0.09);
            }
        } else {
            if (s.stomp) s.air = Math.abs(Math.sin(s.t * 11)) * this.size * 0.035;
            s.wait -= dt;
            if (s.wait <= 0) this._decide(env);
        }
        s.moving = s.mode === 'walk';
        s.squash = this._squash(dt);

        if (this._sayUntil && s.t > this._sayUntil) {
            this._sayUntil = 0;
            this.view.setSpeech(this._quote);
        }
        if (this._hintUntil && s.t > this._hintUntil) {
            this._hintUntil = 0;
            this.view.setHintVisible(false);
        }
        this._place();
        this.view.redraw();
    }

    _place() {
        const s = this.s;
        const {top} = this.view.offsets();
        this.view.place(Math.round(s.x - (this.view.width - this.size) / 2), Math.round(s.y - top - s.air));
    }

    // Everything drawCharacter() needs for the current frame.
    drawState() {
        const s = this.s, e = this.engine;
        const party = s.winAt !== null ? (s.t - s.winAt) / 2.5 : 1;
        return {
            t: s.t, phase: s.phase, moving: s.moving, facing: s.facing,
            blink: s.blink > 0, mood: s.mood, air: s.air, spin: s.spin, squash: s.squash,
            dizzy: s.dizzy > 0, angry: s.angry, hot: s.hot,
            heart: s.heart > 0 ? 1 - s.heart / 1.4 : null,
            confetti: party < 1 ? party : null,
            season: e.season, night: e.night, accessory: e.accessory,
        };
    }

    destroy() {
        this.view.destroy();
        this.view = null;
        this.s = null;
    }
}

export class Engine {
    constructor(platform) {
        this.platform = platform;
        this.settings = platform.settings;
        this.buddies = [];
        this.reminder = null;
        this.season = null;
        this.night = false;
        this.accessory = null;
        this.battery = null;
        this.minutes = null;
        this._pickup = null;
        this._chat = null;
        this._demoDone = null;
        this._lastStatus = null;
        this._resumed = false;
        this._hotSaid = -Infinity;
        this._hot = false;
        this._temp = null;
        this._lastSound = -Infinity;
    }

    get(key) { return this.settings.get(key); }
    set(key, value) { this.settings.set(key, value); }

    start() {
        // Never lock away the buddy someone already picked before unlocks existed.
        const unlocked = this.get('unlocked');
        const chosen = this.get('character');
        if (!unlocked.includes(chosen)) this.set('unlocked', [...unlocked, chosen]);
        this.check();
    }

    stop() {
        this._clear();
        this.reminder = null;
    }

    // The platform calls this whenever a setting changes (including the engine's own writes).
    onSetting(key) {
        if (STAT_KEYS.has(key)) {
            if (key === 'best-streak') this._updateAccessory();
            return;
        }
        const size = this.get('character-size');
        for (const b of this.buddies) {
            if (!b.s) continue;
            if (b.role === 'main') b.character = this.get('character');
            b.resize(b.role === 'helper' ? Math.round(size * 0.85) : size);
            b.keepInside(this._bounds(b));
        }
        this.check();
    }

    onMonitorsChanged() {
        this.platform.pickMonitor();
        for (const b of this.buddies) b.keepInside(this._bounds(b));
    }

    // The laptop just woke up from suspend.
    onResume() {
        this._resumed = true;
    }

    _snoozedUntil() {
        const until = Number(this.get('snooze-until'));
        return until > Date.now() / 1000 ? until : 0;
    }

    // Snoozed, sharing the screen, or Do Not Disturb.
    _blocked() {
        if (this._snoozedUntil()) return true;
        if (this.get('quiet-when-sharing') && this.platform.sharing()) return true;
        return this.get('respect-dnd') && this.platform.dnd();
    }

    _demo() {
        const data = this.platform.demo();
        if (!data || data === this._demoDone) return null;
        const [kind, expiry] = data.split(/\s+/);
        return DEMO_KINDS.includes(kind) && Number(expiry) > Date.now() / 1000 ? {kind, id: data} : null;
    }

    _updateAccessory() {
        const best = this.get('best-streak');
        const earned = Object.keys(ACCESSORIES).filter(a => best >= ACCESSORIES[a]);
        const choice = this.get('accessory');
        if (choice === 'none') this.accessory = null;
        else if (earned.includes(choice)) this.accessory = choice;
        else this.accessory = earned.sort((a, b) => ACCESSORIES[b] - ACCESSORIES[a])[0] ?? null;
    }

    // Called every few seconds: read the battery and decide what should be on screen.
    check() {
        const date = new Date();
        const seasonal = this.get('seasonal');
        this.season = seasonal ? seasonFor(date) : null;
        this.night = seasonal && isNight(date);
        this._updateAccessory();

        const battery = this.battery = this.platform.battery();
        this._estimate(battery);
        this._logHealth(battery);
        this._weekly(date);

        const resumed = this._resumed;
        this._resumed = false;
        const plugged = this._lastStatus === 'discharging' && battery && battery.status !== 'discharging';
        this._lastStatus = battery?.status ?? null;

        if (this.buddies.length && this.get('cameos')) {
            this._temp = this.platform.cpuTemperature();
            this._hot = this._temp !== null && this._temp >= HOT;
        } else {
            this._hot = false;
        }

        const demo = this._demo();
        const blocked = this._blocked();
        let kind = null;
        let pct = battery?.capacity ?? 0;
        if (demo) {
            kind = demo.kind;
            pct = this.get(kind === 'low' ? 'low-threshold' : 'high-threshold');
        } else if (battery && this.get('alerts-enabled') && !blocked) {
            if (pct >= this.get('high-threshold') && ['charging', 'full'].includes(battery.status)) kind = 'high';
            if (pct <= this.get('low-threshold') && battery.status === 'discharging') kind = 'low';
        }

        const r = this.reminder;
        if (r?.kind === 'visit') {
            if (kind) this._sendAway();
        } else if (r && (r.kind !== kind || r.demo !== (demo?.id ?? null))) {
            if (!r.demo && battery && this._record(r, battery)) this._win();
            else this._dismiss();
        }
        if (kind && !this.reminder) {
            this._start(kind, demo);
        } else if (!kind && !this.reminder && !this.buddies.length && !blocked && this.get('cameos')) {
            if (plugged) this._visit('plugged');
            else if (resumed) this._visit('resume');
        }
        if (this.reminder) {
            this.reminder.pct = pct;
            this._refresh();
        }
        this.platform.statusChanged();
    }

    // Smooth the time estimate a little; power readings jump around.
    _estimate(battery) {
        const m = battery?.minutes ?? null;
        if (m === null || battery.status !== this._lastStatus) this.minutes = m;
        else this.minutes = this.minutes === null ? m : this.minutes * 0.7 + m * 0.3;
    }

    // One battery-health reading per day: "YYYY-MM-DD:health:cycles".
    _logHealth(battery) {
        if (!battery?.health) return;
        const log = [...this.get('health-log')];
        const day = dayString(new Date());
        if (log.length && log[log.length - 1].startsWith(day)) return;
        log.push(`${day}:${battery.health.toFixed(1)}:${battery.cycles ?? ''}`);
        this.set('health-log', log.slice(-400));
    }

    // Weekly summary notification on Sunday evening (or the next time we're running).
    _weekly(date) {
        const week = weekOf(date);
        const current = this.get('week-start');
        const report = label => {
            if (!this.get('weekly-report') || this.get('week-reminders') === 0) return;
            const health = this.battery?.health ? ` Battery health: ${Math.round(this.battery.health)}%.` : '';
            this.platform.notify(`Battery Buddy · ${label}`,
                `You fixed ${this.get('week-obeyed')} of ${this.get('week-reminders')} reminders in time, best streak ${this.get('week-best')} 🔥.${health}`);
        };
        if (current !== week) {
            if (current && this.get('last-report') !== current) report('last week');
            this.set('week-start', week);
            this.set('last-report', '');
            for (const key of ['week-obeyed', 'week-reminders', 'week-best']) this.set(key, 0);
        } else if (date.getDay() === 0 && date.getHours() >= 18 && this.get('last-report') !== week) {
            report('this week');
            this.set('last-report', week);
        }
    }

    _start(kind, demo) {
        this._clear();
        this.platform.pickMonitor();
        this._chat = null;
        const r = this.reminder = {
            kind, demo: demo?.id ?? null, mood: kind === 'low' ? 'low' : 'high', pct: 0,
            start: this.platform.monotonic(), scale: kind === 'ignore' ? 30 : 1, stage: 0, main: null, helper: null, bonus: false,
        };
        const size = this.get('character-size');
        if (kind === 'party') {
            // Everyone comes out, locked or not, spread along the bottom of the screen.
            CHARACTERS.forEach(([id], i) => {
                const b = this._add(id, 'party', size);
                const area = this._bounds(b);
                if (!area) return;
                const x = area.minX + (area.maxX - area.minX) * (i / (CHARACTERS.length - 1));
                b.spawn(x, area.maxY - rand(0, 160), Math.random() < 0.5 ? 1 : -1, 'high');
                b.setStatus(nameOf(id), null, 'high');
                b.setQuote(this._quoteFor(b));
            });
            this._play('tada');
        } else {
            const b = r.main = this._add(this.get('character'), 'main', size);
            const area = this._bounds(b);
            if (area) {
                // Walk in from a random side along the bottom of the screen.
                const fromLeft = Math.random() < 0.5;
                b.spawn(fromLeft ? area.minX : area.maxX, area.maxY, fromLeft ? 1 : -1, r.mood, {hint: this.get('show-hint')});
            }
            b.setQuote(this._quoteFor(b));
            this._play(b.character);
        }
        if (demo?.kind === 'low' && new Date().getHours() === 0) this._unlock('ghost');
        this.platform.setActive(true);
    }

    // A short appearance that isn't a reminder: summoned, plugged in, or back from suspend.
    _visit(type) {
        this._clear();
        this.platform.pickMonitor();
        const size = this.get('character-size');
        const b = this._add(this.get('character'), 'main', size);
        this.reminder = {
            kind: 'visit', visit: type, mood: type === 'resume' ? 'low' : 'high', pct: this.battery?.capacity ?? 0,
            start: this.platform.monotonic(), stage: 0, main: b, demo: null, bonus: false,
        };
        const area = this._bounds(b);
        if (area) {
            const x = rand(area.minX, area.maxX);
            b.spawn(x, area.maxY - rand(0, 80), x < (area.minX + area.maxX) / 2 ? 1 : -1, this.reminder.mood,
                {hint: type === 'summon' && this.get('show-hint')});
            if (type !== 'resume') b.hop();
        }
        b.setQuote(this._quoteFor(b));
        b.leaveAfter(VISITS[type]);
        this._play(b.character);
        this._refresh();
        this.platform.setActive(true);
    }

    _sendAway() {
        this.reminder = null;
        for (const b of this.buddies) {
            if (!b.s) continue;
            b.s.winAt = null;
            b.leaveAfter(0);
            b.s.wait = 0;
        }
    }

    _add(character, role, size) {
        const b = new Buddy(this, character, role, size);
        this.buddies.push(b);
        return b;
    }

    _refresh() {
        const r = this.reminder;
        const estimate = this.get('show-estimate') && this.minutes !== null && !r.demo;
        for (const b of this.buddies) {
            if (b.role !== 'main' || !b.s || b.s.winAt !== null) continue;
            let text;
            let mood = r.mood;
            if (r.kind === 'visit') {
                const status = this.battery?.status;
                mood = r.pct <= this.get('low-threshold') ? 'low' : 'high';
                if (status === 'discharging') text = estimate ? `${r.pct}% · ${formatMinutes(this.minutes)} left` : `${r.pct}% · on battery`;
                else text = `${r.pct}% · ${status === 'full' ? 'full' : 'charging'}`;
            } else if (r.mood === 'low') {
                text = `${r.pct}% · plug in`;
                if (estimate) text += ` · ${formatMinutes(this.minutes)} left`;
            } else {
                text = `${r.pct}% · unplug`;
                if (estimate && this.battery?.status === 'charging') text += ` · full in ${formatMinutes(this.minutes)}`;
            }
            b.setStatus(text, r.pct, mood);
        }
    }

    _quoteFor(b) {
        const r = this.reminder;
        const lines = linesOf(b.character);
        if (!r) return pick(lines.win);
        if (r.kind === 'visit') {
            if (r.visit === 'resume') return pick(SHARED.resume);
            if (r.visit === 'plugged') return pick(lines.plugged);
            if (this.night && Math.random() < 0.5) return fill(pick(SHARED.night), {time: clock()});
            return pick(lines.hello);
        }
        if (b.role === 'party') return pick(lines.high);
        if (b.role === 'helper') {
            return Math.random() < 0.5 ? fill(pick(lines.helper), {name: nameOf(r.main?.character)}) : pick(lines[r.mood]);
        }
        if (r.stage >= 3) return pick([...SHARED.stomp, ...lines.angry]);
        if (r.stage >= 2) return pick([...SHARED.follow, ...lines.angry]);
        if (r.stage >= 1) return pick(lines.angry);
        if (this.night && Math.random() < 0.5) return fill(pick(SHARED.night), {time: clock()});
        return pick(lines[r.mood]);
    }

    // Move the reminder through its escalation stages, and run the celebrate demo.
    _advance(r) {
        if (r.kind === 'visit') return;
        const elapsed = (this.platform.monotonic() - r.start) * r.scale;
        if (r.kind === 'celebrate' && elapsed > 2.5) {
            this._demoDone = r.demo;
            this._win();
            return;
        }
        if (r.kind === 'party' || !r.main?.s || !this.get('escalate')) return;
        let stage = 0;
        STAGES.forEach((at, i) => { if (elapsed >= at) stage = i; });
        if (stage <= r.stage) return;
        r.stage = stage;
        const m = r.main;
        m.s.angry = true;
        // React right away instead of finishing the current stroll first.
        if (m.s.mode === 'walk') { m.s.mode = 'idle'; m.s.wait = 0; }
        m.setQuote(this._quoteFor(m));
        m.s.quoteIn = rand(18, 30);
        this._play(m.character);
        if (stage >= 3 && !r.helper && this.get('helpers')) this._callHelper(r);
    }

    _callHelper(r) {
        const pool = this._available().filter(id => id !== r.main.character);
        if (!pool.length) return;
        const size = Math.round(this.get('character-size') * 0.85);
        const b = r.helper = this._add(pick(pool), 'helper', size);
        const area = this._bounds(b);
        if (!area) return;
        // Come in from the side opposite the main buddy.
        const fromLeft = r.main.s.x > (area.minX + area.maxX) / 2;
        b.spawn(fromLeft ? area.minX : area.maxX, area.maxY, fromLeft ? 1 : -1, r.mood);
        b.setQuote(fill(pick(linesOf(b.character).helper), {name: nameOf(r.main.character)}));
        this._play(b.character);
    }

    _available() {
        if (this.get('unlock-all')) return CHARACTERS.map(([id]) => id);
        const unlocked = this.get('unlocked');
        return CHARACTERS.map(([id]) => id).filter(id => unlocked.includes(id) || STARTERS.includes(id));
    }

    _behaviour(b) {
        const r = this.reminder;
        if (r && r.main === b && !b.s.leaving) {
            if (r.stage >= 3) return 'center';
            if (r.stage >= 2) return 'follow';
        }
        return this.get('roam') ? 'roam' : 'stay';
    }

    _win() {
        this.reminder = null;
        for (const b of this.buddies) b.celebrate(pick(linesOf(b.character).win));
        this._play('tada');
    }

    _dismiss() {
        this.reminder = null;
        for (const b of this.buddies) b.fadeOut();
    }

    _clear() {
        for (const b of this.buddies) b.destroy();
        this.buddies = [];
        this._pickup?.destroy();
        this._pickup = null;
    }

    // Update stats for a reminder that just ended. Returns true if the charger was actually fixed.
    _record(r, battery) {
        const fixed = r.kind === 'high' ? battery.status === 'discharging' : battery.status !== 'discharging';
        if (!fixed) return false;
        const inTime = this.platform.monotonic() - r.start <= OBEY_WINDOW;
        const day = dayString(new Date());
        const add = (key, n = 1) => this.set(key, this.get(key) + n);

        add('reminders');
        add('week-reminders');
        if (inTime) {
            add('obeyed');
            add('week-obeyed');
            add('streak');
            if (this.get('streak-day') !== day) {
                add('day-streak');
                this.set('streak-day', day);
            }
        } else {
            this.set('streak', 0);
            this.set('day-streak', 0);
            this.set('streak-day', day);
        }
        this._bumpBest();
        if (r.kind === 'high') {
            add('unplugged-early');
            add('charge-spared', Math.max(0, 100 - battery.capacity));
        }

        const hour = new Date().getHours();
        if (this.get('obeyed') >= 3) this._unlock('penguin');
        if (this.get('obeyed') >= 10) this._unlock('fox');
        if (inTime && (hour >= 22 || hour < 5)) this._unlock('owl');
        if (this.get('day-streak') >= 7) this._unlock('dragon');
        return true;
    }

    _bumpBest() {
        const streak = this.get('streak');
        const before = this.get('best-streak');
        this.set('best-streak', Math.max(before, streak));
        this.set('week-best', Math.max(this.get('week-best'), streak));
        // Announce a newly earned accessory.
        for (const [name, need] of Object.entries(ACCESSORIES)) {
            if (before < need && streak >= need) {
                const text = `New accessory: ${name === 'shades' ? 'sunglasses 😎' : 'a crown 👑'}!`;
                this.platform.notify('Battery Buddy', `${text} Your buddy is wearing it now.`);
                for (const b of this.buddies) if (b.s) b.say(text, 5);
            }
        }
    }

    _unlock(id) {
        const list = this.get('unlocked');
        if (list.includes(id)) return;
        this.set('unlocked', [...list, id]);
        const text = `New buddy unlocked: ${nameOf(id)}!`;
        this.platform.notify('Battery Buddy', `${text} Pick them in Battery Buddy's settings.`);
        for (const b of this.buddies) if (b.s) b.say(`🎉 ${text}`, 6);
        this._play('tada');
    }

    _play(name) {
        if (!this.get('sounds')) return;
        const t = this.platform.monotonic();
        if (t - this._lastSound < 0.35) return;
        this._lastSound = t;
        this.platform.play(name);
    }

    // button: 1 = primary (jump), 3 = secondary (pet).
    click(b, button) {
        const s = b.s;
        if (!s || s.winAt !== null || s.leaving || b.fading) return;
        if (button === 3) {
            b.pet(pick(linesOf(b.character).pet));
            this._play(b.character);
            return;
        }
        if (button !== 1) return;
        b.clicks = b.clicks.filter(t => s.t - t < 4);
        b.clicks.push(s.t);
        if (b.clicks.length >= 5) {
            b.clicks = [];
            b.makeDizzy(pick(SHARED.dizzy));
            this._play('boing');
            this._dropBattery(b);
            return;
        }
        if (s.dizzy > 0) return;
        // After a few clicks in a row it gets tired and only hops in place.
        if (b.clicks.length >= 3) b.hop();
        else b.jumpAway(this._bounds(b), this.get('hop-duration') / 1000);
        this._play('boing');
    }

    // Mini-game: once per appearance, a dizzy buddy drops a bonus battery.
    _dropBattery(b) {
        const r = this.reminder;
        if (!r || r.bonus || this._pickup) return;
        r.bonus = true;
        const [ax, ay] = b.view.drawingOrigin();
        const x = ax + b.size / 2 + b.s.facing * b.size * 0.55 - 14;
        const y = ay + b.size - 40;
        this._pickup = this.platform.createPickup(x, y, () => {
            if (!r.demo) {
                this.set('streak', this.get('streak') + 1);
                this.set('batteries-caught', this.get('batteries-caught') + 1);
                this._bumpBest();
            }
            if (b.s) b.say(pick(SHARED.caught), 3);
            this._play('tada');
            this._pickup = null;
        }, () => {
            if (b.s) b.say(pick(SHARED.missed), 3);
            this._pickup = null;
        });
    }

    // Party mode: buddies that wander close to each other say hello.
    _partyChat(dt) {
        const c = this._chat ??= {cool: 2, reply: null};
        if (c.reply) {
            c.reply.at -= dt;
            if (c.reply.at <= 0) {
                if (c.reply.b.s) c.reply.b.say(c.reply.text, 3.5);
                c.reply = null;
            }
            return;
        }
        c.cool -= dt;
        if (c.cool > 0) return;
        c.cool = 1;
        const ready = this.buddies.filter(b => b.s && !b.fading && b.s.mode !== 'jump');
        for (const a of ready) {
            for (const b of ready) {
                if (a === b || Math.hypot(a.s.x - b.s.x, a.s.y - b.s.y) > 240) continue;
                for (const [x, y] of [[a, b], [b, a]]) {
                    x.s.facing = y.s.x > x.s.x ? 1 : -1;
                    x.s.mode = 'idle';
                    x.s.wait = 3.5;
                }
                a.say(fill(pick(linesOf(a.character).greet), {other: nameOf(b.character)}), 3.5);
                c.reply = {b, at: 1.6, text: fill(pick(linesOf(b.character).reply), {other: nameOf(a.character)})};
                c.cool = rand(4, 7);
                return;
            }
        }
    }

    // ---- Menu actions --------------------------------------------------------

    snooze(minutes) {
        const until = minutes ? Math.round(Date.now() / 1000 + minutes * 60) : 0;
        const r = this.reminder;
        if (minutes && r && r.kind !== 'visit' && r.main?.s) {
            r.main.say(fill(pick(SHARED.snoozed), {time: clock(new Date(until * 1000))}), 3);
            this.reminder = null;
            for (const b of this.buddies) b.leaveAfter(b === r.main ? 2 : 0);
        }
        this.set('snooze-until', until);
    }

    summon() {
        const r = this.reminder;
        if (r && r.main?.s) {
            r.main.hop();
            r.main.say(pick(linesOf(r.main.character).hello), 3);
            return;
        }
        this._visit('summon');
    }

    statusInfo() {
        const b = this.battery;
        let battery = 'No battery found';
        if (b) {
            const state = b.status === 'discharging' ? 'on battery' : b.status === 'full' ? 'full' : b.status === 'charging' ? 'charging' : b.status;
            battery = `🔋 ${b.capacity}% · ${state}`;
            if (this.minutes !== null && b.status === 'discharging') battery += ` · ${formatMinutes(this.minutes)} left`;
            if (this.minutes !== null && b.status === 'charging') battery += ` · full in ${formatMinutes(this.minutes)}`;
        }
        const streak = this.get('streak');
        const until = this._snoozedUntil();
        return {
            battery,
            streak: streak > 0 ? `🔥 ${streak} in a row (best ${this.get('best-streak')})` : `Best streak: ${this.get('best-streak')}`,
            health: b?.health ? `❤️ Battery health ${Math.round(b.health)}%${b.cycles ? ` · ${b.cycles} cycles` : ''}` : null,
            snoozedUntil: until ? clock(new Date(until * 1000)) : null,
        };
    }

    // ---- Layout and animation ---------------------------------------------------

    // Where a buddy's character drawing (top-left corner) may go, keeping its bubble and pill on screen.
    _bounds(b) {
        const area = this.platform.workArea();
        if (!area || !b.view) return null;
        const margin = this.get('edge-margin');
        const side = (b.view.width - b.size) / 2;
        const {top, below} = b.view.offsets();
        const minX = area.x + margin + side, minY = area.y + margin + top;
        return {
            minX, minY,
            maxX: Math.max(minX, area.x + area.width - margin - side - b.size),
            maxY: Math.max(minY, area.y + area.height - margin - below - b.size),
        };
    }

    // Called every frame while active. dt is in seconds.
    tick(dt) {
        dt = Math.min(0.1, Math.max(0, dt));
        const r = this.reminder;
        if (r) this._advance(r);
        if (r?.kind === 'party') this._partyChat(dt);

        // Grumble about the heat now and then.
        const t = this.platform.monotonic();
        if (this._hot && r?.main?.s && t - this._hotSaid > 180) {
            this._hotSaid = t;
            r.main.say(fill(pick(SHARED.hot), {temp: this._temp}), 4);
        }

        const pointer = this.platform.pointer();
        const walk = this.get('walk-speed');
        for (const b of this.buddies) {
            if (!b.s || b.done) continue;
            const hurry = r && r.main === b && r.stage >= 1 ? (r.stage >= 2 ? 2.2 : 1.8) : 1;
            b.tick(dt, {bounds: this._bounds(b), pointer, speed: walk * hurry, behaviour: this._behaviour(b), hot: this._hot});
            b.s.quoteIn -= dt;
            if (b.s.quoteIn <= 0 && this.reminder && b.s.winAt === null && !b.s.leaving) {
                b.s.quoteIn = rand(18, 30);
                b.setQuote(this._quoteFor(b));
            }
        }

        const finished = this.buddies.filter(b => b.done || !b.s);
        if (finished.length) {
            for (const b of finished) b.destroy();
            this.buddies = this.buddies.filter(b => !finished.includes(b));
        }
        if (this.reminder?.kind === 'visit' && !this.buddies.includes(this.reminder.main)) this.reminder = null;
        if (!this.buddies.length) this.platform.setActive(false);
    }
}
