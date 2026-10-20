/* =========================================================
   Read aloud — speaks the book with the voices installed in Windows,
   following along page by page
   ========================================================= */

const SPEECH_RATES = [
  { id: 0.85, name: 'Slow' },
  { id: 1,    name: 'Normal' },
  { id: 1.2,  name: 'Fast' },
  { id: 1.45, name: 'Faster' },
];

/* elements that hold a run of text; only the innermost ones are read */
const SPEAK_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,pre,figcaption,td,div';

/* long paragraphs are spoken a few sentences at a time, so stopping is instant */
function speechParts(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 400) return t ? [t] : [];
  const out = [];
  let cur = '';
  for (const s of t.match(/[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g) || [t]) {
    if (cur && cur.length + s.length > 400) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

class ReadAloud {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.run = 0;            // bumped on every start/stop, so an old loop knows to quit
    this.cache = new WeakMap();
  }

  get reader() { return this.app.reader; }

  static supported() { return typeof speechSynthesis !== 'undefined'; }

  /* Windows only lists its voices once speech has been used, so wake it with a silent utterance */
  static voices(onChange) {
    if (!ReadAloud.supported()) return [];
    const list = speechSynthesis.getVoices();
    if (onChange) speechSynthesis.addEventListener('voiceschanged', onChange, { once: true });
    if (!list.length && !ReadAloud.woken) {
      ReadAloud.woken = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    return list;
  }

  /* innermost text blocks of a page's document, in reading order */
  blocks(doc) {
    if (!doc || !doc.body) return [];
    if (!this.cache.has(doc)) {
      this.cache.set(doc, [...doc.body.querySelectorAll(SPEAK_BLOCKS)].filter((el) => !el.querySelector(SPEAK_BLOCKS) && el.textContent.trim()));
    }
    return this.cache.get(doc);
  }

  toggle() { if (this.on) this.stop(); else this.start(); }

  start() {
    if (!ReadAloud.supported() || !this.reader.book) return;
    this.on = true;
    this.app.setSpeaking(true);
    this.play(++this.run);
  }

  stop() {
    if (!this.on) return false;
    this.on = false;
    this.run++;
    speechSynthesis.cancel();
    this.mark(-1);
    this.app.setSpeaking(false);
    return true;
  }

  /* carry on from whatever page is on screen now (after a page turn or a jump) */
  restart() {
    if (!this.on) return;
    this.run++;
    speechSynthesis.cancel();
    this.mark(-1);
    this.play(this.run);
  }

  /* first block that reaches onto the page on screen */
  firstVisible() {
    const i = this.blocks(this.reader.doc()).findIndex((el) => el.getBoundingClientRect().bottom > 2);
    return Math.max(0, i);
  }

  async play(run) {
    const live = () => this.on && run === this.run;
    const r = this.reader;
    let i = this.firstVisible();
    let doc = r.doc();
    for (;;) {
      for (; live(); i++) {
        /* the page was rebuilt (new settings) or moved by the reader: pick up from what's showing */
        if (r.doc() !== doc) { doc = r.doc(); i = this.firstVisible(); }
        const list = this.blocks(doc);
        if (i >= list.length) break;
        await this.follow(list[i]);
        if (!live()) return;
        this.mark(i);
        for (const part of speechParts(list[i].textContent)) {
          const err = await this.say(part);
          if (!live()) return;
          if (err) {
            this.stop();
            this.app.toast('Read aloud stopped: ' + err, 'info');
            return;
          }
        }
      }
      if (!live()) return;
      if (r.spineIndex + 1 >= r.book.spine.length) {
        this.stop();
        this.app.toast('Finished reading aloud', 'check');
        return;
      }
      this.mark(-1);
      await r.renderSection(r.spineIndex + 1, 0);
      this.app.refreshProgress();
      doc = r.doc();
      i = 0;
    }
  }

  /* turn pages until the block about to be read is on screen */
  async follow(el) {
    const r = this.reader;
    for (let n = 0; n < 50; n++) {
      const doc = r.doc();
      if (!doc || el.ownerDocument !== doc) return;
      const tops = r.pageTops();
      const next = r.pageIndex().pi + (r.frame2 ? 2 : 1);
      if (next >= tops.length || el.getBoundingClientRect().top + doc.scrollingElement.scrollTop + 4 < tops[next]) return;
      await r.nextPage();
      this.app.refreshProgress();
    }
  }

  /* tint the block being read, on both pages of a spread */
  mark(i) {
    for (const f of this.reader.pages()) {
      const doc = f.contentDocument;
      if (!doc || !doc.body) continue;
      doc.querySelectorAll('.er-speaking').forEach((el) => el.classList.remove('er-speaking'));
      const el = i >= 0 ? this.blocks(doc)[i] : null;
      if (el) el.classList.add('er-speaking');
    }
  }

  voice() {
    const all = speechSynthesis.getVoices();
    const meta = this.reader.book && this.reader.book.packaging && this.reader.book.packaging.metadata;
    const lang = String((meta && meta.language) || '').slice(0, 2).toLowerCase();
    return all.find((v) => v.name === this.app.prefs.ttsVoice) ||
      (lang && all.find((v) => v.lang.toLowerCase().startsWith(lang))) || null;
  }

  /* resolves to null when the text was spoken (or cut short on purpose), or an error message */
  say(text) {
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = this.app.prefs.ttsRate || 1;
      u.onend = () => res(null);
      u.onerror = (e) => res(e.error === 'interrupted' || e.error === 'canceled' ? null : (e.error || 'speech error'));
      this.utterance = u;   // keep a reference: events of a collected utterance never fire
      speechSynthesis.speak(u);
    });
  }
}
