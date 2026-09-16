/* ==========================================================================
   lifecycle.js — mount / unmount registry.

   Every module registers a boot function that returns its own teardown,
   rather than running itself on load. Nothing here needs that yet — the site
   is one page. It exists now because retrofitting it later is the expensive
   version: the reference's own notes describe exactly this, where modules
   written as IIFEs kept their listeners and tickers alive against DOM that
   had already been swapped away.
   ========================================================================== */
window.PAGE = (function () {
  'use strict';
  var mods = [], live = [];

  return {
    register: function (name, boot) { mods.push({ name: name, boot: boot }); },

    /* `only` is an optional allowlist of module names. The phone build uses
       it to mount five modules instead of eleven — an allowlist rather than
       a skip-list on purpose, so a module added later is OFF on mobile
       until someone has thought about whether it belongs there. */
    mount: function (scope, only) {
      scope = scope || document;
      mods.forEach(function (m) {
        if (only && only.indexOf(m.name) === -1) return;
        try {
          var down = m.boot(scope);
          if (typeof down === 'function') live.push({ name: m.name, down: down });
        } catch (e) {
          /* ISOLATED ON PURPOSE. One module throwing on mount must not take
             the rest of the page with it — the reference learned this the
             same way, with a figure lookup that threw on every page that had
             no figure. */
          console.error('[mount] ' + m.name, e);
        }
      });
    },

    unmount: function () {
      live.forEach(function (l) {
        try { l.down(); } catch (e) { console.error('[unmount] ' + l.name, e); }
      });
      live = [];
    }
  };
})();
