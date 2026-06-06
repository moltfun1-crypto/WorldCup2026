import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { channelForTeams, venueForTeams, fallbackMatches, placeholderStandings } from './data/channels.js';

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

// Normalise an upstream (or fallback) match into the shape the frontend wants.
// UK channel for a knockout match, from the announced round allocation:
// Round of 32, Round of 16 & Semi-finals → BBC; Quarter-finals → ITV;
// Third-place play-off → BBC; Final → BBC & ITV simulcast.
function stageChannel(stageRaw) {
  const s = (stageRaw || '').toUpperCase();
  if (!s || s.includes('GROUP')) return null;
  if (s.includes('QUARTER')) return 'ITV1';
  if (s.includes('THIRD')) return 'BBC One';
  if (s.includes('FINAL')) return s.includes('SEMI') ? 'BBC One' : 'BBC & ITV';
  if (s.includes('SEMI')) return 'BBC One';
  return 'BBC One'; // Round of 32 / Round of 16 / Last 16 etc.
}

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
    // Free API tier omits venue — backfill from bundled schedule by teams.
    venue: match.venue || venueForTeams(home, away),
    // Prefer the channel baked into bundled data; otherwise look up by teams;
    // for knockout fixtures fall back to the round-based allocation.
    channel: match.channel || channelForTeams(home, away) || stageChannel(match.stage || match.group),
    source,
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
