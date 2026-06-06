# SportsTV ⚽ — World Cup 2026

A slick, minimalist match guide for the FIFA World Cup 2026. Shows every kickoff in **UK, Bangkok and Bali** time (plus your own local time), which **UK channel** (BBC / ITV) each game is on, country flags, live group tables, and per-match "add to calendar".

Inspired by wheresthematch.com — but cleaner, dark-navy + gold, and World-Cup-only.

## Features

- **3 timezones + auto local** — UK / Bangkok / Bali, DST-correct (computed via `Intl`).
- **UK broadcaster per match** — BBC One/Two & ITV1/4, from the published 52/52 split. Unconfirmed games show **TBC**.
- **Flags & channel badges** — flag images per country, colour-coded channel chips.
- **Live group tables** — auto-refresh standings (live with an API key; placeholder otherwise).
- **Knockout placeholders** — bracket slots shown until teams are drawn, then auto-filled from the live API.
- **Live / Today / Upcoming / Finished** status badges, group/day filters, team search, `.ics` calendar export.

## Run locally

```bash
npm install
cp .env.example .env      # optional: add a free API key for live data
npm start                 # → http://localhost:3000
```

Without an API key the site serves the **bundled official schedule** (real fixtures, times and broadcasters) and placeholder group tables — fully usable offline.

## Live data (optional)

Get a free key at <https://www.football-data.org/client/register> (free tier includes the World Cup, competition code `WC`). Put it in `.env`:

```
FOOTBALL_DATA_API_KEY=your_key_here
```

With a key, the server proxies live **scores, knockout teams and group tables** and caches them (`CACHE_TTL_SECONDS`, default 300s) to stay within rate limits.

### Will knockout teams update automatically?

Yes — on a running server (e.g. Railway) with an API key set, the proxy re-fetches the upstream every cache interval. Once FIFA enters the drawn knockout fixtures, they replace the bundled placeholders automatically with no redeploy.

## Deploy to Railway

1. Push this repo to GitHub (already wired).
2. On Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. Add a variable `FOOTBALL_DATA_API_KEY` in the Railway **Variables** tab (not in code).
4. Railway runs `npm start` and assigns `PORT` automatically — the server reads `process.env.PORT`.

## Security / safety

- **No secrets in git.** The API key lives only in `.env` (gitignored) or Railway Variables. `.env.example` ships with an empty placeholder.
- The key is used **server-side only** — the browser calls our `/api/*` proxy, never football-data directly, so the key is never exposed to clients (and CORS is avoided).
- Upstream responses are cached to avoid rate-limit abuse.

## Editing the schedule / broadcasters

Everything lives in [`data/channels.js`](data/channels.js): group fixtures, knockout placeholders, and the UK channel per match. Set a match's channel to `null` for **TBC**.

> UK broadcaster listings are indicative and based on the announced BBC/ITV split; confirm against official listings closer to each match.
