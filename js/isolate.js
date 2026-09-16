/* ==========================================================================
   isolate.js — turn one layer off and see what it was costing.

   `?off=<name>` — several allowed, comma separated:

     grain    the animated film-grain overlay
     tear     the torn light ground (the full-screen noise quad)
     shell    the outer point cloud
     fluid    the inner point cloud (the thing the pointer reveals)
     reveal   the pointer trail — forces the reveal to zero, which also
              makes `fluid` contribute nothing
     drift    the per-point idle wander and the scroll rotation
     minimap  the HUD's drawImage copy of the main canvas
     copy     the whole text stage

   WHY THIS EXISTS RATHER THAN COMMENTING THINGS OUT
   Every performance number produced from a guess is worthless. Before any
   layer is optimised, its cost has to be MEASURED on real hardware, and the
   only cheap way to do that is to switch layers off one at a time and watch
   the number js/fps.js prints. Commenting code out to do the same thing is
   slower, unshippable, and gets committed by accident.

   OFF UNLESS ASKED FOR. With no `?off=` in the URL this costs one string
   comparison at load and nothing at all per frame — `has()` returns false
   from an empty set.
   ========================================================================== */
window.OFF = (function () {
  'use strict';
  var m = /[?&]off=([^&]*)/.exec(location.search);
  var set = {};
  if (m) {
    decodeURIComponent(m[1]).split(',').forEach(function (n) {
      n = n.trim().toLowerCase();
      if (n) set[n] = true;
    });
  }
  var names = Object.keys(set);
  if (names.length) console.info('[isolate] layers off:', names.join(', '));
  return {
    list: names,
    has: function (n) { return set[n] === true; }
  };
})();
