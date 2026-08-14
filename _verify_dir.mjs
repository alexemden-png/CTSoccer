import puppeteer from 'puppeteer';
import path from 'path';

const outDir = 'C:\\Users\\Alex\\OneDrive\\Documents\\alex\'s coding\\CT Soccer\\temporary screenshots';

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('#nav-directory');
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(outDir, 'dir-list.png') });

await page.evaluate(() => {
  const row = document.querySelector('#dir-body > div');
  if (row) row.click();
});
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: path.join(outDir, 'dir-modal.png') });

await browser.close();
console.log('done');
