/* =========================================================
   Read aloud — speaks the book, following along page by page, with
   Folio's natural voice (Kokoro, downloaded once and run on this
   computer) or the voices installed with the system
   ========================================================= */

const SPEECH_RATES = [
  { id: 0.85, name: 'Slow' },
  { id: 1,    name: 'Normal' },
  { id: 1.2,  name: 'Fast' },
  { id: 1.45, name: 'Faster' },
];

/* the natural voices offered: Kokoro voice id → how it's named here */
const NATURAL_VOICES = [
  ['af_heart', 'Heart · US'], ['af_bella', 'Bella · US'], ['af_nicole', 'Nicole · US (soft)'],
  ['am_michael', 'Michael · US'], ['am_fenrir', 'Fenrir · US'],
  ['bf_emma', 'Emma · UK'], ['bm_george', 'George · UK'], ['bm_fable', 'Fable · UK'],
];

/* elements that hold a run of text; only the innermost ones are read */
const SPEAK_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,pre,figcaption,td,div';

/* long paragraphs are spoken a few sentences at a time, so stopping is instant; the natural
   voice takes shorter runs, so the first words come quickly */
function speechParts(text, max = 400) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t ? [t] : [];
  const out = [];
  let cur = '';
  for (const s of t.match(/[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g) || [t]) {
    if (cur && cur.length + s.length > max) { out.push(cur.trim()); cur = ''; }
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
    this.natural = false;    // speaking with the natural voice this time
    this.ready = new Map();  // natural voice: text → its audio, being made ahead of time
    this.source = null;      // natural voice: the audio playing now
    this.ctx = null;
  }

  get reader() { return this.app.reader; }

  static supported() { return typeof speechSynthesis !== 'undefined' || !!(window.folioDesktop && window.folioDesktop.voice); }

  /* the book's language, from its metadata (two letters, or '' when it doesn't say) */
  bookLang() {
    const meta = this.reader.book && this.reader.book.packaging && this.reader.book.packaging.metadata;
    return String((meta && meta.language) || '').slice(0, 2).toLowerCase();
  }

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

  /* The natural voice is used for English books when it's downloaded and not switched off;
     the first time, the app offers to download it. */
  async start() {
    if (!ReadAloud.supported() || !this.reader.book) return;
    const lang = this.bookLang();
    const english = !lang || lang === 'en';
    let natural = false;
    if (english && this.app.prefs.ttsEngine !== 'system' && window.folioDesktop.voice) {
      const st = await window.folioDesktop.voice.status();
      if (st.installed) natural = true;
      else if (!this.app.prefs.ttsOffered) {
        this.app.offerNaturalVoice();
        return;
      }
    }
    if (!natural && typeof speechSynthesis === 'undefined') return;
    this.natural = natural;
    this.on = true;
    this.app.setSpeaking(true);
    this.play(++this.run);
  }

  stop() {
    if (!this.on) return false;
    this.on = false;
    this.run++;
    this.silence();
    this.mark(-1);
    this.app.setSpeaking(false);
    return true;
  }

  /* carry on from whatever page is on screen now (after a page turn or a jump) */
  restart() {
    if (!this.on) return;
    this.run++;
    this.silence();
    this.mark(-1);
    this.play(this.run);
  }

  /* cut off whatever is being said, and forget audio made for what was coming */
  silence() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.ready.clear();
    if (this.source) { try { this.source.stop(); } catch (e) {} this.source = null; }
  }

  parts(text) { return speechParts(text, this.natural ? 220 : 400); }

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
        const parts = this.parts(list[i].textContent);
        for (let k = 0; k < parts.length; k++) {
          // the natural voice makes the next words while these are spoken, so there's no gap
          const next = k + 1 < parts.length ? parts[k + 1] : list[i + 1] ? this.parts(list[i + 1].textContent)[0] : null;
          if (next) this.prepare(next);
          const err = await this.say(parts[k]);
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
    const lang = this.bookLang();
    return all.find((v) => v.name === this.app.prefs.ttsVoice) ||
      (lang && all.find((v) => v.lang.toLowerCase().startsWith(lang))) || null;
  }

  naturalVoice() {
    const id = this.app.prefs.naturalVoice;
    return NATURAL_VOICES.some(([v]) => v === id) ? id : NATURAL_VOICES[0][0];
  }

  /* says a line in the chosen voice, from Settings */
  async preview() {
    this.stop();
    this.run++;
    const p = this.app.prefs;
    this.natural = p.ttsEngine !== 'system' && !!window.folioDesktop.voice && (await window.folioDesktop.voice.status()).installed;
    if (!this.natural && p.ttsEngine !== 'system') { this.app.toast('Download the natural voices first', 'info'); return; }
    const err = await this.say(VOICE_SAMPLE);
    if (err) this.app.toast('Couldn’t play the voice: ' + err, 'info');
  }

  /* natural voice: start making the audio for some text, if it isn't already on its way */
  prepare(text) {
    if (!this.natural || this.ready.has(text)) return;
    const p = window.folioDesktop.voice.speak(text, this.naturalVoice(), this.app.prefs.ttsRate || 1);
    p.catch(() => {});
    this.ready.set(text, p);
  }

  /* resolves to null when the text was spoken (or cut short on purpose), or an error message */
  say(text) {
    return this.natural ? this.sayNatural(text) : this.saySystem(text);
  }

  async sayNatural(text) {
    const run = this.run;
    this.prepare(text);
    const made = this.ready.get(text);
    let audio;
    try { audio = await made; } catch (e) { return run === this.run ? String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : null; }
    this.ready.delete(text);
    if (run !== this.run || !audio || !audio.samples.length) return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const buf = this.ctx.createBuffer(1, audio.samples.length, audio.rate);
    buf.copyToChannel(audio.samples, 0);
    return new Promise((res) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.onended = () => { if (this.source === src) this.source = null; res(null); };
      this.source = src;
      src.start();
    });
  }

  saySystem(text) {
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
