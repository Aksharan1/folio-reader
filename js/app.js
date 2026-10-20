/* =========================================================
   App — library shell, views, reader chrome, panels, boot
   ========================================================= */

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push((e.message || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  window.__errors.push('unhandled: ' + (r && (r.message || r)) + ' stack: ' + (r && r.stack ? r.stack : ''));
});

const APP_NAME = 'Folio';
const REPO_URL = 'https://github.com/Aksharan1/folio-reader';

const NAV = [
  { id: 'library',     label: 'Library',     icon: 'library' },
  { id: 'reading',     label: 'Reading Now', icon: 'reading' },
  { id: 'favourites',  label: 'Favourites',  icon: 'heart' },
  { id: 'annotations', label: 'Annotations', icon: 'pen' },
  { id: 'authors',     label: 'Authors',     icon: 'user' },
];

const FILTERS = [
  { id: 'all',      label: 'All Books' },
  { id: 'reading',  label: 'Currently Reading' },
  { id: 'unread',   label: 'Unread' },
  { id: 'finished', label: 'Finished' },
];

const SORTS = [
  { id: 'recent',   label: 'Recently Opened' },
  { id: 'added',    label: 'Recently Added' },
  { id: 'title',    label: 'Title' },
  { id: 'author',   label: 'Author' },
  { id: 'progress', label: 'Progress' },
];

const SHORTCUTS = [
  ['Reading', [
    [['→', 'Space', 'PgDn'], 'Next page'],
    [['←', 'PgUp'], 'Previous page'],
    [['Home', 'End'], 'Beginning / end of book'],
    [['T'], 'Contents'],
    [['F', 'Ctrl F'], 'Search in book'],
    [['A'], 'Annotations'],
    [['S'], 'Appearance'],
    [['B'], 'Toggle bookmark'],
    [['R'], 'Read aloud'],
    [['H'], 'Highlight selected text'],
    [['I'], 'Book details'],
    [['+', '−'], 'Text size'],
    [['Esc'], 'Close panel'],
  ]],
  ['Library', [
    [['/', 'Ctrl F'], 'Search library'],
    [['Esc'], 'Clear search'],
  ]],
];

/* reading characters per minute when there's no personal history yet (~220 wpm) */
const DEFAULT_CPM = 1100;

const SAMPLE_TEXT = [
  'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.',
  'I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
];

class App {
  constructor() {
    this.screen = 'library';       // library | read
    this.view = 'library';         // a NAV id or 'settings'
    this.query = '';
    this.filter = 'all';
    this.author = null;
    this.annTab = 'highlights';
    this.settingsTab = 'appearance';
    this.coverCache = new Map();
    this.panel = null;             // open reader drawer: toc | search | marks
    this.lastActivity = Date.now();
    this.search = { q: '', results: [], active: -1, capped: false };
    this.speech = new ReadAloud(this);
  }

  get prefs() { return this.library.prefs; }

  /* =========================================================
     Shared UI: toast, menus, popovers, modals
     ========================================================= */

  toast(msg, ic, sticky) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = h('div.toast', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(t);
    }
    t.innerHTML = '';
    if (ic === 'spin') t.appendChild(h('span.spinner'));
    else if (ic) t.appendChild(icon(ic, 16));
    t.appendChild(h('span', msg));
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    if (!sticky) this.toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
  }

  openMenu(anchor, items, align) {
    this.closeMenu();
    const m = h('div.menu', { role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { m.appendChild(h('div.menu-sep')); continue; }
      m.appendChild(h('button.menu-item' + (it.danger ? '.danger' : '') + (it.checked ? '.checked' : ''), {
        type: 'button', role: 'menuitem',
        onclick: (e) => { e.stopPropagation(); this.closeMenu(); it.run(); },
      },
        it.icon ? icon(it.icon, 16) : h('span.ic'),
        h('span.mi-label', it.label),
        it.checked ? icon('check', 15) : null,
        it.hint ? h('kbd', it.hint) : null,
      ));
    }
    document.body.appendChild(m);
    this.place(m, anchor, align);
    this.menuEl = m;
    this.menuAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    const first = m.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  closeMenu() {
    if (!this.menuEl) return false;
    this.menuEl.remove();
    if (this.menuAnchor) this.menuAnchor.setAttribute('aria-expanded', 'false');
    this.menuEl = null;
    this.menuAnchor = null;
    return true;
  }

  /* position a floating element under its anchor, kept inside the window */
  place(el, anchor, align) {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, ht = el.offsetHeight;
    let left = align === 'left' ? r.left : r.right - w;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8) top = Math.max(8, r.top - ht - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  openModal({ title, body, actions, wide, onClose }) {
    this.closeModal();
    this.closeMenu();
    const close = () => this.closeModal();
    const foot = actions && actions.length
      ? h('div.modal-foot', actions.map((a) => h('button.btn' + (a.primary ? '.btn-primary' : '') + (a.danger ? '.btn-danger' : ''), {
          type: 'button',
          onclick: () => { if (a.run && a.run() === false) return; close(); },
        }, a.label)))
      : null;
    const modal = h('div.modal' + (wide ? '.modal-wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div.modal-head', h('h2', title), iconButton('x', 'Close', close)),
      h('div.modal-body', body),
      foot,
    );
    const back = h('div.modal-backdrop', { onmousedown: (e) => { if (e.target === back) close(); } }, modal);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('on'));
    this.modalEl = back;
    this.modalOnClose = onClose;
    const focusable = modal.querySelector('textarea, input') || modal.querySelector('.modal-foot .btn-primary') || modal.querySelector('.modal-foot .btn');
    if (focusable) focusable.focus();
    return close;
  }

  closeModal() {
    if (!this.modalEl) return false;
    this.modalEl.remove();
    this.modalEl = null;
    if (this.modalOnClose) { const f = this.modalOnClose; this.modalOnClose = null; f(); }
    return true;
  }

  confirm(title, message, okLabel) {
    return new Promise((res) => {
      let ok = false;
      this.openModal({
        title,
        body: h('p.modal-text', message),
        actions: [
          { label: 'Cancel' },
          { label: okLabel || 'Confirm', danger: true, run: () => { ok = true; } },
        ],
        onClose: () => res(ok),
      });
    });
  }

  /* =========================================================
     Covers
     ========================================================= */

  coverUrl(rec) {
    if (!rec.cover) return '';
    if (!this.coverCache.has(rec.id)) this.coverCache.set(rec.id, URL.createObjectURL(rec.cover));
    return this.coverCache.get(rec.id);
  }

  coverEl(rec) {
    const wrap = h('div.cover');
    if (rec.cover) {
      const img = h('img', { alt: '', loading: 'lazy', draggable: 'false' });
      img.addEventListener('error', () => { img.replaceWith(generatedCover(rec.title, rec.author)); });
      img.src = this.coverUrl(rec);
      wrap.appendChild(img);
    } else {
      wrap.appendChild(generatedCover(rec.title, rec.author));
    }
    return wrap;
  }

  progressBar(pct) {
    return h('div.pbar', { role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('i', { style: { width: pct + '%' } }));
  }

  timeLeft(rec) {
    const pct = this.library.progressOf(rec);
    if (pct >= 100) return 'Finished';
    if ((rec.readMs || 0) > 180000 && pct >= 2) return fmtDuration(rec.readMs * (100 - pct) / pct);
    if (rec.totalChars) return fmtDuration(((rec.totalChars * (100 - pct)) / 100 / DEFAULT_CPM) * 60000);
    return '—';
  }

  /* =========================================================
     Library shell
     ========================================================= */

  buildShell() {
    this.fileInput = h('input.hidden-file', {
      type: 'file', accept: BOOK_ACCEPT, multiple: true, tabindex: '-1', 'aria-hidden': 'true',
      onchange: () => { this.importFiles(this.fileInput.files); this.fileInput.value = ''; },
    });
    this.folderInput = h('input.hidden-file', {
      type: 'file', webkitdirectory: true, tabindex: '-1', 'aria-hidden': 'true',
      onchange: () => { this.importFiles(this.folderInput.files); this.folderInput.value = ''; },
    });
    this.restoreInput = h('input.hidden-file', {
      type: 'file', accept: '.zip', tabindex: '-1', 'aria-hidden': 'true',
      onchange: () => { const f = this.restoreInput.files[0]; this.restoreInput.value = ''; if (f) this.restoreLibrary(f); },
    });
    this.clippingsInput = h('input.hidden-file', {
      type: 'file', accept: '.txt', tabindex: '-1', 'aria-hidden': 'true',
      onchange: () => { const f = this.clippingsInput.files[0]; this.clippingsInput.value = ''; if (f) this.importClippings(f); },
    });

    this.searchInput = h('input', {
      type: 'search', placeholder: 'Search books or authors…', 'aria-label': 'Search library', spellcheck: 'false',
      oninput: () => {
        this.query = this.searchInput.value;
        if (this.view !== 'library' && this.view !== 'favourites') this.view = 'library';
        this.renderLibrary();
      },
      onkeydown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); this.searchInput.value = ''; this.query = ''; this.renderLibrary(); this.searchInput.blur(); }
      },
    });

    this.sidebar = h('aside.sidebar', { 'aria-label': 'Navigation' });
    this.topbar = h('header.topbar',
      iconButton('menu', 'Toggle navigation', () => document.body.classList.toggle('nav-open'), 'nav-toggle'),
      h('label.search-box', icon('search', 16), this.searchInput, h('kbd.search-kbd', '/')),
      h('div.topbar-actions',
        h('button.btn.btn-primary', { type: 'button', onclick: () => this.fileInput.click() }, icon('plus', 16), h('span', 'Add Books')),
        this.viewToggle = h('div.seg.view-toggle', { role: 'group', 'aria-label': 'Layout' }),
      ),
    );
    this.content = h('div.content', { tabindex: '-1' });

    this.shell = h('div.shell', this.sidebar, h('main.main', this.topbar, this.content));
    this.readScreen = h('div.screen-read');
    this.dropOverlay = h('div.drop-overlay', h('div.drop-card', icon('upload', 34), h('div.drop-title', 'Drop books or folders to add them'), h('div.drop-sub', 'EPUB, Kindle (MOBI, AZW3), PDF, FB2, Word, HTML, Markdown and text')));
    const scrim = h('div.nav-scrim', { onclick: () => document.body.classList.remove('nav-open') });
    document.body.append(this.shell, scrim, this.fileInput, this.folderInput, this.clippingsInput, this.restoreInput, this.readScreen, this.dropOverlay);
  }

  go(view) {
    this.view = view;
    if (view !== 'library') this.author = null;
    document.body.classList.remove('nav-open');
    this.renderLibrary();
    this.content.scrollTop = 0;
  }

  renderLibrary() {
    this.renderSidebar();
    this.renderViewToggle();
    const views = {
      library: () => this.viewBooks(),
      favourites: () => this.viewBooks(),
      reading: () => this.viewReadingNow(),
      annotations: () => this.viewAnnotations(),
      authors: () => this.viewAuthors(),
      settings: () => this.viewSettings(),
    };
    const scroll = this.content.scrollTop;
    this.content.innerHTML = '';
    this.content.appendChild((views[this.view] || views.library)());
    this.content.scrollTop = scroll;
  }

  renderSidebar() {
    const c = this.library.counts();
    const annCount = this.library.records.reduce((n, r) => n + (r.annotations || []).length, 0);
    const counts = { library: c.all, favourites: c.favourites, annotations: annCount, authors: this.library.authors().length };
    const item = (n) => h('button.nav-item' + (this.view === n.id ? '.on' : ''), {
      type: 'button', onclick: () => this.go(n.id), 'aria-current': this.view === n.id ? 'page' : null,
    }, icon(n.icon), h('span.nav-label', n.label), counts[n.id] ? h('span.nav-count', counts[n.id]) : null);

    this.sidebar.innerHTML = '';
    this.sidebar.appendChild(h('div.brand', logoMark(), h('span.brand-name', APP_NAME)));
    this.sidebar.appendChild(h('nav.nav', NAV.map(item)));
    this.sidebar.appendChild(h('div.nav-spacer'));

    const cur = this.library.current();
    if (cur) {
      const pct = this.library.progressOf(cur);
      this.sidebar.appendChild(h('button.mini-continue', { type: 'button', onclick: () => this.openBook(cur), title: 'Continue ' + cur.title },
        this.coverEl(cur),
        h('div.mc-meta',
          h('div.mc-label', 'Continue reading'),
          h('div.mc-title', cur.title),
          h('div.mc-bar', this.progressBar(pct), h('span', pct + '%')),
        ),
      ));
    }
    this.sidebar.appendChild(item({ id: 'settings', label: 'Settings', icon: 'settings' }));
  }

  renderViewToggle() {
    const show = this.view === 'library' || this.view === 'favourites';
    this.viewToggle.style.display = show ? '' : 'none';
    this.viewToggle.innerHTML = '';
    for (const [id, ic, label] of [['grid', 'grid', 'Grid view'], ['list', 'rows', 'List view']]) {
      this.viewToggle.appendChild(h('button' + (this.prefs.view === id ? '.on' : ''), {
        type: 'button', 'aria-label': label, title: label, 'aria-pressed': this.prefs.view === id ? 'true' : 'false',
        onclick: () => this.setPref('view', id, true),
      }, icon(ic, 17)));
    }
  }

  pageHead(title, sub, right) {
    return h('div.page-head', h('div', h('h1', title), sub ? h('p.page-sub', sub) : null), right || null);
  }

  emptyState(ic, title, text, actions) {
    return h('div.empty',
      h('div.empty-ic', icon(ic, 30)),
      h('h2', title),
      h('p', text),
      actions ? h('div.empty-actions', actions) : null,
    );
  }

  /* ---------------- Library / Favourites ---------------- */

  viewBooks() {
    const favs = this.view === 'favourites';
    const c = this.library.counts();
    const root = h('section.view');

    const sortBtn = h('button.btn.btn-ghost.sort-btn', {
      type: 'button', 'aria-haspopup': 'menu',
      onclick: () => this.openMenu(sortBtn, SORTS.map((s) => ({
        label: s.label, checked: this.prefs.sort === s.id, run: () => this.setPref('sort', s.id, true),
      }))),
    }, h('span', (SORTS.find((s) => s.id === this.prefs.sort) || SORTS[0]).label), icon('down', 15));

    const title = favs ? 'Favourites' : (this.author || 'Library');
    const sub = favs ? 'Books you’ve marked with a heart' : this.author ? 'Books by this author' : null;
    root.appendChild(this.pageHead(title, sub));

    const bar = h('div.filter-bar');
    if (!favs) {
      const chips = h('div.chips', { role: 'tablist', 'aria-label': 'Filter' });
      for (const f of FILTERS) {
        chips.appendChild(h('button.chip' + (this.filter === f.id ? '.on' : ''), {
          type: 'button', role: 'tab', 'aria-selected': this.filter === f.id ? 'true' : 'false',
          onclick: () => { this.filter = f.id; this.renderLibrary(); },
        }, f.label, h('span.chip-count', c[f.id])));
      }
      bar.appendChild(chips);
    } else {
      bar.appendChild(h('div.chips'));
    }
    if (this.author) {
      bar.firstChild.appendChild(h('button.chip.on.chip-removable', {
        type: 'button', onclick: () => { this.author = null; this.renderLibrary(); }, 'aria-label': 'Clear author filter',
      }, icon('user', 14), this.author, icon('x', 14)));
    }
    bar.appendChild(sortBtn);
    root.appendChild(bar);

    const list = this.library.query({
      query: this.query, filter: favs ? 'favourites' : this.filter, author: this.author, sort: this.prefs.sort,
    });

    if (!this.library.records.length) {
      root.appendChild(this.emptyState('library', 'Your library is empty',
        'Add EPUB, Kindle, PDF, FB2, Word or text files to start reading. Books, progress and highlights stay on this device.',
        [
          h('button.btn.btn-primary', { type: 'button', onclick: () => this.fileInput.click() }, icon('plus', 16), 'Add Books'),
          h('button.btn', { type: 'button', onclick: () => this.importSample() }, icon('reading', 16), 'Try a sample book'),
        ]));
      root.appendChild(h('p.drop-hint', 'Tip: you can also drag books anywhere onto this window.'));
      return root;
    }
    if (!list.length) {
      if (favs && !this.query) {
        root.appendChild(this.emptyState('heart', 'No favourites yet', 'Use the ⋯ menu on any book to add it to your favourites.'));
      } else {
        root.appendChild(this.emptyState('search', 'No books found',
          this.query ? `Nothing matches “${this.query}”.` : 'No books match this filter.',
          [h('button.btn', { type: 'button', onclick: () => { this.query = ''; this.searchInput.value = ''; this.filter = 'all'; this.author = null; this.renderLibrary(); } }, 'Clear filters')]));
      }
      return root;
    }

    root.appendChild(this.prefs.view === 'list' ? this.bookList(list) : this.bookGrid(list));
    return root;
  }

  bookMenu(rec, anchor) {
    this.openMenu(anchor, [
      { label: 'Open', icon: 'reading', run: () => this.openBook(rec) },
      { label: rec.favourite ? 'Remove from favourites' : 'Add to favourites', icon: 'heart', run: () => this.toggleFavourite(rec) },
      { label: 'Book details', icon: 'info', run: () => this.showDetails(rec) },
      '-',
      { label: 'Remove from library', icon: 'trash', danger: true, run: () => this.removeBook(rec) },
    ]);
  }

  toggleFavourite(rec) {
    rec.favourite = !rec.favourite;
    this.library.saveRecord(rec);
    this.toast(rec.favourite ? 'Added to favourites' : 'Removed from favourites', 'heart');
    if (this.screen === 'library') this.renderLibrary();
  }

  async removeBook(rec) {
    const ok = await this.confirm('Remove book?', `“${rec.title}” and its highlights will be deleted from this device.`, 'Remove');
    if (!ok) return;
    this.library.remove(rec.id);
    if (this.coverCache.has(rec.id)) { URL.revokeObjectURL(this.coverCache.get(rec.id)); this.coverCache.delete(rec.id); }
    this.toast('Book removed', 'trash');
    this.renderLibrary();
  }

  kebab(rec, vertical) {
    const b = h('button.icon-btn.kebab', {
      type: 'button', 'aria-label': 'More options for ' + rec.title, 'aria-haspopup': 'menu',
      onclick: (e) => { e.stopPropagation(); this.bookMenu(rec, b); },
      onkeydown: (e) => e.stopPropagation(),
    }, icon(vertical ? 'moreV' : 'more', 17));
    return b;
  }

  activate(el, fn) {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => {
      if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); }
    });
    return el;
  }

  bookGrid(list) {
    const grid = h('div.book-grid');
    for (const rec of list) {
      const pct = this.library.progressOf(rec);
      const status = this.library.statusOf(rec);
      const cover = this.coverEl(rec);
      if (rec.favourite) cover.appendChild(h('span.badge.badge-fav', { title: 'Favourite' }, icon('heart', 13)));
      if (status === 'finished') cover.appendChild(h('span.badge.badge-done', { title: 'Finished' }, icon('check', 13)));
      if (status === 'unread') cover.appendChild(h('span.badge-new', 'New'));
      const card = h('article.book', { tabindex: '0', 'aria-label': rec.title + (rec.author ? ' by ' + rec.author : '') },
        cover,
        h('div.book-meta',
          h('div.book-title-row', h('h3.book-title', { title: rec.title }, rec.title), this.kebab(rec, true)),
          h('div.book-author', rec.author || 'Unknown author'),
          h('div.book-progress', this.progressBar(pct), h('span', pct + '%')),
        ),
      );
      grid.appendChild(this.activate(card, () => this.openBook(rec)));
    }
    return grid;
  }

  bookList(list) {
    const wrap = h('div.book-list', { role: 'table' },
      h('div.bl-row.bl-head', { role: 'row' },
        h('span', 'Title'), h('span', 'Progress'), h('span.bl-hide', 'Last opened'), h('span.bl-hide', 'Added'), h('span.bl-hide', 'Size'), h('span')));
    for (const rec of list) {
      const pct = this.library.progressOf(rec);
      const row = h('div.bl-row', { role: 'row', tabindex: '0' },
        h('div.bl-title', this.coverEl(rec), h('div', h('div.bl-t', rec.title, rec.favourite ? icon('heart', 13) : null), h('div.bl-a', rec.author || 'Unknown author'))),
        h('div.bl-prog', this.progressBar(pct), h('span', pct + '%')),
        h('span.bl-dim.bl-hide', fmtAgo(rec.lastOpened)),
        h('span.bl-dim.bl-hide', fmtAgo(rec.added)),
        h('span.bl-dim.bl-hide', fmtSize(rec.size)),
        this.kebab(rec),
      );
      wrap.appendChild(this.activate(row, () => this.openBook(rec)));
    }
    return wrap;
  }

  /* ---------------- Reading Now ---------------- */

  viewReadingNow() {
    const root = h('section.view');
    root.appendChild(this.pageHead('Reading Now', 'Pick up where you left off'));
    const cur = this.library.current();
    if (!cur) {
      root.appendChild(this.emptyState('reading', 'Nothing in progress',
        this.library.records.length ? 'Open any book from your library and it will appear here.' : 'Add a book to your library to get started.',
        [h('button.btn.btn-primary', { type: 'button', onclick: () => this.library.records.length ? this.go('library') : this.fileInput.click() },
          this.library.records.length ? 'Browse library' : 'Add Books')]));
      return root;
    }

    const pct = this.library.progressOf(cur);
    const hero = h('div.card.hero',
      h('div.hero-top',
        this.coverEl(cur),
        h('div.hero-meta',
          h('div.eyebrow', cur.chapterLabel || (pct ? 'In progress' : 'Not started')),
          h('h2.hero-title', cur.title),
          h('div.hero-author', cur.author || 'Unknown author'),
          h('div.hero-progress', this.progressBar(pct), h('span', pct + '%')),
          h('div.hero-actions',
            h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => this.openBook(cur) }, icon('reading', 17), pct ? 'Continue Reading' : 'Start Reading'),
            iconButton('info', 'Book details', () => this.showDetails(cur), 'icon-btn-outline'),
          ),
        ),
      ),
      h('div.stats',
        this.stat(pct + '%', 'Complete', 'reading'),
        this.stat(fmtDuration(cur.readMs || 0), 'Time spent', 'clock'),
        this.stat(this.timeLeft(cur), 'Time left', 'hourglass'),
      ),
    );

    const recent = (cur.annotations || []).slice().sort((a, b) => b.time - a.time).slice(0, 4);
    const hl = h('div.card',
      h('div.card-head', h('h3', 'Recent highlights'), recent.length ? h('button.link', { type: 'button', onclick: () => this.go('annotations') }, 'View all') : null),
      recent.length
        ? h('div.ann-list', recent.map((a) => this.annCard(cur, a, { compact: true })))
        : h('p.muted', 'Select text while reading to highlight it or add a note.'),
    );

    const others = this.library.records
      .filter((r) => r !== cur && this.library.statusOf(r) === 'reading')
      .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
    const unread = this.library.query({ filter: 'unread', sort: 'added' }).slice(0, 6);
    const side = h('div.card',
      h('div.card-head', h('h3', others.length ? 'Also reading' : 'Up next')),
      h('div.up-list', (others.length ? others : unread).slice(0, 6).map((r) => {
        const p = this.library.progressOf(r);
        return this.activate(h('div.up-item', { tabindex: '0' },
          this.coverEl(r),
          h('div.up-meta',
            h('div.up-title', r.title),
            h('div.up-author', r.author || 'Unknown author'),
            h('div.up-prog', this.progressBar(p), h('span', r.lastOpened ? fmtAgo(r.lastOpened) : 'New')),
          ),
        ), () => this.openBook(r));
      })),
      (others.length ? others : unread).length ? null : h('p.muted', 'No other books yet.'),
    );

    root.appendChild(h('div.rn-grid', h('div.rn-main', hero, hl), side));
    return root;
  }

  stat(value, label, ic) {
    return h('div.stat', h('div.stat-ic', icon(ic, 16)), h('div', h('div.stat-v', value), h('div.stat-l', label)));
  }

  /* ---------------- Annotations ---------------- */

  annGroups(rec) {
    const anns = rec.annotations || [];
    return {
      highlights: anns.slice().sort((a, b) => b.time - a.time),
      notes: anns.filter((a) => a.note).sort((a, b) => b.time - a.time),
      bookmarks: (rec.bookmarks || []).slice().sort((a, b) => (a.spineIndex - b.spineIndex) || ((a.frac || 0) - (b.frac || 0))),
    };
  }

  annTabs(counts, onPick) {
    const tabs = h('div.tabs', { role: 'tablist' });
    for (const [id, label] of [['highlights', 'Highlights'], ['notes', 'Notes'], ['bookmarks', 'Bookmarks']]) {
      tabs.appendChild(h('button.tab' + (this.annTab === id ? '.on' : ''), {
        type: 'button', role: 'tab', 'aria-selected': this.annTab === id ? 'true' : 'false',
        onclick: () => { this.annTab = id; onPick(); },
      }, label, h('span.tab-count', counts[id])));
    }
    return tabs;
  }

  viewAnnotations() {
    const root = h('section.view');
    const anyNotes = this.library.records.some((r) => (r.annotations || []).length);
    root.appendChild(this.pageHead('Annotations', 'Highlights, notes and bookmarks across your books',
      anyNotes ? h('button.btn', { type: 'button', title: 'Save every highlight and note as a Markdown file', onclick: () => this.exportNotes(this.library.records, 'Folio highlights.md') }, icon('download', 16), 'Export') : null));
    const totals = { highlights: 0, notes: 0, bookmarks: 0 };
    const per = [];
    for (const rec of this.library.records) {
      const g = this.annGroups(rec);
      for (const k in totals) totals[k] += g[k].length;
      if (g[this.annTab].length) per.push([rec, g[this.annTab]]);
    }
    per.sort((a, b) => (b[0].lastOpened || 0) - (a[0].lastOpened || 0));
    root.appendChild(this.annTabs(totals, () => this.renderLibrary()));

    if (!per.length) {
      const msg = {
        highlights: 'Select text while reading and pick a colour to highlight it.',
        notes: 'Select text while reading and choose “Note” to write a thought next to it.',
        bookmarks: 'Press B or tap the bookmark icon while reading to save your place.',
      }[this.annTab];
      root.appendChild(this.emptyState(this.annTab === 'bookmarks' ? 'bookmark' : 'pen', 'Nothing here yet', msg));
      return root;
    }
    for (const [rec, items] of per) {
      root.appendChild(h('div.ann-book',
        h('div.ann-book-head', this.coverEl(rec), h('div', h('div.ann-book-title', rec.title), h('div.ann-book-author', rec.author || 'Unknown author')), h('span.ann-book-count', items.length)),
        h('div.ann-list', items.map((a) => this.annTab === 'bookmarks' ? this.bookmarkCard(rec, a) : this.annCard(rec, a))),
      ));
    }
    return root;
  }

  /* one highlight / note; works both in the library and inside the reader */
  annCard(rec, a, opts) {
    const o = opts || {};
    const col = (HL_COLORS[a.color] || HL_COLORS.yellow).solid;
    const where = [a.chapter || (this.reader.record === rec && this.reader.book ? this.reader.chapterName(a.spineIndex) : null), a.pct ? a.pct + '%' : null, fmtAgo(a.time)].filter(Boolean).join(' · ');
    const more = h('button.icon-btn.kebab', {
      type: 'button', 'aria-label': 'Annotation options', 'aria-haspopup': 'menu',
      onclick: (e) => {
        e.stopPropagation();
        this.openMenu(more, [
          { label: 'Go to passage', icon: 'reading', run: () => this.jumpToAnnotation(rec, a) },
          { label: a.note ? 'Edit note' : 'Add note', icon: 'note', run: () => this.editNote(rec, a) },
          { label: 'Copy text', icon: 'copy', run: () => this.copy(a.quote) },
          '-',
          ...HL_ORDER.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), icon: null, checked: (a.color || 'yellow') === c, run: () => this.recolor(rec, a, c) })),
          '-',
          { label: 'Delete', icon: 'trash', danger: true, run: () => this.deleteAnnotation(rec, a) },
        ]);
        this.menuEl.querySelectorAll('.menu-item').forEach((btn) => {
          const lab = btn.querySelector('.mi-label').textContent.toLowerCase();
          if (HL_COLORS[lab]) btn.querySelector('.ic').replaceWith(h('span.swatch-dot', { style: { background: HL_COLORS[lab].solid } }));
        });
      },
    }, icon('more', 17));
    const card = h('div.ann' + (o.compact ? '.ann-compact' : ''), { tabindex: '0', style: { '--hl': col } },
      h('div.ann-body',
        h('blockquote.ann-quote', a.quote),
        a.note ? h('div.ann-note', icon('note', 14), h('span', a.note)) : null,
        h('div.ann-where', where),
      ),
      more,
    );
    return this.activate(card, () => this.jumpToAnnotation(rec, a));
  }

  bookmarkCard(rec, b) {
    const more = iconButton('trash', 'Delete bookmark', (e) => {
      e.stopPropagation();
      rec.bookmarks = (rec.bookmarks || []).filter((x) => x !== b);
      this.library.saveRecord(rec);
      this.toast('Bookmark removed', 'bookmark');
      this.refreshAnnotationsUI();
    }, 'kebab');
    const card = h('div.ann.ann-bm', { tabindex: '0' },
      h('div.bm-ic', icon('bookmark', 16)),
      h('div.ann-body',
        h('div.bm-label', b.label || 'Bookmark'),
        h('div.ann-where', [b.pct !== undefined ? b.pct + '%' : null, fmtAgo(b.time)].filter(Boolean).join(' · ')),
      ),
      more,
    );
    return this.activate(card, () => {
      if (this.screen === 'read' && this.reader.record === rec) {
        this.reader.renderSection(b.spineIndex, b.frac || 0).then(() => this.refreshProgress());
      } else {
        this.openBook(rec, { spineIndex: b.spineIndex, frac: b.frac || 0 });
      }
    });
  }

  jumpToAnnotation(rec, a) {
    if (this.screen === 'read' && this.reader.record === rec) {
      this.reader.renderSection(a.spineIndex, null, a.quote).then(() => this.refreshProgress());
    } else {
      this.openBook(rec, { spineIndex: a.spineIndex, query: a.quote });
    }
  }

  editNote(rec, a) {
    const ta = h('textarea.note-input', { rows: 5, placeholder: 'Write a note…' });
    ta.value = a.note || '';
    this.openModal({
      title: a.note ? 'Edit note' : 'Add note',
      body: h('div', h('blockquote.note-quote', { style: { '--hl': (HL_COLORS[a.color] || HL_COLORS.yellow).solid } }, a.quote), ta),
      actions: [
        { label: 'Cancel' },
        { label: 'Save note', primary: true, run: () => {
          a.note = ta.value.trim();
          a.type = a.note ? 'note' : 'highlight';
          this.library.saveRecord(rec);
          this.toast(a.note ? 'Note saved' : 'Note removed', 'note');
          this.refreshAnnotationsUI();
        } },
      ],
    });
  }

  recolor(rec, a, color) {
    a.color = color;
    this.library.saveRecord(rec);
    if (this.screen === 'read' && this.reader.record === rec) this.reader.rerender();
    this.refreshAnnotationsUI();
  }

  deleteAnnotation(rec, a) {
    rec.annotations = (rec.annotations || []).filter((x) => x !== a);
    this.library.saveRecord(rec);
    if (this.screen === 'read' && this.reader.record === rec) this.reader.rerender();
    this.toast('Highlight deleted', 'trash');
    this.refreshAnnotationsUI();
  }

  refreshAnnotationsUI() {
    if (this.screen === 'read') { if (this.panel === 'marks') this.openMarks(); }
    else this.renderLibrary();
  }

  /* highlights and notes as Markdown: a heading per book, then per chapter, in reading order */
  notesMarkdown(recs) {
    const out = [];
    for (const rec of recs) {
      const anns = (rec.annotations || []).filter((a) => a.quote)
        .sort((a, b) => (a.spineIndex - b.spineIndex) || ((a.pct || 0) - (b.pct || 0)) || (a.time - b.time));
      if (!anns.length) continue;
      out.push('# ' + rec.title, '');
      if (rec.author) out.push('*' + rec.author + '*', '');
      let chapter = null;
      for (const a of anns) {
        if ((a.chapter || '') !== chapter) {
          chapter = a.chapter || '';
          if (chapter) out.push('## ' + chapter, '');
        }
        out.push('> ' + a.quote, '');
        if (a.note) out.push(a.note.replace(/\n{2,}/g, '\n'), '');
      }
    }
    return out.join('\n');
  }

  async exportNotes(recs, fileName) {
    const md = this.notesMarkdown(recs);
    if (!md) { this.toast('No highlights to export yet', 'info'); return; }
    try {
      const saved = await window.folioDesktop.saveFile(fileName.replace(/[\\/:*?"<>|]+/g, ''), md);
      if (saved) this.toast('Saved ' + saved.split(/[\\/]/).pop(), 'check');
    } catch (e) {
      this.toast('Couldn’t save the file', 'info');
    }
  }

  copy(text) {
    const done = () => this.toast('Copied to clipboard', 'copy');
    try {
      navigator.clipboard.writeText(text).then(done, () => this.toast('Copy failed'));
    } catch (e) { this.toast('Copy failed'); }
  }

  /* ---------------- Authors ---------------- */

  viewAuthors() {
    const root = h('section.view');
    const authors = this.library.authors();
    root.appendChild(this.pageHead('Authors', authors.length ? authors.length + (authors.length === 1 ? ' author' : ' authors') + ' in your library' : null));
    if (!authors.length) {
      root.appendChild(this.emptyState('user', 'No authors yet', 'Authors appear here as you add books.'));
      return root;
    }
    const grid = h('div.author-grid');
    for (const a of authors) {
      const hue = hashStr(a.name) % 360;
      const card = h('div.author', { tabindex: '0' },
        h('div.avatar', { style: { background: `linear-gradient(140deg, hsl(${hue} 55% 46%), hsl(${(hue + 40) % 360} 55% 30%))` } }, initials(a.name)),
        h('div.author-meta', h('div.author-name', a.name), h('div.author-count', a.books.length + (a.books.length === 1 ? ' book' : ' books'))),
        h('div.author-covers', a.books.slice(0, 3).map((r) => this.coverEl(r))),
      );
      grid.appendChild(this.activate(card, () => { this.view = 'library'; this.filter = 'all'; this.author = a.name; this.renderLibrary(); }));
    }
    root.appendChild(grid);
    return root;
  }

  /* ---------------- Settings ---------------- */

  viewSettings() {
    const root = h('section.view');
    root.appendChild(this.pageHead('Settings', 'Applies to every book'));
    const tabs = h('div.tabs', { role: 'tablist' });
    for (const [id, label] of [['appearance', 'Appearance'], ['reading', 'Reading'], ['shortcuts', 'Shortcuts'], ['data', 'Library & Data']]) {
      tabs.appendChild(h('button.tab' + (this.settingsTab === id ? '.on' : ''), {
        type: 'button', role: 'tab', 'aria-selected': this.settingsTab === id ? 'true' : 'false',
        onclick: () => { this.settingsTab = id; this.renderLibrary(); },
      }, label));
    }
    root.appendChild(tabs);

    if (this.settingsTab === 'appearance') {
      root.appendChild(h('div.settings-grid',
        h('div.card.settings-card', this.appearanceControls(true)),
        h('div.preview-wrap', h('div.eyebrow', 'Preview'), this.previewEl()),
      ));
    } else if (this.settingsTab === 'reading') {
      root.appendChild(h('div.card.settings-card.narrow',
        this.toggleRow('Two pages on wide windows', 'Show two pages side by side, like an open book, when the window is wide enough.', 'twoPages'),
        this.toggleRow('Page-turn animation', 'Pages swing over like paper when you turn them.', 'animate'),
        this.toggleRow('Show reading progress', 'Progress bar and page count under the page.', 'showProgress'),
        this.toggleRow('Auto-hide toolbars', 'Fade the reader toolbars while you read. Tap the middle of the page to bring them back.', 'autoHide'),
        this.voiceRow(),
        this.setting('Read-aloud speed', this.seg(SPEECH_RATES, this.prefs.ttsRate || 1, (v) => this.setPref('ttsRate', v, true), 'Read-aloud speed')),
      ));
    } else if (this.settingsTab === 'shortcuts') {
      root.appendChild(this.shortcutsEl());
    } else {
      root.appendChild(this.dataPanel());
    }
    return root;
  }

  setting(label, control, hint) {
    return h('div.set-row', h('div.set-label', label, hint ? h('div.set-hint', hint) : null), h('div.set-control', control));
  }

  seg(options, current, onPick, label) {
    const g = h('div.seg', { role: 'radiogroup', 'aria-label': label });
    for (const o of options) {
      g.appendChild(h('button' + (o.id === current ? '.on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': o.id === current ? 'true' : 'false', title: o.name, 'aria-label': o.name,
        onclick: () => onPick(o.id),
      }, o.icon ? o.icon : o.name));
    }
    return g;
  }

  lineIcon(v) {
    const gap = 3 + (v - 1.42) * 4;
    const span = h('span.ic');
    const y0 = 12 - gap * 1.5 - 1;
    span.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${[0, 1, 2, 3].map((k) => `<path d="M4 ${(y0 + k * gap).toFixed(1)}h16"/>`).join('')}</svg>`;
    return span;
  }

  marginIcon(m) {
    const inset = [3, 6, 9][m.id];
    const span = h('span.ic');
    span.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="3.5" width="19" height="17" rx="2" opacity=".45"/>${[8, 12, 16].map((y) => `<path d="M${2.5 + inset} ${y}h${19 - inset * 2}"/>`).join('')}</svg>`;
    return span;
  }

  /* shared by the Settings page and the in-reader Appearance popover */
  appearanceControls(full) {
    const s = this.library.settings;
    const out = h('div.appearance');

    /* on the Settings page the theme restyles the whole app; in the reader's Aa panel it
       only changes the page */
    const current = full ? this.prefs.uiTheme : s.tone;
    const themes = h('div.themes', { role: 'radiogroup', 'aria-label': 'Theme' });
    for (const id of TONE_ORDER) {
      const t = TONES[id];
      themes.appendChild(h('button.theme' + (current === id ? '.on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': current === id ? 'true' : 'false', title: t.name,
        onclick: () => full ? this.setAppTheme(id) : this.setReading({ tone: id }),
      }, h('span.theme-swatch', { style: { background: t.bg(s.brightness), color: t.fg } }, 'Aa', current === id ? h('span.theme-check', icon('check', 11)) : null), full ? h('span.theme-name', t.name) : null));
    }
    out.appendChild(full
      ? this.setting('Theme', themes, 'Changes the whole app and the reading page. While reading, use Aa to change just the page.')
      : this.setting('Page theme', themes));

    const bright = h('input.range', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Brightness' });
    bright.value = Math.round(s.brightness * 100);
    bright.addEventListener('input', () => this.applyBrightness(bright.value / 100));
    bright.addEventListener('change', () => this.setReading({ brightness: bright.value / 100 }));
    out.appendChild(this.setting('Brightness', bright));

    const font = h('select.select', { 'aria-label': 'Font', onchange: () => this.setReading({ font: font.value }) },
      FONTS.map((f) => h('option', { value: f.id }, f.name)));
    font.value = s.font;
    out.appendChild(this.setting('Font', font));

    const size = h('div.stepper',
      iconButton('minus', 'Smaller text', () => this.setReading({ fontSize: Math.max(70, s.fontSize - 10) })),
      h('span.stepper-v', s.fontSize + '%'),
      iconButton('plus', 'Larger text', () => this.setReading({ fontSize: Math.min(160, s.fontSize + 10) })),
    );
    out.appendChild(this.setting('Text size', size));

    out.appendChild(this.setting('Line spacing', this.seg(LINE_SPACINGS.map((l) => ({ id: l.id, name: l.name, icon: this.lineIcon(l.v) })), s.lines, (v) => this.setReading({ lines: v }), 'Line spacing')));
    out.appendChild(this.setting('Margins', this.seg(MARGINS.map((m) => ({ id: m.id, name: m.name, icon: this.marginIcon(m) })), s.margin, (v) => this.setReading({ margin: v }), 'Margins')));
    const alignIcons = { original: 'alignO', left: 'alignL', block: 'alignJ', center: 'alignC' };
    out.appendChild(this.setting('Alignment', this.seg(ALIGNS.map((a) => ({ id: a.id, name: a.name, icon: icon(alignIcons[a.id]) })), s.align, (v) => this.setReading({ align: v }), 'Alignment')));
    return out;
  }

  previewEl() {
    const s = this.library.settings;
    const t = TONES[s.tone];
    const f = FONTS.find((x) => x.id === s.font);
    const m = MARGINS[s.margin];
    const al = ALIGNS.find((a) => a.id === s.align);
    return h('div.preview', {
      style: {
        background: t.bg(s.brightness), color: t.fg,
        fontFamily: f && f.css ? f.css : 'Georgia, serif',
        fontSize: (17 * s.fontSize / 100) + 'px',
        lineHeight: LINE_SPACINGS[s.lines].v,
        textAlign: al && al.css ? al.css : 'left',
        padding: `32px ${Math.round(m.side / 2.2)}px`,
      },
    },
      h('div.pv-chapter', 'Letter 1'),
      h('div.pv-title', 'To Mrs. Saville, England'),
      SAMPLE_TEXT.map((p) => h('p', p)),
    );
  }

  toggleRow(label, hint, key) {
    const on = !!this.prefs[key];
    const sw = h('button.switch' + (on ? '.on' : ''), {
      type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label,
      onclick: () => this.setPref(key, !this.prefs[key], true),
    }, h('i'));
    return this.setting(label, sw, hint);
  }

  voiceRow() {
    const voices = ReadAloud.voices(() => { if (this.screen === 'library' && this.view === 'settings' && this.settingsTab === 'reading') this.renderLibrary(); });
    const sel = h('select.select', { 'aria-label': 'Read-aloud voice', onchange: () => this.setPref('ttsVoice', sel.value) },
      h('option', { value: '' }, 'Match the book’s language'),
      voices.map((v) => h('option', { value: v.name }, v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '').replace(/ Desktop$/, '') + ' · ' + v.lang)));
    sel.value = this.prefs.ttsVoice || '';
    return this.setting('Read-aloud voice', sel, 'Press R while reading to listen. Folio uses the voices installed in Windows; add more under Settings › Time & language › Speech.');
  }

  shortcutsEl() {
    return h('div.shortcut-grid', SHORTCUTS.map(([group, rows]) => h('div.card',
      h('div.card-head', h('h3', group)),
      h('div.kb-list', rows.map(([keys, label]) => h('div.kb-row', h('span', label), h('span.kb-keys', keys.map((k) => h('kbd', k)))))),
    )));
  }

  dataPanel() {
    const usage = h('span.muted', 'Calculating…');
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => { usage.textContent = fmtSize(e.usage || 0) + ' used on this device'; }).catch(() => { usage.textContent = 'Unavailable'; });
    } else usage.textContent = 'Unavailable';
    const total = this.library.records.reduce((n, r) => n + (r.size || 0), 0);
    const about = h('span', 'Free and open source under the MIT licence.');
    window.folioDesktop.appInfo().then((i) => { about.textContent = 'Version ' + i.version + ' · free and open source under the MIT licence.'; }).catch(() => {});
    return h('div.card.settings-card.narrow',
      this.setting('Books', h('span', this.library.records.length + ' · ' + fmtSize(total))),
      this.setting('Storage', usage, 'Everything is stored on this computer. Nothing is uploaded.'),
      this.setting('Add a folder', h('button.btn', { type: 'button', onclick: () => this.folderInput.click() }, icon('plus', 16), 'Choose folder…'), 'Adds every book in a folder and its subfolders. You can also drag a folder onto the window.'),
      this.setting('Kindle highlights', h('button.btn', { type: 'button', onclick: () => this.clippingsInput.click() }, icon('upload', 16), 'Import clippings…'), 'Pick “My Clippings.txt” from your Kindle’s documents folder. Highlights and notes are added to the matching books in your library.'),
      this.setting('Back up library', h('button.btn', { type: 'button', disabled: !this.library.records.length, onclick: () => this.backupLibrary() }, icon('download', 16), 'Back up…'), 'Saves every book with its progress, highlights and bookmarks in one .zip file.'),
      this.setting('Restore a backup', h('button.btn', { type: 'button', onclick: () => this.restoreInput.click() }, icon('upload', 16), 'Restore…'), 'Adds the books from a backup. Books you already have gain any highlights and bookmarks they’re missing.'),
      this.setting('Sample book', h('button.btn', { type: 'button', onclick: () => this.importSample() }, icon('reading', 16), 'Add Frankenstein'), 'A public-domain classic to try the reader with.'),
      this.setting('Reset appearance', h('button.btn', { type: 'button', onclick: () => { this.prefs.uiTheme = defaultPrefs().uiTheme; this.applyAppTheme(); this.setReading(defaultSettings()); this.toast('Appearance reset', 'check'); } }, 'Reset'), 'Restore the default theme, font and spacing.'),
      this.setting('Remove all books', h('button.btn.btn-danger', {
        type: 'button', disabled: !this.library.records.length,
        onclick: async () => {
          const ok = await this.confirm('Remove all books?', 'Every book, highlight and bookmark will be deleted from this device. This can’t be undone.', 'Remove all');
          if (!ok) return;
          for (const r of this.library.records.slice()) this.library.remove(r.id);
          this.toast('Library cleared', 'trash');
          this.renderLibrary();
        },
      }, icon('trash', 16), 'Remove all'), 'Deletes your whole library from this computer.'),
      this.setting('About Folio', h('button.btn', { type: 'button', onclick: () => window.open(REPO_URL) }, 'View on GitHub'), about),
    );
  }

  async backupLibrary() {
    this.toast('Preparing backup…', 'spin', true);
    try {
      const bytes = await this.library.backup();
      const saved = await window.folioDesktop.saveFile('Folio backup ' + new Date().toISOString().slice(0, 10) + '.zip', bytes);
      this.toast(saved ? 'Saved ' + saved.split(/[\\/]/).pop() : 'Backup cancelled', saved ? 'check' : 'info');
    } catch (e) {
      console.error('backup failed: ' + (e && e.message ? e.message : e));
      this.toast('Couldn’t make the backup', 'info');
    }
  }

  async restoreLibrary(file) {
    this.toast('Restoring backup…', 'spin', true);
    try {
      const { added, updated } = await this.library.restore(await this.library.readBytes(file));
      const parts = [];
      if (added) parts.push('Added ' + added + (added === 1 ? ' book' : ' books'));
      if (updated) parts.push(updated + (updated === 1 ? ' book was' : ' books were') + ' already here');
      this.toast(parts.join(' · ') || 'The backup is empty', 'check');
    } catch (e) {
      if (!(e && e.friendly)) console.error('restore failed: ' + (e && e.message ? e.message : e));
      this.toast(e && e.friendly ? e.message : 'Couldn’t restore that backup', 'info');
    }
    this.renderLibrary();
  }

  setReading(patch) {
    this.library.settings = Object.assign({}, this.library.settings, patch);
    this.library.savePrefs();
    this.reader.settings = Object.assign({}, this.library.settings);
    this.applyBrightness();
    if (this.screen === 'read' && this.reader.book) {
      this.applyTone();
      if (this.popoverEl) this.fillAppearance();
      this.reader.rerender().then(() => this.refreshProgress());
    } else {
      this.renderLibrary();
    }
  }

  /* app colours and the reading page together */
  setAppTheme(id) {
    this.prefs.uiTheme = id;
    this.applyAppTheme();
    this.setReading({ tone: id });
  }

  applyAppTheme() {
    const id = this.prefs.uiTheme;
    if (id === 'midnight') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
    this.applyBrightness();
  }

  /* brightness moves the app's surfaces as far as it moves the page */
  applyBrightness(b = this.library.settings.brightness) {
    const t = TONES[this.prefs.uiTheme] || TONES.midnight;
    document.documentElement.style.setProperty('--lift', t.lift(b).toFixed(2));
  }

  setPref(key, value, rerender) {
    this.prefs[key] = value;
    this.library.savePrefs();
    if (this.screen === 'read') this.applyReaderPrefs();
    else if (rerender) this.renderLibrary();
  }

  /* ---------------- Import ---------------- */

  async importFiles(fileList) {
    const all = Array.from(fileList || []);
    /* a Kindle's My Clippings.txt holds highlights, not a book; it's read after any books it came with */
    const clippings = all.filter((f) => isClippingsFile(f.name));
    if (clippings.length) {
      const books = all.filter((f) => !clippings.includes(f));
      const latest = books.length ? await this.importFiles(books) : null;
      for (const f of clippings) await this.importClippings(f);
      return latest;
    }
    const files = all.filter((f) => bookFormat(f.name) || f.type === 'application/epub+zip');
    if (!files.length) {
      if (all.length) this.toast('That file type isn’t supported', 'info');
      return;
    }
    let added = 0, dupes = 0, failed = 0, last = null, latest = null, reason = '';
    for (let i = 0; i < files.length; i++) {
      this.toast(files.length > 1 ? `Importing ${i + 1} of ${files.length}…` : 'Importing ' + bookBaseName(files[i].name) + '…', 'spin', true);
      try {
        const res = await this.library.add(files[i]);
        latest = res.rec;
        if (res.duplicate) dupes++; else { added++; last = res.rec; }
      } catch (e) {
        failed++;
        if (e && e.friendly) reason = e.message;
        else console.error('import failed: ' + (e && e.message ? e.message : e));
      }
    }
    const parts = [];
    if (added === 1 && last) parts.push(`Added “${last.title}”`);
    else if (added) parts.push(`Added ${added} books`);
    if (dupes) parts.push(dupes + ' already in library');
    if (failed) parts.push(failed === 1 && reason ? reason : failed + ' couldn’t be read');
    this.toast(parts.join(' · ') || 'Nothing imported', failed && !added ? 'info' : 'check');
    if (added && this.view !== 'library' && this.view !== 'favourites') this.view = 'library';
    this.renderLibrary();
    return latest;
  }

  // Desktop app: books opened from Explorer. A single book opens straight into the reader.
  async openExternal(list) {
    const files = list.map((f) => new File([f.data], f.name));
    const rec = await this.importFiles(files);
    if (rec && files.length === 1) this.openBook(rec);
  }

  async importClippings(file) {
    this.toast('Adding Kindle highlights…', 'spin', true);
    try {
      const res = await importKindleClippings(this.library, await file.text());
      const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
      const parts = [res.added ? 'Added ' + n(res.added, 'highlight', 'highlights') : 'No new highlights'];
      if (res.notes) parts.push(n(res.notes, 'note', 'notes'));
      if (res.unmatched.length) parts.push(n(res.unmatched.length, 'book isn’t', 'books aren’t') + ' in your library');
      this.toast(parts.join(' · '), res.added ? 'pen' : 'info');
    } catch (e) {
      console.error('clippings import failed: ' + (e && e.message ? e.message : e));
      this.toast('Couldn’t read that clippings file', 'info');
    }
    this.renderLibrary();
  }

  async importSample() {
    this.toast('Adding sample book…', 'spin', true);
    try {
      const resp = await fetch('samples/frankenstein.epub');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const res = await this.library.addBytes('frankenstein.epub', new Uint8Array(await resp.arrayBuffer()));
      this.toast(res.duplicate ? 'Frankenstein is already in your library' : 'Added “' + res.rec.title + '”', 'check');
      this.view = 'library';
      this.renderLibrary();
    } catch (e) {
      this.toast('Couldn’t load the sample book', 'info');
    }
  }

  /* ---------------- Details ---------------- */

  showDetails(rec) {
    const isOpen = this.screen === 'read' && this.reader.record === rec && this.reader.book;
    const pct = this.library.progressOf(rec);
    const rows = [
      ['Progress', pct + '%'],
      ['Location', isOpen ? this.reader.chapterName(this.reader.spineIndex) : (rec.chapterLabel || '—')],
      ['Time spent', fmtDuration(rec.readMs || 0)],
      ['Time left', this.timeLeft(rec)],
      ['Highlights', String((rec.annotations || []).length)],
      ['Bookmarks', String((rec.bookmarks || []).length)],
      ['Sections', String(rec.chapters || '—')],
      ['Added', fmtAgo(rec.added)],
      ['Last opened', fmtAgo(rec.lastOpened)],
      ['Format', rec.format && rec.format !== 'EPUB' ? rec.format + ' (converted to EPUB)' : 'EPUB'],
      ['File size', fmtSize(rec.size)],
    ];
    this.openModal({
      title: 'Book details',
      wide: true,
      body: h('div.details',
        this.coverEl(rec),
        h('div.details-main',
          h('h3.details-title', rec.title),
          h('div.details-author', rec.author || 'Unknown author'),
          h('div.details-prog', this.progressBar(pct), h('span', pct + '%')),
          h('dl.details-dl', rows.map(([k, v]) => [h('dt', k), h('dd', v)])),
        ),
      ),
      actions: [
        { label: rec.favourite ? 'Remove favourite' : 'Add to favourites', run: () => this.toggleFavourite(rec) },
        isOpen ? null : { label: 'Remove', danger: true, run: () => { setTimeout(() => this.removeBook(rec), 0); } },
        { label: isOpen ? 'Close' : 'Open book', primary: true, run: () => { if (!isOpen) this.openBook(rec); } },
      ].filter(Boolean),
    });
  }

  /* =========================================================
     Reader screen
     ========================================================= */

  async openBook(rec, jump) {
    this.closeMenu();
    this.closeModal();
    this.screen = 'read';
    this.panel = null;
    document.body.classList.remove('nav-open');
    document.body.classList.add('reading');
    this.buildReader(rec);
    this.applyTone();
    this.applyReaderPrefs();
    try {
      await this.reader.open(rec, this.library.settings);
      if (jump) await this.reader.renderSection(jump.spineIndex, jump.frac === undefined ? null : jump.frac, jump.query);
    } catch (e) {
      console.error('open failed: ' + (e && e.message ? e.message : e));
      this.toast('Couldn’t open this book', 'info');
      this.closeBook();
      return;
    }
    if (this.screen !== 'read' || this.reader.record !== rec) return;
    this.readScreen.classList.remove('loading');
    this.library.touch(rec.id);
    this.refreshProgress();
    this.lastActivity = Date.now();
    this.tickAt = Date.now();
  }

  closeBook() {
    const rec = this.reader.record;
    if (rec) {
      this.tickReading();
      this.library.saveRecord(rec);
    }
    this.speech.stop();
    this.hidePop();
    this.hideSelBar();
    this.closePopover();
    this.closeMenu();
    this.closeModal();
    this.screen = 'library';
    this.panel = null;
    document.body.classList.remove('reading');
    this.readScreen.className = 'screen-read';
    this.readScreen.innerHTML = '';
    this.reader.frame = null;
    this.reader.frame2 = null;
    this.reader.renderedSection = null;
    this.renderLibrary();
  }

  buildReader(rec) {
    const R = this.readScreen;
    R.innerHTML = '';
    R.className = 'screen-read active loading';

    this.bmBtn = iconButton('bookmark', 'Bookmark this page (B)', () => this.toggleBookmark(), 'rd-bm');
    this.aaBtn = h('button.icon-btn.aa-btn', { type: 'button', 'aria-label': 'Appearance (S)', title: 'Appearance (S)', 'aria-haspopup': 'dialog', onclick: () => this.togglePopover() }, 'Aa');
    this.ttsBtn = ReadAloud.supported() ? iconButton('speaker', 'Read aloud (R)', () => this.speech.toggle(), 'rd-tts') : null;
    const moreBtn = h('button.icon-btn', {
      type: 'button', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu',
      onclick: () => this.openMenu(moreBtn, [
        { label: 'Book details', icon: 'info', hint: 'I', run: () => this.showDetails(this.reader.record) },
        { label: this.reader.record.favourite ? 'Remove from favourites' : 'Add to favourites', icon: 'heart', run: () => this.toggleFavourite(this.reader.record) },
        '-',
        { label: 'Export highlights', icon: 'download', run: () => this.exportNotes([this.reader.record], this.reader.record.title + ' - highlights.md') },
        '-',
        { label: 'Go to beginning', icon: 'first', hint: 'Home', run: () => this.reader.goBeginning().then(() => this.refreshProgress()) },
        { label: 'Go to end', icon: 'last', hint: 'End', run: () => this.reader.goEnd().then(() => this.refreshProgress()) },
        '-',
        { label: 'Keyboard shortcuts', icon: 'keyboard', run: () => this.openModal({ title: 'Keyboard shortcuts', wide: true, body: this.shortcutsEl() }) },
      ]),
    }, icon('more', 18));

    this.rdChapter = h('div.rd-chapter');
    this.rdTop = h('header.rd-top',
      h('div.rd-left',
        iconButton('back', 'Back to library', () => this.closeBook()),
        h('div.rd-title', h('span.rd-book', rec.title), rec.author ? h('span.rd-author', rec.author) : null),
      ),
      this.rdChapter,
      h('div.rd-right',
        iconButton('toc', 'Contents (T)', () => this.toggleDrawer('toc'), 'rd-panel'),
        iconButton('search', 'Search in book (F)', () => this.toggleDrawer('search'), 'rd-panel'),
        iconButton('pen', 'Annotations (A)', () => this.toggleDrawer('marks'), 'rd-panel'),
        h('span.rd-sep'),
        this.aaBtn,
        this.ttsBtn,
        this.bmBtn,
        moreBtn,
      ),
    );

    this.scrub = h('input.scrub', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Reading position' });
    this.scrub.addEventListener('input', () => { this.rdPct.textContent = Math.round(this.scrub.value / 10) + '%'; this.paintScrub(); });
    this.scrub.addEventListener('change', () => {
      this.reader.seekPercent(this.scrub.value / 10).then(() => this.refreshProgress());
    });
    this.rdPage = h('span.rd-page');
    this.rdPct = h('span.rd-pct');
    this.rdBottom = h('footer.rd-bottom', this.rdPage, h('div.scrub-wrap', this.scrub), this.rdPct);

    const stage = h('div.read-stage');
    this.rdLoading = h('div.rd-loading', h('span.spinner.spinner-lg'), h('div', 'Opening ' + rec.title + '…'));

    R.append(
      this.rdTop,
      stage,
      this.rdLoading,
      h('button.rd-nav.rd-prev', { type: 'button', 'aria-label': 'Previous page', onclick: () => this.turn(-1) }, icon('left', 22)),
      h('button.rd-nav.rd-next', { type: 'button', 'aria-label': 'Next page', onclick: () => this.turn(1) }, icon('right', 22)),
      this.rdBottom,
    );
  }

  /* chrome colours follow the page theme */
  applyTone() {
    const s = this.library.settings;
    const t = TONES[s.tone] || TONES.midnight;
    this.readScreen.style.setProperty('--rd-bg', t.bg(s.brightness));
    this.readScreen.style.setProperty('--rd-fg', t.fg);
    this.readScreen.classList.toggle('tone-light', !!t.light);
    this.readScreen.dataset.tone = TONES[s.tone] ? s.tone : 'midnight';
  }

  applyReaderPrefs() {
    this.readScreen.classList.toggle('no-progress', !this.prefs.showProgress);
    this.readScreen.classList.toggle('auto-hide', !!this.prefs.autoHide);
    this.showChrome();
  }

  showChrome() {
    this.readScreen.classList.remove('chrome-hidden');
    clearTimeout(this.chromeTimer);
    if (this.prefs.autoHide && this.screen === 'read') {
      this.chromeTimer = setTimeout(() => {
        if (!this.popoverEl && !this.panel && !this.menuEl) this.readScreen.classList.add('chrome-hidden');
      }, 2600);
    }
  }

  refreshProgress() {
    if (this.screen !== 'read' || !this.reader.book || !this.reader.doc()) return;
    const m = this.reader.metrics();
    const rec = this.reader.record;
    rec.chapterLabel = m.chapter;
    this.rdChapter.textContent = m.chapter || '';
    this.rdPage.textContent = m.lastPage > m.page ? 'Pages ' + m.page + '–' + m.lastPage + ' of ' + m.pages : 'Page ' + m.page + ' of ' + m.pages;
    this.rdPct.textContent = m.pct + '%';
    if (document.activeElement !== this.scrub) this.scrub.value = Math.round(m.pct * 10);
    this.paintScrub();
    const bm = !!this.reader.bookmarkHere();
    this.bmBtn.classList.toggle('on', bm);
    this.bmBtn.setAttribute('aria-pressed', bm ? 'true' : 'false');
    if (this.panel === 'toc') this.markToc();
  }

  paintScrub() {
    this.scrub.style.setProperty('--fill', (this.scrub.value / 10) + '%');
  }

  seekBy(dir) {
    const go = dir > 0 ? this.reader.goEnd() : this.reader.goBeginning();
    go.then(() => this.refreshProgress());
  }

  /* one page per press, however it was requested (key, click, wheel, button) */
  turn(dir) {
    if (this.navLock || !this.reader.book) return;
    this.navLock = true;
    this.hideSelBar();
    this.hidePop();
    setTimeout(() => { this.navLock = false; }, 260);
    const go = dir > 0 ? this.reader.nextPage() : this.reader.prevPage();
    go.then(() => { this.refreshProgress(); this.speech.restart(); });
    this.lastActivity = Date.now();
  }

  setSpeaking(on) {
    if (this.ttsBtn) {
      this.ttsBtn.classList.toggle('on', on);
      this.ttsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (on) this.toast('Reading aloud · press R to stop', 'speaker');
  }

  /* ---------------- Links, footnotes and look-ups ---------------- */

  /* links in the book: web links open in the browser, footnotes pop up, other links jump */
  followLink(d, frame) {
    this.hidePop();
    const target = this.reader.resolveLink(d.href);
    if (!target) {
      if (/^(https?|mailto):/i.test(d.href || '')) window.open(d.href);
      return;
    }
    const note = this.reader.noteText(target, d);
    if (!note) { this.goToLink(target); return; }
    this.showPop({ frame, rect: d.rect },
      h('div.pop-body.pop-note', note),
      h('button.pop-link', { type: 'button', onclick: () => { this.hidePop(); this.goToLink(target); } }, 'Go to note'));
  }

  goToLink(target) {
    this.reader.renderSection(target.spineIndex, null, null, null, target.anchor).then(() => { this.refreshProgress(); this.speech.restart(); });
  }

  /* definition of the selected word or phrase, from Wiktionary (or Wikipedia) */
  async lookUp() {
    const text = this.reader.lastSelection.replace(/\s+/g, ' ').trim();
    const at = this.selAnchor;
    this.hideSelBar();
    if (!text || !at) return;
    const title = h('div.pop-title', text.slice(0, 60));
    const body = h('div.pop-body', h('div.pop-status', h('span.spinner'), 'Looking up…'));
    const pop = this.showPop(at, title, body);
    const meta = this.reader.book && this.reader.book.packaging && this.reader.book.packaging.metadata;
    let found;
    try {
      found = await lookUpWord(text, String((meta && meta.language) || 'en').slice(0, 2).toLowerCase());
    } catch (e) {
      found = { error: 'Couldn’t reach Wiktionary. Looking up words needs an internet connection.' };
    }
    if (this.popEl !== pop) return;
    body.innerHTML = '';
    if (!found || found.error) {
      body.appendChild(h('p.pop-status', found ? found.error : 'No definition found for “' + text.slice(0, 40) + '”.'));
    } else {
      title.textContent = found.title;
      if (found.senses) body.append(...found.senses.map((s) => h('div.pop-sense', s.pos ? h('div.pop-pos', s.pos) : null, h('ol', s.defs.map((d) => h('li', d))))));
      else body.appendChild(h('p', found.text));
      if (found.url) pop.appendChild(h('button.pop-link', { type: 'button', onclick: () => window.open(found.url) }, 'More on ' + found.source));
    }
    this.placePop();
  }

  /* a small card next to a link or selection on the page */
  showPop(at, ...content) {
    this.hidePop();
    this.popEl = h('div.pop-card', { role: 'dialog' }, content);
    this.popAt = at;
    this.readScreen.appendChild(this.popEl);
    this.placePop();
    return this.popEl;
  }

  placePop() {
    const pop = this.popEl, at = this.popAt;
    if (!pop || !at || !at.frame) return;
    const fr = at.frame.getBoundingClientRect();
    const r = at.rect || { x: fr.width / 2, y: 80, w: 0, h: 0 };
    const w = pop.offsetWidth, ht = pop.offsetHeight;
    let top = fr.top + r.y + r.h + 10;
    if (top + ht > window.innerHeight - 12) top = Math.max(12, fr.top + r.y - ht - 10);
    pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, fr.left + r.x + r.w / 2 - w / 2)) + 'px';
    pop.style.top = top + 'px';
  }

  hidePop() {
    if (!this.popEl) return false;
    this.popEl.remove();
    this.popEl = null;
    return true;
  }

  toggleBookmark() {
    if (!this.reader.book) return;
    const on = this.reader.toggleBookmark();
    this.toast(on ? 'Bookmark added' : 'Bookmark removed', 'bookmark');
    this.refreshProgress();
    if (this.panel === 'marks') this.openMarks();
  }

  /* ---------------- Appearance popover ---------------- */

  togglePopover() {
    if (this.popoverEl) { this.closePopover(); return; }
    this.closeMenu();
    this.popoverEl = h('div.popover', { role: 'dialog', 'aria-label': 'Appearance' });
    this.readScreen.appendChild(this.popoverEl);
    this.fillAppearance();
    this.aaBtn.classList.add('on');
    this.place(this.popoverEl, this.aaBtn);
  }

  fillAppearance() {
    this.popoverEl.innerHTML = '';
    this.popoverEl.appendChild(h('div.popover-head', h('h3', 'Appearance'), iconButton('x', 'Close', () => this.closePopover())));
    this.popoverEl.appendChild(this.appearanceControls(false));
  }

  closePopover() {
    if (!this.popoverEl) return false;
    this.popoverEl.remove();
    this.popoverEl = null;
    if (this.aaBtn) this.aaBtn.classList.remove('on');
    this.showChrome();
    return true;
  }

  /* ---------------- Drawers: contents / search / annotations ---------------- */

  toggleDrawer(which) {
    if (this.panel === which) { this.closeDrawer(); return; }
    if (which === 'toc') this.openToc();
    else if (which === 'search') this.openSearch();
    else this.openMarks();
  }

  drawer(which, title, side) {
    this.closePopover();
    let d = this.readScreen.querySelector('.drawer');
    const fresh = !d || this.panel !== which;
    if (d && fresh) d.remove();
    if (fresh) {
      d = h('aside.drawer' + (side === 'left' ? '.drawer-left' : ''), { role: 'dialog', 'aria-label': title });
      this.readScreen.appendChild(d);
      requestAnimationFrame(() => d.classList.add('open'));
    }
    d.innerHTML = '';
    d.appendChild(h('div.drawer-head', h('h3', title), iconButton('x', 'Close', () => this.closeDrawer())));
    this.panel = which;
    this.readScreen.querySelectorAll('.rd-panel').forEach((b) => b.classList.remove('on'));
    const btnIdx = { toc: 0, search: 1, marks: 2 }[which];
    const btn = this.readScreen.querySelectorAll('.rd-panel')[btnIdx];
    if (btn) btn.classList.add('on');
    return d;
  }

  closeDrawer() {
    const d = this.readScreen.querySelector('.drawer');
    if (!d) { this.panel = null; return false; }
    d.classList.remove('open');
    setTimeout(() => d.remove(), 220);
    this.panel = null;
    this.readScreen.querySelectorAll('.rd-panel').forEach((b) => b.classList.remove('on'));
    this.showChrome();
    return true;
  }

  openToc() {
    const d = this.drawer('toc', 'Contents', 'left');
    const rec = this.reader.record;
    d.appendChild(h('div.toc-book', this.coverEl(rec), h('div', h('div.toc-title', rec.title), h('div.toc-author', rec.author || ''))));
    const ol = h('ol.toc-list');
    this.reader.toc.forEach((t) => {
      ol.appendChild(h('li', h('button.toc-item', {
        type: 'button', style: { paddingLeft: (14 + t.depth * 16) + 'px' }, 'data-spine': t.spineIndex,
        onclick: () => this.reader.renderSection(t.spineIndex, 0).then(() => this.refreshProgress()),
      }, t.label)));
    });
    if (!this.reader.toc.length) ol.appendChild(h('li.muted', 'This book has no table of contents.'));
    d.appendChild(h('div.drawer-body', ol));
    this.markToc(true);
  }

  markToc(scroll) {
    const items = [...this.readScreen.querySelectorAll('.toc-item')];
    let cur = null;
    for (const it of items) if (Number(it.dataset.spine) <= this.reader.spineIndex) cur = it;
    items.forEach((it) => it.classList.toggle('on', it === cur));
    if (cur && scroll) cur.scrollIntoView({ block: 'center' });
  }

  openSearch() {
    const d = this.drawer('search', 'Search in book');
    const s = this.search;
    if (s.book !== this.reader.record.id) Object.assign(s, { q: '', results: [], active: -1, capped: false, book: this.reader.record.id });
    const status = h('div.search-status');
    const results = h('div.drawer-body.search-results');
    const input = h('input', { type: 'search', placeholder: 'Find in this book…', 'aria-label': 'Search in book', spellcheck: 'false' });
    input.value = s.q;
    const clear = iconButton('x', 'Clear search', () => { input.value = ''; run(); input.focus(); }, 'search-clear');

    const paint = () => {
      results.innerHTML = '';
      clear.style.visibility = s.q ? 'visible' : 'hidden';
      if (!s.q) { status.textContent = 'Type at least 2 characters'; return; }
      status.textContent = s.results.length
        ? (s.capped ? 'First ' : '') + s.results.length + (s.results.length === 1 ? ' result' : ' results')
        : 'No results for “' + s.q + '”';
      s.results.forEach((r, i) => {
        results.appendChild(h('button.result' + (i === s.active ? '.on' : ''), {
          type: 'button',
          onclick: () => {
            s.active = i;
            results.querySelectorAll('.result').forEach((el, k) => el.classList.toggle('on', k === i));
            this.reader.renderSection(r.spineIndex, null, s.q, r.nth).then(() => this.refreshProgress());
          },
        },
          h('div.result-where', h('span', r.chapter), h('span', r.pct + '%')),
          h('div.result-text', r.before, h('mark', r.match), r.after),
        ));
      });
    };

    let timer = null, seq = 0;
    const run = () => {
      clearTimeout(timer);
      const q = input.value.trim();
      timer = setTimeout(async () => {
        const my = ++seq;
        if (q.length < 2) { Object.assign(s, { q: '', results: [], active: -1, capped: false }); paint(); return; }
        status.textContent = 'Searching…';
        const res = await this.reader.search(q);
        if (my !== seq || this.panel !== 'search') return;
        Object.assign(s, { q, results: res.results, capped: res.capped, active: -1 });
        paint();
      }, 220);
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const els = results.querySelectorAll('.result');
        if (els.length) { const nxt = els[(s.active + 1) % els.length]; nxt.click(); nxt.scrollIntoView({ block: 'nearest' }); }
      }
    });

    d.appendChild(h('div.drawer-search', h('label.search-box', icon('search', 16), input, clear), status));
    d.appendChild(results);
    paint();
    setTimeout(() => input.focus(), 30);
  }

  openMarks() {
    const d = this.drawer('marks', 'Annotations');
    const rec = this.reader.record;
    const g = this.annGroups(rec);
    d.appendChild(h('div.drawer-tabs', this.annTabs({ highlights: g.highlights.length, notes: g.notes.length, bookmarks: g.bookmarks.length }, () => this.openMarks())));
    const items = g[this.annTab];
    const body = h('div.drawer-body');
    if (!items.length) {
      body.appendChild(h('div.drawer-empty', icon(this.annTab === 'bookmarks' ? 'bookmark' : 'pen', 22), h('p', {
        highlights: 'Select text on the page, then pick a colour to highlight it.',
        notes: 'Select text and choose “Note” to add your thoughts.',
        bookmarks: 'Press B or use the bookmark button to save this page.',
      }[this.annTab])));
    } else {
      body.appendChild(h('div.ann-list', items.map((a) => this.annTab === 'bookmarks' ? this.bookmarkCard(rec, a) : this.annCard(rec, a, { compact: true }))));
    }
    d.appendChild(body);
  }

  /* ---------------- Selection toolbar ---------------- */

  showSelBar(msg, frame = this.reader.frame) {
    this.reader.lastSelection = msg.text;
    if (!frame) return;
    this.hideSelBar();
    this.hidePop();
    this.selAnchor = { frame, rect: msg.rect };
    const words = msg.text.trim().split(/\s+/).length;
    const bar = h('div.sel-bar', { role: 'toolbar', 'aria-label': 'Selection' },
      HL_ORDER.map((c) => h('button.sel-color', {
        type: 'button', 'aria-label': 'Highlight ' + c, title: 'Highlight ' + c, style: { '--c': HL_COLORS[c].solid },
        onclick: () => { this.reader.addHighlight(c); this.hideSelBar(); this.toast('Highlight saved', 'pen'); if (this.panel === 'marks') this.openMarks(); },
      })),
      h('span.sel-sep'),
      words <= 4 ? h('button.sel-btn', { type: 'button', title: 'Definition from Wiktionary (online)', onclick: () => this.lookUp() }, icon('book', 15), 'Look up') : null,
      h('button.sel-btn', { type: 'button', onclick: () => this.noteFromSelection() }, icon('note', 15), 'Note'),
      h('button.sel-btn', { type: 'button', onclick: () => { this.copy(this.reader.lastSelection); this.hideSelBar(); } }, icon('copy', 15), 'Copy'),
    );
    this.readScreen.appendChild(bar);
    const fr = frame.getBoundingClientRect();
    const r = msg.rect || { x: fr.width / 2, y: 80, w: 0, h: 0 };
    const cx = fr.left + r.x + r.w / 2;
    let top = fr.top + r.y - bar.offsetHeight - 10;
    if (top < fr.top + 4) top = fr.top + r.y + r.h + 10;
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, cx - bar.offsetWidth / 2)) + 'px';
    bar.style.top = Math.max(8, top) + 'px';
    this.selBar = bar;
  }

  hideSelBar() {
    if (this.selBar) { this.selBar.remove(); this.selBar = null; return true; }
    return false;
  }

  noteFromSelection() {
    const quote = this.reader.lastSelection;
    this.hideSelBar();
    if (!quote) return;
    let color = 'yellow';
    const ta = h('textarea.note-input', { rows: 5, placeholder: 'What did this make you think?' });
    const qEl = h('blockquote.note-quote', { style: { '--hl': HL_COLORS[color].solid } }, quote.replace(/\s+/g, ' ').trim());
    const dots = h('div.note-colors', HL_ORDER.map((c) => h('button.sel-color' + (c === color ? '.on' : ''), {
      type: 'button', 'aria-label': c, style: { '--c': HL_COLORS[c].solid },
      onclick: (e) => { color = c; qEl.style.setProperty('--hl', HL_COLORS[c].solid); dots.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); },
    })));
    this.openModal({
      title: 'Add note',
      body: h('div', qEl, ta, dots),
      actions: [
        { label: 'Cancel' },
        { label: 'Save note', primary: true, run: () => {
          this.reader.lastSelection = quote;
          this.reader.addHighlight(color, ta.value.trim());
          this.toast(ta.value.trim() ? 'Note saved' : 'Highlight saved', 'note');
          if (this.panel === 'marks') this.openMarks();
        } },
      ],
    });
  }

  /* ---------------- Reading time ---------------- */

  tickReading() {
    const now = Date.now();
    const rec = this.reader.record;
    if (this.screen === 'read' && rec && this.tickAt && !document.hidden && now - this.lastActivity < 120000) {
      rec.readMs = (rec.readMs || 0) + Math.min(now - this.tickAt, 30000);
      this.library.saveRecord(rec);
    }
    this.tickAt = now;
  }

  /* =========================================================
     Input
     ========================================================= */

  key(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const t = e.target;
    const typing = !e.fromFrame && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    this.lastActivity = Date.now();

    if (k === 'Escape') {
      if (this.closeMenu() || this.closeModal()) return;
      if (this.screen === 'read' && (this.hidePop() || this.hideSelBar() || this.closePopover() || this.closeDrawer() || this.speech.stop())) return;
      return;
    }
    if (this.modalEl) return;

    if (this.screen === 'library') {
      if ((ctrl && (k === 'f' || k === 'F')) || (k === '/' && !typing)) {
        e.preventDefault();
        this.searchInput.focus();
        this.searchInput.select();
        return;
      }
      if (!typing && !ctrl && !e.altKey && k.length === 1 && k !== ' ' && (this.view === 'library' || this.view === 'favourites') && !this.menuEl) {
        this.searchInput.focus();
      }
      return;
    }

    if (this.screen !== 'read' || !this.reader.book) return;
    if (ctrl && (k === 'f' || k === 'F')) { e.preventDefault(); this.openSearch(); return; }
    if (typing || ctrl || e.altKey) return;
    if (this.menuEl) return;

    const act = {
      ArrowRight: () => this.turn(1), ArrowDown: () => this.turn(1), ' ': () => this.turn(1), PageDown: () => this.turn(1),
      ArrowLeft: () => this.turn(-1), ArrowUp: () => this.turn(-1), PageUp: () => this.turn(-1),
      Home: () => this.seekBy(-1), End: () => this.seekBy(1),
      t: () => this.toggleDrawer('toc'),
      f: () => this.toggleDrawer('search'),
      a: () => this.toggleDrawer('marks'), m: () => this.toggleDrawer('marks'),
      s: () => this.togglePopover(),
      b: () => this.toggleBookmark(),
      r: () => this.speech.toggle(),
      i: () => this.showDetails(this.reader.record),
      h: () => {
        if (this.reader.lastSelection) { this.reader.addHighlight('yellow'); this.hideSelBar(); this.toast('Highlight saved', 'pen'); if (this.panel === 'marks') this.openMarks(); }
      },
      '+': () => this.bumpSize(10), '=': () => this.bumpSize(10), '-': () => this.bumpSize(-10),
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act) {
      if (e.preventDefault) e.preventDefault();
      act();
    }
  }

  bumpSize(d) {
    const v = Math.max(70, Math.min(160, this.library.settings.fontSize + d));
    if (v === this.library.settings.fontSize) return;
    this.setReading({ fontSize: v });
    this.toast('Text size ' + v + '%', 'sparkle');
  }

  pointerDown(e) {
    const t = e.target;
    if (this.menuEl && !this.menuEl.contains(t) && !(this.menuAnchor && this.menuAnchor.contains(t))) this.closeMenu();
    if (this.popoverEl && !this.popoverEl.contains(t) && !this.aaBtn.contains(t)) this.closePopover();
    if (this.selBar && !this.selBar.contains(t)) this.hideSelBar();
    if (this.popEl && !this.popEl.contains(t)) this.hidePop();
  }

  frameMessage(ev) {
    const frame = this.reader.pages().find((f) => ev.source === f.contentWindow);
    if (!frame) return;
    let d;
    try { d = JSON.parse(ev.data); } catch (err) { return; }
    if (!d) return;
    this.lastActivity = Date.now();
    if (d.t === 'sel') { this.closeMenu(); this.closePopover(); this.showSelBar(d, frame); }
    else if (d.t === 'selclear') { this.reader.lastSelection = ''; this.hideSelBar(); this.hidePop(); this.closeMenu(); this.closePopover(); }
    else if (d.t === 'link') this.followLink(d, frame);
    else if (d.t === 'key') this.key({ key: d.key, ctrlKey: !!d.ctrl, metaKey: false, fromFrame: true });
    else if (d.t === 'turn') this.turn(Number(d.dir));
    else if (d.t === 'tap') {
      if (this.panel) this.closeDrawer();
      else if (this.prefs.autoHide) {
        if (this.readScreen.classList.contains('chrome-hidden')) this.showChrome();
        else { clearTimeout(this.chromeTimer); this.readScreen.classList.add('chrome-hidden'); }
      }
    }
  }

  wireDrop() {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e) || this.screen !== 'library') return;
      depth++;
      this.dropOverlay.classList.add('on');
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) this.dropOverlay.classList.remove('on');
    });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      this.dropOverlay.classList.remove('on');
      if (this.screen === 'library') droppedFiles(e.dataTransfer).then((files) => this.importFiles(files));
    });
  }

  /* ---------------- Boot ---------------- */

  async boot() {
    this.applyAppTheme();
    this.buildShell();
    await this.library.init();
    this.reader.settings = Object.assign({}, this.library.settings);
    this.renderLibrary();

    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('mousedown', (e) => this.pointerDown(e));
    window.addEventListener('mousemove', () => {
      this.lastActivity = Date.now();
      if (this.screen === 'read' && this.prefs.autoHide) this.showChrome();
    });
    window.addEventListener('message', (ev) => this.frameMessage(ev));
    window.addEventListener('resize', () => {
      this.closeMenu();
      this.hideSelBar();
      this.hidePop();
      if (this.popoverEl) this.place(this.popoverEl, this.aaBtn);
      if (this.screen !== 'read' || !this.reader.book) return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.reader.rerender().then(() => this.refreshProgress()), 250);
    });
    document.addEventListener('visibilitychange', () => this.tickReading());
    setInterval(() => this.tickReading(), 15000);
    this.wireDrop();

    window.folioDesktop.onAddBooks(() => this.fileInput.click());
    window.folioDesktop.onAddFolder(() => this.folderInput.click());
    window.folioDesktop.onOpenFiles((files) => this.openExternal(files));
  }
}

/* files dropped on the window, with dropped folders opened up (subfolders included) */
async function droppedFiles(dt) {
  // entries have to be taken before the drop event returns
  const entries = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entries.some((en) => en.isDirectory)) return [...dt.files];
  const out = [];
  const walk = async (en) => {
    if (en.isFile) {
      if (bookFormat(en.name) || isClippingsFile(en.name)) out.push(await new Promise((res, rej) => en.file(res, rej)));
      return;
    }
    const rd = en.createReader();
    for (let batch; (batch = await new Promise((res, rej) => rd.readEntries(res, rej))).length;) {
      for (const child of batch) await walk(child);
    }
  };
  for (const en of entries) {
    try { await walk(en); } catch (e) {}
  }
  return out;
}

const library = new Library();
const reader = new Reader();
const app = new App();
app.library = library;
app.reader = reader;
reader.library = library;
window.app = app;
window.library = library;
window.reader = reader;
app.boot();
