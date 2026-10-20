// Renders the favicon from index.html to build/icon.png for the desktop app: `npm run icon`
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync } from 'node:fs';

const SIZE = 512;
const html = readFileSync('index.html', 'utf8');
const href = html.match(/<link rel="icon" href="([^"]+)">/)[1];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: SIZE, height: SIZE });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${href}" width="${SIZE}" height="${SIZE}">`);
await page.waitForFunction(() => document.querySelector('img').complete);
mkdirSync('build', { recursive: true });
await page.screenshot({ path: 'build/icon.png', omitBackground: true });
await browser.close();
console.log('build/icon.png written');
