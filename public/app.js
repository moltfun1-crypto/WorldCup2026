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

const state = { matches: [], nation: 'all', group: 'all', day: 'all', search: '' };
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
    renderStandings(json.groups || []);
  } catch { /* keep previous */ }
}

function renderStandings(groups) {
  el('#standings').innerHTML = groups
    .map(
      (g) => `<div class="group-table">
        <h3>${g.group}</h3>
        <table>
          <thead><tr><th></th><th class="tl">Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
          <tbody>
            ${g.table
              .map(
                (r, i) => `<tr class="${i < 2 ? 'qualify' : ''} ${favs.has(r.name) ? 'fav' : ''}">
                  <td class="pos">${r.pos}</td>
                  <td class="tl team-cell">
                    ${r.crest ? `<img src="${r.crest}" alt="" loading="lazy" />` : '<span class="placeholder"></span>'}
                    <span>${favs.has(r.name) ? '★ ' : ''}${r.name}</span>
                  </td>
                  <td>${r.played}</td>
                  <td>${r.gd > 0 ? '+' + r.gd : r.gd}</td>
                  <td class="pts">${r.points}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    )
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
    `<option value="all">All nations</option>` + favOpt +
    nations.map((n) => `<option value="${n}">${n}</option>`).join('');
  el('#nationFilter').value = state.nation;

  const groups = [...new Set(state.matches.map((m) => m.group).filter(Boolean))];
  el('#groupFilter').innerHTML =
    `<option value="all">All groups</option>` + groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  el('#groupFilter').value = state.group;

  const days = [...new Set(state.matches.map((m) => dayKey(m.utcDate)))];
  el('#dayFilter').innerHTML =
    `<option value="all">All days</option>` + days.map((d) => `<option value="${d}">${fmtDayShort(d)}</option>`).join('');
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

  // "Show all" clears every active filter.
  el('#filterBanner').addEventListener('click', (e) => {
    if (e.target.closest('.fb-clear')) clearFilters();
  });

  // Fixtures / Group Tables view tabs.
  document.querySelectorAll('.view-tab').forEach((t) =>
    t.addEventListener('click', () => setView(t.dataset.view))
  );
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
    if (state.nation === '__favs__') {
      if (!favs.has(m.home.name) && !favs.has(m.away.name)) return false;
    } else if (state.nation !== 'all') {
      if (m.home.name !== state.nation && m.away.name !== state.nation) return false;
    }
    if (state.group !== 'all' && m.group !== state.group) return false;
    if (state.day !== 'all' && dayKey(m.utcDate) !== state.day) return false;
    if (state.search) {
      const hay = `${m.home.name} ${m.away.name} ${m.venue || ''}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  const host = el('#matchList');
  el('#emptyState').hidden = list.length > 0;

  // Group by Thai/Indo (Bangkok) day — the primary date. The UK line underneath
  // may show two dates when a single Thai/Indo day spans two UK days.
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
  host.innerHTML = html;

  renderNowNext();
  renderFilterBanner();
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
  const eng = nextUpcoming((m) => m.home.name === 'England' || m.away.name === 'England');

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
  return `<div class="nn-item ${liveNow ? 'live' : ''}">
    <span class="nn-label">${liveNow ? '● ' : ''}${label}</span>
    <span class="nn-teams">${nnTeam(m.home)}${score}${nnTeam(m.away)}</span>
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

  const faved = favs.has(m.home.name) || favs.has(m.away.name);
  const showScore = isPlayed(m.status) && m.score?.home != null;
  const live = isLive(m.status);
  // Highlight the leading side once a result exists.
  const winHome = showScore && m.score.home > m.score.away;
  const winAway = showScore && m.score.away > m.score.home;
  return `<article class="match ${faved ? 'is-fav' : ''} ${live ? 'is-live' : ''}">
    <div class="match-teams">
      ${teamRow(m.home, showScore ? m.score.home : null, winHome)}
      ${teamRow(m.away, showScore ? m.score.away : null, winAway)}
    </div>
    <div class="match-times">${times}</div>
    <div class="match-times-compact">${compactTimes(m)}</div>
    <div class="team-meta">${[m.group, m.venue].filter(Boolean).join(' · ')}</div>
    <div class="match-side">
      <div class="channels">${channelBadge(m.channel)}</div>
      ${statusBadge(m)}
      ${countdownEl(m)}
    </div>
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
    const d = fmtDateTiny(m.utcDate, z.tz);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(`${z.label} <b>${fmtTime(m.utcDate, z.tz)}</b>`);
  }
  let html = [...byDate.entries()]
    .map(([d, zs]) => `<span class="ct-grp"><span class="ct-date">${d}</span> ${zs.join(' · ')}</span>`)
    .join('');
  const you = zones.find((z) => z.local);
  if (you) {
    html += `<span class="ct-grp ct-you"><span class="ct-date">You</span> <b>${fmtTime(m.utcDate, you.tz)}</b> ${fmtDateTiny(m.utcDate, you.tz)}</span>`;
  }
  return html;
}

function teamRow(team, score, winner) {
  const flag = team.crest
    ? `<img src="${team.crest}" alt="" loading="lazy" />`
    : `<span class="placeholder"></span>`;
  const canFav = !isPlaceholder(team.name);
  const star = canFav
    ? `<button class="star ${favs.has(team.name) ? 'on' : ''}" data-team="${team.name}" title="Favourite ${team.name}" aria-label="Favourite ${team.name}">${favs.has(team.name) ? '★' : '☆'}</button>`
    : '';
  // Real nations are clickable to filter to their fixtures; placeholders aren't.
  const name = canFav
    ? `<span class="team-name team-link" data-filter="${team.name}" role="button" tabindex="0" title="Show ${team.name} fixtures">${team.name}</span>`
    : `<span class="team-name">${team.name}</span>`;
  const scoreEl = score != null ? `<span class="score ${winner ? 'win' : ''}">${score}</span>` : '';
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
