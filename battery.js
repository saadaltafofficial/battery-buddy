// Generated with AI for personal use.
// Battery, health and temperature readings straight from sysfs (no D-Bus, no network).
import GLib from 'gi://GLib';

const POWER = '/sys/class/power_supply';
const THERMAL = '/sys/class/thermal';
// Thermal zones that measure the CPU itself, best first. acpitz is a rough fallback.
const CPU_ZONES = ['x86_pkg_temp', 'TCPU', 'k10temp', 'cpu-thermal', 'cpu_thermal', 'soc_thermal', 'acpitz'];

export function readFile(path) {
    try { return new TextDecoder().decode(GLib.file_get_contents(path)[1]).trim(); }
    catch { return null; }
}

function num(path) {
    const value = Number.parseInt(readFile(path), 10);
    return Number.isFinite(value) ? value : null;
}

function list(dir) {
    const names = [];
    try {
        const d = GLib.Dir.open(dir, 0);
        let name;
        while ((name = d.read_name()) !== null) names.push(name);
        d.close();
    } catch {}
    return names.sort();
}

// Every BAT* combined into one battery:
//   capacity  0-100, weighted by each battery's size when the kernel reports it
//   status    'charging' | 'discharging' | 'full' | 'not charging' | …
//   minutes   minutes until full (charging) or empty (discharging), or null
//   health    current full capacity as % of the original design capacity, or null
//   cycles    charge cycle count, or null
export function batteryInfo() {
    const batteries = [];
    for (const name of list(POWER)) {
        if (!name.startsWith('BAT')) continue;
        const p = `${POWER}/${name}`;
        const capacity = num(`${p}/capacity`);
        const status = readFile(`${p}/status`)?.toLowerCase();
        if (capacity === null || !status) continue;
        // Laptops report either energy (µWh, µW) or charge (µAh, µA); ratios and times work with both.
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

    // One battery: trust the kernel's own percentage. Several: weight by size.
    let capacity = Math.round(sum('capacity') / batteries.length);
    if (batteries.length > 1 && known('now') && known('full')) capacity = Math.round((100 * sum('now')) / sum('full'));

    let minutes = null;
    const rate = sum('rate');
    if (rate > 0 && known('now') && known('full')) {
        if (status === 'charging') minutes = ((sum('full') - sum('now')) / rate) * 60;
        else if (status === 'discharging') minutes = (sum('now') / rate) * 60;
        if (minutes !== null && (minutes < 0 || minutes > 24 * 60)) minutes = null;
    }
    const cycles = batteries.some(b => b.cycles > 0) ? Math.max(...batteries.map(b => b.cycles ?? 0)) : null;
    return {
        capacity: Math.min(100, Math.max(0, capacity)),
        status,
        minutes,
        health: known('full') && known('design') ? (100 * sum('full')) / sum('design') : null,
        cycles,
        count: batteries.length,
    };
}

// CPU temperature in °C, or null if the laptop doesn't expose one.
export function cpuTemperature() {
    const zones = {};
    for (const name of list(THERMAL)) {
        if (!name.startsWith('thermal_zone')) continue;
        const type = readFile(`${THERMAL}/${name}/type`);
        const temp = num(`${THERMAL}/${name}/temp`);
        if (type && temp !== null && temp > 0 && temp < 150000) zones[type] = Math.max(zones[type] ?? 0, temp);
    }
    const type = CPU_ZONES.find(t => t in zones);
    return type ? Math.round(zones[type] / 1000) : null;
}
