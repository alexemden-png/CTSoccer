// Stamps today's local date onto the "lastSynced" field of the clubs whose
// results/record are refreshed by hand from TheSportsDB (or wherever you
// pulled from). Run this as the very last step after you've hand-edited a
// club's recentResults/upcoming/wins/draws/losses/gf/ga in clubs-data.js —
// it's the one thing that has to happen manually, so it's kept to a single
// command rather than a field you'd have to remember to type yourself.
//
// Run with no args to stamp all 4 tracked clubs:
//   node mark-synced.mjs
// Or name just the ones you actually refreshed this time:
//   node mark-synced.mjs hartford-athletic ct-united-fc
//
// This only updates the date field — it does NOT regenerate any pages. If
// the club(s) you stamped also got new scores/results, re-run
// generate-club-pages.mjs (and generate-spotlight.mjs, if that club has a
// spotlight) afterward so the static pages pick up both the new numbers
// and the new synced date.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The only clubs with a lastSynced field at all — keep this list in sync
// with which clubs actually have live-data plumbing (sportsDbId/apiTeamName
// in clubs-data.js).
const TRACKED_CLUB_IDS = ['hartford-athletic', 'ct-united-fc', 'ac-connecticut', 'connecticut-rush-usl2'];

const requested = process.argv.slice(2);
const targets = requested.length ? requested : TRACKED_CLUB_IDS;

const unknown = targets.filter((id) => !TRACKED_CLUB_IDS.includes(id));
if (unknown.length) {
  console.error(`Not a tracked club id: ${unknown.join(', ')}`);
  console.error(`Tracked clubs are: ${TRACKED_CLUB_IDS.join(', ')}`);
  process.exit(1);
}

const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

const clubsDataPath = path.join(__dirname, 'clubs-data.js');
let src = fs.readFileSync(clubsDataPath, 'utf8');

let updatedCount = 0;
for (const id of targets) {
  // Find this club's object by its id, then replace just its own
  // lastSynced line — scoped to a single object so clubs sharing similar
  // field values can't cross-match each other.
  const idMarker = `id: '${id}',`;
  const idIdx = src.indexOf(idMarker);
  if (idIdx === -1) {
    console.error(`Couldn't find "${idMarker}" in clubs-data.js — skipping.`);
    continue;
  }
  const nextObjEnd = src.indexOf('\n  },', idIdx);
  const objSlice = src.slice(idIdx, nextObjEnd);
  const lastSyncedRe = /lastSynced: '[^']*',/;
  if (!lastSyncedRe.test(objSlice)) {
    console.error(`"${id}" has no existing lastSynced field to update — skipping.`);
    continue;
  }
  const newObjSlice = objSlice.replace(lastSyncedRe, `lastSynced: '${today}',`);
  src = src.slice(0, idIdx) + newObjSlice + src.slice(nextObjEnd);
  updatedCount++;
  console.log(`${id} -> lastSynced: ${today}`);
}

if (updatedCount) {
  fs.writeFileSync(clubsDataPath, src, 'utf8');
  console.log(`\nUpdated ${updatedCount} club(s) in clubs-data.js.`);
  console.log('Tip: if scores/results changed too, re-run generate-club-pages.mjs (and generate-spotlight.mjs for any of these with a spotlight) so the static pages pick up both.');
} else {
  console.log('Nothing updated.');
}
