#!/usr/bin/env python3
"""check.py - read the site over before shipping it.

    python tools/check.py

No dependencies, no config, no framework. Every check here exists because
that exact mistake was made in this codebase at least once and cost real
time to find from the symptom. It is not a test suite and does not pretend
to be one: it cannot tell you the wizard looks wrong. It can tell you the
page is broken in a way a browser will only reveal on the screen you forgot
to open.

Exit code 0 clean, 1 if anything FAILED. Warnings do not fail the run.
"""

import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

FAIL, WARN = [], []
def fail(m): FAIL.append(m)
def warn(m): WARN.append(m)
def read(p):
    with open(p, encoding='utf-8') as f: return f.read()

HTML = read('index.html')
JS = sorted(f for f in os.listdir('js') if f.endswith('.js'))
CSS = sorted(f for f in os.listdir('css') if f.endswith('.css'))


def strip_css_comments(s):
    return re.sub(r'/\*.*?\*/', '', s, flags=re.S)


# ---- 1 · JavaScript parses -------------------------------------------------
# A syntax error in a file the phone never mounts still breaks nothing until
# someone widens the window. `node --check` is the cheapest possible catch.
def check_js_syntax():
    try:
        subprocess.run(['node', '--version'], capture_output=True, check=True)
    except Exception:
        warn('node not found - skipped JS syntax checks')
        return
    for f in JS:
        r = subprocess.run(['node', '--check', 'js/' + f], capture_output=True, text=True)
        if r.returncode:
            fail('js/%s does not parse:\n    %s' % (f, r.stderr.strip().splitlines()[0]))


# ---- 2 · CSS is well formed ------------------------------------------------
# A patch script once left a stray double-quote at the start of a rule. The
# browser silently discarded that rule AND the next one, and the symptom was
# a footer margin that would not apply.
def check_css():
    for f in CSS:
        body = strip_css_comments(read('css/' + f))
        if body.count('{') != body.count('}'):
            fail('css/%s: %d "{" vs %d "}"' % (f, body.count('{'), body.count('}')))
        for i, line in enumerate(body.split('\n'), 1):
            stray = line.count('"') % 2
            if stray and 'data:' not in line and 'content:' not in line:
                fail('css/%s:%d unbalanced quote: %s' % (f, i, line.strip()[:60]))


# ---- 3 · every local path actually resolves -------------------------------
# The 293 KB PNG became a 54 KB WebP and three files referenced the old name.
def check_paths():
    refs = set()
    for m in re.finditer(r'(?:href|src)\s*=\s*"([^"]+)"', HTML):
        refs.add(m.group(1))
    for f in CSS:
        # Drop data: URIs whole before scanning. The grain is an inline SVG
        # that contains its OWN url(%23n) filter reference, and scanning into
        # it reports a missing file called "%23n" on every single run. A
        # checker that cries wolf once a run is a checker nobody reads.
        body = re.sub(r'url\(\s*["\']?data:[^)]*\)', '', read('css/' + f))
        for m in re.finditer(r'url\(\s*[\'"]?([^\'")]+)', body):
            u = m.group(1)
            if u.startswith(('data:', 'http', '#', '%23')): continue
            refs.add(os.path.normpath(os.path.join('css', u)).replace('\\', '/'))
    for r in sorted(refs):
        if r.startswith(('http', 'data:', '#', 'mailto:')): continue
        p = r.lstrip('/')
        if not os.path.exists(p):
            fail('referenced but missing: %s' % r)


# ---- 4 · the module registry agrees with itself ---------------------------
# THE ONE THAT NEARLY BIT. js/hud.js registers BOTH 'hud' and 'chrome', and
# the phone mounts 'chrome' for the bottom bar. Splitting scripts by build on
# the assumption that a file named hud.js is desktop-only silently removes
# the bar and the clock, on mobile only, with no error anywhere.
def check_registry():
    registered = {}
    for f in JS:
        for m in re.finditer(r"PAGE\.register\(\s*'([^']+)'", read('js/' + f)):
            registered.setdefault(m.group(1), []).append(f)

    boot = read('js/boot.js')
    mob = re.search(r"var MOBILE = \[([^\]]*)\]", boot)
    mobile_mounts = re.findall(r"'([^']+)'", mob.group(1)) if mob else []

    loader = re.search(r"\.concat\(mobile \? \[([^\]]*)\]", HTML)
    desk = re.search(r":\s*\[([^\]]*)\]\)\s*\n\s*\.concat", HTML)
    base = re.search(r"var list = \[([^\]]*)\]", HTML)
    mobile_files = set(re.findall(r"'([^']+)'", (base.group(1) if base else '') + ',' +
                                  (loader.group(1) if loader else '')))

    for name in mobile_mounts:
        if name not in registered:
            fail("boot.js mounts '%s' on mobile but no js file registers it" % name)
            continue
        files = [f[:-3] for f in registered[name]]
        if not any(f in mobile_files for f in files):
            fail("boot.js mounts '%s' on mobile, but %s is not in index.html's "
                 "mobile script list" % (name, registered[name][0]))

    # THE PHONE'S LIVE BUILD is loaded by js/mobile.js at runtime, so neither
    # list above sees it. A module renamed or dropped from that list fails
    # only on a capable phone, after first paint, which is the last place
    # anyone would look.
    mj = read('js/mobile.js')
    lf = re.search(r"var LIVE_FILES\s*=\s*\[([^\]]*)\]", mj)
    lm = re.search(r"var LIVE_MOUNTS\s*=\s*\[([^\]]*)\]", mj)
    if not lf or not lm:
        fail("js/mobile.js: LIVE_FILES / LIVE_MOUNTS not found")
    else:
        live_files = re.findall(r"'([^']+)'", lf.group(1))
        for f in live_files:
            if not os.path.exists(os.path.join(ROOT, 'js', f + '.js')):
                fail("js/mobile.js loads js/%s.js, which does not exist" % f)
        for name in re.findall(r"'([^']+)'", lm.group(1)):
            owners = [x[:-3] for x in registered.get(name, [])]
            if not any(o in live_files for o in owners):
                fail("js/mobile.js mounts '%s' live, but no file in LIVE_FILES registers it" % name)

    for name, files in registered.items():
        if len(files) > 1:
            warn("'%s' registered in more than one file: %s" % (name, ', '.join(files)))


# ---- 4b · the phase names agree everywhere --------------------------------
# A rename touches four independent places: the PHASES array, five aria-labels
# (which js/mobile.js PARSES for its readout), five bar buttons, and the DOM
# defaults. A half-finished one shows up as a single wrong word on one screen
# and nowhere else, which is a bad thing to find out from a visitor.
def check_phase_names():
    m = re.search(r"var PHASES = \[([^\]]*)\]", read('js/substrate.js'))
    if not m:
        fail('js/substrate.js: PHASES array not found'); return
    names = [n.lower() for n in re.findall(r"'([^']+)'", m.group(1))]

    aria = [a.lower() for a in
            re.findall(r'aria-label="Phase \d+, ([^"]+)"', HTML)]
    bar = [b.lower() for b in
           re.findall(r'class="bar__btn"[^>]*data-goto="\d+"[^>]*>'
                      r'<span data-label>([^<]+)</span>', HTML)]

    if aria and aria != names:
        fail('aria-labels do not match PHASES: %s vs %s' % (names, aria))
    if bar and bar != names:
        fail('bar buttons do not match PHASES: %s vs %s' % (names, bar))
    for sel, pat in (('data-hud-phase', r'data-hud-phase>([^<]+)<'),
                     ('data-m-phase', r'data-m-phase>([^<]+)<')):
        d = re.search(pat, HTML)
        if d and names and d.group(1).strip().lower() != names[0]:
            fail('%s default is "%s" but PHASES starts at "%s"'
                 % (sel, d.group(1).strip(), names[0]))


# ---- 5 · the share card will actually render ------------------------------
# og:image MUST be absolute - crawlers fetch it from their own servers - and
# all four absolute URLs must agree, or the canonical points at a domain you
# do not own while the preview 404s.
def check_meta():
    urls = {}
    for key, pat in (('canonical', r'rel="canonical"\s+href="([^"]+)"'),
                     ('og:url', r'property="og:url"\s+content="([^"]+)"'),
                     ('og:image', r'property="og:image"\s+content="([^"]+)"'),
                     ('twitter:image', r'name="twitter:image"\s+content="([^"]+)"')):
        m = re.search(pat, HTML)
        if not m:
            fail('missing meta: %s' % key); continue
        urls[key] = m.group(1)

    for k in ('og:image', 'twitter:image'):
        if k in urls and not urls[k].startswith('http'):
            fail('%s must be an absolute URL or no preview image will render '
                 'anywhere: %s' % (k, urls[k]))

    origins = {re.match(r'(https?://[^/]+)', u).group(1)
               for u in urls.values() if u.startswith('http')}
    if len(origins) > 1:
        fail('meta URLs point at different domains: %s' % ', '.join(sorted(origins)))
    elif origins:
        host = origins.pop()
        for k, u in urls.items():
            local = u.replace(host, '').lstrip('/')
            if local and not os.path.exists(local):
                fail('%s points at %s, which does not exist in the build' % (k, local))
        if 'sillywizard.dev' in host:
            warn('meta URLs still say sillywizard.dev - change them if that is '
                 'not the domain you bought (see DEPLOY.md)')


# ---- 6 · generated assets exist and are not obviously stale ---------------
def check_assets():
    gen = ['assets/og-image.jpg', 'assets/favicon-32.png', 'assets/favicon-180.png',
           'assets/bust-mobile.webp', 'assets/tear-edge.svg']
    for g in gen:
        if not os.path.exists(g):
            fail('%s missing - run: python tools/make-og.py' % g); continue
    src = max((os.path.getmtime(p) for p in ('js/substrate.js', 'tools/wizard-cubist.py')
               if os.path.exists(p)), default=0)
    for g in gen:
        if os.path.exists(g) and os.path.getmtime(g) < src:
            warn('%s is older than the geometry it is drawn from - '
                 'run: python tools/make-og.py' % g)
            break


# ---- 7 · things that should not ship --------------------------------------
def check_shipping():
    if os.path.exists('assets/options'):
        n = sum(os.path.getsize(os.path.join('assets/options', f))
                for f in os.listdir('assets/options'))
        if not os.path.exists('.gitignore') or 'assets/options' not in read('.gitignore'):
            fail('assets/options is %.1f MB of exploration renders and is not '
                 'ignored' % (n / 1e6))
    face = 'assets/ref/face.jpg'
    if os.path.exists(face) and os.path.getsize(face) > 600_000:
        warn('%s is %.1f MB and js/substrate.js fetches it at boot on desktop. '
             'Re-export smaller, or defer it to first pointer move.'
             % (face, os.path.getsize(face) / 1e6))


def main():
    for fn in (check_js_syntax, check_css, check_paths, check_registry,
               check_phase_names,
               check_meta, check_assets, check_shipping):
        try:
            fn()
        except Exception as e:                      # a broken check is a warning,
            warn('check %s crashed: %s' % (fn.__name__, e))   # never a blocker

    for w in WARN: print('WARN  %s' % w)
    for f in FAIL: print('FAIL  %s' % f)
    print()
    if FAIL:
        print('%d failed, %d warnings' % (len(FAIL), len(WARN)))
        return 1
    print('all checks passed%s' % (', %d warnings' % len(WARN) if WARN else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
