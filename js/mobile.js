/* ==========================================================================
   mobile.js — the phone build's only moving parts.

   TWO WAYS TO RUN, CHOSEN HERE.

     live     the real subject: js/substrate.js and js/tear.js under the
              phone budget (30k points, capped pixel ratio, no hover
              layers), driven by native scroll through js/mstage.js. Loaded
              AFTER the page is already readable, so a slow download or a
              slow phone never delays the copy.
     static   the poster - one image rendered from the same construction -
              and the observers below. Used when the phone declines the
              gate, when WebGL does not start, or when js/mstage.js measures
              that the phone cannot keep up. Never a blank page either way.

   Never on this build: js/scroll.js (no virtual scroll on touch), js/hud.js's
   instrument panel, js/loader.js, js/annot.js, js/face.js.

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

  var root      = document.documentElement;
  var readPhase = scope.querySelector('[data-m-phase]');
  var readTime  = scope.querySelector('[data-m-time]');
  var panes     = Array.prototype.slice.call(scope.querySelectorAll('.pane'));
  var lightZone = scope.querySelector('.pane--field');

  /* ---- CAN THIS PHONE HAVE THE REAL THING? -------------------------------
     The rules live in js/phonemath.js (decideLive), where they are tested;
     this only gathers the inputs. The WebGL probe is passed as a function so
     it runs only if every cheaper signal has already said yes. */
  function hasWebGL() {
    try {
      var g = document.createElement('canvas').getContext('webgl');
      if (!g) return false;
      var lose = g.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();          // give the context straight back
      return true;
    } catch (e) { return false; }
  }
  function canGoLive() {
    var c = navigator.connection;
    return window.PHONE_MATH.decideLive({
      search: location.search,
      saveData: !!(c && c.saveData),
      deviceMemory: navigator.deviceMemory,
      cores: navigator.hardwareConcurrency,
      hasWebGL: hasWebGL
    }).live;
  }

  /* Scripts for the live build, in execution order, and the modules they
     register. tools/check.py reads both lists. */
  var LIVE_FILES  = ['tearfn', 'substrate', 'tear', 'mstage'];
  var LIVE_MOUNTS = ['tear', 'substrate', 'mstage'];

  var live = canGoLive(), observers = [];
  if (live) root.classList.add('m-live');

  /* Back to the poster, from anywhere: the gate passed but the renderer did
     not start, or it started and could not keep up. Everything the live
     build owns is torn down, and the observers it replaced are started. */
  window.M_STATIC = function (why) {
    if (!root.classList.contains('m-live')) return;
    console.info('[mobile] static build:', why);
    window.PAGE.unmountOnly(LIVE_MOUNTS);
    window.DORMANT.covered = true;           // anything still ticking stops drawing
    root.classList.remove('m-live', 'm-ready');
    startStatic();
  };

  function loadLive() {
    var left = LIVE_FILES.length, failed = false;
    LIVE_FILES.forEach(function (name) {
      var el = document.createElement('script');
      el.src = 'js/' + name + '.js';
      el.async = false;                      // insertion order is execution order
      el.onload = function () {
        if (--left === 0 && !failed) window.PAGE.mount(document, LIVE_MOUNTS);
      };
      el.onerror = function () {
        failed = true;
        window.M_STATIC('could not load js/' + name + '.js');
      };
      document.head.appendChild(el);
    });
  }
  if (live) {
    /* After the page has painted and settled, so the live build competes
       with nothing the visitor is waiting on. */
    /* Called as methods of window: detached, requestIdleCallback throws
       "Illegal invocation" in Chrome. */
    var go = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(loadLive, { timeout: 1200 });
      else window.setTimeout(loadLive, 200);
    };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }

  /* ---- the phase readout ------------------------------------------------
     Whichever section owns the middle of the screen is the current phase.
     A rootMargin that collapses the viewport to a thin band across its
     centre gives exactly that, with no scroll handler at all. */
  function startStatic() {
    if (observers.length) return;
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
    observers = [io, ioFade, io2, io3];
  }
  if (!live) startStatic();

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
    /* The pager first: the same one-second chapter move a swipe makes.
       js/mstage.js's M_GOTO and scrollIntoView remain for a phone where the
       pager did not mount. */
    if (typeof window.M_PAGE_TO === 'function') { window.M_PAGE_TO(i); return; }
    if (typeof window.M_GOTO === 'function') { window.M_GOTO(i); return; }
    if (panes[i]) panes[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  Array.prototype.forEach.call(btns, function (b) { b.addEventListener('click', onGoto); });

  return function () {
    observers.forEach(function (o) { if (o) o.disconnect(); });
    window.M_STATIC = null;
    clearInterval(timer);
    Array.prototype.forEach.call(btns, function (b) { b.removeEventListener('click', onGoto); });
  };
});
