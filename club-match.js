// Shared "which club fits my kid" matching logic — used by both
// find-a-club.html (the quiz) and assistant.html (the Soccer Assistant
// chat), so the two give consistent answers instead of drifting apart.
// Depends on clubs-data.js and cjsa-directory.js being loaded first.
//
// Honesty rules baked in throughout:
//  - No lat/lng or real distance exists anywhere in this site's data, so
//    "how far" is answered with same-town / same-county / statewide, never
//    a fabricated mileage number. County assignment is a fixed, permanent
//    public fact (verified against a CT town/county crosswalk), not a
//    guess.
//  - Age group and competitive-level data only exists for the ~33 rich
//    ALL_CLUBS profiles. The ~130+ CJSA-directory-only clubs have neither.
//    A missing value NEVER excludes a club or gets guessed at — it's
//    tracked and shown as "not listed," while a club with real data that
//    contradicts an answer (wrong age range, wrong tier) does get filtered
//    out, since that's an actual known mismatch.

// ---- CT town -> county (all 169 towns; verified against a CT town/county
// crosswalk, not reconstructed from memory) ----
const CT_TOWN_COUNTY = {
  'Andover':'Tolland','Ansonia':'New Haven','Ashford':'Windham','Avon':'Hartford','Barkhamsted':'Litchfield',
  'Beacon Falls':'New Haven','Berlin':'Hartford','Bethany':'New Haven','Bethel':'Fairfield','Bethlehem':'Litchfield',
  'Bloomfield':'Hartford','Bolton':'Tolland','Bozrah':'New London','Branford':'New Haven','Bridgeport':'Fairfield',
  'Bridgewater':'Litchfield','Bristol':'Hartford','Brookfield':'Fairfield','Brooklyn':'Windham','Burlington':'Hartford',
  'Canaan':'Litchfield','Canterbury':'Windham','Canton':'Hartford','Chaplin':'Windham','Cheshire':'New Haven',
  'Chester':'Middlesex','Clinton':'Middlesex','Colchester':'New London','Colebrook':'Litchfield','Columbia':'Tolland',
  'Cornwall':'Litchfield','Coventry':'Tolland','Cromwell':'Middlesex','Danbury':'Fairfield','Darien':'Fairfield',
  'Deep River':'Middlesex','Derby':'New Haven','Durham':'Middlesex','East Granby':'Hartford','East Haddam':'Middlesex',
  'East Hampton':'Middlesex','East Hartford':'Hartford','East Haven':'New Haven','East Lyme':'New London','East Windsor':'Hartford',
  'Eastford':'Windham','Easton':'Fairfield','Ellington':'Tolland','Enfield':'Hartford','Essex':'Middlesex',
  'Fairfield':'Fairfield','Farmington':'Hartford','Franklin':'New London','Glastonbury':'Hartford','Goshen':'Litchfield',
  'Granby':'Hartford','Greenwich':'Fairfield','Griswold':'New London','Groton':'New London','Guilford':'New Haven',
  'Haddam':'Middlesex','Hamden':'New Haven','Hampton':'Windham','Hartford':'Hartford','Hartland':'Hartford',
  'Harwinton':'Litchfield','Hebron':'Tolland','Kent':'Litchfield','Killingly':'Windham','Killingworth':'Middlesex',
  'Lebanon':'New London','Ledyard':'New London','Lisbon':'New London','Litchfield':'Litchfield','Lyme':'New London',
  'Madison':'New Haven','Manchester':'Hartford','Mansfield':'Tolland','Marlborough':'Hartford','Meriden':'New Haven',
  'Middlebury':'New Haven','Middlefield':'Middlesex','Middletown':'Middlesex','Milford':'New Haven','Monroe':'Fairfield',
  'Montville':'New London','Morris':'Litchfield','Naugatuck':'New Haven','New Britain':'Hartford','New Canaan':'Fairfield',
  'New Fairfield':'Fairfield','New Hartford':'Litchfield','New Haven':'New Haven','New London':'New London','New Milford':'Litchfield',
  'Newington':'Hartford','Newtown':'Fairfield','Norfolk':'Litchfield','North Branford':'New Haven','North Canaan':'Litchfield',
  'North Haven':'New Haven','North Stonington':'New London','Norwalk':'Fairfield','Norwich':'New London','Old Lyme':'New London',
  'Old Saybrook':'Middlesex','Orange':'New Haven','Oxford':'New Haven','Plainfield':'Windham','Plainville':'Hartford',
  'Plymouth':'Litchfield','Pomfret':'Windham','Portland':'Middlesex','Preston':'New London','Prospect':'New Haven',
  'Putnam':'Windham','Redding':'Fairfield','Ridgefield':'Fairfield','Rocky Hill':'Hartford','Roxbury':'Litchfield',
  'Salem':'New London','Salisbury':'Litchfield','Scotland':'Windham','Seymour':'New Haven','Sharon':'Litchfield',
  'Shelton':'Fairfield','Sherman':'Fairfield','Simsbury':'Hartford','Somers':'Tolland','South Windsor':'Hartford',
  'Southbury':'New Haven','Southington':'Hartford','Sprague':'New London','Stafford':'Tolland','Stamford':'Fairfield',
  'Sterling':'Windham','Stonington':'New London','Stratford':'Fairfield','Suffield':'Hartford','Thomaston':'Litchfield',
  'Thompson':'Windham','Tolland':'Tolland','Torrington':'Litchfield','Trumbull':'Fairfield','Union':'Tolland',
  'Vernon':'Tolland','Voluntown':'New London','Wallingford':'New Haven','Warren':'Litchfield','Washington':'Litchfield',
  'Waterbury':'New Haven','Waterford':'New London','Watertown':'Litchfield','West Hartford':'Hartford','West Haven':'New Haven',
  'Westbrook':'Middlesex','Weston':'Fairfield','Westport':'Fairfield','Wethersfield':'Hartford','Willington':'Tolland',
  'Wilton':'Fairfield','Winchester':'Litchfield','Windham':'Windham','Windsor':'Hartford','Windsor Locks':'Hartford',
  'Wolcott':'New Haven','Woodbridge':'New Haven','Woodbury':'Litchfield','Woodstock':'Windham',
};

// A handful of well-known CT village/borough names that appear as a club's
// `city` instead of the actual town they're legally part of.
const CT_VILLAGE_ALIASES = {
  'Stafford Springs': 'Stafford',
  'Terryville': 'Plymouth',
  'Winsted': 'Winchester',
  'Willimantic': 'Windham',
};

function resolveCounty(cityRaw) {
  if (!cityRaw) return null;
  const city = (CT_VILLAGE_ALIASES[cityRaw] || cityRaw).trim();
  return CT_TOWN_COUNTY[city] || null;
}

// ---- Age bands. Extends assistant.html's original 3 bands with a 4th for
// the youngest kids, since real ageGroups data does include U6-U8. ----
const AGE_BANDS = {
  'U6-U8':  ['U6','U7','U8'],
  'U9-U11': ['U9','U10','U11'],
  'U12-U14':['U12','U13','U14'],
  'U15-U19':['U15','U16','U17','U18','U19'],
};

function hasRealAgeData(club) {
  return !!(club.ageGroups && club.ageGroups.length);
}

function ageBandMatches(club, ageBand) {
  if (!hasRealAgeData(club)) return null; // unknown
  const wanted = AGE_BANDS[ageBand] || [];
  return club.ageGroups.some((g) => wanted.includes(g));
}

// Soft classification from the club's own league text — only meaningful
// for real ALL_CLUBS profiles. CJSA-only stub clubs all carry the same
// generic literal "CJSA (Connecticut Junior Soccer Association)" league
// string, which tells us nothing about their actual competitive level, so
// this deliberately returns null for them rather than guessing
// "recreational" (which the assistant's original standalone version did).
function classifyYouthLevel(club) {
  if (club.isDirectoryOnly) return null;
  const l = club.league || '';
  if (/MLS NEXT|ECNL|Girls Academy|GA Aspire/i.test(l)) return 'elite';
  if (/EDP/i.test(l)) return 'competitive';
  return 'recreational';
}

// ---- Build the full youth-club candidate pool: every CJSA_DIRECTORY
// member (resolved to its rich ALL_CLUBS profile via edpClubId when
// linked) plus any ALL_CLUBS entry not reachable through CJSA_DIRECTORY at
// all, same merge generate-town-directory.mjs/compare.html use — then
// resolved through getClubById() so every candidate has a consistent
// shape, and filtered to tier === 'Youth' (excludes the 5 pro/semi/amateur
// adult clubs, which don't belong in a "find a club for my kid" pool). ----
function buildYouthClubPool() {
  const map = new Map();
  const edpIds = new Set(CJSA_DIRECTORY.filter((c) => c.edpClubId).map((c) => c.edpClubId));
  CJSA_DIRECTORY.forEach((c) => {
    const id = c.edpClubId || c.id;
    if (!map.has(id)) map.set(id, id);
  });
  ALL_CLUBS.filter((c) => !edpIds.has(c.id)).forEach((c) => {
    if (!map.has(c.id)) map.set(c.id, c.id);
  });
  return [...map.keys()]
    .map((id) => getClubById(id))
    .filter((c) => c && c.tier === 'Youth');
}

// ---- Main entry point. answers = { town, ageBand, level, travel } ----
// town: free text CT town name (or '')
// ageBand: one of AGE_BANDS keys, or '' for "any age"
// level: 'recreational' | 'competitive' | 'elite' | 'unsure' | ''
// travel: 'town' | 'county' | 'anywhere'
function matchClubs(answers) {
  const town = (answers.town || '').trim();
  const ageBand = answers.ageBand || '';
  const level = answers.level || '';
  const travel = answers.travel || 'anywhere';

  const townNorm = town.toLowerCase();
  const county = resolveCounty(town);

  let pool = buildYouthClubPool();
  const notes = [];

  // --- Geographic filter, based on travel tolerance ---
  if (town) {
    // Exact match only — CT has genuinely distinct towns whose names are
    // substrings of each other (Hartford / East Hartford / West Hartford /
    // New Hartford; Haven / New Haven; Canaan / New Canaan / North Canaan),
    // so a loose "includes" match would wrongly conflate them.
    const sameTown = (c) => c.city.trim().toLowerCase() === townNorm;
    const sameCounty = (c) => county && resolveCounty(c.city) === county;

    let geoFiltered;
    if (travel === 'town') geoFiltered = pool.filter(sameTown);
    else if (travel === 'county') geoFiltered = pool.filter((c) => sameTown(c) || sameCounty(c));
    else geoFiltered = pool; // anywhere — no filter, but still ranked below

    if (geoFiltered.length) {
      pool = geoFiltered;
    } else {
      notes.push(`No clubs found within your selected travel range for "${town}" — showing statewide results instead.`);
    }
  }

  // --- Age filter: exclude confirmed mismatches only, never unknowns ---
  if (ageBand) {
    const filtered = pool.filter((c) => ageBandMatches(c, ageBand) !== false);
    if (filtered.length) pool = filtered;
    else notes.push(`No clubs with a confirmed match for that age group turned up nearby — showing other local options; ages may still work, just not listed on file.`);
  }

  // --- Competitive-level filter: same rule, and skipped entirely on "unsure" ---
  if (level && level !== 'unsure') {
    const filtered = pool.filter((c) => {
      const lvl = classifyYouthLevel(c);
      return lvl == null || lvl === level;
    });
    if (filtered.length) pool = filtered;
    else notes.push(`No clubs at exactly that competitive level matched — showing the closest real options by age/location instead.`);
  }

  // --- Score + sort what's left ---
  const scored = pool.map((c) => {
    let score = 0;
    if (town) {
      if (c.city.trim().toLowerCase() === townNorm) score += 4;
      else if (county && resolveCounty(c.city) === county) score += 2;
    }
    if (ageBand && ageBandMatches(c, ageBand) === true) score += 2;
    if (level && level !== 'unsure' && classifyYouthLevel(c) === level) score += 2;
    return { club: c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.slice(0, 5).map((s) => s.club),
    totalMatches: scored.length,
    notes,
  };
}

// Human-readable age range for a club, or null if not on file.
function clubAgeRangeLabel(club) {
  if (!hasRealAgeData(club)) return null;
  const g = club.ageGroups;
  return g.length > 1 ? `${g[0]}–${g[g.length - 1]}` : g[0];
}
