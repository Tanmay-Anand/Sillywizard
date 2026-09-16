/* ==========================================================================
   tearfn.js — the torn boundary, in one place.

   TWO SHADERS AND ONE DOM MASK HAVE TO AGREE ABOUT WHERE THE EDGE IS.
   js/tear.js paints the light and red grounds up to it; js/substrate.js
   flips its points from light-on-dark to dark-on-light across it; and
   js/scroll.js clips the footer to it, so the ending's type is uncovered by
   the red rather than fading in after it. If those carried their own copies
   of the function they would drift the first time any of them was tuned, and
   the symptom is the ugliest possible one: a band of white points on white
   ground along the tear, or a heading standing on pale paper.

   This is the reference's js/dissolve-look.js idea — the numbers that decide
   how an edge LOOKS kept in one file, read by everything that draws it.

   WHY THE NOISE IS ADDED BEFORE THE THRESHOLD
   The whole character of the edge is in that ordering. Threshold the sweep
   first and roughen the result afterwards and you get a wiggly line — the
   boundary stays connected, because roughening cannot move a pixel from one
   side to the other. Add multi-octave noise to the signed distance BEFORE
   the comparison and patches near the boundary are carried across zero
   bodily: they come away as detached shards, and islands of the old ground
   survive inside the new one. Same two operations, opposite results.

   WHY THE HASH LOOKS LIKE ARITHMETIC HOMEWORK
   It used to be the usual `fract(sin(dot(p, k)) * 43758.5453)`. That is fine
   while only the GPU evaluates it. It stops being fine the moment JavaScript
   has to compute the SAME boundary, because the GPU works in float32 and JS
   in float64: sin() of ~6700 radians differs between them in the third
   decimal, fract() of a large product amplifies that to nothing in common,
   and the two then agree on no pixel anywhere.

   The hash below is built so both languages get identical answers. Every
   intermediate is a non-negative integer below 2^24, which float32 stores
   exactly, and every division inside mod() has a quotient far enough from a
   whole number that neither precision can round it across one. Cubing mod
   1013 is the non-linear step: 1012 is not divisible by 3, so x -> x^3 is a
   bijection there and nothing collapses the range the way squaring would.
   ========================================================================== */

/* One modulus, spelled out in both languages below. */
var TEAR_M = 1013;

window.TEAR_GLSL = [
  'float hashT(vec2 i){',
  '  float n = mod(i.x * 311.0 + i.y * 127.0, 1013.0);',
  '  n = mod(mod(n * n, 1013.0) * n + 41.0, 1013.0);',
  '  n = mod(mod(n * n, 1013.0) * n + 17.0, 1013.0);',
  '  return n / 1013.0;',
  '}',
  'float vnT(vec2 p){',
  '  vec2 i = floor(p), f = fract(p);',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hashT(i), hashT(i + vec2(1,0)), u.x),',
  '             mix(hashT(i + vec2(0,1)), hashT(i + vec2(1,1)), u.x), u.y);',
  '}',
  /* Four octaves. Two gives a soft wobble with no shards; six costs fill
     rate for detail below one pixel at this scale. */
  'float fbmT(vec2 p){',
  '  float a = 0.5, s = 0.0;',
  '  for (int i = 0; i < 4; i++){ s += a * vnT(p); p *= 2.03; a *= 0.5; }',
  '  return s;',
  '}',
  '',
  /* uv is in 0..1 of the VIEWPORT (both axes), prog is 0 dark .. 1 light.
     Returns 1 where the light ground has taken over. */
  /* `seed` shifts the noise field. The page tears TWICE — dark to light
     between phases 03 and 04, then light to red into the footer — and with
     one seed both boundaries came away with an identical silhouette, which
     reads as the same shape happening again rather than as the material
     failing a second time. */
  'float tearAt(vec2 uv, float prog, float seed){',
  '  if (prog <= 0.0) return 0.0;',
  '  if (prog >= 1.0) return 1.0;',
  /* The boundary starts below the frame and ends above it, so the sweep is
     complete at both ends and no shard is left stranded on screen. */
  '  float b = mix(-0.34, 1.34, prog);',
  '  float d = b - uv.y;',
  '  d += (fbmT(uv * 3.4 + vec2(seed, prog * 0.6)) - 0.5) * 0.30;',
  /* A very tight smoothstep: hard enough to read as torn paper, soft enough
     not to crawl with aliasing as the edge moves. */
  '  return smoothstep(-0.005, 0.005, d);',
  '}'
].join('\n');

/* The light ground, shared by tear.js and substrate.js so the paper and the
   points that sit on it are lit by the same value. */
window.TEAR_LIGHT = [0.945, 0.945, 0.937];
/* --ui-red, in linear 0..1. The footer's ground. */
window.TEAR_RED = [0.910, 0.153, 0.110];

/* ==========================================================================
   THE SAME FUNCTION, IN JAVASCRIPT.

   Not a convenience. js/scroll.js has to clip the footer to the red edge and
   a CSS mask cannot evaluate a fragment shader, so the boundary has to exist
   as numbers on the CPU as well. What follows is a line-for-line
   transliteration of the strings above — change one, change the other. The
   shared modulus at the top is there so at least that number cannot drift.
   ========================================================================== */
function tmod(x, y) { return x - y * Math.floor(x / y); }   // GLSL mod()

function hashT(ix, iy) {
  var n = tmod(ix * 311 + iy * 127, TEAR_M);
  n = tmod(tmod(n * n, TEAR_M) * n + 41, TEAR_M);
  n = tmod(tmod(n * n, TEAR_M) * n + 17, TEAR_M);
  return n / TEAR_M;
}

function vnT(px, py) {
  var ix = Math.floor(px), iy = Math.floor(py);
  var fx = px - ix, fy = py - iy;
  var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  var a = hashT(ix, iy),     b = hashT(ix + 1, iy);
  var c = hashT(ix, iy + 1), d = hashT(ix + 1, iy + 1);
  var lo = a + (b - a) * ux, hi = c + (d - c) * ux;
  return lo + (hi - lo) * uy;
}

function fbmT(px, py) {
  var a = 0.5, s = 0;
  for (var i = 0; i < 4; i++) {
    s += a * vnT(px, py); px *= 2.03; py *= 2.03; a *= 0.5;
  }
  return s;
}

/* The signed distance the shader thresholds: positive where the new ground
   has taken over. */
function sdT(x, y, prog, seed) {
  var b = -0.34 + 1.68 * prog;
  return b - y + (fbmT(x * 3.4 + seed, y * 3.4 + prog * 0.6) - 0.5) * 0.30;
}

var TEAR_AMP = 0.15;    // half the 0.30 the shader adds — the edge's whole reach
var TEAR_STEP = 0.006;  // finer than the smallest feature the fourth octave makes

/* THE HIGHEST LINE UNDER WHICH A COLUMN IS UNBROKEN NEW GROUND.

   Deliberately NOT the topmost edge in the column. The noise is added before
   the threshold, so the boundary overhangs and throws detached shards ahead
   of itself; "the top of the red" would often be the top of a floating shard
   with pale paper still underneath it, and type clipped to that stands on
   the paper again — the exact overflow this whole mechanism exists to stop.

   Marching UP from below the noise's reach and stopping at the first sample
   that is not covered answers the question that actually matters: how far up
   is this column CONTINUOUSLY red. Everything below the answer is ground.

   Marching rather than solving because the boundary is not a function of x.
   A fixed-point iteration on y is the obvious cheap approach and it does not
   converge here: the slope of the noise in y reaches about three, which is
   the same fact as the overhangs. */
window.TEAR_EDGE = function (x, prog, seed) {
  var b = -0.34 + 1.68 * prog;
  if (b - TEAR_AMP > 1) return b - TEAR_AMP;   // whole screen already covered
  var top = b + TEAR_AMP;
  if (top < 0) return top;                     // not on screen yet
  for (var y = Math.max(b - TEAR_AMP, 0); y < top; y += TEAR_STEP) {
    if (sdT(x, y, prog, seed) < 0) return y;
  }
  return top;
};
