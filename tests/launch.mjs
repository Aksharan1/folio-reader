// Starts the desktop app with a throwaway profile and attaches Puppeteer to its window.
// Used by the smoke test and the screenshot script.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const electron = createRequire(import.meta.url)('electron');

export async function launchApp({ port = 9333, protocolTimeout = 120000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'folio-test-'));
  const proc = spawn(electron, [
    ROOT, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    // keep rendering while the window is covered or unfocused, as it would be in a headless browser
    '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ], { stdio: 'ignore' });

  let browser;
  for (let i = 0; i < 100 && !browser; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null, protocolTimeout });
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!browser) throw new Error('the app did not start');
  const target = await browser.waitForTarget((t) => t.type() === 'page' && t.url().startsWith('app://folio/'));
  const page = await target.page();

  async function close() {
    try { await browser.disconnect(); } catch {}
    proc.kill();
    await new Promise((r) => proc.exitCode !== null ? r() : proc.once('exit', r));
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
  return { browser, page, close };
}
