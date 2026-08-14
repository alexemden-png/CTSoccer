import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000/club.html?id=beachside-sc';
const tab = process.argv[3] || 'tryouts';
const label = process.argv[4] || tab;

const dir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
let n = 1;
while (fs.existsSync(path.join(dir, `screenshot-${n}-${label}.png`))) n++;
const outPath = path.join(dir, `screenshot-${n}-${label}.png`);

const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate((t) => { if (typeof showTab === 'function') showTab(t); }, tab);
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`Screenshot saved: ${outPath}`);
