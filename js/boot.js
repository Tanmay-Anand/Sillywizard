/* ==========================================================================
   boot.js — mount everything, once.
   Last script on the page, so every module has registered by the time this
   runs. Kept separate from lifecycle.js so the registry stays a registry.
   ========================================================================== */
(function () {
  'use strict';
  function go() {
    /* ?off=grain and ?off=copy act on the DOM rather than on a renderer, so
       they are applied here, once, instead of being checked per frame. */
    if (window.OFF.has('grain')) { var g = document.querySelector('.grain'); if (g) g.remove(); }
    if (window.OFF.has('copy'))  { var c = document.getElementById('stage'); if (c) c.style.display = 'none'; }
    /* THE TWO BUILDS. Not a responsive stylesheet over one runtime — the
       phone genuinely does not construct the WebGL contexts, the point
       buffers or the scroll accumulator. See css/mobile.css. */
    var MOBILE = ['mobile', 'chrome', 'a11y', 'fps'];
    var isMobile = document.documentElement.classList.contains('is-mobile');
    window.PAGE.mount(document, isMobile ? MOBILE : null);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go);
  } else { go(); }

  /* ---- crossing the breakpoint reloads, and it has to ---------------------
     The two builds are different RUNTIMES, not two stylesheets. Which one
     is running is decided once, before the first paint, and the desktop one
     constructs WebGL contexts, point buffers and a scroll accumulator that
     the phone build never creates.

     css/mobile.css, though, is a media query — it re-evaluates on every
     resize. So dragging a window across 760px, or turning a tablet on its
     side, left the two disagreeing: the DESKTOP layout laid out over the
     MOBILE runtime, which renders the composition with no subject in it,
     because nothing ever mounted the renderer. That is exactly what a
     stale build looks like and it is very hard to diagnose from the
     symptom.

     Mounting the missing modules on the fly is not the fix it appears to
     be: the phone build has already let the document scroll natively and
     the desktop build needs that gone, so the two cannot be swapped in
     place without unwinding state neither of them tracks. A reload is one
     line, always correct, and only ever happens on a deliberate resize. */
  /* Reads the SAME --build token the pre-paint switch reads, rather than a
     second copy of the breakpoint — see css/base.css. Debounced because
     resize fires continuously during a window drag and getComputedStyle
     forces a style recalc. */
  var root = document.documentElement;
  var wasMobile = root.classList.contains('is-mobile');
  var t = 0;
  function onCross() {
    clearTimeout(t);
    t = setTimeout(function () {
      var nowMobile = getComputedStyle(root).getPropertyValue('--build').trim() === 'mobile'
                   && !/[?&]desktop(&|=|$)/.test(location.search);
      if (nowMobile !== wasMobile) location.reload();
    }, 150);
  }
  window.addEventListener('resize', onCross);
})();
