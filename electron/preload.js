// Bridge between the desktop shell and the web app. Only present when running in Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioDesktop', {
  // Files opened from Explorer ("Open with Folio") or passed on the command line.
  onOpenFiles(cb) {
    ipcRenderer.on('open-files', (e, files) => cb(files));
    ipcRenderer.send('renderer-ready');
  },
  onAddBooks(cb) {
    ipcRenderer.on('add-books', () => cb());
  },
});
