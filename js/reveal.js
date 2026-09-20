/* ==========================================================================
   reveal.js — EXPERIMENTS: a project surfaces over the living field.

   Hovering (or focusing) a project opens a foreground panel ON TOP of the
   particle structure, through a soft expanding wave. Nothing here touches
   the renderer: no uniform, no state, no pause. The field underneath keeps
   doing exactly what it did, and is visible everywhere the wave has not
   reached.

   HOW THE WAVE IS MADE. Two parts, both plain CSS driven by classes:
     - a mask on the panel layer, a radial gradient whose radius (--rv-r, a
       registered custom property so it can transition) grows from the
       origin with a 70px soft edge - the content is uncovered by the wave,
       not faded in behind it;
     - two thin rings that run out ahead of it and fade - the ripple that
       arrives before the content does.

   WHERE IT STARTS. The origin is the point of the panel NEAREST the thing
   being hovered. A card at the top right opens it from the upper right
   edge; a slot along the bottom opens it from the bottom edge under that
   slot. Every project has its own origin without a table of them, and the
   wave always visibly comes from the direction of what you pointed at.

   SWITCHING. Two layers. The new project opens on the front layer from its
   own origin while the previous one fades out behind it, so moving between
   projects is one wave overtaking another rather than close-then-open.

   ON A PHONE there is no hover, so a TAP opens it, and the wave starts from
   the fingertip rather than from the panel edge nearest the card. The panel
   is fixed to the screen instead of the section (the section is a tall
   stretch of document there, not a screen). Tapping the same project again,
   tapping outside, the close button, or scrolling away all close it.

   CONTENT. Read from the project element itself: the name (its <b>), and
   from its <template>: .rv__desc, .rv__shots, .rv__link. Anything the
   template leaves out falls back to the card's own sentence and link. Real
   screenshots are <img> elements inside .rv__shot.
   ========================================================================== */
window.PAGE.register('reveal', function (scope) {
  'use strict';

  var PHONE = document.documentElement.classList.contains('is-mobile');

  /* One instance per pane that asks for one. EXPERIMENTS opens a project over
     the dispersing field; AUTOMATION opens one over the globe. They share this
     code and nothing else: each has its own layers, its own items, and its own
     idea of which project is open. */
  var instances = Array.prototype.slice
    .call(scope.querySelectorAll('[data-reveal-host]'))
    .map(build)
    .filter(Boolean);
  if (!instances.length) return;
  return function teardownAll() {
    instances.forEach(function (down) { down(); });
  };

  function build(host) {
    var pane = host.closest('.pane');
    if (!pane) return null;
    var items = Array.prototype.slice.call(pane.querySelectorAll('[data-reveal]'));
    if (!items.length) return null;

    var layers = [0, 1].map(function () {
      var l = document.createElement('div');
      l.className = 'reveal';
      l.innerHTML = '<span class="reveal__ring"></span><span class="reveal__ring"></span>' +
                    '<div class="reveal__mask"><div class="reveal__panel"></div></div>';
      host.appendChild(l);
      var panel = l.querySelector('.reveal__panel');
      panel.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'touch') clearTimeout(closeT);
      });
      panel.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'touch') close();
      });
      return { el: l, panel: panel, t: 0 };
    });

    var active = 0, current = null, closing = null, closeT = 0;

    /* Back to closed with no transition, ready to be reused from any origin. */
    function reset(L) {
      clearTimeout(L.t);
      L.el.classList.add('is-snap');
      L.el.classList.remove('is-open', 'is-front', 'is-fading');
      void L.el.offsetWidth;
      L.el.classList.remove('is-snap');
    }

    function fill(L, item) {
      var panel = L.panel;
      panel.textContent = '';
      var parts = [];

      var name = item.querySelector('b');
      if (name) {
        var n = name.cloneNode(true);
        n.classList.add('rv__name');
        parts.push(n);
      }
      var tpl = item.querySelector('template');
      var frag = tpl ? tpl.content.cloneNode(true) : document.createDocumentFragment();

      var desc = frag.querySelector('.rv__desc');
      if (!desc) {
        var line = item.querySelector('span');
        if (line) {
          desc = document.createElement('p');
          desc.className = 'rv__desc';
          desc.textContent = line.textContent;
        }
      }
      if (desc) parts.push(desc);
      var shots = frag.querySelector('.rv__shots');
      if (shots) parts.push(shots);
      var link = frag.querySelector('.rv__link');
      if (!link) {
        var own = item.querySelector('a, s');
        if (own) { link = own.cloneNode(true); link.classList.add('rv__link'); }
      }
      if (link) {
        /* The panel is a visual duplicate of the card (aria-hidden), so its
           copy of a link must not be a second tab stop. */
        if (link.tagName === 'A') link.setAttribute('tabindex', '-1');
        parts.push(link);
      }

      /* A touch screen has no pointer to move away, so the panel says how to
         leave. Desktop closes on hover-out and never shows this. */
      if (PHONE) {
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'rv__close';
        x.textContent = 'close';
        x.addEventListener('click', function (e) { e.stopPropagation(); closeNow(); });
        parts.push(x);
      }

      parts.forEach(function (el, i) {
        el.style.setProperty('--i', i);
        panel.appendChild(el);
      });
    }

    /* The origin: the panel's nearest point to the hovered item, pulled a
       little inside so the wave starts ON the panel rather than at its rim.
       --rmax is the distance to the panel's farthest corner plus the soft
       edge, so the wave always finishes having uncovered all of it. */
    function place(L, item, at) {
      var box = L.el.getBoundingClientRect();
      var p = L.panel.getBoundingClientRect();
      var r = item.getBoundingClientRect();
      var cx = at ? at.x : r.left + r.width / 2, cy = at ? at.y : r.top + r.height / 2;
      var ox = Math.max(p.left + 22, Math.min(p.right - 22, cx));
      var oy = Math.max(p.top + 22, Math.min(p.bottom - 22, cy));
      var far = 0;
      [[p.left, p.top], [p.right, p.top], [p.left, p.bottom], [p.right, p.bottom]]
        .forEach(function (c) { far = Math.max(far, Math.hypot(c[0] - ox, c[1] - oy)); });
      L.el.style.setProperty('--ox', (ox - box.left).toFixed(1) + 'px');
      L.el.style.setProperty('--oy', (oy - box.top).toFixed(1) + 'px');
      L.el.style.setProperty('--rmax', Math.ceil(far + 90) + 'px');
    }

    function mark(item, on) { if (item) item.classList.toggle('is-active', on); }

    var openedAtY = 0;
    function open(item, at) {
      clearTimeout(closeT);
      if (item === current) return;
      /* is-live is the desktop's "this phase is on screen" flag, set by the
         virtual scroll. The phone scrolls natively and has no such flag - a
         project you can tap is by definition on screen. */
      if (!PHONE && !pane.classList.contains('is-live')) return;
      openedAtY = window.scrollY;

      /* Re-entering the project that is still closing: reverse the same wave
         instead of snapping it shut and starting again. */
      if (!current && closing === item) {
        var back = layers[active];
        clearTimeout(back.t);
        back.el.classList.add('is-open');
        current = item; closing = null; mark(item, true);
        return;
      }

      var inc;
      if (current) {
        var out = layers[active];
        out.el.classList.remove('is-front');
        out.el.classList.add('is-fading');
        out.t = setTimeout(function () { reset(out); }, 900);
        inc = layers[1 - active];
        mark(current, false);
      } else {
        inc = layers[active];
      }
      reset(inc);
      fill(inc, item);
      place(inc, item, at);
      inc.el.classList.add('is-front');
      void inc.el.offsetWidth;
      inc.el.classList.add('is-open');

      active = layers.indexOf(inc);
      current = item; closing = null;
      mark(item, true);
    }

    /* A short grace period, so crossing the gap from a card to the panel - or
       from one card to the next - does not collapse the wave on the way. */
    function close() {
      clearTimeout(closeT);
      closeT = setTimeout(closeNow, 240);
    }
    function closeNow() {
      clearTimeout(closeT);
      if (!current) return;
      var L = layers[active];
      L.el.classList.remove('is-open');
      L.t = setTimeout(function () { reset(L); closing = null; }, 620);
      mark(current, false);
      closing = current; current = null;
    }

    /* A tap focuses the card before it clicks it. Without this the focus
       would open the panel and the click that follows would close it again,
       so focus only counts when it did not come from a pointer. */
    var pointerAt = 0;
    items.forEach(function (item) {
      item.addEventListener('pointerdown', function () { pointerAt = performance.now(); });
      item.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'touch') open(item);
      });
      item.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'touch') close();
      });
      item.addEventListener('click', function (e) {
        if (!PHONE) return;
        if (current === item) { closeNow(); return; }
        open(item, { x: e.clientX, y: e.clientY });
      });
      item.addEventListener('focusin', function () {
        if (performance.now() - pointerAt > 600) open(item);
      });
      item.addEventListener('focusout', function () {
        if (performance.now() - pointerAt > 600) close();
      });
    });
    function onDocClick(e) {
      if (!current) return;
      var inPanel = layers.some(function (L) { return L.panel.contains(e.target); });
      if (!inPanel && !current.contains(e.target)) closeNow();
    }
    function onScroll() {
      if (current && Math.abs(window.scrollY - openedAtY) > 60) closeNow();
    }
    if (PHONE) {
      document.addEventListener('click', onDocClick);
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    /* Scrolling means leaving the phase; do not leave a panel hanging over
       whatever comes next. */
    window.addEventListener('wheel', closeNow, { passive: true });

    return function teardown() {
      clearTimeout(closeT);
      window.removeEventListener('wheel', closeNow);
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll);
      layers.forEach(function (L) { clearTimeout(L.t); L.el.remove(); });
    };
  }
});
