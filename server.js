import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { channelForTeams, venueForTeams, knockoutChannelForDate, fallbackMatches, placeholderStandings } from './data/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const CACHE_TTL = (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000;
const UPSTREAM = 'https://api.football-data.org/v4/competitions/WC/matches';
const UPSTREAM_STANDINGS = 'https://api.football-data.org/v4/competitions/WC/standings';

app.use(express.static(path.join(__dirname, 'public')));

let cache = { at: 0, data: null };
let standingsCache = { at: 0, data: null };

// "GROUP_L" → "Group L", "LAST_16" → "Last 16", "QUARTER_FINALS" → "Quarter Finals".
function prettyStage(raw) {
  if (!raw) return null;
  if (raw.includes(' ')) return raw; // already pretty (bundled data)
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shape(match, source) {
  const home = match.homeTeam?.name || 'TBD';
  const away = match.awayTeam?.name || 'TBD';
  return {
    id: String(match.id),
    utcDate: match.utcDate,
    group: prettyStage(match.group || match.stage || null),
    status: match.status,
    tbc: Boolean(match.tbc),
    home: {
      name: home,
      // football-data gives a crest URL; bundled data gives a flag code.
      crest: match.homeTeam?.crest || flagUrl(match.homeTeam?.code),
    },
    away: {
      name: away,
      crest: match.awayTeam?.crest || flagUrl(match.awayTeam?.code),
    },
    // Live/final score (null before kickoff). football-data keeps the running
    // score in score.fullTime during play and after full time — but for a tie
    // settled on penalties it FOLDS THE SHOOTOUT INTO fullTime (e.g. a 1–1 a.e.t.
    // tie won 3–2 on pens arrives as fullTime 4–3). scoreOf() peels the shootout
    // back out so .home/.away is the goals (after-extra-time) score and exposes
    // the penalties separately for the UI.
    score: scoreOf(match.score),
    // Free API tier omits venue — backfill from bundled schedule by teams.
    venue: match.venue || venueForTeams(home, away),
    // Prefer the channel baked into bundled data; otherwise look up group ties by
    // teams, and knockout ties by kickoff time (only R32 + Final are confirmed —
    // everything else stays null → "TBC" rather than a fabricated guess).
    channel: match.channel || channelForTeams(home, away) || knockoutChannelForDate(match.utcDate),
    source,
  };
}

// Normalise football-data's score block. For penalty ties fullTime includes the
// shootout, so subtract penalties back out to get the goal (a.e.t.) score, and
// surface penalties / duration / winner so the UI can show "1–1 · pens 3–4" and
// still highlight the side that actually advanced when goals are level.
function scoreOf(s) {
  const ft = s?.fullTime || {};
  const pk = s?.penalties;
  const hasPk = pk && pk.home != null;
  return {
    home: ft.home != null ? (hasPk ? ft.home - pk.home : ft.home) : null,
    away: ft.away != null ? (hasPk ? ft.away - pk.away : ft.away) : null,
    penalties: hasPk ? { home: pk.home, away: pk.away } : null,
    duration: s?.duration || null, // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    winner: s?.winner || null,     // HOME_TEAM | AWAY_TEAM | DRAW | null
  };
}

function flagUrl(code) {
  if (!code || code === 'un') return null;
  return `https://flagcdn.com/h60/${code.toLowerCase()}.png`;
}

async function getMatches() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL) return cache.data;

  if (API_KEY) {
    try {
      const res = await fetch(UPSTREAM, { headers: { 'X-Auth-Token': API_KEY } });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const json = await res.json();
      const data = (json.matches || []).map((mt) => shape(mt, 'api'));
      cache = { at: Date.now(), data };
      return data;
    } catch (err) {
      console.warn('[SportsTV] upstream failed, using fallback:', err.message);
    }
  }

  const data = fallbackMatches.map((mt) => shape(mt, 'fallback'));
  cache = { at: Date.now(), data };
  return data;
}

async function getStandings() {
  if (standingsCache.data && Date.now() - standingsCache.at < CACHE_TTL) return standingsCache.data;

  if (API_KEY) {
    try {
      const res = await fetch(UPSTREAM_STANDINGS, { headers: { 'X-Auth-Token': API_KEY } });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const json = await res.json();
      const data = (json.standings || [])
        .filter((s) => s.type === 'TOTAL')
        .map((s) => ({
          group: (s.group || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          table: (s.table || []).map((row) => ({
            pos: row.position,
            name: row.team?.name,
            crest: row.team?.crest,
            played: row.playedGames,
            won: row.won,
            draw: row.draw,
            lost: row.lost,
            gf: row.goalsFor,
            ga: row.goalsAgainst,
            gd: row.goalDifference,
            points: row.points,
          })),
        }));
      if (data.length) {
        standingsCache = { at: Date.now(), data: { source: 'api', groups: data } };
        return standingsCache.data;
      }
    } catch (err) {
      console.warn('[SportsTV] standings upstream failed, using placeholder:', err.message);
    }
  }

  const data = { source: 'fallback', groups: placeholderStandings() };
  standingsCache = { at: Date.now(), data };
  return data;
}

app.get('/api/matches', async (_req, res) => {
  try {
    const matches = await getMatches();
    res.json({ count: matches.length, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/standings', async (_req, res) => {
  try {
    res.json(await getStandings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SportsTV running → http://localhost:${PORT}`);
  if (!API_KEY) console.log('No FOOTBALL_DATA_API_KEY set — serving fallback fixtures.');
});
