#!/usr/bin/env node
/**
 * Fold a fresh dump from the game into data/blocks.json.
 *
 * dump_blocks.lua produces exactly what the game registers and nothing else.
 * data/blocks.json also carries prose the game has no field for — the category
 * blurbs, the module table, the per-block "note" lines, the item descriptions.
 * This merges the two: registrations win on facts, the existing file wins on
 * prose, and anything the dump no longer contains is reported rather than
 * silently deleted.
 *
 *   lua tools/dump_blocks.lua <path-to-game-root> data/blocks.generated.json
 *   node tools/merge-blocks.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'blocks.generated.json');
const OUT = join(ROOT, 'data', 'blocks.json');

const generated = JSON.parse(await readFile(GEN, 'utf8'));
const current = JSON.parse(await readFile(OUT, 'utf8'));

const priorBlocks = new Map(current.blocks.map((b) => [b.id, b]));
const priorItems = new Map(current.items.map((i) => [i.id, i]));

const blocks = generated.blocks.map((b) => {
  const was = priorBlocks.get(b.id);
  const merged = { ...b };
  // Prose the game does not store.
  if (was?.note) merged.note = was.note;
  // Drop keys the dump leaves null so the file stays readable.
  for (const k of Object.keys(merged)) {
    if (merged[k] === null || merged[k] === undefined) delete merged[k];
  }
  if (!merged.module) merged.module = null;
  return merged;
});

const items = generated.items.map((i) => {
  const was = priorItems.get(i.id);
  return { ...i, desc: was?.desc || '' };
});

const seen = new Set(blocks.map((b) => b.id));
const dropped = current.blocks.filter((b) => !seen.has(b.id));
const added = blocks.filter((b) => !priorBlocks.has(b.id));

const doc = {
  ...current,
  source: { ...current.source, captured: new Date().toISOString().slice(0, 10) },
  blocks,
  items,
};

await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');

console.log(`${blocks.length} blocks, ${items.length} items -> data/blocks.json`);
if (added.length) console.log('new:', added.map((b) => b.id).join(', '));
if (dropped.length) {
  console.log('GONE from the game, removed from the wiki:',
    dropped.map((b) => b.id).join(', '));
}
const missingProse = blocks.filter((b) => !b.desc);
if (missingProse.length) {
  console.log('no description in the Lua:', missingProse.map((b) => b.id).join(', '));
}
