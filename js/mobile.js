/* ==========================================================================
   mobile.js — the phone build's only moving parts.

   WHAT THE PHONE DOES NOT RUN: js/substrate.js, js/tear.js, js/scroll.js,
   js/hud.js, js/loader.js. That is two WebGL contexts, 80k points a frame,
   a full-screen noise quad and a virtual scroll accumulator — none of which
   a phone should be asked to pay for so a backdrop can drift. The subject
   is a static PNG rendered at build time by tools/make-og.py from the same
   construction, and the document scrolls natively.

   WHAT SURVIVES, because it is the site rather than the effects: the type
   scale, the microtype, the red, the copy, the tone, the bar, and a real
   clock. The telemetry is genuine here too — the same rule as the desktop
   HUD. A phone build that fakes its readouts would be the one place the
   whole conceit is obviously a costume.

   TWO OBSERVERS AND AN INTERVAL. That is the entire per-frame cost, and
   none of it is per-frame: IntersectionObserver fires on crossings, not on
   scroll, so a fast flick costs nothing between the two ends of it.
   ========================================================================== */
window.PAGE.register('mobile', function (scope) {
  'use strict';
  if (!document.documentElement.classList.contains('is-mobile')) return;

  var readPhase = scope.querySelector('[data-m-phase]');
  var readTime  = scope.querySelector('[data-m-time]');
  var panes     = Array.prototype.slice.call(scope.querySelectorAll('.pane'));
  var lightZone = scope.querySelector('.pane--field');

  /* ---- the phase readout ------------------------------------------------
     Whichever section owns the middle of the screen is the current phase.
     A rootMargin that collapses the viewport to a thin band across its
     centre gives exactly that, with no scroll handler at all. */
  var seen = null;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var name = (e.target.getAttribute('aria-label') || '').split(', ')[1] || '--';
      if (name !== seen && readPhase) { seen = name; readPhase.textContent = name.toUpperCase(); }
    });
  }, { rootMargin: '-49% 0px -49% 0px', threshold: 0 });
  panes.forEach(function (p) { io.observe(p); });

  /* ---- the distance fade -----------------------------------------------
     A SECOND, WIDER BAND than the phase readout above. That one collapses
     the viewport to a line so exactly one section can own it; this one
     leaves a third of the screen, so a section is already bright before it
     reaches the middle and stays bright for a moment after. Sharing one
     observer would mean choosing between a phase readout that flickers
     between two names and a fade that snaps.

     Sections start unmarked and CSS leaves them at full opacity, so the
     worst case if this never runs is a page that simply does not fade. */
  var ioFade = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target.classList.toggle('is-far', !e.isIntersecting);
    });
  }, { rootMargin: '-33% 0px -33% 0px', threshold: 0 });
  panes.forEach(function (p) { ioFade.observe(p); });

  /* ---- the ground turns -------------------------------------------------
     Driven off the light zone entering the viewport rather than a scroll
     offset, so it reverses correctly on the way back up and needs no
     measurement when the address bar resizes the viewport mid-scroll —
     which on a phone it constantly does. */
  var io2 = null;
  if (lightZone) {
    io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        document.body.classList.toggle('is-light', e.isIntersecting || e.boundingClientRect.top < 0);
      });
      /* THE BAND IS AT THE TOP, SO THE GROUND HAS TO TURN AT THE TOP.

         This used to collapse the root to a line across the middle, which is
         right for a phase readout and wrong for a ground: the object's band
         is pinned under the header, so a flip timed to the centre turned the
         band light while MESH was still filling the screen underneath it — a
         pale panel with the wizard in it sitting on dark copy, with the
         band's edge gradient painting light over that copy.

         Shrinking the root to the top ~36% instead means the ground turns as
         the light section reaches the underside of the band, so the band and
         the paper below it change together. */
    }, { rootMargin: '0px 0px -64% 0px', threshold: 0 });
    io2.observe(lightZone);
  }

  /* ---- the red consumes the object -------------------------------------
     On desktop the footer's red ground burns the subject away: the shader
     multiplies the cloud's alpha by the tear, so the wizard is gone by the
     time OBSERVATION CONCLUDED is readable. The phone's object is a fixed
     band, which means without this it stays pinned over the ending — 260px
     of dark panel with a wizard in it, sitting on the red.

     Same observer shape as the two above, for the same reason: a crossing,
     not a scroll handler. */
  var ender = document.querySelector('.ftr');
  var io3 = null;
  if (ender) {
    io3 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        document.body.classList.toggle('is-ending',
          e.isIntersecting || e.boundingClientRect.top < 0);
      });
    }, { rootMargin: '0px 0px -55% 0px', threshold: 0 });
    io3.observe(ender);
  }

  /* ---- a real clock, same as the desktop bar ---------------------------- */
  var fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hour12: false
    });
  } catch (e) { fmt = null; }

  var barTime = scope.querySelector('[data-clock-time]');
  var timer = setInterval(function () {
    var t = fmt ? fmt.format(new Date()) : '--:--:--';
    if (readTime) readTime.textContent = t;
    if (barTime) barTime.textContent = t;
  }, 1000);

  /* The bar's phase buttons scroll to their section instead of driving an
     accumulator that does not exist on this build. */
  var btns = scope.querySelectorAll('[data-goto]');
  function onGoto(e) {
    var i = parseInt(e.currentTarget.dataset.goto, 10);
    if (panes[i]) panes[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  Array.prototype.forEach.call(btns, function (b) { b.addEventListener('click', onGoto); });

  return function () {
    io.disconnect(); ioFade.disconnect();
    if (io2) io2.disconnect(); if (io3) io3.disconnect();
    clearInterval(timer);
    Array.prototype.forEach.call(btns, function (b) { b.removeEventListener('click', onGoto); });
  };
});
