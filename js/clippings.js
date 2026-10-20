/* =========================================================
   Kindle highlights — imports "My Clippings.txt" into matching books
   ========================================================= */

const isClippingsFile = (name) => /clippings[^\\/]*\.txt$/i.test(name || '');

/* Each entry is "Title (Author)", a meta line ("- Your Highlight on page 3 | Location 40-42 |
   Added on …"), a blank line and the text, closed by a row of ='s. Bookmarks have no text. */
function parseClippings(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').replace(/﻿/g, '').split(/^={6,}[ \t]*$/m)) {
    const lines = block.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 3) continue;
    const head = lines[0].trim();
    const meta = lines[1];
    const body = lines.slice(2).join('\n').trim();
    if (!body || /bookmark|lesezeichen|marcador|signet|segnalibro/i.test(meta)) continue;
    const by = head.match(/^(.*?)\s*\(([^()]*)\)$/);
    const loc = meta.match(/(?:location|loc\.|position|posición|emplacement|posizione)\s+(\d+)(?:\s*-\s*(\d+))?/i) || meta.match(/(\d+)(?:\s*-\s*(\d+))?/);
    const added = Date.parse(meta.split('|').pop().replace(/^.*?added on\s*/i, '').replace(/^[^\d,]+,\s*/, ''));
    out.push({
      title: by ? by[1] : head,
      author: by ? by[2] : '',
      type: /\bnote\b|notiz|\bnota\b/i.test(meta) ? 'note' : 'highlight',
      text: body,
      end: loc ? Number(loc[2] || loc[1]) : null,
      time: Number.isNaN(added) ? Date.now() : added,
    });
  }
  return out;
}

const clipKey = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* Kindle titles often carry a subtitle the EPUB lacks, or the other way round */
function matchClippingBook(records, title) {
  const t = clipKey(title);
  if (!t) return null;
  let near = null;
  for (const r of records) {
    const n = clipKey(r.title);
    if (!n) continue;
    if (n === t) return r;
    if (!near && Math.min(n.length, t.length) >= 4 && (n.startsWith(t + ' ') || t.startsWith(n + ' '))) near = r;
  }
  return near;
}

const quoteKey = (s) => (s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/* finds where each quote sits in a book: section, chapter title and percentage */
async function bookLocator(library, rec) {
  const book = new ePub(await library.dataOf(rec.id));
  await book.opened;
  try { await book.loaded.navigation; } catch (e) {}
  const toc = [];
  const walk = (list) => {
    for (const e of list || []) {
      const sec = book.spine.get(e.href);
      if (sec) toc.push({ label: (e.label || '').replace(/\s+/g, ' ').trim(), spineIndex: sec.index });
      walk(e.subitems);
    }
  };
  walk(book.navigation && book.navigation.toc);
  const texts = [];
  for (let i = 0; i < book.spine.length; i++) {
    let html = '';
    try { html = await book.spine.get(i).render(book.load.bind(book)); } catch (e) {}
    texts.push(quoteKey(new DOMParser().parseFromString(html, 'text/html').body.textContent));
  }
  discardBook(book);
  const total = texts.reduce((n, t) => n + t.length, 0) || 1;
  const chapterOf = (i) => {
    let best = null;
    for (const t of toc) if (t.spineIndex <= i && (!best || t.spineIndex > best.spineIndex)) best = t;
    return best ? best.label : '';
  };
  return (quote) => {
    const q = quoteKey(quote);
    let before = 0;
    for (let i = 0; i < texts.length; i++) {
      const at = q ? texts[i].indexOf(q) : -1;
      if (at >= 0) return { spineIndex: i, chapter: chapterOf(i), pct: Math.round(((before + at) / total) * 100) };
      before += texts[i].length;
    }
    return null;
  };
}

/* resolves to { added, notes, unmatched: [titles of books that aren't in the library] } */
async function importKindleClippings(library, text) {
  const byBook = new Map();
  const unmatched = new Set();
  for (const c of parseClippings(text)) {
    const rec = matchClippingBook(library.records, c.title);
    if (!rec) { unmatched.add(c.title); continue; }
    if (!byBook.has(rec)) byBook.set(rec, []);
    byBook.get(rec).push(c);
  }
  let added = 0, notes = 0;
  for (const [rec, clips] of byBook) {
    const locate = await bookLocator(library, rec);
    rec.annotations = rec.annotations || [];
    /* a note shares its end location with the highlight it was written on */
    const atLoc = new Map();
    for (const c of clips.filter((x) => x.type === 'highlight')) {
      const quote = c.text.replace(/\s+/g, ' ').trim();
      let a = rec.annotations.find((x) => quoteKey(x.quote) === quoteKey(quote));
      if (!a) {
        const where = locate(quote) || { spineIndex: 0, chapter: '', pct: 0 };
        a = {
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          type: 'highlight', color: 'yellow', ...where, quote, note: '', time: c.time,
        };
        rec.annotations.push(a);
        added++;
      }
      if (c.end !== null) atLoc.set(c.end, a);
    }
    for (const c of clips.filter((x) => x.type === 'note')) {
      const a = atLoc.get(c.end);
      if (a && !a.note) { a.note = c.text.trim(); a.type = 'note'; notes++; }
    }
    library.saveRecord(rec);
  }
  return { added, notes, unmatched: [...unmatched] };
}
