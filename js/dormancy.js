/* ==========================================================================
   dormancy.js — stop drawing what nobody can see.

   THE COSTS THIS PAGE ACTUALLY CARRIES
   The substrate is TWO draw calls of 40,960 gl.POINTS, each fragment running
   four octaves of value noise for the tear lookup plus a twelve-point loop
   for the reveal. The tear is a full-screen quad with the same noise. None
   of that is free, and all of it was running unconditionally — including
   while the red footer covered the entire viewport, and while the tab sat in
   a background window.

   FOUR SWITCHES, IN ORDER OF WHAT THEY SAVE

     covered   the footer is opaque over everything. Both point clouds and
               the tear are invisible; nothing is skipped that anyone can
               see. This is the largest single saving on the page.

     idleFluid the inner cloud is masked by the reveal, so with no pointer
               trail alive it draws 40,960 points that are ALL discarded on
               the first alpha test. That is half the geometry cost of the
               page rendering literally nothing, and it is the state the
               page is in whenever the cursor is still. Cheap to detect:
               the trail's own maximum life is already tracked.

     hidden    document.hidden. Browsers already throttle rAF in a hidden
               tab, but "already throttled" is not "stopped", and the 1Hz
               clock and the log timers keep running regardless. Cancelling
               the loop outright is one line and removes the ambiguity.

     reduced   prefers-reduced-motion. Handled here rather than in each
               module so there is one answer to "is continuous motion
               allowed", and js/a11y.js can flip it at runtime.

   WHY A SHARED FLAG OBJECT AND NOT AN EVENT
   Every consumer is already inside a requestAnimationFrame callback, so it
   can read a boolean for free. An event would mean subscription bookkeeping
   and teardown in four modules to deliver information they are about to
   look at anyway.
   ========================================================================== */
window.DORMANT = (function () {
  'use strict';

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var state = {
    hidden:  document.hidden === true,
    covered: false,          // set by js/scroll.js when the footer is opaque
    reduced: mq ? mq.matches : false,
    /* Counts frames actually drawn vs frames offered, so js/fps.js can show
       how much the switches above are really saving rather than asserting
       it. A dial nobody can read is a dial nobody trusts. */
    offered: 0,
    drawn:   0
  };

  document.addEventListener('visibilitychange', function () {
    state.hidden = document.hidden === true;
  });

  if (mq) {
    var onMQ = function () { state.reduced = mq.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMQ);
    else if (mq.addListener) mq.addListener(onMQ);       // Safari < 14
  }

  /* The single question every renderer asks. Kept as a method rather than a
     getter so it reads as a decision at the call site. */
  state.asleep = function () {
    return state.hidden || state.covered;
  };

  return state;
})();
