/* The Perimeter demo.
 *
 * Runs the actual three-block solution to the fifth puzzle against a walled
 * room, one tick at a time, with the same rules the game uses: a tick ends at
 * the first action, blocks charge ops, and a chain that runs out of wire
 * returns to Start. Nothing here is a canned animation — the path is whatever
 * the program produces.
 */
(function () {
  'use strict';

  var board = document.getElementById('board');
  var chain = document.getElementById('chain');
  if (!board || !chain) return;

  var W = 14, H = 7;              // including the wall border
  var TICK_MS = 420;
  var LENGTH = 4;

  /* --------------------------------------------------------------- program */

  var PROGRAM = [
    { id: 'start', name: 'Start', cat: 'event', cost: 0, ports: ['out'] },
    { id: 'wall_ahead', name: 'Wall Ahead?', cat: 'sensing', cost: 1, ports: ['yes', 'no'] },
    { id: 'turn_right', name: 'Turn Right', cat: 'action', cost: 1, ports: ['out'] },
    { id: 'move_forward', name: 'Move Forward', cat: 'action', cost: 1, ports: ['out'] },
  ];

  var nodes = PROGRAM.map(function (b, i) {
    var el = document.createElement('div');
    el.className = 'node node--' + b.cat;
    el.innerHTML =
      '<div class="node__head"><span>' + b.name + '</span>' +
      '<span class="node__cost">' + b.cost + 'op</span></div>' +
      '<div class="node__body">' + b.id + '</div>' +
      '<div class="node__ports">' +
        b.ports.map(function (p) {
          return '<span class="node__port" data-port="' + p + '">' + p + '</span>';
        }).join('') +
      '</div>';
    chain.appendChild(el);

    if (i === 1) {
      var w = document.createElement('div');
      w.className = 'wirelink';
      w.textContent = 'yes → Turn Right   ·   no → Move Forward';
      chain.appendChild(w);
    }
    return el;
  });

  function light(index, port) {
    nodes.forEach(function (n) { n.removeAttribute('data-live'); });
    chain.querySelectorAll('.node__port').forEach(function (p) {
      p.removeAttribute('data-taken');
    });
    if (index == null) return;
    nodes[index].setAttribute('data-live', '');
    if (port) {
      var p = nodes[index].querySelector('[data-port="' + port + '"]');
      if (p) p.setAttribute('data-taken', '');
    }
  }

  /* ----------------------------------------------------------------- world */

  var cells = [];
  board.style.gridTemplateColumns = 'repeat(' + W + ', 1fr)';
  for (var i = 0; i < W * H; i++) {
    var c = document.createElement('div');
    c.className = 'cell';
    board.appendChild(c);
    cells.push(c);
  }

  function isWall(x, y) { return x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1; }

  var snake, dir, tick;

  // Right, down, left, up — turning right steps forward through this list.
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function reset() {
    // Head at (1,1) facing right, with the rest of the body stacked underneath
    // it — the segments spread out as it takes its first steps.
    snake = [];
    for (var i = 0; i < LENGTH; i++) snake.push({ x: 1, y: 1 });
    dir = 0;
    tick = 0;
  }

  function occupied(x, y) {
    return snake.some(function (s) { return s.x === x && s.y === y; });
  }

  function draw() {
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var el = cells[y * W + x];
        var kind = '';
        if (isWall(x, y)) kind = 'wall';
        else if (snake[0].x === x && snake[0].y === y) kind = 'head';
        else if (occupied(x, y)) kind = 'body';
        if (kind) el.setAttribute('data-k', kind); else el.removeAttribute('data-k');
      }
    }
  }

  /* ------------------------------------------------------------ simulation */

  var elTick = document.getElementById('d-tick');
  var elOps  = document.getElementById('d-ops');
  var elLen  = document.getElementById('d-len');
  var elAct  = document.getElementById('d-act');

  function status(ops, action) {
    elTick.textContent = tick;
    elOps.textContent = ops + '/10';
    elLen.textContent = snake.length;
    elAct.textContent = action;
  }

  /* One tick: Start, then Wall Ahead?, then whichever action it branched to.
   * Returns after the action, exactly as the runtime does. */
  function step() {
    var head = snake[0];
    var ahead = { x: head.x + DIRS[dir][0], y: head.y + DIRS[dir][1] };
    var blocked = isWall(ahead.x, ahead.y);

    light(1, blocked ? 'yes' : 'no');
    status(1, 'sensing');

    setTimeout(function () {
      if (blocked) {
        dir = (dir + 1) % 4;
        light(2, 'out');
        status(2, 'turn_right');
      } else {
        snake.unshift({ x: ahead.x, y: ahead.y });
        snake.pop();
        light(3, 'out');
        status(2, 'move_forward');
      }
      tick++;
      elTick.textContent = tick;
      draw();
    }, Math.min(150, TICK_MS * 0.35));
  }

  /* --------------------------------------------------------------- controls */

  var timer = null;
  var held = false;              // paused by the visitor, not by scrolling away
  var playBtn = document.getElementById('d-play');
  var stepBtn = document.getElementById('d-step');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function running() { return timer !== null; }

  function play() {
    if (running()) return;
    timer = setInterval(step, TICK_MS);
    playBtn.textContent = 'PAUSE';
  }

  function pause() {
    if (!running()) return;
    clearInterval(timer);
    timer = null;
    playBtn.textContent = 'PLAY';
  }

  playBtn.addEventListener('click', function () {
    if (running()) { held = true; pause(); } else { held = false; play(); }
  });
  stepBtn.addEventListener('click', function () { held = true; pause(); step(); });

  // Don't burn cycles on a section nobody is looking at — but never override a
  // visitor who pressed pause on purpose.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) pause();
      else if (!held && !reduced) play();
    }, { threshold: 0.15 }).observe(board);
  }

  reset();
  draw();
  status(0, 'stands still');
  light(0, 'out');
  if (reduced) playBtn.textContent = 'PLAY'; else play();
})();
