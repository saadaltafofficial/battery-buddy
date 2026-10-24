// Settings window: the same options and stats as the GNOME preferences.
import {cairoFor} from './cairo-canvas.js';
import {CHARACTERS, drawCharacter, isNight, seasonFor} from './shared/characters.js';
import {ACCESSORIES, STARTERS, UNLOCKS} from './shared/personality.js';

const api = window.buddy;
const {values, specs, platform} = await api.getSettings();
let system = await api.getSystem();

const watchers = new Map();
const systemWatchers = [];
function watch(keys, fn) {
    for (const key of keys) {
        if (!watchers.has(key)) watchers.set(key, []);
        watchers.get(key).push(fn);
    }
    fn();
}
api.onSetting((key, value) => {
    values[key] = value;
    for (const fn of watchers.get(key) ?? []) fn();
});
api.onSystem(info => {
    system = info;
    for (const fn of systemWatchers) fn();
});
const set = (key, value) => api.setSetting(key, value);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- Small DOM helpers ----------------------------------------------------------------

function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
    }
    node.append(...children.filter(c => c !== null && c !== undefined));
    return node;
}

function group(page, title, description) {
    page.append(h('h2', {}, title));
    if (description) page.append(h('p', {class: 'group-description'}, description));
    const card = h('div', {class: 'card'});
    page.append(card);
    return card;
}

function text(title, subtitle) {
    return h('div', {class: 'text'}, h('div', {class: 'title'}, title), subtitle ? h('div', {class: 'subtitle'}, subtitle) : null);
}

function switchRow(card, key, title, subtitle) {
    const input = h('input', {type: 'checkbox', role: 'switch'});
    input.addEventListener('change', () => set(key, input.checked));
    watch([key], () => { input.checked = values[key]; });
    card.append(h('label', {class: 'row'}, text(title, subtitle), h('span', {class: 'switch'}, input, h('span'))));
}

function numberRow(card, key, title, step) {
    const {min, max} = specs[key];
    const output = h('output');
    const change = delta => set(key, Math.min(max, Math.max(min, values[key] + delta)));
    const minus = h('button', {type: 'button', 'aria-label': `Decrease ${title}`, onclick: () => change(-step)}, '−');
    const plus = h('button', {type: 'button', 'aria-label': `Increase ${title}`, onclick: () => change(step)}, '+');
    watch([key], () => { output.textContent = values[key]; });
    card.append(h('div', {class: 'row'}, text(title), h('div', {class: 'stepper'}, output, minus, plus)));
}

function selectRow(card, key, title, options, subtitle) {
    const select = h('select', {'aria-label': title});
    const fill = list => {
        select.replaceChildren(...list.map(([value, label]) => h('option', {value}, label)));
        select.value = values[key];
    };
    fill(typeof options === 'function' ? options() : options);
    select.addEventListener('change', () => set(key, select.value));
    watch([key], () => { select.value = values[key]; });
    card.append(h('div', {class: 'row'}, text(title, subtitle), select));
    return fill;
}

function statRow(card, title, subtitle) {
    const value = h('div', {class: 'value'});
    card.append(h('div', {class: 'row'}, text(title, subtitle), value));
    return value;
}

const CHECK = '<svg class="badge on" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg class="badge" viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function badgeRow(card, title) {
    const sub = h('div', {class: 'subtitle'});
    const icon = h('span');
    card.append(h('div', {class: 'row'}, h('div', {class: 'text'}, h('div', {class: 'title'}, title), sub), icon));
    return (subtitle, on) => {
        sub.textContent = subtitle;
        icon.innerHTML = on ? CHECK : LOCK;
    };
}

function available() {
    return CHARACTERS.filter(([id]) => values['unlock-all'] || STARTERS.includes(id) || values.unlocked.includes(id));
}

// ---- Buddy page ---------------------------------------------------------------------

function buddyPage(page) {
    let card = group(page, 'Battery reminders', 'Reminders clear only when the charger state is corrected.');
    switchRow(card, 'alerts-enabled', 'Enable reminders');
    numberRow(card, 'high-threshold', 'Ask me to unplug at (%)', 5);
    numberRow(card, 'low-threshold', 'Ask me to charge at (%)', 5);
    numberRow(card, 'check-interval', 'Check battery every (seconds)', 1);
    switchRow(card, 'show-estimate', 'Show time left', 'For example "18% · plug in · 40m left"');

    card = group(page, 'Character and appearance');
    card.append(preview());
    const fillCharacters = selectRow(card, 'character', 'Desktop companion', () => {
        const list = available();
        if (!list.some(([id]) => id === values.character)) list.push(CHARACTERS.find(([id]) => id === values.character) ?? CHARACTERS[0]);
        return list;
    });
    watch(['unlocked', 'unlock-all'], () => {
        const list = available();
        if (!list.some(([id]) => id === values.character)) list.push(CHARACTERS.find(([id]) => id === values.character) ?? CHARACTERS[0]);
        fillCharacters(list);
    });
    numberRow(card, 'character-size', 'Character size', 8);
    switchRow(card, 'show-hint', 'Show click hint');

    card = group(page, 'Fun', 'Try them from the tray menu: Try a demo.');
    switchRow(card, 'escalate', 'Get pushier when ignored', 'After 2 min it hurries, after 5 it follows your mouse, after 10 it stomps in the middle of the screen');
    switchRow(card, 'helpers', 'Call for backup', 'A second buddy joins after 10 minutes of being ignored');
    switchRow(card, 'cameos', 'Short visits', 'Cheers when you plug in, yawns after sleep, sweats when the CPU runs hot');
    switchRow(card, 'seasonal', 'Seasonal outfits and night mode', 'Pumpkin for Halloween, Santa hat in December, sleepy after midnight');
    switchRow(card, 'sounds', 'Play sounds', 'Each buddy has its own little noise');
    selectRow(card, 'accessory', 'Accessory',
        [['best', 'Best one earned'], ['none', 'None'], ['shades', 'Sunglasses 😎'], ['crown', 'Crown 👑']],
        `Sunglasses at a ${ACCESSORIES.shades} streak, crown at ${ACCESSORIES.crown}`);

    card = group(page, 'Quiet times');
    if (platform === 'win32') switchRow(card, 'quiet-when-sharing', 'Hide during presentations and full-screen apps', 'Games, videos and slideshows won\'t be interrupted');
    if (platform === 'linux') switchRow(card, 'respect-dnd', 'Hide during Do Not Disturb');
    switchRow(card, 'weekly-report', 'Weekly summary', 'A notification on Sunday evening with your week');
    if (platform === 'win32' || platform === 'darwin') switchRow(card, 'start-at-login', 'Start when I sign in');

    card = group(page, 'Screen and positioning');
    selectRow(card, 'monitor', 'Choose monitor', [['primary', 'Primary monitor'], ['external', 'First non-primary monitor'], ['pointer', 'Monitor under cursor']]);
    numberRow(card, 'edge-margin', 'Distance from screen edges', 5);

    card = group(page, 'Movement');
    switchRow(card, 'roam', 'Walk around the screen', 'When off, the buddy stays put until you click it');
    numberRow(card, 'walk-speed', 'Walking speed (pixels per second)', 10);
    numberRow(card, 'hop-duration', 'Jump duration when clicked (milliseconds)', 50);
}

// A small animated stage that shows the chosen character walking back and forth.
function preview() {
    const canvas = h('canvas', {class: 'preview', 'aria-label': 'Animated preview of your buddy'});
    const start = performance.now();
    const draw = now => {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        if (canvas.width !== Math.round(width * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const t = (now - start) / 1000;
        const size = Math.min(130, height);
        const travel = Math.max(0, width - size - 20);
        const c = t % 10;
        const walking = c < 4 || (c >= 5 && c < 9);
        const progress = c < 4 ? c / 4 : c < 5 ? 1 : c < 9 ? 1 - (c - 5) / 4 : 0;
        const date = new Date();
        ctx.setTransform(dpr, 0, 0, dpr, (10 + travel * progress) * dpr, (height - size) * dpr);
        drawCharacter(cairoFor(ctx), values.character, size, {
            t, phase: walking ? t * 8 : 0, moving: walking, facing: c < 5 ? 1 : -1,
            blink: t % 3.2 < 0.15, mood: Math.floor(t / 10) % 2 === 0 ? 'high' : 'low', air: 0,
            season: values.seasonal ? seasonFor(date) : null, night: values.seasonal && isNight(date),
        });
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return canvas;
}

// ---- Stats page -----------------------------------------------------------------------

function statsPage(page) {
    let card = group(page, 'Your streak', 'A reminder counts as fixed in time if you sort out the charger within 5 minutes.');
    const rows = {
        streak: statRow(card, 'Current streak'),
        best: statRow(card, 'Best streak'),
        days: statRow(card, 'Day streak', 'Days with reminders fixed in time and none ignored'),
        obeyed: statRow(card, 'Fixed in time'),
        early: statRow(card, 'Unplugged before 100%'),
        spared: statRow(card, 'Top-of-charge avoided', 'Percentage points you didn\'t charge past your unplug reminder, added up'),
        caught: statRow(card, 'Bonus batteries caught', 'Click a buddy 5 times fast, then catch what it drops'),
    };
    card = group(page, 'This week');
    const week = {fixed: statRow(card, 'Fixed in time'), best: statRow(card, 'Best streak')};
    const keys = ['streak', 'best-streak', 'day-streak', 'obeyed', 'reminders', 'unplugged-early', 'charge-spared', 'batteries-caught', 'week-obeyed', 'week-reminders', 'week-best'];
    watch(keys, () => {
        const n = key => values[key];
        rows.streak.textContent = n('streak') > 0 ? `${plural(n('streak'), 'reminder')} in a row 🔥` : 'No streak yet';
        rows.best.textContent = plural(n('best-streak'), 'reminder');
        rows.days.textContent = plural(n('day-streak'), 'day');
        rows.obeyed.textContent = `${n('obeyed')} of ${n('reminders')}`;
        rows.early.textContent = plural(n('unplugged-early'), 'time');
        rows.spared.textContent = `≈ ${(n('charge-spared') / 100).toFixed(1)} full charges`;
        rows.caught.textContent = String(n('batteries-caught'));
        week.fixed.textContent = `${n('week-obeyed')} of ${n('week-reminders')}`;
        week.best.textContent = plural(n('week-best'), 'reminder');
    });

    healthGroup(page);

    card = group(page, 'Accessories', 'Earned with your best streak, and kept for good.');
    const rewards = Object.entries(ACCESSORIES).map(([id, need]) => [badgeRow(card, id === 'shades' ? 'Sunglasses 😎' : 'Crown 👑'), need]);
    watch(['best-streak'], () => {
        const best = values['best-streak'];
        for (const [update, need] of rewards) update(best >= need ? 'Earned' : `Reach a ${need} streak (best so far: ${best})`, best >= need);
    });

    card = group(page, 'Buddies');
    const buddies = CHARACTERS.map(([id, name]) => [id, badgeRow(card, name)]);
    watch(['unlocked', 'unlock-all'], () => {
        const open = available().map(([id]) => id);
        for (const [id, update] of buddies) {
            const unlocked = open.includes(id);
            update(unlocked ? (STARTERS.includes(id) ? 'Starter buddy' : 'Unlocked') : UNLOCKS[id] ?? '', unlocked);
        }
    });
    switchRow(card, 'unlock-all', 'Unlock everyone now', 'Skip the challenges and use any buddy');

    card = group(page, 'Reset');
    const reset = h('button', {type: 'button', class: 'btn danger'}, 'Reset');
    reset.addEventListener('click', () => {
        if (!window.confirm('Reset stats? Your streaks and counts will go back to zero. Unlocked buddies stay unlocked.')) return;
        for (const key of keys.concat(['streak-day'])) api.resetSetting(key);
    });
    card.append(h('div', {class: 'row'}, text('Reset stats', 'Clears streaks and counts. Unlocked buddies stay unlocked.'), reset));
}

function healthGroup(page) {
    const card = group(page, 'Battery health', 'How much charge the battery can still hold compared with when it was new. Recorded once a day.');
    const now = statRow(card, 'Capacity now');
    const cycles = statRow(card, 'Charge cycles');
    const change = statRow(card, 'Change since tracking began');
    const chart = h('canvas', {class: 'chart', 'aria-label': 'Battery health over time'});
    card.append(h('div', {class: 'row'}, chart));

    const update = () => {
        const points = values['health-log'].map(entry => {
            const [date, health] = entry.split(':');
            return {date, health: Number(health)};
        }).filter(p => Number.isFinite(p.health));
        const latest = system.health ?? points.at(-1)?.health;
        now.textContent = latest ? `${latest.toFixed(1)}% of original` : 'Not reported by this computer';
        cycles.textContent = system.cycles ? String(system.cycles) : '—';
        change.textContent = points.length && latest
            ? `${latest - points[0].health >= 0 ? '+' : ''}${(latest - points[0].health).toFixed(1)} points since ${points[0].date}`
            : '—';
        drawChart(chart, points);
    };
    watch(['health-log'], update);
    systemWatchers.push(update);
    window.addEventListener('resize', update);
}

function drawChart(canvas, points) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 560, height = canvas.clientHeight || 100;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const style = getComputedStyle(document.documentElement);
    ctx.fillStyle = style.getPropertyValue('--dim');
    ctx.font = '12px system-ui, sans-serif';
    if (points.length < 2) {
        ctx.fillText('The chart appears after a couple of days of tracking.', 4, height / 2 + 4);
        return;
    }
    const values = points.map(p => p.health);
    const lo = Math.floor(Math.min(...values) - 1), hi = Math.ceil(Math.max(...values) + 1);
    const x = i => 36 + (i / (points.length - 1)) * (width - 44);
    const y = v => height - 10 - ((v - lo) / (hi - lo)) * (height - 20);
    ctx.fillText(`${hi}%`, 0, 14);
    ctx.fillText(`${lo}%`, 0, height - 4);
    ctx.strokeStyle = style.getPropertyValue('--accent');
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.health)) : ctx.moveTo(x(i), y(p.health))));
    ctx.stroke();
}

// ---- Tabs -----------------------------------------------------------------------------

buddyPage(document.getElementById('page-buddy'));
statsPage(document.getElementById('page-stats'));

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
    for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    }
    if (tab.id === 'tab-stats') window.dispatchEvent(new Event('resize')); // size the chart now it's visible
}
for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab));
if (location.hash === '#stats') selectTab(document.getElementById('tab-stats'));
