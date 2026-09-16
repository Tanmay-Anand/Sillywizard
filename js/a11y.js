/* ==========================================================================
   a11y.js — making the content reachable without the effects.

   THE PROBLEM A VIRTUAL SCROLL CREATES
   body{overflow:hidden} and a transform-driven track mean the browser has
   no idea where anything is. Its two automatic accessibility behaviours
   both stop working:

     1. Tabbing to an off-screen control normally scrolls it into view. Here
        there is nothing to scroll, so focus lands on a link the visitor
        cannot see — the single worst keyboard failure a page can have.
     2. A fragment link (#copy) normally jumps. Here it does nothing.

   Both are fixed the same way: watch for focus, work out which phase the
   focused element belongs to, and drive window.GOTO — the one door into the
   scroll accumulator — so the phase eases on screen exactly as it would
   under a wheel gesture.

   WHAT IS AND IS NOT DECORATIVE
   The instrument panel is aria-hidden: it is ambient telemetry and reading
   "coherence 0.418" aloud helps nobody. The FOOTER is not — it holds the
   only contact links on the site, and it shipped aria-hidden, which hid
   them from every screen reader. The copy itself stays in the DOM in
   reading order at all times, so the portfolio is legible with every visual
   effect switched off.
   ========================================================================== */
window.PAGE.register('a11y', function (scope) {
  'use strict';

  var panes = Array.prototype.slice.call(scope.querySelectorAll('.pane'));
  var ftr   = scope.querySelector('#ftr');

  /* ---- focus follows the scroll ---------------------------------------- */
  function onFocusIn(e) {
    var el = e.target;
    if (!el || typeof window.GOTO !== 'function') return;

    // a control inside the footer: bring the footer up
    if (ftr && ftr.contains(el)) { window.GOTO(panes.length); return; }

    // a control inside a phase: bring that phase on screen
    var pane = el.closest ? el.closest('.pane') : null;
    if (pane) {
      var i = panes.indexOf(pane);
      if (i >= 0) window.GOTO(i);
    }
  }
  document.addEventListener('focusin', onFocusIn);

  /* ---- the skip link --------------------------------------------------- */
  var skip = scope.querySelector('.skip');
  function onSkip(e) {
    e.preventDefault();
    if (typeof window.GOTO === 'function') window.GOTO(0);
    var stage = scope.querySelector('#stage');
    if (stage) stage.focus();
  }
  if (skip) skip.addEventListener('click', onSkip);

  /* ---- reduced motion -------------------------------------------------
     js/substrate.js already reads DORMANT.reduced to stop the drift and the
     spin, and css/base.css collapses the reveal animations and the grain.
     What is left is this file's job: the ambient log, which rewrites itself
     every twelve seconds or so. Text that changes on its own is exactly the
     kind of motion the preference is asking us to stop, and it is also the
     one piece of motion a screen reader would announce. */
  if (window.DORMANT.reduced) {
    document.documentElement.classList.add('is-reduced');
  }

  return function () {
    document.removeEventListener('focusin', onFocusIn);
    if (skip) skip.removeEventListener('click', onSkip);
  };
});
