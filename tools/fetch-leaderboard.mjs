#!/usr/bin/env node
/**
 * Pull a Steam leaderboard into data/leaderboard.json.
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
 *   STEAM_API_KEY            publisher Web API key            (required)
 *   STEAM_APP_ID             the game's app id                (required)
 *   STEAM_LEADERBOARD_NAME   which board; default: the first  (optional)
 *   STEAM_TOP_N              how many rows; default 25        (optional)
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
const WANT = process.env.STEAM_LEADERBOARD_NAME || '';
const TOP = Number(process.env.STEAM_TOP_N || 25);

const PARTNER = 'https://partner.steam-api.com';
const PUBLIC = 'https://api.steampowered.com';

/** Fetch JSON, tolerating the leaderboard endpoints' habit of answering XML. */
async function get(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url.replace(KEY, '***')} — ${text.slice(0, 200)}`);
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

async function writePending(note) {
  let previous = {};
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  const doc = {
    status: 'pending',
    appId: APP ? Number(APP) : null,
    leaderboard: previous.leaderboard || { id: null, name: 'Global standings' },
    detailLabel: previous.detailLabel || 'Best run',
    updated: null,
    entries: [],
    note,
  };
  await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log('wrote pending snapshot:', note);
}

async function main() {
  if (!KEY || !APP) {
    await writePending(
      'No Steam app id or API key is configured yet, so there is no leaderboard to read.'
    );
    return;
  }

  // 1. Which leaderboards does this app have?
  const listUrl =
    `${PARTNER}/ISteamLeaderboards/GetLeaderboardsForGame/v2/` +
    `?key=${KEY}&appid=${APP}&format=json`;

  const listed = await get(listUrl);
  let boards = [];

  if (listed.json) {
    boards = (listed.json?.response?.leaderboards || []).map((b) => ({
      id: String(b.id ?? b.leaderBoardID ?? ''),
      name: b.name ?? b.leaderBoardName ?? '',
      display: b.display_name ?? b.leaderBoardDisplayName ?? '',
      sortMethod: b.sortmethod ?? b.leaderBoardSortMethod ?? '',
    }));
  } else {
    boards = xmlEntries(listed.xml, 'leaderboard',
      ['leaderBoardID', 'leaderBoardName', 'display_name', 'leaderBoardSortMethod'])
      .map((b) => ({
        id: b.leaderBoardID,
        name: b.leaderBoardName,
        display: b.display_name || '',
        sortMethod: b.leaderBoardSortMethod || '',
      }));
  }

  if (!boards.length) {
    await writePending('The app has no leaderboards yet.');
    return;
  }

  const board = WANT
    ? boards.find((b) => b.name === WANT || b.display === WANT)
    : boards[0];

  if (!board) {
    await writePending(`No leaderboard named "${WANT}" on app ${APP}.`);
    return;
  }

  // 2. The top N rows.
  const entriesUrl =
    `${PARTNER}/ISteamLeaderboards/GetLeaderboardEntries/v1/` +
    `?key=${KEY}&appid=${APP}&leaderboardid=${board.id}` +
    `&rangestart=0&rangeend=${Math.max(0, TOP - 1)}` +
    `&datarequest=RequestGlobal&format=json`;

  const got = await get(entriesUrl);
  let rows = [];

  if (got.json) {
    rows = (got.json?.leaderboardEntryInformation?.leaderboardEntries || []).map((e) => ({
      steamId: String(e.steamID ?? e.steamid ?? ''),
      score: Number(e.score ?? 0),
      rank: Number(e.rank ?? 0),
    }));
  } else {
    rows = xmlEntries(got.xml, 'entry', ['steamid', 'score', 'rank']).map((e) => ({
      steamId: e.steamid,
      score: Number(e.score || 0),
      rank: Number(e.rank || 0),
    }));
  }

  if (!rows.length) {
    await writePending('The leaderboard exists but nobody has posted a score yet.');
    return;
  }

  // 3. Turn steam ids into display names. 100 ids per call is the documented cap.
  const names = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const ids = rows.slice(i, i + 100).map((r) => r.steamId).filter(Boolean).join(',');
    if (!ids) continue;
    const sum = await get(
      `${PUBLIC}/ISteamUser/GetPlayerSummaries/v2/?key=${KEY}&steamids=${ids}&format=json`
    );
    for (const p of sum.json?.response?.players || []) {
      names.set(String(p.steamid), { name: p.personaname, profile: p.profileurl });
    }
  }

  const doc = {
    status: 'ok',
    appId: Number(APP),
    leaderboard: { id: board.id, name: board.display || board.name },
    // Only shown when entries carry a `detail`. Steam's leaderboard entries
    // can hold extra game-supplied details; wire them in here when the game
    // starts uploading them.
    detailLabel: 'Detail',
    updated: new Date().toISOString(),
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
    note: '',
  };

  await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${doc.entries.length} entries from "${doc.leaderboard.name}"`);
}

main().catch(async (err) => {
  console.error(err.message);
  // A failed fetch must not publish an empty board over a good one.
  process.exitCode = 1;
});
