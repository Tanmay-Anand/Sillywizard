#!/usr/bin/env python3
"""stamp-assets.py - fingerprint every capture and project mark in index.html.

    python tools/stamp-assets.py

Run it after replacing any file in assets/shots/ or assets/marks/.
tools/check.py fails if you forget.

WHY. _headers serves /assets/* with `max-age=31536000, immutable`, which tells
every browser to keep a file for a year and never ask about it again. That is
right for generated art that never changes, and wrong for a capture that gets
re-taken under the same name: after Redkeep's redesign, a visitor who had seen
the old dashboard kept seeing it - the page was new and its picture was stale,
because nothing about the URL had changed.

So each reference carries ?v= and the first 10 hex of the file's SHA-256. New
content is a new URL, which no browser or CDN can answer from cache, and the
year-long cache stays exactly as good for everything that has not changed.
Re-running this on an unchanged tree changes nothing.
"""
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
# A capture or mark reference, with or without a stamp already on it.
REF = re.compile(r'(src=")(assets/(?:shots|marks)/[^"?]+)(?:\?v=[0-9a-f]*)?(")')


def digest(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def stamp(html):
    """Returns the stamped page and the number of references it touched."""
    seen = []

    def one(m):
        seen.append(m.group(2))
        return '%s%s?v=%s%s' % (m.group(1), m.group(2), digest(m.group(2)), m.group(3))

    return REF.sub(one, html), len(seen)


def main():
    html = io.open(INDEX, encoding='utf-8').read()
    out, n = stamp(html)
    if out != html:
        io.open(INDEX, 'w', encoding='utf-8', newline='\n').write(out)
        print('stamped %d references' % n)
    else:
        print('%d references, all current' % n)
    return 0


if __name__ == '__main__':
    sys.exit(main())
