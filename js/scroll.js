/* ==========================================================================
   scroll.js — the virtual scroll, and everything that rides on it.

   ONE ACCUMULATOR, MANY CONSUMERS
   body{overflow:hidden} is set in base.css because this page owns the wheel
   gesture. Wheel, drag, keyboard and the bar buttons all feed a single
   number; that number is eased once and then read by the copy track, the
   substrate's phase, the substrate's rotation, the HUD and the footer.

   Sharing one eased value is not a tidiness preference. The copy has to move
   by exactly the amount the cloud turns, and both have to keep moving after
   the wheel stops. Two listeners each reading their own scrollTop drift apart
   within seconds; one number cannot.

   EASED AGAINST ELAPSED TIME, NOT PER FRAME
   A fixed fraction per frame settles twice as fast on a 120Hz screen as on
   60Hz, so the same page feels different on different machines. The
   exponential below is framerate-independent.
   ========================================================================== */
window.PAGE.register('scroll', function (scope) {
  'use strict';

  var track = scope.querySelector('#track');
  var panes = scope.querySelectorAll('.pane');
  var ftr   = scope.querySelector('#ftr');
  var hud   = scope.querySelector('.hud');
  var bar   = scope.querySelector('.bar');
  var words = scope.querySelectorAll('.bgw__word');
  if (!track || !panes.length) return;

  var COUNT = panes.length;              // 5 phases
  var VH = window.innerHeight;
  /* One viewport of travel per phase, plus one more for the footer to come
     up in. The footer is not a sixth phase — the substrate holds DIFFUSE
     while it arrives. */
  var MAX = VH * COUNT;

  var target = 0, current = 0;
  var EASE = 0.10;                       // seconds to close ~63% of the gap
  var dragging = false, lastY = 0, moved = 0;

  function clamp(v) { return Math.max(0, Math.min(MAX, v)); }

  function onWheel(e) {
    e.preventDefault();
    target = clamp(target + e.deltaY);
  }
  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ')
      { target = clamp(target + VH * 0.5); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp')
      { target = clamp(target - VH * 0.5); e.preventDefault(); }
    if (e.key === 'Home') target = 0;
    if (e.key === 'End')  target = MAX;
  }
  function onDown(e) { dragging = true; lastY = e.clientY; moved = 0; }
  function onMove(e) {
    if (!dragging) return;
    var dy = e.clientY - lastY; lastY = e.clientY; moved += Math.abs(dy);
    target = clamp(target - dy * 1.6);
  }
  function onUp() { dragging = false; }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // the bar buttons drive the same accumulator, so they ease in like anything else
  var btns = scope.querySelectorAll('[data-goto]');
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener('click', function () {
      target = clamp(parseFloat(b.dataset.goto) * VH);
    });
  });

  /* THE ONE WAY IN FROM OUTSIDE. The accumulator is deliberately private —
     it is the single source of truth and nothing should be able to write it
     directly — but keyboard focus has to be able to bring a phase on screen
     (js/a11y.js), so there is exactly one door, and it goes through the same
     easing as a wheel gesture rather than teleporting. */
  window.GOTO = function (phase) { target = clamp(phase * VH); };

  function onResize() {
    VH = window.innerHeight; MAX = VH * COUNT;
    target = clamp(target);
  }
  window.addEventListener('resize', onResize);

  /* ========================================================================
     THE RED UNCOVERS THE FOOTER ALONG ITS OWN EDGE.

     Three versions of this, and the first two are worth keeping in mind
     because they are the two obvious answers and both are wrong.

     1. Fade the type in once the red had arrived (tearRed > 0.90). That is
        two animations in sequence — the ground floods, and then, separately,
        a heading appears on it. Nothing about the heading reads as having
        been UNDER the red.

     2. Mask it with a horizontal line at the sweep's average height. The
        boundary is not at its average height: js/tearfn.js displaces it by
        up to +-0.15 of the viewport before thresholding, which is the entire
        point of the tear. A straight mask at `b` therefore uncovers type
        wherever the edge happens to dip, and the heading stands on pale
        paper. Dropping the mask by the noise's full amplitude fixes that and
        buys the fault this replaces: a 17.5%-of-a-viewport dead band between
        where the red is and where the type is allowed to be, so the heading
        stayed half-swallowed until the screen was nearly covered.

     3. Follow the actual edge. window.TEAR_EDGE evaluates the same noise the
        fragment shader does — see the header of js/tearfn.js for the hash
        surgery that lets float32 and float64 agree on it — and reports, per
        column, how far up that column is unbroken red. Clipping to that
        polygon means the type is revealed exactly where the ground is, with
        no lead and no lag: the wave and the reveal are one event, which is
        what they always should have been.

     COST. COLS marches of ~25 noise samples each, only while the tear is
     actually running (a couple of seconds of scroll). Below a millisecond,
     and zero for the rest of the page.
     ======================================================================== */
  var COLS = 96;
  /* The polygon interpolates in straight lines between columns while the
     real edge keeps wandering between them. At this spacing the fourth
     octave can stray about this far inside a cell, so the whole edge is
     dropped by that much — nine pixels on a tall screen, far below the
     threshold where an eye reads it as a delay, and enough that no notch
     between two samples can expose type on the paper. */
  var SAFE = 0.010;
  var pts = new Array(COLS + 1);
  var lastClip = null;

  function clipFooter(red) {
    ftr.style.opacity = red > 0.02 ? '1' : '0';
    ftr.classList.toggle('is-up', red > 0.02);
    ftr.classList.toggle('is-in', red > 0.45);

    /* Past the end there is no edge left on screen — and no clip, so the
       browser stops rasterising a full-viewport mask for a static frame. */
    var clip = 'none';
    if (red > 0.02 && red < 1) {
      for (var i = 0; i <= COLS; i++) {
        var x = i / COLS;
        var h = window.TEAR_EDGE(x, red, 37.0) - SAFE;   // 37 = the red seed
        if (h < 0) h = 0; else if (h > 1) h = 1;
        /* clip-path measures down from the top; the tear measures up from
           the bottom. */
        pts[i] = (x * 100).toFixed(2) + '% ' + ((1 - h) * 100).toFixed(2) + '%';
      }
      clip = 'polygon(' + pts.join(',') + ',100% 100%,0% 100%)';
    }
    if (clip !== lastClip) { ftr.style.clipPath = clip; lastClip = clip; }
  }

  var raf = 0, last = performance.now();

  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min((now - last) / 1000, 0.1); last = now;

    // framerate-independent exponential approach
    current += (target - current) * (1 - Math.exp(-dt / EASE));

    var pxPhase = current / VH;                    // 0 .. COUNT
    var progress = Math.min(current / MAX, 1);

    // the copy track
    track.style.transform = 'translate3d(0,' + (-current) + 'px,0)';

    // the substrate: phase position, and a rotation tied to the same number
    if (window.SUBSTRATE) {
      window.SUBSTRATE.progress = Math.min(pxPhase, COUNT - 1);
      /* Turns just under a half-revolution across the whole page, plus a slow
         idle drift added to the SAME accumulator so it hands over without a
         seam when the wheel stops. */
      window.SUBSTRATE.spin = pxPhase * 0.42 + now * 0.00004;
      window.SUBSTRATE.scrollProgress = progress;

      /* THE TEAR, and where it is placed is the whole trick. It runs across
         the 03 -> 04 handover, a window in which BOTH neighbouring panes are
         already near zero opacity (see the distance fade below). So the DOM
         text can flip from light-on-dark to dark-on-light with a plain class
         and nobody sees the switch — no per-pixel masking of live text,
         which is the expensive way to solve this and the reason most sites
         never invert their ground mid-scroll at all. */
      /* CENTRED ON THE 03 -> 04 MIDPOINT (pxPhase 2.5), not started there.
         The class flips at tear 0.5, so the midpoint of the sweep has to be
         the moment BOTH neighbouring panes are at zero opacity — which the
         fade below reaches at a distance of 0.48. Offset it by even a third
         of a screen and the incoming pane is still 20% visible when its ink
         inverts, which reads as a colour pop rather than as a transition. */
      var tear = Math.max(0, Math.min(1, (pxPhase - 2.15) / 0.7));
      window.SUBSTRATE.tear = tear;
      document.body.classList.toggle('is-light', tear > 0.5);
    }

    /* THE FOOTER TAKES THE LAST VIEWPORT. It fades up over the final phase
       rather than being scrolled to, because the substrate never leaves and
       a footer that slid over it would cover the subject. */
    var fp = Math.max(0, (pxPhase - (COUNT - 1)));

    /* THE FOOTER ARRIVES BY TEARING, not by fading. The red is painted by
       js/tear.js on the same quad and the same boundary function as the
       light ground; this only says how far along it is. The footer's TEXT
       then fades in behind the finished edge, so the type never crosses the
       boundary mid-stroke — which is the one thing that would give away
       that the red is a DOM element rather than the ground itself. */
    var tearRed = Math.max(0, Math.min(1, (fp - 0.10) / 0.50));
    if (window.SUBSTRATE) window.SUBSTRATE.tearRed = tearRed;

    if (ftr) clipFooter(tearRed);
    if (bar) bar.classList.toggle('is-out', tearRed > 0.7);

    /* THE INSTRUMENTS GO WITH EVERYTHING ELSE. While the footer painted its
       own opaque background it covered the HUD by stacking order alone;
       now that the red is the GROUND rather than a panel, the readouts sit
       on top of it and have to be taken away deliberately. They lead the
       tear slightly — instruments failing just before the material does
       reads as cause, the other order reads as a layer someone forgot. */
    if (hud) hud.style.opacity = String(Math.max(0, 1 - tearRed / 0.55));

    /* Covered once the red has fully arrived — the substrate is gone by
       then anyway (the shader burns it away), so this stops the two point
       clouds and the quad from drawing under an opaque ground. */
    window.DORMANT.covered = tearRed >= 0.995;


    /* PANES FADE ON DISTANCE FROM THEIR OWN SCREEN, and this is not
       decoration. Each pane is exactly one viewport tall but its CONTENT is
       not, so a long block runs past its own edges and lands on top of the
       neighbouring phase's copy. Clipping would cut words in half mid-line;
       fading on distance keeps one phase legible at a time and reads as the
       instrument changing subject. */
    Array.prototype.forEach.call(panes, function (p, i) {
      var d = Math.abs(pxPhase - i);
      /* Reaches zero at d = 0.48, i.e. just before the halfway point
         between two phases — which is what gives the tear a window with no
         live text in it. */
      var o = 1 - Math.min(1, Math.max(0, (d - 0.08) / 0.40));
      p.style.opacity = o;
      /* IS-LIVE GATES ANYTHING CLICKABLE INSIDE A PANE. Opacity does not
         stop a pointer: a phase faded to zero still has its links in the
         hit-test tree, so a visitor clicking empty space on one screen can
         land on a project card belonging to another. Only the pane that is
         actually legible gets pointer-events (see .pcard in css/site.css).
         0.6 rather than 0 so the hand-off happens while the incoming pane
         is already readable, not at the instant it stops being invisible. */
      p.classList.toggle('is-live', o > 0.6);
    });

    /* THE BACKGROUND WORDS, on the same distance as the panes but slower.
       They travel at 45% of the copy's speed, so they read as further back
       than the type rather than printed on the same sheet.

       GONE BY THE HALFWAY POINT, like the text. A wider fade that let each
       word linger past d = 0.5 looked atmospheric in isolation and, between
       two sections, put BACKEND and SYSTEMS on screen together at a third
       strength each - two giant words overprinted, which is noise. At 0.5
       both are at zero, so one word hands over to the next. */
    Array.prototype.forEach.call(words, function (w) {
      var d = pxPhase - (+w.getAttribute('data-phase'));
      var o = 1 - Math.min(1, Math.max(0, (Math.abs(d) - 0.06) / 0.42));
      w.style.opacity = o;
      w.style.transform = o > 0 ? 'translate3d(0,' + (-d * VH * 0.45).toFixed(1) + 'px,0)' : '';
    });

    // current phase marker in the bar
    var idx = Math.round(Math.min(pxPhase, COUNT - 1));
    Array.prototype.forEach.call(btns, function (b, i) {
      b.classList.toggle('is-on', i === idx);
    });
  }
  raf = requestAnimationFrame(tick);

  return function teardown() {
    cancelAnimationFrame(raf);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('resize', onResize);
  };
});
