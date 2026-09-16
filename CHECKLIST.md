# Pre-deploy checklist

Tick top to bottom. Ordered so the expensive mistakes are caught before the
cheap ones. Setup detail lives in [DEPLOY.md](DEPLOY.md); this is the list.

```bash
python tools/check.py     # must exit 0 before anything below
```

---

## 1 · Decisions to make before the repo is public

- [ ] **Your email is in the page twice**, in plaintext: a `mailto:` in the
      footer and `data-copy-email` on the bar button. Scrapers will find it.
      That is the price of being contactable and is usually worth paying —
      but decide it, don't discover it. Alternatives: a contact form
      (needs a backend), or an address you can abandon.
- [x] **`assets/ref/face.jpg` is a cartoon, not a photograph of anyone.**
      Settled — it carries no personal likeness, so it is not a reason to
      keep the repo private and it can sit in public commit history. (The
      general rule still holds for anything you add later: git history is
      forever, and deleting a file does not remove it from it.)
- [ ] **Nothing else personal in `assets/options/`** — 2.3 MB of old renders.
      Already gitignored; confirm that's still true.
- [ ] Read your own copy once as a stranger. The site says
      `SCROLL TO CHANGE ITS STATE` on mobile where the object does not yet
      change state, and three cards say `PROJECT NAME`.

## 2 · Content and code

- [ ] `python tools/make-og.py` — regenerate assets if the wizard changed.
- [ ] `python tools/check.py` — exits 0.
- [ ] Swap `https://sillywizard.dev` for your real domain in **`index.html`
      (4 places), `robots.txt`, `sitemap.xml`**. `check.py` warns while it's
      still the placeholder.
- [ ] Open the site at **1280×660, 1440×900 and 1920×1080**, and on a **real
      phone** — not the device emulator. Emulators don't reproduce Safari's
      collapsing URL bar.
- [ ] Console clean on both builds.

## 3 · Git and GitHub

- [ ] `git init -b main`, commit, push to an **empty** repo (no README or
      .gitignore on GitHub's side — they conflict with what you committed).
- [ ] `.gitattributes` is committed. Without it, the first commit from a
      Linux build agent rewrites every line ending and the diff is useless.
- [ ] **Enable 2FA on GitHub.** Your site deploys from this account; someone
      in it can redirect your domain to anything.
- [ ] Repo → Settings → check **Danger Zone** visibility is what you meant.
- [ ] If public: Settings → Code security → enable **secret scanning** and
      **push protection**. Free on public repos, and it stops the day you
      paste a key into a commit.
- [ ] Branch protection on `main` is *optional* for a solo repo and mostly
      ceremony. Skip it unless someone else commits.
- [ ] `git log` has no commit with a secret in it. If it does, rotating the
      secret is the fix — rewriting history is not, because forks and caches
      keep the old objects.

## 4 · Buying the domain

- [ ] Buy from **Cloudflare Registrar** (at-cost, no renewal markup),
      Porkbun, or Namecheap. Avoid registrars whose first year is $1 and
      whose second is $40.
- [ ] **`.dev` is HSTS-preloaded.** Browsers refuse plain `http://` on it
      entirely — there is no insecure fallback to misconfigure. Good, but it
      means a broken certificate shows a hard error rather than a warning.
- [ ] **Turn auto-renew ON.** An expired domain takes the site, the email and
      the search ranking with it, and it can be bought by someone else.
- [ ] **Registrar lock / transfer lock ON.**
- [ ] **WHOIS privacy ON** — otherwise your home address and phone number are
      in a public database. Free at all three registrars above.
- [ ] **2FA on the registrar account.** This is the single highest-value
      security setting in this document: domain control is how everything
      else gets taken.
- [ ] Registrar account email is one you will still read in three years, and
      is **not** an address at the domain you just bought. If the domain
      lapses you lose the recovery mailbox too.

## 5 · DNS and HTTPS

- [ ] Lower the TTL to 300s **before** pointing records anywhere, then raise
      it afterwards. Saves hours if you get a record wrong.
- [ ] Apex (`@`) and `www` both resolve.
- [ ] **Pick ONE canonical host** and 301 the other to it. Serving the site
      at both apex and `www` without a redirect splits your search ranking
      and makes the `<link rel="canonical">` tag disagree with reality.
- [ ] HTTPS works on both, and `http://` **redirects** to it.
- [ ] On Cloudflare: SSL/TLS mode must be **Full (strict)**. Setting it to
      Flexible with a host that already serves HTTPS gives an infinite
      redirect loop — `ERR_TOO_MANY_REDIRECTS` — and it is the single most
      common Cloudflare misconfiguration.
- [ ] Enable **Always Use HTTPS** and **HSTS** (start `max-age` short, raise
      it once you're sure; HSTS is hard to undo because browsers cache it).
- [ ] Add a **CAA record** so only your CA can issue certificates for the
      domain: `0 issue "letsencrypt.org"` (or `pki.goog` / `digicert.com`
      depending on the host). One record, stops a whole class of attack.
- [ ] **Even if you never use email on this domain**, publish records that
      stop anyone spoofing it:
      - `TXT @` → `v=spf1 -all`
      - `TXT _dmarc` → `v=DMARC1; p=reject; rua=mailto:you@example.com`

      Without these, anyone can send mail *as* your domain, and a portfolio
      domain is a plausible thing to spoof.
- [ ] If you *do* add email later: MX, then SPF/DKIM/DMARC properly, and test
      at mail-tester.com before trusting it.

## 6 · Headers

`_headers` (Cloudflare Pages / Netlify) and `vercel.json` are committed and
carry these. Confirm they took effect with
`curl -sSI https://YOURDOMAIN.com | sort`:

- [ ] `strict-transport-security`
- [ ] `x-content-type-options: nosniff`
- [ ] `referrer-policy: strict-origin-when-cross-origin`
- [ ] `content-security-policy` present
- [ ] `cache-control: public, max-age=31536000, immutable` on `/assets/*`
- [ ] `cache-control: ...must-revalidate` on `/css/*` and `/js/*`

The CSP allows `'unsafe-inline'` for scripts, because the build switch and
the script loader are inline in `<head>` by design — moving them to files
reintroduces the pre-paint flash they exist to prevent. On a static site with
no user input and no backend there is no injection path to exploit, so the
CSP here is defence-in-depth against a compromised host rather than a control
doing daily work. Say so honestly rather than pretending otherwise.

## 7 · After it's live

- [ ] Share card renders: [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
      and [opengraph.xyz](https://www.opengraph.xyz). **Do this before you
      post anywhere** — LinkedIn caches aggressively and you'll stare at the
      old card for days.
- [ ] `https://YOURDOMAIN.com/404` shows the custom 404, not the host's.
- [ ] `robots.txt` and `sitemap.xml` load and name the right domain.
- [ ] Submit to [Google Search Console](https://search.google.com/search-console)
      — verify by DNS TXT, which survives changing host.
- [ ] Lighthouse on mobile. Expect the 2 MB `face.jpg` to dominate desktop.
- [ ] Test with JavaScript disabled. The copy should still be readable; if
      the page is blank, that's worth knowing before a recruiter's locked-down
      browser finds out for you.

## 8 · Problems you will actually hit

| Symptom | Cause |
|---|---|
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL mode is Flexible. Set Full (strict). |
| Registrar rejects `CNAME` on `@` | Illegal in plain DNS. Use ALIAS / CNAME-flattening, or move nameservers to Cloudflare. |
| Blank preview on LinkedIn | `og:image` relative, wrong domain, or cached. Must be absolute. |
| Site works, `www` doesn't (or vice versa) | Only one record added, or no redirect between them. |
| Certificate error for an hour after setup | Normal. Wait before debugging. |
| DNS change "not working" | TTL. Check with `dig @1.1.1.1 YOURDOMAIN.com`, not your browser — browsers and OSes cache separately. |
| Old CSS after deploy | Expected for `assets/*` (immutable, one year). Never for `css/`|`js/`. If those are stale, the headers didn't apply. |
| Desktop fine, phone shows no wizard | Desktop CSS over the mobile runtime — the breakpoint disagreed somewhere. `check.py` guards the script half of this. |
| Phone bar missing | `hud.js` dropped from the phone's script list; it registers `chrome`. `check.py` fails on this. |
| Site vanishes in a year | Domain auto-renew was off. |
