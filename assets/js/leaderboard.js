/* Global standings.
 *
 * The browser never talks to Steam. Steam's Web API sends no CORS headers and
 * the leaderboard endpoints need a publisher key that must not exist in
 * client-side code — so a scheduled GitHub Action fetches the leaderboards with
 * the key held as a repository secret and commits the result as the JSON file
 * this reads. See tools/fetch-leaderboard.mjs.
 *
 * The game keeps more than one board (a free-play best and a puzzle score), so
 * the snapshot holds an array and this draws a tab per board. One board draws
 * no tabs at all — a lone tab is just a heading that looks clickable.
 */
(function () {
  'use strict';

  var host = document.getElementById('lb-body');
  if (!host) return;

  var CFG = window.SITE_CONFIG || {};
  var url = (CFG.steam && CFG.steam.leaderboardData) || 'data/leaderboard.json';

  var titleEl = document.getElementById('lb-title');
  var stampEl = document.getElementById('lb-stamp');

  /* ------------------------------------------------------------------ data */

  /* Accepts the current multi-board snapshot and the single-board shape that
   * preceded it, so a stale data file degrades to one tab instead of an error. */
  function boardsOf(doc) {
    if (Array.isArray(doc.boards) && doc.boards.length) return doc.boards;

    return [{
      key: null,
      name: (doc.leaderboard && doc.leaderboard.name) || 'Standings',
      detailLabel: doc.detailLabel || 'Detail',
      status: doc.status || 'pending',
      note: doc.note || '',
      entries: Array.isArray(doc.entries) ? doc.entries : [],
    }];
  }

  function hasRows(board) {
    return board.status === 'ok' && Array.isArray(board.entries) && board.entries.length > 0;
  }

  /* ----------------------------------------------------------------- views */

  function emptyView(message) {
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
    return box;
  }

  function tableView(board) {
    var t = document.createElement('table');
    t.className = 'lb';

    // Only show the detail column when something actually fills it — an empty
    // column under a confident heading reads as missing data.
    var hasDetail = board.entries.some(function (e) { return e.detail; });
    var cols = ['#', 'Player'];
    if (hasDetail) cols.push(board.detailLabel || 'Detail');
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
    board.entries.forEach(function (e, i) {
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
    return t;
  }

  function viewFor(board, fallbackNote) {
    return hasRows(board)
      ? tableView(board)
      : emptyView(board.note || fallbackNote || 'No standings yet.');
  }

  /* ------------------------------------------------------------------ tabs */

  /* A tablist with roving tabindex: one stop in the page's tab order, arrows
   * to move between boards. Matches how the game's own menus behave. */
  function renderTabs(boards, panel, fallbackNote) {
    var strip = document.createElement('div');
    strip.className = 'lb-tabs';
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Leaderboard');

    var tabs = boards.map(function (board, i) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'lb-tab';
      tab.textContent = board.name || 'Board ' + (i + 1);
      tab.id = 'lb-tab-' + i;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      strip.appendChild(tab);
      return tab;
    });

    function select(i, focus) {
      tabs.forEach(function (tab, j) {
        var on = i === j;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        tab.classList.toggle('is-on', on);
      });

      panel.innerHTML = '';
      panel.setAttribute('aria-labelledby', tabs[i].id);
      panel.appendChild(viewFor(boards[i], fallbackNote));

      if (focus) tabs[i].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (ev) {
        var next = ev.key === 'ArrowRight' ? i + 1
          : ev.key === 'ArrowLeft' ? i - 1
          : ev.key === 'Home' ? 0
          : ev.key === 'End' ? tabs.length - 1
          : null;
        if (next === null) return;
        ev.preventDefault();
        select((next + tabs.length) % tabs.length, true);
      });
    });

    // Open on the first board that actually has scores, so a board nobody has
    // played yet never greets a visitor with an empty table.
    var first = boards.findIndex(hasRows);
    select(first === -1 ? 0 : first, false);

    return strip;
  }

  /* ---------------------------------------------------------------- render */

  function render(doc) {
    var boards = boardsOf(doc);

    if (stampEl && doc.updated) {
      var d = new Date(doc.updated);
      if (!isNaN(d)) stampEl.textContent = 'updated ' + d.toISOString().slice(0, 10);
    }
    // With tabs the board name is already on screen; without them the panel
    // head is the only place it can go.
    if (titleEl && boards.length === 1 && boards[0].name) {
      titleEl.textContent = boards[0].name;
    }

    host.innerHTML = '';

    var panel = document.createElement('div');
    panel.id = 'lb-view';
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;

    if (boards.length > 1) {
      host.appendChild(renderTabs(boards, panel, doc.note));
      host.appendChild(panel);
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('tabindex');
      panel.appendChild(viewFor(boards[0], doc.note));
      host.appendChild(panel);
    }
  }

  function fail(message) {
    host.innerHTML = '';
    host.appendChild(emptyView(message));
  }

  fetch(url, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(render)
    .catch(function () {
      fail('Standings are not available right now.');
    });
})();
