// Desktop shell: `npm start` (dev) or `npm run dist` (installers for the system it runs on)
// Serves the app from a private app:// origin so fetch() and IndexedDB work as they would on a website.
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain, dialog } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { basename, join, normalize, resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

// The portable build keeps its library in a folder next to the .exe, so it can live on a USB stick.
if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath('userData', join(process.env.PORTABLE_EXECUTABLE_DIR, 'Folio Data'));

const ROOT = resolve(__dirname, '..');
const IS_MAC = process.platform === 'darwin';
const ORIGIN = 'app://folio';
const STATE_FILE = join(app.getPath('userData'), 'window-state.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let rendererReady = false;
let pending = [];

/* ---------- opening books from Explorer / the command line ---------- */

// keep in step with FORMAT_OF in js/convert.js
const BOOK_RE = /\.(epub|mobi|prc|azw3?|kf8|fb2|fbz|fb2\.zip|pdf|docx|html?|xhtml|md|markdown|txt|cbz|cbr|cbt|cb7)$/i;
const bookArgs = (argv) => argv.filter((a) => BOOK_RE.test(a) && existsSync(a));

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

const SAVE_TYPES = { md: 'Markdown', zip: 'Zip archive' };

// Exports (highlights as Markdown, library backups) go through a Save dialog.
// data is text or bytes; resolves to the saved path, or null if cancelled.
ipcMain.handle('save-file', async (e, name, data) => {
  if (!win || e.sender !== win.webContents) return null;
  const ext = (String(name).match(/\.(\w+)$/) || [])[1] || 'txt';
  const res = await dialog.showSaveDialog(win, {
    defaultPath: join(app.getPath('documents'), basename(String(name))),
    filters: [{ name: SAVE_TYPES[ext] || 'Text', extensions: [ext] }],
  });
  if (res.canceled || !res.filePath) return null;
  await writeFile(res.filePath, data instanceof Uint8Array ? data : String(data));
  return res.filePath;
});

ipcMain.handle('app-info', () => ({ version: app.getVersion() }));

/* ---------- the natural voice ----------
   Kokoro-82M (Apache-2.0) from a fixed revision on Hugging Face, downloaded once when the reader
   asks for it, checked against its published SHA-256 sums, and kept with the library. It runs in a
   utility process (voice.js) so speaking never holds up the window. */

const VOICE_REPO = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/';
const VOICE_FILES = [
  { from: 'onnx/model_uint8.onnx', to: 'model.onnx', size: 177464632, sha256: '6607a397d77b8514065420b7c1e7320117f7aabfdb45ce15f0050c5b0fe75aea' },
  ...Object.entries({
    af_heart: 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
    af_bella: 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b',
    af_nicole: 'cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a',
    am_michael: '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1',
    am_fenrir: 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43',
    bf_emma: '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73',
    bm_george: 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc',
    bm_fable: 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1',
  }).map(([id, sha256]) => ({ from: `voices/${id}.bin`, to: `voices/${id}.bin`, size: 522240, sha256 })),
];
const VOICE_DIR = join(app.getPath('userData'), 'voices', 'kokoro-82m');
const VOICE_BYTES = VOICE_FILES.reduce((n, f) => n + f.size, 0);
let voiceDownload = null;   // an AbortController while downloading
let voiceProc = null;
const voiceWaiting = new Map();
let voiceSeq = 0;

const voiceInstalled = () => VOICE_FILES.every((f) => existsSync(join(VOICE_DIR, f.to)));

ipcMain.handle('voice-status', () => ({ installed: voiceInstalled(), downloading: !!voiceDownload, bytes: VOICE_BYTES }));

// downloads every file, reporting progress as { received, total }; resolves to true, or throws
ipcMain.handle('voice-install', async (e) => {
  if (!win || e.sender !== win.webContents) return false;
  if (voiceInstalled()) return true;
  if (voiceDownload) throw new Error('already downloading');
  voiceDownload = new AbortController();
  const { signal } = voiceDownload;
  const { createWriteStream } = require('node:fs');
  const { mkdir, rename, rm } = require('node:fs/promises');
  const { createHash } = require('node:crypto');
  let received = 0, lastSent = 0;
  const report = (force) => {
    const now = Date.now();
    if (force || now - lastSent > 120) { lastSent = now; if (!e.sender.isDestroyed()) e.sender.send('voice-progress', { received, total: VOICE_BYTES }); }
  };
  try {
    for (const f of VOICE_FILES) {
      const dest = join(VOICE_DIR, f.to);
      if (existsSync(dest)) { received += f.size; continue; }
      await mkdir(join(dest, '..'), { recursive: true });
      const res = await net.fetch(VOICE_REPO + f.from, { signal, headers: { 'User-Agent': `Folio/${app.getVersion()} (https://github.com/Aksharan1/folio-reader)` } });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const tmp = dest + '.part';
      const out = createWriteStream(tmp);
      const hash = createHash('sha256');
      try {
        for await (const chunk of res.body) {
          hash.update(chunk);
          if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
          received += chunk.length;
          report();
        }
      } finally {
        await new Promise((r) => out.end(r));
      }
      if (hash.digest('hex') !== f.sha256) { await rm(tmp, { force: true }); throw new Error('the download was damaged; please try again'); }
      await rename(tmp, dest);
    }
    report(true);
    return true;
  } catch (err) {
    throw new Error(signal.aborted ? 'cancelled' : err.message);
  } finally {
    voiceDownload = null;
  }
});

ipcMain.handle('voice-cancel', () => { if (voiceDownload) voiceDownload.abort(); });

ipcMain.handle('voice-remove', async () => {
  if (voiceProc) { voiceProc.kill(); voiceProc = null; }
  await require('node:fs/promises').rm(VOICE_DIR, { recursive: true, force: true });
  return true;
});

function voiceAsk(msg) {
  if (!voiceProc) {
    const { utilityProcess } = require('electron');
    voiceProc = utilityProcess.fork(join(__dirname, 'voice.js'), [], { serviceName: 'Folio voice' });
    voiceProc.on('message', (m) => {
      const w = voiceWaiting.get(m.id);
      if (!w) return;
      voiceWaiting.delete(m.id);
      if (m.ok) w.resolve(m); else w.reject(new Error(m.error));
    });
    voiceProc.on('exit', () => {
      voiceProc = null;
      for (const w of voiceWaiting.values()) w.reject(new Error('the voice stopped'));
      voiceWaiting.clear();
    });
  }
  const id = ++voiceSeq;
  return new Promise((resolve, reject) => {
    voiceWaiting.set(id, { resolve, reject });
    voiceProc.postMessage({ ...msg, id });
  });
}

// resolves to { samples (Float32Array), rate }
ipcMain.handle('voice-speak', async (e, text, voice, speed) => {
  if (!win || e.sender !== win.webContents) return null;
  if (!voiceInstalled()) throw new Error('the natural voice isn’t downloaded');
  await voiceAsk({ type: 'load', dir: VOICE_DIR });
  const { samples, rate } = await voiceAsk({ type: 'speak', text: String(text).slice(0, 4000), voice, speed });
  return { samples, rate };
});

/* The window has no native title bar: Folio's own top bar takes its place, and the system's window
   buttons sit over it (minimise, maximise and close on the right on Windows and Linux, the three
   coloured buttons on the left on macOS). The page tells us the colours under them, and the height
   of the bar, so the buttons line up with it. */
const HEX = /^#[0-9a-f]{6}$/i;
let titleColors = { color: '#0b0d14', symbolColor: '#e9ebf3' };
let titleHeight = 68; // the library's top bar, which the window opens on

// macOS places its buttons by their top-left corner; they're about 14px tall
const macButtons = (height) => ({ x: 18, y: Math.round((height - 14) / 2) });

ipcMain.on('title-bar', (e, color, symbolColor, height) => {
  if (!win || e.sender !== win.webContents || !HEX.test(color) || !HEX.test(symbolColor)) return;
  titleColors = { color, symbolColor };
  if (Number.isFinite(height) && height >= 24 && height <= 120) titleHeight = height;
  // the bar is measured in CSS pixels, which the app's zoom scales
  const px = Math.round(titleHeight * win.webContents.getZoomFactor());
  if (IS_MAC) win.setWindowButtonPosition(macButtons(px));
  else win.setTitleBarOverlay({ ...titleColors, height: px });
  win.setBackgroundColor(color);
});

app.on('second-instance', (e, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  queueFiles(bookArgs(argv));
});

/* ---------- window ---------- */

async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  // the colours are kept so the next launch opens in the right theme, without a flash
  const state = { bounds: win.getNormalBounds(), maximized: win.isMaximized(), titleColors };
  writeFile(STATE_FILE, JSON.stringify(state)).catch(() => {});
}

async function createWindow() {
  const state = await loadState();
  const saved = state.titleColors;
  if (saved && HEX.test(saved.color) && HEX.test(saved.symbolColor)) titleColors = saved;
  win = new BrowserWindow({
    ...(state.bounds || { width: 1280, height: 820 }),
    minWidth: 480,
    minHeight: 400,
    title: 'Folio',
    backgroundColor: titleColors.color,
    titleBarStyle: 'hidden',
    ...(IS_MAC ? { trafficLightPosition: macButtons(titleHeight) } : { titleBarOverlay: { ...titleColors, height: titleHeight } }),
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
  wc.on('before-input-event', (e, input) => {
    const run = input.type === 'keyDown' && !input.alt && KEYS[keyName(input)];
    if (run) { e.preventDefault(); run(); }
  });
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

/* ---------- keyboard ---------- */

/* With no title bar there's no menu bar either, and Windows only runs menu shortcuts from a menu
   bar, so the window handles its own. Keys are written as [Ctrl+][Shift+]key, and Ctrl is ⌘ on a Mac. */
const KEYS = {
  'Ctrl+O': () => win.webContents.send('add-books'),
  'Ctrl+Shift+O': () => win.webContents.send('add-folder'),
  'F11': () => win.setFullScreen(!win.isFullScreen()),
  'Ctrl+=': () => zoom(0.5),
  'Ctrl++': () => zoom(0.5),
  'Ctrl+Shift++': () => zoom(0.5),
  'Ctrl+-': () => zoom(-0.5),
  'Ctrl+0': () => win.webContents.setZoomLevel(0),
  'Ctrl+Shift+I': () => win.webContents.toggleDevTools(),
  'F12': () => win.webContents.toggleDevTools(),
};

function zoom(step) {
  const level = win.webContents.getZoomLevel() + step;
  win.webContents.setZoomLevel(Math.max(-3, Math.min(4, level)));
}

function keyName(input) {
  return (input.control || input.meta ? 'Ctrl+' : '') + (input.shift ? 'Shift+' : '') + (input.key.length === 1 ? input.key.toUpperCase() : input.key);
}

/* A Mac app keeps its menu in the menu bar, and the system's own shortcuts (copy, paste, quit,
   hide) come from it. Folio's shortcuts are shown there but still handled by the window above. */
function macMenu() {
  const send = (channel) => () => { if (win) win.webContents.send(channel); };
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'Add Books…', accelerator: 'Cmd+O', registerAccelerator: false, click: send('add-books') },
      { label: 'Add a Folder…', accelerator: 'Cmd+Shift+O', registerAccelerator: false, click: send('add-folder') },
      { type: 'separator' },
      { role: 'close' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Actual Size', accelerator: 'Cmd+0', registerAccelerator: false, click: () => win && win.webContents.setZoomLevel(0) },
      { label: 'Zoom In', accelerator: 'Cmd+=', registerAccelerator: false, click: () => win && zoom(0.5) },
      { label: 'Zoom Out', accelerator: 'Cmd+-', registerAccelerator: false, click: () => win && zoom(-0.5) },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]);
}

/* ---------- boot ---------- */

// macOS opens files (double-clicked in Finder, dropped on the Dock icon) with an event, not argv
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (BOOK_RE.test(path)) queueFiles([path]);
  if (app.isReady() && !win) createWindow();
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { host, pathname } = new URL(req.url);
    const file = normalize(join(ROOT, decodeURIComponent(pathname)));
    if (host !== 'folio' || !file.startsWith(ROOT + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(IS_MAC ? macMenu() : null);
  createWindow();
  queueFiles(bookArgs(process.argv.slice(1)));
});

// on a Mac the app stays open with no windows, and clicking its Dock icon opens one again
app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
app.on('activate', () => { if (!win) createWindow(); });
