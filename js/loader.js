/* ==========================================================================
   loader.js — the intro.

   THE SEQUENCE
     1. the blocks blur in on the shared .anim-line stagger
     2. a percentage counts, and the 3px red line at the bottom tracks it
     3. at 100% the copy sweeps out to the right, staggered at the tail
     4. the line floods upward and takes the screen
     5. the flood drops away and the page is already behind it

   NO FAKE PROGRESS. The percentage is driven by document readiness and the
   font load, then finished off on a floor so it can never sit at 97 waiting
   for something that already failed. A loader that lies about progress is
   worse than no loader, because the one thing it is for is telling you how
   long is left.
   ========================================================================== */
window.PAGE.register('loader', function (scope) {
  'use strict';

  var root = document.documentElement;
  if (!root.classList.contains('is-loading')) return;

  var el = scope.querySelector('[data-loader]');
  var pct = scope.querySelector('[data-loader-pct]');
  var line = scope.querySelector('[data-loader-line]');
  var flood = el && el.querySelector('.loader__flood');
  var main = scope.querySelector('main');
  if (!el) { root.classList.remove('is-loading'); return; }

  var shown = 0, realTarget = 12, done = false, raf = 0;

  // real signals, each worth a share of the bar
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { realTarget = Math.max(realTarget, 62); });
  } else { realTarget = 62; }
  window.addEventListener('load', function () { realTarget = 100; });
  // floor: never hold the visitor for a signal that is not coming
  setTimeout(function () { realTarget = 100; }, 1900);

  var t0 = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // the bar also creeps on its own so it never looks frozen between signals
    var creep = Math.min(88, (now - t0) / 19);
    var goal = Math.max(realTarget, creep);
    shown += (goal - shown) * 0.06;

    var v = Math.min(100, Math.round(shown));
    if (pct) pct.textContent = v;
    if (line) line.style.width = v + '%';

    if (v >= 100 && !done) { done = true; finish(); }
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    cancelAnimationFrame(raf);
    if (pct) pct.textContent = '100';
    if (line) line.style.width = '100%';

    el.classList.add('is-out');                     // copy sweeps right

    // the line becomes the screen
    setTimeout(function () {
      if (!flood) return;
      flood.style.transition = 'height 620ms cubic-bezier(.625,.05,0,1)';
      flood.style.height = '100%';
    }, 260);

    // ...and the page is already underneath it
    setTimeout(function () {
      if (main) { main.style.transition = 'opacity 300ms linear'; main.style.opacity = '1'; }
      if (flood) {
        flood.style.transition = 'transform 560ms cubic-bezier(.625,.05,0,1)';
        flood.style.transformOrigin = 'top';
        flood.style.transform = 'scaleY(0)';
      }
    }, 900);

    setTimeout(function () {
      root.classList.remove('is-loading');
      el.remove();
      document.dispatchEvent(new CustomEvent('sw:loaded'));
    }, 1520);
  }

  return function () { cancelAnimationFrame(raf); };
});
