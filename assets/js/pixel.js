/* A 5x7 bitmap font, drawn as SVG rects.
 *
 * The game renders every glyph from a 5x7 bitmap font it owns as code. The
 * site does the same rather than loading a webfont, so the wordmark is the
 * same shape as the one in the game and the page has no external requests.
 */
(function () {
  'use strict';

  var GLYPHS = {
    A: '01110,10001,10001,11111,10001,10001,10001',
    B: '11110,10001,10001,11110,10001,10001,11110',
    C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110',
    E: '11111,10000,10000,11110,10000,10000,11111',
    F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111',
    H: '10001,10001,10001,11111,10001,10001,10001',
    I: '11111,00100,00100,00100,00100,00100,11111',
    J: '00111,00010,00010,00010,00010,10010,01100',
    K: '10001,10010,10100,11000,10100,10010,10001',
    L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001',
    N: '10001,11001,10101,10011,10001,10001,10001',
    O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000',
    Q: '01110,10001,10001,10001,10101,10010,01101',
    R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110',
    T: '11111,00100,00100,00100,00100,00100,00100',
    U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100',
    W: '10001,10001,10001,10101,10101,11011,10001',
    X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100',
    Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110',
    1: '00100,01100,00100,00100,00100,00100,01110',
    2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110',
    4: '00010,00110,01010,10010,11111,00010,00010',
    5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110',
    7: '11111,00001,00010,00100,01000,01000,01000',
    8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100',
    '-': '00000,00000,00000,11111,00000,00000,00000',
    '?': '01110,10001,00001,00010,00100,00000,00100',
    '/': '00001,00010,00010,00100,01000,01000,10000',
    '.': '00000,00000,00000,00000,00000,01100,01100',
    ':': '00000,01100,01100,00000,01100,01100,00000',
    '!': '00100,00100,00100,00100,00100,00000,00100',
    ' ': '00000,00000,00000,00000,00000,00000,00000',
  };

  var W = 5, H = 7, GAP = 1;

  /* Measures a string in font pixels, including inter-glyph gaps. */
  function measure(text) {
    var n = text.length;
    return n === 0 ? 0 : n * W + (n - 1) * GAP;
  }

  /* Appends the rects for one line of text to `parent`, starting at (ox, oy).
   * Returns the width consumed, in font pixels. */
  function emit(parent, text, ox, oy, fill) {
    var x = ox;
    for (var i = 0; i < text.length; i++) {
      var rows = (GLYPHS[text[i]] || GLYPHS['?']).split(',');
      for (var r = 0; r < H; r++) {
        var row = rows[r];
        var runStart = -1;
        // Coalesce horizontal runs into single rects: fewer nodes, same shape.
        for (var c = 0; c <= W; c++) {
          var on = c < W && row[c] === '1';
          if (on && runStart < 0) runStart = c;
          if (!on && runStart >= 0) {
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x + runStart);
            rect.setAttribute('y', oy + r);
            rect.setAttribute('width', c - runStart);
            rect.setAttribute('height', 1);
            if (fill) rect.setAttribute('fill', fill);
            parent.appendChild(rect);
            runStart = -1;
          }
        }
      }
      x += W + GAP;
    }
    return x - ox - GAP;
  }

  /* Renders one or more lines into an <svg>, sized in font pixels and scaled
   * by CSS. `lines` is [{text, fill, scale}] — scale multiplies that line's
   * glyph size so "TAIL" can sit above a larger "RECURSION". */
  function render(svg, lines, opts) {
    opts = opts || {};
    var lead = opts.leading == null ? 2 : opts.leading;
    var align = opts.align || 'center';

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var widths = lines.map(function (l) { return measure(l.text) * (l.scale || 1); });
    var total = Math.max.apply(null, widths);
    var y = 0;

    lines.forEach(function (line, i) {
      var s = line.scale || 1;
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var offset = align === 'center' ? (total - widths[i]) / 2 : 0;
      g.setAttribute('transform', 'translate(' + offset + ',' + y + ') scale(' + s + ')');
      emit(g, line.text, 0, 0, line.fill);
      svg.appendChild(g);
      y += H * s + lead;
    });

    var height = y - lead;
    svg.setAttribute('viewBox', '0 0 ' + total + ' ' + height);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('shape-rendering', 'crispEdges');
    return { width: total, height: height };
  }

  window.PixelFont = { render: render, measure: measure, glyphs: GLYPHS };
})();
