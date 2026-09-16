/* ==========================================================================
   fps.js — a frame-rate read-out, for measuring on real hardware.

   WHY IT EXISTS. Every performance number produced on the machine that
   wrote the code is worthless as an absolute — it can rank two things
   against each other and nothing more. Before anything here is optimised,
   the before-figure has to come off YOUR machine and YOUR phone. This is
   the instrument that produces it.

   IT REPORTS p95, NOT JUST THE MEAN. A page can average 60fps and still
   feel broken, because what a person notices is the worst frames, not the
   typical one. The mean hides exactly the thing being hunted.

   IT ALSO REPORTS WHAT IS ASLEEP, which is the other half of a useful
   measurement: 120fps with the substrate dormant is not a result, and
   without that line on screen it looks like one.

   OFF UNLESS ASKED FOR. `?fps` in the URL and nothing else turns it on — a
   visitor can never see it, and it costs one string comparison on every
   other load.
   ========================================================================== */
window.PAGE.register('fps', function () {
  'use strict';
  if (!/[?&]fps(&|=|$)/.test(location.search)) return;

  var el = document.createElement('div');
  el.className = 'fpsbox';
  el.innerHTML = '<b data-fps>--</b> fps<br>' +
                 '<span data-ms>--</span> ms avg<br>' +
                 '<span data-p95>--</span> ms p95<br>' +
                 '<span data-draw>--</span> drawn/offered<br>' +
                 '<i data-state></i>';
  document.body.appendChild(el);

  var fpsEl = el.querySelector('[data-fps]'),
      msEl  = el.querySelector('[data-ms]'),
      p95El = el.querySelector('[data-p95]'),
      drwEl = el.querySelector('[data-draw]'),
      stEl  = el.querySelector('[data-state]');

  /* A ring of the last 120 frame times. Fixed size on purpose: a growing
     array is itself a per-frame allocation, which is precisely the kind of
     cost a profiler must not introduce into what it is profiling. */
  var N = 120, times = new Float32Array(N), at = 0, filled = 0;
  var last = performance.now(), acc = 0, frames = 0, raf = 0;
  var sorted = new Float32Array(N);

  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = now - last; last = now;
    if (dt <= 0 || dt > 1000) return;          // tab wake, not a real frame

    times[at] = dt; at = (at + 1) % N;
    if (filled < N) filled++;
    acc += dt; frames++;

    if (acc >= 500) {
      var mean = acc / frames;
      fpsEl.textContent = (1000 / mean).toFixed(0);
      msEl.textContent = mean.toFixed(1);

      sorted.set(times);
      var view = Array.prototype.slice.call(sorted, 0, filled).sort(function (a, b) { return a - b; });
      p95El.textContent = view[Math.floor(filled * 0.95)].toFixed(1);

      var D = window.DORMANT;
      drwEl.textContent = D.drawn + '/' + D.offered;
      D.drawn = 0; D.offered = 0;

      var st = [];
      if (D.hidden)  st.push('hidden');
      if (D.covered) st.push('covered');
      if (D.reduced) st.push('reduced');
      if (window.OFF.list.length) st.push('off: ' + window.OFF.list.join('+'));
      stEl.textContent = st.length ? st.join(' · ') : 'all layers live';

      acc = 0; frames = 0;
    }
  }
  raf = requestAnimationFrame(tick);

  return function () { cancelAnimationFrame(raf); el.remove(); };
});
