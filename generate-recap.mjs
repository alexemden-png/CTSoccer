// Builds "This Week in CT Soccer" — a recap story assembled from data
// already in clubs-data.js (recentResults/upcoming, plus LEAGUE_STANDINGS).
// Upserts it into news-data.js (by id, so re-running the same week updates
// instead of duplicating — and preserves any `commentary` you've already
// written for that week), then chains generate-news-pages.mjs and
// generate-rss-feed.mjs so the result is immediately live as a real
// news/*.html page.
//
// IMPORTANT — data freshness: this script does NOT fetch live data itself.
// I tried adding a live TheSportsDB fetch directly into this script, but
// hit a hard wall in my dev environment: any .mjs file here that calls
// fetch() to an external domain gets silently killed by security software
// (confirmed via several isolated tests) before it can finish — so I
// couldn't verify that code actually works, and I didn't want to hand you
// something untested. That may not affect your own machine at all, but
// rather than guess, this script sticks to clubs-data.js's cached
// recentResults/upcoming, which you (or a future automated sync) need to
// keep current by hand. It DOES protect against a stale result looking
// fresh: a club with `seasonStatus: 'concluded'` gets a season-status
// sentence instead of being read as this week's news, and any other result
// older than ~10 days gets an explicit "As of <date>" framing.
//
// Run with: node generate-recap.mjs
//
// After it runs, you can open news-data.js, find the new entry (top of the
// NEWS_STORIES array, id starts with "week-"), and fill in `commentary`
// with a sentence or two of your own — then just run
// `node generate-news-pages.mjs` again to re-render with it.

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clubsDataSrc = fs.readFileSync(path.join(__dirname, 'clubs-data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(clubsDataSrc, sandbox);
const { CT_CLUBS, LEAGUE_STANDINGS } = vm.runInContext('({CT_CLUBS, LEAGUE_STANDINGS})', sandbox);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function standingsPts(row) { return row.w * 3 + (row.d || 0); }

// "5th of 12 in USL Championship" — or null if this club has no standings table.
function positionText(club) {
  const table = LEAGUE_STANDINGS[club.id];
  if (!table) return null;
  const sorted = [...table.rows].sort((a, b) => standingsPts(b) - standingsPts(a));
  const idx = sorted.findIndex(r => r.abbr === table.selfAbbr);
  if (idx === -1) return null;
  const ord = (n) => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  return `${ord(idx + 1)} of ${sorted.length} in ${club.league}`;
}

// A result more than this many days old, with no seasonStatus flag set,
// still gets an explicit "As of <date>" framing rather than reading as
// if it just happened.
const STALE_AFTER_DAYS = 10;

function daysAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function resultSentence(club) {
  const r = club.recentResults && club.recentResults[0];
  if (club.seasonStatus === 'concluded') {
    if (!r) return `${club.name}'s ${club.league} season has concluded — no result on file.`;
    const verb = r.result === 'W' ? 'won' : r.result === 'L' ? 'lost' : 'drew';
    return `${club.name}'s ${club.league} season concluded on ${r.date} — final match ${verb} ${r.score} ${r.home ? 'at home' : 'on the road'} vs ${r.opponent}. No matches currently scheduled.`;
  }
  if (!r) return `${club.name} had no result on file this week.`;
  const verb = r.result === 'W' ? 'beat' : r.result === 'L' ? 'fell to' : 'drew with';
  const where = r.home ? 'at home' : 'on the road';
  const pos = positionText(club);
  const posSuffix = pos ? ` — now ${pos}` : '';
  const age = daysAgo(r.date);
  if (age != null && age > STALE_AFTER_DAYS) {
    return `As of ${r.date}, the most recent result on file for ${club.name} is a ${r.result === 'W' ? 'win' : r.result === 'L' ? 'loss' : 'draw'} (${r.score}) ${where} vs ${r.opponent}${posSuffix}.`;
  }
  return `${club.name} ${verb} ${r.opponent} ${r.score} ${where} (${r.date})${posSuffix}.`;
}

function upcomingSentence(club) {
  const m = club.upcoming && club.upcoming[0];
  if (!m) return null;
  return `Next up: ${m.home ? 'vs' : '@'} ${m.opponent}, ${m.date}${m.time ? ` (${m.time})` : ''}.`;
}

// ---- Build the recap body as an array of pre-built HTML fragments, same
// shape generate-news-pages.mjs's bodyHtml() expects (it just joins them). ----
const clubBlocks = CT_CLUBS.map(club => {
  const result = resultSentence(club);
  const upcoming = upcomingSentence(club);
  return `
      <div style="background:var(--navy-800);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:14px;">
        <div style="font-size:.95rem;font-weight:800;color:#fff;margin-bottom:6px;">${esc(club.name)}</div>
        <p style="font-size:.88rem;line-height:1.7;color:rgba(255,255,255,.65);margin:0;">${esc(result)}</p>
        ${upcoming ? `<p style="font-size:.82rem;color:rgba(255,255,255,.4);margin:6px 0 0;">${esc(upcoming)}</p>` : ''}
      </div>`;
}).join('\n');

const today = new Date();
const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const isoDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
const id = `week-${isoDate}`;

const title = `This Week in CT Soccer — ${dateStr}`;
const summary = `Results and what's next for Hartford Athletic, CT United FC, New Haven United FC, AC Connecticut, and CT Rush.`;

// Note: `commentary` is deliberately NOT baked into this body — it's kept as
// its own field on the story and spliced in fresh by generate-news-pages.mjs
// at render time. That's what makes "edit commentary, re-run just the page
// generator" actually work: if it were embedded here, editing the field
// later would do nothing until generate-recap.mjs ran again.
function buildBody() {
  return [
    `<p style="font-size:.95rem;line-height:1.8;color:rgba(255,255,255,.75);margin:0 0 20px;">${esc(summary)}</p>`,
    `<h2 style="font-size:1.05rem;font-weight:800;color:#fff;margin:0 0 14px;">Club by Club</h2>`,
    clubBlocks,
  ];
}

// ---- Upsert into news-data.js: load current NEWS_STORIES, replace-or-prepend
// this week's entry (preserving any commentary already written for it if
// this is a same-week re-run), then rewrite the whole file. ----
const newsDataPath = path.join(__dirname, 'news-data.js');
const newsDataSrc = fs.readFileSync(newsDataPath, 'utf8');
const newsSandbox = {};
vm.createContext(newsSandbox);
vm.runInContext(newsDataSrc, newsSandbox);
const { NEWS_STORIES } = vm.runInContext('({NEWS_STORIES})', newsSandbox);

const existing = NEWS_STORIES.find(s => s.id === id);
const commentary = existing && existing.commentary ? existing.commentary : '';

const recapStory = {
  id,
  category: 'recap',
  badge: 'Weekly Recap', badgeClass: 'badge-recap',
  date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  clubId: null,
  title,
  summary,
  commentary,
  body: buildBody(),
};

const withoutThisWeek = NEWS_STORIES.filter(s => s.id !== id);
const updatedStories = [recapStory, ...withoutThisWeek];

// Serialize a story object back to formatted JS source. Uses JSON.stringify
// for every value so quoting/escaping is always correct, even though that
// means double quotes instead of the single quotes used elsewhere in this
// file — correctness over cosmetic match for an auto-generated block.
function serializeStory(s) {
  const lines = [];
  lines.push(`  {`);
  lines.push(`    id: ${JSON.stringify(s.id)},`);
  lines.push(`    category: ${JSON.stringify(s.category)},`);
  lines.push(`    badge: ${JSON.stringify(s.badge)}, badgeClass: ${JSON.stringify(s.badgeClass)},`);
  lines.push(`    date: ${JSON.stringify(s.date)},`);
  lines.push(`    clubId: ${s.clubId ? JSON.stringify(s.clubId) : 'null'},`);
  lines.push(`    title: ${JSON.stringify(s.title)},`);
  lines.push(`    summary: ${JSON.stringify(s.summary)},`);
  if (s.commentary !== undefined) lines.push(`    commentary: ${JSON.stringify(s.commentary)},`);
  if (s.body) lines.push(`    body: [\n${s.body.map(b => `      ${JSON.stringify(b)},`).join('\n')}\n    ],`);
  lines.push(`  },`);
  return lines.join('\n');
}

const header = newsDataSrc.slice(0, newsDataSrc.indexOf('const NEWS_STORIES'));
const newSrc = `${header}const NEWS_STORIES = [\n${updatedStories.map(serializeStory).join('\n')}\n];\n`;
fs.writeFileSync(newsDataPath, newSrc, 'utf8');

console.log(existing ? `Updated existing recap "${id}" in news-data.js` : `Added new recap "${id}" to news-data.js`);
if (commentary) console.log('Kept your existing commentary for this week.');
else console.log(`Tip: open news-data.js, find "${id}", and fill in its "commentary" field, then re-run generate-news-pages.mjs alone to pick it up.`);

// ---- Chain the two generators so the recap is immediately live. ----
execFileSync(process.execPath, ['generate-news-pages.mjs'], { cwd: __dirname, stdio: 'inherit' });
execFileSync(process.execPath, ['generate-rss-feed.mjs'], { cwd: __dirname, stdio: 'inherit' });
