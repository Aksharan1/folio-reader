// End-to-end smoke test: `npm test`
// Starts the desktop app, imports the sample book and exercises the main flows.
// Set SHOTS=<dir> to save screenshots of each step.
import puppeteer from 'puppeteer';
import JSZip from 'jszip';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch.mjs';

const SHOTS = process.env.SHOTS || '';
const W = Number(process.env.W) || 1440, H = Number(process.env.H) || 900;

const { page, close } = await launchApp();
await page.setViewport({ width: W, height: H });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail !== undefined ? '  (' + detail + ')' : ''));
  if (!ok) failures++;
}
async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}
async function waitFor(fn, ms = 20000, ...args) {
  try { await page.waitForFunction(fn, { timeout: ms, polling: 100 }, ...args); return true; } catch { return false; }
}
const frameReady = () => waitFor(() => {
  const f = document.querySelector('.er-frame');
  return f && f.contentDocument && f.contentDocument.readyState === 'complete' && !document.querySelector('.screen-read.loading');
});

try {
  console.log('Library');
  await page.goto('app://folio/index.html', { waitUntil: 'networkidle0' });
  check('shows empty state', await waitFor(() => document.querySelector('.empty h2')?.textContent.includes('empty')));
  // one page at a time for the reader checks; the two-page view has its own section
  await page.evaluate(() => app.setPref('twoPages', false));
  await shot('01-empty');

  await page.click('.empty-actions .btn:not(.btn-primary)');
  check('sample book imports', await waitFor(() => document.querySelectorAll('.book').length === 1));
  check('cover rendered', await page.evaluate(() => !!document.querySelector('.book .cover img, .book .cover-gen')));
  await sleep(300);
  await shot('02-library');

  await page.click('.view-toggle button:nth-child(2)');
  check('list view', await waitFor(() => document.querySelectorAll('.bl-row').length === 2));
  await shot('03-list');
  await page.click('.view-toggle button:nth-child(1)');

  await page.type('.search-box input', 'zzz');
  check('search filters to none', await waitFor(() => document.querySelector('.empty h2')?.textContent === 'No books found'));
  await page.keyboard.press('Escape');
  check('escape clears search', await waitFor(() => document.querySelectorAll('.book').length === 1));

  console.log('Reader');
  await page.click('.book');
  check('book opens', await frameReady());
  await sleep(400);
  const p0 = await page.evaluate(() => document.querySelector('.rd-page').textContent);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(700); }
  const p1 = await page.evaluate(() => document.querySelector('.rd-page').textContent);
  check('arrow keys turn pages', p0 !== p1, p0 + ' → ' + p1);
  await shot('04-reader');

  await page.keyboard.press('KeyS');
  check('appearance popover opens', await waitFor(() => !!document.querySelector('.popover')));
  await shot('05-appearance');
  await page.evaluate(() => document.querySelectorAll('.popover .theme')[1].click());
  await frameReady();
  check('theme switches to sepia', await page.evaluate(() => app.library.settings.tone === 'sepia' && document.querySelector('.screen-read').classList.contains('tone-light')));
  await sleep(400);
  await shot('06-sepia');
  await page.evaluate(() => document.querySelectorAll('.popover .theme')[3].click());
  await frameReady();
  await page.keyboard.press('Escape');
  check('escape closes popover', await waitFor(() => !document.querySelector('.popover')));

  // select a sentence in a prose chapter and highlight it through the selection toolbar
  await page.evaluate(() => app.reader.renderSection(8, 0).then(() => app.refreshProgress()));
  await frameReady();
  await page.evaluate(() => {
    const doc = document.querySelector('.er-frame').contentDocument;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    let n;
    while ((n = walker.nextNode())) {
      const start = n.nodeValue.search(/\S/);
      if (start < 0 || n.nodeValue.length - start < 50) continue;
      range.setStart(n, start);
      range.setEnd(n, start + 40);
      const r = range.getBoundingClientRect();
      if (r.top > 0 && r.bottom < doc.defaultView.innerHeight - 40) break;
    }
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
    doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 200 }));
  });
  check('selection toolbar appears', await waitFor(() => !!document.querySelector('.sel-bar')));
  await shot('07-selection');
  await page.click('.sel-bar .sel-color:nth-child(5)');
  await frameReady();
  check('highlight saved', await page.evaluate(() => app.reader.record.annotations.length === 1));
  check('highlight drawn on page', await waitFor(() => !!document.querySelector('.er-frame').contentDocument.querySelector('mark.erhl')));

  await page.keyboard.press('KeyB');
  check('bookmark toggles on', await waitFor(() => document.querySelector('.rd-bm').classList.contains('on')));

  await page.keyboard.press('KeyA');
  check('annotations drawer', await waitFor(() => document.querySelectorAll('.drawer .ann').length === 1));
  await sleep(300);
  await shot('08-annotations');

  await page.keyboard.press('KeyT');
  check('contents drawer', await waitFor(() => document.querySelectorAll('.drawer .toc-item').length > 5));
  await sleep(300);
  await shot('09-contents');
  await page.evaluate(() => document.querySelectorAll('.toc-item')[6].click());
  check('toc jump', await waitFor(() => app.reader.spineIndex > 2));
  await frameReady();

  await page.keyboard.press('KeyF');
  check('search drawer', await waitFor(() => !!document.querySelector('.drawer-search input')));
  await page.type('.drawer-search input', 'monster');
  check('search finds results', await waitFor(() => document.querySelectorAll('.result').length > 10));
  const target = await page.evaluate(() => { const r = app.search.results[12]; document.querySelectorAll('.result')[12].click(); return r.spineIndex; });
  await waitFor((s) => app.reader.spineIndex === s, 20000, target);
  await frameReady();
  check('result jump lands on the match', await waitFor(() => {
    const doc = document.querySelector('.er-frame').contentDocument;
    const vh = doc.defaultView.innerHeight, top = doc.scrollingElement.scrollTop;
    return [...doc.querySelectorAll('mark.erhl')].some((m) => { const r = m.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh + 2 && top >= 0; });
  }, 5000));
  await sleep(300);
  await shot('10-search');
  await page.keyboard.press('Escape');

  console.log('Back in the library');
  await page.click('.rd-left .icon-btn');
  check('back to library', await waitFor(() => !!document.querySelector('.book')));
  check('progress recorded', await page.evaluate(() => app.library.records[0].pct > 0), await page.evaluate(() => app.library.records[0].pct + '%'));

  await page.evaluate(() => app.go('reading'));
  check('reading now hero', await waitFor(() => !!document.querySelector('.hero .btn-primary')));
  await shot('11-reading-now');
  await page.evaluate(() => app.go('annotations'));
  check('annotations page', await waitFor(() => document.querySelectorAll('.ann').length === 1));
  await shot('12-annotations');
  const md = await page.evaluate(() => app.notesMarkdown(app.library.records));
  check('highlights export as Markdown', /^# Frankenstein/.test(md) && /\n## .+\n/.test(md) && /\n> \S/.test(md), md.split('\n').slice(0, 7).join(' ⏎ '));
  await page.evaluate(() => app.go('authors'));
  check('authors page', await waitFor(() => document.querySelectorAll('.author').length === 1));
  await page.evaluate(() => app.go('settings'));
  check('settings page', await waitFor(() => !!document.querySelector('.preview')));
  await shot('13-settings');
  // app surfaces are relative colours, which compute as color(srgb …), so read them back through a canvas
  await page.evaluate(() => {
    window.__bodyRgb = () => {
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = getComputedStyle(document.body).backgroundColor;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
  });
  await page.evaluate(() => document.querySelectorAll('.settings-card .theme')[1].click());
  check('settings theme restyles the app', await waitFor(() =>
    document.documentElement.dataset.theme === 'sepia' && app.library.settings.tone === 'sepia' &&
    __bodyRgb().join() === '234,218,187'));
  await sleep(300);
  await shot('14-sepia-app');
  const lightness = (b) => page.evaluate((b) => {
    app.setReading({ brightness: b });
    const lift = document.documentElement.style.getPropertyValue('--lift');
    return { sum: __bodyRgb().reduce((n, c) => n + c, 0), detail: `${getComputedStyle(document.body).backgroundColor} lift ${lift}` };
  }, b);
  const dim = await lightness(0), bright = await lightness(1);
  await lightness(0.5);
  check('brightness changes the whole app', dim.sum < 640 && bright.sum > 680, `${dim.sum} → ${bright.sum} (${dim.detail} | ${bright.detail})`);
  await page.evaluate(() => document.querySelectorAll('.settings-card .theme')[3].click());

  console.log('Persistence');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitFor(() => window.app && app.library.records.length > 0);
  const after = await page.evaluate(() => {
    const r = app.library.records[0];
    return { n: app.library.records.length, anns: r.annotations.length, bms: r.bookmarks.length, tone: app.library.settings.tone, pct: r.pct };
  });
  check('survives reload', after.n === 1 && after.anns === 1 && after.bms === 1 && after.tone === 'midnight', JSON.stringify(after));

  console.log('Themes beat book styles');
  // many EPUBs paint their own backgrounds and force text colours with !important
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">styled</dc:identifier><dc:title>Styled Book</dc:title><dc:creator>Test</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
  zip.file('OEBPS/nav.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">One</a></li></ol></nav></body></html>');
  zip.file('OEBPS/style.css', 'body.calibre{background-color:#fff !important;color:#000 !important}.wrap{background:#fffef8}p.txt{color:#111 !important}');
  zip.file('OEBPS/c1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title><link rel="stylesheet" href="style.css"/></head><body class="calibre"><div class="wrap"><h1>One</h1><p class="txt">Some text on the page.</p></div></body></html>');
  const b64 = await zip.generateAsync({ type: 'base64' });
  await page.evaluate(async (d) => {
    const { rec } = await app.library.addBytes('styled.epub', Uint8Array.from(atob(d), (c) => c.charCodeAt(0)));
    app.setReading({ tone: 'midnight' });
    await app.openBook(rec);
  }, b64);
  await frameReady();
  const styled = await page.evaluate(() => {
    const d = app.reader.doc();
    const cs = (sel, p) => getComputedStyle(d.querySelector(sel))[p];
    return { body: cs('body', 'backgroundColor'), wrap: cs('.wrap', 'backgroundColor'), p: cs('p', 'color') };
  });
  check('page follows the theme', styled.body === 'rgb(23, 26, 39)' && styled.wrap === 'rgba(0, 0, 0, 0)' && styled.p === 'rgb(212, 215, 227)', JSON.stringify(styled));

  console.log('Two-page view');
  await page.evaluate(async () => {
    app.setPref('twoPages', true);
    await app.openBook(app.library.records.find((r) => r.title.startsWith('Frankenstein')));
    await app.reader.renderSection(8, 0);
    app.refreshProgress();
  });
  await frameReady();
  await sleep(300);
  const spread = () => page.evaluate(() => {
    const [l, r] = document.querySelectorAll('.er-frame');
    const tops = l.contentDocument.__erTops || [];
    const at = (f) => tops.indexOf(f.contentDocument.scrollingElement.scrollTop);
    return { frames: document.querySelectorAll('.er-frame').length, label: document.querySelector('.rd-page').textContent, left: at(l), right: r ? at(r) : -1, section: app.reader.spineIndex };
  });
  const s0 = await spread();
  check('two pages side by side', s0.frames === 2 && s0.left === 0 && s0.right === 1 && /^Pages 1–2 of/.test(s0.label), JSON.stringify(s0));
  await shot('15-two-pages');
  await page.keyboard.press('ArrowRight');
  await sleep(700);
  const s1 = await spread();
  check('a turn moves on two pages', s1.section === s0.section ? s1.left === 2 && s1.right === 3 : s1.left === 0, JSON.stringify(s1));
  await page.keyboard.press('ArrowLeft');
  await sleep(700);
  const s2 = await spread();
  check('and back again', JSON.stringify(s2) === JSON.stringify(s0), JSON.stringify(s2));
  await page.evaluate(() => { app.setPref('twoPages', false); app.closeBook(); });

  console.log('Links, footnotes and scripts');
  const lz = new JSZip();
  const xh = (title, body) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body>${body}</body></html>`;
  const filler = Array.from({ length: 40 }, (_, i) => `<p>Filler paragraph ${i} that pushes the target further down the chapter so it starts on a later page.</p>`).join('');
  lz.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  lz.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  lz.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">linked</dc:identifier><dc:title>Linked Book</dc:title><dc:creator>Test</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/><item id="n" href="text/notes.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="n"/></spine></package>');
  lz.file('OEBPS/nav.xhtml', xh('Contents', '<nav epub:type="toc"><ol><li><a href="text/c1.xhtml">One</a></li><li><a href="text/c2.xhtml">Two</a></li></ol></nav>'));
  lz.file('OEBPS/text/c1.xhtml', xh('One', '<h1>One</h1><p>A claim that needs a source<a epub:type="noteref" href="notes.xhtml#n1" id="r1">1</a>, and <a href="c2.xhtml#target" id="jump">a link to the next chapter</a>.</p><script>parent.__pwned = true;</script>'));
  lz.file('OEBPS/text/c2.xhtml', xh('Two', `<h1>Two</h1>${filler}<p id="target">The paragraph the link points at.</p>${filler}`));
  lz.file('OEBPS/text/notes.xhtml', xh('Notes', '<aside epub:type="footnote" id="n1"><p><a href="c1.xhtml#r1">1.</a> The footnote, shown in a popup.</p></aside>'));
  await page.evaluate(async (d) => {
    const { rec } = await app.library.addBytes('linked.epub', Uint8Array.from(atob(d), (c) => c.charCodeAt(0)));
    await app.openBook(rec);
  }, await lz.generateAsync({ type: 'base64' }));
  await frameReady();
  check('book scripts are blocked', await page.evaluate(() => !window.__pwned && !app.reader.doc().querySelector('script:not(#er-js):not(#er-data)')));
  await page.evaluate(() => app.reader.doc().getElementById('r1').click());
  check('footnote opens in a popup', await waitFor(() => /The footnote, shown in a popup/.test(document.querySelector('.pop-card')?.textContent || '')));
  await shot('16-footnote');
  await page.evaluate(() => app.reader.doc().getElementById('jump').click());
  check('links jump to their target', await waitFor(() => {
    const doc = app.reader.doc();
    const el = app.reader.spineIndex === 1 && doc && doc.getElementById('target');
    if (!el || doc.scrollingElement.scrollTop === 0) return false;
    const r = el.getBoundingClientRect();
    return r.top >= -4 && r.bottom <= doc.defaultView.innerHeight;
  }));
  check('popup closes on the jump', await page.evaluate(() => !document.querySelector('.pop-card')));

  console.log('Look up and read aloud');
  // the network and the speech engine are stubbed: tests stay offline and silent
  await page.evaluate(() => {
    window.__realFetch = window.fetch;
    window.fetch = async (url) => /wiktionary/.test(url)
      ? new Response(JSON.stringify({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A <b>section</b> of a book.' }] }] }), { status: 200 })
      : window.__realFetch(url);
    window.__spoken = [];
    speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 40); };
    speechSynthesis.cancel = () => {};
    const doc = app.reader.doc();
    const p = doc.getElementById('target');
    const range = doc.createRange();
    range.setStart(p.firstChild, 4);
    range.setEnd(p.firstChild, 13);
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
    doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 200 }));
  });
  await waitFor(() => !!document.querySelector('.sel-bar'));
  await page.evaluate(() => [...document.querySelectorAll('.sel-bar .sel-btn')].find((b) => b.textContent === 'Look up').click());
  check('look up shows a definition', await waitFor(() => /Noun/.test(document.querySelector('.pop-card')?.textContent || '') && /A section of a book\./.test(document.querySelector('.pop-card').textContent)));
  await shot('17-look-up');
  await page.keyboard.press('Escape');

  await page.keyboard.press('KeyR');
  check('read aloud starts on the page', await waitFor(() => document.querySelector('.rd-tts').classList.contains('on') && !!app.reader.doc().querySelector('.er-speaking') && window.__spoken.length > 0));
  const firstSpoken = await page.evaluate(() => window.__spoken[0]);
  check('it reads from the page on screen', /^The paragraph the link points at|^Filler paragraph/.test(firstSpoken), firstSpoken.slice(0, 40));
  const startPage = await page.evaluate(() => app.reader.pageIndex().pi);
  check('pages turn as it reads', await waitFor((p) => app.reader.pageIndex().pi > p || app.reader.spineIndex > 1, 20000, startPage));
  await page.keyboard.press('KeyR');
  check('read aloud stops', await waitFor(() => !document.querySelector('.rd-tts').classList.contains('on') && !app.reader.doc().querySelector('.er-speaking')));
  await page.evaluate(() => { window.fetch = window.__realFetch; app.closeBook(); });

  console.log('Kindle highlights');
  const clipDir = join(tmpdir(), 'folio-clippings');
  mkdirSync(clipDir, { recursive: true });
  const clip = (head, meta, text) => `${head}\r\n- Your ${meta} | Added on Saturday, 3 February 2018 10:31:32\r\n\r\n${text}\r\n==========\r\n`;
  writeFileSync(join(clipDir, 'My Clippings.txt'), '﻿' + [
    clip('Frankenstein; Or, The Modern Prometheus (Shelley, Mary Wollstonecraft)', 'Highlight on page 1 | Location 40-41', 'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise'),
    clip('Frankenstein; Or, The Modern Prometheus (Shelley, Mary Wollstonecraft)', 'Highlight on page 1 | Location 44-45', 'I am already far north of London'),
    clip('Frankenstein; Or, The Modern Prometheus (Shelley, Mary Wollstonecraft)', 'Note on page 1 | Location 45', 'Walton is very far from home.'),
    clip('Frankenstein; Or, The Modern Prometheus (Shelley, Mary Wollstonecraft)', 'Bookmark on page 2 | Location 50', ''),
    clip('A Book Not Here (Nobody)', 'Highlight on Location 10-12', 'Nothing to see.'),
  ].join(''));
  const before = await page.evaluate(() => app.library.records.find((r) => r.title.startsWith('Frankenstein')).annotations.length);
  await (await page.$('input.hidden-file')).uploadFile(join(clipDir, 'My Clippings.txt'));
  check('clippings add highlights', await waitFor((n) => app.library.records.find((r) => r.title.startsWith('Frankenstein')).annotations.length === n + 2, 30000, before));
  const kin = await page.evaluate(() => {
    const a = app.library.records.find((r) => r.title.startsWith('Frankenstein')).annotations.find((x) => x.quote.startsWith('I am already'));
    return { note: a.note, chapter: a.chapter, spine: a.spineIndex, toast: document.querySelector('.toast').textContent };
  });
  check('notes attach and chapters are found', kin.note === 'Walton is very far from home.' && /letter/i.test(kin.chapter) && kin.spine > 0, JSON.stringify(kin));
  await page.evaluate(() => { document.querySelector('.toast').textContent = ''; });
  await (await page.$('input.hidden-file')).uploadFile(join(clipDir, 'My Clippings.txt'));
  check('importing again adds nothing', await waitFor(() => /No new highlights/.test(document.querySelector('.toast')?.textContent || '')) &&
    await page.evaluate((n) => app.library.records.find((r) => r.title.startsWith('Frankenstein')).annotations.length === n + 2, before));

  console.log('Other formats');
  // each fixture is converted to EPUB on import; Kindle files need a real book, so they're tested by hand.
  // They're added as a folder, the way "Add a folder" does it.
  const fixtures = await formatFixtures();
  await (await page.$$('input.hidden-file'))[1].uploadFile(join(tmpdir(), 'folio-fixtures'));
  check('all formats import', await waitFor((n) => app.library.records.length === 3 + n, 60000, fixtures.length),
    await page.evaluate(() => app.library.records.length - 3) + ' of ' + fixtures.length);
  for (const f of fixtures) {
    const got = await page.evaluate(async (title) => {
      const rec = app.library.records.find((r) => r.title === title);
      if (!rec) return null;
      await app.openBook(rec);
      const text = [...app.reader.htmlCache.values()].join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      return { author: rec.author, format: rec.format, toc: app.reader.toc.map((t) => t.label), sections: rec.chapters, text, cover: !!rec.cover };
    }, f.title);
    await frameReady();
    const ok = got && got.format === f.format && got.author === (f.author || '') && f.phrases.every((p) => got.text.includes(p)) &&
      f.toc.every((t) => got.toc.includes(t)) && (!f.cover || got.cover);
    check(f.format + ' converts', ok, got ? `${got.sections} sections · contents: ${got.toc.join(' / ')}` : 'missing');
  }
  await page.click('.rd-left .icon-btn');
  await page.evaluate(() => app.importFiles([new File(['not a pdf'], 'broken.pdf')]));
  check('unreadable file reports an error', await waitFor(() => /couldn’t be read/.test(document.querySelector('.toast')?.textContent || '')));

  console.log('Backup');
  const saved = await page.evaluate(async () => {
    const before = app.library.records.map((r) => ({ title: r.title, anns: (r.annotations || []).length, pct: r.pct }));
    const bytes = await app.library.backup();
    for (const r of app.library.records.slice()) app.library.remove(r.id);
    const res = await app.library.restore(bytes);
    const after = app.library.records.map((r) => ({ title: r.title, anns: (r.annotations || []).length, pct: r.pct }));
    const key = (l) => JSON.stringify(l.slice().sort((a, b) => a.title.localeCompare(b.title)));
    return { same: key(before) === key(after), res, n: after.length, again: await app.library.restore(bytes) };
  });
  check('backup restores every book with its notes', saved.same && saved.res.added === saved.n, JSON.stringify(saved.res) + ' of ' + saved.n);
  check('restoring twice adds nothing', saved.again.added === 0 && saved.again.updated === saved.n, JSON.stringify(saved.again));

  const appErrors = await page.evaluate(() => window.__errors);
  check('no runtime errors', !appErrors.length && !consoleErrors.length, [...appErrors, ...consoleErrors].join(' | ') || 'none');
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

/* Small books in every non-EPUB format the importer converts, written to a temp folder. */
async function formatFixtures() {
  const dir = join(tmpdir(), 'folio-fixtures');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const para = (n) => `Paragraph ${n} carries enough words to wrap across several lines of the page, so the converter has to join them back together into one flowing paragraph of text.`;
  const out = [];
  const add = (file, data, f) => { writeFileSync(join(dir, file), data); out.push({ path: join(dir, file), ...f }); };

  add('plain-tale.txt',
    ['CHAPTER I.', '', 'It was a dark and stormy night;\nthe rain fell in torrents.', '', 'CHAPTER II.', '', 'Morning came\nat last.', '', 'CHAPTER III.', '', 'The end.'].join('\n'),
    { title: 'plain-tale', format: 'Text', toc: ['CHAPTER I.', 'CHAPTER III.'], phrases: ['It was a dark and stormy night; the rain fell in torrents.'] });

  add('notes.md', '# Markdown Book\n\nIntro with **bold** text.\n\n## First\n\nOne.\n\n## Second\n\n- apple\n- pear\n',
    { title: 'Markdown Book', format: 'Markdown', toc: ['First', 'Second'], phrases: ['Intro with bold text.', 'pear'] });

  add('page.html', '<!doctype html><html><head><title>Web Page Book</title><meta name="author" content="Ada Web"></head><body><h1>Part A</h1><p>Alpha text.</p><h1>Part B</h1><p>Beta text.</p><script>bad()</script></body></html>',
    { title: 'Web Page Book', author: 'Ada Web', format: 'HTML', toc: ['Part A', 'Part B'], phrases: ['Alpha text.', 'Beta text.'] });

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  add('tale.fb2', `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Fyodor</first-name><last-name>Testov</last-name></author><book-title>Fiction Book Tale</book-title><lang>en</lang><coverpage><image l:href="#cover.png"/></coverpage></title-info></description>
<body><title><p>Fiction Book Tale</p></title>
<section><title><p>Opening</p></title><p>First <emphasis>chapter</emphasis> text.<a l:href="#n1" type="note">1</a></p></section>
<section><title><p>Closing</p></title><poem><stanza><v>A line of verse</v></stanza></poem></section></body>
<body name="notes"><section id="n1"><p>The footnote.</p></section></body>
<binary id="cover.png" content-type="image/png">${png}</binary>
</FictionBook>`, { title: 'Fiction Book Tale', author: 'Fyodor Testov', format: 'FB2', toc: ['Opening', 'Closing', 'Notes'], phrases: ['First chapter text.', 'A line of verse', 'The footnote.'], cover: true });

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docx = new JSZip();
  docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docx.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  docx.file('docProps/core.xml', '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Word Document Book</dc:title><dc:creator>Wendy Word</dc:creator></cp:coreProperties>');
  docx.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${p('Chapter One', 'Heading1')}${p('Some words')}<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold run.</w:t></w:r></w:p>${p('Chapter Two', 'Heading1')}${p('More words.')}</w:body></w:document>`);
  add('report.docx', await docx.generateAsync({ type: 'nodebuffer' }),
    { title: 'Word Document Book', author: 'Wendy Word', format: 'DOCX', toc: ['Chapter One', 'Chapter Two'], phrases: ['Some words', 'Bold run.', 'More words.'] });

  // the PDF is printed by a separate headless Chrome
  const chrome = await puppeteer.launch({ headless: true });
  const pg = await chrome.newPage();
  const chapter = (t, n) => `<h1>${t}</h1>${[1, 2, 3].map((i) => `<p>${para(n * 10 + i)}</p>`).join('')}`;
  await pg.setContent(`<html><head><title>Portable Document Book</title><style>body{font:16px serif;width:420px}h1{font-size:30px;break-before:page}</style></head>
    <body>${chapter('Departure', 1)}${chapter('Arrival', 2)}${chapter('Return', 3)}</body></html>`);
  add('document.pdf', await pg.pdf({ format: 'A5', outline: true, tagged: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span></div>' }),
    { title: 'Portable Document Book', format: 'PDF', toc: ['Departure', 'Arrival', 'Return'], phrases: [para(11), para(33)], cover: true });
  await chrome.close();
  return out;
}
