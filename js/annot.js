/* ==========================================================================
   annot.js — leader lines from the copy to the subject.

   SYSTEMS annotates the object the way a technical drawing annotates a
   part: a question in a gutter, a thin line, a point on the thing itself.
   (BACKEND used to as well; its callouts became one statement. The
   data-slice anchor below still works if a phase wants them back.) The whole value of that is the line ENDING SOMEWHERE REAL, which
   is why these are projected rather than drawn.

   WHY NOT A STATIC LINE. A fixed diagonal pointing at the middle of the
   screen is a tenth of the work and looks identical in a screenshot. It
   stops looking identical the moment anything moves: the subject turns with
   the scroll, drifts on its own, and in BACKEND comes apart into fourteen
   plates that travel as it goes. A leader that ignores that is aimed
   correctly for about one frame of the page and visibly wrong for the rest.

   BOTH KINDS OF ANCHOR ARE A SEED, NOT A DESTINATION. data-slice="4"
   names slab 4 of the BACKEND stack; data-anchor="x,y,z" is a point in
   model space. Either way the coordinate is used ONCE, to choose a real
   particle near it, and from then on the line follows that particle —
   see state.pin() / state.pinAt() in js/substrate.js.

   That indirection is the whole fix for a leader coming off its slab. A
   coordinate says where the slab RESTS; the renderer moves every point
   between phases on its own staggered clock, so a coordinate is right at
   the middle of a phase and parts company with the material as soon as you
   scroll off it — in both directions, because the stagger is behind going
   one way and ahead going the other. A particle cannot part company with
   the material because it IS the material. The highlight follows the same
   published point, so the arrow and the lit patch are two readings of one
   number rather than two calculations that agree only sometimes.

   COST. One rAF per annotated pane, a handful of getBoundingClientRect
   calls and a few attribute writes per frame, and only while that phase is
   near the screen — the observer parks the loop otherwise.
   ========================================================================== */
window.PAGE.register('annot', function (scope) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var rigs = [], uid = 0;

  /* HOW LONG THE HIGHLIGHT TAKES TO ARRIVE, in seconds of e-folding.

     The lines never needed this: they are DOM, inside the pane, so the
     pane's own opacity fades them with the copy for free. The yellow is
     not — it is drawn by the renderer from a list of anchors, and a list
     has no opacity. Publishing an anchor lit it at full strength on the
     next frame, so the callout faded in over most of a screen of scroll
     and the patch it points at snapped on.

     Same easing as everything else on the page — exponential approach on
     real elapsed time, so it behaves the same at 60 and 144Hz — and it is
     a FLOOR rather than a schedule: it smooths the scroll ramp, and it
     also covers the two cases that have no ramp at all, arriving by the
     bar buttons and the anchors resolving one per frame at mount. */
  var HOT_EASE = 0.20;

  /* A HOLE IN THE LEADERS WHERE THE POINTER HAS OPENED ONE.

     The reveal cuts through the object; a leader line drawn straight across
     that opening sits on top of the thing being revealed and reads as a
     scratch on the glass. So every rig gets a mask: white everywhere, with
     a soft black disc tracking the cursor. Black hides.

     An SVG <mask> with a moving <circle> rather than a CSS radial-gradient
     mask, because the CSS version means rebuilding and reparsing a gradient
     string every frame, and this is three attribute writes. */
  function buildMask(svg) {
    var id = 'annotHole' + (++uid);
    var defs = document.createElementNS(NS, 'defs');
    var grad = document.createElementNS(NS, 'radialGradient');
    grad.setAttribute('id', id + 'g');
    [['0%', '#000'], ['52%', '#000'], ['100%', '#fff']].forEach(function (p) {
      var st = document.createElementNS(NS, 'stop');
      st.setAttribute('offset', p[0]);
      st.setAttribute('stop-color', p[1]);
      grad.appendChild(st);
    });
    var mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', id);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '-9999'); bg.setAttribute('y', '-9999');
    bg.setAttribute('width', '19998'); bg.setAttribute('height', '19998');
    bg.setAttribute('fill', '#fff');
    var hole = document.createElementNS(NS, 'circle');
    hole.setAttribute('fill', 'url(#' + id + 'g)');
    hole.setAttribute('r', '0');
    mask.appendChild(bg); mask.appendChild(hole);
    defs.appendChild(grad); defs.appendChild(mask);
    svg.appendChild(defs);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('mask', 'url(#' + id + ')');
    svg.appendChild(g);
    return { hole: hole, layer: g };
  }

  Array.prototype.forEach.call(scope.querySelectorAll('[data-annot-lines]'),
    function (svg) {
      var pane = svg.closest('.pane');
      if (!pane) return;
      var blocks = Array.prototype.slice.call(
        pane.querySelectorAll('[data-anchor],[data-slice],[data-route]'));
      if (!blocks.length) return;

      var mk = buildMask(svg);
      /* Which phase's geometry these anchors belong to — the pane already
         declares it, and a pin has to be picked out of the right shell. */
      var phase = +(pane.getAttribute('data-phase') || 0);
      var items = blocks.map(function (el) {
        /* ---- A ROUTE: several points on the subject, walked in order ----
           data-route="x,y,z x,y,z ..." lists nodes from the ORIGIN, deep in
           the structure, to the node the path leaves from. Each is pinned to
           a real particle like any anchor, so the whole path travels with
           the material. Drawn as one polyline plus a dot per node; no
           highlight, because on the paper ground the highlight is yellow
           and this phase is monochrome. Red only while its callout is
           hovered - the one active state on the screen. */
        var route = el.getAttribute('data-route');
        if (route) {
          var seeds = route.trim().split(/\s+/).map(function (t) {
            return t.split(',').map(Number);
          });
          var poly = document.createElementNS(NS, 'polyline');
          poly.setAttribute('class', 'annot__route');
          mk.layer.appendChild(poly);
          var dots = seeds.map(function (_, i) {
            var c = document.createElementNS(NS, 'circle');
            c.setAttribute('class', i === 0 ? 'annot__node annot__node--root' : 'annot__node');
            c.setAttribute('r', i === 0 ? '3.5' : '3');
            mk.layer.appendChild(c);
            return c;
          });
          var on = function (v) {
            poly.classList.toggle('is-on', v);
            dots.forEach(function (d) { d.classList.toggle('is-on', v); });
          };
          el.addEventListener('pointerenter', function () { on(true); });
          el.addEventListener('pointerleave', function () { on(false); });
          el.addEventListener('focusin', function () { on(true); });
          el.addEventListener('focusout', function () { on(false); });
          return { el: el, route: true, poly: poly, dots: dots, seeds: seeds,
                   pins: seeds.map(function () { return -1; }), phase: phase };
        }

        var raw = el.getAttribute('data-anchor');
        var end = raw === 'end';
        var line = document.createElementNS(NS, 'line');
        line.setAttribute('class', end ? 'annot__line annot__line--end' : 'annot__line');
        var dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('class', 'annot__dot');
        dot.setAttribute('r', '2');
        mk.layer.appendChild(line);
        mk.layer.appendChild(dot);
        return {
          el: el, line: line, dot: dot, phase: phase, pin: -1,
          slice: el.hasAttribute('data-slice') ? +el.getAttribute('data-slice') : null,
          /* "end" is not a place, it is a question for the renderer: the
             last point of the shape. Resolved by state.pinLowest(). */
          end: end,
          a: raw && !end ? raw.split(',').map(Number) : null,
          /* Which edge the line leaves from. Read once — it cannot change.
             Checked on an ANCESTOR as well as the element: in BACKEND the
             side is a class on the block itself, but in SYSTEMS the
             annotated things are <p> children of a .flow--r column and
             carry no class of their own. Testing only the element left
             every right-hand question emitting its leader from the wrong
             edge, so the line crossed back over its own text. */
          right: !!el.closest('.annot--r, .flow--r, .flow__end') ||
                 el.hasAttribute('data-from-right')
        };
      });
      rigs.push({ pane: pane, svg: svg, mk: mk, items: items,
                  running: false, raf: 0, hot: [], amp: 0, t: 0 });
    });

  if (!rigs.length) return;

  function step(rig) {
    if (!rig.running) { rig.raf = 0; return; }
    rig.raf = requestAnimationFrame(function () { step(rig); });

    var S = window.SUBSTRATE;
    if (!S || typeof S.project !== 'function') return;
    /* The pane fades on distance from its own screen, and the highlight
       follows it: the lit patch and the sentence that points at it are one
       thing and should appear as one. Eased on top of that so nothing can
       reach the screen in a single frame however fast the target moves. */
    var now = performance.now();
    var dt = Math.min((now - (rig.t || now)) / 1000, 0.1); rig.t = now;
    var vis = parseFloat(getComputedStyle(rig.pane).opacity) || 0;
    if (vis < 0.04) vis = 0;
    rig.amp += (vis - rig.amp) * (1 - Math.exp(-dt / HOT_EASE));

    /* Hiding the lines is still a hard cut at the threshold — they are
       already faded to nothing by the pane's opacity — but the anchors stay
       published until the highlight has actually finished going out, or the
       fade would be cut off at exactly the point it becomes a fade. */
    if (vis === 0) {
      rig.svg.style.visibility = 'hidden';
      if (rig.amp < 0.004) { rig.amp = 0; rig.hot = []; publish(); return; }
    } else {
      rig.svg.style.visibility = '';
    }

    var host = rig.svg.getBoundingClientRect();

    /* Track the opening. r goes to 0 when the pointer leaves, which closes
       the hole rather than leaving a permanent gap in the drawing. */
    var rp = S.revealPx;
    if (rp && rp.on > 0.02) {
      rig.mk.hole.setAttribute('cx', (rp.x - host.left).toFixed(1));
      rig.mk.hole.setAttribute('cy', (rp.y - host.top).toFixed(1));
      rig.mk.hole.setAttribute('r', (rp.r * rp.on).toFixed(1));
    } else {
      rig.mk.hole.setAttribute('r', '0');
    }
    /* Collected as we go and handed to the renderer, which lights the
       material within reach of each one. The leader says WHERE; this is
       what makes the object answer. */
    rig.hot = [];

    var solved = 0;
    rig.items.forEach(function (it) {
      if (it.route) { solved = drawRoute(it, S, host, solved); return; }

      /* CHOOSING THE PARTICLE. A linear scan of 110,000 points, so at most
         one per frame: fourteen anchors settle inside a quarter of a second
         and no single frame ever pays for more than one of them. Until an
         item is pinned it uses the analytic anchor, which is exact at the
         middle of the phase — where the pane is when you arrive at it. */
      if (it.pin < 0 && !solved && it.end && typeof S.pinLowest === 'function') {
        it.pin = S.pinLowest(it.phase); solved = 1;
      }
      if (it.pin < 0 && !solved && !it.end && typeof S.pin === 'function') {
        /* The seed is the slab's RESTING place, on its near edge and on the
           side the copy is: the leader should touch the plate it names, and
           a point on the axis of rotation never moves when the subject
           turns, so it would pick a particle that cannot track the spin. */
        var sd = it.a;
        if (it.slice !== null && typeof S.sliceCentre === 'function') {
          var c0 = S.sliceCentre(it.slice, it.right ? 0.20 : -0.20, 0.07, 1);
          sd = [c0.x, c0.y, c0.z];
        }
        if (sd) { it.pin = S.pin(sd[0], sd[1], sd[2], it.phase); solved = 1; }
      }

      var a = null;
      if (it.pin >= 0 && typeof S.pinAt === 'function') {
        var q = S.pinAt(it.pin);
        if (q) a = [q.x, q.y, q.z];
      }
      if (!a) {                                   // not pinned yet
        a = it.a;
        if (it.slice !== null && typeof S.sliceCentre === 'function') {
          var c = S.sliceCentre(it.slice, it.right ? 0.20 : -0.20, 0.07);
          a = [c.x, c.y, c.z];
        }
      }
      /* isFinite too: a typo in data-anchor parses to NaN, and one NaN in
         uHot makes the shader's distance test NaN for EVERY point, which
         lights the entire subject rather than failing at the one callout. */
      if (!a || !isFinite(a[0] + a[1] + a[2])) {
        it.line.setAttribute('opacity', '0');
        it.dot.setAttribute('opacity', '0'); return;
      }
      rig.hot.push([a[0], a[1], a[2], rig.amp]);

      var p = S.project(a[0], a[1], a[2]);
      /* isFinite as well as null: a projection can come back with NaN if the
         camera is degenerate, and the SVG rejects that loudly rather than
         quietly. Cheaper to test here than to reason about upstream. */
      if (!p || !isFinite(p.x) || !isFinite(p.y)) {
        it.line.setAttribute('opacity', '0');
        it.dot.setAttribute('opacity', '0'); return;
      }
      it.line.setAttribute('opacity', '1');
      it.dot.setAttribute('opacity', '1');

      /* INTO THE SVG'S OWN COORDINATES, WHICH ARE NOT THE VIEWPORT'S.

         project() answers in viewport pixels, because that is where the
         canvas is — it is position:fixed and never moves. This <svg> is
         not: it sits inside the pane, and the pane rides a track that the
         scroll translates, so host.top runs from 0 to a whole viewport
         height as the phase crosses the screen.

         Writing a viewport coordinate into that element put the end of the
         line exactly one scroll offset away from the point it was aiming
         at. Zero at the middle of the phase, which is why it looked right
         standing still and came apart the moment you touched the wheel —
         upward one way, downward the other. The line's OTHER end and the
         reveal mask were already converted; this end was not. */
      var ex = p.x - host.left, ey = p.y - host.top;

      /* The line leaves the block from the edge FACING the subject, at the
         block's own vertical centre. Leaving from a corner reads as a box
         being dragged; leaving from the middle of the near edge reads as a
         callout. */
      var b = it.el.getBoundingClientRect();
      var x1 = (it.right ? b.left : b.right) - host.left;
      var y1 = b.top + b.height / 2 - host.top;

      it.line.setAttribute('x1', x1.toFixed(1));
      it.line.setAttribute('y1', y1.toFixed(1));
      it.line.setAttribute('x2', ex.toFixed(1));
      it.line.setAttribute('y2', ey.toFixed(1));
      it.dot.setAttribute('cx', ex.toFixed(1));
      it.dot.setAttribute('cy', ey.toFixed(1));
    });

    publish();
  }

  /* ---- ROUTES ----------------------------------------------------------
     Through the nodes, then OUT: from the last node the path runs on a
     diagonal to the height of its callout's name and then level into the
     callout's rule. The diagonal is what makes it read as the same path
     leaving the structure rather than a second line starting where the
     first stopped; the level run is what lands it squarely on the words.

     Returns the updated one-pin-per-frame flag, shared with the anchors. */
  function drawRoute(it, S, host, solved) {
    var pts = [], i;
    for (i = 0; i < it.seeds.length; i++) {
      var sd = it.seeds[i];
      if (it.pins[i] < 0 && !solved && typeof S.pin === 'function') {
        it.pins[i] = S.pin(sd[0], sd[1], sd[2], it.phase); solved = 1;
      }
      var q = it.pins[i] >= 0 && typeof S.pinAt === 'function' ? S.pinAt(it.pins[i]) : null;
      var a = q ? [q.x, q.y, q.z] : sd;
      var p = isFinite(a[0] + a[1] + a[2]) ? S.project(a[0], a[1], a[2]) : null;
      if (!p || !isFinite(p.x) || !isFinite(p.y)) {
        it.poly.setAttribute('opacity', '0');
        it.dots.forEach(function (d) { d.setAttribute('opacity', '0'); });
        return solved;
      }
      pts.push([p.x - host.left, p.y - host.top]);
    }

    /* Lands on the NAME, the first line of the callout, at its left rule. */
    var box = it.el.getBoundingClientRect();
    var head = (it.el.firstElementChild || it.el).getBoundingClientRect();
    var tx = box.left - host.left, ty = head.top + head.height / 2 - host.top;
    var last = pts[pts.length - 1];
    /* The elbow: 3 across for every 4 down, but never closer than 36px to
       the callout, so the level run is always long enough to read. */
    var ex = Math.min(last[0] + Math.abs(ty - last[1]) * 0.75, tx - 36);
    if (ex < last[0]) ex = last[0];
    var all = pts.concat([[ex, ty], [tx, ty]]);

    it.poly.setAttribute('points', all.map(function (v) {
      return v[0].toFixed(1) + ',' + v[1].toFixed(1);
    }).join(' '));
    it.poly.setAttribute('opacity', '1');
    for (i = 0; i < it.dots.length; i++) {
      it.dots[i].setAttribute('cx', pts[i][0].toFixed(1));
      it.dots[i].setAttribute('cy', pts[i][1].toFixed(1));
      it.dots[i].setAttribute('opacity', '1');
    }
    return solved;
  }

  /* THE UNION OF EVERY RIG, not whichever one ran last.

     Both annotated phases are inside the observer's generous margin at the
     same time, so both loops run on the same frames. Each used to assign
     window.SUBSTRATE.hot directly, which meant the off-screen one's empty
     list overwrote the visible one's anchors — and since the order they run
     in is the DOM order, the highlight worked on one phase and never on the
     other. Concatenating is the fix and costs nothing: only one pane is
     legible at a time, so the list is short whatever happens. */
  function publish() {
    var all = [];
    rigs.forEach(function (r) { all = all.concat(r.hot); });
    if (window.SUBSTRATE) window.SUBSTRATE.hot = all;
  }

  /* Runs only while its phase is anywhere near the screen. An observer
     rather than a scroll handler, and the panes sit inside a transformed
     track, so the root is the viewport and the margin is generous. */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      rigs.forEach(function (rig) {
        if (rig.pane !== e.target) return;
        rig.running = e.isIntersecting;
        if (rig.running && !rig.raf) rig.raf = requestAnimationFrame(function () { step(rig); });
        if (!rig.running) {
          rig.svg.style.visibility = 'hidden';
          /* Not just cleared — reset, so a rig that is parked while still
             lit fades UP again when it comes back rather than resuming at
             whatever strength it happened to stop at. */
          rig.amp = 0; rig.t = 0; rig.hot = []; publish();
        }
      });
    });
  }, { rootMargin: '40% 0px 40% 0px', threshold: 0 });
  rigs.forEach(function (rig) { io.observe(rig.pane); });

  return function teardown() {
    io.disconnect();
    rigs.forEach(function (rig) {
      rig.running = false;
      if (rig.raf) cancelAnimationFrame(rig.raf);
      if (rig.mk.layer.parentNode) rig.mk.layer.parentNode.removeChild(rig.mk.layer);
    });
  };
});
