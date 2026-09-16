/* ==========================================================================
   hud.js — the instruments.

   EVERY NUMBER ON SCREEN IS REAL. The clock is a real clock in Asia/Kolkata,
   the coordinates are the real pointer, the point count is the real point
   count, uptime is real uptime, and coherence is derived from the substrate's
   actual phase energy. Nothing here is a decorative digit rolling for effect.

   That is what buys the tone. The readouts are trustworthy, so when one of
   them says something it has no business saying, it lands as an observation
   rather than as set dressing. Dry, with cracks — and the cracks only work
   because everything around them is load-bearing.
   ========================================================================== */
window.PAGE.register('hud', function (scope) {
  'use strict';

  var $ = function (s) { return scope.querySelector(s); };

  var dot = $('[data-hud-dot]');
  var elPhase = $('[data-hud-phase]'), elState = $('[data-hud-state]');
  var elCoh = $('[data-hud-coh]');
  var elUp = $('[data-hud-uptime]');
  var elTime = $('[data-clock-time]');
  var elProgN = $('[data-hud-progn]'), elProgBar = $('[data-hud-progbar]');
  var log = $('[data-hud-log]');

  var PHASES = window.SUBSTRATE_PHASES || [];

  /* ---- the log ------------------------------------------------------------
     Three lines per phase. The first two are descriptive and true; the third
     is where the instrument stops being purely an instrument. */
  /* THE NUMBERS ARE THE REAL ONES. Three of these had gone false as the
     geometry moved underneath them — it claimed 15 planes where
     makeSection cuts 14, 84 nodes for what is now a branching colony, and
     190 bodies for a network of 64. A readout that lies is worse than no
     readout, and this file's own header promises it does not.

     Each figure below is a constant in js/substrate.js: SLICES, CH, NODES.
     If you change one there, change it here — or better, have that file
     publish it the way it already publishes PHASES. */
  var LINES = {
    0: ['lattice holding', 'no deformation detected', 'subject is being cooperative'],
    1: ['14 planes separated', 'internal structure exposed', 'it was always like this inside'],
    2: ['34 chambers excavated', 'branching to the fourth order', 'two galleries end in nothing'],
    3: ['64 bodies linked', 'no central coordination', 'this was the intention'],
    4: ['coherence below threshold', 'no structure recoverable', 'holding the shape anyway']
  };
  var AMBIENT = [
    'observer still present',
    'substrate appears to respond to observation',
    'this is expected',
    'recalibrating for no particular reason',
    'nothing has gone wrong yet'
  ];

  var MAXLOG = 5;
  function push(text, hi) {
    if (!log) return;
    var p = document.createElement('p');
    p.innerHTML = '<span class="dim">//</span> ' + text;
    if (hi) p.className = 'hi';
    log.appendChild(p);
    while (log.children.length > MAXLOG) log.removeChild(log.firstChild);
  }

  push('observation window open');

  var lastPhase = -1, ambientAt = performance.now() + 9000;

  /* Coherence is the page's one falling number, so it is the page's one
     piece of suspense. Each mark fires once. */
  var COH_MARKS = [
    [0.78, 'coherence 0.78 // within tolerance', false],
    [0.55, 'coherence 0.55 // drift accumulating', false],
    [0.40, 'coherence 0.40 // below nominal', true],
    [0.25, 'coherence 0.25 // structure not recoverable', true],
    [0.12, 'system state: unstable', true]
  ];
  var cohSaid = [], saidFail = false;

  /* ---- pointer ----------------------------------------------------------- */
  var mx = 0, my = 0;
  function onMove(e) { mx = e.clientX; my = e.clientY; }
  window.addEventListener('pointermove', onMove);

  /* ---- clock -------------------------------------------------------------
     Real Asia/Kolkata time via Intl, not an offset applied to the local
     clock — the latter is wrong for half the year in half the world. */
  var fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hour12: false
    });
  } catch (e) { fmt = null; }

  var t0 = Date.now();
  function pad(n, w) { return String(n).padStart(w, '0'); }

  var clockTimer = setInterval(function () {
    if (elTime) elTime.textContent = fmt ? fmt.format(new Date()) : '--:--:--';
    if (elUp) {
      var s = Math.floor((Date.now() - t0) / 1000);
      elUp.textContent = pad(Math.floor(s / 3600), 2) + ':' +
                         pad(Math.floor(s / 60) % 60, 2) + ':' + pad(s % 60, 2);
    }
  }, 1000);


  /* ---- the frame --------------------------------------------------------- */
  var raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    var S = window.SUBSTRATE;
    if (!S) return;

    // the dot inside the observation window
    if (dot) {
      dot.style.left = (mx / window.innerWidth * 100) + '%';
      dot.style.top  = (my / window.innerHeight * 100) + '%';
    }

    var idx = Math.round(Math.min(S.progress, PHASES.length - 1));
    if (elPhase) elPhase.textContent = PHASES[idx] || '--';

    /* Coherence falls as the material loses structure, and dips further
       while it is actually in transit between two states. */
    var coh = Math.max(0, 1 - S.energy * 0.82 - Math.sin(S.morph * Math.PI) * 0.18);
    if (elCoh) {
      elCoh.textContent = coh.toFixed(3);
      /* The one readout that is going somewhere. It turns as it falls, so
         the number is doing the storytelling rather than just existing. */
      elCoh.classList.toggle('is-low', coh < 0.32);
    }

    /* STATE ESCALATES WITH COHERENCE rather than reporting two booleans.
       The old version said 'stable' for four fifths of the page and then
       'unstable' at the very end, which is a light switch, not a descent —
       and the descent is the thing the ending has to earn. */
    if (elState) {
      var st;
      if (S.tearRed > 0.02)        st = 'containment failed';
      else if (coh > 0.78)         st = 'stable';
      else if (coh > 0.55)         st = 'drifting';
      else if (coh > 0.32)         st = 'degrading';
      else if (coh > 0.12)         st = 'unstable';
      else                         st = 'critical';
      elState.textContent = st;
      elState.classList.toggle('is-low', coh < 0.32 || S.tearRed > 0.02);
    }

    /* THE LOG NARRATES THE FALL. Thresholds, crossed once each and only
       downward — a reading that flickers as the visitor scrolls a few
       pixels back and forth would make the instrument look unreliable,
       which is the opposite of what everything else here is doing. */
    for (var ci = 0; ci < COH_MARKS.length; ci++) {
      if (!cohSaid[ci] && coh <= COH_MARKS[ci][0]) {
        cohSaid[ci] = true;
        push(COH_MARKS[ci][1], COH_MARKS[ci][2]);
      }
    }
    if (!saidFail && S.tearRed > 0.03) {
      saidFail = true;
      push('containment failed', true);
      setTimeout(function () { push('observation concluded'); }, 420);
    }

    var pr = S.scrollProgress || 0;
    if (elProgN) elProgN.textContent = pad(Math.round(pr * 100), 3);
    if (elProgBar) elProgBar.style.width = (pr * 100) + '%';

    if (idx !== lastPhase) {
      lastPhase = idx;
      var set = LINES[idx] || [];
      push('phase ' + (PHASES[idx] || '--'), true);
      set.forEach(function (l, i) { setTimeout(function () { push(l); }, 320 * (i + 1)); });
      ambientAt = now + 14000;
    }
    /* Text that rewrites itself unprompted is motion, and it is the one
       piece of motion here a screen reader would also announce. */
    if (now > ambientAt && !window.DORMANT.reduced) {
      push(AMBIENT[Math.floor(Math.random() * AMBIENT.length)]);
      ambientAt = now + 12000 + Math.random() * 10000;
    }
  }
  raf = requestAnimationFrame(tick);

  return function teardown() {
    cancelAnimationFrame(raf);
    clearInterval(clockTimer);
    window.removeEventListener('pointermove', onMove);
  };
});


/* ==========================================================================
   chrome — the scramble hover and the address button.
   ========================================================================== */
window.PAGE.register('chrome', function (scope) {
  'use strict';

  /* ---- scramble ----------------------------------------------------------
     Resolves toward the real label rather than settling all at once, so the
     word arrives left to right. Uses the label's own characters as the
     alphabet, which keeps the width from jumping around mid-hover. */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*+';
  var timers = [];

  Array.prototype.forEach.call(scope.querySelectorAll('[data-scramble]'), function (el) {
    var label = el.querySelector('[data-label]');
    if (!label) return;
    var real = label.textContent, t = null, f = 0;

    el.addEventListener('pointerenter', function () {
      f = 0;
      clearInterval(t);
      t = setInterval(function () {
        f += 1;
        var out = '';
        for (var i = 0; i < real.length; i++) {
          out += (i < f / 2) ? real[i]
               : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        label.textContent = out;
        if (f / 2 >= real.length) { clearInterval(t); label.textContent = real; }
      }, 28);
      timers.push(t);
    });
    el.addEventListener('pointerleave', function () {
      clearInterval(t); label.textContent = real;
    });
  });

  /* ---- the address -------------------------------------------------------
     Copies on the first click, like a button should. The joke is in the
     counter, not in withholding the thing the visitor asked for. */
  var mail = scope.querySelector('[data-copy-email]');
  if (mail) {
    var label = mail.querySelector('[data-label]');
    var n = 0, revert = null;
    var NOTES = ['copied', 'copied again', 'still the same address',
                 'it has not changed', 'copied · 5'];
    mail.addEventListener('click', function () {
      var addr = mail.dataset.copyEmail;
      var done = function () {
        label.textContent = NOTES[Math.min(n, NOTES.length - 1)];
        n++;
        clearTimeout(revert);
        revert = setTimeout(function () { label.textContent = 'copy address'; }, 2600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(done, done);
      } else { done(); }
    });
  }

  return function () { timers.forEach(clearInterval); };
});
