// Battery Buddy desktop app (Windows, macOS, Linux).
// The main process owns the tray icon, settings file, OS readings and windows.
// The buddies themselves live in overlay.html, driven by the same engine as the
// GNOME extension.
import {app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, net, powerMonitor, protocol, screen} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {SystemInfo} from './system/info.js';
import {Store} from './system/store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, 'app');
const PRELOAD = path.join(HERE, 'preload.cjs');
const DEMOS = [['high', 'Unplug reminder'], ['low', 'Plug-in reminder'], ['party', 'Party (everyone)'], ['celebrate', 'Victory dance'], ['ignore', 'Ignored reminder (fast)']];

let store, system, overlay, settingsWindow, tray;
let status = null;
let pointerTimer = null;

protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

// Chromium reorders a second launch's argv (flags first, values last), so we
// also send the original list along with the lock request.
if (!app.requestSingleInstanceLock({argv: process.argv})) {
    app.quit();
} else {
    // A second launch (e.g. "Battery Buddy.exe --demo party") talks to the running one.
    app.on('second-instance', (_event, argv, _cwd, data) => handleArgs(data?.argv ?? argv));
    app.on('window-all-closed', () => {}); // keep running in the tray
    app.on('before-quit', () => {
        store?.flush();
        system?.stop();
    });
    app.whenReady().then(start);
}

function start() {
    app.setAppUserModelId('io.github.saadaltafofficial.batterybuddy');
    if (process.platform === 'darwin') app.dock?.hide();

    // Serve the app's own files from app:// so ES modules load like on a website.
    protocol.handle('app', request => {
        const file = path.normalize(path.join(APP, decodeURIComponent(new URL(request.url).pathname)));
        if (!file.startsWith(APP + path.sep)) return new Response('Not found', {status: 404});
        return net.fetch(pathToFileURL(file).toString());
    });

    const defaults = JSON.parse(fs.readFileSync(path.join(APP, 'shared', 'defaults.json'), 'utf8'));
    store = new Store(path.join(app.getPath('userData'), 'settings.json'), defaults);
    store.onChange((key, value) => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('setting', key, value);
        if (key === 'start-at-login') applyLoginItem();
    });
    applyLoginItem();

    system = new SystemInfo(app.getPath('userData'), fs.readFileSync(path.join(HERE, 'system', 'probe.ps1'), 'utf8'));
    system.on('update', info => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('system', info);
    });
    system.start();

    registerIpc();
    createOverlay();
    createTray();

    powerMonitor.on('resume', () => overlay?.webContents.send('resume'));
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
        screen.on(event, () => overlay?.webContents.send('monitors-changed'));
    }
    overlay.webContents.once('did-finish-load', () => handleArgs(process.argv));
}

function applyLoginItem() {
    // Only for the installed app; a dev run shouldn't register Electron itself.
    if (!app.isPackaged || !['win32', 'darwin'].includes(process.platform)) return;
    app.setLoginItemSettings({openAtLogin: store.get('start-at-login')});
}

// ---- Overlay: one transparent, click-through window over the chosen screen -------

function createOverlay() {
    const {workArea} = screen.getPrimaryDisplay();
    overlay = new BrowserWindow({
        ...workArea,
        transparent: true,
        backgroundColor: '#00000000',
        frame: false,
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        title: 'Battery Buddy',
        webPreferences: {preload: PRELOAD, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required'},
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
    overlay.setIgnoreMouseEvents(true, {forward: true});
    overlay.loadURL('app://bundle/overlay.html');
}

function pickDisplay() {
    const option = store.get('monitor');
    const primary = screen.getPrimaryDisplay();
    let display = primary;
    if (option === 'external') display = screen.getAllDisplays().find(d => d.id !== primary.id) ?? primary;
    if (option === 'pointer') display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    overlay.setBounds(display.workArea);
}

// The overlay ignores the mouse except right over a buddy. We tell it where the
// pointer is ~30 times a second and it tells us when to start catching clicks.
function setActive(active) {
    clearInterval(pointerTimer);
    pointerTimer = null;
    if (!active) {
        overlay.setIgnoreMouseEvents(true, {forward: true});
        overlay.hide();
        return;
    }
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, 'screen-saver');
    pointerTimer = setInterval(() => {
        const p = screen.getCursorScreenPoint();
        const b = overlay.getBounds();
        overlay.webContents.send('pointer', [p.x - b.x, p.y - b.y]);
    }, 33);
}

function registerIpc() {
    ipcMain.handle('settings:get', () => ({values: store.all(), specs: store.defaults, platform: process.platform}));
    ipcMain.on('settings:set', (_e, key, value) => store.set(key, value));
    ipcMain.on('settings:reset', (_e, key) => store.reset(key));
    ipcMain.handle('system:get', () => system.snapshot());
    ipcMain.on('overlay:active', (_e, active) => setActive(active));
    ipcMain.on('overlay:interactive', (_e, on) => overlay.setIgnoreMouseEvents(!on, {forward: true}));
    ipcMain.on('overlay:pick-display', () => pickDisplay());
    ipcMain.on('status', (_e, info) => {
        if (JSON.stringify(info) === JSON.stringify(status)) return;
        status = info;
        updateTray();
    });
    ipcMain.on('notify', (_e, title, body) => {
        if (Notification.isSupported()) new Notification({title, body, icon: path.join(APP, 'icons', 'app.png')}).show();
    });
    ipcMain.on('open-settings', () => openSettings());
}

function send(action) {
    overlay?.webContents.send('action', action);
}

function demo(kind) {
    overlay?.webContents.send('demo', kind);
}

// ---- Tray icon and menu --------------------------------------------------------------

function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(APP, 'icons', 'tray.png')));
    tray.setToolTip('Battery Buddy');
    tray.on('click', () => tray.popUpContextMenu());
    updateTray();
}

function updateTray() {
    if (!tray) return;
    const s = status ?? {battery: 'Checking the battery…', streak: '', health: null, snoozedUntil: null};
    const info = [s.battery, s.streak, s.health].filter(Boolean).map(label => ({label, enabled: false}));
    const snooze = s.snoozedUntil
        ? [{label: `Snoozed until ${s.snoozedUntil}`, enabled: false}, {label: 'Resume reminders', click: () => send({type: 'snooze', minutes: 0})}]
        : [];
    tray.setToolTip(`Battery Buddy\n${s.battery}`);
    tray.setContextMenu(Menu.buildFromTemplate([
        ...info,
        {type: 'separator'},
        ...snooze,
        {label: 'Snooze for 15 minutes', click: () => send({type: 'snooze', minutes: 15})},
        {label: 'Snooze for 1 hour', click: () => send({type: 'snooze', minutes: 60})},
        {type: 'separator'},
        {label: 'Summon buddy', click: () => send({type: 'summon'})},
        {label: 'Try a demo', submenu: [
            ...DEMOS.map(([kind, label]) => ({label, click: () => demo(kind)})),
            {type: 'separator'},
            {label: 'Stop demo', click: () => demo('stop')},
        ]},
        {label: 'Settings…', click: () => openSettings()},
        {type: 'separator'},
        {label: 'Quit Battery Buddy', click: () => app.quit()},
    ]));
}

// ---- Settings window -----------------------------------------------------------------

function openSettings(page = '') {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.show();
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 720,
        height: 860,
        minWidth: 520,
        minHeight: 480,
        title: 'Battery Buddy Settings',
        icon: path.join(APP, 'icons', 'app.png'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {preload: PRELOAD},
    });
    settingsWindow.removeMenu();
    settingsWindow.once('ready-to-show', () => settingsWindow.show());
    settingsWindow.loadURL(`app://bundle/settings.html${page ? `#${page}` : ''}`);
}

// ---- Command line: --demo <kind>, --summon, --snooze <minutes>, --settings ----------

function handleArgs(argv) {
    const arg = name => {
        const i = argv.indexOf(name);
        if (i < 0) return null;
        const value = argv[i + 1] ?? '';
        return value.startsWith('--') ? '' : value;
    };
    const kind = arg('--demo');
    if (kind !== null) demo(kind || 'high');
    if (argv.includes('--summon')) send({type: 'summon'});
    const minutes = arg('--snooze');
    if (minutes !== null) send({type: 'snooze', minutes: Number(minutes) || 15});
    const page = arg('--settings');
    if (page !== null) openSettings(page);
    // Development only: run JavaScript in the overlay (used by the test scripts).
    const code = arg('--dev-eval');
    if (code && !app.isPackaged) overlay.webContents.executeJavaScript(code).catch(e => console.error(e));
    const shot = arg('--dev-capture');
    if (shot && !app.isPackaged) {
        overlay.webContents.capturePage().then(image => fs.writeFileSync(shot, image.toPNG()));
    }
}
