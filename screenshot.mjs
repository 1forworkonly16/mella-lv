import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'temporary screenshots');

function findChrome() {
  const cacheRoot = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (existsSync(cacheRoot)) {
    const builds = readdirSync(cacheRoot).sort().reverse();
    for (const b of builds) {
      const exe = join(cacheRoot, b, 'chrome-win64', 'chrome.exe');
      if (existsSync(exe)) return exe;
    }
  }
  const fallbacks = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const f of fallbacks) if (existsSync(f)) return f;
  throw new Error('No Chrome or Edge binary found.');
}

async function nextIndex() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = await readdir(OUT_DIR);
  let max = 0;
  for (const f of files) {
    const num = parseInt((f.match(/[0-9]+/) || [0])[0], 10);
    if (f.startsWith('screenshot-') && num > max) max = num;
  }
  return max + 1;
}

const url = process.argv[2] || 'http://localhost:3000';
const label = (process.argv[3] || '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
const selector = process.argv[4] || null;

const width = Number(process.env.W) || 390;
const height = Number(process.env.H) || 844;
const fullPage = process.env.FULL !== '0' && !selector;

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb'],
});

const page = await browser.newPage();
const mobile = width < 1024;   // desktop must not be emulated as a touch device
await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });

const failed = [];
page.on('requestfailed', r => failed.push(r.url()));
page.on('console', m => { if (m.type() === 'error') console.log('  [console error]', m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
// Settle entrance animations and lazy content.
await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

// Always scroll the whole page: reveal-on-scroll elements start at opacity 0,
// so without this an element screenshot captures blank space.
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.evaluate(() => new Promise(r => setTimeout(r, 700)));

const n = await nextIndex();
const name = 'screenshot-' + n + (label ? '-' + label : '') + '.png';
const path = join(OUT_DIR, name);

if (selector) {
  const el = await page.$(selector);
  if (!el) throw new Error('Selector not found: ' + selector);
  await el.screenshot({ path });
} else {
  await page.screenshot({ path, fullPage });
}

const dims = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
console.log('saved: temporary screenshots/' + name);
console.log('page: ' + dims.w + ' x ' + dims.h + '  viewport: ' + width + ' x ' + height);
if (dims.w > width) console.log('WARNING: horizontal overflow, body is ' + dims.w + 'px wide');
if (failed.length) {
  console.log('failed requests (' + failed.length + '):');
  [...new Set(failed)].slice(0, 15).forEach(u => console.log('  ' + u));
}

await browser.close();
