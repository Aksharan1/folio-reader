// End-to-end smoke test: `npm test`
// Boots the app in headless Chrome, imports the sample book and exercises the main flows.
// Set SHOTS=<dir> to save screenshots of each step.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../scripts/serve.mjs';

const PORT = 8123;
const SHOTS = process.env.SHOTS || '';
const W = Number(process.env.W) || 1440, H = Number(process.env.H) || 900;

const server = await startServer(PORT);
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
const page = await browser.newPage();
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
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  check('shows empty state', await waitFor(() => document.querySelector('.empty h2')?.textContent.includes('empty')));
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
  await page.evaluate(() => app.go('authors'));
  check('authors page', await waitFor(() => document.querySelectorAll('.author').length === 1));
  await page.evaluate(() => app.go('settings'));
  check('settings page', await waitFor(() => !!document.querySelector('.preview')));
  await shot('13-settings');

  console.log('Persistence');
  await page.reload({ waitUntil: 'networkidle0' });
  const after = await page.evaluate(() => {
    const r = app.library.records[0];
    return { n: app.library.records.length, anns: r.annotations.length, bms: r.bookmarks.length, tone: app.library.settings.tone, pct: r.pct };
  });
  check('survives reload', after.n === 1 && after.anns === 1 && after.bms === 1 && after.tone === 'midnight', JSON.stringify(after));

  const appErrors = await page.evaluate(() => window.__errors);
  check('no runtime errors', !appErrors.length && !consoleErrors.length, [...appErrors, ...consoleErrors].join(' | ') || 'none');
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
