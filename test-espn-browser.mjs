import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

// Capture console logs from the page
const logs = [];
page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));

await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2', timeout: 30000 });

// Navigate to clubs section and wait for ESPN fetch to complete
await page.evaluate(() => showSection('clubs'));
await new Promise(r => setTimeout(r, 4000)); // give ESPN 4 seconds

// Check if Hartford Athletic has the live badge
const hasLiveBadge = await page.evaluate(() => {
  const cards = document.querySelectorAll('.club-card');
  for (const card of cards) {
    if (card.textContent.includes('Hartford Athletic') && card.textContent.includes('Live')) return true;
  }
  return false;
});

// Get Hartford Athletic's current record from the page
const record = await page.evaluate(() => {
  const cards = document.querySelectorAll('.club-card');
  for (const card of cards) {
    if (card.textContent.includes('Hartford Athletic')) {
      const recEl = card.querySelector('[style*="Record"]');
      return card.textContent.match(/\d+W-\d+D-\d+L/)?.[0] || 'not found';
    }
  }
  return 'card not found';
});

await page.screenshot({ path: path.join(dir, 'screenshot-espn-test.png') });
await browser.close();

console.log('\n=== ESPN Browser Test Results ===');
console.log('Hartford Athletic record:', record);
console.log('Live badge visible:', hasLiveBadge);
console.log('\nConsole logs:');
logs.filter(l => l.includes('ESPN') || l.includes('espn') || l.includes('Hartford')).forEach(l => console.log(' ', l));
