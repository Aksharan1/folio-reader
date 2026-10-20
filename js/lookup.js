/* =========================================================
   Look up — definitions from Wiktionary, with Wikipedia for names and phrases.
   The only part of Folio that goes online, and only when you ask it to.
   ========================================================= */

const plainText = (html) => new DOMParser().parseFromString(html || '', 'text/html').body.textContent.replace(/\s+/g, ' ').trim();

/* resolves to { title, senses: [{ pos, defs }] } or { title, text }, each with source and url;
   null when nothing was found. Throws when offline. */
async function lookUpWord(text, lang = 'en', depth = 0) {
  const word = text.replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!word) return null;
  const slug = (w) => encodeURIComponent(w.replace(/ /g, '_'));
  for (const w of new Set([word, word.toLowerCase()])) {
    const res = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + slug(w));
    if (!res.ok) continue;
    const all = await res.json();
    const entries = all[lang] || all.en || Object.values(all)[0] || [];
    const senses = entries.slice(0, 3)
      .map((e) => ({ pos: e.partOfSpeech || '', defs: (e.definitions || []).map((d) => plainText(d.definition)).filter(Boolean).slice(0, 3) }))
      .filter((s) => s.defs.length);
    if (!senses.length) continue;
    /* "plural of foreboding": show the base word's meanings as well */
    const base = senses[0].defs[0].match(/^(?:[\w-]+ )*(?:plural|form|participle|past|tense|singular|comparative|superlative|spelling) of ([\p{L}'-]+)\.?$/iu);
    if (base && depth < 1 && base[1].toLowerCase() !== w.toLowerCase()) {
      const more = await lookUpWord(base[1], lang, depth + 1).catch(() => null);
      if (more && more.senses) return { ...more, senses: [senses[0], ...more.senses].slice(0, 3) };
    }
    return { title: w, senses, source: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/' + slug(w) };
  }
  const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + slug(word));
  if (res.ok) {
    const page = await res.json();
    if (page.extract && page.type !== 'disambiguation') {
      return { title: page.title, text: page.extract, source: 'Wikipedia', url: page.content_urls && page.content_urls.desktop ? page.content_urls.desktop.page : null };
    }
  }
  return null;
}
