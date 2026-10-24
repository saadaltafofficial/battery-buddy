// What the operating system can tell us beyond the browser battery API:
// whether there is a battery at all, its health, CPU temperature, and whether
// now is a bad time to pop up (presentation, full-screen app, Do Not Disturb).
//
// snapshot() = {
//   hasBattery   true / false / null (still finding out)
//   battery      full reading on Linux (from sysfs), otherwise null
//   health       % of design capacity, or null
//   cycles       charge cycles, or null
//   runMinutes   OS estimate of minutes left on battery (Windows), or null
//   temperature  CPU °C, or null
//   sharing      presentation / full-screen app (Windows), else false
//   dnd          Do Not Disturb (GNOME desktops), else false
// }
import {EventEmitter} from 'node:events';
import {execFile, spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const POWER = '/sys/class/power_supply';
const THERMAL = '/sys/class/thermal';
const CPU_ZONES = ['x86_pkg_temp', 'TCPU', 'k10temp', 'cpu-thermal', 'cpu_thermal', 'soc_thermal', 'acpitz'];
const NO_ESTIMATE = 71582788; // Win32_Battery's "unknown / on AC" run time

const read = file => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; } };
const num = file => { const n = Number.parseInt(read(file), 10); return Number.isFinite(n) ? n : null; };
const list = dir => { try { return fs.readdirSync(dir).sort(); } catch { return []; } };

// Same rules as battery.js in the GNOME extension.
function linuxBattery() {
    const batteries = [];
    for (const name of list(POWER)) {
        if (!name.startsWith('BAT')) continue;
        const p = path.join(POWER, name);
        const capacity = num(`${p}/capacity`);
        const status = read(`${p}/status`)?.toLowerCase();
        if (capacity === null || !status) continue;
        batteries.push({
            capacity, status,
            now: num(`${p}/energy_now`) ?? num(`${p}/charge_now`),
            full: num(`${p}/energy_full`) ?? num(`${p}/charge_full`),
            design: num(`${p}/energy_full_design`) ?? num(`${p}/charge_full_design`),
            rate: Math.abs(num(`${p}/power_now`) ?? num(`${p}/current_now`) ?? 0),
            cycles: num(`${p}/cycle_count`),
        });
    }
    if (!batteries.length) return null;
    const known = key => batteries.every(b => b[key] > 0);
    const sum = key => batteries.reduce((total, b) => total + (b[key] ?? 0), 0);
    const statuses = batteries.map(b => b.status);
    let status = statuses[0];
    if (statuses.includes('charging')) status = 'charging';
    else if (statuses.includes('discharging')) status = 'discharging';
    else if (statuses.every(s => s === 'full')) status = 'full';
    let capacity = Math.round(sum('capacity') / batteries.length);
    if (batteries.length > 1 && known('now') && known('full')) capacity = Math.round((100 * sum('now')) / sum('full'));
    let minutes = null;
    const rate = sum('rate');
    if (rate > 0 && known('now') && known('full')) {
        if (status === 'charging') minutes = ((sum('full') - sum('now')) / rate) * 60;
        else if (status === 'discharging') minutes = (sum('now') / rate) * 60;
        if (minutes !== null && (minutes < 0 || minutes > 24 * 60)) minutes = null;
    }
    return {
        capacity: Math.min(100, Math.max(0, capacity)),
        status,
        minutes,
        health: known('full') && known('design') ? (100 * sum('full')) / sum('design') : null,
        cycles: batteries.some(b => b.cycles > 0) ? Math.max(...batteries.map(b => b.cycles ?? 0)) : null,
    };
}

function linuxTemperature() {
    const zones = {};
    for (const name of list(THERMAL)) {
        if (!name.startsWith('thermal_zone')) continue;
        const type = read(`${THERMAL}/${name}/type`);
        const temp = num(`${THERMAL}/${name}/temp`);
        if (type && temp !== null && temp > 0 && temp < 150000) zones[type] = Math.max(zones[type] ?? 0, temp);
    }
    const type = CPU_ZONES.find(t => t in zones);
    return type ? Math.round(zones[type] / 1000) : null;
}

export class SystemInfo extends EventEmitter {
    constructor(dataDir, probeSource) {
        super();
        this.dataDir = dataDir;
        this.probeSource = probeSource;
        this.info = {hasBattery: null, battery: null, health: null, cycles: null, runMinutes: null, temperature: null, sharing: false, dnd: false};
        this._timers = [];
        this._probe = null;
        this._stopped = false;
    }

    snapshot() {
        return {...this.info};
    }

    start() {
        if (process.platform === 'win32') this._startWindows();
        else if (process.platform === 'linux') this._every(5000, () => this._pollLinux());
        else if (process.platform === 'darwin') this._every(10 * 60 * 1000, () => this._pollMac());
        else this._update({hasBattery: false});
    }

    stop() {
        this._stopped = true;
        for (const t of this._timers) clearInterval(t);
        this._probe?.kill();
    }

    _every(ms, fn) {
        fn();
        this._timers.push(setInterval(fn, ms));
    }

    _update(changes) {
        Object.assign(this.info, changes);
        this.emit('update', this.snapshot());
    }

    _pollLinux() {
        const battery = linuxBattery();
        const changes = {
            hasBattery: Boolean(battery), battery,
            health: battery?.health ?? null, cycles: battery?.cycles ?? null,
            temperature: linuxTemperature(),
        };
        // GNOME-based desktops: Do Not Disturb turns off notification banners.
        execFile('gsettings', ['get', 'org.gnome.desktop.notifications', 'show-banners'], {timeout: 2000}, (err, out) => {
            this._update({...changes, dnd: !err && out.trim() === 'false'});
        });
    }

    _pollMac() {
        execFile('ioreg', ['-rn', 'AppleSmartBattery'], {timeout: 5000}, (err, out) => {
            if (err || !out.trim()) { this._update({hasBattery: false}); return; }
            const value = key => {
                const m = out.match(new RegExp(`"${key}" = (\\d+)`));
                return m ? Number(m[1]) : null;
            };
            const design = value('DesignCapacity');
            const max = value('AppleRawMaxCapacity') ?? value('MaxCapacity');
            this._update({
                hasBattery: true,
                health: design && max && max > 100 ? (100 * max) / design : null,
                cycles: value('CycleCount'),
            });
        });
    }

    // A long-running PowerShell helper (probe.ps1) reports once every 15 s.
    _startWindows() {
        const script = path.join(this.dataDir, 'probe.ps1');
        fs.mkdirSync(this.dataDir, {recursive: true});
        fs.writeFileSync(script, this.probeSource);
        let restarts = 0;
        const launch = () => {
            if (this._stopped) return;
            const child = this._probe = spawn('powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
                {windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
            let buffer = '';
            child.stdout.on('data', chunk => {
                buffer += chunk;
                let i;
                while ((i = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, i).trim();
                    buffer = buffer.slice(i + 1);
                    if (line) this._onProbe(line);
                }
            });
            child.on('exit', () => {
                if (this._stopped) return;
                // Without the helper we still work; we just don't know if there's a battery.
                if (this.info.hasBattery === null) this._update({hasBattery: true});
                if (restarts++ < 5) setTimeout(launch, 5000 * restarts);
            });
            child.on('error', () => {});
        };
        launch();
    }

    _onProbe(line) {
        let p;
        try { p = JSON.parse(line); } catch { return; }
        const kelvin = Number(p.temp);
        this._update({
            hasBattery: p.batteries > 0,
            health: p.design > 0 && p.full > 0 ? (100 * p.full) / p.design : null,
            cycles: p.cycles > 0 ? p.cycles : null,
            runMinutes: p.run > 0 && p.run < NO_ESTIMATE ? p.run : null,
            temperature: kelvin > 0 ? Math.round(kelvin / 10 - 273.15) : null,
            sharing: [2, 3, 4].includes(p.notify),
        });
    }
}
