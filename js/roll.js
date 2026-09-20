/* roll.js — the project column follows the pointer down the right-hand side.
 *
 * WHY THIS AND NOT A SCROLLBAR
 * Six projects do not fit the gutter on any laptop. The ordinary answers are
 * a scrollbar — the only one on a page that has deliberately hidden every
 * other affordance — or cutting the list to whatever fits, which is a layout
 * deciding what a visitor is allowed to see. Neither is acceptable, so the
 * column is a window and the strip inside it rolls: move the pointer down the
 * right-hand side and the list tracks it, top of the travel at the top of the
 * column, bottom at the bottom.
 *
 * IT IS A MAPPING, NOT A MOMENTUM MODEL. Pointer position maps directly to
 * strip offset, so the same pointer position always shows the same part of the
 * list. An inertial version was the first instinct and it is wrong here: this
 * is a short list someone is scanning, not a feed, and a list that keeps
 * moving after the pointer stops is a list you cannot point at.
 *
 * IT DOES NOTHING WHEN IT IS NOT NEEDED. If the content already fits the
 * window — a tall screen, a shorter list, the phone build where the column is
 * a horizontal swipe row — there is no overflow, the offset stays zero, and no
 * listener does any work beyond a comparison.
 */
(function () {
  'use strict';

  var HOT_ZONE = 120;   /* how far left of the column the pointer still counts */
  var EDGE_PAD = 10;    /* dead band at each end, so the extremes are reachable */

  function setup(host) {
    var strip = host.querySelector('[data-roll-strip]');
    if (!strip) return null;

    var state = { host: host, strip: strip, overflow: 0, t: 0, engaged: false };

    measure(state);
    return state;
  }

  /* The travel available, recomputed whenever the layout could have changed.
     Read in one place so a resize cannot leave a stale number behind. */
  function measure(state) {
    var windowH = state.host.clientHeight;
    var contentH = state.strip.scrollHeight;
    state.overflow = Math.max(0, contentH - windowH);
    if (state.overflow === 0) apply(state, 0);
  }

  function apply(state, t) {
    state.t = t;
    state.strip.style.setProperty('--roll', (-state.overflow * t).toFixed(1) + 'px');
  }

  /* Where the pointer sits within the column's own vertical span, 0 at the
     top and 1 at the bottom, with a small dead band at each end so the first
     and last entries are both reachable without pixel-hunting the very edge. */
  function positionFor(state, clientY) {
    var box = state.host.getBoundingClientRect();
    var span = box.height - EDGE_PAD * 2;
    if (span <= 0) return 0;
    var t = (clientY - box.top - EDGE_PAD) / span;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /* HORIZONTAL POSITION DECIDES, VERTICAL ONLY CLAMPS.
     Leaving the zone by drifting a few pixels below the last card would snap
     the list back to the top, which is the opposite of what the movement was
     asking for. Past the bottom of the column simply means the bottom of the
     list; only moving away from the right-hand side lets go. */
  function inZone(state, clientX) {
    var box = state.host.getBoundingClientRect();
    return clientX >= box.left - HOT_ZONE;
  }

  function mount() {
    var hosts = Array.prototype.slice.call(document.querySelectorAll('[data-roll]'));
    var states = hosts.map(setup).filter(Boolean);
    if (!states.length) return;

    window.addEventListener('pointermove', function (ev) {
      /* A touch drag is the browser's business, not ours: on a coarse pointer
         the same markup is a swipe row, and hijacking the move would fight it. */
      if (ev.pointerType === 'touch') return;

      for (var i = 0; i < states.length; i++) {
        var state = states[i];
        if (state.overflow === 0) continue;

        if (inZone(state, ev.clientX)) {
          state.engaged = true;
          apply(state, positionFor(state, ev.clientY));
        } else if (state.engaged) {
          /* Back to the top on leaving, rather than holding the last offset.
             A column that stayed where it was left means the next visitor to
             this phase finds it half-scrolled with no explanation. */
          state.engaged = false;
          apply(state, 0);
        }
      }
    }, { passive: true });

    /* KEYBOARD GETS THE SAME LIST. Tabbing through the entries moves focus
       inside a clipped window, which without this scrolls nothing and appears
       to lose the focus ring entirely. */
    document.addEventListener('focusin', function (ev) {
      for (var i = 0; i < states.length; i++) {
        var state = states[i];
        if (state.overflow === 0) continue;
        if (!state.strip.contains(ev.target)) continue;

        var itemBox = ev.target.getBoundingClientRect();
        var stripBox = state.strip.getBoundingClientRect();
        var offsetInStrip = itemBox.top - stripBox.top + (state.overflow * state.t);
        var target = offsetInStrip - (state.host.clientHeight - itemBox.height) / 2;
        var t = state.overflow > 0 ? target / state.overflow : 0;
        apply(state, t < 0 ? 0 : t > 1 ? 1 : t);
      }
    });

    /* A PHASE THAT IS NOT ON SCREEN HAS NO LAYOUT, so the measurement taken
       at mount is zero for every pane except the first. Watching the strip
       catches the moment it gains a box — when its phase arrives, when the
       fonts land, when a card wraps to another line — without polling and
       without guessing which of those happened. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        for (var i = 0; i < states.length; i++) {
          var before = states[i].overflow;
          measure(states[i]);
          if (states[i].overflow !== before) apply(states[i], states[i].t);
        }
      });
      for (var j = 0; j < states.length; j++) {
        ro.observe(states[j].strip);
        ro.observe(states[j].host);
      }
    }

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        for (var i = 0; i < states.length; i++) {
          measure(states[i]);
          apply(states[i], states[i].t);
        }
      }, 120);
    });

    /* The web fonts land after first paint and change every card's height, so
       a measurement taken before they arrive is short by a line or two. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        for (var i = 0; i < states.length; i++) measure(states[i]);
      });
    }

    window.ROLL = { states: states, measure: measure, apply: apply, positionFor: positionFor };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
