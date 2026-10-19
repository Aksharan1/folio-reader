// Regenerates the README screenshots in docs/screenshots: `npm run screenshots`
// Imports the bundled Frankenstein sample plus a few tiny demo EPUBs (public-domain opening
// lines, no cover art, so the generated covers show), then stages some reading progress.
import puppeteer from 'puppeteer';
import JSZip from 'jszip';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const OUT = 'docs/screenshots';
const PORT = 8130;

const DEMO = [
  ['Pride and Prejudice', 'Jane Austen', 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.'],
  ['Moby-Dick', 'Herman Melville', 'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.'],
  ['A Tale of Two Cities', 'Charles Dickens', 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.'],
  ['The Time Machine', 'H. G. Wells', 'The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us.'],
  ['Dracula', 'Bram Stoker', '3 May. Bistritz.—Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning.'],
  ['Alice’s Adventures in Wonderland', 'Lewis Carroll', 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.'],
  ['Walden', 'Henry David Thoreau', 'When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor.'],
  ['The Odyssey', 'Homer', 'Tell me, O muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.'],
  ['Little Women', 'Louisa May Alcott', '“Christmas won’t be Christmas without any presents,” grumbled Jo, lying on the rug.'],
  ['Meditations', 'Marcus Aurelius', 'Of my grandfather Verus I have learned to be gentle and meek, and to refrain from all anger and passion.'],
  ['The Art of War', 'Sun Tzu', 'Sun Tzu said: The art of war is of vital importance to the State.'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function demoEpub(title, author, text) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">demo-${encodeURIComponent(title)}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/c1.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>${esc(text)}</p></body></html>`);
  return zip.generateAsync({ type: 'base64' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.error('page error:', e));
const shot = async (name) => { await sleep(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('saved', name); };
const ready = () => page.waitForFunction(() => {
  const f = document.querySelector('.er-frame');
  return f && f.contentDocument && f.contentDocument.readyState === 'complete' && !document.querySelector('.screen-read.loading');
}, { timeout: 30000 });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => app.importSample());
await page.waitForSelector('.book');
for (const [title, author, text] of DEMO) {
  const b64 = await demoEpub(title, author, text);
  await page.evaluate(async (name, data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    await app.library.addBytes(name, bytes);
  }, title + '.epub', b64);
}

// stage a believable reading history
await page.evaluate(() => {
  const hour = 3600e3, now = Date.now();
  const stage = {
    'Pride and Prejudice': { pct: 64, lastOpened: now - 26 * hour, readMs: 4.2 * hour, favourite: true },
    'Moby-Dick': { pct: 12, lastOpened: now - 3 * 24 * hour, readMs: 1.1 * hour },
    'A Tale of Two Cities': { pct: 100, lastOpened: now - 9 * 24 * hour, readMs: 9.5 * hour, favourite: true },
    'The Time Machine': { pct: 38, lastOpened: now - 5 * 24 * hour, readMs: 0.9 * hour },
    'Meditations': { pct: 89, lastOpened: now - 2 * 24 * hour, readMs: 2.6 * hour, favourite: true },
    'Walden': { pct: 7, lastOpened: now - 12 * 24 * hour, readMs: 0.3 * hour },
    'Dracula': { pct: 46, lastOpened: now - 6 * 24 * hour, readMs: 3.1 * hour },
  };
  for (const r of app.library.records) {
    if (stage[r.title]) Object.assign(r, stage[r.title]);
    app.library.saveRecord(r);
  }
  app.renderLibrary();
});

// read Frankenstein for a bit and leave some highlights
await page.evaluate(() => app.openBook(app.library.records.find((r) => /frankenstein/i.test(r.title))));
await ready();
await page.evaluate(async () => {
  const quotes = [
    ['I beheld the wretch—the miserable monster whom I had created.', 'purple', ''],
    ['Nothing is so painful to the human mind as a great and sudden change.', 'yellow', 'The whole novel in one sentence.'],
    ['I was benevolent and good; misery made me a fiend.', 'pink', ''],
    ['Learn from me, if not by my precepts, at least by my example, how dangerous is the acquirement of knowledge', 'blue', ''],
  ];
  for (const [q, color, note] of quotes) {
    const { results } = await app.reader.search(q);
    if (!results.length) continue;
    await app.reader.renderSection(results[0].spineIndex, 0);
    app.reader.lastSelection = q;
    app.reader.addHighlight(color, note);
  }
  app.reader.record.readMs = 2.4 * 3600e3;
});
await page.evaluate(() => app.reader.search('Learn from me, if not by my precepts').then(({ results }) =>
  app.reader.renderSection(results[0].spineIndex, null, 'Learn from me, if not by my precepts')).then(() => app.refreshProgress()));
await ready();
await sleep(800);
await page.keyboard.press('KeyB');
await sleep(2800);
await shot('reader');

await page.evaluate(() => app.setReading({ tone: 'sepia' }));
await ready();
await page.keyboard.press('KeyS');
await shot('appearance');
await page.keyboard.press('Escape');
await page.evaluate(() => app.setReading({ tone: 'midnight' }));
await ready();

await page.keyboard.press('KeyF');
await page.type('.drawer-search input', 'monster');
await page.waitForFunction(() => document.querySelectorAll('.result').length > 5, { timeout: 20000 });
await page.evaluate(() => document.querySelectorAll('.result')[4].click());
await ready();
await shot('search');
await page.keyboard.press('Escape');

await page.keyboard.press('KeyA');
await shot('annotations-drawer');
await page.keyboard.press('Escape');

await page.click('.rd-left .icon-btn');
await page.waitForSelector('.book');
await page.evaluate(() => { app.toast = () => {}; document.querySelector('.toast')?.classList.remove('on'); });
await shot('library');
await page.evaluate(() => app.go('reading'));
await shot('reading-now');
await page.evaluate(() => app.go('annotations'));
await shot('annotations');
await page.evaluate(() => app.go('settings'));
await shot('settings');

await browser.close();
server.close();
