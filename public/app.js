// SportsTV frontend — fetches matches from the local proxy and renders them
// with kickoff times in UK / Bangkok / Bali (+ the visitor's own zone).

const ZONES = [
  { key: 'uk', label: 'UK', tz: 'Europe/London' },
  { key: 'bkk', label: 'Bangkok', tz: 'Asia/Bangkok' },
  { key: 'bali', label: 'Bali', tz: 'Asia/Makassar' }, // WITA, UTC+8
];

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const localLabel = (localTz.split('/').pop() || 'You').replace(/_/g, ' ');

const state = { matches: [], group: 'all', day: 'all', search: '' };

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
  setInterval(render, 60_000); // refresh live/upcoming badges
  setInterval(loadStandings, 120_000); // refresh group tables
}

async function loadStandings() {
  try {
    const res = await fetch('/api/standings');
    const json = await res.json();
    renderStandings(json.groups || []);
  } catch {
    /* leave whatever is there */
  }
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
                (r, i) => `<tr class="${i < 2 ? 'qualify' : ''}">
                  <td class="pos">${r.pos}</td>
                  <td class="tl team-cell">
                    ${r.crest ? `<img src="${r.crest}" alt="" loading="lazy" />` : '<span class="placeholder"></span>'}
                    <span>${r.name}</span>
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
  const zones = [...ZONES, { key: 'local', label: localLabel, tz: localTz }];
  el('#zonesLegend').innerHTML = zones
    .map((z) => `<span class="zone-chip"><b>${z.label}</b> ${tzAbbr(z.tz)}</span>`)
    .join('');
}

function buildFilters() {
  const groups = [...new Set(state.matches.map((m) => m.group).filter(Boolean))].sort();
  el('#groupFilter').innerHTML =
    chip('all', 'All groups', 'group') + groups.map((g) => chip(g, g, 'group')).join('');

  const days = [...new Set(state.matches.map((m) => dayKey(m.utcDate)))];
  el('#dayFilter').innerHTML =
    chip('all', 'All days', 'day') +
    days.map((d) => chip(d, fmtDayShort(d), 'day')).join('');
  syncChips();
}

function chip(value, label, kind) {
  return `<button class="chip" data-kind="${kind}" data-value="${value}" aria-pressed="false">${label}</button>`;
}

function bindControls() {
  el('#search').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });
  document.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    state[c.dataset.kind] = c.dataset.value;
    syncChips();
    render();
  });
}

function syncChips() {
  document.querySelectorAll('.chip').forEach((c) => {
    c.setAttribute('aria-pressed', String(state[c.dataset.kind] === c.dataset.value));
  });
}

function filtered() {
  return state.matches.filter((m) => {
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

  let html = '';
  let lastDay = null;
  for (const m of list) {
    const dk = dayKey(m.utcDate);
    if (dk !== lastDay) {
      html += `<h2 class="day-heading">${fmtDayLong(dk)}</h2>`;
      lastDay = dk;
    }
    html += matchCard(m);
  }
  host.innerHTML = html;

  host.querySelectorAll('.cal-btn').forEach((b) =>
    b.addEventListener('click', () => downloadIcs(b.dataset.id))
  );
}

function matchCard(m) {
  const zones = [...ZONES, { key: 'local', label: localLabel, tz: localTz, local: true }];
  const times = zones
    .map((z) => {
      const t = fmtTime(m.utcDate, z.tz);
      const d = fmtDateTiny(m.utcDate, z.tz);
      return `<div class="time-row ${z.local ? 'local' : ''}">
        <span class="tz">${z.label}</span>
        <span class="t">${t}</span><span class="d">${d}</span>
      </div>`;
    })
    .join('');

  return `<article class="match">
    <div class="match-teams">
      ${teamRow(m.home)}
      ${teamRow(m.away)}
      <div class="team-meta">${[m.group, m.venue].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="match-times">${times}</div>
    <div class="match-side">
      ${statusBadge(m)}
      <div class="channels">${channelBadge(m.channel)}</div>
      <button class="cal-btn" data-id="${m.id}" title="Add to calendar">📅 Add</button>
    </div>
  </article>`;
}

function teamRow(team) {
  const flag = team.crest
    ? `<img src="${team.crest}" alt="" loading="lazy" />`
    : `<span class="placeholder"></span>`;
  return `<div class="team">${flag}<span>${team.name}</span></div>`;
}

// Map a channel name to a network for badge styling (BBC = black, ITV = gold).
function channelNet(name) {
  if (!name) return 'tbc';
  if (name.startsWith('BBC') && name.includes('ITV')) return 'both';
  if (name.startsWith('BBC')) return 'bbc';
  if (name.startsWith('ITV')) return 'itv';
  return 'tbc';
}
function channelBadge(channel) {
  if (!channel) return `<span class="channel-badge net-tbc">TBC</span>`;
  return `<span class="channel-badge net-${channelNet(channel)}">${channel}</span>`;
}

function statusBadge(m) {
  const start = new Date(m.utcDate).getTime();
  const now = Date.now();
  const end = start + 115 * 60_000; // ~match length
  if (now >= start && now <= end) return `<span class="status-badge live">● Live</span>`;
  if (now > end) return `<span class="status-badge finished">Finished</span>`;
  if (dayKey(m.utcDate) === dayKey(new Date().toISOString()))
    return `<span class="status-badge today">Today</span>`;
  return `<span class="status-badge">Upcoming</span>`;
}

// ---- Calendar (.ics) -------------------------------------------------------
function downloadIcs(id) {
  const m = state.matches.find((x) => x.id === id);
  if (!m) return;
  const start = new Date(m.utcDate);
  const end = new Date(start.getTime() + 115 * 60_000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportsTV//WC2026//EN',
    'BEGIN:VEVENT',
    `UID:sportstv-${m.id}@local`,
    `DTSTAMP:${stamp(start)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${m.home.name} vs ${m.away.name} (World Cup 2026)`,
    `LOCATION:${(m.venue || '').replace(/,/g, '\\,')}`,
    `DESCRIPTION:UK TV: ${m.channel || 'TBC'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${m.home.name}-vs-${m.away.name}.ics`.replace(/\s+/g, '_');
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Date / time helpers ---------------------------------------------------
function fmtTime(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}
function fmtDateTiny(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}
function dayKey(iso) {
  // Group by calendar day in UK time so headings are stable.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));
}
function fmtDayLong(key) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(key + 'T12:00:00Z'));
}
function fmtDayShort(key) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(key + 'T12:00:00Z'));
}
function tzAbbr(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
}
