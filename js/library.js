/* =========================================================
   Library — IndexedDB persistence for books + local prefs
   ========================================================= */

const PREFS_KEY = 'folio.prefs.v1';

function defaultPrefs() {
  return {
    uiTheme: 'midnight',   // app colours; a TONES id, set from the Settings page
    view: 'grid',          // grid | list
    sort: 'recent',        // recent | added | title | author | progress
    animate: true,         // page-turn animation
    showProgress: true,    // bottom progress bar in the reader
    autoHide: false,       // fade reader toolbars while reading
  };
}

class Library {
  constructor() {
    this.db = null;
    this.records = [];
    this.byId = new Map();
    this.settings = defaultSettings();
    this.prefs = defaultPrefs();
    this.loadPrefs();
  }

  /* ---------- prefs (localStorage) ---------- */

  loadPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (raw) {
        this.settings = Object.assign(defaultSettings(), raw.settings || {});
        this.prefs = Object.assign(defaultPrefs(), raw.prefs || {});
      }
    } catch (e) {}
    if (!TONES[this.settings.tone]) this.settings.tone = defaultSettings().tone;
    if (!TONES[this.prefs.uiTheme]) this.prefs.uiTheme = defaultPrefs().uiTheme;
  }

  savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ settings: this.settings, prefs: this.prefs })); } catch (e) {}
  }

  /* ---------- IndexedDB ---------- */

  async init() {
    this.db = await this.openDb('ereader', 1, (db) => {
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    });
    if (!this.db) return;
    this.records = (await this.getAll('books')) || [];
    this.records.forEach((r) => this.byId.set(r.id, r));
  }

  async openDb(name, version, upgrade) {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (ev) => { upgrade(ev.target.result); };
    return new Promise((res) => {
      req.onsuccess = (ev) => res(ev.target.result);
      req.onerror = () => res(null);
    });
  }

  wrap(req) {
    return new Promise((res) => {
      req.onsuccess = (ev) => res(ev.target.result);
      req.onerror = (ev) => {
        if (window.__errors) window.__errors.push('idb-error: ' + (ev.target.error && ev.target.error.message));
        res(null);
      };
    });
  }

  async getAll(store) {
    const tx = this.db.transaction([store], 'readonly');
    return this.wrap(tx.objectStore(store).getAll());
  }

  async get(store, key) {
    const tx = this.db.transaction([store], 'readonly');
    return this.wrap(tx.objectStore(store).get(key));
  }

  async put(store, value, key) {
    const tx = this.db.transaction([store], 'readwrite');
    const os = tx.objectStore(store);
    return this.wrap(store === 'books' ? os.put(value) : os.put(value, key));
  }

  async del(store, key) {
    const tx = this.db.transaction([store], 'readwrite');
    return this.wrap(tx.objectStore(store).delete(key));
  }

  dataOf(id) { return this.get('data', id); }

  saveRecord(rec) {
    this.put('books', rec, rec.id).catch(() => {});
    rec.lastSaved = Date.now();
  }

  touch(id) {
    const r = this.byId.get(id);
    if (r) { r.lastOpened = Date.now(); this.saveRecord(r); }
  }

  /* ---------- import ---------- */

  async add(file) {
    const { bytes, format } = await convertToEpub(file.name, await this.readBytes(file));
    return this.addBytes(file.name, bytes, format);
  }

  async readBytes(file) {
    try {
      return new Uint8Array(await file.arrayBuffer());
    } catch (e) {}
    try {
      const fr = new FileReader();
      const buf = await new Promise((res) => {
        fr.onload = () => res(fr.result);
        fr.onerror = () => res(null);
        fr.readAsArrayBuffer(file);
      });
      if (buf) return new Uint8Array(buf);
    } catch (e) {}
    throw new Error('the file couldn’t be read — try the Add Books button instead of dragging');
  }

  /* resolves to { rec, duplicate } */
  async addBytes(name, bytes, format = 'EPUB') {
    const ab = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
    const book = new ePub(ab);
    await book.opened;

    let title = '', author = '';
    try {
      const meta = book.packaging && book.packaging.metadata ? book.packaging.metadata : null;
      title = String(meta && meta.title ? meta.title : bookBaseName(name)).replace(/\s+/g, ' ').trim();
      author = String(meta && meta.creator ? meta.creator : '').replace(/\s+/g, ' ').trim();
    } catch (e) {}

    const dupe = this.records.find((r) => r.title === title && r.author === author && r.size === ab.byteLength);
    if (dupe) {
      try { book.destroy(); } catch (e) {}
      return { rec: dupe, duplicate: true };
    }

    let coverBlob = null;
    try {
      const url = await book.coverUrl();
      if (url) {
        const resp = await fetch(url);
        coverBlob = await resp.blob();
      }
    } catch (e) {}

    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = {
      id,
      title: title || 'Untitled',
      author,
      added: Date.now(),
      lastOpened: 0,
      pos: { spineIndex: 0, frac: 0 },
      pct: 0,
      readMs: 0,
      favourite: false,
      annotations: [],
      bookmarks: [],
      chapters: book.spine.length,
      cover: coverBlob,
      size: ab.byteLength,
      format,
    };
    await this.put('data', ab, id);
    await this.put('books', rec, id);
    this.records.push(rec);
    this.byId.set(id, rec);
    try { book.destroy(); } catch (e) {}
    return { rec, duplicate: false };
  }

  remove(id) {
    this.byId.delete(id);
    this.records = this.records.filter((r) => r.id !== id);
    this.del('books', id);
    this.del('data', id);
  }

  /* ---------- queries ---------- */

  progressOf(rec) {
    if (typeof rec.pct === 'number' && (rec.pct > 0 || rec.lastOpened)) return rec.pct;
    const pos = rec.pos || { spineIndex: 0, frac: 0 };
    const n = Math.max(1, rec.chapters || 1);
    return Math.min(100, Math.round(((pos.spineIndex + pos.frac) / n) * 100));
  }

  statusOf(rec) {
    const p = this.progressOf(rec);
    if (p >= 100) return 'finished';
    if (!rec.lastOpened && p === 0) return 'unread';
    return 'reading';
  }

  /* { query, filter: all|unread|reading|finished|favourites, author, sort } */
  query(opts) {
    const o = opts || {};
    const q = (o.query || '').trim().toLowerCase();
    let list = this.records.filter((r) => {
      if (q && !((r.title || '') + ' ' + (r.author || '')).toLowerCase().includes(q)) return false;
      if (o.author && (r.author || 'Unknown author') !== o.author) return false;
      if (o.filter === 'favourites' && !r.favourite) return false;
      if (o.filter && o.filter !== 'all' && o.filter !== 'favourites' && this.statusOf(r) !== o.filter) return false;
      return true;
    });
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');
    const sorts = {
      recent: (a, b) => (b.lastOpened || 0) - (a.lastOpened || 0) || b.added - a.added,
      added: (a, b) => b.added - a.added,
      title: byTitle,
      author: (a, b) => (a.author || '').localeCompare(b.author || '') || byTitle(a, b),
      progress: (a, b) => this.progressOf(b) - this.progressOf(a) || byTitle(a, b),
    };
    list.sort(sorts[o.sort] || sorts.recent);
    return list;
  }

  counts() {
    const c = { all: this.records.length, unread: 0, reading: 0, finished: 0, favourites: 0 };
    for (const r of this.records) {
      c[this.statusOf(r)]++;
      if (r.favourite) c.favourites++;
    }
    return c;
  }

  authors() {
    const m = new Map();
    for (const r of this.records) {
      const a = r.author || 'Unknown author';
      if (!m.has(a)) m.set(a, []);
      m.get(a).push(r);
    }
    return [...m.entries()].map(([name, books]) => ({ name, books })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* most recently opened book that isn't finished (or the last opened at all) */
  current() {
    const opened = this.records.filter((r) => r.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened);
    return opened.find((r) => this.statusOf(r) !== 'finished') || opened[0] || null;
  }
}
