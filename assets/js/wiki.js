/* The block wiki: renders data/blocks.json, filtered by category and text. */
(function () {
  'use strict';

  var list   = document.getElementById('list');
  var cats   = document.getElementById('cats');
  var input  = document.getElementById('filter');
  var count  = document.getElementById('count');
  var nohits = document.getElementById('nohits');
  var items  = document.getElementById('items');
  if (!list) return;

  var DATA = null;
  var active = 'all';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function colorOf(id) {
    var c = DATA.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.color : 'green';
  }

  function labelOf(id) {
    var c = DATA.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.label : id;
  }

  /* ------------------------------------------------------------ one block */

  function card(b) {
    var wrap = el('article', 'bk');
    wrap.id = 'block-' + b.id;

    var stripe = el('div', 'bk__stripe');
    stripe.style.background = 'var(--' + colorOf(b.category) + ')';
    wrap.appendChild(stripe);

    var head = el('div', 'bk__head');
    head.appendChild(el('span', 'bk__name', b.name));
    head.appendChild(el('span', 'bk__id', b.id));

    var tags = el('div', 'bk__tags');
    tags.appendChild(el('span', 'tag', labelOf(b.category)));
    tags.appendChild(el('span', 'tag tag--' + (b.cost === 0 ? 'free' : 'cost'),
      b.cost === 0 ? 'free' : b.cost + ' op' + (b.cost === 1 ? '' : 's')));
    if (b.module === 'sensor') tags.appendChild(el('span', 'tag tag--sensor', 'needs sensor'));
    if (b.terminal) tags.appendChild(el('span', 'tag tag--terminal', 'ends the program'));
    if (b.origin === 'mod') tags.appendChild(el('span', 'tag tag--mod', 'mod: ' + b.mod));
    head.appendChild(tags);
    wrap.appendChild(head);

    var body = el('div', 'bk__body');
    body.appendChild(el('p', 'bk__desc', b.desc));

    var ports = el('div', 'ports');

    function group(title, rows) {
      if (!rows.length) return;
      var g = el('div');
      g.appendChild(el('h4', null, title));
      var ul = el('ul');
      rows.forEach(function (r) {
        var li = el('li');
        li.appendChild(el('b', null, r.head));
        if (r.tail) li.appendChild(el('i', null, r.tail));
        ul.appendChild(li);
      });
      g.appendChild(ul);
      ports.appendChild(g);
    }

    group('Parameters', (b.params || []).map(function (p) {
      var range = '';
      if (p.options) range = p.options.join(' | ');
      else if (p.min != null) range = p.min + '…' + p.max;
      else if (p.type) range = p.type;
      var tail = range;
      if (p.default !== undefined) tail += (tail ? '  ·  ' : '') + 'default ' + p.default;
      if (p.desc) tail += '  ·  ' + p.desc;
      return { head: p.id, tail: tail };
    }));

    group('Inputs', (b.inputs || []).map(function (p) {
      return { head: p.id, tail: p.type + (p.desc ? '  ·  ' + p.desc : '') };
    }));

    group('Outputs', (b.outputs || []).map(function (p) {
      return { head: p.id, tail: p.type + (p.desc ? '  ·  ' + p.desc : '') };
    }));

    group('Exec branches', (b.exec || []).map(function (p) {
      return { head: p.id, tail: p.desc || '' };
    }));

    if (ports.children.length) body.appendChild(ports);
    if (b.note) body.appendChild(el('p', 'bk__note', b.note));

    // Things the ports list cannot show.
    var flags = [];
    if (b.execIn === false && (!b.exec || !b.exec.length)) {
      flags.push('No exec ports — this runs only when a data wire reads it.');
    }
    if (b.id === 'start') flags.push('Nothing may flow into Start: it is where flow begins.');
    if (flags.length) body.appendChild(el('p', 'bk__note', flags.join(' ')));

    wrap.appendChild(body);
    return wrap;
  }

  /* ---------------------------------------------------------------- render */

  function matches(b, q) {
    if (active !== 'all' && b.category !== active) return false;
    if (!q) return true;
    var hay = (b.name + ' ' + b.id + ' ' + b.desc + ' ' + (b.note || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function render() {
    var q = (input.value || '').trim().toLowerCase();
    list.innerHTML = '';
    var n = 0;

    DATA.categories.forEach(function (c) {
      var group = DATA.blocks.filter(function (b) {
        return b.category === c.id && matches(b, q);
      });
      if (!group.length) return;

      var h = el('h3', 'eyebrow');
      h.style.marginTop = n ? '22px' : '0';
      h.appendChild(document.createTextNode(c.label));
      list.appendChild(h);

      group.forEach(function (b) { list.appendChild(card(b)); n++; });
    });

    nohits.hidden = n > 0;
    count.textContent = n + ' shown';
  }

  /* -------------------------------------------------------------- sidebar */

  function buildCats() {
    var all = [{ id: 'all', label: 'All blocks', color: 'green' }].concat(DATA.categories);

    all.forEach(function (c) {
      var li = el('li');
      var b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(c.id === active));
      b.dataset.cat = c.id;

      var sw = el('span', 'swatch swatch--' + c.color);
      var label = el('span', null, c.label);
      var n = el('span', 'n', String(c.id === 'all'
        ? DATA.blocks.length
        : DATA.blocks.filter(function (x) { return x.category === c.id; }).length));

      b.appendChild(sw);
      b.appendChild(label);
      b.appendChild(n);

      b.addEventListener('click', function () {
        active = c.id;
        cats.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.dataset.cat === active));
        });
        render();
      });

      li.appendChild(b);
      cats.appendChild(li);
    });
  }

  function buildItems() {
    DATA.items.forEach(function (it) {
      var row = el('div', 'row');
      var dt = el('dt', null, it.name);
      var dd = el('dd');
      dd.textContent = it.desc + ' ';

      var meta = el('span', 'dim');
      meta.textContent = '(score ' + it.score + ' · weight ' + it.weight +
        ' · ' + (it.grows ? 'lengthens you' : 'does not lengthen you') +
        (it.origin === 'mod' ? ' · from mod ' + it.mod : '') + ')';
      dd.appendChild(meta);

      row.appendChild(dt);
      row.appendChild(dd);
      items.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ boot */

  fetch('data/blocks.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      DATA = data;
      buildCats();
      buildItems();
      render();

      input.addEventListener('input', render);

      // Deep link: wiki.html#block-move_forward scrolls to and flashes a block.
      if (location.hash) {
        var target = document.querySelector(location.hash);
        if (target) {
          target.scrollIntoView({ block: 'center' });
          target.style.borderColor = 'var(--amber)';
        }
      }
    })
    .catch(function () {
      list.innerHTML = '<div class="no-hits">Could not load <code>data/blocks.json</code>. ' +
        'If you are opening this file straight from disk, serve the folder over HTTP instead ' +
        '&mdash; browsers block <code>fetch</code> on <code>file://</code>.</div>';
    });
})();
