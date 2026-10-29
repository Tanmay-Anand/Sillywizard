/* ==========================================================================
   flow.js — SYSTEMS asks its eight questions one at a time.

   They used to be scattered round the colony, four a side, every one on
   screen at once. Two things went wrong with that: the left four crowded the
   statement in the bottom-left corner, and the left/right split lost the
   ORDER, which is the only thing the eight are for — they are a sequence you
   work through, not a set you pick from.

   So one slot, to the right of the subject, shows one question at a time as
   the section scrolls past, with a counter and a row of eight bars saying
   where in the sequence you are. js/annot.js draws a single leader from that
   question's node to the slot. All eight stay in the page as an ordered list
   under the bars: it is the record for a reader who scrolls fast, and the
   one a screen reader reads. The big line is a COPY of the active item and
   is aria-hidden, so nothing is announced twice and nothing needs
   aria-live — which on a scroll-driven change would read out every step
   the wheel passes through.

   THE SECTION PINS WHILE THEY STEP. The first version stepped across the
   section's whole visible window, and every pane rides the track at one
   viewport per phase - so a section is centred for exactly ONE scroll
   position, and the eight questions played out while it was still sliding
   in and out. 01 was gone before a reader had noticed the section arrive,
   and each question got about 65px of scroll: less than one wheel notch.
   So SYSTEMS declares data-hold, js/scroll.js holds the page still for that
   long, and the steps happen only inside the hold, where nothing else moves.

   WHERE THE POSITION COMES FROM. window.SCROLL, written by js/scroll.js
   every frame from the same eased accumulator the HUD's SCROLL readout is
   derived from - so there is no second smoothing here to fall out of step
   with the first.

   WHY A PLAIN rAF AND NOT AN OBSERVER-GATED ONE like js/annot.js. That loop
   does layout reads and attribute writes every frame and has to park. This
   one reads a number and compares it; far from the section it returns
   before touching anything. An observer would only add a frame of lag on
   arrival, which is exactly when the right question has to be up.
   ========================================================================== */

/* ---- THE BAND MATHS -------------------------------------------------------
   Pure, so it can be tested without a page (tests/unit/flowmath.test.mjs).

   `u` is the section's own position:
     u < 0     still arriving - how far off centre it still is
     0 .. 1    PINNED - how far through the hold the reader has scrolled
     u > 1     leaving - u - 1 is how far it has gone

   All eight take equal shares of the hold, 01 included: it is the first
   thing a reader sees when the section lands, and it needs as long as any.
   Before the hold it is 01; after it, 08 - "and only then, build" is what a
   reader sees as they leave. */
window.FLOW_MATH = (function () {
  'use strict';

  var STEPS = 8;
  var START = 0;
  var W = 1 / STEPS;
  var END = START + (STEPS - 1) * W;      // where 08 begins
  /* A boundary has to be passed by this much before it counts. A reader who
     stops on an edge leaves the eased scroll settling a pixel either side of
     it, and without a margin the slot would flicker between two questions.
     In units of the hold: about 20px of a two-viewport pin on a 900px
     screen. */
  var HYST = 0.012;

  function raw(local) {
    var s = Math.floor((local - START) / W) + 1;
    return s < 1 ? 1 : (s > STEPS ? STEPS : s);
  }

  function stepAt(local, prev) {
    var r = raw(local);
    if (!prev || r === prev) return r;
    /* More than one band away is a jump - a nav button, a drag - not a
       boundary being crossed. Snap; there is no edge to be careful about. */
    if (Math.abs(r - prev) > 1) return r;
    /* The edge between prev and prev+1 is at START + prev*W. */
    if (r > prev) return local >= START + prev * W + HYST ? r : prev;
    return local <= START + (prev - 1) * W - HYST ? r : prev;
  }

  /* HOW MUCH OF THE SLOT TO SHOW. It rides the pane: dead centre while
     pinned, but up to half a screen off while the section slides in or out
     - where it would sit on the SCROLL readout below or the HUD above. So
     it is fully shown only within 0.02 of centre and gone by 0.10, before
     it can reach either. The section's heading and the colony arrive first;
     the question arrives as the section lands. */
  function shown(u) {
    var d = u < 0 ? -u : (u > 1 ? u - 1 : 0);
    var o = 1 - (d - 0.02) / 0.08;
    return o >= 1 ? 1 : (o <= 0 ? 0 : o);
  }

  return { STEPS: STEPS, START: START, END: END, W: W, HYST: HYST,
           raw: raw, stepAt: stepAt, shown: shown };
})();

window.PAGE.register('flow', function (scope) {
  'use strict';

  var slot = scope.querySelector('[data-flow]');
  var pane = slot && slot.closest('.pane');
  if (!pane) return;

  var M = window.FLOW_MATH;
  var phase = +(pane.getAttribute('data-phase') || 0);
  var items = Array.prototype.slice.call(slot.querySelectorAll('.flow__list > li'));
  var inks = slot.querySelectorAll('.flow__ink');
  var bars = slot.querySelectorAll('.flow__bars i');
  var num = slot.querySelector('[data-flow-n]');
  if (!items.length || inks.length < 2) return;

  var step = 0, front = 0, raf = 0;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Everything a step change touches, and nothing per frame. */
  function show(s) {
    var first = !step;
    step = s;
    items.forEach(function (li, i) {
      var on = i === s - 1;
      li.classList.toggle('is-on', on);
      if (on) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(bars, function (b, i) {
      b.classList.toggle('is-on', i < s);
    });
    if (num) num.textContent = pad(s);
    slot.classList.toggle('is-end', s === M.STEPS);

    /* THE CROSSFADE. Two layers stacked in one box: the new question is
       written into the hidden one and the two swap, so the old line is still
       fading out while the new one fades in. The box reserves two lines
       (css/site.css), so a short question and a long one do not move
       anything beneath them. On the first call there is nothing to fade
       from, so the front layer is simply filled. */
    var text = items[s - 1].textContent;
    if (first) {
      inks[front].textContent = text;
      inks[front].classList.add('is-on');
    } else {
      var back = 1 - front;
      inks[back].textContent = text;
      inks[front].classList.remove('is-on');
      inks[back].classList.add('is-on');
      front = back;
    }
    window.FLOW_STEP = s;
  }

  /* u, from js/scroll.js. Inside this section's hold it is the hold's own
     progress; either side it is the phase distance, shifted so the leaving
     side starts at 1. Before scroll.js has run its first frame there is no
     window.SCROLL yet, and the pane's box stands in: the panes ride one
     track a viewport apart, so a pane's top edge over the viewport height
     IS its position. */
  function where() {
    var S = window.SCROLL;
    if (S && typeof S.phase === 'number') {
      if (S.hold === phase) return S.t;
      var l = S.phase - phase;
      return l < 0 ? l : 1 + l;
    }
    var b = -pane.getBoundingClientRect().top / (window.innerHeight || 1);
    return b <= 0 ? b : 1 + b;
  }

  var lastO = -1;
  function fade(u) {
    var o = M.shown(u);
    if (o === lastO) return;
    lastO = o;
    slot.style.opacity = o === 1 ? '' : o.toFixed(3);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    var u = where();
    fade(u);
    /* Off the section entirely: hold whatever is showing. It cannot be seen,
       and coming back runs the bands again from wherever the scroll is. */
    if (u < -0.75 || u > 1.75) return;
    var s = M.stepAt(u, step);
    if (s !== step) show(s);
  }

  /* Something is in the slot before the first frame, so the section never
     arrives with an empty box. */
  var u0 = where();
  show(M.raw(u0));
  fade(u0);
  raf = requestAnimationFrame(tick);

  return function teardown() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    slot.style.opacity = '';
    window.FLOW_STEP = undefined;
  };
});
