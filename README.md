# Tail Recursion — website

The site for **Tail Recursion**, a game by [DEV505](https://www.youtube.com/@devisv505).

Plain HTML, CSS and JavaScript. No framework, no build step, no external
requests — the wordmark is drawn from a 5×7 bitmap font in
[`assets/js/pixel.js`](assets/js/pixel.js) rather than loaded as a webfont, so
the page has nothing to fetch but itself.

```
index.html              the game: pitch, live demo, screens, standings, links
wiki.html               every default block, filterable
authoring.html          adding blocks, writing levels, the full Lua API
404.html                served by Pages for anything that does not exist
data/blocks.json        the block library, taken from the game's registrations
data/leaderboard.json   the standings snapshot, written by CI
assets/js/config.js     the only file you edit to change links or screenshots
favicon.ico, assets/icon.* the site icon, generated from one 16x16 grid
robots.txt              committed; the Sitemap: line is added at deploy
tools/                  icons, SEO, block extraction, Steam leaderboard fetch
```

## Running it locally

`fetch` does not work over `file://`, so open it through a server rather than
double-clicking `index.html`:

```bash
npx serve .
```

## Publishing to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Source → GitHub Actions.**
3. [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes the
   repository as-is on every push to `main`.

Every path in the HTML is relative, so it works from a project page
(`user.github.io/repo/`) as well as a custom domain. `.nojekyll` stops Pages
from running the files through Jekyll.

If you would rather not use the workflow, **Settings → Pages → Deploy from a
branch → `main` / root** serves the same files.

## The three links

Edit `links` in [`assets/js/config.js`](assets/js/config.js):

```js
links: {
  youtube: 'https://www.youtube.com/@devisv505',
  discord: 'https://discord.gg/q9T9UcjAZv',
  steam:   null,   // becomes a live button the moment it is a URL
}
```

`null` renders a dimmed **SOON** chip. Nothing else needs changing — the hero
buttons and the community cards are both generated from that object.

## The block wiki

`data/blocks.json` is the wiki's source. It currently holds all **37 built-in
blocks** plus the 2 from the shipped `example_fear` mod, transcribed from the
game's `lua/blocks/*.lua`.

When the block library changes, regenerate rather than re-transcribe. The
extractor defines `register_block` itself and then loads the game's own Lua, so
it also catches the eight blocks that helper functions generate — the six
`Ahead?` tests and `And` / `Or` — which no text parser would find:

```bash
lua tools/dump_blocks.lua ../../Cpp/Snake_v2 data/blocks.generated.json
node tools/merge-blocks.mjs
```

The merge keeps the prose the game has no field for (category blurbs, the
module table, the per-block `note` lines, item descriptions) and reports
anything added or removed. Needs a Lua 5.4 interpreter on `PATH`; the game
builds one from source but does not install it, so `brew install lua@5.4` or
[a Windows binary](https://luabinaries.sourceforge.net/) is the quickest route.

## Standings

The browser never talks to Steam, and this is not a preference:

- Steam's Web API sends **no CORS headers**, so a page on `github.io` cannot
  call it from JavaScript at all.
- `ISteamLeaderboards/GetLeaderboardEntries` lives on `partner.steam-api.com`
  and wants a **publisher** key, which can read and write data for every app on
  the account. That key must never reach a client.

So [`.github/workflows/leaderboard.yml`](.github/workflows/leaderboard.yml)
runs [`tools/fetch-leaderboard.mjs`](tools/fetch-leaderboard.mjs) on a six-hour
cron, with the key as a repository secret, and commits
`data/leaderboard.json`. The page reads that file. Standings are therefore up
to six hours stale, which is the trade for not having a server.

Three things have to exist before real numbers appear, and none of them are on
this site:

1. **A Steam app id.** `steam_appid.txt` in the game is still `480` — Valve's
   shared Spacewar app, which has no depots you can upload to and no
   leaderboard worth reading.
2. **A leaderboard on that app**, created in Steamworks or by the game via
   `FindOrCreateLeaderboard`.
3. **Score uploads from the game.** `src/steam.h` currently exposes only
   `persona()`; posting a score needs
   `ISteamUserStats::UploadLeaderboardScore` wired to the progress save, which
   already tracks per-level scores, best ticks, fewest blocks and the free-play
   best.

Until then the job runs, finds nothing configured, writes the same `pending`
file the site already ships, and exits 0 — so it is safe to enable now.

Once the app exists:

| Where | Name | Value |
|---|---|---|
| Secrets → Actions | `STEAM_API_KEY` | publisher Web API key |
| Variables → Actions | `STEAM_APP_ID` | the app id |
| Variables → Actions | `STEAM_LEADERBOARD_NAME` | optional; defaults to the first board |

Player names arrive from Steam and are therefore untrusted text. The renderer
sets them with `textContent`, never as markup, and profile links carry
`rel="noopener nofollow"`. A private profile shows as *private profile* rather
than exposing a Steam id.

## Search engines

Both pages carry a real `<h1>`, a description, Open Graph and Twitter tags, and
JSON-LD structured data — `VideoGame` on the front page, `TechArticle` plus a
`BreadcrumbList` on the wiki. None of it claims a price, a rating or a release
date, because none of those exist yet.

Canonical tags, `og:url`, `sitemap.xml` and the `Sitemap:` line in `robots.txt`
all need an **absolute** URL, and nothing in this repository hardcodes one. The
deploy workflow passes the URL GitHub actually published to:

```yaml
- id: pages
  uses: actions/configure-pages@v5
- run: node tools/build-seo.mjs "${{ steps.pages.outputs.base_url }}"
```

So it stays correct through a repository rename or a custom domain with nothing
to edit. The script rewrites the block between the `<!-- seo:start -->` and
`<!-- seo:end -->` markers in each page's `<head>`; in the committed files that
block is empty, which is deliberate — an absent canonical beats one pointing
every crawler at the wrong host.

`sitemap.xml` is therefore generated, not committed (it is in `.gitignore`).
**If you deploy from a branch instead of the workflow**, generate it yourself
and commit the result:

```bash
node tools/build-seo.mjs https://your.url/here/
```

Run it with no argument to clear the injected block again.

## The icon

`icon/icon.png` is the source — the game's own icon, 512×512. Everything else
is derived from it:

```bash
node tools/make-icons.mjs
```

Writes `favicon.ico` (16, 32 and 48 in one file) and
`assets/icon-{32,180,512}.png` for tabs, iOS home screens and
`site.webmanifest`. Replace `icon/icon.png` and re-run; nothing else needs
touching. If that file is ever missing the script falls back to a small drawn
mark so the build still produces an icon.

No image editor and no dependencies: [`tools/make-icons.mjs`](tools/make-icons.mjs)
decodes and encodes PNG with node's own zlib, and an `.ico` is a small header in
front of PNG data. Downscaling is a box filter with premultiplied alpha, so
transparent edges cannot pull a dark fringe into the small sizes.

There is deliberately **no SVG icon**. The source is pixel art whose detail is
not on a uniform grid, so tracing it would need roughly one rect per pixel —
tens of kilobytes to say what a 580-byte PNG already says.

## Screenshots

Drop PNGs into [`assets/screenshots/`](assets/screenshots/) using the names in
[its README](assets/screenshots/README.md). A frame with no file yet shows a
placeholder naming the file it wants, so the page never has a blank hole in it.
`inspector.png` ships already — it is `docs/MACOS.png` from the game repo.

## What the demo on the front page is

Not a video and not a canned animation: it is the actual three-block solution
to the fifth puzzle — `Wall Ahead?` branching to `Turn Right` and `Move
Forward` — run against a walled room under the game's rules. A tick ends at the
first action, blocks charge ops, and a chain that runs out of wire returns to
Start. The path you see is whatever that program produces.
