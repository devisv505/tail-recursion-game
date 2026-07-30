#!/usr/bin/env node
/**
 * Pull this app's Steam leaderboards into data/leaderboard.json.
 *
 * This runs in CI, never in a browser, and that is not a style choice:
 *
 *   1. The leaderboard endpoints live on partner.steam-api.com and want a
 *      *publisher* Web API key. A publisher key can read and write data for
 *      every app on the account, so it must never be shipped to a client.
 *   2. Steam's Web API sends no CORS headers, so a page on github.io cannot
 *      call it even with a key.
 *
 * So the key stays a repository secret, this script writes a snapshot, and the
 * page reads the snapshot. The cost is staleness bounded by the cron interval.
 *
 * Environment:
 *   STEAM_API_KEY            publisher Web API key                  (required)
 *   STEAM_APP_ID             the game's app id                      (required)
 *   STEAM_LEADERBOARD_NAMES  comma-separated; default: every board  (optional)
 *   STEAM_LEADERBOARD_NAME   deprecated alias for a single board    (optional)
 *   STEAM_TOP_N              rows per board; default 25             (optional)
 *
 * With either required variable missing the script writes a "pending" file and
 * exits 0 — an unconfigured secret is the normal state before launch, not a
 * build failure.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'leaderboard.json');

const KEY = process.env.STEAM_API_KEY;
const APP = process.env.STEAM_APP_ID;
const TOP = Number(process.env.STEAM_TOP_N || 25);

/** Which boards to publish, in the order the page should show them. Empty
 *  means "every board the app has", which is the sane default for one game. */
const WANT = (process.env.STEAM_LEADERBOARD_NAMES || process.env.STEAM_LEADERBOARD_NAME || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PARTNER = 'https://partner.steam-api.com';
const PUBLIC = 'https://api.steampowered.com';

/**
 * Short tab labels for the boards this game ships. Steamworks' own "community
 * name" wins when it is set; this is only here because an API name like
 * FREE_PLAY_BEST is a poor thing to print above a table, and "Free play best"
 * is still longer than a tab wants to be.
 */
const LABELS = {
  FREE_PLAY_BEST: 'Free play',
  PUZZLE_SCORE: 'Puzzles',
};

const redact = (s) => (KEY ? String(s).split(KEY).join('***') : String(s));

/** FREE_PLAY_BEST -> "Free play best". The fallback when nothing better exists. */
function prettify(name) {
  const s = String(name || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function labelFor(board) {
  return board.display || LABELS[board.name] || prettify(board.name) || 'Standings';
}

/** Fetch JSON, tolerating the leaderboard endpoints' habit of answering XML. */
async function get(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${redact(url)} — ${redact(text.slice(0, 200))}`);
  }
  try {
    return { json: JSON.parse(text), xml: null };
  } catch {
    return { json: null, xml: text };
  }
}

/**
 * Minimal reader for the two shapes these endpoints return as XML. It is a
 * regex rather than a parser on purpose: the shape is fixed, narrow and
 * documented, and a dependency here would have to be audited on every run.
 */
function xmlEntries(xml, tag, fields) {
  const out = [];
  const blocks = xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) || [];
  for (const block of blocks) {
    const row = {};
    for (const f of fields) {
      const m = block.match(new RegExp(`<${f}>([\\s\\S]*?)</${f}>`));
      if (m) row[f] = m[1].trim();
    }
    out.push(row);
  }
  return out;
}

/**
 * A snapshot with no rows in it. Board names are preserved across a pending
 * write so the page can still label its tabs before the first real fetch.
 */
async function writePending(note) {
  let previous = {};
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  const boards = WANT.length
    ? WANT.map((name) => ({
        key: name,
        id: null,
        name: LABELS[name] || prettify(name),
        detailLabel: 'Detail',
        status: 'pending',
        note,
        entries: [],
      }))
    : (previous.boards || []).map((b) => ({ ...b, status: 'pending', note, entries: [] }));

  const doc = {
    status: 'pending',
    appId: APP ? Number(APP) : null,
    updated: null,
    note,
    boards: boards.length
      ? boards
      : [{
          key: null,
          id: null,
          name: 'Global standings',
          detailLabel: 'Detail',
          status: 'pending',
          note,
          entries: [],
        }],
  };

  await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log('wrote pending snapshot:', note);
}

/** Every leaderboard defined on the app. */
async function listBoards() {
  const listed = await get(
    `${PARTNER}/ISteamLeaderboards/GetLeaderboardsForGame/v2/` +
    `?key=${KEY}&appid=${APP}&format=json`
  );

  if (listed.json) {
    return (listed.json?.response?.leaderboards || []).map((b) => ({
      id: String(b.id ?? b.leaderBoardID ?? ''),
      name: b.name ?? b.leaderBoardName ?? '',
      display: b.display_name ?? b.leaderBoardDisplayName ?? '',
      sortMethod: b.sortmethod ?? b.leaderBoardSortMethod ?? '',
    }));
  }

  return xmlEntries(listed.xml, 'leaderboard',
    ['leaderBoardID', 'leaderBoardName', 'display_name', 'leaderBoardSortMethod'])
    .map((b) => ({
      id: b.leaderBoardID,
      name: b.leaderBoardName,
      display: b.display_name || '',
      sortMethod: b.leaderBoardSortMethod || '',
    }));
}

/** The top rows of one board, as {steamId, score, rank}. */
async function fetchRows(board) {
  const got = await get(
    `${PARTNER}/ISteamLeaderboards/GetLeaderboardEntries/v1/` +
    `?key=${KEY}&appid=${APP}&leaderboardid=${board.id}` +
    `&rangestart=0&rangeend=${Math.max(0, TOP - 1)}` +
    `&datarequest=RequestGlobal&format=json`
  );

  if (got.json) {
    return (got.json?.leaderboardEntryInformation?.leaderboardEntries || []).map((e) => ({
      steamId: String(e.steamID ?? e.steamid ?? ''),
      score: Number(e.score ?? 0),
      rank: Number(e.rank ?? 0),
    }));
  }

  return xmlEntries(got.xml, 'entry', ['steamid', 'score', 'rank']).map((e) => ({
    steamId: e.steamid,
    score: Number(e.score || 0),
    rank: Number(e.rank || 0),
  }));
}

/**
 * Resolve steam ids to display names, for every board at once. 100 ids per
 * call is the documented cap, and the same player is very likely to sit on
 * both boards — so this dedupes before it pages.
 */
async function resolveNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map();

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100).join(',');
    const sum = await get(
      `${PUBLIC}/ISteamUser/GetPlayerSummaries/v2/?key=${KEY}&steamids=${batch}&format=json`
    );
    for (const p of sum.json?.response?.players || []) {
      names.set(String(p.steamid), { name: p.personaname, profile: p.profileurl });
    }
  }

  return names;
}

async function main() {
  if (!KEY || !APP) {
    await writePending(
      'No Steam app id or API key is configured yet, so there is no leaderboard to read.'
    );
    return;
  }

  const all = await listBoards();
  if (!all.length) {
    await writePending('The app has no leaderboards yet.');
    return;
  }

  // An explicit list also fixes the order the page shows them in; without one,
  // take every board in whatever order Steam lists them.
  const chosen = WANT.length
    ? WANT.map((want) => all.find((b) => b.name === want || b.display === want)).filter(Boolean)
    : all;

  if (!chosen.length) {
    await writePending(`No leaderboard named ${WANT.map((w) => `"${w}"`).join(' or ')} on app ${APP}.`);
    return;
  }

  const missing = WANT.filter((w) => !all.some((b) => b.name === w || b.display === w));
  for (const name of missing) console.warn(`warning: no leaderboard named "${name}" on app ${APP}`);

  const fetched = [];
  for (const board of chosen) {
    fetched.push({ board, rows: await fetchRows(board) });
  }

  const names = await resolveNames(fetched.flatMap((f) => f.rows.map((r) => r.steamId)));

  const boards = fetched.map(({ board, rows }) => ({
    key: board.name || null,
    id: board.id,
    name: labelFor(board),
    // Only shown when entries carry a `detail`. Steam's leaderboard entries
    // can hold extra game-supplied details; wire them in here when the game
    // starts uploading them.
    detailLabel: 'Detail',
    status: rows.length ? 'ok' : 'pending',
    note: rows.length ? '' : 'Nobody has posted a score on this board yet.',
    entries: rows
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TOP)
      .map((r) => {
        const who = names.get(r.steamId);
        return {
          rank: r.rank,
          // Never a steam id: a private profile gets a placeholder, not an
          // identifier the page would then publish.
          name: who?.name || 'private profile',
          profile: who?.profile || null,
          score: r.score,
          detail: '',
        };
      }),
  }));

  const total = boards.reduce((n, b) => n + b.entries.length, 0);
  if (!total) {
    await writePending('The leaderboards exist but nobody has posted a score yet.');
    return;
  }

  const doc = {
    // "ok" means at least one board has rows; a board that is still empty
    // carries its own pending status and renders its own empty state.
    status: 'ok',
    appId: Number(APP),
    updated: new Date().toISOString(),
    note: '',
    boards,
  };

  await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(
    `wrote ${total} entries across ${boards.length} board(s): ` +
    boards.map((b) => `${b.name} (${b.entries.length})`).join(', ')
  );
}

main().catch((err) => {
  console.error(redact(err.message));
  // A failed fetch must not publish an empty board over a good one.
  process.exitCode = 1;
});
