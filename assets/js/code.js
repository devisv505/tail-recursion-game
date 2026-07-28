/* Syntax colouring for the samples on the authoring page.
 *
 * Small on purpose: two languages, one pass each, no dependency. It reads
 * textContent and writes escaped HTML, so a sample can contain anything
 * without becoming markup.
 */
(function () {
  'use strict';

  var KEYWORDS = [
    'function', 'end', 'return', 'local', 'if', 'then', 'else', 'elseif',
    'for', 'while', 'do', 'repeat', 'until', 'and', 'or', 'not',
    'true', 'false', 'nil', 'in', 'break',
  ];

  function escape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="' + cls + '">' + text + '</span>';
  }

  /* Escaping first means the tokeniser only ever sees &lt; and &gt;, never a
   * bare angle bracket that could close a tag it did not open. */
  function lua(src) {
    var pattern = new RegExp(
      '(--[^\\n]*)' +                       // comment
      '|("(?:[^"\\\\\\n]|\\\\.)*")' +       // "string"
      "|('(?:[^'\\\\\\n]|\\\\.)*')" +       // 'string'
      '|\\b(' + KEYWORDS.join('|') + ')\\b' +
      '|\\b(\\d+(?:\\.\\d+)?)\\b',
      'g'
    );

    return escape(src).replace(pattern, function (m, comment, dq, sq, kw, num) {
      if (comment) return span('tok-comment', comment);
      if (dq || sq) return span('tok-string', dq || sq);
      if (kw) return span('tok-keyword', kw);
      if (num) return span('tok-number', num);
      return m;
    });
  }

  /* The .level and .graph formats are both "keyword rest-of-line", with # for
   * comments — so one highlighter covers them. */
  function keyed(src) {
    return escape(src).split('\n').map(function (line) {
      if (/^\s*#/.test(line)) return span('tok-comment', line);
      var m = line.match(/^(\s*)([a-z_]+)\b/);
      if (!m) return line;
      return m[1] + span('tok-key', m[2]) + line.slice(m[0].length);
    }).join('\n');
  }

  document.querySelectorAll('pre.code[data-lang]').forEach(function (el) {
    var src = el.textContent;
    var lang = el.getAttribute('data-lang');
    if (lang === 'lua') el.innerHTML = lua(src);
    else if (lang === 'level' || lang === 'graph') el.innerHTML = keyed(src);
  });
})();
