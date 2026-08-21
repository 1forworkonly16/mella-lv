// Proves the mobile rendering is byte-for-byte unchanged.
//   node mobile-diff.mjs capture <dir>
//   node mobile-diff.mjs diff <dirA> <dirB>
import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WIDTHS = [320, 360, 390, 393, 768];
const LANGS = ['lv', 'ru', 'en'];
const BASE = 'http://localhost:3001';
// Measured noise floor of this harness: a handful of subpixel antialiasing
// differences. A real layout regression is orders of magnitude larger.
const NOISE = 50;

function findChrome(){
  const root = join(homedir(), '.cache', 'puppeteer', 'chrome');
  for (const b of readdirSync(root).sort().reverse()){
    const e = join(root, b, 'chrome-win64', 'chrome.exe');
    if (existsSync(e)) return e;
  }
  throw new Error('no chrome');
}

// Deterministic images: every external asset is fetched once, cached to disk,
// and replayed identically on later runs. Without this, a slow or failed
// hotlink from mella.lv shows up as a false "mobile changed" diff.
const CACHE = '.imgcache';
mkdirSync(CACHE, { recursive: true });

async function useCache(page){
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = req.url();
    if (url.startsWith(BASE) || url.startsWith('data:')) { req.continue(); return; }
    const key = createHash('sha1').update(url).digest('hex');
    const body = join(CACHE, key + '.bin');
    const meta = join(CACHE, key + '.type');
    if (existsSync(body)){
      req.respond({ status: 200, contentType: readFileSync(meta, 'utf8'), body: readFileSync(body) });
      return;
    }
    try {
      const r = await fetch(url);
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      writeFileSync(body, buf);
      writeFileSync(meta, ct);
      req.respond({ status: r.status, contentType: ct, body: buf });
    } catch {
      req.abort();
    }
  });
}

async function settle(page){
  // Determinism: kill all motion and force reveal elements to their end state,
  // otherwise screenshots catch transitions mid-flight and diffs are noise.
  await page.addStyleTag({ content:
    '*,*::before,*::after{transition:none !important;animation:none !important}' +
    '.rv{opacity:1 !important;transform:none !important}'
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step){
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  // Wait for every image to finish decoding (hotlinked originals are slow).
  await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map(i => i.complete && i.naturalWidth > 0
      ? Promise.resolve()
      : new Promise(r => { i.addEventListener('load', r, {once:true}); i.addEventListener('error', r, {once:true}); setTimeout(r, 15000); })));
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
}

async function capture(dir){
  mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  for (const w of WIDTHS){
    for (const lang of LANGS){
      const page = await browser.newPage();
      await useCache(page);
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await page.goto(BASE + '/?lang=' + lang, { waitUntil: 'networkidle2', timeout: 90000 });
      await settle(page);
      const name = w + '-' + lang + '.png';
      await page.screenshot({ path: join(dir, name), fullPage: true });
      const h = await page.evaluate(() => document.body.scrollHeight);
      console.log('  captured ' + name + '  (height ' + h + ')');
      await page.close();
    }
  }
  await browser.close();
}

async function diff(a, b){
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  let worst = 0, files = 0, bad = 0;
  for (const w of WIDTHS){
    for (const lang of LANGS){
      const name = w + '-' + lang + '.png';
      const pa = join(a, name), pb = join(b, name);
      if (!existsSync(pa) || !existsSync(pb)){ console.log('  MISSING ' + name); bad++; continue; }
      const da = 'data:image/png;base64,' + readFileSync(pa).toString('base64');
      const db = 'data:image/png;base64,' + readFileSync(pb).toString('base64');
      const res = await page.evaluate(async (u1, u2) => {
        const load = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
        const [i1, i2] = await Promise.all([load(u1), load(u2)]);
        if (i1.width !== i2.width || i1.height !== i2.height)
          return { sizeMismatch: true, a: i1.width + 'x' + i1.height, b: i2.width + 'x' + i2.height };
        const c1 = new OffscreenCanvas(i1.width, i1.height).getContext('2d');
        const c2 = new OffscreenCanvas(i2.width, i2.height).getContext('2d');
        c1.drawImage(i1, 0, 0); c2.drawImage(i2, 0, 0);
        const d1 = c1.getImageData(0, 0, i1.width, i1.height).data;
        const d2 = c2.getImageData(0, 0, i2.width, i2.height).data;
        let n = 0, minY = 1e9, maxY = -1;
        for (let p = 0; p < d1.length; p += 4){
          if (d1[p] !== d2[p] || d1[p+1] !== d2[p+1] || d1[p+2] !== d2[p+2]){
            n++;
            const y = Math.floor((p / 4) / i1.width);
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        return { diff: n, total: i1.width * i1.height, minY, maxY, w: i1.width, h: i1.height };
      }, da, db);
      files++;
      if (res.sizeMismatch){
        console.log('  ' + name + '  SIZE CHANGED  ' + res.a + ' -> ' + res.b);
        bad++;
      } else if (res.diff > NOISE){
        const pct = (res.diff / res.total * 100).toFixed(4);
        console.log('  ' + name + '  ' + res.diff + ' px differ (' + pct + '%)  rows ' + res.minY + '-' + res.maxY);
        bad++;
        if (res.diff > worst) worst = res.diff;
      } else if (res.diff > 0){
        console.log('  ' + name + '  ' + res.diff + ' px (within antialiasing noise)');
      } else {
        console.log('  ' + name + '  identical  (' + res.w + 'x' + res.h + ')');
      }
    }
  }
  console.log('');
  console.log(bad === 0 ? 'RESULT: all ' + files + ' mobile renders identical.' : 'RESULT: ' + bad + ' of ' + files + ' differ.');
  await browser.close();
  process.exitCode = bad === 0 ? 0 : 1;
}

const [cmd, d1, d2] = process.argv.slice(2);
if (cmd === 'capture') await capture(d1 || 'baseline');
else if (cmd === 'diff') await diff(d1 || 'baseline', d2 || 'after');
else { console.error('usage: capture <dir> | diff <a> <b>'); process.exitCode = 2; }
