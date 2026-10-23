// Bridge between the desktop shell and the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioDesktop', {
  // 'win32', 'darwin' or 'linux'
  platform: process.platform,
  // Files opened from Explorer ("Open with Folio") or passed on the command line.
  onOpenFiles(cb) {
    ipcRenderer.on('open-files', (e, files) => cb(files));
    ipcRenderer.send('renderer-ready');
  },
  onAddBooks(cb) {
    ipcRenderer.on('add-books', () => cb());
  },
  onAddFolder(cb) {
    ipcRenderer.on('add-folder', () => cb());
  },
  // Save dialog for exports (text or bytes); resolves to the chosen path, or null if cancelled.
  saveFile(name, data) {
    return ipcRenderer.invoke('save-file', name, data);
  },
  // colours for the window buttons drawn over the top bar, as #rrggbb, and the bar's height in CSS pixels
  setTitleBar(color, symbolColor, height) {
    ipcRenderer.send('title-bar', color, symbolColor, height);
  },
  // the natural voice: { installed, downloading, bytes }; install() reports { received, total }
  voice: {
    status: () => ipcRenderer.invoke('voice-status'),
    install(onProgress) {
      const listener = (e, p) => onProgress && onProgress(p);
      ipcRenderer.on('voice-progress', listener);
      return ipcRenderer.invoke('voice-install').finally(() => ipcRenderer.removeListener('voice-progress', listener));
    },
    cancel: () => ipcRenderer.invoke('voice-cancel'),
    remove: () => ipcRenderer.invoke('voice-remove'),
    // resolves to { samples (Float32Array, mono), rate }
    speak: (text, voice, speed) => ipcRenderer.invoke('voice-speak', text, voice, speed),
  },
  // { version }
  appInfo() {
    return ipcRenderer.invoke('app-info');
  },
});
