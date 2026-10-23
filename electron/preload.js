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
  // { version }
  appInfo() {
    return ipcRenderer.invoke('app-info');
  },
});
