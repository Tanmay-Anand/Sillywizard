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

  var PHASES = window.SUBSTRATE_PHASES || [];

  /* THE LOG IS GONE. A five-line narration in the bottom-left corner that
     rewrote itself on every phase change and every ten seconds or so -
     removed at the owner's request, along with everything that fed it: the
     per-phase lines, the ambient lines and the coherence thresholds. The
     readouts that remain (phase, state, coherence, uptime, scroll) are
     unchanged. */

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

    var pr = S.scrollProgress || 0;
    if (elProgN) elProgN.textContent = pad(Math.round(pr * 100), 3);
    if (elProgBar) elProgBar.style.width = (pr * 100) + '%';

  }
  raf = requestAnimationFrame(tick);

  return function teardown() {
    cancelAnimationFrame(raf);
    clearInterval(clockTimer);
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
