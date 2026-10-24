// Draws the buddies on a transparent window and connects the shared engine to the
// desktop: battery from the browser battery API (plus OS details from the main
// process), settings over IPC, and HTML elements for bubbles and pills.
import {cairoFor} from './cairo-canvas.js';
import {drawCharacter} from './shared/characters.js';
import {Engine} from './shared/engine.js';

const api = window.buddy;
const stage = document.getElementById('stage');
const {values} = await api.getSettings();
let system = await api.getSystem();
let pointer = [-1000, -1000];
let interactive = false;
let active = false;
let demo = null;
let last = null;
let engine = null;

const BATTERY_ICON = `<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
  <rect x="0.75" y="0.75" width="18" height="10.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="19.5" y="3.5" width="2" height="5" rx="0.5" fill="currentColor"/>
  <rect class="level" x="2.75" y="2.75" width="14" height="6.5" rx="1.2" fill="currentColor"/>
</svg>`;

const PICKUP_ICON = `<svg width="28" height="38" viewBox="0 0 28 38" aria-hidden="true">
  <rect x="10" y="1.5" width="8" height="4" rx="1.5" fill="#ffd640" stroke="#232733" stroke-width="2.2"/>
  <rect x="3" y="4.5" width="22" height="31" rx="4.5" fill="#ffd640" stroke="#232733" stroke-width="2.2"/>
  <path d="M16 9 9.5 21H14l-2 10 7-13.5h-4.5z" fill="#232733"/>
</svg>`;

function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
}

// How a buddy looks: bubble, canvas drawing, status pill and click hint, stacked.
class View {
    constructor(buddy) {
        this.buddy = buddy;
        this.root = el('div', 'buddy');
        this.bubble = el('div', 'bubble');
        this.bubble.hidden = true;
        this.canvas = el('canvas');
        this.pill = el('div', 'pill', BATTERY_ICON);
        this.meter = this.pill.querySelector('svg');
        this.level = this.pill.querySelector('.level');
        this.label = el('span');
        this.pill.append(this.label);
        this.hint = el('div', 'hint');
        this.hint.textContent = 'click · right-click to pet';
        this.hint.hidden = true;
        this.root.append(this.bubble, this.canvas, this.pill, this.hint);
        this.root.addEventListener('mousedown', event => {
            event.preventDefault();
            engine.click(buddy, event.button === 2 ? 3 : event.button === 0 ? 1 : 0);
        });
        this.root.addEventListener('contextmenu', event => event.preventDefault());
        stage.append(this.root);
    }

    get width() {
        return this._width;
    }

    resize(size) {
        this.size = size;
        this._width = Math.max(240, size + 30);
        this.root.style.width = `${this._width}px`;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(size * dpr);
        this.canvas.height = Math.round(size * dpr);
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
    }

    offsets() {
        const gap = 2, tail = 10;
        const top = this.bubble.hidden ? 0 : this.bubble.offsetHeight + tail + gap;
        let below = 0;
        for (const node of [this.pill, this.hint]) if (!node.hidden) below += node.offsetHeight + gap;
        return {top, below};
    }

    place(x, y) {
        this.root.style.transform = `translate(${x}px, ${y}px)`;
    }

    setSpeech(text) {
        this.bubble.textContent = text;
        this.bubble.hidden = !text;
    }

    setStatus(text, pct, mood) {
        this.label.textContent = text;
        this.meter.style.display = pct === null ? 'none' : '';
        this.level.setAttribute('width', String(Math.max(1.5, (14 * (pct ?? 0)) / 100)));
        this.pill.classList.toggle('low', mood === 'low');
    }

    setPillVisible(visible) {
        this.pill.hidden = !visible;
    }

    setHintVisible(visible) {
        this.hint.hidden = !visible;
    }

    redraw() {
        if (!this.buddy.s) return;
        const ctx = this.canvas.getContext('2d');
        const dpr = this.canvas.width / this.size;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCharacter(cairoFor(ctx), this.buddy.character, this.size, this.buddy.drawState());
    }

    fadeIn() {
        this.root.animate([{opacity: 0}, {opacity: 1}], {duration: 300, easing: 'ease-out'});
    }

    fadeOut(ms, accelerate, onDone) {
        for (const a of this.root.getAnimations()) a.cancel();
        const fade = this.root.animate([{opacity: 1}, {opacity: 0}], {duration: ms, easing: accelerate ? 'ease-in' : 'ease-out', fill: 'forwards'});
        fade.onfinish = onDone;
    }

    drawingOrigin() {
        const r = this.canvas.getBoundingClientRect();
        return [r.left, r.top];
    }

    destroy() {
        this.root.remove();
    }
}

// A bonus battery that drops after the buddy gets dizzy. Click it within 3 seconds.
function createPickup(x, y, onCatch, onMiss) {
    const node = el('div', 'pickup', PICKUP_ICON);
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    stage.append(node);
    node.animate([
        {transform: 'translateY(-70px)', offset: 0},
        {transform: 'translateY(0)', offset: 0.5, easing: 'ease-out'},
        {transform: 'translateY(-18px)', offset: 0.68, easing: 'ease-in'},
        {transform: 'translateY(0)', offset: 0.84, easing: 'ease-out'},
        {transform: 'translateY(-5px)', offset: 0.92, easing: 'ease-in'},
        {transform: 'translateY(0)', offset: 1},
    ], {duration: 800});
    let done = false;
    const finish = caught => {
        if (done) return;
        done = true;
        clearTimeout(blink);
        clearTimeout(timeout);
        for (const a of node.getAnimations()) a.cancel();
        const scale = caught ? 1.8 : 0.6;
        node.animate([{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: `scale(${scale})`}], {duration: 250, fill: 'forwards'})
            .onfinish = () => node.remove();
        (caught ? onCatch : onMiss)();
    };
    const blink = setTimeout(() => node.animate([{opacity: 1}, {opacity: 0.3}], {duration: 160, iterations: 6, direction: 'alternate'}), 2000);
    const timeout = setTimeout(() => finish(false), 3000);
    node.addEventListener('mousedown', event => { event.preventDefault(); finish(true); });
    return {
        destroy() {
            done = true;
            clearTimeout(blink);
            clearTimeout(timeout);
            node.remove();
        },
    };
}

// ---- Battery -------------------------------------------------------------------------

let manager = null;
try { manager = await navigator.getBattery(); } catch {}

function battery() {
    if (system.battery) return system.battery; // Linux: full sysfs reading from the main process
    // A desktop PC looks exactly like a full, plugged-in laptop to the browser API,
    // so only trust it once the OS has confirmed there is a battery.
    if (!system.hasBattery || !manager) return null;
    const capacity = Math.round(manager.level * 100);
    const status = manager.charging ? (capacity >= 100 ? 'full' : 'charging') : 'discharging';
    const seconds = manager.charging ? manager.chargingTime : manager.dischargingTime;
    let minutes = Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : null;
    if (minutes === null && !manager.charging) minutes = system.runMinutes ?? null;
    return {capacity, status, minutes, health: system.health, cycles: system.cycles};
}

// ---- Engine --------------------------------------------------------------------------

function frame(ms) {
    if (!active) return;
    const t = ms / 1000;
    engine.tick(last === null ? 0 : t - last);
    last = t;
    requestAnimationFrame(frame);
}

engine = new Engine({
    settings: {
        get: key => values[key],
        set: (key, value) => {
            values[key] = value;
            api.setSetting(key, value);
        },
    },
    battery,
    cpuTemperature: () => system.temperature ?? null,
    sharing: () => Boolean(system.sharing),
    dnd: () => Boolean(system.dnd),
    demo: () => demo,
    monotonic: () => performance.now() / 1000,
    pickMonitor: () => api.pickDisplay(),
    workArea: () => ({x: 0, y: 0, width: window.innerWidth, height: window.innerHeight}),
    pointer: () => pointer,
    createView: buddy => new View(buddy),
    createPickup,
    notify: (title, body) => api.notify(title, body),
    play: name => {
        const audio = new Audio(`shared/sounds/${name}.wav`);
        audio.play().catch(() => {});
    },
    setActive: on => {
        if (on === active) return;
        active = on;
        api.setActive(on);
        if (on) {
            last = null;
            requestAnimationFrame(frame);
        } else if (interactive) {
            interactive = false;
            api.setInteractive(false);
        }
    },
    statusChanged: () => api.status(engine.statusInfo()),
});
window.engine = engine; // handy for debugging in DevTools

let checkTimer = null;
function schedule() {
    clearInterval(checkTimer);
    checkTimer = setInterval(() => engine.check(), values['check-interval'] * 1000);
}

api.onSetting((key, value) => {
    values[key] = value;
    if (key === 'check-interval') schedule();
    engine.onSetting(key);
});
api.onSystem(info => { system = info; });
api.onResume(() => engine.onResume());
api.onMonitorsChanged(() => engine.onMonitorsChanged());
api.onDemo(kind => {
    demo = kind === 'stop' ? null : `${kind} ${Math.floor(Date.now() / 1000) + 45}`;
    engine.check();
});
api.onAction(action => {
    if (action.type === 'snooze') engine.snooze(action.minutes);
    if (action.type === 'summon') engine.summon();
});
// Catch clicks only while the pointer is over a buddy or the bonus battery.
api.onPointer(p => {
    pointer = p;
    const hit = Boolean(document.elementFromPoint(p[0], p[1])?.closest('.buddy, .pickup'));
    if (hit !== interactive) {
        interactive = hit;
        api.setInteractive(hit);
    }
});
manager?.addEventListener('chargingchange', () => engine.check());
manager?.addEventListener('levelchange', () => engine.check());
window.addEventListener('resize', () => engine.fitInside());

schedule();
engine.start();
