/* Global standings.
 *
 * The browser never talks to Steam. Steam's Web API sends no CORS headers and
 * the leaderboard endpoints need a publisher key that must not exist in
 * client-side code — so a scheduled GitHub Action fetches the leaderboard with
 * the key held as a repository secret and commits the result as the JSON file
 * this reads. See tools/fetch-leaderboard.mjs.
 */
(function () {
  'use strict';

  var host = document.getElementById('lb-body');
  if (!host) return;

  var CFG = window.SITE_CONFIG || {};
  var url = (CFG.steam && CFG.steam.leaderboardData) || 'data/leaderboard.json';

  var titleEl = document.getElementById('lb-title');
  var stampEl = document.getElementById('lb-stamp');

  function pending(message) {
    host.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'lb-empty';

    var b = document.createElement('b');
    b.textContent = 'Coming soon';
    var cursor = document.createElement('span');
    cursor.className = 'blink';
    cursor.textContent = '_';
    b.appendChild(cursor);

    var s = document.createElement('span');
    s.textContent = message;

    box.appendChild(b);
    box.appendChild(s);
    host.appendChild(box);
  }

  function table(data) {
    host.innerHTML = '';

    var t = document.createElement('table');
    t.className = 'lb';

    // Only show the detail column when something actually fills it — an empty
    // column under a confident heading reads as missing data.
    var hasDetail = data.entries.some(function (e) { return e.detail; });
    var cols = ['#', 'Player'];
    if (hasDetail) cols.push(data.detailLabel || 'Detail');
    cols.push('Score');

    var head = document.createElement('tr');
    cols.forEach(function (h, i) {
      var th = document.createElement('th');
      th.textContent = h;
      if (i === cols.length - 1) th.style.textAlign = 'right';
      head.appendChild(th);
    });

    var thead = document.createElement('thead');
    thead.appendChild(head);
    t.appendChild(thead);

    var body = document.createElement('tbody');
    data.entries.forEach(function (e, i) {
      var tr = document.createElement('tr');

      var rank = document.createElement('td');
      rank.className = 'rank';
      rank.textContent = String(e.rank != null ? e.rank : i + 1).padStart(2, '0');

      // Player names come from Steam, so they are untrusted text and are set
      // as text, never as markup.
      var name = document.createElement('td');
      if (e.profile) {
        var a = document.createElement('a');
        a.href = e.profile;
        a.target = '_blank';
        a.rel = 'noopener nofollow';
        a.textContent = e.name || 'unknown';
        name.appendChild(a);
      } else {
        name.textContent = e.name || 'unknown';
      }

      var score = document.createElement('td');
      score.className = 'score';
      score.textContent = typeof e.score === 'number'
        ? e.score.toLocaleString('en-US')
        : (e.score || '');

      tr.appendChild(rank);
      tr.appendChild(name);
      if (hasDetail) {
        var detail = document.createElement('td');
        detail.className = 'dim';
        detail.textContent = e.detail || '';
        tr.appendChild(detail);
      }
      tr.appendChild(score);
      body.appendChild(tr);
    });

    t.appendChild(body);
    host.appendChild(t);
  }

  fetch(url, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (titleEl && data.leaderboard && data.leaderboard.name) {
        titleEl.textContent = data.leaderboard.name;
      }
      if (stampEl && data.updated) {
        var d = new Date(data.updated);
        if (!isNaN(d)) stampEl.textContent = 'updated ' + d.toISOString().slice(0, 10);
      }

      if (data.status === 'ok' && Array.isArray(data.entries) && data.entries.length) {
        table(data);
      } else {
        pending(data.note || 'No standings yet.');
      }
    })
    .catch(function () {
      pending('Standings are not available right now.');
    });
})();
