// Builds "This Week in CT Soccer" — a recap story assembled from data
// already in clubs-data.js (recentResults/upcoming, plus LEAGUE_STANDINGS).
// Upserts it into news-data.js (by id, so re-running the same week updates
// instead of duplicating — and preserves any `commentary` you've already
// written for that week), then chains generate-news-pages.mjs and
// generate-rss-feed.mjs so the result is immediately live as a real
// news/*.html page.
//
// Also drafts ready-to-post Instagram and X/Twitter captions for the week
// (social-posts/<id>.txt) — a casual hook built from the week's single most
// notable result (biggest fresh win, or best league position if nobody
// notched a fresh win), the real ctsoccerhub.com recap link, and a few
// hashtags. This is draft text only — nothing here posts on your behalf;
// copy-paste and review before publishing.
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

// { rank, total } from the club's own standings table, or null if it has none.
function positionInfo(club) {
  const table = LEAGUE_STANDINGS[club.id];
  if (!table) return null;
  const sorted = [...table.rows].sort((a, b) => standingsPts(b) - standingsPts(a));
  const idx = sorted.findIndex(r => r.abbr === table.selfAbbr);
  if (idx === -1) return null;
  return { rank: idx + 1, total: sorted.length };
}

const ordinal = (n) => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// "5th of 12 in USL Championship" — or null if this club has no standings table.
function positionText(club) {
  const info = positionInfo(club);
  return info ? `${ordinal(info.rank)} of ${info.total} in ${club.league}` : null;
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

// ---- Social caption helpers ----

// "2-1" -> 1 (goal margin, from the listed club's perspective — scores are
// always recorded as "our goals-their goals" regardless of home/away).
function goalMargin(score) {
  const [us, them] = score.split('-').map(Number);
  return us - them;
}

// "New Haven United FC" -> "#NewHavenUnitedFC". Strips parentheticals (e.g.
// "CT Rush (USL2)" -> "#CTRush") so the tag stays clean.
function hashtagFromName(name) {
  const stripped = name.replace(/\([^)]*\)/g, '');
  const tag = stripped.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean).join('');
  return tag ? `#${tag}` : null;
}

// Picks the one storyline worth leading a social caption with. Prefers a
// fresh win (biggest margin first, so a blowout beats a squeaker), then
// falls back to the best fresh league position, then to nothing (a
// generic hook gets used instead) — never invents a highlight that isn't
// backed by real data.
function pickHighlight(clubs) {
  const fresh = clubs
    .filter((c) => c.seasonStatus !== 'concluded' && c.recentResults && c.recentResults[0])
    .map((c) => ({ club: c, result: c.recentResults[0] }))
    .filter(({ result }) => {
      const age = daysAgo(result.date);
      return age == null || age <= STALE_AFTER_DAYS;
    });

  const wins = fresh.filter(({ result }) => result.result === 'W')
    .sort((a, b) => goalMargin(b.result.score) - goalMargin(a.result.score));
  if (wins.length) return { type: 'win', club: wins[0].club, result: wins[0].result };

  const ranked = fresh
    .map(({ club }) => ({ club, info: positionInfo(club) }))
    .filter(({ info }) => info)
    .sort((a, b) => a.info.rank - b.info.rank);
  if (ranked.length) return { type: 'position', club: ranked[0].club, info: ranked[0].info };

  return null;
}

// Builds the Instagram (looser, a couple sentences) and X/Twitter (tight,
// single hook + link) captions for this week's recap. Tone is deliberately
// more casual than the recap page itself — a hook to make someone click
// through, not a restatement of the article.
function buildSocialCaptions(highlight, canonicalUrl) {
  const baseTags = ['#CTSoccer', '#ConnecticutSoccer'];

  let hookLong, hookShort, extraTags = [];
  if (highlight && highlight.type === 'win') {
    const { club, result } = highlight;
    const where = result.home ? 'at home' : 'on the road';
    hookLong = `${club.name} picked up a ${result.score} win over ${result.opponent} ${where} this week ⚽🔥`;
    hookShort = `${club.name} beat ${result.opponent} ${result.score} this week 🔥`;
    extraTags = [hashtagFromName(club.name), hashtagFromName(club.league)].filter(Boolean);
  } else if (highlight && highlight.type === 'position') {
    const { club, info } = highlight;
    hookLong = `${club.name} sits ${ordinal(info.rank)} of ${info.total} in ${club.league} heading into this week ⚽`;
    hookShort = `${club.name} is ${ordinal(info.rank)} of ${info.total} in ${club.league} right now.`;
    extraTags = [hashtagFromName(club.name), hashtagFromName(club.league)].filter(Boolean);
  } else {
    hookLong = `Another week in the books across Connecticut soccer ⚽`;
    hookShort = `This week's CT soccer recap is here.`;
  }

  const tags = [...baseTags, ...extraTags].slice(0, 6).join(' ');

  const instagram = [
    hookLong,
    `Here's the full rundown — who won, who's up next, and where every CT club stands right now.`,
    ``,
    `Full recap 👉 ${canonicalUrl}`,
    ``,
    tags,
  ].join('\n');

  const twitter = `${hookShort} Full recap: ${canonicalUrl} ${tags}`;

  return { instagram, twitter };
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
const isoDate = today.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time (not UTC — avoids rolling to the wrong day depending on time of day)
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

// ---- Draft social captions (Instagram + X/Twitter) for this week's recap.
// Always the real production URL, never localhost — these get copy-pasted
// straight into a post, not clicked from a dev environment. Written as a
// plain text file for the user to review and post by hand; nothing here
// posts on anyone's behalf. ----
const canonicalUrl = `https://ctsoccerhub.com/news/${id}.html`;
const highlight = pickHighlight(CT_CLUBS);
const { instagram, twitter } = buildSocialCaptions(highlight, canonicalUrl);

const socialDir = path.join(__dirname, 'social-posts');
if (!fs.existsSync(socialDir)) fs.mkdirSync(socialDir, { recursive: true });
const socialPath = path.join(socialDir, `${id}.txt`);
const socialFile = [
  `INSTAGRAM`,
  `---------`,
  instagram,
  ``,
  ``,
  `TWITTER / X`,
  `-----------`,
  twitter,
  ``,
].join('\n');
fs.writeFileSync(socialPath, socialFile, 'utf8');
console.log(`Drafted social captions -> social-posts/${id}.txt`);

// ---- Chain the two generators so the recap is immediately live. ----
execFileSync(process.execPath, ['generate-news-pages.mjs'], { cwd: __dirname, stdio: 'inherit' });
execFileSync(process.execPath, ['generate-rss-feed.mjs'], { cwd: __dirname, stdio: 'inherit' });
