#!/usr/bin/env node
/**
 * Derive every icon the site needs from one source image.
 *
 * The source is `icon/icon.png` — the game's own icon. This decodes it,
 * box-filters it down to each size a browser or an OS asks for, and writes the
 * .ico and the PNGs.
 *
 * There is deliberately no SVG output. The source is pixel art whose detail is
 * not on a uniform grid, so tracing it would need one rect per pixel — tens of
 * kilobytes to say what a 580-byte PNG already says.
 *
 *   node tools/make-icons.mjs
 *
 * Reads:  icon/icon.png          (falls back to the ART grid below if absent)
 * Writes: favicon.ico            16, 32 and 48 in one file
 *         assets/icon-{32,180,512}.png
 *
 * No dependencies. PNG is decoded and encoded with node's own zlib, and an
 * .ico is a small header in front of PNG data.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'icon', 'icon.png');

/* --------------------------------------------------------- fallback artwork */

// Used only when icon/icon.png is missing: a snake head watching an apple, in
// the wordmark's two colours.
const PALETTE = {
  '.': [0, 0, 0, 0],
  G: [0x6e, 0xe7, 0xa0, 0xff],
  D: [0x06, 0x12, 0x0c, 0xff],
  R: [0xe2, 0x56, 0x5f, 0xff],
};

const ART = [
  '................', '................', '................', '................',
  '...GGGGG........', '..GGGGGGG.......', '.GGGGGGGGG...D..', '.GGGGGDDGG..RRR.',
  '.GGGGGDDGG..RRR.', '.GGGGGGGGG..RRR.', '.GGGGGGGGG......', '..GGGGGGG.......',
  '...GGGGG........', '................', '................', '................',
];

function artImage() {
  const n = ART.length;
  const data = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      data.set(PALETTE[ART[y][x]], (y * n + x) * 4);
    }
  }
  return { width: n, height: n, data };
}

/* -------------------------------------------------------------- png decoding */

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit non-interlaced RGB or RGBA PNG to {width, height, data}. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let offset = 8, ihdr = null;
  const idat = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + len);

    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.depth !== 8) throw new Error(`bit depth ${ihdr.depth} unsupported — export 8-bit`);
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG unsupported — export non-interlaced');
  if (ihdr.colorType !== 6 && ihdr.colorType !== 2) {
    throw new Error(`colour type ${ihdr.colorType} unsupported — export RGB or RGBA`);
  }

  const channels = ihdr.colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  const out = Buffer.alloc(ihdr.width * ihdr.height * 4);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);

  let p = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) throw new Error(`unknown filter ${filter} on row ${y}`);
      line[i] = v & 0xff;
    }

    for (let x = 0; x < ihdr.width; x++) {
      const s = x * channels, d = (y * ihdr.width + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 0xff;
    }
    line.copy(prev);
  }

  return { width: ihdr.width, height: ihdr.height, data: out };
}

/* -------------------------------------------------------------- png encoding */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(img) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    const row = Buffer.alloc(1 + img.width * 4);   // leading filter byte, 0 = none
    img.data.copy(row, 1, y * img.width * 4, (y + 1) * img.width * 4);
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------------- resampling */

/**
 * Box filter. For an exact integer downscale of pixel art every target pixel
 * lands inside one source block and comes out exact; for the awkward sizes
 * (180 from 512) it averages, which is what you want that small anyway.
 * Alpha is premultiplied during the average so transparent pixels cannot drag
 * a dark fringe into the edges.
 */
function resize(img, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = img.width / size, sy = img.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1; j++) {
        for (let i = x0; i < x1; i++) {
          const s = (j * img.width + i) * 4;
          const alpha = img.data[s + 3] / 255;
          r += img.data[s] * alpha;
          g += img.data[s + 1] * alpha;
          b += img.data[s + 2] * alpha;
          a += img.data[s + 3];
          n++;
        }
      }

      const d = (y * size + x) * 4;
      const meanA = a / n;
      if (meanA > 0) {
        const un = n * (meanA / 255);      // undo the premultiply
        out[d] = Math.round(r / un);
        out[d + 1] = Math.round(g / un);
        out[d + 2] = Math.round(b / un);
      }
      out[d + 3] = Math.round(meanA);
    }
  }

  return { width: size, height: size, data: out };
}

/* ---------------------------------------------------------------- ico writing */

/** An .ico is a directory followed by images; PNG payloads are legal since Vista. */
function ico(images) {
  const encoded = images.map(encodePng);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map((img, i) => {
    const e = Buffer.alloc(16);
    e[0] = img.width >= 256 ? 0 : img.width;    // 0 means 256
    e[1] = img.height >= 256 ? 0 : img.height;
    e[2] = 0;                                    // palette size
    e[3] = 0;                                    // reserved
    e.writeUInt16LE(1, 4);                       // colour planes
    e.writeUInt16LE(32, 6);                      // bits per pixel
    e.writeUInt32LE(encoded[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += encoded[i].length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...encoded]);
}

/* --------------------------------------------------------------------- main */

let source, origin;
try {
  source = decodePng(await readFile(SOURCE));
  origin = `icon/icon.png (${source.width}x${source.height})`;
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  source = artImage();
  origin = 'the built-in ART grid — icon/icon.png not found';
}

await writeFile(join(ROOT, 'favicon.ico'), ico([16, 32, 48].map((s) => resize(source, s))));
for (const size of [32, 180, 512]) {
  await writeFile(join(ROOT, 'assets', `icon-${size}.png`), encodePng(resize(source, size)));
}

console.log(`from ${origin}`);
console.log('  favicon.ico (16/32/48), assets/icon-{32,180,512}.png');
