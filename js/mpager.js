/* ==========================================================================
   mpager.js — the phone moves one chapter per gesture.

   Phone and tablet-width builds only. The desktop keeps its own scroll
   (js/scroll.js) and never loads this file.

   One swipe, one wheel notch or one key moves to the next or previous PAGE,
   and a page is a position the phone is allowed to rest at: each section
   arriving with its first line under the object, plus - for a section taller
   than one screen - further pages until its last line is readable. Without
   those, one gesture per section would make the end of every long section
   unreachable. The pages are computed by PHONE_MATH.pageStops from the live
   layout, every time, so fonts loading or the viewport changing can never
   leave the phone resting somewhere stale.

   THE MOVE. One second, smootherstep - it leaves rest slowly and arrives
   slowly, so nothing lands with a kick. It is a real scroll of the document,
   which is the point: js/mstage.js reads the scroll position every frame, so
   the object morphs, the paper tears in and the background words pass
   exactly as they do between sections already. No second animation system.

   DURING IT, nothing else. Swipes, wheel ticks and keys are ignored until
   the move has landed. A wheel flick's momentum keeps firing events for a
   second or more after the finger lifts, so a wheel gesture only counts
   after a short quiet gap - otherwise one flick would page twice.

   WHAT IT LEAVES ALONE. A sideways swipe on the project row (it scrolls on
   its own), anything inside an open project panel (it can scroll), and keys
   typed into a field. Under prefers-reduced-motion the page still moves one
   chapter per gesture, instantly.
   ========================================================================== */
window.PAGE.register('mpager', function (scope) {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('is-mobile') || !window.PHONE_MATH) return;

  var M = window.PHONE_MATH;
  var DURATION = 1000;           // ms, per page
  var SWIPE = 40;                // px of travel before a drag is a gesture
  var WHEEL_QUIET = 180;         // ms of silence that ends one wheel gesture
  var OVERLAP = 64;              // px shared by consecutive pages of one section

  var panes = Array.prototype.slice.call(scope.querySelectorAll('.pane'));
  var header = scope.querySelector('.m-read');
  var bar = scope.querySelector('.bar');
  var bust = scope.querySelector('.m-bust');
  var cv = scope.querySelector('#substrate');

  /* ---- the pages, from the layout as it is right now ---------------------- */
  function geometry() {
    var y = window.scrollY, H = window.innerHeight;
    var line;
    if (root.classList.contains('m-live')) {
      line = M.BAND_BOT * ((cv && cv.clientHeight) || H);
    } else {
      /* The static build's object is a fixed band; a section rests with its
         copy just under it. */
      var b = bust ? bust.getBoundingClientRect() : null;
      line = b && b.bottom > 0 ? b.bottom + 26 : 0;
    }
    var sections = panes.map(function (p) {
      var r = p.getBoundingClientRect(), cs = getComputedStyle(p);
      return {
        start: r.top + y + (parseFloat(cs.paddingTop) || 0),
        end: r.bottom + y - (parseFloat(cs.paddingBottom) || 0)
      };
    });
    return {
      sections: sections,
      line: line,
      top: (header ? header.getBoundingClientRect().bottom : 0) + 8,
      bottom: (bar ? bar.getBoundingClientRect().top : H) - 8,
      overlap: OVERLAP,
      maxY: Math.max(0, document.documentElement.scrollHeight - H)
    };
  }
  function stops() { return M.pageStops(geometry()); }

  /* ---- the move --------------------------------------------------------------- */
  var busy = false, raf = 0;
  function reduced() {
    return !!(window.DORMANT && window.DORMANT.reduced);
  }
  function goTo(to) {
    if (busy || to === null || to === undefined) return;
    var from = window.scrollY;
    if (Math.abs(to - from) < 1) return;
    if (reduced()) { window.scrollTo(0, to); return; }
    busy = true;
    var t0 = null;
    function step(now) {
      now = typeof now === 'number' ? now : performance.now();
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / DURATION);
      window.scrollTo(0, t < 1 ? from + (to - from) * M.ease(t) : to);
      if (t < 1) { raf = requestAnimationFrame(step); return; }
      raf = 0;
      busy = false;
    }
    raf = requestAnimationFrame(step);
  }
  function page(dir) {
    if (busy) return;
    goTo(M.nextStop(stops(), window.scrollY, dir));
  }

  /* Chapter i by name: the nav bar. The same one-second move. */
  window.M_PAGE_TO = function (i) {
    var g = geometry(), s = M.pageStops(g);
    var want = i >= g.sections.length ? g.maxY
             : (i <= 0 ? 0 : g.sections[i].start - g.line);
    goTo(M.nearestStop(s, Math.max(0, Math.min(g.maxY, want))));
  };
  window.M_PAGER = { stops: stops, busy: function () { return busy; } };

  /* ---- touch ------------------------------------------------------------------ */
  function within(el, sel) { return !!(el && el.closest && el.closest(sel)); }
  var touch = null;
  function onTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) { touch = null; return; }
    var t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, axis: null,
              free: within(e.target, '.reveal__panel'),
              row: within(e.target, '.disp__feat') };
  }
  function onTouchMove(e) {
    if (!touch || touch.free || !e.touches || !e.touches[0]) return;
    var dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
    if (touch.axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (touch.axis === 'x' && touch.row) return;       // the project row scrolls itself
    if (e.cancelable) e.preventDefault();              // no native scrolling, ever
  }
  function onTouchEnd(e) {
    var t = touch;
    touch = null;
    if (!t || t.free || !e.changedTouches || !e.changedTouches[0]) return;
    var dy = e.changedTouches[0].clientY - t.y;
    if (t.axis === 'x' || Math.abs(dy) < SWIPE) return;
    page(dy < 0 ? 1 : -1);                             // finger up = forward
  }

  /* ---- wheel ------------------------------------------------------------------ */
  var lastWheel = -Infinity, armed = true;
  function onWheel(e) {
    if (e.cancelable) e.preventDefault();
    var now = performance.now();
    if (now - lastWheel >= WHEEL_QUIET) armed = true;  // a new gesture
    lastWheel = now;
    if (!armed || busy || Math.abs(e.deltaY) < 4) return;
    armed = false;
    page(e.deltaY > 0 ? 1 : -1);
  }

  /* ---- keys ------------------------------------------------------------------- */
  function onKey(e) {
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1;
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      var s = stops();
      goTo(e.key === 'Home' ? s[0] : s[s.length - 1]);
      return;
    }
    if (!dir) return;
    e.preventDefault();
    page(dir);
  }

  /* ---- arriving between pages -------------------------------------------------
     A restored scroll position, a rotated phone or a resized window can
     leave the document between pages. Settle on the nearest one, instantly. */
  function snap() {
    if (busy) return;
    var y = window.scrollY, s = M.nearestStop(stops(), y);
    if (Math.abs(s - y) >= 1) window.scrollTo(0, s);
  }
  var resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(snap, 150); }

  var opts = { passive: false };
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, opts);
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('wheel', onWheel, opts);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  var snapRaf = requestAnimationFrame(snap);

  return function teardown() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(snapRaf);
    clearTimeout(resizeT);
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove, opts);
    document.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('wheel', onWheel, opts);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.M_PAGE_TO = null;
    window.M_PAGER = null;
  };
});
