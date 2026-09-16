/* ==========================================================================
   tear.js — the ground turning from dark to light, on scroll.

   ONE FULL-SCREEN QUAD, raw WebGL. There is no scene, no camera and no mesh
   here, so three.js would add a dependency and nothing else.

   WHY A SHADER AND NOT A CSS CLIP-PATH. A clip-path can do a wavy edge, and
   for a while that is a convincing imitation. What it cannot do is drop
   SHARDS — detached islands of the incoming ground ahead of the boundary,
   and islands of the outgoing one behind it. That needs the noise added to
   the distance before the threshold (see js/tearfn.js), which is a
   per-pixel decision and therefore a fragment shader.

   IT SITS UNDER THE SUBSTRATE, not over it: this is the GROUND. The points
   are on the paper, so they have to paint after it. js/substrate.js reads
   the same tearAt() and flips its ink where this has taken over.
   ========================================================================== */
window.PAGE.register('tear', function (scope) {
  'use strict';

  var canvas = scope.querySelector('#tear');
  if (!canvas) return;

  var gl = canvas.getContext('webgl', { alpha: true, antialias: false });
  if (!gl) return;

  var VERT = [
    'attribute vec2 aP;',
    'void main(){ gl_Position = vec4(aP, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uProg, uSeed;',
    'uniform vec3 uLight;',
    window.TEAR_GLSL,
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float t = tearAt(uv, uProg, uSeed);',
    '  if (t <= 0.001) discard;',
    /* A hairline of grain along the cut, so the join has a crust instead of
       being a clean edge. Cheap: it reuses the noise the boundary already
       needed. */
    '  float crust = vnT(uv * 220.0) * 0.05 - 0.025;',
    '  gl_FragColor = vec4(uLight + crust, t);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('[tear] shader:', gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    console.error('[tear] link:', gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uProg = gl.getUniformLocation(prog, 'uProg');
  var uLight = gl.getUniformLocation(prog, 'uLight');
  var uSeed  = gl.getUniformLocation(prog, 'uSeed');

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  var raf = 0, lastProg = -1;
  function draw() {
    raf = requestAnimationFrame(draw);
    /* `hidden`, NOT `asleep()`. This layer used to sleep on `covered` as
       well, which was correct while the footer painted its own opaque
       background — it was genuinely behind something. It is not any more:
       since the footer went transparent THIS CANVAS IS the red ground, so
       sleeping on `covered` put the thing doing the covering to sleep.

       The symptom was vicious. With preserveDrawingBuffer false the browser
       wipes the drawing buffer after compositing, so the last frame stayed
       on screen looking correct while the canvas underneath was empty —
       readPixels said 0,0,0,0 over a screen that was plainly red. Any
       repaint would have dropped the ending to white.

       Nothing is wasted by staying awake: at prog >= 1 tearAt() returns
       before it touches the noise, so a covered frame is a flat fill. */
    if (window.DORMANT.hidden) return;
    var p = window.OFF.has('tear') ? 0
          : ((window.SUBSTRATE && window.SUBSTRATE.tear) || 0);
    /* SKIP ONLY WHEN THERE IS NOTHING TO SHOW, and only then.

       The first version of this also skipped at p >= 1, on the reasoning
       that a finished tear is a static image. It is not: this context has
       preserveDrawingBuffer FALSE (the default), so the browser wipes the
       drawing buffer after every composite. Not re-drawing a "static" frame
       therefore shows nothing at all — the ground silently failed to turn
       light for the whole back half of the page, while the points correctly
       flipped to dark and went invisible against the dark ground.

       Skipping at p <= 0 is safe for exactly the same reason: the automatic
       wipe is already the picture we want there. */
    var red = window.OFF.has('tear') ? 0
            : ((window.SUBSTRATE && window.SUBSTRATE.tearRed) || 0);

    if (p <= 0 && red <= 0 && lastProg <= 0) return;
    lastProg = p + red;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (p <= 0 && red <= 0) return;
    gl.useProgram(prog);
    gl.uniform2f(uRes, canvas.width, canvas.height);

    /* TWO GROUNDS, ONE QUAD, DRAWN IN ORDER. The light paper arrives first
       and the red arrives over it — the same operation twice rather than a
       special case for the ending, which is the whole point: the footer is
       not a different website, it is the material failing one more time. */
    if (p > 0) {
      gl.uniform1f(uProg, p);
      gl.uniform1f(uSeed, 0.0);
      gl.uniform3fv(uLight, window.TEAR_LIGHT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (red > 0) {
      gl.uniform1f(uProg, red);
      gl.uniform1f(uSeed, 37.0);
      gl.uniform3fv(uLight, window.TEAR_RED);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  raf = requestAnimationFrame(draw);

  return function () {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
});
