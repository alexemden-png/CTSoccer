// Generates feed.xml from news-data.js's static NEWS_STORIES — the site's
// curated news stories, with title, link, and publish date. Doesn't include
// the live match-result stories news.html generates client-side at runtime
// (those come from a live API fetch, not something a static file build step
// can see), only the hand-curated ones.
//
// Run with: node generate-rss-feed.mjs

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://ctsoccerhub.com';

const src = fs.readFileSync(path.join(__dirname, 'news-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { NEWS_STORIES } = vm.runInContext('({NEWS_STORIES})', sandbox);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// news-data.js dates are like "Aug 9, 2026" — RSS wants RFC 822.
function toRfc822(dateStr) {
  const d = new Date(dateStr + ' 12:00:00');
  if (isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

// Sort newest first, same as news.html's feed.
const sorted = [...NEWS_STORIES].sort((a, b) => new Date(b.date) - new Date(a.date));

const items = sorted.map(n => {
  const link = `${SITE}/news/${esc(n.id)}.html`;
  return `
  <item>
    <title>${esc(n.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${toRfc822(n.date)}</pubDate>
    <description>${esc(n.summary)}</description>
  </item>`;
}).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CT Soccer News</title>
    <link>${SITE}/news.html</link>
    <description>Season storylines and match results for Connecticut's real professional and semi-pro soccer clubs.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(__dirname, 'feed.xml'), rss, 'utf8');
console.log(`Generated feed.xml with ${sorted.length} stories`);
