// Regenerates the README pictures in docs/screenshots: `npm run screenshots`
// Imports the bundled Frankenstein sample, a few tiny demo EPUBs (public-domain opening lines, no
// cover art, so the generated covers show) and a demo manga drawn by scripts/demo-manga.js, stages
// some reading progress, captures the app at twice the pixel density, then lays the captures out
// as framed pictures (a hero, a strip of the five themes, and one per feature) in headless Chrome.
import JSZip from 'jszip';
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchApp, SANDBOX_ARGS } from '../tests/launch.mjs';

const OUT = 'docs/screenshots';
const RAW = join(tmpdir(), 'folio-shots');
const W = 1440, H = 900;

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
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* ---------- 1. capture the app ---------- */

const { page, close } = await launchApp({ port: 9334 });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e));
const raw = async (name) => { await sleep(600); await page.screenshot({ path: join(RAW, name + '.png') }); console.log('captured', name); };
const ready = () => page.waitForFunction(() => {
  const f = document.querySelector('.er-frame');
  return f && f.contentDocument && f.contentDocument.readyState === 'complete' && !document.querySelector('.screen-read.loading') && !app.reader.flipping;
}, { timeout: 30000 });
const tone = async (id) => { await page.evaluate((id) => app.setReading({ tone: id }), id); await ready(); };

await page.goto('app://folio/index.html', { waitUntil: 'networkidle0' });
await page.addScriptTag({ content: readFileSync('scripts/demo-manga.js', 'utf8') });
await page.evaluate(() => { app.toast = () => {}; app.setPref('twoPages', true); app.setAppTheme('sepia'); app.setReading({ font: 'palatino', brightness: 0.5 }); });
await page.evaluate(() => app.importSample());
await page.waitForSelector('.book');
for (const [title, author, text] of DEMO) {
  const b64 = await demoEpub(title, author, text);
  await page.evaluate(async (name, data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    await app.library.addBytes(name, bytes);
  }, title + '.epub', b64);
}
await page.evaluate(async () => { await app.library.add(await demoMangaCbz()); });

// a believable reading history
await page.evaluate(() => {
  const hour = 3600e3, now = Date.now();
  const stage = {
    'Tidewatch Vol. 1': { pct: 44, lastOpened: now - 2 * hour, readMs: 0.6 * hour, favourite: true },
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
    ['Learn from me, if not by my precepts, at least by my example, how dangerous is the acquirement of knowledge', 'yellow', ''],
    ['the moon gazed on my midnight labours', 'green', ''],
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
const goTo = (q) => page.evaluate((q) => app.reader.search(q).then(({ results }) =>
  app.reader.renderSection(results[0].spineIndex, null, q)).then(() => app.refreshProgress()), q);

// the hero page: two pages of sepia with highlights
await goTo('Learn from me, if not by my precepts');
await ready();
await sleep(800);
await page.keyboard.press('KeyB');
await sleep(2800);
await raw('reader-sepia');

// the same spot in every theme, for the theme strip
for (const id of ['light', 'sepia', 'dark', 'midnight', 'charcoal']) { await tone(id); await raw('theme-' + id); }
await tone('sepia');

// look up a word (a real Wiktionary request)
await page.evaluate(() => app.reader.renderSection(3, 0).then(() => app.refreshProgress()));
await ready();
await page.evaluate(() => {
  const doc = app.reader.doc();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode()) && !n.nodeValue.includes('forebodings'));
  const at = n.nodeValue.indexOf('forebodings');
  const range = doc.createRange();
  range.setStart(n, at);
  range.setEnd(n, at + 'forebodings'.length);
  doc.getSelection().removeAllRanges();
  doc.getSelection().addRange(range);
  doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await page.waitForSelector('.sel-bar');
await page.evaluate(() => [...document.querySelectorAll('.sel-bar .sel-btn')].find((b) => b.textContent === 'Look up').click());
let lookedUp = true;
try { await page.waitForSelector('.pop-card .pop-sense', { timeout: 15000 }); await raw('look-up'); } catch { lookedUp = false; console.warn('look-up skipped: no answer from Wiktionary'); }
await page.keyboard.press('Escape');
await page.evaluate(() => app.reader.doc().getSelection().removeAllRanges());

await page.keyboard.press('KeyS');
await raw('appearance');
await page.keyboard.press('Escape');

await tone('dark');
await page.keyboard.press('KeyF');
await page.type('.drawer-search input', 'monster');
await page.waitForFunction(() => document.querySelectorAll('.result').length > 5, { timeout: 20000 });
await page.evaluate(() => document.querySelectorAll('.result')[4].click());
await ready();
await raw('search');
await page.keyboard.press('Escape');
await tone('sepia');

// the manga: right to left, two pages at a time, then its page contents
await page.evaluate(() => app.closeBook());
await page.waitForFunction(() => app.screen === 'library' && !!document.querySelector('.book'));
await page.evaluate(() => app.openBook(app.library.records.find((r) => r.format === 'CBZ')));
await ready();
await page.evaluate(() => app.reader.renderSection(3, 0).then(() => app.refreshProgress()));
await ready();
await raw('manga');
await page.evaluate(() => app.reader.renderSection(5, 0).then(() => app.refreshProgress()));
await ready();
await raw('manga-spread');
await tone('midnight');
await page.evaluate(() => app.reader.renderSection(3, 0).then(() => app.refreshProgress()));
await ready();
await page.keyboard.press('KeyT');
await sleep(800);
await raw('manga-contents');
await page.keyboard.press('Escape');
await tone('sepia');

await page.evaluate(() => app.closeBook());
await page.waitForFunction(() => app.screen === 'library' && !!document.querySelector('.book'));
await page.evaluate(() => { document.querySelector('.toast')?.classList.remove('on'); app.go('library'); });
await raw('library');
await page.evaluate(() => app.go('reading'));
await raw('reading-now');
await page.evaluate(() => { app.setAppTheme('midnight'); app.go('annotations'); });
await raw('annotations');
await close();

/* ---------- 2. lay the captures out ---------- */

const chrome = await puppeteer.launch({ headless: true, args: SANDBOX_ARGS });
const sheet = await chrome.newPage();
const img = (name) => pathToFileURL(join(RAW, name + '.png')).href;
// a window: rounded corners, a hairline edge and a soft shadow, on a transparent background
const WINDOW = 'border-radius:14px;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 24px 60px -12px rgba(40,24,8,.45),0 8px 18px -6px rgba(40,24,8,.3);display:block;';

async function compose(name, width, height, body, transparent = true) {
  const file = join(RAW, name + '.html');
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent;font-family:"Segoe UI",system-ui,sans-serif}
  </style></head><body>${body}</body></html>`);
  await sheet.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await sheet.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await sheet.screenshot({ path: join(OUT, name + '.png'), omitBackground: transparent });
  console.log('saved', name);
}

// hero: the sepia reader with the manga in front of it, on warm paper
await compose('hero', 1280, 760, `
  <div style="position:absolute;inset:0;border-radius:22px;background:radial-gradient(120% 90% at 20% 10%,#f6e7c9 0%,#e9cf9f 55%,#cfa66c 100%)"></div>
  <div style="position:absolute;inset:0;border-radius:22px;background:repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 2px,transparent 2px 7px)"></div>
  <img src="${img('reader-sepia')}" style="${WINDOW}position:absolute;left:48px;top:48px;width:880px">
  <img src="${img('manga')}" style="${WINDOW}position:absolute;right:44px;bottom:44px;width:560px">`);

// the five themes, as slices of the same page
const THEMES = [['light', 'Paper'], ['sepia', 'Sepia'], ['dark', 'Dusk'], ['midnight', 'Midnight'], ['charcoal', 'Black']];
await compose('themes', 1280, 520, `
  <div style="display:flex;gap:10px;height:100%">${THEMES.map(([id, label]) => `
    <div style="flex:1;position:relative;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 12px 30px -10px rgba(0,0,0,.4)">
      <div style="position:absolute;inset:0;background:url('${img('theme-' + id)}') no-repeat;background-size:${W * 0.62}px auto;background-position:${-W * 0.62 * 0.06}px -40px"></div>
      <span style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font-size:15px;font-weight:600;letter-spacing:.02em">${label}</span>
    </div>`).join('')}
  </div>`);

// one framed window per feature
const shots = ['reader-sepia', 'manga', 'manga-spread', 'manga-contents', 'library', 'reading-now', 'appearance', 'search', 'annotations'];
if (lookedUp) shots.push('look-up');
for (const name of shots) {
  await compose(name, 1280, 820, `<img src="${img(name)}" style="${WINDOW}position:absolute;left:24px;top:20px;width:1232px">`);
}
await chrome.close();
console.log('pictures in', resolve(OUT));
