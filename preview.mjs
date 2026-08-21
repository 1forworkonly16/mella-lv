// Opens the site in a phone-sized Chrome app window (no tab strip, no URL bar).
//
// Note: puppeteer's headed mode does not produce a visible window on this
// machine, so this launches the installed Chrome directly. That emulates the
// *viewport width* (which is what drives every breakpoint in index.html) but
// not touch input or device pixel ratio. For true device emulation, open the
// site in a normal Chrome tab and press Ctrl+Shift+M.
//
// Usage: node preview.mjs [device] [url]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Outer window = content + ~16px horizontal frame, ~48px title bar.
const DEVICES = {
  'iphone-15': [393, 852],
  'iphone-se': [375, 667],
  'pixel-8':   [412, 915],
  'galaxy-s8': [360, 740],
  'small':     [320, 640],
  'tablet':    [768, 1024],
  'laptop':    [1280, 800],
  'desktop':   [1440, 900],
  'wide':      [1920, 1080],
};

const name = (process.argv[2] || 'iphone-15').toLowerCase();
const url  = process.argv[3] || 'http://localhost:3001';
const size = DEVICES[name];

if (!size) {
  console.error('Unknown device: ' + name);
  console.error('Choose one of: ' + Object.keys(DEVICES).join(', '));
  process.exit(1);
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);

if (!CHROME) {
  console.error('Chrome not found in Program Files.');
  process.exit(1);
}

// A dedicated profile so --window-size is honoured even when Chrome is already
// running; reusing the default profile would just open a tab in the existing window.
const profile = join(process.env.LOCALAPPDATA, 'Temp', 'claude', 'mella-preview-profile');
mkdirSync(profile, { recursive: true });

const [w, h] = size;
spawn(CHROME, [
  `--user-data-dir=${profile}`,
  `--app=${url}`,
  `--window-size=${w + 16},${h + 48}`,
  '--window-position=120,50',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,ChromeWhatsNewUI',
], { detached: true, stdio: 'ignore' }).unref();

console.log(`opened ${name} — ${w}x${h} content — ${url}`);
