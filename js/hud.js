/* ==========================================================================
   hud.js — the instruments.

   EVERY NUMBER ON SCREEN IS REAL. The coordinates are the real pointer and
   the scroll readout is the real scroll. Nothing here is a decorative digit
   rolling for effect.

   That is what buys the tone. The readouts are trustworthy, so when one of
   them says something it has no business saying, it lands as an observation
   rather than as set dressing. Dry, with cracks — and the cracks only work
   because everything around them is load-bearing.
   ========================================================================== */
window.PAGE.register('hud', function (scope) {
  'use strict';

  var $ = function (s) { return scope.querySelector(s); };

  var dot = $('[data-hud-dot]');
  var elPhase = $('[data-hud-phase]');
  var elProgN = $('[data-hud-progn]'), elProgBar = $('[data-hud-progbar]');

  var PHASES = window.SUBSTRATE_PHASES || [];

  /* THE LOG IS GONE. A five-line narration in the bottom-left corner that
     rewrote itself on every phase change and every ten seconds or so -
     removed at the owner's request, along with everything that fed it: the
     per-phase lines, the ambient lines and the coherence thresholds. The
     readouts that remain (phase, scroll) are unchanged. OBSERVER, UPTIME,
     STATE and COHERENCE went the same way, also at the owner's request. */

  /* ---- pointer ----------------------------------------------------------- */
  var mx = 0, my = 0;
  function onMove(e) { mx = e.clientX; my = e.clientY; }
  window.addEventListener('pointermove', onMove);

  /* NO WALL CLOCK. The bar used to show a live local time and its UTC
     offset, which told every visitor roughly where the owner lives - removed
     at the owner's request, as was the uptime counter that replaced it. */
  function pad(n, w) { return String(n).padStart(w, '0'); }   // the SCROLL readout


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

    var pr = S.scrollProgress || 0;
    if (elProgN) elProgN.textContent = pad(Math.round(pr * 100), 3);
    if (elProgBar) elProgBar.style.width = (pr * 100) + '%';

  }
  raf = requestAnimationFrame(tick);

  return function teardown() {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
  };
});


/* ==========================================================================
   chrome — the scramble hover on the bar and footer links.
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

  return function () { timers.forEach(clearInterval); };
});
