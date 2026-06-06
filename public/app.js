// SportsTV frontend — fetches matches from the local proxy and renders them
// with kickoff times in UK / Koh Phangan / Bali (+ the visitor's own nation).

const ZONES = [
  { key: 'uk', label: 'UK', tz: 'Europe/London' },
  { key: 'phangan', label: 'Koh Phangan', tz: 'Asia/Bangkok' }, // ICT, UTC+7
  { key: 'bali', label: 'Bali', tz: 'Asia/Makassar' }, // WITA, UTC+8
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

// Favourite nations (persisted in localStorage).
const FAV_KEY = 'stv:favourites';
const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
function saveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); }

const state = { matches: [], nation: 'all', group: 'all', day: 'all', search: '' };
const el = (sel) => document.querySelector(sel);

init();

async function init() {
  renderLegend();
  try {
    const res = await fetch('/api/matches');
    const json = await res.json();
    state.matches = (json.matches || []).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    if (state.matches[0]?.source === 'fallback') {
      const note = el('#sourceNote');
      note.hidden = false;
      note.textContent = 'Showing the bundled official schedule. Add a football-data.org API key for live scores & knockout teams.';
    }
  } catch {
    el('#sourceNote').hidden = false;
    el('#sourceNote').textContent = 'Could not load matches. Is the server running?';
  }
  buildFilters();
  render();
  bindControls();
  loadStandings();
  setInterval(render, 60_000);
  setInterval(loadStandings, 120_000);
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
  const zones = [...ZONES, localZone];
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

  // Star / unstar a nation (delegated).
  el('#matchList').addEventListener('click', (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    const team = star.dataset.team;
    favs.has(team) ? favs.delete(team) : favs.add(team);
    saveFavs();
    buildFilters();
    render();
    loadStandings();
  });
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

  // Group by UK day AND Thai/Indo day together, so every heading is accurate for
  // all its matches. A UK day with both early-hours and evening kickoffs splits
  // into two blocks (Thai/Indo same day vs next day) instead of showing a range.
  const days = [];
  let cur = null;
  for (const m of list) {
    const ukDay = dayKey(m.utcDate);
    const asiaDay = asiaDayKey(m.utcDate);
    const key = `${ukDay}|${asiaDay}`;
    if (!cur || cur.key !== key) { cur = { key, dk: ukDay, items: [] }; days.push(cur); }
    cur.items.push(m);
  }

  let html = '';
  for (const g of days) {
    html += dayHeading(g);
    for (const m of g.items) html += matchCard(m);
  }
  host.innerHTML = html;
}

function dayHeading(g) {
  const uk = fmtDayLong(g.dk);
  // Every match in this block shares the same Thai/Indo day, so any item is accurate.
  const asia = fmtDayLongInTz(g.items[0].utcDate, 'Asia/Bangkok');
  return `<h2 class="day-heading">
    <span class="dh-line"><span class="dh-date">${uk}</span><span class="dh-tag uk">UK</span></span>
    <span class="dh-line alt"><span class="dh-date">${asia}</span><span class="dh-tag">Thai / Indo</span></span>
  </h2>`;
}

function matchCard(m) {
  const zones = [...ZONES, localZone];
  const times = zones
    .map((z) => `<div class="time-row ${z.local ? 'local' : ''}">
        <span class="tz">${z.local ? 'Your Time' : z.label}</span>
        <span class="t">${fmtTime(m.utcDate, z.tz)}</span><span class="d">${fmtDateTiny(m.utcDate, z.tz)}</span>
      </div>`)
    .join('');

  const faved = favs.has(m.home.name) || favs.has(m.away.name);
  return `<article class="match ${faved ? 'is-fav' : ''}">
    <div class="match-teams">
      ${teamRow(m.home)}
      ${teamRow(m.away)}
      <div class="team-meta">${[m.group, m.venue].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="match-times">${times}</div>
    <div class="match-side">
      ${statusBadge(m)}
      <div class="channels">${channelBadge(m.channel)}</div>
    </div>
  </article>`;
}

function teamRow(team) {
  const flag = team.crest
    ? `<img src="${team.crest}" alt="" loading="lazy" />`
    : `<span class="placeholder"></span>`;
  const canFav = !isPlaceholder(team.name);
  const star = canFav
    ? `<button class="star ${favs.has(team.name) ? 'on' : ''}" data-team="${team.name}" title="Favourite ${team.name}" aria-label="Favourite ${team.name}">${favs.has(team.name) ? '★' : '☆'}</button>`
    : '';
  return `<div class="team">${star}${flag}<span class="team-name">${team.name}</span></div>`;
}

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
  const start = new Date(m.utcDate).getTime();
  const now = Date.now();
  const end = start + 115 * 60_000;
  if (now >= start && now <= end) return `<span class="status-badge live">● Live</span>`;
  if (now > end) return `<span class="status-badge finished">Finished</span>`;
  if (dayKey(m.utcDate) === dayKey(new Date().toISOString())) return `<span class="status-badge today">Today</span>`;
  return `<span class="status-badge">Upcoming</span>`;
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
