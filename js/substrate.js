/* ==========================================================================
   substrate.js — the subject. One point cloud, five phases, two layers.

   WHY RAW WebGL AND NOT THREE.JS
   This is one static attribute set, one program, no scene graph, no lights,
   no materials and no loader. three.js is ~150KB gzipped to draw a couple of
   gl.POINTS calls, and it would be the only third-party dependency on the
   page. The whole renderer is below and has none, which also means the site
   still comes up when a CDN does not.

   WHY THE IDENTITY SURVIVES THE TRANSFORMATION
   There is exactly ONE set of points. Every phase is a different set of
   TARGET POSITIONS for those same points, held in buffers that all live on
   the GPU at once. Changing phase rebinds two attribute pointers; it never
   uploads, never reallocates and never creates a second cloud. So when the
   slab becomes a swarm, those are literally the slab's own points.

   THE TWO LAYERS, AND WHAT THE POINTER DOES
   The shell is what you see. Inside it is the FLUID — a contracted, swirling
   core that is drawn by the same program and is INVISIBLE until the pointer
   opens a hole in the shell over it.

   This is a reveal, not a displacement. An earlier build pushed the points
   away from the cursor, which dented the cloud but never showed anything;
   the interesting behaviour is that the material is opaque until you look
   INTO it. So:

     shell   alpha is multiplied by (1 - reveal) — the hole EATS it
     fluid   alpha is multiplied by (reveal)     — the hole is the only thing
                                                   that shows it

   One reveal value, two opposite signs, and the layers swap through each
   other with no second pass over the geometry and no render target.

   THE HOLE IS MEASURED IN SCREEN SPACE, not on the surface of the model.
   That is deliberate and it is what the reference does: the opening stays
   where you put it on the glass while the mass keeps turning underneath it.

   THE PHASES ARE MODES OF WORKING, NOT TECHNOLOGIES
     0 BUILD        making something hold       ordered, dense, still
     1 BACKEND      taking it apart to see why  sliced into plates, offset
     2 SYSTEMS      how the thinking goes       an excavated colony
     3 AUTOMATION   work that runs without me   a network of linked bodies
     4 EXPERIMENTS  curious, unfinished         wide, soft, low density

     The names are deliberately the site's OWN vocabulary rather than states
     of matter: every one of them is lifted from a line of copy somewhere on
     the page. SOLID/SECTION/MESH/SWARM/DIFFUSE described the geometry
     accurately and said nothing whatever about the person.
   ========================================================================== */
(function () {
  'use strict';

  /* A COLLAGE NEEDS COVERAGE A SILHOUETTE DID NOT. 40k was ample for a
     shape read by its outline; flat colour fields read by their FILL, and
     at 40k they came out as haze. Still two draw calls. */
  var N = 110000;
  var PHASES = ['BUILD', 'BACKEND', 'SYSTEMS', 'AUTOMATION', 'EXPERIMENTS'];
  /* How much each phase wanders on its own. SOLID is nearly still and
     DIFFUSE never settles — the drift IS the characterisation. */
  var ENERGY = [0.06, 0.14, 0.30, 0.62, 1.00];

  var REV = 12;             // reveal points: one live, eleven trailing

  /* ---- deterministic noise ------------------------------------------------
     Seeded so the cloud is the same picture on every load. An unseeded
     Math.random() here means the composition is different every visit, which
     makes it impossible to art-direct. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---- the five target sets ----------------------------------------------
     All five are written into the SAME bounding volume — y in 0..1, x/z
     within about +-0.45 — so the subject stays the same size and in the same
     place through every transition. A phase that changed scale as well as
     shape would read as a cut to a different object. */

  /* ---- THE SUBJECT: an instrument that happens to be a face ------------
     A flat collage — colour fields, a slot for one eye, a dial for the
     other, a plumb line for a nose, a barcode for a mouth — wearing a
     wizard hat.

     WHY A RELIEF AND NOT A SOLID FORM
     Four earlier attempts built a head and every one read as a mascot. A
     realistic face failed for a harder reason: faces are read from
     occlusion and soft shading, and a point cloud carries neither, so it
     rendered as a smooth egg three times running. A CONSTRUCTED face is
     read from flat planes, hard edges, circles and bars — all of which a
     point cloud renders perfectly. The medium stopped fighting the subject.

     Everything below is a plane at its own depth, stacked like collage. The
     scroll rotation reveals the layering, so it is genuinely dimensional
     without ever being a solid head.

     THE TENSION IS THE POINT. The panel is deadpan instrument; the hat is
     absurd. Neither acknowledges the other, which is the whole joke.
     ====================================================================== */

  /* Palette. Mid-tone on purpose: these have to read on the dark ground AND
     on the light one after the tear, which pure white and pure black cannot
     both do. */
  var PAL = {
    rust:  [0.753, 0.337, 0.227], burnt: [0.690, 0.290, 0.180],
    orange:[0.851, 0.467, 0.259], ochre: [0.788, 0.592, 0.247],
    gold:  [0.851, 0.643, 0.255], cream: [0.910, 0.863, 0.784],
    bone:  [0.816, 0.761, 0.675], teal:  [0.290, 0.420, 0.471],
    slate: [0.361, 0.490, 0.541], deep:  [0.200, 0.282, 0.310],
    char:  [0.133, 0.133, 0.141], iris:  [0.180, 0.498, 0.722],
    iris2: [0.239, 0.608, 0.831], lip:   [0.659, 0.200, 0.169],
    ink:   [0.960, 0.950, 0.930], void_: [0.039, 0.043, 0.055]
  };
  /* The hat's cobalt ramp, dark crease to blown highlight. */
  var BLU = [[0.024,0.125,0.408],[0.055,0.247,0.659],[0.082,0.392,0.847],
             [0.180,0.525,0.941],[0.549,0.784,1.000]];

  function blue(sh) {
    sh = Math.max(0, Math.min(0.9999, sh));
    var f = sh * (BLU.length - 1), i = Math.floor(f), t = f - i;
    var a = BLU[i], b = BLU[Math.min(BLU.length - 1, i + 1)];
    return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
  }

  /* ---- the emitters -----------------------------------------------------
     Each pushes a flat plane of points. Counts are areal, so an element's
     density does not change when it is resized — the thing that made the
     first still render at 4% coverage and look like a haze. */
  function Relief(seed) {
    this.P = [];            // flat [x,y,z, r,g,b, anchor, layer] tuples
    this.r = rng(seed);
    this.K = 1.0;           // one global density dial
    /* A LAYER INDEX, counted as elements are emitted.

       SECTION needs to pull the collage apart, and the obvious handle —
       each element's z — is useless for it: consecutive fields sit 0.0018
       apart, so amplifying that spread by even ten gives a two-hundredth
       of a unit and the exploded view looks identical to the assembled
       one. An ordinal is what an exploded view actually wants. */
    this.L = 0;
  }
  Relief.prototype.put = function (x, y, z, c, a) {
    this.P.push(x, y, z, c[0], c[1], c[2], a || 0, this.L);
  };
  Relief.prototype.rect = function (x0, y0, x1, y1, z, c, d, erode, anc) {
    this.L++;
    var r = this.r, n = Math.max(30, (x1-x0) * (y1-y0) * d * this.K | 0);
    for (var i = 0; i < n; i++) {
      var u = r(), v = r();
      if (erode && (u < erode || u > 1-erode || v < erode || v > 1-erode) && r() < 0.55) continue;
      this.put(x0 + u*(x1-x0), y0 + v*(y1-y0), z, c, anc);
    }
  };
  Relief.prototype.disc = function (cx, cy, rx, ry, z, c, d, anc) {
    this.L++;
    var r = this.r, n = Math.max(30, Math.PI * rx * ry * d * this.K | 0);
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, u = Math.sqrt(r());
      this.put(cx + Math.cos(a)*rx*u, cy + Math.sin(a)*ry*u, z, c, anc);
    }
  };
  Relief.prototype.ring = function (cx, cy, r0, r1, z, c, d, anc) {
    this.L++;
    var r = this.r, n = Math.max(30, Math.PI * (r1*r1 - r0*r0) * d * this.K | 0);
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, u = Math.sqrt(r0*r0 + r()*(r1*r1 - r0*r0));
      this.put(cx + Math.cos(a)*u, cy + Math.sin(a)*u, z, c, anc);
    }
  };
  Relief.prototype.bar = function (x0, y0, x1, y1, w, z, c, d, anc) {
    this.L++;
    var r = this.r, L = Math.hypot(x1-x0, y1-y0) || 1e-6;
    var dx = (x1-x0)/L, dy = (y1-y0)/L;
    var n = Math.max(24, L * w * d * this.K | 0);
    for (var i = 0; i < n; i++) {
      var t = r()*L, s = (r()-0.5)*w;
      this.put(x0 + dx*t - dy*s, y0 + dy*t + dx*s, z, c, anc);
    }
  };
  Relief.prototype.tri = function (ax, ay, bx, by, cx2, cy2, z, c, d) {
    this.L++;
    var r = this.r;
    var area = Math.abs((bx-ax)*(cy2-ay) - (cx2-ax)*(by-ay)) / 2;
    var n = Math.max(24, area * d * this.K | 0);
    for (var i = 0; i < n; i++) {
      var u = r(), v = r();
      if (u + v > 1) { u = 1-u; v = 1-v; }
      var w = 1-u-v;
      this.put(ax*w + bx*u + cx2*v, ay*w + by*u + cy2*v, z, c, 0);
    }
  };

  /* ---- the panel --------------------------------------------------------
     A face only in the sense that a control surface is a face: a slot where
     an eye goes, a dial where the other one does, a plumb line for a nose,
     a barcode for a mouth. Nothing is drawn as a feature; everything is
     drawn as an instrument, and the face is what you assemble from it. */
  function buildPanel(b) {
    /* AREAL DENSITY, AND IT HAS TO OUT-WEIGH THE HAT. The final cloud is
       resampled from whatever the emitters produce, so relative pool sizes
       decide who gets points: at 34000 the hat's 87k swamped the panel's
       35k and took two thirds of the budget. The panel is the character. */
    var D = 118000;
    b.rect(-0.335, 0.115, 0.335, 0.885, -0.030, PAL.char, D*0.5);
    var F = [
      [-0.335, 0.72, -0.06, 0.885, PAL.deep], [-0.06, 0.75, 0.16, 0.885, PAL.rust],
      [0.16, 0.70, 0.335, 0.885, PAL.slate],  [-0.335, 0.50, -0.16, 0.72, PAL.teal],
      [0.20, 0.44, 0.335, 0.70, PAL.ochre],   [-0.335, 0.26, -0.13, 0.50, PAL.bone],
      [-0.13, 0.115, 0.10, 0.30, PAL.burnt],  [0.10, 0.115, 0.335, 0.26, PAL.deep]
    ];
    for (var i = 0; i < F.length; i++) {
      b.rect(F[i][0], F[i][1], F[i][2], F[i][3], -0.020 + i*0.0018, F[i][4], D*0.86, 0.04);
    }
    // the horizon rule
    b.bar(-0.335, 0.436, 0.335, 0.436, 0.010, 0.010, PAL.cream, D*1.3);

    /* THE EYE, as a slot. Anchored: this and the dial are what hold their
       shape while the rest of the collage comes apart. */
    b.rect(-0.262, 0.568, -0.020, 0.612, 0.016, PAL.void_, D*1.3, 0, 0);
    b.disc(-0.150, 0.590, 0.034, 0.034, 0.020, PAL.iris2, D*1.4, 1);
    b.disc(-0.150, 0.590, 0.013, 0.013, 0.024, PAL.void_, D*1.5, 1);
    b.disc(-0.159, 0.598, 0.005, 0.005, 0.027, PAL.ink, D*1.7, 1);
    b.bar(-0.262, 0.626, -0.020, 0.626, 0.006, 0.020, PAL.cream, D*1.3);

    // THE DIAL, the other eye
    b.ring(0.170, 0.588, 0.062, 0.100, 0.016, PAL.cream, D*1.0, 1);
    b.ring(0.170, 0.588, 0.030, 0.052, 0.019, PAL.rust, D*1.1, 1);
    b.disc(0.170, 0.588, 0.026, 0.026, 0.022, PAL.void_, D*1.2, 1);
    for (var k = 0; k < 12; k++) {
      var a = k * Math.PI * 2 / 12;
      b.bar(0.170 + Math.cos(a)*0.102, 0.588 + Math.sin(a)*0.102,
            0.170 + Math.cos(a)*0.122, 0.588 + Math.sin(a)*0.122, 0.005, 0.020,
            PAL.cream, D*1.3);
    }
    // the nose, as a plumb line
    b.bar(0.006, 0.700, 0.006, 0.300, 0.008, 0.030, PAL.cream, D*1.4);
    b.tri(-0.030, 0.312, 0.042, 0.312, 0.006, 0.268, 0.028, PAL.bone, D*1.1);
    // the mouth, as a barcode
    for (var m = 0; m < 11; m++) {
      var w = 0.006 + (m % 3)*0.004;
      b.rect(-0.072 + m*0.014, 0.196, -0.072 + m*0.014 + w, 0.226, 0.026, PAL.lip, D*1.3);
    }
  }

  /* ---- the hat ----------------------------------------------------------
     Three things carry it, and none of them is the cone:

       THE KINK      a straight cone is a party hat. The axis runs up, breaks
                     hard at about three quarters, and the tip falls away.
       THE CREASES   the radius is modulated by lobes whose phase DRIFTS with
                     height, so the folds spiral instead of running as
                     stripes. Amplitude is held all the way to the hem —
                     creases that fade out read instantly as plastic.
       THE BRIM      not a disc. It undulates around its circumference AND
                     droops toward its edge, so the rim is a wave in
                     perspective.

     Shaded at build time: every point picks off the cobalt ramp by how far
     its own fold faces the light, which is where the satin comes from. */
  function buildHat(b, baseY, S) {
    var r = b.r, LX = -0.52, LY = 0.62, LZ = 0.59;

    function axis(t, out) {
      if (t < 0.70) {
        var u = t/0.70;
        out[0] = S*0.055*Math.pow(u,1.7);
        out[1] = baseY + S*u*0.545;
        out[2] = -S*0.030*Math.pow(u,1.6);
      } else {
        var v = (t-0.70)/0.30;
        out[0] = S*(0.055 - 0.345*Math.pow(v,0.85));
        out[1] = baseY + S*(0.545 + 0.150*v - 0.115*Math.pow(v,2.4));
        out[2] = S*(-0.030 - 0.075*Math.pow(v,1.2));
      }
    }
    var c = [0,0,0];

    for (var i = 0; i < 30000; i++) {
      var t = Math.pow(r(), 0.86), th = r()*Math.PI*2;
      axis(t, c);
      var rad = (0.300*Math.pow(1-t, 0.82) + 0.004) * S;
      var ph = th*6.0 + t*3.4;
      var fold = 1.0 + 0.150*Math.sin(ph) + 0.062*Math.sin(th*11.0 - t*2.4)
                     + 0.030*Math.sin(th*17.0 + t*5.1);
      var rr = rad*fold;
      var st = Math.sin(th), ct = Math.cos(th);
      var dfold = 0.150*6.0*Math.cos(ph) + 0.062*11.0*Math.cos(th*11.0 - t*2.4)*0.5;
      var nx = ct - st*dfold*0.9, nz = st*0.86 + ct*dfold*0.9, ny = 0.42 + 0.55*t;
      var nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      var lam = (nx*LX + ny*LY + nz*LZ)/nl;
      var sh = 0.30 + 0.78*Math.max(0, lam);
      if (lam > 0.72 && r() < 0.5) sh += 0.35;
      b.put(c[0] + ct*rr, c[1] + st*rr*0.34*(1-t)*0.9, c[2] + st*rr*0.86, blue(sh), 0);
    }

    for (var j = 0; j < 24000; j++) {
      var th2 = r()*Math.PI*2, u2 = Math.sqrt(r());
      var rIn = 0.238*S, rOut = 0.560*S;
      var rd = rIn + u2*(rOut - rIn), f = (rd - rIn)/(rOut - rIn);
      var wave = 0.052*Math.sin(th2*2.0 + 0.7) + 0.022*Math.sin(th2*5.0 - 1.1);
      var y = baseY - S*(0.010 + 0.150*Math.pow(f,1.7)) + wave*f*S;
      var slope = -0.150*1.7*Math.pow(f,0.7) + wave;
      var bnx = -Math.cos(th2)*slope*2.2, bnz = -Math.sin(th2)*slope*2.2;
      var bnl = Math.sqrt(bnx*bnx + 1 + bnz*bnz) || 1;
      var blam = (bnx*LX + LY + bnz*LZ)/bnl;
      var bsh = 0.22 + 0.80*Math.max(0, blam);
      if (f > 0.93) bsh += 0.30;
      b.put(Math.cos(th2)*rd, y + 0.012*S*(1-f), Math.sin(th2)*rd*0.92, blue(bsh), 0);
    }
    // the band where the cone meets the brim
    for (var k2 = 0; k2 < 3600; k2++) {
      var th3 = r()*Math.PI*2, rd3 = (0.296 + r()*0.020)*S;
      b.put(Math.cos(th3)*rd3, baseY + S*(0.004 + r()*0.030), Math.sin(th3)*rd3*0.90,
            blue(0.14 + 0.5*Math.max(0, Math.cos(th3 - 0.6))), 0);
    }
  }

  /* ---- assemble, then resample to exactly N ----------------------------
     The emitters are areal, so the total is whatever the geometry adds up
     to. Resampling at the end means an element's density can be tuned
     without every other element shifting to compensate. */
  function makeSubject() {
    var b = new Relief(1337);
    buildPanel(b);
    buildHat(b, 0.930, 0.66);

    var src = b.P, have = (src.length / 8) | 0;
    var pos = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    var anc = new Float32Array(N);
    var lay = new Float32Array(N);
    var pick = rng(4242);
    for (var i = 0; i < N; i++) {
      var s = (pick() * have) | 0;
      pos[i*3] = src[s*8];   pos[i*3+1] = src[s*8+1]; pos[i*3+2] = src[s*8+2];
      col[i*3] = src[s*8+3]; col[i*3+1] = src[s*8+4]; col[i*3+2] = src[s*8+5];
      anc[i] = src[s*8+6];
      lay[i] = src[s*8+7] / Math.max(1, b.L);        // 0..1 across the collage
    }
    return { pos: pos, col: col, anchor: anc, layer: lay };
  }

  /* ---- 1 · SECTION — the collage comes apart in DEPTH -------------------
     This is what a relief wants instead of being sliced: every element
     already has its own z, so multiplying that separation pulls the layers
     off each other and the construction becomes visible. Slicing a flat
     subject horizontally would have said nothing at all. */
  /* THE CUT GEOMETRY, HOISTED. js/annot.js pins a leader line to a
     PARTICULAR slab, so it has to be able to work out where slab k is —
     and a second copy of these four numbers is a second thing to keep in
     step with the first. Read by makeSection below and by sliceCentre(). */
  var SEC = { slices: 14, y0: 0.10, y1: 1.42, spread: 0.58 };

  /* Where the middle of slab k sits, in model space, RIGHT NOW.

     Not a constant: this phase is a morph, so between BUILD and BACKEND the
     slab is still on its way out of the stack. Lerping by the same uMorph
     the shader uses is what keeps a leader line attached to its slab
     through the transition instead of snapping to it at the end. */
  function sliceCentre(k, morph, dx, dz) {
    var span = SEC.y1 - SEC.y0;
    var mid = SEC.y0 + (k + 0.5) / SEC.slices * span;   // where it was
    var f = (k + 0.5) / SEC.slices - 0.5;
    var m = Math.max(0, Math.min(1, morph));
    /* dx/dz place the anchor ON the slab rather than on the axis through
       the middle of it. Two reasons, and the second is the important one:
       a point at x = z = 0 is exactly the centre of rotation, so it does
       not move when the subject turns and the leader stops tracking the
       thing it is supposed to be welded to. It also lands the line on the
       plate's near edge instead of pointing at empty air above its middle. */
    return { x: f * 0.055 * m + (dx || 0),
             y: mid + f * SEC.spread * m,
             z: dz || 0 };
  }

  function makeSection(src, anc, lay) {
    var a = new Float32Array(N * 3), r = rng(4242);
    /* STACKED SLABS — the old dissection, rebuilt for a subject that has no
       depth of its own.

       The reference version sliced a BUST, whose cross-sections are discs,
       so every slab came out as an ellipse with real area. Slicing this
       collage the same way gave thin smears instead, because a flat plane
       cut flat is a line. That is why the first attempt at this failed and
       it is the whole problem to solve.

       THE SLICE'S OWN THICKNESS BECOMES ITS DEPTH. A point's height WITHIN
       its slab is remapped onto z, so material that sat a few millimetres
       above its neighbour is now a few centimetres in front of it. Each cut
       turns into a plate with genuine extent in x and z, which is what
       catches the rotation and reads as a slab rather than a stripe — and
       nothing is invented, it is the same material redistributed. */
    var SLICES = SEC.slices, Y0 = SEC.y0, Y1 = SEC.y1, SPAN = Y1 - Y0;
    /* 0.34 still read as bands: against a panel 0.67 wide that is a 2:1
       plate, and the scroll rotation foreshortens it to almost nothing.
       At 0.56 the slab is nearly square in plan and the far edge separates
       from the near one, which is what makes it a solid rather than a line. */
    var PLATE = 0.56;                 // how much depth a slab is given
    var SPREAD = SEC.spread;          // how far the stack draws apart
    for (var i = 0; i < N; i++) {
      var x = src[i*3], y = src[i*3+1], z = src[i*3+2];
      var t = Math.max(0, Math.min(0.9999, (y - Y0) / SPAN));
      var k = Math.floor(t * SLICES);
      var inSlice = t * SLICES - k;                    // 0..1 up through the cut
      var f = (k + 0.5) / SLICES - 0.5;                // -0.5 .. +0.5

      /* Flattened onto the cut plane, with a little of the original height
         kept so the slab has a face rather than being infinitely thin. */
      var yPlane = Y0 + ((k + 0.5) + (inSlice - 0.5) * 0.22) / SLICES * SPAN;

      a[i*3]   = x + f * 0.055 + (r()-0.5) * 0.005;    // a slight shear
      a[i*3+1] = yPlane + f * SPREAD;
      /* The remap. Centred, so a slab grows forward AND back around the
         collage's own plane instead of drifting off toward the camera. */
      a[i*3+2] = z + (inSlice - 0.5) * PLATE;
    }
    return a;
  }

  /* ---- 2 · MESH — the subject as an ant colony ---------------------------
     Ninety-six nodes joined to their three nearest neighbours, which is what
     this was, produces a LATTICE: every node looks like every other node,
     every edge is the same straight line, and the whole thing reads as
     scaffolding — a diagram of connectivity with nothing living in it.

     A colony is the same idea with the two things a lattice throws away put
     back. First, the network is a TREE, not a mesh: it descends from one
     entrance, branches, and only occasionally loops back on itself, so there
     is a direction of travel through it and a top and a bottom. Second, the
     two kinds of thing in it do not look alike — galleries are thin and
     WANDER, chambers are fat and FLAT, and the contrast between them is what
     makes the eye read excavation rather than geometry.

     The dead ends matter more than they should. A network in which every
     tunnel arrives somewhere is a plan; a network with abandoned spurs in it
     is a thing that was dug.

     Everything is still sited on the collage's own points, so the colony
     occupies the subject's silhouette — this is the same material rearranged,
     not a second object. Full palette, hat included. */
  function makeMesh(src) {
    var a = new Float32Array(N * 3), r = rng(909);

    /* ---- chambers ------------------------------------------------------
       Flattened on purpose: rx is the dial, ry is a third of it and rz about
       three quarters. A spherical chamber reads as a bubble; a flat lens
       reads as a room dug out of something. */
    var CH = 34, ch = [];
    for (var c = 0; c < CH; c++) {
      /* HALVED. At 0.034-0.086 the chambers were the thickest thing on the
         screen and the eye read the phase as a cluster of particles with
         lines between them. They are junctions, not the subject: small
         enough to be where branches meet and no larger. */
      var s = (r() * N) | 0, rx = 0.018 + r() * 0.028;
      ch.push({ x: src[s*3] * 0.94, y: src[s*3+1], z: src[s*3+2] * 0.94,
                rx: rx, ry: rx * (0.30 + r() * 0.20), rz: rx * (0.66 + r() * 0.40) });
    }
    // top-down, so the excavation order is also the order of descent
    ch.sort(function (p, q) { return q.y - p.y; });

    /* ---- galleries -----------------------------------------------------
       A tunnel is a straight run plus two out-of-phase lateral swings and a
       sag. The sag is the one that does the work: a tunnel that bows
       DOWNWARD between its ends reads as having been dug under gravity,
       where a tunnel that bows sideways only reads as a wobbly line. */
    var tun = [];
    function gallery(A, B, rad) {
      var dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      var len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1e-6;
      /* Two unit vectors perpendicular to the run, for the swings and the
         bore to live in. The helper axis is chosen to be the one LEAST
         aligned with the run, or the first cross product collapses to zero
         on tunnels that happen to be vertical — which, in a colony, is most
         of them. */
      var hx = Math.abs(dx) < Math.abs(dy) ? 1 : 0;
      var hy = hx ? 0 : 1, hz = 0;
      if (Math.abs(dz) < Math.abs(hx ? dx : dy)) { hx = 0; hy = 0; hz = 1; }
      var p1x = dy*hz - dz*hy, p1y = dz*hx - dx*hz, p1z = dx*hy - dy*hx;
      var p1l = Math.sqrt(p1x*p1x + p1y*p1y + p1z*p1z) || 1;
      p1x /= p1l; p1y /= p1l; p1z /= p1l;
      var p2x = (dy*p1z - dz*p1y) / len, p2y = (dz*p1x - dx*p1z) / len,
          p2z = (dx*p1y - dy*p1x) / len;
      tun.push({ A: A, B: B, len: len, rad: rad || (0.0030 + r() * 0.0026),
                 p1: [p1x, p1y, p1z], p2: [p2x, p2y, p2z],
                 a1: len * (0.10 + r() * 0.16), a2: len * (0.05 + r() * 0.10),
                 f1: 1, f2: 2 + ((r() * 2) | 0), ph: r() * 6.283,
                 sag: len * (0.06 + r() * 0.12) });
    }

    /* THE ENTRANCE. One shaft from above the subject down into the first
       chamber, and it is the only near-straight run in the colony — which is
       what makes it read as the way in rather than as another gallery. */
    gallery({ x: ch[0].x * 0.5, y: 1.44, z: ch[0].z * 0.5 }, ch[0], 0.010);

    // the tree: each chamber joins the nearest one already dug, so galleries
    // descend and the network has a single root
    for (var i2 = 1; i2 < CH; i2++) {
      var best = 0, bd = 1e9;
      for (var j = 0; j < i2; j++) {
        var ex = ch[i2].x - ch[j].x, ey = ch[i2].y - ch[j].y, ez = ch[i2].z - ch[j].z;
        var d2 = ex*ex + ey*ey + ez*ez;
        if (d2 < bd) { bd = d2; best = j; }
      }
      gallery(ch[best], ch[i2]);
    }
    /* A FEW LOOPS, and only a few. Colonies do connect back on themselves,
       but make it common and the tree collapses into the lattice this
       replaced. Short links only — a long one crosses the whole subject and
       reads as a mistake. */
    for (var x2 = 0; x2 < 85; x2++) {
      var p = 1 + ((r() * (CH - 1)) | 0), q = 1 + ((r() * (CH - 1)) | 0);
      if (p === q) continue;
      var lx = ch[p].x - ch[q].x, ly = ch[p].y - ch[q].y, lz = ch[p].z - ch[q].z;
      if (lx*lx + ly*ly + lz*lz > 0.055) continue;
      gallery(ch[p], ch[q]);
    }
    /* THE DEAD ENDS. Spurs that leave a chamber and stop. There is no
       structural reason for any of them, which is exactly why they are what
       makes the network look excavated rather than designed. */
    for (var d3 = 0; d3 < CH; d3++) {
      if (r() > 0.62) continue;
      var th = r() * Math.PI * 2, L = 0.055 + r() * 0.130;
      gallery(ch[d3], { x: ch[d3].x + Math.cos(th) * L * 0.85,
                        y: ch[d3].y - L * (0.30 + r() * 0.85),
                        z: ch[d3].z + Math.sin(th) * L * 0.85 }, 0.0026);
    }

    /* ---- SECONDARY, TERTIARY, AND THE HAIRS OFF THOSE -------------------
       The tree above connects 34 chambers and stops, which is a diagram of
       connectivity — every line is a trunk and there is nothing between the
       trunks. What makes a network read as a NETWORK is the stuff that
       branches off and goes nowhere in particular.

       So each generation is grown from random points ALONG the previous one
       rather than from its endpoints: branches leave a gallery mid-run, the
       way a real excavation does, and each generation is shorter and
       thinner than its parent by roughly the same ratio. Three generations
       is where it stops paying — the fourth is already below a pixel. */
    function pointOn(t, u) {
      var sw1 = Math.sin(u * Math.PI * t.f1), sw2 = Math.sin(u * Math.PI * t.f2 + t.ph);
      var o1 = t.a1 * sw1, o2 = t.a2 * sw2;
      return {
        x: t.A.x + (t.B.x - t.A.x) * u + t.p1[0]*o1 + t.p2[0]*o2,
        y: t.A.y + (t.B.y - t.A.y) * u + t.p1[1]*o1 + t.p2[1]*o2 - t.sag * sw1,
        z: t.A.z + (t.B.z - t.A.z) * u + t.p1[2]*o1 + t.p2[2]*o2
      };
    }
    function branchOff(from, count, lenK, radK) {
      var made = [];
      for (var b2 = 0; b2 < count; b2++) {
        var t = from[(r() * from.length) | 0];
        if (!t) continue;
        var O = pointOn(t, 0.12 + r() * 0.76);
        /* Irregular on purpose: a branch length uniform in [0.5, 1.5] of its
           nominal is what stops the generations reading as a fractal, which
           is a different and much more artificial thing than a burrow. */
        var L = t.len * lenK * (0.5 + r());
        var th = r() * Math.PI * 2, el = (r() - 0.5) * 1.5;
        var ce = Math.cos(el);
        gallery(O, { x: O.x + Math.cos(th) * ce * L,
                     y: O.y + Math.sin(el) * L * 0.75 - L * 0.12,
                     z: O.z + Math.sin(th) * ce * L }, t.rad * radK);
        made.push(tun[tun.length - 1]);
      }
      return made;
    }
    var gen1 = tun.slice();
    var gen2 = branchOff(gen1, 110, 0.46, 0.66);
    var gen3 = branchOff(gen2, 180, 0.44, 0.66);
    branchOff(gen3, 150, 0.42, 0.70);

    /* ---- fill ----------------------------------------------------------
       Points are handed out in PROPORTION, not per feature: a gallery gets
       points for its length and a chamber for its cross-section, so a long
       tunnel is not as sparse as a short one and a big chamber is not as
       thin as a small one. Sequential rather than sampled per point, because
       at 110,000 points a per-point search of the feature list is the whole
       frame budget. */
    var W = 0, k;
    for (k = 0; k < tun.length; k++) W += tun[k].len * 3.1;
    for (k = 0; k < CH; k++) W += ch[k].rx * ch[k].rz * 420;
    var at = 0;

    function emitTunnel(t, n) {
      for (var q2 = 0; q2 < n && at < N; q2++, at++) {
        var u = r();
        var sw1 = Math.sin(u * Math.PI * t.f1), sw2 = Math.sin(u * Math.PI * t.f2 + t.ph);
        var off1 = t.a1 * sw1, off2 = t.a2 * sw2;
        // a disc of scatter across the bore, so it is a tube and not a wire
        var ang = r() * Math.PI * 2, rad = t.rad * Math.sqrt(r());
        var cA = Math.cos(ang) * rad, sA = Math.sin(ang) * rad;
        a[at*3]   = t.A.x + (t.B.x - t.A.x) * u + t.p1[0]*off1 + t.p2[0]*off2 + t.p1[0]*cA + t.p2[0]*sA;
        a[at*3+1] = t.A.y + (t.B.y - t.A.y) * u + t.p1[1]*off1 + t.p2[1]*off2 + t.p1[1]*cA + t.p2[1]*sA
                    - t.sag * sw1;
        a[at*3+2] = t.A.z + (t.B.z - t.A.z) * u + t.p1[2]*off1 + t.p2[2]*off2 + t.p1[2]*cA + t.p2[2]*sA;
      }
    }
    for (k = 0; k < tun.length; k++) {
      emitTunnel(tun[k], Math.round(N * (tun[k].len * 3.1) / W));
    }
    for (k = 0; k < CH; k++) {
      var K = ch[k], n2 = Math.round(N * (K.rx * K.rz * 420) / W);
      for (var q3 = 0; q3 < n2 && at < N; q3++, at++) {
        var uu = r() * 2 - 1, th2 = r() * Math.PI * 2, sr = Math.sqrt(1 - uu*uu);
        /* Biased outward, so a chamber reads as a cavity with walls rather
           than as a solid lump of material. */
        var g = Math.pow(r(), 0.40);
        a[at*3]   = K.x + sr * Math.cos(th2) * K.rx * g;
        a[at*3+1] = K.y + uu * K.ry * g;
        a[at*3+2] = K.z + sr * Math.sin(th2) * K.rz * g;
      }
    }
    // rounding leaves a handful over; put them back in the galleries
    while (at < N) emitTunnel(tun[(r() * tun.length) | 0], 1);
    return a;
  }

  /* ---- 3 · UNATTENDED — a node-link network ------------------------------
     Solid nodes of varied size, joined by thin straight edges, depth read
     from the existing distance fade.

     WHY THIS IS FREE. A phase is nothing but a second set of target
     positions for the SAME 110,000 points, bound to the same attribute in
     the same two draw calls. Nodes and edges are not new objects and not new
     geometry — they are where those points were told to stand. Whichever
     option wins, the frame cost is identical to every other phase, and to
     what was here before.

     The only real cost is at boot: a k-nearest-neighbour pass over ~120
     nodes, which is 14,000 distance comparisons, once.

     WHY THE EDGES ARE STRAIGHT. Every other structure on this page wanders —
     the galleries sag, the threads hang. This one must not: the reference is
     a DIAGRAM, and what makes a diagram read as a diagram is that its lines
     are the shortest path between two things. Curve them and it becomes a
     nest again. */
  function makeSwarm(src, anc) {
    var a = new Float32Array(N * 3), r = rng(77);
    /* SIXTY-FOUR, NOT A HUNDRED AND TWENTY. The first pass packed 120 nodes
       into a 200px globe and they merged into a fuzzy shell: the reference's
       entire character is the EMPTINESS between its nodes, and at that count
       there is none. Halving them and widening the sphere is what buys the
       gaps back. */
    var NODES = 64, nd = [], i, j;
    var CY = 0.72;

    /* Sizes spread hard, because the reference's do: a handful of heavy
       nodes, a lot of small ones. Uniform sizes read as a lattice. */
    function sizeOf() { return 0.0105 + Math.pow(r(), 2.2) * 0.0210; }

    /* A · THE GLOBE. A Fibonacci sphere — the only way to scatter points
       evenly on a sphere without them banding at the poles, which is what
       a naive lat/long loop does. This is the reference drawn literally,
       and it is the one option that does NOT keep the wizard's outline. */
    var GOLD = Math.PI * (3 - Math.sqrt(5));
    /* NOT A SPHERE. A true sphere reads as a manufactured object — the
       moment the silhouette is a perfect circle the eye stops looking for
       structure and sees a ball. Three low-frequency waves over the
       surface push the radius around by up to a fifth, which is enough to
       make the outline wander without ever losing the globe. */
    function lump(dx, dy, dz) {
      var az = Math.atan2(dz, dx), el = Math.asin(Math.max(-1, Math.min(1, dy)));
      return 1 + 0.13 * Math.sin(2.3 * az + 1.7) * Math.cos(1.9 * el + 0.4)
               + 0.07 * Math.sin(3.7 * az + 2.9)
               + 0.05 * Math.cos(3.1 * el + 1.1);
    }
    for (i = 0; i < NODES; i++) {
      var y0 = 1 - (i / (NODES - 1)) * 2, rr = Math.sqrt(Math.max(0, 1 - y0*y0));
      var th = GOLD * i;
      var ux = Math.cos(th) * rr, uz = Math.sin(th) * rr;
      var R = 0.60 * lump(ux, y0, uz) * (0.95 + r() * 0.10);
      nd.push({ x: ux * R, y: CY + y0 * R * 1.02, z: uz * R, rad: sizeOf() });
    }
    /* ---- edges: k nearest, deduplicated, with a span cap ----------------
       Three or four each is what produces the triangulated look; two gives
       a chain and six gives a solid ball of ink. The cap stops a node on the
       far side reaching across the middle, which is the single thing that
       most spoils the read. */
    var edge = [], seen = {}, CAP = 0.62;
    for (i = 0; i < nd.length; i++) {
      var d = [];
      for (j = 0; j < nd.length; j++) {
        if (j === i) continue;
        var ex = nd[i].x - nd[j].x, ey = nd[i].y - nd[j].y, ez = nd[i].z - nd[j].z;
        d.push([ex*ex + ey*ey + ez*ez, j]);
      }
      d.sort(function (p, q) { return p[0] - q[0]; });
      var deg = 3 + ((r() * 2) | 0);
      for (var m = 0; m < deg && m < d.length; m++) {
        /* MOSTLY THE NEAREST, SOMETIMES NOT. Pure k-nearest gives struts of
           almost identical length and the network comes out evenly meshed,
           which is the tell of a generated lattice. One link in five reaches
           past its close neighbours to something further out, so short
           struts and long chords coexist the way they do in the reference. */
        var pickI = m;
        if (r() < 0.20) pickI = m + 2 + ((r() * 5) | 0);
        if (pickI >= d.length) pickI = d.length - 1;
        var L = Math.sqrt(d[pickI][0]);
        if (L > CAP) continue;
        var k2 = d[pickI][1], key = (i < k2 ? i + ':' + k2 : k2 + ':' + i);
        if (seen[key]) continue;
        seen[key] = 1;
        edge.push({ i: i, j: k2, len: L });
      }
    }

    /* ---- fill ----------------------------------------------------------
       Nodes take rather more than half. They are what the eye lands on; the
       edges only have to be present. Node share by area, edge share by
       length, same contract as the other phases. */
    /* NINE TENTHS TO THE NODES, and the reason is density rather than
       generosity. A line's apparent WEIGHT is how many points sit per screen
       pixel along it, not how far they scatter sideways: at half the budget
       each edge was carrying about 275 points over roughly 48 pixels — near
       six points per pixel, which at this sprite size overlaps into a solid
       rope and hazes every gap in the globe grey.

       A tenth broke them into a dotted trail instead, and on the paper
       ground worse than on the dark one: the stipple cull there removes
       points by luminance, so the lighter half of the edge points is thrown
       away again before it ever reaches the screen. 0.15 lands at roughly
       one and a half points per pixel, which is continuous at this sprite
       size and still nowhere near a rope. */
    var NODE_SHARE = 0.85;
    var wN = 0, wE = 0, k;
    for (k = 0; k < nd.length; k++) wN += nd[k].rad * nd[k].rad;
    for (k = 0; k < edge.length; k++) wE += edge[k].len;
    var at = 0, nNode = Math.round(N * NODE_SHARE), nEdge = N - nNode;

    for (k = 0; k < nd.length; k++) {
      var B = nd[k], n = Math.round(nNode * (B.rad * B.rad) / wN);
      for (var p2 = 0; p2 < n && at < N; p2++, at++) {
        /* SOLID, not a shell. These are dots on a diagram, and a dot with a
           hollow centre is a ring. Cube root of a uniform gives a genuinely
           even fill of the volume. */
        var u = r() * 2 - 1, th2 = r() * Math.PI * 2, sr = Math.sqrt(1 - u*u);
        var R3 = B.rad * Math.pow(r(), 1 / 3);
        a[at*3]   = B.x + sr * Math.cos(th2) * R3;
        a[at*3+1] = B.y + u * R3;
        a[at*3+2] = B.z + sr * Math.sin(th2) * R3;
      }
    }
    for (k = 0; k < edge.length && at < N; k++) {
      var E = edge[k], A = nd[E.i], Bb = nd[E.j];
      var vx = Bb.x - A.x, vy = Bb.y - A.y, vz = Bb.z - A.z;
      var nE = Math.round(nEdge * E.len / wE);
      for (var p3 = 0; p3 < nE && at < N; p3++, at++) {
        var t0 = A.rad / E.len, t1 = 1 - Bb.rad / E.len;
        var u2 = t0 + r() * Math.max(0.02, t1 - t0);
        // a hair of scatter across the line, or it aliases into a dotted rule
        a[at*3]   = A.x + vx * u2 + (r() - 0.5) * 0.0006;
        a[at*3+1] = A.y + vy * u2 + (r() - 0.5) * 0.0006;
        a[at*3+2] = A.z + vz * u2 + (r() - 0.5) * 0.0006;
      }
    }
    /* The remainder goes into the NODES. It used to go on the edges, which
       quietly undid the thinning above every time the rounding left a few
       thousand points over. */
    while (at < N) {
      var Bn = nd[(r() * nd.length) | 0];
      var u4 = r() * 2 - 1, t4 = r() * Math.PI * 2, s4 = Math.sqrt(1 - u4*u4);
      var R4 = Bn.rad * Math.pow(r(), 1 / 3);
      a[at*3]   = Bn.x + s4 * Math.cos(t4) * R4;
      a[at*3+1] = Bn.y + u4 * R4;
      a[at*3+2] = Bn.z + s4 * Math.sin(t4) * R4;
      at++;
    }
    console.info('[substrate] unattended:', nd.length + ' nodes,',
                 edge.length + ' edges');
    return a;
  }

  /* ---- 4 · DIFFUSE ------------------------------------------------------ */
  function makeDiffuse(src, anc) {
    var a = new Float32Array(N * 3), r = rng(2026);
    for (var i = 0; i < N; i++) {
      var g1 = (r()+r()+r()+r()-2), g2 = (r()+r()+r()+r()-2), g3 = (r()+r()+r()+r()-2);
      a[i*3]   = src[i*3]*0.55 + g1*0.40;
      a[i*3+1] = 0.72 + (src[i*3+1] - 0.72)*0.60 + g2*0.36;
      a[i*3+2] = src[i*3+2]*0.55 + g3*0.30;
    }
    return a;
  }

  /* THE EYE MARK IS NO LONGER AN ANCHOR — IT IS A COLOUR FLAG.

     It used to pin the slot eye and the dial in place through every phase,
     so they alone stayed sharp while the collage came apart. In practice
     that read as a bug rather than as an idea: two crisp discs floating in
     a field that was plainly deforming, most obviously in MESH, where they
     sat untouched on top of a network they were supposed to belong to.

     So `anchor` now does exactly one job — it survives into the shader as
     the thing that keeps the iris blue, the ring white and the dial red
     once the ground turns to paper and everything else resolves to black.
     Position is no longer excepted anywhere: the eyes deform with the rest
     of the material, because they are part of it. */
  function hold(out) { return out; }

  /* ---- the layer underneath, which the pointer reveals ------------------
     Not a skeleton and not a second object: the SAME palette, unassembled.
     The finished collage is opaque until you look into it, and what is
     underneath is loose material that never resolved — the construction is
     held together, not built. Which is the page's whole claim. */
  function makeUnresolved(src, col) {
    var a = new Float32Array(N * 3), c = new Float32Array(N * 3), r = rng(555);
    for (var i = 0; i < N; i++) {
      var s = (r() * N) | 0;
      a[i*3]   = src[s*3]   + (r()-0.5)*0.10;
      a[i*3+1] = src[s*3+1] + (r()-0.5)*0.10;
      a[i*3+2] = src[s*3+2] - 0.055 - r()*0.075;
      var t = (r() * N) | 0;                 // colours shuffled off the subject
      c[i*3] = col[t*3]; c[i*3+1] = col[t*3+1]; c[i*3+2] = col[t*3+2];
    }
    return { pos: a, col: c };
  }

  /* ---- a real scan, when there is one -----------------------------------
     tools/mesh-to-points.py writes window.SW_HEAD from a .glb or .obj. If
     the page has loaded that file this is used instead of makeHead(), and
     NOTHING else changes: every other phase derives from whatever this
     returns, so swapping the placeholder for a scan swaps all five.

     Dequantised on the CPU rather than in the shader, because unlike the
     reference this buffer is built once and then read four more times by
     the derived phases — they need real numbers, not normalised integers. */
  function loadScan() {
    var H = window.SW_HEAD;
    if (!H || !H.b64) return null;
    try {
      var bin = atob(H.b64);
      var q = new Uint16Array(bin.length / 2);
      for (var k = 0; k < q.length; k++) {
        q[k] = bin.charCodeAt(k * 2) | (bin.charCodeAt(k * 2 + 1) << 8);
      }
      var have = (H.n || q.length / 3) | 0;
      var mn = H.min, sp = [H.max[0]-mn[0], H.max[1]-mn[1], H.max[2]-mn[2]];
      var a = new Float32Array(N * 3);
      /* The asset need not carry exactly N points. Wrapping the index keeps
         a short file usable (points repeat, invisibly at this density) and a
         long one from overrunning, so the tool and the renderer do not have
         to be kept in lockstep to try a scan out. */
      for (var i = 0; i < N; i++) {
        var srcI = have ? (i % have) : 0;
        for (var c = 0; c < 3; c++) {
          a[i * 3 + c] = mn[c] + (q[srcI * 3 + c] / 65535) * sp[c];
        }
      }
      console.info('[substrate] scan loaded:', have, 'points');
      return a;
    } catch (e) {
      console.warn('[substrate] scan unreadable, using placeholder', e);
      return null;
    }
  }

  /* ---- shaders ----------------------------------------------------------- */

  var VERT = [
    'attribute vec3 aA;',
    'attribute vec3 aB;',
    'attribute vec3 aR;',            // x stagger, y size, z tint mix
    'attribute float aAnchor;',      // 1 on the two eyes, 0 elsewhere
    'attribute vec3 aCol;',          // the collage's own colour, per point
    'uniform mat4 uProj, uView, uModel;',
    'uniform float uMorph, uTime, uEnergy, uScale, uLayer;',
    /* uSettle is the fluid layer's own morph: 0 while the pointer is away
       and the interior is loose material, 1 once it has gathered into the
       portrait. uSpin is the same angle uModel is built from, needed only
       so the interior can turn at its own rate — see below. */
    'uniform float uSettle, uSpin;',
    /* WHERE THE LEADER LINES ARE POINTING. js/annot.js publishes its
       anchors each frame and they come in here as model-space points; any
       material within uHotR of one is lit. Eight is the cap because it is
       the number of callouts the busiest phase has, and an unrolled loop
       over eight is nothing next to the fragment work. */
    'uniform vec3 uHot[8];',
    /* HOW STRONGLY EACH ONE IS LIT, 0..1. Without this the highlight is a
       switch: an anchor is either published or it is not, so the yellow
       arrived at full strength in a single frame while the copy it belongs
       to was still fading up. One number per anchor rather than one for the
       whole draw, because both annotated phases can be within the
       observer's margin at once and they are at different distances from
       the screen. */
    'uniform float uHotA[8];',
    'uniform float uHotN, uHotR;',
    'uniform vec2 uLook;',
    'varying float vT, vFade, vAnc, vHot;',
    'varying vec3 vCol;',
    '',
    'void main(){',
    /* PER-POINT STAGGER. A single global mix moves every point at the same
       instant, which reads as a slide. Giving each point its own window
       inside the transition makes the change sweep through the mass. */
    '  float w = 0.55;',
    '  float s0 = aR.x * (1.0 - w);',
    /* THE SAME STAGGER DRIVES TWO DIFFERENT EVENTS. For the shell, aA and
       aB are two phases and uMorph walks between them. For the fluid, aA is
       the unresolved material and aB is the face, and uSettle walks between
       THOSE — so the portrait assembles point by point, sweeping through
       the mass exactly the way a phase change does, instead of appearing.
       One mechanism, and the hover reads as the same kind of event as the
       scroll because it is one. */
    '  float drive = uLayer < 0.0 ? uSettle : uMorph;',
    '  float t = clamp((drive - s0) / w, 0.0, 1.0);',
    '  t = t * t * (3.0 - 2.0 * t);',
    '  vec3 p = mix(aA, aB, t);',
    '',
    /* THE DRIFT. Amplitude is the phase energy, so SOLID is nearly still and
       DIFFUSE never settles. Three frequencies, or the whole cloud breathes
       in unison and reads as one object wobbling. */
    '  float e = uEnergy * 0.055;',
    '  p.x += sin(uTime * 0.7 + aR.x * 43.0) * e;',
    '  p.y += sin(uTime * 0.5 + aR.y * 71.0) * e * 0.8;',
    '  p.z += cos(uTime * 0.6 + aR.z * 57.0) * e;',
    '',
    /* THE INTERIOR IS NOT BOLTED TO THE SHELL.

       This used to be a shear — the twist angle rising with height — which
       was the right idea when the interior was loose material with no shape
       to ruin. It is a face now, and a shear applied to a face is a horror.

       What replaces it does the same job for the same reason. uModel turns
       the whole subject by uSpin as the page scrolls, and by DIFFUSE that is
       about 96 degrees: enough to put the portrait fully edge-on, where it
       stops being anybody. Giving the interior back 45% of that angle keeps
       it near a three-quarter view across the entire page — the angle a face
       is most recognisable from — while still turning with the object, so it
       still reads as something INSIDE a rotating solid rather than as a
       billboard pinned to the screen.

       The small vertical breathing is kept: without it the interior is
       perfectly still inside a body that never is, and stillness at that
       scale reads as a texture rather than as a thing. */
    '  if (uLayer < 0.0){',
    '    float ca = cos(-uSpin * 0.45), sa = sin(-uSpin * 0.45);',
    '    p.xz = vec2(p.x * ca - p.z * sa, p.x * sa + p.z * ca);',
    '    p.y += sin(uTime * 0.9 + aR.x * 19.0) * 0.006;',
    '  }',
    '',
    /* ---- THE HEAD TURNS ON THE NECK -----------------------------------
       Not the whole model: the turn ramps in from the shoulders up, so the
       bust stays planted and only the head and hat swing. Rotating
       everything is a camera move; rotating from the neck is a gesture.

       AND THE EYE LEADS IT. Anchored points take 55% more of the angle, so
       the eye arrives at the cursor slightly before the head does. The lag
       between the two is the entire liveness cue — remove it and the head
       reads as a dial being turned rather than as something looking. */
    /* Measured here, before the head turn, because that is the space the
       anchors are expressed in — they come from sliceCentre() and from
       data-anchor, both of which are plain model coordinates. */
    '  vHot = 0.0;',
    '  for (int i = 0; i < 8; i++){',
    '    if (float(i) >= uHotN) break;',
    '    vHot = max(vHot, uHotA[i] * (1.0 - smoothstep(uHotR * 0.30, uHotR, distance(p, uHot[i]))));',
    '  }',
    '',
    '  float above = smoothstep(0.10, 0.55, p.y);',
    '  float lead  = 1.0 + aAnchor * 0.55;',
    '  float yaw   = uLook.x * above * lead;',
    '  float pit   = uLook.y * above * lead;',
    '  vec3 piv = vec3(0.0, 0.12, 0.0);',
    '  vec3 q = p - piv;',
    '  float cy2 = cos(yaw), sy2 = sin(yaw);',
    '  q.xz = vec2(q.x * cy2 + q.z * sy2, -q.x * sy2 + q.z * cy2);',
    '  float cp = cos(pit), sp = sin(pit);',
    '  q.yz = vec2(q.y * cp - q.z * sp, q.y * sp + q.z * cp);',
    '  p = q + piv;',
    '',
    /* Centred on 0.72, not 0.5: the subject now runs from the foot of the
       panel to the tip of the hat, and 0.5 put the crown off the top. */
    '  vec4 wp = uModel * vec4(p - vec3(0.0, 0.72, 0.0), 1.0);',
    '  vec4 vp = uView * wp;',
    '  gl_Position = uProj * vp;',
    '  gl_PointSize = uScale * (0.55 + aR.y * 0.9) / max(-vp.z, 0.2);',
    '  vT = aR.z;',
    '  vAnc = aAnchor;',
    '  vCol = aCol;',
    /* Depth fade: the far side recedes instead of reading as a flat sheet. */
    /* 4.3 was tuned when the camera sat at -3.30. Moving it to -3.95 to
       fit the hat put every point at (4.3-3.95)/2.2 = 0.16 of full
       brightness — the subject went dim everywhere and it looked like an
       alpha problem rather than a framing one. */
    '  vFade = clamp((5.00 + vp.z) / 2.2, 0.12, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    /* highp, NOT mediump. uTime, uLayer and uRes are declared in BOTH stages
       now, and a float uniform of the same name must carry the same precision
       in each or the program refuses to link — the vertex stage defaults to
       highp, so this side has to match it. The phone is gated out of this
       page anyway, which is where mediump would have been earning its keep. */
    'precision highp float;',
    'uniform vec3 uInk;',
    'uniform float uLayer, uTime, uEnergy;',
    'uniform vec2 uRes;',
    /* xy in units of SCREEN HEIGHT (both axes), so the hole is round on any
       aspect ratio; z is how much life the stroke has left. */
    'uniform vec3 uRev[' + REV + '];',
    'uniform float uRevRadius, uRevSoft, uRevWarp, uRevWarpScale, uRevWarpSpeed;',
    'uniform float uRevGlow;',
    /* THE GROUND, AND THE POINTS ON IT. Same tearAt() js/tear.js paints
       with — see js/tearfn.js for why it is shared rather than copied. */
    'uniform float uTear, uTearRed;',
    'uniform vec3 uInkDark;',
    'varying float vT, vFade, vAnc, vHot;',
    'varying vec3 vCol;',
    window.TEAR_GLSL,
    '',
    'float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash2(i), hash2(i + vec2(1,0)), u.x),',
    '             mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), u.x), u.y);',
    '}',
    '',
    'float revealAt(){',
    '  vec2 uv = gl_FragCoord.xy / max(uRes.y, 1.0);',
    /* WARP THE LOOKUP, NOT THE RESULT. Deforming where the brush is measured
       FROM bends the whole opening, interior included, the way a fluid does.
       Deforming the result afterwards only ever wobbles the rim. */
    '  if (uRevWarp > 0.0001){',
    '    float n1 = vnoise(uv * uRevWarpScale + vec2(0.0, uTime * uRevWarpSpeed));',
    '    float n2 = vnoise(uv * uRevWarpScale + vec2(5.2, uTime * uRevWarpSpeed + 1.3));',
    '    uv += (vec2(n1, n2) - 0.5) * uRevWarp * uRevRadius * 2.0;',
    '  }',
    '  float r = 0.0;',
    '  for (int i = 0; i < ' + REV + '; i++){',
    '    if (uRev[i].z <= 0.0) continue;',
    '    float rad = uRevRadius * uRev[i].z;',
    '    float d = distance(uv, uRev[i].xy);',
    '    r = max(r, smoothstep(rad, rad * (1.0 - uRevSoft), d));',
    '  }',
    '  return clamp(r, 0.0, 1.0);',
    '}',
    '',
    'void main(){',
    // round, soft-edged points — a square point is the clearest naive tell
    '  vec2 c = gl_PointCoord - 0.5;',
    '  float rr = dot(c, c);',
    '  if (rr > 0.25) discard;',
    /* A SOLID DOT WITH AN ANTIALIASED RIM, not a smudge. The falloff used
       to start at rr 0.02 — a fully-opaque core only 28% of the sprite
       across, with the other 72% ramping down — so every "node" was mostly
       gradient and the field read as grey haze at any distance. The opaque
       core is now 77% across and only the last sliver is soft. */
    '  float a = smoothstep(0.25, 0.15, rr);',
    '',
    '  float rv = revealAt();',
    '  float alpha;',
    '',
    /* ONE PALETTE, BOTH LAYERS. The interior is separated from the shell by
       DENSITY and BRIGHTNESS, never by hue: it is the same material all the
       way through, and tinting the core would say the opposite. vT is fixed
       per point, so the variation reads as grain in the material rather than
       as per-frame sparkle. */
    '  vec2 guv = gl_FragCoord.xy / uRes;',
    '  float ground = tearAt(guv, uTear, 0.0);',
    /* THE RED EATS THE SUBJECT, along the same torn edge that paints it.
       Fading the whole cloud out on a timer would have been easier and
       would have looked like two separate events; consuming it with the
       boundary makes the footer the consequence of the tear rather than a
       screen that arrives over the top of one. */
    '  float burn = tearAt(guv, uTearRed, 37.0);',
    /* Dark points on the light ground. Without this the subject vanishes
       the instant the paper arrives underneath it. */
    /* NO BRIGHTNESS MODULATION ON THE COLOUR. This used to be multiplied by
       (0.58 + 0.42 * vT), which is where the grey came from: white ink at
       0.86 times an average 0.79 is rgb 173 BEFORE alpha, so a "white" node
       could never be white and a nominally black one was being lifted too.
       The per-point variation belongs in the alpha, where it varies DENSITY
       without touching the two colours the ground flip depends on. */
    /* THE COLLAGE CARRIES ITS OWN COLOUR. uInk/uInkDark used to be the
       whole palette — one ink that flipped across the tear. The subject is
       now painted, so what flips is BRIGHTNESS, not hue: on the light
       ground every colour is scaled down toward its own dark version,
       which keeps the palette intact and keeps it legible on paper. A
       straight swap to dark ink would have thrown the picture away. */
    /* THE COLOUR DOES NOT SURVIVE THE PAPER — it is DESATURATED, not just
       darkened. Scaling the palette toward its own dark version kept the
       hues, and a dark blue on white is still a blue: at the density these
       points sit, that read as grubby rather than as ink. So the subject
       resolves to near-black greys on the light ground, keeping only the
       LUMINANCE structure of the collage — the pale fields stay a little
       lighter than the dark ones, so the composition is still legible while
       the colour itself is gone. Full palette on black, ink on paper. */
    /* ON PAPER THE BODY BECOMES INK, AND ONLY THE EYES KEEP THEIR COLOUR.
       Greys at 0.03..0.235 still read as a wash; near-black is what makes
       the collage look printed rather than smudged. The two eyes are the
       single exception, carried by vAnc — so the blue iris, the white ring
       and the red dial stay themselves on both grounds, and are the one
       thing colour is spent on once the paper arrives. They are still fully
       deformed by the phase; only their palette is excepted. */
    /* THE INK IS BLACK, FULL STOP. The range used to run to 0.105 so the
       pale fields of the collage stayed a shade lighter than the dark ones
       and the composition survived the flip. It does still need to survive
       it — but luminance is now carried by how DENSE the stipple is (see
       the cull below), not by how pale each dot is, so nothing here has to
       be anything other than black. */
    '  float lum = dot(vCol, vec3(0.299, 0.587, 0.114));',
    '  vec3 ink = vec3(mix(0.008, 0.050, lum));',
    '  vec3 paper = mix(ink, vCol, vAnc);',
    '  vec3 col = mix(vCol, paper, ground);',
    /* THE CALLOUT TARGET, PAINTED LAST. Applied after the ground flip on
       purpose: on paper every colour resolves to near-black ink, and a
       highlight that resolves with it is not a highlight. This one is the
       single thing on the page allowed to ignore the flip, because its
       whole job is to say "here" on both grounds. */
    /* THE CALLOUT LIGHT YIELDS TO THE HOLE. Two things it must not do:
       burn through the opening the pointer has made, and paint the portrait
       underneath. rv is this fragment's reveal, so (1 - rv) fades the
       highlight out exactly as the hole opens; the layer test kills it on
       the interior outright, because a leader line annotates the OBJECT and
       has nothing to say about the face inside it. */
    '  float hot = vHot * (1.0 - rv);',
    '  if (uLayer < 0.0) hot = 0.0;',
    '  col = mix(col, vec3(1.0, 0.90, 0.10), hot * 0.92);',
    '  float vary = 0.55 + 0.45 * vT;',
    /* How far this phase has loosened the material. Read twice below,
       because the two grounds have to spend it differently. */
    '  float thin = uEnergy * (1.0 - vAnc);',
    '',
    '  if (uLayer > 0.0){',
    // THE SHELL. Eaten by the reveal.
    /* TWO ALPHA CURVES, NOT ONE SCALED. Light-on-dark and dark-on-light are
       not the same picture at different strengths.

       A faint WHITE dot on black still reads: it is the only light in the
       pixel, and overlapping dots accumulate toward white. A faint BLACK dot
       on white does not — at 30% alpha it composites to light grey, and the
       first version of this scaled the dark curve by 2.45 and still landed
       there. So the light ground gets its own curve: a much higher base, and
       most of the depth fade taken out, because vFade was pulling the far
       side of the cloud to 0.45 and grey is exactly what we cannot afford
       here. Point CENTRES now reach near-opaque black; the sprite falloff
       keeps the edges soft, so they read as crisp dots rather than blobs. */
    '    float aDark  = mix(vFade, 1.0, 0.50) * 0.92 * vary;',
    /* AND NOTHING ELSE MULTIPLIES IT. `vary` — the per-point density
       variation — used to be in here too, and on the dark ground it is
       texture. On paper it is nothing but lost opacity: it took a black dot
       to 55% and 55% black on white is grey. Every modulation the light
       ground wants is applied by TAKING POINTS AWAY instead (see the cull
       at the bottom of this shader), which leaves the ones that remain at
       full strength. So this is the whole curve: ~0.94 to 1.0, and a point
       centre on paper is black. */
    '    float aLight = mix(vFade, 1.0, 0.94);',
    '    alpha = a * mix(aDark, aLight, ground) * (1.0 - rv);',
    /* THE FRINGE AT THE OPENING. Brightest where the reveal is passing
       THROUGH — not at the centre, where the hole is simply open, and not
       outside it, where nothing is happening. A band on the reveal value,
       peaking at half. */
    '    if (uRevGlow > 0.0001 && rv > 0.001){',
    '      float band = rv * (1.0 - rv) * 4.0;',
    '      col += vec3(band * uRevGlow) * (1.0 - ground);',
    '      alpha += a * vFade * band * 0.22;',
    '    }',
    '  } else {',
    /* THE FLUID. Same ink, carried denser — the opening reads as looking
       INTO the material rather than at something else stored inside it. */
    /* No brightness lift here either — it would have clipped the white and
       done nothing at all to the black. The fluid is denser, not paler. */
    '    float fDark  = mix(vFade, 1.0, 0.55) * 0.92 * vary;',
    '    float fLight = mix(vFade, 1.0, 0.94);',
    '    alpha = a * mix(fDark, fLight, ground) * rv;',
    '  }',
    '',
    /* DISCARD, not a zero alpha. A fully transparent fragment still costs a
       blend, and at 40k points twice over that is the whole budget. */
    /* THE EYE STAYS LIT. Holding its POSITION through DIFFUSE was not
       enough to be seen — a small dense ring inside a cloud of forty
       thousand points is just more cloud. Anchored points keep their
       brightness while everything around them thins, so the last thing
       legible on the screen is the one thing that never came apart. */
    /* COHERENCE, MADE VISIBLE. Loose material fades as the phase energy
       rises; anchored material does not. So the cloud genuinely thins out
       toward DIFFUSE instead of merely rearranging, and the eye — which
       never dims — is left as the one legible thing at the end. This is
       the same number the HUD prints as `coherence`, so the readout and
       the picture are finally describing the same event. */
    /* ...but only on the DARK ground. Fading is how you thin a field of
       white dots on black: half-strength white is still light, and the
       cloud genuinely looks like it is coming apart. Do the same thing to
       black dots on paper and you do not get a thinner cloud, you get a
       grey one — every dot lands somewhere around rgb 160 and the subject
       turns into a smudge. So the light ground is excluded here and pays
       for its thinning below instead. */
    '  alpha *= mix(mix(1.0, 0.40, thin), 1.0, ground);',
    '  alpha *= (1.0 + vAnc * 1.25 + hot * 1.10);',
    '  alpha *= (1.0 - burn);',
    /* ON PAPER, THINNING IS SUBTRACTION.

       Everything the light ground would otherwise have expressed by making
       a dot paler is expressed by removing the dot: the phase energy, the
       per-point density grain, and the collage's own light and dark fields
       (a pale panel becomes a sparser stipple, which is how it stays pale
       without any dot in it being pale). The average ink on the page comes
       out about where the old alpha curve put it — 38% of the points at
       full strength rather than 100% at 38% — but it is made of black
       marks instead of grey ones, which is the whole difference between a
       printed halftone and a wash.

       `shed` is the per-point random, decorrelated from vT's other uses so
       the survivors are not also the ones vary already favoured. The eyes
       are never shed: they are the one thing that keeps its colour here. */
    '  float shed = fract(vT * 7.31);',
    '  float cull = clamp(thin * 0.56 + (1.0 - vary) * 0.22 + lum * 0.22, 0.0, 0.78);',
    '  if (vAnc < 0.5 && hot < 0.25 && shed < cull * ground) discard;',
    '  if (alpha <= 0.004) discard;',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  /* ---- minimal mat4 ------------------------------------------------------ */
  function persp(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  }
  function rotY(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
  }
  function transl(x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; }

  /* ---- the renderer ------------------------------------------------------ */
  window.PAGE.register('substrate', function (scope) {
    var canvas = scope.querySelector('#substrate');
    if (!canvas) return;

    /* preserveDrawingBuffer so the HUD minimap can drawImage() this canvas
       instead of standing up a second WebGL context for a 150px picture of
       the same cloud. */
    var gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!gl) { console.warn('[substrate] no webgl'); return; }

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error('[substrate] shader:', gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error('[substrate] link:', gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // build every phase once; hand shells AND fluids to the GPU, never upload again
    /* EVERY PHASE IS DERIVED FROM THE BUST. That is what makes the five
       states read as one subject rather than five objects: the swarm's
       clusters sit on the head's own surface, the mesh's nodes are its own
       points, and diffuse is it, let go of. */
    /* A supplied scan replaces the subject entirely; it has no collage and
       no anchors, so it falls back to plain ink. */
    var scan = loadScan();
    var built = scan
      ? { pos: scan, col: null, anchor: new Float32Array(N) }
      : makeSubject();
    var solid = built.pos, anchor = built.anchor;
    var layer = built.layer || new Float32Array(N);
    var colour = built.col || (function () {
      var c = new Float32Array(N * 3);
      for (var i = 0; i < N * 3; i++) c[i] = 0.86;
      return c;
    })();
    var shells = [solid,
                  makeSection(solid, anchor, layer), makeMesh(solid, anchor),
                  makeSwarm(solid, anchor),   makeDiffuse(solid, anchor)];
    /* THE INTERIOR, IN TWO STATES.

       `under` is what it has always been — the collage's own material,
       unassembled, sitting a little behind itself. It is no longer the
       thing the pointer reveals, though; it is the thing the revealed
       thing comes OUT of. js/face.js supplies the other end: a portrait,
       drawn as contours on a curved surface, filling the same envelope as
       the collage.

       Read together they say the thing the page has been claiming all
       along — the construction is held together, not built, and there is
       something specific underneath it. You just have to look in.

       The face is optional at load: if js/face.js is missing the interior
       stays unresolved at both ends and the reveal behaves exactly as it
       did before, rather than the subject failing to appear. */
    var under = makeUnresolved(solid, colour);
    /* ---- THE INTERIOR CANNOT PAINT OUTSIDE THE SUBJECT ------------------
       The portrait is fitted to the collage's ENVELOPE, which is a box; the
       collage itself is a wizard. So the reveal was showing face material
       past the shoulders and above the hat, and the hole read as a cloud
       floating in front of the object rather than as something seen inside
       it. Both layers are additive with no occlusion between them, so there
       is nothing in the renderer that would ever have stopped it.

       The collage is a flat relief — that is its whole construction — so its
       outline in the subject's own XY is fixed and can simply be measured.
       This bins the shell's 110,000 points into a coarse occupancy grid and
       moves any interior point that falls outside it onto one that does not.

       WHY MOVE RATHER THAN HIDE. There is no per-point alpha to switch off
       and no depth or stencil to test against: making a point invisible
       would mean another attribute and another branch in the hot shader. A
       culled point stacked onto a surviving one contributes brightness and
       no silhouette, which is exactly the required behaviour, and it costs
       one pass at boot and nothing per frame afterwards.

       Grid rather than a polygon because the outline is not convex — the gap
       under the hat brim and the notch beside the dial are both real, and a
       hull would fill them back in. */
    function containToShell(g, shell) {
      if (!g) return g;
      var GX = 92, GY = 156, i;
      var mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
      for (i = 0; i < N; i++) {
        var sx0 = shell[i*3], sy0 = shell[i*3+1];
        if (sx0 < mnX) mnX = sx0; if (sx0 > mxX) mxX = sx0;
        if (sy0 < mnY) mnY = sy0; if (sy0 > mxY) mxY = sy0;
      }
      var kx = (GX - 1) / ((mxX - mnX) || 1), ky = (GY - 1) / ((mxY - mnY) || 1);
      var grid = new Uint8Array(GX * GY);
      for (i = 0; i < N; i++) {
        grid[(((shell[i*3+1] - mnY) * ky) | 0) * GX + (((shell[i*3] - mnX) * kx) | 0)] = 1;
      }
      function inside(x, y) {
        var cx = ((x - mnX) * kx) | 0, cy = ((y - mnY) * ky) | 0;
        if (cx < 0 || cy < 0 || cx >= GX || cy >= GY) return 0;
        return grid[cy * GX + cx];
      }
      var keep = [];
      for (i = 0; i < N; i++) if (inside(g.pos[i*3], g.pos[i*3+1])) keep.push(i);
      /* If the portrait somehow misses the shell entirely, leave it alone
         rather than collapsing every point onto nothing. */
      if (keep.length < N * 0.05) return g;
      var pk = rng(31337);
      for (i = 0; i < N; i++) {
        if (inside(g.pos[i*3], g.pos[i*3+1])) continue;
        var j = keep[(pk() * keep.length) | 0];
        g.pos[i*3]   = g.pos[j*3]   + (pk() - 0.5) * 0.004;
        g.pos[i*3+1] = g.pos[j*3+1] + (pk() - 0.5) * 0.004;
        g.pos[i*3+2] = g.pos[j*3+2] + (pk() - 0.5) * 0.006;
        g.col[i*3] = g.col[j*3]; g.col[i*3+1] = g.col[j*3+1]; g.col[i*3+2] = g.col[j*3+2];
        if (g.anchor) g.anchor[i] = g.anchor[j];
      }
      console.info('[substrate] interior contained:',
                   (100 - 100 * keep.length / N).toFixed(0) + '% moved inside');
      return g;
    }

    var face = containToShell(window.FACE_GEOM ? window.FACE_GEOM(N) : null, solid);
    if (face) console.info('[substrate] face:', face.pool, 'points in pool');
    /* Neither interior state changes with phase, so these are TWO buffers
       bound once rather than five copies of each — the map() below would
       otherwise upload the same array once per phase. */

    function upload(arr) {
      var bf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return bf;
    }
    var shellBuf = shells.map(upload);
    var uBuf = upload(under.pos);
    /* Index 0 is where the interior sits with the pointer away, index 1 is
       where it settles to — so drawLayer(0, 1, ...) below reads exactly
       like the shell's drawLayer(a, b, ...), with uSettle in place of
       uMorph. */
    var fluidBuf = [uBuf, upload(face ? face.pos : under.pos)];
    var colBuf   = upload(colour);
    var uColBuf  = upload(face ? face.col : under.col);

    var rr2 = rng(5150), rand = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      rand[i*3] = rr2(); rand[i*3+1] = rr2(); rand[i*3+2] = rr2();
    }
    var randBuf = upload(rand);
    var ancBuf  = upload(anchor);
    /* THE INTERIOR NEEDS ITS OWN ANCHORS. aAnchor is what keeps a point's
       colour on the paper ground and exempts it from the stipple cull, and
       the collage's anchor array marks the PANEL's two eyes. Bound to the
       face it would mark a few thousand arbitrary points instead, speckling
       the portrait with survivors. The face's anchors are its own eyes. */
    var faceAncBuf = upload(face ? face.anchor : new Float32Array(N));

    /* AND IF A PHOTOGRAPH TURNS UP, IT WINS.

       js/face.js looks for assets/ref/face.jpg and samples it into the same
       three arrays. It is asynchronous and it usually finds nothing, so the
       buffers above are built from the drawn stand-in first and simply
       re-uploaded if a photo arrives. Nothing else in the pipeline knows or
       cares: same buffer objects, same attribute bindings, same reveal.

       Re-uploading rather than deferring the build is what keeps the failure
       mode boring — no photo, no wait, no empty interior. */
    if (window.FACE_GEOM && window.FACE_GEOM.fromPhoto) {
      window.FACE_GEOM.fromPhoto(N, function (g) {
        // same containment, or the photograph re-introduces the overspill
        g = containToShell(g, solid);
        gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuf[1]);
        gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, uColBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.col, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, faceAncBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.anchor, gl.STATIC_DRAW);
      });
    }

    var locA = gl.getAttribLocation(prog, 'aA');
    var locB = gl.getAttribLocation(prog, 'aB');
    var locR = gl.getAttribLocation(prog, 'aR');
    var locN = gl.getAttribLocation(prog, 'aAnchor');
    var locC = gl.getAttribLocation(prog, 'aCol');
    gl.enableVertexAttribArray(locA);
    gl.enableVertexAttribArray(locB);
    gl.enableVertexAttribArray(locR);
    gl.enableVertexAttribArray(locN);
    gl.enableVertexAttribArray(locC);

    var U = {};
    ['uProj','uView','uModel','uMorph','uSettle','uSpin','uTime','uEnergy','uScale','uLayer',
     'uInk','uInkDark','uTear','uTearRed','uRes','uLook','uHot','uHotA','uHotN','uHotR','uRev','uRevRadius','uRevSoft','uRevWarp',
     'uRevWarpScale','uRevWarpSpeed','uRevGlow'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var dpr = 1, W = 1, H = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    /* ---- the reveal trail -------------------------------------------------
       Slot 0 is the LIVE point and follows the cursor; its life is how long
       the pointer has been on the page, eased, so a stationary hover holds
       the hole open instead of letting it close. Slots 1..n are a trail,
       dropped as the pointer travels and decaying on their own — which is
       what makes a fast sweep leave a wake rather than a single dot. */
    var rev = new Float32Array(REV * 3);
    var mx = -9999, my = -9999, havePointer = 0, wantPointer = 0;
    /* SETTLE IS SLOWER THAN THE OPENING, DELIBERATELY.

       havePointer closes in about a sixth of a second, which is right for
       the hole: an opening that lags the cursor feels broken. The thing
       inside the hole is a different question. At the same rate the face is
       simply there the instant you arrive, which is the image swap the
       brief rules out; at this rate the opening arrives first and you watch
       the material gather into somebody through it.

       It also lets go slowly, so leaving and coming back does not re-run
       the assembly from zero — after the first time, the face is already
       in there, which is the reading we want. */
    var settle = 0, SETTLE_IN = 1.9, SETTLE_OUT = 0.9;

    /* ?face — AN INSTRUMENT, in the same family as ?fps and ?off=.

       The interior is only ever visible through a hole 0.17 of the screen
       wide that follows the cursor, which is the correct experience and a
       useless way to tune a portrait: you cannot judge a jawline through a
       keyhole. This opens the reveal to the whole frame and holds the
       settle at 1. Combine with ?off=shell to see the face alone.

       It is four lines and it is the difference between tuning this by
       looking at it and tuning it by arithmetic. */
    var FACE_RIG = /[?&]face(&|=|$)/.test(location.search);
    var lastDropX = 0, lastDropY = 0, writeAt = 1;

    /* ---- WHERE IT IS LOOKING ---------------------------------------------
       Two eased angles and a clock since the pointer last moved. Separate
       from the reveal trail above: that is about what the pointer UNCOVERS,
       this is about what the subject ATTENDS TO, and they want different
       easing — the hole must keep up with the cursor exactly, the head must
       not. */
    var lookX = 0, lookY = 0, wantX = 0, wantY = 0, lastMove = -1e9;

    function onMove(e) {
      mx = e.clientX; my = e.clientY; wantPointer = 1;
      lastMove = performance.now();
      /* Deliberately well short of a full turn toward the cursor. A head
         that tracks exactly reads as a targeting reticle; one that only
         leans toward you reads as attention. */
      wantX = ((mx / window.innerWidth) * 2 - 1) * 0.46;
      wantY = ((my / window.innerHeight) * 2 - 1) * 0.20;
      var dx = mx - lastDropX, dy = my - lastDropY;
      // one trail stamp per ~26px of travel; any denser is invisible and costs
      if (dx * dx + dy * dy > 26 * 26) {
        lastDropX = mx; lastDropY = my;
        rev[writeAt * 3]     = (mx * dpr) / canvas.height;
        rev[writeAt * 3 + 1] = (canvas.height - my * dpr) / canvas.height;
        rev[writeAt * 3 + 2] = 1.0;
        writeAt = writeAt + 1; if (writeAt >= REV) writeAt = 1;
      }
    }
    function onLeave() { wantPointer = 0; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    var drawnSpin = 0, drawnLookX = 0, drawnLookY = 0, drawnTime = 0;

  /* ---- MODEL SPACE TO SCREEN PIXELS --------------------------------------
     js/annot.js draws leader lines from copy in the gutters to points on the
     subject, and a line that does not track the rotation is a line that is
     wrong for all but one frame of the scroll.

     This walks EXACTLY the chain the vertex shader walks — recentre on
     (0, 0.72, 0), rotY(spin), the fixed camera translate, the same
     projection — because two versions of a transform is two things to keep
     in step, and the symptom of them drifting is an arrow that points at
     nothing in particular.

     Deliberately NOT applying the per-point stagger, drift or head-turn: an
     anchor is a place on the subject, not a particle, and those three are
     what make a particle wander around that place. */
  function makeProject(canvas) {
    return function (x, y, z) {
      /* ---- THE HEAD TURN, WHICH THIS USED TO SKIP ---------------------
         The first version of this deliberately left out uLook, on the
         reasoning that the drift and the stagger are per-POINT wander and
         an anchor is a place rather than a particle. That reasoning is
         right about the drift and wrong about this: the head turn is a
         RIGID rotation of the whole subject about (0, 0.12, 0), following
         the cursor, applied before the model matrix. Leaving it out
         computes the anchor in un-turned space while the subject is drawn
         turned, so every leader line is off by exactly that angle — which
         is what made them wander off their slabs.

         `above` and `lead` are copied from the vertex shader verbatim.
         aAnchor is 0 for anything that is not an eye, so lead is 1. */
      var above = (y - 0.10) / 0.45;
      above = above < 0 ? 0 : (above > 1 ? 1 : above);
      above = above * above * (3 - 2 * above);          // smoothstep
      var yaw = drawnLookX * above, pit = drawnLookY * above;

      var qx = x, qy = y - 0.12, qz = z;                // pivot
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var ax = qx * cy + qz * sy, az = -qx * sy + qz * cy;
      var cp = Math.cos(pit), sp = Math.sin(pit);
      var ay = qy * cp - az * sp; az = qy * sp + az * cp;
      var px = ax, py = ay + 0.12 - 0.72, pz = az;      // unpivot, recentre

      var c = Math.cos(drawnSpin), s = Math.sin(drawnSpin);
      var rx = c * px + s * pz, rz = -s * px + c * pz;  // uModel
      var vx = rx, vy = py - 0.02, vz = rz - 3.35;      // uView
      var w = -vz;
      if (w < 0.05) return null;                        // behind the camera
      /* BEFORE THE FIRST RESIZE THE CANVAS IS 0x0, and dividing by an
         aspect ratio of zero hands back Infinity, which reaches the SVG as
         "NaN" and fills the console with
         `<line> attribute x2: Expected length, "NaN"` on every early frame.
         Nothing looks broken, which is exactly why it is worth catching. */
      if (canvas.width < 1 || canvas.height < 1 ||
          canvas.clientWidth < 1 || canvas.clientHeight < 1) return null;
      var f = 1 / Math.tan(0.62 / 2);
      var aspect = canvas.width / canvas.height;
      return {
        x: ((f / aspect) * vx / w * 0.5 + 0.5) * canvas.clientWidth,
        y: (0.5 - f * vy / w * 0.5) * canvas.clientHeight
      };
    };
  }

  var state = { progress: 0, phase: 0, morph: 0, spin: 0, energy: ENERGY[0],
                  reveal: 0, tear: 0, tearRed: 0 };

    /* AFTER the literal, not before it. This used to sit up beside the
       buffer uploads, which run earlier in this function — `var` hoists the
       declaration but not the value, so `state` was still undefined there
       and the whole module threw on mount. The subject simply did not
       appear, and the only clue was one line in the console. */
    state.project = makeProject(canvas);
    /* Phase 1 is the sliced stack; morph is 0 at BUILD and 1 at BACKEND. */
    /* `at` overrides the morph, for a caller that wants the slab's RESTING
       place rather than its place right now — js/annot.js seeds a pin with
       it, and a seed has to be the same point whatever the scroll happens
       to be doing when the pin gets resolved. */
    state.sliceCentre = function (k, dx, dz, at) {
      return sliceCentre(k, at !== undefined ? at
                          : (state.phase === 0 ? state.morph
                            : (state.phase >= 1 ? 1 : 0)), dx, dz);
    };
    /* ---- AN ANCHOR THAT IS MATERIAL, NOT A COORDINATE ------------------

       A leader has to end ON the thing it names, and the thing it names
       moves in two different ways. The rotation, which project() already
       follows. And the MORPH, which it did not.

       sliceCentre() works out where slab k ought to be. That is exact at
       the middle of BACKEND and wrong at every other scroll position,
       because the shader does not move the material the way the formula
       does: each point walks from one phase to the next on its OWN
       staggered clock, smoothstepped, plus a drift. So the moment you
       scroll off the phase, the arrow is at the coordinate and the slab is
       somewhere else — which is the gap, and it opens in both directions
       because the stagger is behind going one way and ahead going the
       other. The fixed data-anchor points in SYSTEMS have it worse: they do
       not move at all.

       So stop recomputing where the subject ought to be and follow a piece
       of it. pin() picks one real particle once; pinAt() runs the same
       three lines the vertex shader runs to say where that particle is
       this frame. The dot is then welded to material by construction, in
       every phase and through every transition, and since the highlight
       lights whatever lies near the published point, the yellow cannot be
       anywhere else either. One list, one truth.

       The pick: nearest particle to the mark, then — among everything
       within 3cm of it — the one whose stagger sits closest to the middle
       of the pack, so the anchor travels with the bulk of the mass instead
       of leading or lagging it through a transition. Points flagged
       aAnchor are skipped: the eyes take 55% more of the head turn, and
       project() assumes they do not. */
    var pins = [];
    state.pin = function (x, y, z, phase) {
      var ph = shells[Math.max(0, Math.min(shells.length - 1, phase | 0))];
      var best = -1, bd = 1e9, near = [];
      for (var i = 0; i < N; i++) {
        if (anchor[i] > 0.5) continue;
        var dx = ph[i*3] - x, dy = ph[i*3+1] - y, dz = ph[i*3+2] - z;
        var d = dx*dx + dy*dy + dz*dz;
        if (d < bd) { bd = d; best = i; }
        if (d < 0.0009) near.push(i);
      }
      var pick = best, pb = 1e9;
      for (var j = 0; j < near.length; j++) {
        var off = Math.abs(rand[near[j]*3] - 0.5);
        if (off < pb) { pb = off; pick = near[j]; }
      }
      if (pick < 0) return -1;
      pins.push(pick);
      return pins.length - 1;
    };

    /* The top of the vertex shader, in JS, and it has to stay that way: if
       the stagger window or the drift changes up there it changes here too,
       and the symptom is an arrow that misses by a few pixels for reasons
       nobody can see. Deliberately NOT applying the head turn — project()
       does that, because it has to do it for data-anchor points as well. */
    state.pinAt = function (id) {
      var i = pins[id];
      if (i === undefined) return null;
      var a = Math.max(0, Math.min(shells.length - 1, state.phase));
      var b = Math.min(shells.length - 1, a + 1);
      var A = shells[a], B = shells[b];
      var w = 0.55, s0 = rand[i*3] * (1 - w);
      var t = (state.morph - s0) / w;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      t = t * t * (3 - 2 * t);
      var e = state.energy * ((window.DORMANT.reduced || window.OFF.has('drift')) ? 0 : 1) * 0.055;
      var x = A[i*3]   + (B[i*3]   - A[i*3])   * t;
      var y = A[i*3+1] + (B[i*3+1] - A[i*3+1]) * t;
      var z = A[i*3+2] + (B[i*3+2] - A[i*3+2]) * t;
      return {
        x: x + Math.sin(drawnTime * 0.7 + rand[i*3]   * 43.0) * e,
        y: y + Math.sin(drawnTime * 0.5 + rand[i*3+1] * 71.0) * e * 0.8,
        z: z + Math.cos(drawnTime * 0.6 + rand[i*3+2] * 57.0) * e
      };
    };
    window.SUBSTRATE = state;

    var mini = scope.querySelector('#hudMini');
    var mctx = mini ? mini.getContext('2d') : null;
    var frame = 0, raf = 0, t0 = performance.now(), last = t0, wasAsleep = false;

    function drawLayer(a, b, layer, bufs, cbuf, abuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
      gl.vertexAttribPointer(locC, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[a]);
      gl.vertexAttribPointer(locA, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b]);
      gl.vertexAttribPointer(locB, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
      gl.vertexAttribPointer(locR, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, abuf || ancBuf);
      gl.vertexAttribPointer(locN, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(U.uLayer, layer);
      gl.drawArrays(gl.POINTS, 0, N);
    }

    function draw(now) {
      raf = requestAnimationFrame(draw);
      var time = (now - t0) / 1000;
      var dt = Math.min((now - last) / 1000, 0.1); last = now;

      // the live point tracks the cursor and holds while the pointer is here
      havePointer += (wantPointer - havePointer) * Math.min(1, dt * 6);
      settle += (wantPointer - settle) *
                Math.min(1, dt * (wantPointer > settle ? SETTLE_IN : SETTLE_OUT));
      /* Park the cursor at the middle of the canvas rather than writing rev
         directly: everything downstream — the trail, the warp, the fringe —
         is derived from mx/my a few lines below, so setting the source is
         the only way the rig sees the same picture the visitor does. */
      if (FACE_RIG) {
        havePointer = 1; wantPointer = 1; settle = 1;
        mx = canvas.clientWidth * 0.5; my = canvas.clientHeight * 0.5;
      }
      rev[0] = (mx * dpr) / canvas.height;
      rev[1] = (canvas.height - my * dpr) / canvas.height;
      rev[2] = havePointer;
      // the trail decays
      for (var k = 1; k < REV; k++) {
        if (rev[k * 3 + 2] > 0) rev[k * 3 + 2] = Math.max(0, rev[k * 3 + 2] - dt * 1.5);
      }
      state.reveal = havePointer;

      /* ---- IT LOSES INTEREST ---------------------------------------------
         After six seconds of a still cursor the target stops being the
         cursor and becomes a slow wander. It is the one behaviour on the
         page that is not a response to the visitor, which is exactly why
         it reads as something with its own attention rather than a widget
         wired to the mouse. It snaps back the instant you move.

         Suppressed under prefers-reduced-motion: unprompted movement is
         precisely what that preference is asking us not to do. */
      var idleFor = (now - lastMove) / 1000;
      var tx = wantX, ty = wantY;
      if (idleFor > 6 && !window.DORMANT.reduced && !window.OFF.has('drift')) {
        var away = Math.min(1, (idleFor - 6) / 2.5);
        tx = wantX * (1 - away) + Math.sin(now * 0.00021) * 0.30 * away;
        ty = wantY * (1 - away) + Math.sin(now * 0.00013 + 1.7) * 0.10 * away;
      }
      /* Slower than anything else here, on purpose: the head is heavier
         than the cursor and has to ARRIVE AFTER it. That lag is the whole
         liveness cue — matched speeds read as a dial being turned. */
      lookX += (tx - lookX) * Math.min(1, dt * 2.6);
      lookY += (ty - lookY) * Math.min(1, dt * 2.6);
      /* THE MAXIMUM LIFE IN THE TRAIL. With no live stroke the reveal is 0
         everywhere, the inner cloud's alpha is `base * rv` = 0, and all
         40,960 of its fragments are discarded on the first alpha test. That
         is half the geometry on the page rendering nothing, and it is the
         state the page sits in whenever the cursor is still. */
      var live = havePointer;
      for (var lk = 1; lk < REV; lk++) if (rev[lk * 3 + 2] > live) live = rev[lk * 3 + 2];
      var fluidWorthDrawing = live > 0.004 && !window.OFF.has('fluid')
                                           && !window.OFF.has('reveal');

      var p = Math.max(0, Math.min(PHASES.length - 1 - 0.0001, state.progress));
      var a = Math.floor(p), b = Math.min(PHASES.length - 1, a + 1);
      var m = p - a;
      state.phase = a; state.morph = m;
      state.energy = ENERGY[a] + (ENERGY[b] - ENERGY[a]) * m;

      var D = window.DORMANT;
      D.offered++;
      /* NOTHING VISIBLE, NOTHING DRAWN. The clear still has to happen once
         on the way into dormancy or the last frame is left frozen on screen
         under a footer that may yet be scrolled back off. */
      if (D.asleep()) {
        if (!wasAsleep) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); wasAsleep = true; }
        return;
      }
      wasAsleep = false;
      D.drawn++;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);

      var aspect = canvas.width / Math.max(canvas.height, 1);
      gl.uniformMatrix4fv(U.uProj, false, persp(0.62, aspect, 0.1, 20));
      /* Camera pulled back so the subject sits in the middle third. The
         composition is mostly EMPTY on purpose. */
      gl.uniformMatrix4fv(U.uView, false, transl(0, -0.02, -3.35));
      /* ONE ANGLE, TWO CONSUMERS. uModel turns the subject; uSpin hands the
         same number to the vertex stage so the interior can give part of it
         back. Deriving it twice is how these drift apart. */
      /* Continuous idle motion is the thing prefers-reduced-motion is
         actually about, so it is switched off at the source rather than
         faded down: the shape stays, the wandering stops. */
      var stillness = (window.DORMANT.reduced || window.OFF.has('drift')) ? 0 : 1;

      /* THE SUBJECT DOES NOT TURN, AND THAT IS A DECISION.

         js/scroll.js still writes state.spin — phase position plus a slow
         unbounded idle drift — and this deliberately ignores it. For a long
         time it was ignored BY ACCIDENT: `var stillness` was declared below
         this line, `var` hoists the declaration and not the value, so the
         ternary that used to be here read undefined every frame and always
         took the zero branch. That was a bug. Switching it back on was a
         one-line change and it looked worse: the idle term never stops
         growing, so the subject revolves forever, and BACKEND in particular
         swings its fourteen plates edge-on and back on a loop that has
         nothing to do with anything the reader is doing.

         So it stays at zero on purpose now, which is not the same thing as
         staying at zero by mistake. Everything downstream is consistent
         with it — uSpin is the same number, so the interior's counter-turn
         is inert too, and state.project() reads drawnSpin, so the leader
         lines are aimed at the subject as DRAWN either way.

         To bring it back: `var spin = stillness ? state.spin : 0;`. Expect
         to want a bound on the idle term in js/scroll.js first. */
      var spin = 0;
      gl.uniformMatrix4fv(U.uModel, false, rotY(spin));
      gl.uniform1f(U.uSpin, spin);
      /* Kept for state.project() below, so a leader line is aimed at where
         the subject WAS DRAWN this frame rather than at where the scroll
         value says it should be. Reading state.spin there instead looks
         right until the drift or reduced-motion path disagrees with it. */
      drawnSpin = spin;
      drawnTime = time;                          // and see state.pinAt()

      gl.uniform1f(U.uMorph, m);
      gl.uniform1f(U.uSettle, settle);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uEnergy, state.energy * stillness);
      /* ~2px points. This was 165 for one build and the cloud rendered as a
         single opaque slab — at 40k points, size is the difference between a
         scan and a paint blob. */
      /* SMALLER, NOW THAT EACH DOT IS SOLID. Sharpening the sprite and
         raising the alpha made 6.2 read as clumps rather than as a field —
         neighbouring dots stopped overlapping translucently and started
         merging. Size is the dial for granularity; opacity is the dial for
         contrast. Turning the second one up means turning the first down. */
      gl.uniform1f(U.uScale, 5.0 * dpr);
      gl.uniform2f(U.uLook, lookX, lookY);
      /* Published by js/annot.js as [[x, y, z, strength], ...] in model
         space. Padded to eight because gl.uniform3fv wants the whole array
         and a short one leaves the previous frame's points lit. Strength is
         optional and defaults to 1, so an anchor list written without one
         behaves exactly as it used to. */
      var hot = state.hot || [], hv = new Float32Array(24), ha = new Float32Array(8);
      for (var hi = 0; hi < 8 && hi < hot.length; hi++) {
        hv[hi*3] = hot[hi][0]; hv[hi*3+1] = hot[hi][1]; hv[hi*3+2] = hot[hi][2];
        ha[hi] = hot[hi].length > 3 ? hot[hi][3] : 1;
      }
      gl.uniform3fv(U.uHot, hv);
      gl.uniform1fv(U.uHotA, ha);
      gl.uniform1f(U.uHotN, Math.min(8, hot.length));
      gl.uniform1f(U.uHotR, 0.115);
      drawnLookX = lookX; drawnLookY = lookY;   // see makeProject()
      gl.uniform3f(U.uInk, 1.00, 1.00, 1.00);   // white on the dark ground
      gl.uniform3f(U.uInkDark, 0.03, 0.03, 0.03);  // black on the paper
      gl.uniform1f(U.uTear, window.OFF.has('tear') ? 0 : (state.tear || 0));
      gl.uniform1f(U.uTearRed, window.OFF.has('tear') ? 0 : (state.tearRed || 0));
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform3fv(U.uRev, window.OFF.has('reveal') ? new Float32Array(REV * 3) : rev);
      var REV_R = FACE_RIG ? 4.0 : 0.170;
      gl.uniform1f(U.uRevRadius, REV_R);
      /* THE OPENING, IN CSS PIXELS, for anything drawing in the DOM above
         this canvas. revealAt() normalises by HEIGHT — uv = gl_FragCoord.xy
         / uRes.y — so the radius is a fraction of the canvas height and the
         centre is simply the cursor. js/annot.js masks its leader lines
         with this so a line does not run across the hole it opened. */
      state.revealPx = {
        x: mx, y: my,
        r: REV_R * canvas.clientHeight,
        on: havePointer
      };
      gl.uniform1f(U.uRevSoft, 0.50);
      gl.uniform1f(U.uRevWarp, 0.34);
      gl.uniform1f(U.uRevWarpScale, 3.4);
      gl.uniform1f(U.uRevWarpSpeed, 0.22);
      gl.uniform1f(U.uRevGlow, 0.45);

      /* FLUID FIRST, SHELL OVER IT. The fluid is clipped to the opening by
         its own alpha, so it can never show through the intact shell; drawing
         it underneath means the shell's edge fringe lands on top of it, which
         is where the fringe belongs. */
      if (fluidWorthDrawing) drawLayer(0, 1, -1.0, fluidBuf, uColBuf, faceAncBuf);
      if (!window.OFF.has('shell')) drawLayer(a, b, 1.0, shellBuf, colBuf);

      /* The minimap is the SAME pixels, scaled — never a second render. Every
         fourth frame is indistinguishable at 150px. */
      if (mctx && !window.OFF.has('minimap') && (frame++ & 3) === 0) {
        mctx.clearRect(0, 0, mini.width, mini.height);
        mctx.globalAlpha = 0.9;
        try { mctx.drawImage(canvas, 0, 0, mini.width, mini.height); } catch (e) {}
      }
    }
    raf = requestAnimationFrame(draw);

    return function teardown() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  });

  window.SUBSTRATE_PHASES = PHASES;
})();
