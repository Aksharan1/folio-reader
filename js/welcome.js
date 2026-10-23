/* =========================================================
   Welcome — the first thing a new library shows: Folio's book
   opens, then a theme to read in, then books to bring in
   ========================================================= */

const WELCOME_FORMATS = ['EPUB', 'Kindle', 'PDF', 'CBZ', 'CBR', 'FB2', 'Word', 'Markdown', 'Text'];

/* the open book from the app icon, one page per element so each can swing open from the spine */
const BOOK_LEFT = '<svg viewBox="5 5.2 7 13.6" aria-hidden="true"><path d="M12 7.2C10.6 6 8.5 5.4 5.8 5.4c-.5 0-.8.3-.8.8v10c0 .5.3.8.8.8 2.5 0 4.5.6 6.2 1.8z"/></svg>';
const BOOK_RIGHT = '<svg viewBox="12 5.2 7 13.6" aria-hidden="true"><path d="M12 7.2c1.4-1.2 3.5-1.8 6.2-1.8.5 0 .8.3.8.8v10c0 .5-.3.8-.8.8-2.5 0-4.5.6-6.2 1.8z"/></svg>';

class Welcome {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.step = 0;
  }

  open() {
    if (this.el) return;
    const steps = [this.hello(), this.themes(), this.books()];
    this.dots = h('div.wl-dots', steps.map((_, i) => h('button.wl-dot', {
      type: 'button', 'aria-label': 'Step ' + (i + 1), onclick: () => this.go(i),
    })));
    this.el = h('div.welcome', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Folio' },
      h('div.wl-drag'),
      h('div.wl-glow.wl-glow-a'), h('div.wl-glow.wl-glow-b'),
      h('div.wl-steps', steps),
      h('div.wl-foot',
        this.dots,
        h('button.wl-skip', { type: 'button', onclick: () => this.close() }, 'Skip'),
      ),
    );
    this.steps = steps;
    document.body.appendChild(this.el);
    document.body.classList.add('welcoming');
    this.go(0);
    // the first step's button takes focus once the book has opened
    setTimeout(() => { if (this.step === 0 && this.el) this.el.querySelector('.wl-step.on .btn-primary')?.focus({ preventScroll: true, focusVisible: false }); }, 1400);
  }

  /* 1. the book opens */
  hello() {
    const book = h('div.wl-mark',
      h('div.wl-book-glow'),
      h('div.wl-book', h('div.wl-page.wl-page-left'), h('div.wl-page.wl-page-right'), h('div.wl-ribbon')),
    );
    book.querySelector('.wl-page-left').innerHTML = BOOK_LEFT;
    book.querySelector('.wl-page-right').innerHTML = BOOK_RIGHT;
    return h('section.wl-step.wl-hello',
      book,
      h('h1.wl-title.wl-rise', { style: { '--d': '0.75s' } }, 'Welcome to Folio'),
      h('p.wl-lead.wl-rise', { style: { '--d': '0.9s' } }, 'A calm place for your books, comics and manga.', h('br'), 'Everything stays on this computer.'),
      h('div.wl-actions.wl-rise', { style: { '--d': '1.05s' } },
        h('button.btn.btn-primary.btn-lg.wl-cta', { type: 'button', onclick: () => this.go(1) }, 'Get started', icon('right', 16)),
      ),
    );
  }

  /* 2. a theme, shown on a little page of its own */
  themes() {
    this.themeCards = TONE_ORDER.map((id, i) => {
      const t = TONES[id];
      const b = this.app.library.settings.brightness;
      return h('button.wl-theme', {
        type: 'button', role: 'radio', 'data-theme': id, style: { '--i': i },
        onclick: () => this.pickTheme(id),
      },
        h('span.wl-theme-page', { style: { background: t.bg(b), color: t.fg } },
          h('span.wl-theme-aa', 'Aa'),
          h('span.wl-theme-lines', [0, 1, 2, 3].map(() => h('i', { style: { background: t.fg } }))),
          h('span.wl-theme-check', icon('check', 12)),
        ),
        h('span.wl-theme-name', t.name),
      );
    });
    this.markTheme();
    return h('section.wl-step.wl-choose',
      h('h2.wl-heading.wl-rise', 'Choose your page'),
      h('p.wl-lead.wl-rise', { style: { '--d': '.08s' } }, 'The whole app follows it. Change it any time in Settings, or with Aa while reading.'),
      h('div.wl-themes', { role: 'radiogroup', 'aria-label': 'Theme' }, this.themeCards),
      h('div.wl-actions.wl-rise', { style: { '--d': '.3s' } },
        h('button.btn.btn-ghost.btn-lg', { type: 'button', onclick: () => this.go(0) }, 'Back'),
        h('button.btn.btn-primary.btn-lg.wl-cta', { type: 'button', onclick: () => this.go(2) }, 'Continue', icon('right', 16)),
      ),
    );
  }

  /* 3. books to read */
  books() {
    const a = this.app;
    return h('section.wl-step.wl-books',
      h('h2.wl-heading.wl-rise', 'Bring in your library'),
      h('p.wl-lead.wl-rise', { style: { '--d': '.08s' } }, 'Books are copied into Folio, so the originals can stay where they are.'),
      h('button.wl-drop.wl-rise', { type: 'button', style: { '--d': '.16s' }, onclick: () => a.fileInput.click() },
        h('span.wl-drop-ic', icon('upload', 30)),
        h('span.wl-drop-title', 'Drop books, comics or a whole folder here'),
        h('span.wl-drop-sub', 'or click to choose files'),
      ),
      h('div.wl-formats', WELCOME_FORMATS.map((f, i) => h('span.wl-chip', { style: { '--i': i } }, f))),
      h('div.wl-actions.wl-rise', { style: { '--d': '.4s' } },
        h('button.btn.btn-lg', { type: 'button', onclick: () => a.folderInput.click() }, icon('folder', 16), 'Add a folder'),
        h('button.btn.btn-primary.btn-lg.wl-cta', { type: 'button', onclick: () => a.fileInput.click() }, icon('plus', 16), 'Add books'),
      ),
      h('button.wl-link.wl-rise', { type: 'button', style: { '--d': '.5s' }, onclick: () => a.importSample() }, 'Or start with Frankenstein, a free classic'),
    );
  }

  go(i) {
    if (!this.el) return;
    this.step = Math.max(0, Math.min(this.steps.length - 1, i));
    this.steps.forEach((s, k) => {
      s.classList.toggle('on', k === this.step);
      s.classList.toggle('before', k < this.step);
      s.classList.toggle('after', k > this.step);
      s.inert = k !== this.step;
    });
    [...this.dots.children].forEach((d, k) => d.classList.toggle('on', k === this.step));
    this.el.dataset.step = this.step;
  }

  /* the app re-themes under a crossfade, where the browser can do one */
  pickTheme(id) {
    const apply = () => { this.app.setAppTheme(id); this.markTheme(); };
    if (document.startViewTransition && !this.app.reader.animateOff()) document.startViewTransition(apply);
    else apply();
  }

  markTheme() {
    const cur = this.app.prefs.uiTheme;
    for (const c of this.themeCards || []) {
      const on = c.dataset.theme === cur;
      c.classList.toggle('on', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  /* keys while it shows: arrows move between steps, Enter goes on, Escape skips */
  key(e) {
    const k = e.key;
    if (k === 'Escape') this.close();
    else if (k === 'ArrowRight' && this.step < this.steps.length - 1 && !e.target.closest?.('.wl-themes')) this.go(this.step + 1);
    else if (k === 'ArrowLeft' && this.step > 0 && !e.target.closest?.('.wl-themes')) this.go(this.step - 1);
    else return false;
    e.preventDefault?.();
    return true;
  }

  /* fades away, and the library settles in underneath */
  close() {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    this.app.setPref('welcomed', true);
    el.classList.add('leaving');
    document.body.classList.remove('welcoming');
    document.body.classList.add('welcomed-in');
    const done = () => { el.remove(); document.body.classList.remove('welcomed-in'); };
    if (this.app.reader.animateOff()) done();
    else setTimeout(done, 700);
  }
}
