// Desktop shell: `npm run app` (dev) or `npm run dist` (Windows installer)
// Serves the app from a private app:// origin so fetch() and IndexedDB behave as they do on a web server.
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { basename, join, normalize, resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = resolve(__dirname, '..');
const ORIGIN = 'app://folio';
const STATE_FILE = join(app.getPath('userData'), 'window-state.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let rendererReady = false;
let pending = [];

/* ---------- opening .epub files from Explorer / the command line ---------- */

const epubArgs = (argv) => argv.filter((a) => /\.epub$/i.test(a) && existsSync(a));

async function queueFiles(paths) {
  for (const p of paths) {
    try { pending.push({ name: basename(p), data: new Uint8Array(await readFile(p)) }); } catch (e) {}
  }
  flush();
}

function flush() {
  if (!win || !rendererReady || !pending.length) return;
  win.webContents.send('open-files', pending);
  pending = [];
}

ipcMain.on('renderer-ready', (e) => {
  if (!win || e.sender !== win.webContents) return;
  rendererReady = true;
  flush();
});

app.on('second-instance', (e, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  queueFiles(epubArgs(argv));
});

/* ---------- window ---------- */

async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  const state = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
  writeFile(STATE_FILE, JSON.stringify(state)).catch(() => {});
}

async function createWindow() {
  const state = await loadState();
  win = new BrowserWindow({
    ...(state.bounds || { width: 1280, height: 820 }),
    minWidth: 480,
    minHeight: 400,
    title: 'Folio',
    backgroundColor: '#0b0d14',
    autoHideMenuBar: true,
    show: false,
    icon: app.isPackaged ? undefined : join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  const wc = win.webContents;
  wc.on('did-start-loading', () => { rendererReady = false; });
  // Links in books open in the default browser; the app itself never navigates away.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
  });

  win.loadURL(ORIGIN + '/index.html');
}

/* ---------- menu ---------- */

function buildMenu() {
  const send = (channel) => () => { if (win) win.webContents.send(channel); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Add Books…', accelerator: 'CmdOrCtrl+O', click: send('add-books') },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ] },
    { role: 'windowMenu' },
  ]));
}

/* ---------- boot ---------- */

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { host, pathname } = new URL(req.url);
    const file = normalize(join(ROOT, decodeURIComponent(pathname)));
    if (host !== 'folio' || !file.startsWith(ROOT + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  buildMenu();
  createWindow();
  queueFiles(epubArgs(process.argv.slice(1)));
});

app.on('window-all-closed', () => app.quit());
