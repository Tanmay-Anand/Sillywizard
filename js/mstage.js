/* ==========================================================================
   mstage.js — the phone's stage: native scroll in, renderer state out.

   The desktop drives js/substrate.js from a virtual scroll accumulator
   (js/scroll.js). A phone must not have one: hijacking touch scrolling
   breaks momentum, the address bar, back-swipe and assistive tech. So the
   page scrolls natively here, and this module READS where the document is
   and translates it into the same numbers the renderer already understands.

   THE OBJECT IS A BACKGROUND, NOT A PERFORMER. It sits fixed in the upper
   half of the screen at one constant, reduced brightness (--m-obj-a in
   css/mobile.css) and the copy scrolls over it. An earlier version faded it
   out whenever text crossed it and brought it back in the gaps between
   sections; on a real phone that read as flicker - the object vanishing
   under a heading, reappearing behind the next paragraph, never at the same
   brightness twice. Constant is calmer, and it is what a background does.

     progress   phase i-1 -> i is driven by section i's copy rising into
                view: 0 as its first line enters at the bottom of the
                screen, 1 as it settles just below the object. The object
                changes shape BECAUSE the next section is arriving, in step
                with it - not in a gap of its own. Eased toward that target
                over ~150ms, so a momentum flick or the address bar resizing
                the viewport never jolts the shape.

     tear       the paper is not timed, it is PLACED: the torn edge sits a
                fixed distance into AUTOMATION's opening and scrolls with
                it, so the light ground is that section's own background.
                Same shader and boundary as desktop, so the points still
                turn to ink along the edge. tearRed does the same for the
                footer.

     idle       nothing moving but the drift: the renderer draws every other
                frame. The drift is slow enough that 30fps of it is
                indistinguishable, and the object never switches off now, so
                this is where its battery saving comes from.

   AND IT WATCHES ITSELF. The first stretch of frames is timed; a phone that
   cannot hold roughly 24fps is handed back to the static build
   (window.M_STATIC in js/mobile.js) rather than left stuttering.
   ========================================================================== */
window.PAGE.register('mstage', function (scope) {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('m-live')) return;
  var S = window.SUBSTRATE;
  var cv = scope.querySelector('#substrate');
  if (!S || !cv || !window.PHONE_MATH) {
    if (window.M_STATIC) window.M_STATIC('renderer did not start'); return;
  }

  var panes = Array.prototype.slice.call(scope.querySelectorAll('.pane'));
  var ftr = scope.querySelector('#ftr');
  var words = Array.prototype.slice.call(scope.querySelectorAll('.bgw__word'));
  var btns = Array.prototype.slice.call(scope.querySelectorAll('.bar__btn[data-goto]'));
  var readPhase = scope.querySelector('[data-m-phase]');
  var NAMES = window.SUBSTRATE_PHASES || [];
  var LIGHT = 3;                         // AUTOMATION: where the paper starts
  /* The numbers - morph target, settle point, tear placement - live in
     js/phonemath.js, where they are tested. This file only feeds them. */
  var M = window.PHONE_MATH;

  /* ---- measurement: document coordinates, refreshed only on change ------ */
  var geo = [], ftrTop = 1e9, Hc = 1;
  function measure() {
    var y = window.scrollY;
    Hc = cv.clientHeight || window.innerHeight;
    geo = panes.map(function (p) {
      var r = p.getBoundingClientRect(), cs = getComputedStyle(p);
      var top = r.top + y;
      return { top: top, start: top + parseFloat(cs.paddingTop) };
    });
    ftrTop = ftr ? ftr.getBoundingClientRect().top + y : 1e9;
    dirty = true;
  }
  var ro = window.ResizeObserver ? new ResizeObserver(measure) : null;
  if (ro) ro.observe(scope.querySelector('main') || document.body);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  function starts() { return geo.map(function (g) { return g.start; }); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  window.M_GOTO = function (i) {
    if (i >= panes.length && ftr) { window.scrollTo({ top: ftrTop, behavior: 'smooth' }); return; }
    var g = geo[i];
    window.scrollTo({ top: g ? M.settledScroll(i, g.start, Hc) : 0, behavior: 'smooth' });
  };

  /* ---- the frame --------------------------------------------------------- */
  var raf = 0, dirty = true, lastY = -1, last = {}, lastT = 0, stillFor = 0;
  var shown = 0;
  var probe = { t: 0, dts: [], done: false }, ready = false;

  function set(key, val, apply) {
    if (last[key] === val) return;
    last[key] = val; apply(val);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
    var y = window.scrollY;

    /* ---- the probe: time real frames while the renderer draws ---------- */
    if (!probe.done && !window.DORMANT.covered && !window.DORMANT.hidden) {
      if (probe.t) {
        var fdt = now - probe.t;
        if (fdt > 0 && fdt < 500) probe.dts.push(fdt);
      }
      probe.t = now;
      if (probe.dts.length === 90) {
        probe.done = true;
        var median = probe.dts.slice().sort(function (a, b) { return a - b; })[45];
        console.info('[mstage] median frame', median.toFixed(1) + 'ms');
        if (median > 42 && !/[?&]live(&|=|$)/.test(location.search)) {
          if (window.M_STATIC) window.M_STATIC('median frame ' + median.toFixed(0) + 'ms');
          return;
        }
      }
    } else {
      probe.t = 0;
    }

    if (!ready) {
      /* The poster stays up until the object has actually drawn once. */
      ready = true;
      root.classList.add('m-ready');
    }
    if (!geo.length) measure();

    var moved = y !== lastY || dirty;
    lastY = y; dirty = false;
    stillFor = moved ? 0 : stillFor + dt;

    /* progress, eased toward its target - which means this keeps running
       for a few frames after the scroll stops, until the shape has landed */
    var target = M.morphTarget(y, starts(), Hc);
    shown += (target - shown) * (1 - Math.exp(-dt / 0.15));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    var settling = shown !== target;
    S.progress = shown;
    S.spin = 0;
    S.idle = stillFor > 0.4 && !settling;

    if (!moved && !settling) return;

    /* the grounds, placed rather than timed. b = 1 - T/H puts the edge at
       screen y T; prog = (b + 0.34) / 1.68 inverts js/tearfn.js. The edge
       sits inside AUTOMATION's opening so its shards can never reach the
       copy above. NOT eased: the paper is that section's own ground and
       has to stay attached to it. */
    var light = geo[LIGHT] ? geo[LIGHT].top + 0.18 * Hc : 1e9;
    S.tear = M.tearAt(light, y, Hc);
    /* The footer is the end of the document, so it cannot scroll far enough
       to carry its edge off the top of the screen - measured, the red
       stalled at 0.78 with a strip of the old ground still showing. Over the
       last 30% of a screen of scroll the red is carried the rest of the way. */
    var maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    S.tearRed = ftr ? Math.max(M.tearAt(ftrTop + 0.16 * Hc, y, Hc),
                               M.endOfPage(y, maxY, Hc)) : 0;

    /* The only time the object stops: the red has fully arrived over it. */
    window.DORMANT.covered = S.tearRed >= 0.995;

    /* chrome: light once the paper is under the header */
    set('light', (light - y) < 0.04 * Hc, function (v) {
      document.body.classList.toggle('is-light', v);
    });

    /* current phase: the readout and the bar */
    var cur = Math.min(NAMES.length - 1, Math.floor(shown + 0.5));
    set('phase', cur, function (v) {
      if (readPhase) readPhase.textContent = NAMES[v] || '--';
      btns.forEach(function (btn, j) { btn.classList.toggle('is-on', j === v); });
    });

    /* AUTOMATION cloud blur: activate only after the .lede text has risen
       above the object band's bottom edge (top 6.2lvh + height 45.2lvh =
       51.4lvh). Until then the text sits below the cloud and needs no blur.
       geo[LIGHT].start = pane.top + 58lvh (pane padding). Condition:
       text's viewport position < 51.4lvh  →  y > start - 0.514 * Hc */
    var g3 = geo[LIGHT];
    set('fieldblur', cur === LIGHT && g3 && y > g3.start - 0.514 * Hc, function (v) {
      document.body.classList.toggle('is-field-blur', v);
    });

    /* background words: same falloff as desktop (js/scroll.js), and they
       drift at under half the scroll speed */
    for (var w = 0; w < words.length; w++) {
      var d = shown - (+words[w].getAttribute('data-phase'));
      var o = 1 - clamp01((Math.abs(d) - 0.06) / 0.42);
      words[w].style.opacity = o.toFixed(3);
      words[w].style.transform = o > 0 ? 'translate3d(0,' + (-d * Hc * 0.45).toFixed(1) + 'px,0)' : '';
    }
  }

  measure();
  raf = requestAnimationFrame(tick);

  return function teardown() {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener('resize', measure);
    window.removeEventListener('orientationchange', measure);
    window.M_GOTO = null;
    window.DORMANT.covered = false;
    S.idle = false;
  };
});
