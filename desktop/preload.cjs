// The only bridge between the app's web pages and Electron: a small, fixed API.
const {contextBridge, ipcRenderer} = require('electron');

const listen = channel => callback => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
};

contextBridge.exposeInMainWorld('buddy', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSetting: (key, value) => ipcRenderer.send('settings:set', key, value),
    resetSetting: key => ipcRenderer.send('settings:reset', key),
    onSetting: listen('setting'),
    getSystem: () => ipcRenderer.invoke('system:get'),
    onSystem: listen('system'),

    // Overlay only
    setActive: active => ipcRenderer.send('overlay:active', active),
    setInteractive: on => ipcRenderer.send('overlay:interactive', on),
    pickDisplay: () => ipcRenderer.send('overlay:pick-display'),
    status: info => ipcRenderer.send('status', info),
    notify: (title, body) => ipcRenderer.send('notify', title, body),
    onPointer: listen('pointer'),
    onResume: listen('resume'),
    onMonitorsChanged: listen('monitors-changed'),
    onDemo: listen('demo'),
    onAction: listen('action'),

    openSettings: () => ipcRenderer.send('open-settings'),
});
