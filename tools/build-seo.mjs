#!/usr/bin/env node
/**
 * Write the parts of the site that need to know their own absolute URL:
 * canonical tags, og:url, JSON-LD structured data, sitemap.xml and the
 * Sitemap: line in robots.txt.
 *
 * Nothing in the repository hardcodes a domain. The Pages workflow passes the
 * URL GitHub actually deployed to, so this stays correct through a repository
 * rename or a custom domain with no edit here.
 *
 *   node tools/build-seo.mjs https://user.github.io/repo/
 *   SITE_URL=https://example.com node tools/build-seo.mjs
 *
 * With no URL at all it clears the injected block and exits 0, which is the
 * right state for a working copy: better an absent canonical than a wrong one
 * pointing every crawler at localhost.
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RAW = process.argv[2] || process.env.SITE_URL || '';
const BASE = RAW.replace(/\/+$/, '');

const STUDIO = 'DEV505';
const YOUTUBE = 'https://www.youtube.com/@devisv505';

const PAGES = [
  {
    file: 'index.html',
    path: '',
    title: 'Tail Recursion — a snake game where you never steer',
    description:
      'Tail Recursion is a grid puzzle game where you never steer the snake. You wire ' +
      'its program from blocks and it executes one tick at a time. 6 tutorials, ' +
      '100 puzzles, free play. By DEV505.',
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    file: 'wiki.html',
    path: 'wiki.html',
    title: 'Block wiki — Tail Recursion',
    headline: 'Block wiki',
    description:
      'Every default block in Tail Recursion: cost in ops, the hardware it needs, its ' +
      'parameters, its data ports and its exec branches.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    file: 'authoring.html',
    path: 'authoring.html',
    title: 'Authoring — blocks, levels and the Lua API — Tail Recursion',
    headline: 'Authoring blocks and levels',
    description:
      'How to add blocks and write levels for Tail Recursion: the register_block fields, ' +
      'the full ctx sensor and action API, the sandbox whitelist, and every key in the ' +
      '.level and .graph formats.',
    priority: '0.8',
    changefreq: 'monthly',
  },
];

const START = '<!-- seo:start -->';
const END = '<!-- seo:end -->';

/* ------------------------------------------------------------ structured data */

function author() {
  return {
    '@type': 'Person',
    name: STUDIO,
    url: YOUTUBE,
    sameAs: [YOUTUBE],
  };
}

/** Only facts the game actually supports — no price, rating or release date. */
function gameSchema(url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Tail Recursion',
    alternateName: 'Tail Recursion Game',
    url: url + '/',
    image: url + '/assets/icon-512.png',
    description: PAGES[0].description,
    genre: ['Puzzle', 'Programming game', 'Automation'],
    gamePlatform: ['PC', 'Windows', 'macOS'],
    operatingSystem: 'Windows, macOS',
    applicationCategory: 'GameApplication',
    inLanguage: 'en',
    author: author(),
    publisher: author(),
    gameItem: [
      { '@type': 'Thing', name: 'Sensor Segment' },
      { '@type': 'Thing', name: 'Processor Segment' },
      { '@type': 'Thing', name: 'Memory Segment' },
    ],
  };
}

/** Every page other than the front one: an article about the game, plus a crumb. */
function articleSchema(url, page) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: page.headline,
      description: page.description,
      url: `${url}/${page.path}`,
      inLanguage: 'en',
      author: author(),
      about: { '@type': 'VideoGame', name: 'Tail Recursion', url: url + '/' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tail Recursion', item: url + '/' },
        { '@type': 'ListItem', position: 2, name: page.headline, item: `${url}/${page.path}` },
      ],
    },
  ];
}

/* -------------------------------------------------------------------- inject */

function block(page) {
  if (!BASE) return '';

  const url = page.path ? `${BASE}/${page.path}` : `${BASE}/`;
  const schema = page.path ? articleSchema(BASE, page) : [gameSchema(BASE)];

  const lines = [
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${BASE}/assets/icon-512.png">`,
  ];

  for (const s of schema) {
    // No user input reaches this, but a lone "<" would still end the script
    // element early, so escape it the way the spec requires.
    const json = JSON.stringify(s, null, 2).replace(/</g, '\\u003c');
    lines.push(`<script type="application/ld+json">\n${json}\n</script>`);
  }

  return '\n' + lines.map((l) => '  ' + l).join('\n') + '\n';
}

async function inject(page) {
  const path = join(ROOT, page.file);
  let html = await readFile(path, 'utf8');

  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0) {
    throw new Error(`${page.file} has no ${START} … ${END} markers`);
  }

  html = html.slice(0, from + START.length) + block(page) + html.slice(to);
  await writeFile(path, html);
}

/* ------------------------------------------------------------------ sitemap */

async function sitemap() {
  const urls = [];
  for (const page of PAGES) {
    let lastmod;
    try {
      lastmod = (await stat(join(ROOT, page.file))).mtime.toISOString().slice(0, 10);
    } catch {
      continue;
    }
    const loc = page.path ? `${BASE}/${page.path}` : `${BASE}/`;
    urls.push(
      '  <url>\n' +
      `    <loc>${loc}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>${page.changefreq}</changefreq>\n` +
      `    <priority>${page.priority}</priority>\n` +
      '  </url>'
    );
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n' +
    '</urlset>\n';

  await writeFile(join(ROOT, 'sitemap.xml'), xml);
}

async function robots() {
  const txt =
    '# Tail Recursion — https://www.youtube.com/@devisv505\n' +
    'User-agent: *\n' +
    'Allow: /\n' +
    '\n' +
    '# data/ holds the block library and the standings snapshot. Both are fetched\n' +
    '# by the pages themselves, so a crawler that renders needs them.\n' +
    (BASE ? `\nSitemap: ${BASE}/sitemap.xml\n` : '');

  await writeFile(join(ROOT, 'robots.txt'), txt);
}

/* --------------------------------------------------------------------- main */

for (const page of PAGES) await inject(page);
await robots();

if (BASE) {
  await sitemap();
  console.log(`SEO written for ${BASE} — canonical, og:url, JSON-LD, sitemap.xml, robots.txt`);
} else {
  console.log('No SITE_URL given: cleared the injected block, wrote robots.txt, ' +
    'skipped sitemap.xml. Pass a URL to generate them.');
}
