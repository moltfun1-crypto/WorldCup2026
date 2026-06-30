// SportsTV frontend — fetches matches from the local proxy and renders them
// with kickoff times in UK / Koh Phangan / Bali (+ the visitor's own nation).

const ZONES = [
  { key: 'phangan', label: 'Koh Phangan', tz: 'Asia/Bangkok' }, // ICT, UTC+7
  { key: 'bali', label: 'Bali', tz: 'Asia/Makassar' }, // WITA, UTC+8
  { key: 'uk', label: 'UK', tz: 'Europe/London' },
];

// --- Where is the visitor? Resolve their nation for the "local" (gold) row. ---
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Curated timezone → ISO country map (covers common zones; falls back to locale).
const TZ_COUNTRY = {
  'Europe/London': 'GB', 'Asia/Bangkok': 'TH', 'Asia/Makassar': 'ID', 'Asia/Jakarta': 'ID',
  'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Berlin': 'DE',
  'Europe/Amsterdam': 'NL', 'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Brussels': 'BE',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX',
  'Australia/Sydney': 'AU', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE', 'Asia/Kolkata': 'IN',
  'Asia/Tokyo': 'JP', 'Asia/Hong_Kong': 'HK', 'Asia/Kuala_Lumpur': 'MY', 'Pacific/Auckland': 'NZ',
};
const localNation = (() => {
  let code = TZ_COUNTRY[localTz];
  if (!code) {
    try { code = new Intl.Locale(navigator.language).maximize().region; } catch {}
  }
  let name = (localTz.split('/').pop() || 'Local').replace(/_/g, ' ');
  if (code) {
    try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || name; } catch {}
  }
  return { code: code ? code.toLowerCase() : null, name, tz: localTz };
})();
const localZone = { key: 'local', label: localNation.name, tz: localTz, local: true, code: localNation.code };
const UK_ZONE = ZONES.find((z) => z.key === 'uk');

// Compact mode shows only "Your Time" + UK; full mode shows all four zones.
const COMPACT_KEY = 'stv:compact';
let compact = localStorage.getItem(COMPACT_KEY) === '1';
function activeZones() {
  return compact ? [localZone, UK_ZONE] : [...ZONES, localZone];
}

// Favourite nations (persisted in localStorage).
const FAV_KEY = 'stv:favourites';
const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
function saveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); }

// Whether the collapsed "Finished" section is expanded (persisted).
const FINISHED_OPEN_KEY = 'stv:finishedOpen';
// Whether the collapsed knockout-bracket panel is expanded (persisted).
const BRACKET_OPEN_KEY = 'stv:bracketOpen';

const state = { matches: [], standings: [], nation: 'all', group: 'all', day: 'all', search: '' };
const el = (sel) => document.querySelector(sel);

init();

async function init() {
  document.body.classList.add('view-fixtures');
  renderLegend();
  await loadMatches(true);
  bindControls();
  loadStandings();
  setInterval(loadMatches, 60_000); // re-fetch so scores + Live/Finished update
  setInterval(loadStandings, 120_000);
  setInterval(tick, 1_000); // live-ticking countdowns
}

// Switch between Fixtures and Group Tables (used on mobile; both show on desktop).
function setView(view) {
  document.body.classList.toggle('view-tables', view === 'tables');
  document.body.classList.toggle('view-fixtures', view !== 'tables');
  document.querySelectorAll('.view-tab').forEach((t) =>
    t.setAttribute('aria-selected', String(t.dataset.view === view))
  );
}

// Fetch the match list and re-render. On the first load it also builds the
// filters and shows the data-source note; later refreshes keep filters intact.
async function loadMatches(initial = false) {
  try {
    const res = await fetch('/api/matches');
    const json = await res.json();
    state.matches = (json.matches || []).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    if (initial && state.matches[0]?.source === 'fallback') {
      const note = el('#sourceNote');
      note.hidden = false;
      note.textContent = 'Showing the bundled official schedule. Add a football-data.org API key for live scores & knockout teams.';
    }
  } catch {
    if (initial) {
      el('#sourceNote').hidden = false;
      el('#sourceNote').textContent = 'Could not load matches. Is the server running?';
    }
    return;
  }
  if (initial) buildFilters();
  render();
}

async function loadStandings() {
  try {
    const res = await fetch('/api/standings');
    const json = await res.json();
    state.standings = json.groups || [];
    renderStandings(state.standings);
    render(); // group results may now resolve fixtures + bracket slots to real teams
  } catch { /* keep previous */ }
}

// Teams whose top-two (knockout) qualification is mathematically secured. The
// check is conservative — it assumes a team takes 0 from its remaining games
// while every rival wins all of theirs (rivals also meet each other, so this
// can never flag a team that isn't truly through). Once the group is complete
// the feed's final order has already settled tiebreaks, so the top two are in
// outright. (Best-third-place qualifiers span groups — see knockoutQualifiers.)
function qualifiedNames(g) {
  const rows = g.table || [];
  if (rows.length < 2) return new Set();
  const perTeam = rows.length - 1; // round-robin games per team (3 in a 4-team group)
  const out = new Set();
  if (rows.every((r) => r.played >= perTeam)) {
    rows.filter((r) => r.pos <= 2 && !isPlaceholder(r.name)).forEach((r) => out.add(r.name));
    return out;
  }
  for (const x of rows) {
    if (isPlaceholder(x.name)) continue;
    // Worst case for x: 0 more points; each rival reaches its theoretical max.
    const threats = rows.filter((y) => y !== x && y.points + 3 * (perTeam - y.played) >= x.points).length;
    if (threats <= 1) out.add(x.name);
  }
  return out;
}

// Combine every group's confirmed qualifiers into one name set: each group's
// secured top-two (see qualifiedNames) plus — once the whole group stage is
// done — the eight best third-placed teams.
function knockoutQualifiers(groups) {
  const out = new Set();
  for (const g of groups) qualifiedNames(g).forEach((n) => out.add(n));

  // Best third-placed teams (2026 format: 12 groups, the top 8 thirds advance).
  // Only computed once EVERY group is complete — the final group matchday —
  // because all twelve third-placed teams must be known before they can be ranked.
  // Order: points, then goal difference, then goals scored. Conservative at the
  // 8/9 cut-off: a team level on all three with a rival just outside the eight
  // isn't marked until the order is unambiguous (FIFA settles that on fair-play
  // points / drawing of lots, which the feed doesn't expose).
  const allComplete = groups.length === 12 &&
    groups.every((g) => (g.table || []).length >= 4 && g.table.every((r) => r.played >= g.table.length - 1));
  if (allComplete) {
    const thirds = groups
      .map((g) => g.table.find((r) => r.pos === 3))
      .filter((r) => r && !isPlaceholder(r.name));
    const cmp = (a, b) => (a.points - b.points) || ((a.gd || 0) - (b.gd || 0)) || ((a.gf || 0) - (b.gf || 0));
    for (const t of thirds) {
      // How many thirds could rank above t (strictly better, or level and thus
      // separable only by criteria we can't see)? Fewer than 8 ⇒ t is in for sure.
      const couldRankAbove = thirds.filter((s) => s !== t && cmp(s, t) >= 0).length;
      if (couldRankAbove < 8) out.add(t.name);
    }
  }
  return out;
}

function renderStandings(groups) {
  const through = knockoutQualifiers(groups); // one set across all groups, recomputed each refresh → live
  el('#standings').innerHTML = groups
    .map((g) => {
      return `<div class="group-table">
        <h3>${g.group}</h3>
        <table>
          <thead><tr><th></th><th class="tl">Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
          <tbody>
            ${g.table
              .map((r, i) => {
                const fav = favs.has(r.name);
                const q = through.has(r.name);
                // Real nations are clickable to filter the fixtures; placeholders aren't.
                const name = isPlaceholder(r.name)
                  ? `<span>${r.name}</span>`
                  : `<span class="team-name team-link" data-filter="${r.name}" role="button" tabindex="0" title="Show ${r.name} fixtures">${fav ? '★ ' : ''}${r.name}</span>`;
                return `<tr class="${i < 2 ? 'qualify' : ''} ${q ? 'clinched' : ''} ${fav ? 'fav' : ''}">
                  <td class="pos">${r.pos}</td>
                  <td class="tl team-cell">
                    ${r.crest ? `<img src="${r.crest}" alt="" loading="lazy" />` : '<span class="placeholder"></span>'}
                    ${name}
                    ${q ? '<b class="q-badge" title="Qualified for the knockout stage">Q</b>' : ''}
                  </td>
                  <td>${r.played}</td>
                  <td>${r.gd > 0 ? '+' + r.gd : r.gd}</td>
                  <td class="pts">${r.points}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;
    })
    .join('');
}

function renderLegend() {
  const zones = activeZones();
  el('#zonesLegend').innerHTML = zones
    .map((z) => {
      const flag = z.local && z.code ? `<img class="zone-flag" src="https://flagcdn.com/h20/${z.code}.png" alt="" />` : '';
      return `<span class="zone-chip ${z.local ? 'local' : ''}">${flag}<b>${z.label}</b> ${tzAbbr(z.tz)}</span>`;
    })
    .join('');
}

// --- Filters (dropdowns) ----------------------------------------------------
function buildFilters() {
  const nations = [...new Set(
    state.matches.flatMap((m) => [m.home.name, m.away.name]).filter((n) => n && !isPlaceholder(n))
  )].sort();
  const favOpt = favs.size ? `<option value="__favs__">★ My favourites (${favs.size})</option>` : '';
  el('#nationFilter').innerHTML =
    `<option value="all">Nations</option>` + favOpt +
    nations.map((n) => `<option value="${n}">${n}</option>`).join('');
  el('#nationFilter').value = state.nation;

  const groups = [...new Set(state.matches.map((m) => m.group).filter(Boolean))];
  el('#groupFilter').innerHTML =
    `<option value="all">Groups</option>` + groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  el('#groupFilter').value = state.group;

  const days = [...new Set(state.matches.map((m) => dayKey(m.utcDate)))];
  el('#dayFilter').innerHTML =
    `<option value="all">Days</option>` + days.map((d) => `<option value="${d}">${fmtDayShort(d)}</option>`).join('');
  el('#dayFilter').value = state.day;
}

function isPlaceholder(name) {
  return name === 'TBD' || /winner|runner|loser|\bv\b|\//i.test(name);
}

function bindControls() {
  el('#search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); render(); });
  el('#nationFilter').addEventListener('change', (e) => { state.nation = e.target.value; render(); });
  el('#groupFilter').addEventListener('change', (e) => { state.group = e.target.value; render(); });
  el('#dayFilter').addEventListener('change', (e) => { state.day = e.target.value; render(); });

  // Compact-times toggle.
  const ct = el('#compactToggle');
  ct.setAttribute('aria-pressed', String(compact));
  ct.addEventListener('click', () => {
    compact = !compact;
    localStorage.setItem(COMPACT_KEY, compact ? '1' : '0');
    ct.setAttribute('aria-pressed', String(compact));
    renderLegend();
    render();
  });

  // Delegated clicks inside the match list: star toggle, or click a nation name
  // to filter to its fixtures.
  el('#matchList').addEventListener('click', (e) => {
    const star = e.target.closest('.star');
    if (star) {
      const team = star.dataset.team;
      favs.has(team) ? favs.delete(team) : favs.add(team);
      saveFavs();
      buildFilters();
      render();
      loadStandings();
      return;
    }
    const link = e.target.closest('.team-link');
    if (link) applyNationFilter(link.dataset.filter);
  });
  el('#matchList').addEventListener('keydown', (e) => {
    const link = e.target.closest('.team-link');
    if (link && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyNationFilter(link.dataset.filter); }
  });

  // Click a nation in the group tables to see its fixtures (same as the list).
  // On mobile this also flips to the Fixtures view so the filtered list is visible.
  el('#standings').addEventListener('click', (e) => {
    const link = e.target.closest('.team-link');
    if (link) { setView('fixtures'); applyNationFilter(link.dataset.filter); }
  });
  el('#standings').addEventListener('keydown', (e) => {
    const link = e.target.closest('.team-link');
    if (link && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setView('fixtures');
      applyNationFilter(link.dataset.filter);
    }
  });

  // "Show all" clears every active filter.
  el('#filterBanner').addEventListener('click', (e) => {
    if (e.target.closest('.fb-clear')) clearFilters();
  });

  // Fixtures / Group Tables view tabs.
  document.querySelectorAll('.view-tab').forEach((t) =>
    t.addEventListener('click', () => setView(t.dataset.view))
  );

  // Knockout-bracket panel: restore + persist open state, keep the hint in sync.
  const bracket = el('#bracketSection');
  if (bracket) {
    if (localStorage.getItem(BRACKET_OPEN_KEY) === '1') bracket.open = true;
    syncBracketHint();
    bracket.addEventListener('toggle', () => {
      localStorage.setItem(BRACKET_OPEN_KEY, bracket.open ? '1' : '0');
      syncBracketHint();
    });
  }
}

function syncBracketHint() {
  const b = el('#bracketSection');
  const hint = b?.querySelector('.bs-hint');
  if (hint) hint.textContent = b.open ? 'tap to hide' : 'tap to show';
}

function applyNationFilter(nation) {
  state.nation = nation;
  el('#nationFilter').value = nation;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearFilters() {
  state.nation = 'all';
  state.group = 'all';
  state.day = 'all';
  state.search = '';
  el('#nationFilter').value = 'all';
  el('#groupFilter').value = 'all';
  el('#dayFilter').value = 'all';
  el('#search').value = '';
  render();
}

function filtered() {
  return state.matches.filter((m) => {
    // Filter on the resolved teams so a decided knockout fixture matches its real
    // nations / search terms, not the feed's lingering "TBD".
    const { home, away } = matchTeams(m);
    if (state.nation === '__favs__') {
      if (!favs.has(home.name) && !favs.has(away.name)) return false;
    } else if (state.nation !== 'all') {
      if (home.name !== state.nation && away.name !== state.nation) return false;
    }
    if (state.group !== 'all' && m.group !== state.group) return false;
    if (state.day !== 'all' && dayKey(m.utcDate) !== state.day) return false;
    if (state.search) {
      const hay = `${home.name} ${away.name} ${m.venue || ''}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  const host = el('#matchList');
  el('#emptyState').hidden = list.length > 0;

  // Split played-out matches into a collapsed "Finished" section so the page
  // leads with what's live or still to come. Live matches stay in the main list.
  const finished = [];
  const active = [];
  for (const m of list) (isFinishedMatch(m) ? finished : active).push(m);

  let html = '';
  if (finished.length) html += renderFinishedSection(finished);
  html += renderDayGroups(active);
  host.innerHTML = html;

  // Persist the open/closed choice (the element is recreated on every render).
  const fin = el('#finishedSection');
  if (fin) {
    fin.addEventListener('toggle', () => {
      localStorage.setItem(FINISHED_OPEN_KEY, fin.open ? '1' : '0');
      const hint = fin.querySelector('.fs-hint');
      if (hint) hint.textContent = fin.open ? 'tap to hide' : 'tap to show';
    });
  }

  renderBracket();
  renderNowNext();
  renderFilterBanner();
}

// --- Knockout bracket -------------------------------------------------------
// The full WC2026 knockout tree, keyed by UTC kickoff (the stable join key with
// the live feed). Each node names the two feeders that supply its teams:
//   • Round of 32 feeders are group-position slot tokens — '1A' (winner Group A),
//     '2B' (runner-up Group B) or '3' (a third-placed team).
//   • Round of 16 → Final feeders reference an earlier node: 'W:m76' (winner of
//     match 76) or 'L:m101' (loser, used only by the third-place play-off).
// Encoding the feeders lets the bracket resolve later-round teams from earlier
// winners AND lay every round out on the correct side of the draw — instead of
// just date-sorting each column, which scattered the two halves. Verified
// team-by-team against the football-data.org feed + the Wikipedia knockout
// bracket (R32 slots, R16/QF/SF feeders and every kickoff time).
const BRACKET = {
  // Round of 32 — group-position slots (resolved from the standings).
  m73: { stage: 'r32', date: '2026-06-28T19:00:00Z', feed: ['2A', '2B'] },
  m74: { stage: 'r32', date: '2026-06-29T20:30:00Z', feed: ['1E', '3'] },
  m75: { stage: 'r32', date: '2026-06-30T01:00:00Z', feed: ['1F', '2C'] },
  m76: { stage: 'r32', date: '2026-06-29T17:00:00Z', feed: ['1C', '2F'] },
  m77: { stage: 'r32', date: '2026-06-30T21:00:00Z', feed: ['1I', '3'] },
  m78: { stage: 'r32', date: '2026-06-30T17:00:00Z', feed: ['2E', '2I'] },
  m79: { stage: 'r32', date: '2026-07-01T01:00:00Z', feed: ['1A', '3'] },
  m80: { stage: 'r32', date: '2026-07-01T16:00:00Z', feed: ['1L', '3'] },
  m81: { stage: 'r32', date: '2026-07-02T00:00:00Z', feed: ['1D', '3'] },
  m82: { stage: 'r32', date: '2026-07-01T20:00:00Z', feed: ['1G', '3'] },
  m83: { stage: 'r32', date: '2026-07-02T23:00:00Z', feed: ['2K', '2L'] },
  m84: { stage: 'r32', date: '2026-07-02T19:00:00Z', feed: ['1H', '2J'] },
  m85: { stage: 'r32', date: '2026-07-03T03:00:00Z', feed: ['1B', '3'] },
  m86: { stage: 'r32', date: '2026-07-03T22:00:00Z', feed: ['1J', '2H'] },
  m87: { stage: 'r32', date: '2026-07-04T01:30:00Z', feed: ['1K', '3'] },
  m88: { stage: 'r32', date: '2026-07-03T18:00:00Z', feed: ['2D', '2G'] },
  // Round of 16 — winners of the Round-of-32 ties.
  m89: { stage: 'r16', date: '2026-07-04T21:00:00Z', feed: ['W:m74', 'W:m77'] },
  m90: { stage: 'r16', date: '2026-07-04T17:00:00Z', feed: ['W:m73', 'W:m75'] },
  m91: { stage: 'r16', date: '2026-07-05T20:00:00Z', feed: ['W:m76', 'W:m78'] },
  m92: { stage: 'r16', date: '2026-07-06T00:00:00Z', feed: ['W:m79', 'W:m80'] },
  m93: { stage: 'r16', date: '2026-07-06T19:00:00Z', feed: ['W:m83', 'W:m84'] },
  m94: { stage: 'r16', date: '2026-07-07T00:00:00Z', feed: ['W:m81', 'W:m82'] },
  m95: { stage: 'r16', date: '2026-07-07T16:00:00Z', feed: ['W:m86', 'W:m88'] },
  m96: { stage: 'r16', date: '2026-07-07T20:00:00Z', feed: ['W:m85', 'W:m87'] },
  // Quarter-finals.
  m97:  { stage: 'qf', date: '2026-07-09T20:00:00Z', feed: ['W:m89', 'W:m90'] },
  m98:  { stage: 'qf', date: '2026-07-10T19:00:00Z', feed: ['W:m93', 'W:m94'] },
  m99:  { stage: 'qf', date: '2026-07-11T21:00:00Z', feed: ['W:m91', 'W:m92'] },
  m100: { stage: 'qf', date: '2026-07-12T01:00:00Z', feed: ['W:m95', 'W:m96'] },
  // Semi-finals.
  m101: { stage: 'sf', date: '2026-07-14T19:00:00Z', feed: ['W:m97', 'W:m98'] },
  m102: { stage: 'sf', date: '2026-07-15T19:00:00Z', feed: ['W:m99', 'W:m100'] },
  // Third-place play-off + Final.
  m103: { stage: 'third', date: '2026-07-18T21:00:00Z', feed: ['L:m101', 'L:m102'] },
  m104: { stage: 'final', date: '2026-07-19T19:00:00Z', feed: ['W:m101', 'W:m102'] },
};

// Column order top→bottom so adjacent pairs feed the same next-round tie and the
// draw's two halves line up (France/Netherlands… top, England/Brazil… bottom).
// The third-place play-off sits outside the tree and is rendered separately.
const BRACKET_COLUMNS = [
  ['r32', 'Round of 32', ['m74','m77','m73','m75','m83','m84','m81','m82','m76','m78','m79','m80','m86','m88','m85','m87']],
  ['r16', 'Round of 16', ['m89','m90','m93','m94','m91','m92','m95','m96']],
  ['qf', 'Quarter-finals', ['m97','m98','m99','m100']],
  ['sf', 'Semi-finals', ['m101','m102']],
  ['final', 'Final', ['m104']],
];

// Which bracket node owns a given kickoff time — joins the feed to the tree.
const NODE_BY_DATE = Object.fromEntries(
  Object.entries(BRACKET).map(([id, n]) => [n.date, { id, ...n }])
);
// The live feed card for a bracket node, matched on its kickoff time.
function feedMatchForNode(id) {
  return state.matches.find((m) => m.utcDate === BRACKET[id].date) || null;
}

// Resolve a bracket slot to a real team once its group has finished, otherwise
// to a readable placeholder ("Winner A" / "Runner-up B" / "3rd-place team").
function resolveSlot(token) {
  if (token[0] === '3') return { name: '3rd-place team', crest: null, tbd: true };
  const pos = Number(token[0]);            // 1 = winner, 2 = runner-up
  const grp = token.slice(1);              // 'A'…'L'
  const g = (state.standings || []).find((x) => x.group === `Group ${grp}` || x.group === grp);
  if (g && g.table.length >= 4 && g.table.every((r) => r.played >= 3)) {
    const row = g.table.find((r) => r.pos === pos) || g.table[pos - 1];
    if (row && !isPlaceholder(row.name)) return { name: row.name, crest: row.crest || null, tbd: false };
  }
  return { name: `${pos === 1 ? 'Winner' : 'Runner-up'} ${grp}`, crest: null, tbd: true };
}

// Resolve one side (i = 0 home / 1 away) of a bracket node to { name, crest, tbd }.
// Order of trust: (1) the team the live feed has already confirmed for this match;
// (2) for a Round-of-32 node, its group-position slot from the standings; (3) for
// later rounds, the winner/loser of the feeder tie once it's decided; (4) failing
// all that, a placeholder ("Brazil/Japan", "3rd-place team", …).
function resolveNodeSide(id, i) {
  const node = BRACKET[id];
  const fm = feedMatchForNode(id);
  if (fm) {
    const t = i === 0 ? fm.home : fm.away;
    if (t && t.name && !isPlaceholder(t.name)) return { name: t.name, crest: t.crest, tbd: false };
  }
  const ref = node.feed[i];
  if (!ref.includes(':')) return resolveSlot(ref); // R32 slot token ('1A'/'2B'/'3')
  const [kind, fid] = ref.split(':');              // 'W:m76' (winner) / 'L:m101' (loser)
  const decided = decideNode(fid);
  if (decided) return { ...(kind === 'W' ? decided.winner : decided.loser), tbd: false };
  return { name: feederLabel(fid), crest: null, tbd: true };
}

// Which side won a knockout tie: true = home, false = away, null = undecided.
// A tie level on goals is settled by the shootout (penalties), falling back to
// the API's winner field — so penalty winners still advance and get highlighted.
function winnerIsHome(score) {
  if (!score || score.home == null) return null;
  if (score.home > score.away) return true;
  if (score.away > score.home) return false;
  if (score.penalties && score.penalties.home != null)
    return score.penalties.home > score.penalties.away;
  if (score.winner === 'HOME_TEAM') return true;
  if (score.winner === 'AWAY_TEAM') return false;
  return null;
}

// Winner + loser of a node's tie, or null until it's been played to a result.
function decideNode(id) {
  const fm = feedMatchForNode(id);
  if (!fm || !isPlayed(fm.status) || fm.score?.home == null) return null;
  const homeWon = winnerIsHome(fm.score);
  if (homeWon == null) return null; // level / not yet separated
  const a = resolveNodeSide(id, 0), b = resolveNodeSide(id, 1);
  return { winner: homeWon ? a : b, loser: homeWon ? b : a };
}

// Compact label for an undecided feeder, e.g. "Brazil/Japan" once both its teams
// are known (so a Round-of-16 slot reads "winner of Brazil v Japan"); else "TBD".
function feederLabel(id) {
  const a = resolveNodeSide(id, 0), b = resolveNodeSide(id, 1);
  const known = (t) => t && !t.tbd && !isPlaceholder(t.name);
  return known(a) && known(b) ? `${a.name}/${b.name}` : 'TBD';
}

// Resolve a fixture's two teams the same way the bracket does (used by the
// fixtures list, the now/next strip and the search/nation filters), so a decided
// knockout tie shows its real teams the moment results land. Group ties pass
// straight through. Each side is { name, crest, tbd }.
function matchTeams(m) {
  const node = NODE_BY_DATE[m.utcDate];
  if (node) return { home: resolveNodeSide(node.id, 0), away: resolveNodeSide(node.id, 1) };
  return { home: teamObj(m.home), away: teamObj(m.away) };
}
function teamObj(t) {
  if (t && t.name && !isPlaceholder(t.name)) return { name: t.name, crest: t.crest, tbd: false };
  return { name: t?.name || 'TBD', crest: null, tbd: true };
}

// Rebuild the bracket as a proper tree: a fixed column order (so the draw's two
// halves line up) with teams resolved up the bracket from live results. Runs on
// every refresh, so teams + scores fill in automatically.
function renderBracket() {
  const host = el('#bracket');
  if (!host) return;

  let html = '<div class="bracket">';
  for (const [key, label, ids] of BRACKET_COLUMNS) {
    html += `<div class="bk-round bk-${key}">
      <div class="bk-round-head">${label}</div>
      <div class="bk-matches">${ids.map(bkNode).join('')}</div>
    </div>`;
  }
  html += '</div>';
  html += `<div class="bk-third">
    <div class="bk-round-head">Third-place play-off</div>
    ${bkNode('m103')}
  </div>`;
  host.innerHTML = html;
}

// Render one bracket node: resolved teams from the tree, scores/status from the
// feed card (matched by kickoff time), and the kickoff line when not yet played.
function bkNode(id) {
  const m = feedMatchForNode(id);
  const date = m ? m.utcDate : BRACKET[id].date;
  const played = m && isPlayed(m.status) && m.score?.home != null;
  const live = m && isLive(m.status);
  const home = resolveNodeSide(id, 0);
  const away = resolveNodeSide(id, 1);
  const winH = played && winnerIsHome(m.score) === true;
  const winA = played && winnerIsHome(m.score) === false;
  const pens = played ? m.score.penalties : null;
  const foot = live ? `<span class="bk-live">● Live</span>`
    : played ? `<span class="bk-ft">${ftLabel(m.score)}</span>`
    : `<span class="bk-when">${fmtDateTiny(date, 'Asia/Bangkok')} · ${fmtTime(date, localZone.tz)} ${tzAbbr(localZone.tz)}</span>`;
  return `<div class="bk-match ${live ? 'is-live' : ''}">
    ${bkTeam(home, played ? m.score.home : null, winH, pens ? pens.home : null)}
    ${bkTeam(away, played ? m.score.away : null, winA, pens ? pens.away : null)}
    <div class="bk-foot">${foot}</div>
  </div>`;
}

// Bracket full-time label: a tie decided beyond 90 minutes says how.
function ftLabel(score) {
  if (score?.duration === 'PENALTY_SHOOTOUT') return 'Pens';
  if (score?.duration === 'EXTRA_TIME') return 'AET';
  return 'Full-time';
}

function bkTeam(team, score, winner, pen) {
  const flag = team.crest
    ? `<img src="${team.crest}" alt="" loading="lazy" />`
    : `<span class="placeholder"></span>`;
  const sc = score != null
    ? `<span class="bk-score">${score}${pen != null ? `<span class="bk-pen">(${pen})</span>` : ''}</span>`
    : '';
  return `<div class="bk-team ${winner ? 'win' : ''} ${team.tbd ? 'tbd' : ''}">
    ${flag}<span class="bk-name">${team.name}</span>
    ${sc}
  </div>`;
}

// Group a list of matches by Thai/Indo (Bangkok) day — the primary date. The UK
// line underneath may show two dates when a single Thai/Indo day spans two UK days.
function renderDayGroups(list) {
  const days = [];
  let cur = null;
  for (const m of list) {
    const asiaDay = asiaDayKey(m.utcDate);
    if (!cur || cur.key !== asiaDay) { cur = { key: asiaDay, items: [] }; days.push(cur); }
    cur.items.push(m);
  }
  let html = '';
  for (const g of days) {
    html += dayHeading(g);
    for (const m of g.items) html += matchCard(m);
  }
  return html;
}

// Played matches collapse into a single "Finished" accordion, closed by default.
function renderFinishedSection(list) {
  const open = localStorage.getItem(FINISHED_OPEN_KEY) === '1';
  return `<details class="finished-section" id="finishedSection"${open ? ' open' : ''}>
    <summary class="finished-summary">
      <span class="fs-title">✓ Finished</span>
      <span class="fs-count">${list.length}</span>
      <span class="fs-hint">${open ? 'tap to hide' : 'tap to show'}</span>
    </summary>
    <div class="finished-body">${renderDayGroups(list)}</div>
  </details>`;
}

// A match is "finished" (and gets tucked into the collapsed section) when the
// feed says so, or — for the bundled schedule with no live status — when its
// kickoff is comfortably in the past. Live/postponed/cancelled stay in the list.
function isFinishedMatch(m) {
  if (m.status === 'FINISHED' || m.status === 'AWARDED') return true;
  if (isLive(m.status) || m.status === 'POSTPONED' || m.status === 'SUSPENDED' || m.status === 'CANCELLED') return false;
  const start = new Date(m.utcDate).getTime();
  return Number.isFinite(start) && Date.now() > start + 130 * 60_000; // ~match length
}

// Earliest upcoming fixture, optionally matching a predicate.
function nextUpcoming(pred) {
  const now = Date.now();
  return state.matches
    .filter((m) => new Date(m.utcDate).getTime() > now && (!pred || pred(m)))
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];
}

// Compact top strip: a "Live now / Next up" card plus a "Next England game" card.
function renderNowNext() {
  const host = el('#nowNext');
  const live = state.matches.filter((m) => isLive(m.status));
  const primary = live[0] || nextUpcoming();
  const eng = nextUpcoming((m) => {
    const { home, away } = matchTeams(m); // catch England's knockout tie as soon as its slot resolves
    return home.name === 'England' || away.name === 'England';
  });

  const cards = [];
  if (primary) cards.push(nnCard(primary, isLive(primary.status) ? 'Live now' : 'Next up', isLive(primary.status)));
  if (eng && eng.id !== primary?.id) cards.push(nnCard(eng, 'England', false));

  if (!cards.length) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  host.innerHTML = cards.join('');
}

function nnCard(m, label, liveNow) {
  const score = liveNow && m.score?.home != null
    ? `<span class="nn-score">${m.score.home}–${m.score.away}</span>`
    : '<span class="nn-v">v</span>';
  const meta = liveNow
    ? (m.status === 'PAUSED' ? 'Half-time' : 'Live')
    : `<span class="nn-countdown" data-kickoff="${m.utcDate}">${fmtDuration(new Date(m.utcDate).getTime() - Date.now())}</span>`;
  const { home, away } = matchTeams(m); // show resolved teams in the strip too
  return `<div class="nn-item ${liveNow ? 'live' : ''}">
    <span class="nn-label">${liveNow ? '● ' : ''}${label}</span>
    <span class="nn-teams">${nnTeam(home)}${score}${nnTeam(away)}</span>
    <span class="nn-meta">${meta}</span>
    <span class="nn-chan">${channelBadge(m.channel)}</span>
  </div>`;
}

function nnTeam(t) {
  const flag = t.crest ? `<img src="${t.crest}" alt="" />` : '<span class="placeholder"></span>';
  return `<span class="nn-team">${flag}<b>${t.name}</b></span>`;
}

function renderFilterBanner() {
  const b = el('#filterBanner');
  const parts = [];
  if (state.nation === '__favs__') parts.push('★ Favourites');
  else if (state.nation !== 'all') parts.push(state.nation);
  if (state.group !== 'all') parts.push(state.group);
  if (state.day !== 'all') parts.push(fmtDayShort(state.day));
  if (state.search) parts.push(`“${state.search}”`);

  if (!parts.length) { b.hidden = true; b.innerHTML = ''; return; }
  b.hidden = false;
  b.innerHTML = `<span class="fb-text">Showing <b>${parts.join(' · ')}</b></span>
    <button class="fb-clear" type="button">✕ Show all fixtures</button>`;
}

function dayHeading(g) {
  // Primary: Thai/Indo date (all matches in the block share it).
  const asia = fmtDayLongInTz(g.items[0].utcDate, 'Asia/Bangkok');
  // Secondary: UK date(s) — may be two when the Thai/Indo day spans two UK days.
  const uk = [...new Set(g.items.map((m) => fmtDayLongInTz(m.utcDate, 'Europe/London')))].join(' / ');
  return `<h2 class="day-heading">
    <span class="dh-line"><span class="dh-date">${asia}</span><span class="dh-tag primary">Thai / Indo</span></span>
    <span class="dh-line alt"><span class="dh-date">${uk}</span><span class="dh-tag">UK</span></span>
  </h2>`;
}

function matchCard(m) {
  const zones = activeZones();
  const times = zones
    .map((z) => `<div class="time-row ${z.local ? 'local' : ''}">
        <span class="tz">${z.local ? 'Your Time' : z.label}</span>
        <span class="t">${fmtTime(m.utcDate, z.tz)}</span><span class="d">${fmtDateTiny(m.utcDate, z.tz)}</span>
      </div>`)
    .join('');

  const { home, away } = matchTeams(m); // resolve knockout slots to real teams as group results land
  const faved = favs.has(home.name) || favs.has(away.name);
  const showScore = isPlayed(m.status) && m.score?.home != null;
  const live = isLive(m.status);
  // Highlight the winning side once a result exists (penalty ties included).
  const winHome = showScore && winnerIsHome(m.score) === true;
  const winAway = showScore && winnerIsHome(m.score) === false;
  const pens = showScore ? m.score.penalties : null;
  return `<article class="match ${faved ? 'is-fav' : ''} ${live ? 'is-live' : ''}">
    <div class="match-teams">
      ${teamRow(home, showScore ? m.score.home : null, winHome, pens ? pens.home : null)}
      ${teamRow(away, showScore ? m.score.away : null, winAway, pens ? pens.away : null)}
      ${showScore ? deciderNote(m, home, away) : ''}
    </div>
    <div class="channels">${channelBadge(m.channel)}</div>
    <div class="match-times">${times}</div>
    <div class="match-times-compact">${compactTimes(m)}</div>
    <div class="team-meta">${[m.group, m.venue].filter(Boolean).join(' · ')}</div>
    <div class="match-status">${statusBadge(m)}${countdownEl(m)}</div>
  </article>`;
}

// Mobile times: group the fixed zones that share a date so the date shows once
// (e.g. "12 Jun · Koh Phangan 02:00 · Bali 03:00 · 11 Jun · UK 20:00"), then
// "Your Time" on its own.
function compactTimes(m) {
  const zones = activeZones();
  const fixed = zones.filter((z) => !z.local);
  const byDate = new Map();
  for (const z of fixed) {
    const label = z.label === 'Koh Phangan' ? 'Phangan' : z.label; // shorter on mobile
    const d = fmtDateTiny(m.utcDate, z.tz);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(`${label} <b>${fmtTime(m.utcDate, z.tz)}</b>`);
  }
  let html = [...byDate.entries()]
    .map(([d, zs]) => `<span class="ct-grp"><span class="ct-date">${d}</span> ${zs.join(' · ')}</span>`)
    .join('');
  const you = zones.find((z) => z.local);
  if (you) {
    html += `<span class="ct-grp ct-you"><span class="ct-date">Local</span> <b>${fmtTime(m.utcDate, you.tz)}</b> ${fmtDateTiny(m.utcDate, you.tz)}</span>`;
  }
  return html;
}

// One-line explainer under a knockout result decided beyond 90 minutes, e.g.
// "After extra time · Morocco won 3–2 on penalties" or plain "After extra time".
function deciderNote(m, home, away) {
  const s = m.score;
  if (s.penalties) {
    const homeWon = winnerIsHome(s);
    const winName = (homeWon ? home.name : away.name);
    const wp = homeWon ? s.penalties.home : s.penalties.away;
    const lp = homeWon ? s.penalties.away : s.penalties.home;
    return `<div class="match-decider">After extra time · ${winName} won ${wp}–${lp} on penalties</div>`;
  }
  if (s.duration === 'EXTRA_TIME') return `<div class="match-decider">After extra time</div>`;
  return '';
}

function teamRow(team, score, winner, pen) {
  const flag = team.crest
    ? `<img src="${team.crest}" alt="" loading="lazy" />`
    : `<span class="placeholder"></span>`;
  const canFav = !team.tbd && !isPlaceholder(team.name);
  const star = canFav
    ? `<button class="star ${favs.has(team.name) ? 'on' : ''}" data-team="${team.name}" title="Favourite ${team.name}" aria-label="Favourite ${team.name}">${favs.has(team.name) ? '★' : '☆'}</button>`
    : '';
  // Real nations are clickable to filter to their fixtures; placeholders aren't.
  const name = canFav
    ? `<span class="team-name team-link" data-filter="${team.name}" role="button" tabindex="0" title="Show ${team.name} fixtures">${team.name}</span>`
    : `<span class="team-name">${team.name}</span>`;
  const scoreEl = score != null
    ? `<span class="score ${winner ? 'win' : ''}">${score}${pen != null ? `<span class="pen">(${pen})</span>` : ''}</span>`
    : '';
  return `<div class="team">${star}${flag}${name}${scoreEl}</div>`;
}

// Countdown for an upcoming fixture ("3h 20m 15s"). The text ticks
// every second via tick(); the 60s refresh keeps statuses/scores current.
function countdownEl(m) {
  if (isPlayed(m.status) || m.status === 'FINISHED') return '';
  const diff = new Date(m.utcDate).getTime() - Date.now();
  if (diff <= 0) return '';
  return `<span class="countdown" data-kickoff="${m.utcDate}">${fmtDuration(diff)}</span>`;
}

// Update every countdown's text once a second without a full re-render.
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-kickoff]').forEach((node) => {
    const diff = new Date(node.dataset.kickoff).getTime() - now;
    node.textContent = diff <= 0 ? 'Kicking off…' : `${fmtDuration(diff)}`;
  });
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const isLive = (s) => s === 'IN_PLAY' || s === 'PAUSED';
const isPlayed = (s) => isLive(s) || s === 'FINISHED' || s === 'AWARDED';

// --- Channel logos ----------------------------------------------------------
const bbcBlocks = () => `<span class="bbc-blocks"><i>B</i><i>B</i><i>C</i></span>`;
const itvMark = (num) => `<span class="itv-mark">itv${num ? `<b>${num}</b>` : ''}</span>`;

function channelBadge(channel) {
  if (!channel) return `<span class="channel-badge net-tbc">TBC</span>`;
  const isBBC = channel.startsWith('BBC');
  const isITV = channel.includes('ITV');
  if (isBBC && isITV) {
    return `<span class="channel-badge logo"><span class="logo-inner">${bbcBlocks()}<span class="chan-amp">&amp;</span>${itvMark('')}</span></span>`;
  }
  if (isBBC) {
    const suffix = channel.replace('BBC', '').trim().toUpperCase(); // ONE / TWO
    return `<span class="channel-badge logo"><span class="logo-inner">${bbcBlocks()}<span class="chan-suffix">${suffix}</span></span></span>`;
  }
  if (isITV) {
    const num = channel.replace('ITV', '').trim(); // 1 / 4
    return `<span class="channel-badge logo"><span class="logo-inner">${itvMark(num)}</span></span>`;
  }
  return `<span class="channel-badge net-tbc">${channel}</span>`;
}

function statusBadge(m) {
  // Only show a badge for live/finished states — upcoming is conveyed by the
  // "KO in…" countdown, so no "Upcoming" badge is needed.
  if (m.status === 'IN_PLAY') return `<span class="status-badge live">● Live</span>`;
  if (m.status === 'PAUSED') return `<span class="status-badge live">● Half-time</span>`;
  if (m.status === 'FINISHED' || m.status === 'AWARDED') return `<span class="status-badge finished">Full-time</span>`;
  if (m.status === 'POSTPONED' || m.status === 'SUSPENDED' || m.status === 'CANCELLED')
    return `<span class="status-badge">${m.status[0] + m.status.slice(1).toLowerCase()}</span>`;
  // Fallback for bundled data (no live status): infer live/finished from time.
  const start = new Date(m.utcDate).getTime();
  const now = Date.now();
  if (now >= start && now <= start + 130 * 60_000) return `<span class="status-badge live">● Live</span>`;
  if (now > start) return `<span class="status-badge finished">Full-time</span>`;
  return '';
}

// ---- Date / time helpers ---------------------------------------------------
function fmtTime(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}
function fmtDateTiny(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function dayKey(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));
}
function asiaDayKey(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}
function fmtDayLong(key) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(key + 'T12:00:00Z'));
}
function fmtDayLongInTz(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(iso));
}
function fmtDayShort(key) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(key + 'T12:00:00Z'));
}
function tzAbbr(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
}
