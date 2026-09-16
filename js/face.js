/* ==========================================================================
   face.js — the thing inside the structure.

   WHAT THIS IS FOR
   js/substrate.js draws two layers. The shell is the cubist panel; the
   second layer is what the pointer uncovers through it. That layer used to
   be loose unassembled material — the same palette, never resolved. It is
   now a portrait, and the loose material became the state it resolves FROM:
   hover, and the material gathers into a face.

   WHY IT IS A STIPPLE DRAWING AND NOT A SHADED HEAD
   This was attempted three times as a shaded head and abandoned each time,
   for a reason worth writing down: a face is read almost entirely from
   OCCLUSION — the shadow under the brow, the edge where the nose hides the
   far cheek — and a cloud of additive points has no occlusion at all. Every
   point behind shows through every point in front, so a shaded head reads as
   a lit balloon.

   The fourth attempt was a wireframe, following the reference render, and it
   failed differently and more instructively: a regular lattice of meridians
   and parallels over a head reads as a MESH MASK, not a face, and dark eyes
   inside a bright grid read as sockets. A wireframe render gets away with it
   because it also has shaded surfaces under the wire. We have no surfaces.

   So this is the fifth: a stipple engraving. In an additive point cloud
   DENSITY IS BRIGHTNESS — which is the one fact the first four attempts all
   got backwards, most embarrassingly by making "dark hair" dense and
   watching it come out as the brightest thing on the screen. Density is
   therefore spent the way a chalk drawing on black paper spends chalk: on
   the LIT planes. The forehead, the bridge of the nose, the cheekbones and
   the chin are dense; the sockets, the shadow under the nose and the line
   under the lip are where the paper is left bare. No grid anywhere.

   WHERE THE LIKENESS ACTUALLY LIVES
   Not in the proportions of the skull, which are close to everybody's. It is
   in four things, and they are the four things given the most points here:
   the heavy squared glasses, the mass and sweep of the hair, the jaw with
   its stubble, and the collar. Those survive abstraction. Cheekbone
   modelling does not, at this resolution, and is only suggested.

   COLOUR IS SPENT TWICE
   The eyes and the collar, for the same reason the panel spends it on its
   eyes: on the paper ground everything else resolves to black ink, and what
   keeps its colour is what the picture is about.
   ========================================================================== */
window.FACE_GEOM = (function () {
  'use strict';

  /* Same generator shape as the one in substrate.js: seeded, so the portrait
     is identical on every load and can be tuned by reading a screenshot. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---- landmarks --------------------------------------------------------
     One place for every height in the portrait. They are in the subject's
     own units — the panel runs from about y 0.10 to y 1.42 — so the face
     fills the same envelope the collage does, which is the whole point of
     it being INSIDE the collage rather than behind it. */
  var CY   = 1.000;   // eye line, and the centre of the skull
  var RX   = 0.262;   // half-width at the eye line
  var RY   = 0.315;   // half-height of the skull
  var DZ   = 0.250;   // how far the face comes forward of centre

  var HAIRLINE = 1.178, BROW = 1.066;
  var NOSE_BASE = 0.888, MOUTH = 0.806, CHIN = 0.700;
  var JAW_Y = 0.860;
  var EAR_X = 0.252, EAR_Y = 0.985;
  var NECK_TOP = 0.740, NECK_BOT = 0.548, NECK_HW = 0.112;
  var COLLAR_Y = 0.548;

  /* ---- values -----------------------------------------------------------
     Read these as CHALK PRESSURE, not as colour. The ground flip rewrites
     every one of them; what survives both grounds is their order. */
  var C_LINE   = [0.900, 0.892, 0.870];   // the drawing: silhouette, features
  var C_SOFT   = [0.560, 0.556, 0.548];   // secondary contours
  var C_FRAME  = [0.600, 0.598, 0.612];   // glasses — dense, NOT bright
  var C_HAIR   = [0.235, 0.235, 0.252];   // a mass, held DOWN in value
  var C_HAIR_R = [0.520, 0.518, 0.530];   // its silhouette, which is the shape
  var C_BROW   = [0.430, 0.424, 0.424];
  var C_STUB   = [0.300, 0.292, 0.284];
  var C_EYE    = [0.470, 0.290, 0.198];   // COLOUR 1 of 2 — dark brown
  var C_SPARK  = [1.000, 0.986, 0.960];   // the catchlight, a handful of points
  var C_COLLAR = [0.520, 0.168, 0.220];   // COLOUR 2 of 2 — the maroon polo
  var C_SHIRT  = [0.230, 0.082, 0.108];

  /* ======================================================================
     THE SURFACE

     jawX is the half-width of the head at a given height, and it is a
     superellipse rather than an ellipse on purpose: an ellipse's lower half
     runs to a point and gives an egg. The exponent holds the width down
     through the jaw and then lets it go at the chin, which is the difference
     between a head and an oval.
     ====================================================================== */
  function jawX(y) {
    var v = (y - CY) / RY;
    if (v >= 0) return RX * Math.sqrt(Math.max(0, 1 - v * v));
    var a = Math.min(1, -v);
    return RX * Math.pow(Math.max(0, 1 - Math.pow(a, 2.9)), 0.40);
  }

  /* How far forward the surface is at (x, y). Zero at the silhouette, which
     is what makes everything hug the outline instead of crossing it. */
  function surfZ(x, y) {
    var w = jawX(y);
    if (w <= 1e-4) return 0;
    var u = Math.min(1, Math.abs(x) / w);
    var v = (y - CY) / RY;
    var flat = 0.90 - 0.16 * Math.max(0, v);        // the forehead is flatter
    return DZ * Math.sqrt(Math.max(0, 1 - u * u)) * flat
             * Math.sqrt(Math.max(0, 1 - 0.50 * v * v));
  }

  function gauss(x, y, cx, cy, sx, sy) {
    var a = (x - cx) / sx, b = (y - cy) / sy;
    return Math.exp(-(a * a + b * b));
  }

  /* THE TONE FIELD — the whole portrait, really.

     Chalk on black: this returns how much light a point on the face is
     catching, and it is used BOTH as the probability of emitting a point
     there and as that point's value. Everything the eye reads as modelling
     comes out of these fifteen numbers. */
  function tone(x, y) {
    /* A HIGH BASELINE WITH GENTLE MODULATION, not a dim field with bright
       lumps on it. The first version started at 0.30 and added up to 0.40
       in places, which is a contrast ratio no face has: it produced a dark
       head with a glowing forehead and a glowing nose, and a dark head with
       bright bony prominences is a skull. A portrait is mostly one value.
       These deltas are deliberately small — they are the difference between
       modelling and mottling. */
    var t = 0.62;
    t += 0.20 * gauss(x, y, 0.000, 1.082, 0.150, 0.052);   // forehead
    t += 0.13 * gauss(x, y, 0.000, 0.968, 0.028, 0.072);   // bridge of the nose
    t += 0.09 * gauss(x, y, 0.000, 0.905, 0.040, 0.030);   // the tip
    t += 0.10 * gauss(x, y, -0.150, 0.938, 0.068, 0.052);  // cheekbones
    t += 0.10 * gauss(x, y,  0.150, 0.938, 0.068, 0.052);
    t += 0.11 * gauss(x, y, 0.000, 0.742, 0.070, 0.038);   // the chin
    t += 0.07 * gauss(x, y, 0.000, 0.826, 0.058, 0.020);   // the lower lip
    /* NO SOCKETS. Subtracting light around the eyes is what a shaded
       render does, and here it produced two hollows with a bright rim
       round them: goggles, or a skull. The frames already own that region
       and describe it perfectly well; the skin under them just carries on. */
    t -= 0.13 * gauss(x, y, 0.000, 0.868, 0.052, 0.024);   // under the nose
    t -= 0.17 * gauss(x, y, 0.000, 0.776, 0.080, 0.024);   // under the lip
    t -= 0.16 * gauss(x, y, 0.000, 0.712, 0.110, 0.030);   // under the chin
    /* And the sides fall away. Not a shadow — the surface is simply turning
       out of view, and a stipple that stays even to the edge reads as a
       cardboard cut-out. */
    var w = jawX(y);
    var edge = w > 1e-4 ? Math.abs(x) / w : 1;
    t *= 1 - 0.60 * Math.pow(edge, 1.9);
    return Math.max(0.02, Math.min(1, t));
  }

  /* ======================================================================
     A PHOTOGRAPH, WHEN THERE IS ONE -- and there should be.

     Everything below this function is a STAND-IN. It draws a face; it does
     not draw a particular one, and five rounds of tuning said clearly that
     it never will. What distinguishes one persons face from another is the
     specific, irregular distribution of light across it, and that is
     exactly the thing a sum of gaussians cannot invent. It has to be
     measured off a photograph.

     So: drop a frontal photo at assets/ref/face.jpg (or .png) and this
     takes over. Nothing else changes -- same buffers, same reveal, same
     settle, same everything downstream.

     WHY THIS SAMPLES AT RUNTIME RATHER THAN BAKING AN ASSET
     The first version was a Python tool that quantised the cloud into
     base64 and shipped it as JS, following tools/mesh-to-points.py. It
     worked and it was the wrong shape: 60,000 points came to 781 KB, so
     the real thing would have been about a megabyte and a half of
     generated source. The photograph it was made from is eighty kilobytes.
     Shipping the input and doing twenty milliseconds of arithmetic on the
     client is smaller, has no build step, and makes changing the portrait
     a matter of changing a file.

     DENSITY FOLLOWS LIGHT, which is the rule the stand-in follows and the
     rule a chalk drawing on black paper follows. Points are
     rejection-sampled against the photographs own luminance, so the lit
     planes come out dense and the shadows come out bare, and every
     irregularity of the real light survives into the cloud. That is where
     the likeness actually is.

     WHY THE DEPTH IS INVENTED AND WHY THAT IS FINE
     A photograph has no z, and a flat sheet of points is visibly a poster
     hanging inside the subject the moment the page rotates. Each point is
     pushed out along a rounded shell fitted to the silhouette at its own
     row -- wide at the cheeks, narrow at the neck, flatter across the
     shoulders. It is not the sitters real depth. It only has to be a solid
     rather than a plane, because the tone is carrying the identity.
     ====================================================================== */
  /* ONE PATH, NOT A LIST OF CANDIDATES. Trying four extensions meant four
     404s in the console of every machine that has not added a photo yet,
     which is noise that trains you to ignore the console. One probe, one
     line, and the README says to name the file face.jpg whatever it is. */
  var PHOTO = 'assets/ref/face.jpg';

  /* The subjects own box, from js/substrate.js: the collage runs from about
     y 0.10 at the foot of the panel to the tip of the hat. The portrait
     fills the same envelope, which is what makes it read as being INSIDE. */
  var Y_LO = 0.10, Y_HI = 1.36, DEPTH = 0.26;

  /* AND THEN 30% SMALLER THAN THAT.

     Fitting the photograph to the full envelope is the right STARTING point
     — the portrait has to occupy the same region as the collage or it reads
     as something behind the subject rather than inside it — but filling the
     envelope exactly leaves the face pressed against the edges of the hole
     the pointer opens, so you never see it whole.

     Scaled about y = 0.72, which is where js/substrate.js centres the model,
     so it shrinks toward the middle rather than hanging from the top. Applied
     to all three axes including the invented depth, or the head keeps its
     original thickness and comes out as a slab. */
  var FIT = 0.70, MID_Y = 0.72;

  function sampleImage(img, N, opt) {
    var H = Math.min(900, img.naturalHeight);
    var W = Math.max(1, Math.round(img.naturalWidth * (H / img.naturalHeight)));
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    var D = ctx.getImageData(0, 0, W, H).data;

    /* THE BACKGROUND IS WHATEVER THE CORNERS ARE. A studio backdrop is one
       flat value, so a colour-distance test against the average of the four
       corners is enough, and it is far less to go wrong than a flood fill,
       let alone segmentation. A photo with a busy background will keep most
       of it; crop it first. */
    var bg = [0, 0, 0], cor = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
    cor.forEach(function (c) {
      var o = (c[1] * W + c[0]) * 4;
      bg[0] += D[o] / 4; bg[1] += D[o + 1] / 4; bg[2] += D[o + 2] / 4;
    });
    var TOL = (opt && opt.tol) || 46, TOL2 = TOL * TOL;

    function isBg(o) {
      var dr = D[o] - bg[0], dg = D[o + 1] - bg[1], db = D[o + 2] - bg[2];
      return dr * dr + dg * dg + db * db < TOL2;
    }

    // the silhouette, row by row: the shell the invented depth is fitted to
    var lo = new Int32Array(H), hi = new Int32Array(H), top = -1, bot = -1;
    var lmin = 255, lmax = 0;
    for (var y = 0; y < H; y++) {
      lo[y] = -1; hi[y] = -1;
      for (var x = 0; x < W; x++) {
        var o = (y * W + x) * 4;
        if (isBg(o)) continue;
        if (lo[y] < 0) lo[y] = x;
        hi[y] = x;
        var L = 0.299 * D[o] + 0.587 * D[o + 1] + 0.114 * D[o + 2];
        if (L < lmin) lmin = L;
        if (L > lmax) lmax = L;
      }
      if (lo[y] >= 0) { if (top < 0) top = y; bot = y; }
    }
    if (top < 0 || bot - top < 40) return null;       // all background
    var lspan = Math.max(1, lmax - lmin);
    var subjH = bot - top + 1;
    var unit = (Y_HI - Y_LO) / subjH;

    var cxSum = 0, cxN = 0;
    for (var y2 = top; y2 <= bot; y2++) {
      if (lo[y2] >= 0) { cxSum += (lo[y2] + hi[y2]) * 0.5; cxN++; }
    }
    var cx = cxSum / Math.max(1, cxN);

    var gamma = (opt && opt.gamma) || 1.35;
    var chroma = (opt && opt.chroma) || 0.30;
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var anc = new Float32Array(N);
    var rr = rng(20260910), got = 0, guard = 0, limit = N * 260;

    while (got < N && guard++ < limit) {
      var px = (rr() * W) | 0, py = top + ((rr() * subjH) | 0);
      if (py > bot || lo[py] < 0) continue;
      var off = (py * W + px) * 4;
      if (isBg(off)) continue;
      var lum = (0.299 * D[off] + 0.587 * D[off + 1] + 0.114 * D[off + 2] - lmin) / lspan;
      if (lum < 0) lum = 0; else if (lum > 1) lum = 1;
      if (rr() > Math.pow(lum, gamma)) continue;

      var half = Math.max(1, (hi[py] - lo[py]) * 0.5);
      var mid = (lo[py] + hi[py]) * 0.5;
      var u = Math.min(1, Math.abs(px - mid) / half);
      /* Rounder through the head, flatter across the shoulders. A bust that
         bulges as much at the shoulders as at the cheeks reads as a barrel. */
      var v = (py - top) / subjH;
      var round = 1 - 0.55 * Math.max(0, (v - 0.55) / 0.45);
      pos[got * 3]     = (px - cx) * unit * FIT;
      pos[got * 3 + 1] = MID_Y + (Y_HI - (py - top) * unit - MID_Y) * FIT;
      pos[got * 3 + 2] = (DEPTH * round * Math.sqrt(1 - u * u) + (rr() - 0.5) * 0.016) * FIT;

      /* Colour is almost all thrown away: the site spends it on two or three
         things per subject. What survives is a fraction of the original
         chroma and only where the original was strongly saturated, which in
         practice means a shirt keeps a trace of being maroon and skin does
         not keep being pink. */
      var R = D[off] / 255, G = D[off + 1] / 255, B = D[off + 2] / 255;
      var mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      var k = chroma * Math.min(1, Math.max(0, (mx - mn - 0.14) / 0.30));
      var val = 0.14 + 0.82 * lum;
      var m = Math.max(1e-4, (R + G + B) / 3);
      col[got * 3]     = Math.min(1, (m * (1 - k) + R * k) / m * val);
      col[got * 3 + 1] = Math.min(1, (m * (1 - k) + G * k) / m * val);
      col[got * 3 + 2] = Math.min(1, (m * (1 - k) + B * k) / m * val);
      got++;
    }
    if (got < N * 0.5) return null;
    /* Short of N: wrap, with a little jitter so the repeats land beside each
       other instead of stacking into brighter single points. */
    for (var f = got; f < N; f++) {
      var sc = f % got;
      pos[f*3]   = pos[sc*3]   + (rr() - 0.5) * 0.006;
      pos[f*3+1] = pos[sc*3+1] + (rr() - 0.5) * 0.006;
      pos[f*3+2] = pos[sc*3+2] + (rr() - 0.5) * 0.010;
      col[f*3] = col[sc*3]; col[f*3+1] = col[sc*3+1]; col[f*3+2] = col[sc*3+2];
    }
    return { pos: pos, col: col, anchor: anc, pool: got, fromPhoto: true };
  }

  /* Asynchronous by nature, and the caller has to cope: js/substrate.js
     builds its buffers at boot with the stand-in and re-uploads if this ever
     arrives. A missing photo is the normal case, not an error. */
  function fromPhoto(N, done, opt) {
    var img = new Image();
    img.onload = function () {
      var g = null;
      try { g = sampleImage(img, N, opt); }
      catch (e) { console.warn('[face] could not sample ' + PHOTO, e); }
      if (g) {
        console.info('[face] photograph:', PHOTO, g.pool, 'points sampled');
        done(g);
      } else {
        console.warn('[face] ' + PHOTO + ' sampled to nothing. Is the '
                   + 'background flat? See assets/ref/README.txt.');
      }
    };
    /* Absent is the expected state, so this says nothing. The browser still
       reports the 404 itself; that line IS the check, not a fault. */
    img.onerror = function () {};
    img.src = PHOTO;
  }

  function build(N) {
    var r = rng(20260910);
    var P = [];                       // flat [x,y,z, r,g,b, anchor]

    function put(x, y, z, c, anc) {
      P.push(x, y, z, c[0], c[1], c[2], anc || 0);
    }

    /* A point-line. `w` is the scatter across the stroke — a line with no
       width reads as an aliased crawl at this point size, and a little
       scatter is what makes it read as drawn rather than as plotted. */
    function curve(fn, n, w, c, anc) {
      for (var i = 0; i < n; i++) {
        var p = fn(i / (n - 1));
        put(p[0] + (r() - 0.5) * w,
            p[1] + (r() - 0.5) * w,
            p[2] + (r() - 0.5) * w * 1.4, c, anc);
      }
    }

    function blob(x, y, z, rad, n, c, anc) {
      for (var i = 0; i < n; i++) {
        var a = r() * Math.PI * 2, u = Math.sqrt(r()) * rad;
        put(x + Math.cos(a) * u, y + Math.sin(a) * u * 0.92,
            z + (r() - 0.5) * rad, c, anc);
      }
    }

    /* ====================================================================
       1 · THE SKIN, AS TONE

       Rejection sampling against tone(): scatter across the head, keep a
       point with the probability the light there says. No structure is
       drawn — the structure is what the density does.
       ==================================================================== */
    var placed = 0, guard = 0;
    while (placed < 31000 && guard++ < 600000) {
      var sx = (r() * 2 - 1) * RX;
      var sy = CHIN + r() * (HAIRLINE + 0.010 - CHIN);
      var w0 = jawX(sy);
      if (Math.abs(sx) > w0) continue;
      var tn = tone(sx, sy);
      if (r() > tn) continue;
      placed++;
      var v0 = 0.34 + 0.46 * tn;
      put(sx, sy, surfZ(sx, sy), [v0, v0 * 0.994, v0 * 0.972]);
    }

    /* ====================================================================
       2 · THE SILHOUETTE

       Drawn brighter and denser than anything inside it. A face in points
       is legible almost entirely from its edge — lose the jaw line and
       nothing else assembles into a head at all.
       ==================================================================== */
    /* ONLY FROM THE CHEEKBONE DOWN. Outlining the whole head produced a
       bright closed oval with a dark mass on top of it, which is a MASK —
       and no amount of interior modelling argues with a shape that strong.
       A face has a real contour along the jaw and essentially none across
       the temple, where the tone simply turns away; so that is what gets
       drawn, and the top of the head is described by the hair instead. */
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var y = 0.972 - t * (0.972 - CHIN);
        var fade = Math.min(1, t * 3.2);
        return [side * jawX(y), y, surfZ(side * jawX(y) * 0.90, y) * 0.30 * fade];
      }, 2300, 0.0072, C_SOFT);
    });
    curve(function (t) {                                  // the chin, closing it
      var x = (t - 0.5) * 0.150;
      return [x, CHIN + Math.pow((t - 0.5) * 2, 2) * 0.052, surfZ(x, CHIN + 0.02) + 0.010];
    }, 1100, 0.0075, C_LINE);
    // the jaw's own angle, where the outline changes its mind
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var y = JAW_Y - t * (JAW_Y - CHIN - 0.012);
        var x = side * jawX(y) * (0.99 - t * 0.10);
        return [x, y, surfZ(x, y) * 0.55];
      }, 900, 0.008, C_SOFT);
    });

    /* ====================================================================
       3 · THE GLASSES — the single strongest thing about this face.

       A superellipse, not a rounded rect built from arcs: one expression,
       and the exponent is a direct dial on how squared the frame is. 3.6 is
       the reference's shape — clearly rectangular, corners clearly softened.

       They are the brightest and the densest element in the file, and they
       sit proud of the face by 0.045 so the scroll rotation separates them
       from it. A frame flush to the skin reads as a painted-on mask.
       ==================================================================== */
    var LENS_HW = 0.101, LENS_HH = 0.079, LENS_Y = 1.004, LENS_X = 0.116;
    var SQ = 3.6;

    function lens(t, side) {
      var a = t * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      var e = 2 / SQ;
      var x = side * LENS_X + LENS_HW * (cs < 0 ? -1 : 1) * Math.pow(Math.abs(cs), e);
      var y = LENS_Y + LENS_HH * (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), e);
      return [x, y, surfZ(x * 0.72, y) + 0.045];
    }
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 5400; i++) {
        var p = lens(r(), side);
        /* The rim has THICKNESS, and it is not uniform: heavier along the
           top bar, the way an acetate frame actually is, which is most of
           what makes a frame look heavy rather than wiry. */
        var top = Math.max(0, (p[1] - LENS_Y) / LENS_HH);
        var th = 0.0098 + 0.0072 * top;
        var ang = r() * Math.PI * 2, u = Math.sqrt(r()) * th;
        put(p[0] + Math.cos(ang) * u, p[1] + Math.sin(ang) * u,
            p[2] + (r() - 0.5) * 0.016, C_FRAME);
      }
    });
    curve(function (t) {                                   // bridge
      var x = -0.028 + t * 0.056;
      return [x, LENS_Y + 0.042 + Math.sin(t * Math.PI) * 0.012, surfZ(x, LENS_Y) + 0.048];
    }, 1500, 0.011, C_FRAME);
    [-1, 1].forEach(function (side) {                      // temple arms
      curve(function (t) {
        var x = side * (0.212 + t * 0.042);
        var y = LENS_Y + 0.032 + t * 0.006;
        var z = surfZ(side * 0.19, y) + 0.040 - t * t * 0.190;
        return [x, y, z];
      }, 1500, 0.010, C_FRAME);
    });

    /* ====================================================================
       4 · THE EYES

       Behind the lens, and NOT the darkest thing in the region — a dark
       disc surrounded by brighter material is a socket, which is the note
       the wireframe version died on. The iris is a warm mid value, the
       pupil is simply an absence of points, and a catchlight sits on top.
       ==================================================================== */
    [-1, 1].forEach(function (side) {
      var ex = side * 0.114, ey = 1.000, ez = surfZ(ex, ey) + 0.004;
      /* A RING, NOT A DISC, and no darker than the skin it sits in. A
         filled brown circle inside a lighter face is a socket every time —
         the eye is the one feature where drawing MORE makes it read as
         less. The pupil is simply the absence in the middle of this. */
      for (var i = 0; i < 460; i++) {
        var a = r() * Math.PI * 2, u = 0.0120 + Math.sqrt(r()) * 0.0090;
        put(ex + Math.cos(a) * u, ey + Math.sin(a) * u * 0.94,
            ez + (r() - 0.5) * 0.010, C_EYE, 1);
      }
      blob(ex - side * 0.008, ey + 0.009, ez + 0.006, 0.0052, 90, C_SPARK, 1);
      curve(function (t) {                                 // the upper lid
        var x = ex + (t - 0.5) * 0.086;
        return [x, ey + 0.030 - Math.pow(t - 0.5, 2) * 0.10, surfZ(x, ey) + 0.004];
      }, 420, 0.007, C_SOFT);
    });

    // brows: above the frames, thick, with a slight outer fall
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 1900; i++) {
        var t = r();
        var x = side * (0.046 + t * 0.152);
        var y = BROW + 0.014 * Math.sin(t * 2.4) - t * t * 0.030;
        put(x + (r() - 0.5) * 0.012, y + (r() - 0.5) * 0.017,
            surfZ(x, y) + 0.006 + (r() - 0.5) * 0.010, C_BROW);
      }
    });

    /* ====================================================================
       5 · NOSE AND MOUTH

       The nose is its two side ridges and the shadow under the tip — never
       a centre line, which reads as a crease down the face rather than as
       a nose.
       ==================================================================== */
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var y = BROW - 0.012 - t * (BROW - NOSE_BASE - 0.008);
        var x = side * (0.018 + Math.pow(t, 1.9) * 0.032);
        return [x, y, surfZ(x, y) + 0.014 + Math.pow(t, 2.1) * 0.054];
      }, 1000, 0.008, C_SOFT);
      curve(function (t) {                                 // the wing
        var a = t * Math.PI * 0.9 - 0.35;
        var x = side * (0.031 + Math.sin(a) * 0.027);
        var y = NOSE_BASE + 0.022 - Math.cos(a) * 0.027;
        return [x, y, surfZ(x, y) + 0.042 - t * 0.026];
      }, 620, 0.008, C_LINE);
      blob(side * 0.021, NOSE_BASE - 0.002, surfZ(0.021, NOSE_BASE) + 0.040,
           0.0080, 150, C_STUB);
    });
    curve(function (t) {                                   // under the tip
      var x = (t - 0.5) * 0.072;
      return [x, NOSE_BASE + 0.006 - Math.pow(t - 0.5, 2) * 0.16,
              surfZ(x, NOSE_BASE) + 0.064 - Math.pow(t - 0.5, 2) * 0.10];
    }, 520, 0.008, C_SOFT);

    curve(function (t) {                                   // the mouth's seam
      var x = (t - 0.5) * 0.168;
      var y = MOUTH + Math.pow(t - 0.5, 2) * 0.072 - 0.008;
      return [x, y, surfZ(x, y) + 0.026];
    }, 1500, 0.0085, C_SOFT);
    curve(function (t) {                                   // under the lower lip
      var x = (t - 0.5) * 0.126;
      var y = MOUTH - 0.036 + Math.pow(t - 0.5, 2) * 0.052;
      return [x, y, surfZ(x, y) + 0.020];
    }, 900, 0.009, C_SOFT);

    /* ====================================================================
       6 · THE HAIR

       Strands, not a fill: a random fill of the same volume gives a fuzzy
       helmet, because hair is read from FLOW. A few hundred short curves
       following one sweep, wobbled enough not to look combed.

       Held DOWN in value and given a bright rim. That pairing is the whole
       trick — the mass reads as dark because it is dimmer than the face
       beside it, and the SHAPE reads because its outline is the brightest
       line on the head. Making the mass itself dense and bright, which is
       the obvious move, produces a glowing helmet.

       The hairline is a function of azimuth, and that function is most of
       the silhouette: high across the forehead, dropping fast at the
       temples so the sides read short, continuing down the nape.
       ==================================================================== */
    var HRX = 0.280, HRY = 0.330, HRZ = 0.284, HCY = 0.988;

    function hairMin(az) {
      var ca = Math.cos(az);
      return ca > 0 ? 0.12 + 0.50 * Math.pow(ca, 1.25) : 0.12 + 0.62 * ca;
    }
    function hairPt(az, el, swell) {
      var ce = Math.cos(el);
      /* The quiff. Volume at the front and top only, which is where the
         reference carries it — a uniform swell just makes a bigger head. */
      var q = Math.max(0, Math.cos(az)) * Math.max(0, Math.sin(el) - 0.45);
      var k = (swell || 1) * (1 + 0.26 * q);
      return [HRX * Math.sin(az) * ce * k,
              HCY + HRY * Math.sin(el) * k + 0.050 * q,
              HRZ * Math.cos(az) * ce * k];
    }

    for (var s = 0; s < 460; s++) {
      var az0 = (r() * 2 - 1) * Math.PI;
      var el0 = hairMin(az0) + r() * 0.20;
      var len = 0.55 + r() * 0.75;
      var dir = az0 > -0.45 ? 1 : -1;          // one part, off centre
      var wob = (r() - 0.5) * 0.9;
      var swell = 0.985 + r() * 0.045;
      var n = 30 + (r() * 20 | 0);
      for (var i2 = 0; i2 < n; i2++) {
        var t2 = i2 / (n - 1);
        var az = az0 + dir * t2 * len * 0.85 + Math.sin(t2 * 3.1 + wob) * 0.10;
        var el = el0 + t2 * len * 0.62 + Math.sin(t2 * 4.7 + wob) * 0.05;
        if (el > 1.52) el = 1.52 - (el - 1.52) * 0.5;
        var p2 = hairPt(az, el, swell);
        put(p2[0] + (r() - 0.5) * 0.006, p2[1] + (r() - 0.5) * 0.006,
            p2[2] + (r() - 0.5) * 0.008, C_HAIR);
      }
    }
    // THE RIM — the front-view outline of the mass, from temple to crown
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var el = 0.12 + t * (Math.PI / 2 - 0.12);
        var p = hairPt(side * Math.PI / 2, el, 1);
        return [p[0], p[1], 0];
      }, 1700, 0.0075, C_HAIR_R);
    });
    // and the hairline itself, which is a shape a person owns
    curve(function (t) {
      var az = (t * 2 - 1) * 1.25;
      var p = hairPt(az, hairMin(az), 0.985);
      return p;
    }, 1900, 0.009, C_HAIR_R);

    /* ====================================================================
       7 · STUBBLE — and this is not a detail, it is identity.

       A jaw scattered with short marks reads as a specific person's jaw at
       a distance where no amount of contour modelling would. Confined to
       where it actually grows: the jawline, the chin, above the lip, and
       thinning out up the cheek.
       ==================================================================== */
    for (var st = 0; st < 5400; st++) {
      var bx = (r() * 2 - 1) * 0.225;
      var by = CHIN + r() * (JAW_Y + 0.050 - CHIN);
      var bw = jawX(by);
      if (Math.abs(bx) > bw * 0.94) continue;
      var up = (by - CHIN) / (JAW_Y + 0.050 - CHIN);
      var ed = Math.abs(bx) / Math.max(1e-4, bw);
      var keep = (1 - up * 0.55) * (0.45 + 0.75 * ed);
      if (by > MOUTH - 0.012 && by < MOUTH + 0.060 && Math.abs(bx) < 0.088) keep = 0.80;
      if (by > MOUTH - 0.030 && by < MOUTH + 0.012 && Math.abs(bx) < 0.086) keep = 0;
      if (r() > keep) continue;
      put(bx, by, surfZ(bx, by) + 0.006, C_STUB);
    }

    /* ====================================================================
       8 · EARS, NECK, COLLAR, SHOULDERS
       ==================================================================== */
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var a = -Math.PI * 0.62 + t * Math.PI * 1.30;
        return [side * (EAR_X + Math.cos(a) * 0.028), EAR_Y + Math.sin(a) * 0.054,
                -0.034 + Math.cos(a) * 0.020];
      }, 700, 0.009, C_SOFT);
    });

    /* THE NECK IS A CONNECTION, not a cylinder. Two bright edges and almost
       nothing between them: filled, it competes with the jaw for attention
       and the head starts to look mounted on a post. */
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var y = NECK_TOP - t * (NECK_TOP - NECK_BOT);
        var hw = NECK_HW * (0.88 + t * 0.30);
        return [side * hw, y, 0.030];
      }, 1500, 0.010, C_LINE);
    });
    for (var nk = 0; nk < 2400; nk++) {
      var t3 = r();
      var ny2 = NECK_TOP - t3 * (NECK_TOP - NECK_BOT);
      var hw2 = NECK_HW * (0.88 + t3 * 0.30);
      var an2 = (r() * 2 - 1) * 1.05;
      /* Dimmer at the top: the jaw's shadow falls here, and leaving it out
         is what keeps the head sitting ON the neck rather than beside it. */
      var v2 = 0.22 + 0.30 * t3;
      put(Math.sin(an2) * hw2, ny2, Math.cos(an2) * hw2 * 0.80 - 0.02,
          [v2, v2 * 0.99, v2 * 0.98]);
    }

    /* THE COLLAR is the second and last place colour is spent. It is also
       what says this is a person rather than a bust: a bust has no shirt. */
    [-1, 1].forEach(function (side) {
      curve(function (t) {                                 // the lapel's fold
        var x = side * (0.050 + t * 0.156);
        var y = COLLAR_Y + 0.070 - t * 0.096;
        return [x, y, 0.112 - t * 0.058];
      }, 2200, 0.013, C_COLLAR);
      curve(function (t) {                                 // its outer edge
        var x = side * (0.056 + t * 0.176);
        var y = COLLAR_Y + 0.104 - t * 0.074;
        return [x, y, 0.090 - t * 0.050];
      }, 1300, 0.011, C_COLLAR);
    });
    curve(function (t) {                                   // the placket
      return [(r() - 0.5) * 0.028, COLLAR_Y + 0.056 - t * 0.150, 0.116 - t * 0.010];
    }, 1200, 0.012, C_COLLAR);
    blob(0, COLLAR_Y - 0.006, 0.126, 0.0085, 120, C_LINE);
    blob(0, COLLAR_Y - 0.078, 0.124, 0.0085, 120, C_LINE);

    /* THE SHOULDERS — a contour and very little else.

       Filled, they were a maroon slab that weighed more than the head. What
       a bust needs from them is a LINE that says where the body stops, and
       just enough material below it that the line is not floating. */
    [-1, 1].forEach(function (side) {
      curve(function (t) {
        var x = side * (0.088 + t * 0.360);
        var y = COLLAR_Y - 0.052 - Math.pow(t, 1.55) * 0.190;
        return [x, y, 0.070 - t * 0.040];
      }, 2400, 0.013, C_COLLAR);
    });
    for (var sh = 0; sh < 2600; sh++) {
      var u3 = r() * 2 - 1;
      var sxx = u3 * 0.395;
      var top = COLLAR_Y - 0.052 - Math.pow(Math.abs(u3) * 1.24, 1.55) * 0.190;
      if (top <= 0.105) continue;
      var syy = 0.100 + r() * (top - 0.100);
      var an3 = (r() * 2 - 1) * 1.25;
      put(sxx, syy, Math.cos(an3) * 0.150 * (1 - Math.abs(u3) * 0.45), C_SHIRT);
    }

    /* ---- resample to exactly N ----------------------------------------
       Same contract as makeSubject() in js/substrate.js: the emitters above
       are areal and add up to whatever they add up to, and the renderer
       needs precisely N. Tuning one element's count therefore changes its
       SHARE of the portrait, not the size of the buffer. */
    var have = (P.length / 7) | 0;
    var pos = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    var anc = new Float32Array(N);
    var pick = rng(90210);
    for (var i3 = 0; i3 < N; i3++) {
      var k3 = (pick() * have) | 0;
      pos[i3*3] = P[k3*7];     pos[i3*3+1] = P[k3*7+1]; pos[i3*3+2] = P[k3*7+2];
      col[i3*3] = P[k3*7+3];   col[i3*3+1] = P[k3*7+4]; col[i3*3+2] = P[k3*7+5];
      anc[i3] = P[k3*7+6];
    }
    return { pos: pos, col: col, anchor: anc, pool: have };
  };
  build.fromPhoto = fromPhoto;
  return build;
})();
