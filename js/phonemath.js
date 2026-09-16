/* ==========================================================================
   phonemath.js — every decision the phone build makes from numbers.

   Pulled out of js/mobile.js and js/mstage.js so it can be tested on its
   own: those two files touch the DOM, the scroll position and WebGL, and a
   rule buried inside one of them could only be checked by opening a phone.
   Nothing in here reads the page. Inputs in, answers out.

   Loaded before js/mobile.js on the phone build; the desktop never loads it.
   Covered by tests/unit/phonemath.test.mjs.
   ========================================================================== */
window.PHONE_MATH = (function () {
  'use strict';

  /* Where the object ends, as a fraction of the screen height. The camera in
     js/substrate.js centres it 30% down and about 40% tall. */
  var BAND_BOT = 0.52;

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function flag(search, name) {
    return new RegExp('[?&]' + name + '(&|=|$)').test(search || '');
  }

  /* ---- the capability gate --------------------------------------------------
     Cheap signals only, each a reason to say NO rather than a score. Memory
     and core counts are unreported on iOS and treated as capable. The WebGL
     probe creates a context, so it runs last and only if everything cheaper
     has passed. ?static and ?live force either answer. */
  function decideLive(env) {
    if (flag(env.search, 'static')) return { live: false, reason: 'forced static' };
    if (flag(env.search, 'live'))   return { live: true,  reason: 'forced live' };
    if (env.saveData)               return { live: false, reason: 'save-data' };
    if (env.deviceMemory && env.deviceMemory < 3) return { live: false, reason: 'low memory' };
    if (env.cores && env.cores < 4)               return { live: false, reason: 'few cores' };
    if (!env.hasWebGL())            return { live: false, reason: 'no webgl' };
    return { live: true, reason: 'capable' };
  }

  /* smootherstep: zero velocity and zero acceleration at both ends, so a
     morph eases out of rest and back into it with no visible kick. */
  function ease(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  /* ---- scroll position -> phase progress --------------------------------
     Phase i-1 -> i while section i's first line rises from the bottom of the
     screen (0) to the object's lower edge (1). `starts` are the document y's
     of each section's first line; index 0 is never read. */
  function morphTarget(y, starts, H) {
    var progress = 0;
    for (var i = 1; i < starts.length; i++) {
      var T = starts[i] - y;
      var t = clamp01((H - T) / ((1 - BAND_BOT) * H));
      if (t >= 1) { progress = i; continue; }
      return (i - 1) + ease(t);
    }
    return progress;
  }

  /* The scroll at which section i has fully arrived: its first line exactly
     at the object's lower edge, which is where morphTarget reaches i. Where
     the nav buttons land.

     There used to be an extra 8px of "breathing room" here. It landed the
     line 8px short of that edge, so every nav tap left the object at 1.9999
     instead of 2 - caught by the test, invisible on screen, and exactly the
     kind of off-by-a-bit that later becomes a real bug. */
  function settledScroll(i, start, H) {
    return i === 0 ? 0 : Math.max(0, start - BAND_BOT * H);
  }

  /* ---- a torn edge placed at a document position --------------------------
     js/tearfn.js draws the boundary at uv.y = -0.34 + 1.68 * prog, measured up
     from the bottom. An edge at screen y T (down from the top) is therefore
     at uv.y = 1 - T/H, and this inverts that. */
  function tearAt(docY, y, H) {
    var T = docY - y;
    return clamp01((1 - T / H + 0.34) / 1.68);
  }

  /* The footer is the end of the document and cannot scroll far enough to
     carry its edge off the top of the screen, so over the last 30% of a
     screen of scroll the red is carried the rest of the way. */
  function endOfPage(y, maxY, H) {
    return clamp01((y - (maxY - 0.30 * H)) / (0.30 * H));
  }

  /* ---- paging: one gesture = one chapter -----------------------------------
     The scroll positions the phone is allowed to rest at.

     A section rests with its first line at the object's lower edge (`line`),
     the same position morphTarget calls "arrived" - so every chapter lands
     with its morph complete. A section taller than one page gets more pages,
     each overlapping the last by `overlap` so no line is cut between them,
     until its last line is readable. Without that, one gesture per section
     would make the end of every long section unreachable.

     On a page at y, content between y + top (under the header) and
     y + bottom (above the nav bar) is readable. The first page is always 0
     and the last is always maxY - the very bottom, where the footer's red
     completes. */
  function pageStops(g) {
    var span = g.bottom - g.top - g.overlap, raw = [0];
    g.sections.forEach(function (sec, i) {
      var y = i === 0 ? 0 : sec.start - g.line;
      if (i > 0) raw.push(y);
      for (var guard = 0; sec.end > y + g.bottom && guard < 50; guard++) {
        var next = Math.min(y + span, sec.end - g.bottom);
        if (next <= y) break;
        y = next;
        raw.push(y);
      }
    });
    raw.push(g.maxY);

    /* Clamp into the page, sort, and merge anything closer than 24px - two
       stops that close are one page with a twitch between them. A merge
       keeps the later stop, except that 0 always stays 0. */
    var out = [];
    raw.map(function (y) { return Math.max(0, Math.min(g.maxY, y)); })
       .sort(function (a, b) { return a - b; })
       .forEach(function (y) {
         var last = out[out.length - 1];
         if (last === undefined) { out.push(y); return; }
         if (y - last >= 24) { out.push(y); return; }
         if (last !== 0) out[out.length - 1] = y;
       });
    if (out[out.length - 1] !== g.maxY) {
      if (g.maxY - out[out.length - 1] < 24 && out.length > 1) out[out.length - 1] = g.maxY;
      else out.push(g.maxY);
    }
    return out;
  }

  /* The page one gesture leads to from scroll position y, or null at either
     end. Within 2px of a page counts as resting on it (sub-pixel scroll
     positions are normal); from between pages - after a focus jump, say -
     it is the nearest page in that direction. */
  function nextStop(stops, y, dir) {
    var TOL = 2, i;
    if (dir > 0) {
      for (i = 0; i < stops.length; i++) if (stops[i] > y + TOL) return stops[i];
    } else {
      for (i = stops.length - 1; i >= 0; i--) if (stops[i] < y - TOL) return stops[i];
    }
    return null;
  }

  function nearestStop(stops, y) {
    var best = stops[0];
    for (var i = 1; i < stops.length; i++) {
      if (Math.abs(stops[i] - y) < Math.abs(best - y)) best = stops[i];
    }
    return best;
  }

  return {
    BAND_BOT: BAND_BOT,
    pageStops: pageStops,
    nextStop: nextStop,
    nearestStop: nearestStop,
    decideLive: decideLive,
    ease: ease,
    morphTarget: morphTarget,
    settledScroll: settledScroll,
    tearAt: tearAt,
    endOfPage: endOfPage
  };
})();
