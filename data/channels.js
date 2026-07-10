// Real World Cup 2026 schedule + UK broadcaster data.
//
// Times are stored in UTC (the UK is on BST/UTC+1 during the tournament).
// `channel` is the confirmed UK broadcaster; `null` means "TBC" — the BBC/ITV
// split for that match hasn't been published yet. Knockout fixtures use
// placeholder participants (teams aren't known until the group stage ends).
//
// Sources: football fixture listings + the BBC/ITV match-split announcement
// (every match is free-to-air, split 52/52 across BBC One/Two, ITV1/4).

export const CHANNELS = {
  'BBC One': { net: 'BBC', short: 'BBC One' },
  'BBC Two': { net: 'BBC', short: 'BBC Two' },
  ITV1: { net: 'ITV', short: 'ITV1' },
  ITV4: { net: 'ITV', short: 'ITV4' },
  'BBC & ITV': { net: 'BOTH', short: 'BBC & ITV' },
};

// Helper: m(id, ukDate, ukTime, group, home, homeCode, away, awayCode, venue, channel)
// ukTime is BST; we convert to UTC by subtracting one hour.
function m(id, date, time, group, home, hc, away, ac, venue, channel) {
  const [h, min] = time.split(':').map(Number);
  const utc = new Date(`${date}T${time}:00+01:00`).toISOString();
  return {
    id: String(id),
    utcDate: utc,
    group,
    status: 'TIMED',
    homeTeam: { name: home, code: hc },
    awayTeam: { name: away, code: ac },
    venue,
    channel: channel || null,
  };
}

export const groupMatches = [
  // Group A
  m(1, '2026-06-11', '20:00', 'Group A', 'Mexico', 'mx', 'South Africa', 'za', 'Estadio Azteca, Mexico City', 'ITV1'),
  m(2, '2026-06-12', '03:00', 'Group A', 'South Korea', 'kr', 'Czechia', 'cz', 'Guadalajara', 'ITV1'),
  m(3, '2026-06-18', '17:00', 'Group A', 'Czechia', 'cz', 'South Africa', 'za', 'Atlanta', 'BBC One'),
  m(4, '2026-06-19', '02:00', 'Group A', 'Mexico', 'mx', 'South Korea', 'kr', 'Guadalajara', 'BBC One'),
  m(5, '2026-06-25', '02:00', 'Group A', 'Czechia', 'cz', 'Mexico', 'mx', 'Estadio Azteca, Mexico City', 'BBC One'),
  m(6, '2026-06-25', '02:00', 'Group A', 'South Africa', 'za', 'South Korea', 'kr', 'Monterrey', 'BBC Two'),

  // Group B
  m(7, '2026-06-12', '20:00', 'Group B', 'Canada', 'ca', 'Bosnia and Herzegovina', 'ba', 'BMO Field, Toronto', 'BBC One'),
  m(8, '2026-06-13', '20:00', 'Group B', 'Qatar', 'qa', 'Switzerland', 'ch', 'San Francisco', 'ITV1'),
  m(9, '2026-06-18', '20:00', 'Group B', 'Switzerland', 'ch', 'Bosnia and Herzegovina', 'ba', 'Los Angeles', 'ITV1'),
  m(10, '2026-06-18', '23:00', 'Group B', 'Canada', 'ca', 'Qatar', 'qa', 'Vancouver', 'ITV1'),
  m(11, '2026-06-24', '20:00', 'Group B', 'Switzerland', 'ch', 'Canada', 'ca', 'Vancouver', 'ITV1'),
  m(12, '2026-06-24', '20:00', 'Group B', 'Bosnia and Herzegovina', 'ba', 'Qatar', 'qa', 'Seattle', 'ITV4'),

  // Group C
  m(13, '2026-06-13', '23:00', 'Group C', 'Brazil', 'br', 'Morocco', 'ma', 'New York / New Jersey', 'BBC One'),
  m(14, '2026-06-14', '02:00', 'Group C', 'Haiti', 'ht', 'Scotland', 'gb-sct', 'Boston', 'BBC One'),
  m(15, '2026-06-19', '23:00', 'Group C', 'Scotland', 'gb-sct', 'Morocco', 'ma', 'Boston', 'ITV1'),
  m(16, '2026-06-20', '01:30', 'Group C', 'Brazil', 'br', 'Haiti', 'ht', 'Philadelphia', 'ITV1'),
  m(17, '2026-06-24', '23:00', 'Group C', 'Scotland', 'gb-sct', 'Brazil', 'br', 'Miami', 'BBC One'),
  m(18, '2026-06-24', '23:00', 'Group C', 'Morocco', 'ma', 'Haiti', 'ht', 'Atlanta', 'BBC Two'),

  // Group D
  m(19, '2026-06-13', '02:00', 'Group D', 'United States', 'us', 'Paraguay', 'py', 'Los Angeles', 'BBC One'),
  m(20, '2026-06-13', '05:00', 'Group D', 'Australia', 'au', 'Turkiye', 'tr', 'Vancouver', 'ITV1'),
  m(21, '2026-06-19', '20:00', 'Group D', 'United States', 'us', 'Australia', 'au', 'Seattle', 'BBC One'),
  m(22, '2026-06-20', '04:00', 'Group D', 'Turkiye', 'tr', 'Paraguay', 'py', 'San Francisco', 'ITV1'),
  m(23, '2026-06-26', '03:00', 'Group D', 'Turkiye', 'tr', 'United States', 'us', 'Los Angeles', 'ITV1'),
  m(24, '2026-06-26', '03:00', 'Group D', 'Paraguay', 'py', 'Australia', 'au', 'San Francisco', 'ITV4'),

  // Group E
  m(25, '2026-06-14', '18:00', 'Group E', 'Germany', 'de', 'Curacao', 'cw', 'Houston', 'ITV1'),
  m(26, '2026-06-15', '00:00', 'Group E', 'Ivory Coast', 'ci', 'Ecuador', 'ec', 'Philadelphia', 'BBC One'),
  m(27, '2026-06-20', '21:00', 'Group E', 'Germany', 'de', 'Ivory Coast', 'ci', 'Toronto', 'ITV1'),
  m(28, '2026-06-21', '01:00', 'Group E', 'Ecuador', 'ec', 'Curacao', 'cw', 'Kansas City', 'BBC One'),
  m(29, '2026-06-25', '21:00', 'Group E', 'Ecuador', 'ec', 'Germany', 'de', 'New York / New Jersey', 'BBC One'),
  m(30, '2026-06-25', '21:00', 'Group E', 'Curacao', 'cw', 'Ivory Coast', 'ci', 'Philadelphia', 'BBC Two'),

  // Group F
  m(31, '2026-06-14', '21:00', 'Group F', 'Netherlands', 'nl', 'Japan', 'jp', 'Dallas', 'ITV1'),
  m(32, '2026-06-15', '03:00', 'Group F', 'Sweden', 'se', 'Tunisia', 'tn', 'Monterrey', 'ITV1'),
  m(33, '2026-06-20', '05:00', 'Group F', 'Tunisia', 'tn', 'Japan', 'jp', 'Monterrey', 'BBC One'),
  m(34, '2026-06-20', '18:00', 'Group F', 'Netherlands', 'nl', 'Sweden', 'se', 'Houston', 'BBC One'),
  m(35, '2026-06-26', '00:00', 'Group F', 'Japan', 'jp', 'Sweden', 'se', 'Dallas', 'BBC Two'),
  m(36, '2026-06-26', '00:00', 'Group F', 'Tunisia', 'tn', 'Netherlands', 'nl', 'Kansas City', 'BBC One'),

  // Group G
  m(37, '2026-06-15', '20:00', 'Group G', 'Belgium', 'be', 'Egypt', 'eg', 'Seattle', 'BBC One'),
  m(38, '2026-06-16', '02:00', 'Group G', 'Iran', 'ir', 'New Zealand', 'nz', 'Los Angeles', 'BBC One'),
  m(39, '2026-06-21', '20:00', 'Group G', 'Belgium', 'be', 'Iran', 'ir', 'Los Angeles', 'ITV1'),
  m(40, '2026-06-22', '02:00', 'Group G', 'New Zealand', 'nz', 'Egypt', 'eg', 'Vancouver', 'ITV1'),
  m(41, '2026-06-27', '04:00', 'Group G', 'Egypt', 'eg', 'Iran', 'ir', 'Seattle', 'BBC Two'),
  m(42, '2026-06-27', '04:00', 'Group G', 'New Zealand', 'nz', 'Belgium', 'be', 'Vancouver', 'BBC One'),

  // Group H
  m(43, '2026-06-15', '17:00', 'Group H', 'Spain', 'es', 'Cape Verde', 'cv', 'Atlanta', 'ITV1'),
  m(44, '2026-06-15', '23:00', 'Group H', 'Saudi Arabia', 'sa', 'Uruguay', 'uy', 'Miami', 'ITV1'),
  m(45, '2026-06-21', '17:00', 'Group H', 'Spain', 'es', 'Saudi Arabia', 'sa', 'Atlanta', 'BBC One'),
  m(46, '2026-06-21', '23:00', 'Group H', 'Uruguay', 'uy', 'Cape Verde', 'cv', 'Miami', 'BBC One'),
  m(47, '2026-06-27', '01:00', 'Group H', 'Cape Verde', 'cv', 'Saudi Arabia', 'sa', 'Houston', 'ITV4'),
  m(48, '2026-06-27', '01:00', 'Group H', 'Uruguay', 'uy', 'Spain', 'es', 'Guadalajara', 'ITV1'),

  // Group I
  m(49, '2026-06-16', '20:00', 'Group I', 'France', 'fr', 'Senegal', 'sn', 'New York / New Jersey', 'BBC One'),
  m(50, '2026-06-16', '23:00', 'Group I', 'Iraq', 'iq', 'Norway', 'no', 'Boston', 'BBC One'),
  m(51, '2026-06-22', '22:00', 'Group I', 'France', 'fr', 'Iraq', 'iq', 'Philadelphia', 'BBC One'),
  m(52, '2026-06-23', '01:00', 'Group I', 'Norway', 'no', 'Senegal', 'sn', 'New York / New Jersey', 'ITV1'),
  m(53, '2026-06-26', '20:00', 'Group I', 'Norway', 'no', 'France', 'fr', 'Boston', 'ITV1'),
  m(54, '2026-06-26', '20:00', 'Group I', 'Senegal', 'sn', 'Iraq', 'iq', 'Toronto', 'ITV4'),

  // Group J
  m(55, '2026-06-16', '05:00', 'Group J', 'Austria', 'at', 'Jordan', 'jo', 'San Francisco', 'BBC One'),
  m(56, '2026-06-17', '02:00', 'Group J', 'Argentina', 'ar', 'Algeria', 'dz', 'Kansas City', 'ITV1'),
  m(57, '2026-06-22', '18:00', 'Group J', 'Argentina', 'ar', 'Austria', 'at', 'Dallas', 'BBC One'),
  m(58, '2026-06-23', '04:00', 'Group J', 'Jordan', 'jo', 'Algeria', 'dz', 'San Francisco', 'ITV1'),
  m(59, '2026-06-28', '03:00', 'Group J', 'Algeria', 'dz', 'Austria', 'at', 'Kansas City', 'BBC Two'),
  m(60, '2026-06-28', '03:00', 'Group J', 'Jordan', 'jo', 'Argentina', 'ar', 'Dallas', 'BBC One'),

  // Group K
  m(61, '2026-06-17', '18:00', 'Group K', 'Portugal', 'pt', 'DR Congo', 'cd', 'Houston', 'BBC One'),
  m(62, '2026-06-18', '03:00', 'Group K', 'Uzbekistan', 'uz', 'Colombia', 'co', 'Estadio Azteca, Mexico City', 'BBC One'),
  m(63, '2026-06-23', '18:00', 'Group K', 'Portugal', 'pt', 'Uzbekistan', 'uz', 'Houston', 'ITV1'),
  m(64, '2026-06-24', '03:00', 'Group K', 'Colombia', 'co', 'DR Congo', 'cd', 'Guadalajara', 'ITV1'),
  m(65, '2026-06-28', '00:30', 'Group K', 'Colombia', 'co', 'Portugal', 'pt', 'Miami', 'BBC One'),
  m(66, '2026-06-28', '00:30', 'Group K', 'DR Congo', 'cd', 'Uzbekistan', 'uz', 'Atlanta', 'BBC Two'),

  // Group L
  m(67, '2026-06-17', '21:00', 'Group L', 'England', 'gb-eng', 'Croatia', 'hr', 'Dallas', 'ITV1'),
  m(68, '2026-06-18', '00:00', 'Group L', 'Ghana', 'gh', 'Panama', 'pa', 'Toronto', 'ITV1'),
  m(69, '2026-06-23', '21:00', 'Group L', 'England', 'gb-eng', 'Ghana', 'gh', 'Boston', 'BBC One'),
  m(70, '2026-06-24', '00:00', 'Group L', 'Panama', 'pa', 'Croatia', 'hr', 'Toronto', 'BBC One'),
  m(71, '2026-06-27', '22:00', 'Group L', 'Panama', 'pa', 'England', 'gb-eng', 'New York / New Jersey', 'ITV1'),
  m(72, '2026-06-27', '22:00', 'Group L', 'Croatia', 'hr', 'Ghana', 'gh', 'Philadelphia', 'ITV4'),
];

// ---------------------------------------------------------------------------
// Knockout placeholders (fallback only — used when no API key is set). Teams are
// unknown until the group stage ends, so we show bracket-style participants like
// other listings sites do. Channels are left null ("TBC") because the BBC/ITV
// split is decided match-by-match, not per round; with the live feed the real
// confirmed channels come from KNOCKOUT_CHANNELS above. Only the Final's
// simulcast is fixed in advance.
// ---------------------------------------------------------------------------
function ko(id, date, time, stage, home, away, venue, channel) {
  return {
    id: String(id),
    utcDate: new Date(`${date}T${time}:00+01:00`).toISOString(),
    group: stage,
    status: 'SCHEDULED',
    homeTeam: { name: home, code: null },
    awayTeam: { name: away, code: null },
    venue,
    channel,
    tbc: true,
  };
}

export const knockoutMatches = [
  // Round of 32 — channel TBC (confirmed split lives in KNOCKOUT_CHANNELS).
  ...['1A v 3(C/D/F/G/H)', '1C v 1F', '1E v 2(A/B/C/D)', '1G v 2(A/E/H/I)',
      '1I v 2L', '1K v 2(E/H/I/J)', '2B v 2J', '2D v 2K',
      '1B v 3(E/F/G/I/J)', '1D v 2F', '1F v 2C', '1H v 2(B/E/F/I)',
      '1J v 2H', '1L v 2(C/D/F/G)', '2A v 2I', '1(A…) v 3(…)'].map((slot, i) =>
    ko(100 + i, ['2026-06-28','2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03'][i % 6], '20:00',
       'Round of 32', `Winner / Runner-up`, slot, 'Knockout venue — TBD', null)),

  // Round of 16 — channel TBC
  ...Array.from({ length: 8 }, (_, i) =>
    ko(120 + i, ['2026-07-04','2026-07-04','2026-07-05','2026-07-05','2026-07-06','2026-07-06','2026-07-07','2026-07-07'][i], '20:00',
       'Round of 16', `Winner R32 (${i * 2 + 1})`, `Winner R32 (${i * 2 + 2})`, 'Knockout venue — TBD', null)),

  // Quarter-finals — channel TBC
  ...Array.from({ length: 4 }, (_, i) =>
    ko(140 + i, ['2026-07-09','2026-07-10','2026-07-10','2026-07-11'][i], '20:00',
       'Quarter-final', `Winner R16 (${i * 2 + 1})`, `Winner R16 (${i * 2 + 2})`, 'Knockout venue — TBD', null)),

  // Semi-finals — channel TBC
  ko(160, '2026-07-14', '20:00', 'Semi-final', 'Winner QF1', 'Winner QF2', 'Dallas', null),
  ko(161, '2026-07-15', '20:00', 'Semi-final', 'Winner QF3', 'Winner QF4', 'Atlanta', null),

  // Third-place play-off — channel TBC
  ko(162, '2026-07-18', '20:00', 'Third-place play-off', 'Loser SF1', 'Loser SF2', 'Miami', null),

  // Final (19 Jul) — confirmed BBC One + ITV1 simulcast
  ko(163, '2026-07-19', '20:00', 'Final', 'Winner SF1', 'Winner SF2', 'MetLife Stadium, New York / New Jersey', 'BBC & ITV'),
];

export const fallbackMatches = [...groupMatches, ...knockoutMatches];

// The live API spells some teams differently (Türkiye/Turkey, Curaçao/Curacao,
// Bosnia-Herzegovina, Cape Verde Islands, Congo DR…). Normalise names so the
// channel/venue lookup matches regardless of spelling, accents or punctuation.
const ALIASES = {
  bosniaherzegovina: 'bosniaandherzegovina',
  turkey: 'turkiye',
  capeverdeislands: 'capeverde',
  congodr: 'drcongo',
  korearepublic: 'southkorea',
  republicofkorea: 'southkorea',
  czechrepublic: 'czechia',
  cotedivoire: 'ivorycoast',
  iriran: 'iran',
  usa: 'unitedstates',
  unitedstatesofamerica: 'unitedstates',
};
function norm(name) {
  const base = (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase().replace(/[^a-z0-9]/g, '');          // strip spaces/punctuation
  return ALIASES[base] || base;
}
function teamKey(home, away) {
  return `${norm(home)}|${norm(away)}`;
}

// Per-match channel + venue indexes keyed by normalised team pair. The free API
// tier never includes UK TV listings (and often omits venues), so we backfill
// both from the bundled schedule.
const channelIndex = Object.fromEntries(
  fallbackMatches.map((mt) => [teamKey(mt.homeTeam.name, mt.awayTeam.name), mt.channel])
);
const venueIndex = Object.fromEntries(
  groupMatches.map((mt) => [teamKey(mt.homeTeam.name, mt.awayTeam.name), mt.venue])
);

export function channelForTeams(home, away) {
  return channelIndex[teamKey(home, away)] || channelIndex[teamKey(away, home)] || null;
}
export function venueForTeams(home, away) {
  return venueIndex[teamKey(home, away)] || venueIndex[teamKey(away, home)] || null;
}

// Confirmed UK broadcaster for knockout ties. There is no per-round rule — the
// BBC/ITV split is decided match-by-match and announced as the bracket fills, so
// each tie is listed explicitly. Add rounds here as BBC/ITV confirm them.
//
// Each entry carries BOTH the kickoff time AND (once known) the team pair. We key
// the lookup on the TEAM PAIR first and fall back to the time, because
// football-data.org shifts kickoff times once teams are locked in — e.g. the
// Mexico v Ecuador R32 tie moved 01:00→02:00Z and silently lost its channel under
// the old time-only key. Team pairs don't drift, so they're the stable join key.
//
// Semi-finals, the third-place play-off and (team-wise) the Final are NOT listed:
// their broadcasters aren't announced yet, so they render as "TBC" rather than a
// wrong guess. The Final's simulcast is fixed in advance so it's kept by time.
// Sources: BBC/ITV joint R32 announcement + R16/QF selections (Broadcast, TVZone
// UK, Yahoo Sport, live-footballontv, 101GreatGoals), cross-checked vs the feed.
const KNOCKOUT_CHANNEL_LIST = [
  // Round of 32 — jointly announced, 8 BBC One / 8 ITV1.
  { utc: '2026-06-28T19:00:00Z', home: 'South Africa',  away: 'Canada',                  channel: 'ITV1' },
  { utc: '2026-06-29T17:00:00Z', home: 'Brazil',        away: 'Japan',                   channel: 'ITV1' },
  { utc: '2026-06-29T20:30:00Z', home: 'Germany',       away: 'Paraguay',                channel: 'BBC One' },
  { utc: '2026-06-30T01:00:00Z', home: 'Netherlands',   away: 'Morocco',                 channel: 'ITV1' },
  { utc: '2026-06-30T17:00:00Z', home: 'Ivory Coast',   away: 'Norway',                  channel: 'BBC One' },
  { utc: '2026-06-30T21:00:00Z', home: 'France',        away: 'Sweden',                  channel: 'ITV1' },
  { utc: '2026-07-01T02:00:00Z', home: 'Mexico',        away: 'Ecuador',                 channel: 'ITV1' },
  { utc: '2026-07-01T16:00:00Z', home: 'England',       away: 'DR Congo',                channel: 'BBC One' },
  { utc: '2026-07-01T20:00:00Z', home: 'Belgium',       away: 'Senegal',                 channel: 'ITV1' },
  { utc: '2026-07-02T00:00:00Z', home: 'United States', away: 'Bosnia and Herzegovina',  channel: 'BBC One' },
  { utc: '2026-07-02T19:00:00Z', home: 'Spain',         away: 'Austria',                 channel: 'BBC One' },
  { utc: '2026-07-02T23:00:00Z', home: 'Portugal',      away: 'Croatia',                 channel: 'BBC One' },
  { utc: '2026-07-03T03:00:00Z', home: 'Switzerland',   away: 'Algeria',                 channel: 'BBC One' },
  { utc: '2026-07-03T18:00:00Z', home: 'Australia',     away: 'Egypt',                   channel: 'BBC One' },
  { utc: '2026-07-03T22:00:00Z', home: 'Argentina',     away: 'Cape Verde',              channel: 'ITV1' },
  { utc: '2026-07-04T01:30:00Z', home: 'Colombia',      away: 'Ghana',                   channel: 'ITV1' },

  // Round of 16 — 4 BBC One / 4 ITV1.
  { utc: '2026-07-04T17:00:00Z', home: 'Canada',        away: 'Morocco',                 channel: 'ITV1' },
  { utc: '2026-07-04T21:00:00Z', home: 'Paraguay',      away: 'France',                  channel: 'BBC One' },
  { utc: '2026-07-05T20:00:00Z', home: 'Brazil',        away: 'Norway',                  channel: 'ITV1' },
  { utc: '2026-07-06T01:00:00Z', home: 'Mexico',        away: 'England',                 channel: 'BBC One' },
  { utc: '2026-07-06T19:00:00Z', home: 'Portugal',      away: 'Spain',                   channel: 'BBC One' },
  { utc: '2026-07-07T00:00:00Z', home: 'United States', away: 'Belgium',                 channel: 'BBC One' },
  { utc: '2026-07-07T16:00:00Z', home: 'Argentina',     away: 'Egypt',                   channel: 'ITV1' },
  { utc: '2026-07-07T20:00:00Z', home: 'Switzerland',   away: 'Colombia',                channel: 'ITV1' },

  // Quarter-finals — 1 BBC One / 3 ITV1.
  { utc: '2026-07-09T20:00:00Z', home: 'France',        away: 'Morocco',                 channel: 'ITV1' },
  { utc: '2026-07-10T19:00:00Z', home: 'Spain',         away: 'Belgium',                 channel: 'BBC One' },
  { utc: '2026-07-11T21:00:00Z', home: 'Norway',        away: 'England',                 channel: 'ITV1' },
  { utc: '2026-07-12T01:00:00Z', home: 'Argentina',     away: 'Switzerland',             channel: 'ITV1' },

  // Final — BBC One + ITV1 simulcast (teams TBD until the semis finish).
  { utc: '2026-07-19T19:00:00Z',                                                         channel: 'BBC & ITV' },
];

const knockoutChannelByTime = Object.fromEntries(
  KNOCKOUT_CHANNEL_LIST.map((e) => [e.utc, e.channel])
);
const knockoutChannelByTeams = Object.fromEntries(
  KNOCKOUT_CHANNEL_LIST.filter((e) => e.home && e.away).map((e) => [teamKey(e.home, e.away), e.channel])
);

// Prefer the team pair (drift-proof), fall back to the kickoff time.
export function knockoutChannelForTeams(home, away) {
  if (!home || !away) return null;
  return knockoutChannelByTeams[teamKey(home, away)] || knockoutChannelByTeams[teamKey(away, home)] || null;
}
export function knockoutChannelForDate(utcDate) {
  return knockoutChannelByTime[utcDate] || null;
}

// Flag URL helper shared with the server.
export function flagUrl(code) {
  if (!code) return null;
  return `https://flagcdn.com/h60/${code.toLowerCase()}.png`;
}

// Placeholder standings derived from the bundled fixtures (all stats zero) so
// group tables render before any results exist. Live data overrides this when
// an API key is set.
export function placeholderStandings() {
  const groups = {};
  for (const m of groupMatches) {
    const g = m.group;
    groups[g] ||= new Map();
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!groups[g].has(t.name)) {
        groups[g].set(t.name, {
          name: t.name,
          crest: flagUrl(t.code),
          played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
        });
      }
    }
  }
  return Object.entries(groups).map(([group, teams]) => ({
    group,
    table: [...teams.values()].map((t, i) => ({ pos: i + 1, ...t })),
  }));
}
