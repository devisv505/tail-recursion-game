/* Shared page behaviour: wordmarks, navigation, link chips, screenshots. */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG || {};
  var $  = function (s, r) { return (r || document).querySelector(s); };

  /* ------------------------------------------------------------ wordmarks */

  var brand = $('#brandmark');
  if (brand && window.PixelFont) {
    PixelFont.render(brand, [
      { text: 'TAIL RECURSION', fill: 'currentColor' },
    ], { align: 'left' });
    brand.style.color = 'var(--text-bright)';
  }

  var mark = $('#wordmark');
  if (mark && window.PixelFont) {
    PixelFont.render(mark, [
      { text: 'TAIL', fill: 'var(--green)', scale: 1 },
      { text: 'RECURSION', fill: 'var(--red)', scale: 1.32 },
    ], { leading: 3 });
  }

  /* ----------------------------------------------------------------- nav */

  var btn = $('#menu-btn'), nav = $('#nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.hasAttribute('data-open');
      if (open) nav.removeAttribute('data-open'); else nav.setAttribute('data-open', '');
      btn.setAttribute('aria-expanded', String(!open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.removeAttribute('data-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* --------------------------------------------------------- link chips */

  /* One definition per destination. A null URL in config.js renders the
   * dimmed SOON variant instead of a dead link. */
  var DESTS = [
    { key: 'youtube', label: 'Watch on YouTube', cls: 'btn--yt',
      blurb: 'Devlogs and build breakdowns from the studio.' },
    { key: 'steam', label: 'Steam page', cls: '',
      blurb: 'Wishlist it there and hear about the release first.' },
    { key: 'discord', label: 'Discord', cls: '',
      blurb: 'Share programs, compare block counts, report bugs.' },
  ];

  var cta = $('#cta');
  if (cta) {
    DESTS.forEach(function (d) {
      var url = (CFG.links || {})[d.key];
      var el;
      if (url) {
        el = document.createElement('a');
        el.href = url;
        el.target = '_blank';
        el.rel = 'noopener';
        el.className = 'btn ' + d.cls;
      } else {
        el = document.createElement('span');
        el.className = 'btn btn--soon';
        el.setAttribute('role', 'note');
      }
      el.innerHTML = '<span class="btn__dot"></span>' + d.label;
      cta.appendChild(el);
    });
  }

  var links = $('#links');
  if (links) {
    DESTS.forEach(function (d) {
      var url = (CFG.links || {})[d.key];
      var el = document.createElement(url ? 'a' : 'div');
      el.className = 'linkcard';
      if (url) { el.href = url; el.target = '_blank'; el.rel = 'noopener'; }
      else { el.setAttribute('data-soon', ''); }
      el.innerHTML =
        '<b>' + d.label.replace(/^Watch on /, '') + (url ? '' : ' — soon') + '</b>' +
        '<span>' + d.blurb + '</span>';
      links.appendChild(el);
    });
  }

  /* --------------------------------------------------------- attract menu */

  var menu = $('#attract-menu');
  if (menu && CFG.menu) {
    CFG.menu.forEach(function (label, i) {
      var li = document.createElement('li');
      li.textContent = label;
      if (i === 0) li.setAttribute('data-on', '');
      menu.appendChild(li);
    });

    // Idle cursor drift, unless the visitor asked for less motion.
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      var at = 0, items = menu.children;
      setInterval(function () {
        items[at].removeAttribute('data-on');
        at = (at + 1) % items.length;
        items[at].setAttribute('data-on', '');
      }, 2400);
    }
  }

  /* ---------------------------------------------------------- screenshots */

  var shots = $('#shots');
  var openable = [];          // only the shots whose PNG actually decoded

  if (shots && CFG.screenshots) {
    CFG.screenshots.forEach(function (s, index) {
      var fig = document.createElement('figure');
      fig.className = 'shot';
      fig.style.margin = '0';

      // A button, so the lightbox opens from the keyboard as well as a click.
      // Disabled until the image loads — a placeholder has nothing to show.
      var frame = document.createElement('button');
      frame.type = 'button';
      frame.className = 'shot__frame';
      frame.disabled = true;
      frame.setAttribute('aria-label', 'Enlarge screenshot: ' + s.title);

      // The placeholder goes in first and is removed once the PNG decodes, so
      // a frame is never blank — not while lazy-loading, and not when the file
      // does not exist yet.
      var miss = document.createElement('div');
      miss.className = 'shot__miss';
      miss.innerHTML = 'Screenshot pending<br><code>assets/screenshots/' + s.file + '</code>';

      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = s.title + ' — ' + s.caption;
      img.style.position = 'relative';
      img.style.zIndex = '1';
      img.addEventListener('load', function () {
        miss.remove();
        frame.disabled = false;
        openable.push({ src: img.src, title: s.title, caption: s.caption, order: index });
        openable.sort(function (a, b) { return a.order - b.order; });
      });
      img.addEventListener('error', function () { img.remove(); });
      img.src = 'assets/screenshots/' + s.file;

      frame.addEventListener('click', function () {
        var at = openable.findIndex(function (o) { return o.order === index; });
        if (at >= 0) lightbox.open(at, frame);
      });

      frame.appendChild(img);
      frame.appendChild(miss);

      var cap = document.createElement('figcaption');
      cap.className = 'shot__cap';
      cap.innerHTML = '<b>' + s.title + '</b><span>' + s.caption + '</span>';

      fig.appendChild(frame);
      fig.appendChild(cap);
      shots.appendChild(fig);
    });
  }

  /* ------------------------------------------------------------- lightbox */

  var lightbox = (function () {
    var root, img, title, cap, prev, next, returnTo, at = 0;

    function build() {
      root = document.createElement('div');
      root.className = 'lightbox';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Screenshot');

      root.innerHTML =
        '<div class="lightbox__frame">' +
          '<img class="lightbox__img" alt="">' +
          '<div class="lightbox__bar">' +
            '<span class="lightbox__title"></span>' +
            '<span class="lightbox__cap"></span>' +
            '<span class="lightbox__ctrl">' +
              '<button class="btn" data-prev type="button">&#8592; PREV</button>' +
              '<button class="btn" data-next type="button">NEXT &#8594;</button>' +
              '<button class="btn" data-close type="button">CLOSE</button>' +
            '</span>' +
            '<span class="lightbox__hint">esc closes &nbsp;·&nbsp; arrows move</span>' +
          '</div>' +
        '</div>';

      img = root.querySelector('.lightbox__img');
      title = root.querySelector('.lightbox__title');
      cap = root.querySelector('.lightbox__cap');
      prev = root.querySelector('[data-prev]');
      next = root.querySelector('[data-next]');

      // Backdrop click closes; a click on the frame itself must not.
      root.addEventListener('click', function (e) { if (e.target === root) close(); });
      root.querySelector('[data-close]').addEventListener('click', close);
      prev.addEventListener('click', function () { show(at - 1); });
      next.addEventListener('click', function () { show(at + 1); });

      document.body.appendChild(root);
    }

    function show(i) {
      if (i < 0 || i >= openable.length) return;
      at = i;
      var s = openable[at];
      img.src = s.src;
      img.alt = s.title + ' — ' + s.caption;
      title.textContent = s.title;
      cap.textContent = s.caption;
      prev.disabled = at === 0;
      next.disabled = at === openable.length - 1;
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(at - 1);
      else if (e.key === 'ArrowRight') show(at + 1);
    }

    function open(i, opener) {
      if (!root) build();
      returnTo = opener || null;
      show(i);
      root.hidden = false;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      root.querySelector('[data-close]').focus();
    }

    function close() {
      if (!root || root.hidden) return;
      root.hidden = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (returnTo) returnTo.focus();
    }

    return { open: open, close: close };
  })();

  /* ------------------------------------------------- block category cards */

  var preview = $('#cat-preview');
  if (preview) {
    fetch('data/blocks.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var counts = {};
        data.blocks.forEach(function (b) {
          if (b.origin === 'mod') return;   // the example mod is not part of the count
          counts[b.category] = (counts[b.category] || 0) + 1;
        });

        data.categories.forEach(function (c) {
          var n = counts[c.id] || 0;
          var card = document.createElement('article');
          card.className = 'card';
          card.innerHTML =
            '<span class="card__n"><span class="swatch swatch--' + c.color + '" ' +
              'style="display:inline-block;width:9px;height:9px;margin-right:8px;' +
              'vertical-align:middle"></span>' + n + ' block' + (n === 1 ? '' : 's') + '</span>' +
            '<h3>' + c.label + '</h3>' +
            '<p>' + c.blurb + '</p>';
          preview.appendChild(card);
        });
      })
      .catch(function () {
        preview.innerHTML = '<div class="card"><p class="dim">' +
          'Block data could not be loaded. Open the ' +
          '<a href="wiki.html">wiki</a> instead.</p></div>';
      });
  }
})();
