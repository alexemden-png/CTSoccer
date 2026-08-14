import fs from 'fs';
const [,, filePath, startMarker, endMarker, teamMatch] = process.argv;
const text = fs.readFileSync(filePath, 'utf8');
const start = startMarker ? text.indexOf(startMarker) : 0;
const end = endMarker ? text.indexOf(endMarker, start) : -1;
const section = text.slice(start >= 0 ? start : 0, end > 0 ? end : undefined);
const blocks = section.split(/\{\{\s*football\s*box\s*collapsible/i).slice(1);

function get(b, key) {
  const re = new RegExp('\\|\\s*' + key + '\\s*=\\s*([^\\n|]*)');
  const m = b.match(re);
  return m ? m[1].trim() : '';
}

let w = 0, d = 0, l = 0, gf = 0, ga = 0, played = 0, lastDate = '', nextMatch = null;
const results = [];
for (const b of blocks) {
  const team1 = get(b, 'team1').replace(/\[\[|\]\]/g, '').split('|').pop();
  const team2 = get(b, 'team2').replace(/\[\[|\]\]/g, '').split('|').pop();
  const score = get(b, 'score');
  const date = get(b, 'date');
  const isTeam1 = team1.includes(teamMatch);
  const isTeam2 = team2.includes(teamMatch);
  if (!isTeam1 && !isTeam2) continue;
  const m = score.match(/(\d+).(\d+)/);
  if (!m) {
    if (!nextMatch) nextMatch = { date, opponent: isTeam1 ? team2 : team1, home: isTeam2 };
    continue;
  }
  const s1 = +m[1], s2 = +m[2];
  const my = isTeam1 ? s1 : s2;
  const opp = isTeam1 ? s2 : s1;
  const oppName = isTeam1 ? team2 : team1;
  played++; gf += my; ga += opp;
  let res;
  if (my > opp) { w++; res = 'W'; } else if (my < opp) { l++; res = 'L'; } else { d++; res = 'D'; }
  lastDate = date;
  results.push({ date, oppName, score: `${my}-${opp}`, res, home: isTeam2 });
}
console.log(JSON.stringify({ played, w, d, l, gf, ga, pts: w*3+d, winPct: played ? (w/played*100).toFixed(1)+'%' : 'n/a', lastDate, nextMatch }, null, 1));
console.log('--- last 5 results ---');
console.log(results.slice(-5).map(r=>`${r.date}: ${r.home?'vs':'at'} ${r.oppName} ${r.score} (${r.res})`).join('\n'));
