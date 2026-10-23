// Draws the background of the macOS disk image window: `npm run dmg-background`
// The window is 600×400 (package.json → build.dmg); Finder puts Folio's icon on the left and the
// Applications folder on the right, over the arrow between them. Writes a @2x copy for Retina.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 600px; height: 400px; overflow: hidden; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; }
  body { background: radial-gradient(120% 100% at 30% 0%, #f8ecd4 0%, #efd9b0 60%, #e2c08a 100%); color: #3d2e1c; }
  h1 { position: absolute; top: 44px; width: 100%; margin: 0; text-align: center; font-size: 22px; font-weight: 650; letter-spacing: -.01em; }
  .sub { position: absolute; top: 80px; width: 100%; text-align: center; font-size: 13px; color: #7a5d3c; }
  svg { position: absolute; left: 228px; top: 176px; }
  .tip { position: absolute; bottom: 22px; left: 40px; right: 40px; text-align: center; font-size: 11.5px; line-height: 1.5; color: #7a5d3c; }
  .tip b { color: #3d2e1c; font-weight: 600; }
</style></head><body>
  <h1>Drag Folio to Applications</h1>
  <div class="sub">Then open it from Launchpad or your Applications folder.</div>
  <svg width="144" height="48" viewBox="0 0 144 48" fill="none">
    <path d="M6 24h120" stroke="#9b5a2f" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 12"/>
    <path d="M112 10l18 14-18 14" stroke="#9b5a2f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <div class="tip">First time? If macOS says it can’t check Folio, open <b>System Settings → Privacy &amp; Security</b> and choose <b>Open Anyway</b>.</div>
</body></html>`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html);
mkdirSync('build', { recursive: true });
for (const [scale, file] of [[1, 'build/dmg-background.png'], [2, 'build/dmg-background@2x.png']]) {
  await page.setViewport({ width: 600, height: 400, deviceScaleFactor: scale });
  await page.screenshot({ path: file });
  console.log(file, 'written');
}
await browser.close();
