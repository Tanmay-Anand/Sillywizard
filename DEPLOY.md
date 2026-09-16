# Deploying SILLYWIZARD

Static site, no build step, no server. Every host below is free for this.

**The hosting is free. The domain is not.** Nobody gives away a good custom
domain any more — Freenom is dead and the "free domain" offers left are
subdomains of somebody else's name. Budget about **$10–15/year** at Cloudflare
Registrar (sells at cost, no markup, no first-year bait pricing), Porkbun, or
Namecheap. `.dev` runs ~$12/yr and forces HTTPS, which suits this site.

---

## 0 · Before you deploy anything

### Regenerate the assets

`assets/` is generated, not authored. If the wizard has been tuned since the
last run, the share card and the phone backdrop are stale:

```bash
python tools/make-og.py
```

Writes `og-image.jpg`, `favicon-32.png`, `favicon-180.png`,
`bust-mobile.webp`, `tear-edge.svg`.

### Fix the hardcoded domain — this one WILL bite you

`index.html` has `https://sillywizard.dev/` baked into four places:

| Line | Tag | Breaks if wrong |
|---|---|---|
| 10 | `<link rel="canonical">` | Google indexes the other domain instead of yours |
| 24 | `og:url` | — |
| 25 | `og:image` | **No preview image on LinkedIn, WhatsApp, iMessage, Slack** |
| 33 | `twitter:image` | Same, on X |

`og:image` **must be an absolute URL.** Crawlers fetch it from their own
servers, so a relative path resolves against *their* host and 404s. This is
the single most common way a portfolio ships with a blank share card.

If you're buying `sillywizard.dev`, change nothing. Otherwise:

```bash
# from the project root — replace with your real domain
sed -i 's|https://sillywizard.dev|https://YOURDOMAIN.com|g' index.html
```

### What must NOT ship

| Path | Size | Why |
|---|---|---|
| `tools/` | — | Build scripts. Nothing runtime reads them. |
| `serve.py` | — | Dev server, `no-store` on everything. |
| `assets/options/` | **2.3 MB** | Old exploration renders. Dead weight. |
| `assets/ref/README.txt` | — | Notes to yourself. |

The `.gitignore` I added covers these. **Keep `assets/ref/face.jpg`** — the
hover-reveal portrait reads it at runtime.

Deployed size: **~420 KB**, plus `face.jpg` at 2 MB.

---

## 1 · Get it into Git

Not a repo yet.

```bash
git init -b main
git add .
git commit -m "SILLYWIZARD"
```

Then make an **empty** repo on github.com (no README, no .gitignore — they'd
conflict with what you just committed) and:

```bash
git remote add origin https://github.com/YOURNAME/sillywizard.git
git push -u origin main
```

A public repo is fine and is what the free tiers expect. If you'd rather not
publish the source, Cloudflare Pages and Netlify both deploy private repos on
the free plan too.

---

## 2 · Pick a host

**Use Cloudflare Pages.** Unmetered bandwidth on the free plan, free SSL, free
DNS, and if you buy the domain there too the whole thing is one dashboard with
no DNS propagation guesswork.

| | Cloudflare Pages | GitHub Pages | Netlify | Vercel |
|---|---|---|---|---|
| Bandwidth | unmetered | 100 GB/mo soft | 100 GB/mo | 100 GB/mo |
| Custom domain + SSL | yes | yes | yes | yes |
| Private repo | yes | paid | yes | yes |
| Commercial use | yes | yes | yes | **no** on free |
| Custom headers | `_headers` | **none** | `_headers` | `vercel.json` |

Vercel's free tier is Hobby-only and forbids commercial use. A personal
portfolio is a grey area that becomes a real one the moment you freelance off
it. GitHub Pages can't set cache headers at all — it works, it's just the
least controllable.

`vercel.json` and `_headers` are both in the repo. Each host ignores the
other's file, so you can switch without editing anything.

---

## 3 · Cloudflare Pages, start to finish

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick the repo.
2. Build settings — **leave everything empty**:
   - Framework preset: `None`
   - Build command: *(blank)*
   - Build output directory: `/`

   There is no build. If you put something in the build command it will fail,
   and the error won't say "you didn't need this".
3. **Save and Deploy.** You get `your-project.pages.dev` in under a minute.
   Check it works before touching DNS.

### Attach the domain

**Custom domains** → **Set up a domain** → type it.

- **Domain already on Cloudflare:** it writes the DNS record itself. Done.
- **Domain elsewhere:** it gives you a CNAME. At your registrar add:

  | Type | Name | Value |
  |---|---|---|
  | CNAME | `@` | `your-project.pages.dev` |
  | CNAME | `www` | `your-project.pages.dev` |

  A `CNAME` on the apex (`@`) is illegal in plain DNS. Cloudflare, Porkbun and
  Namecheap fake it with ALIAS/CNAME-flattening — if yours has no such option,
  move the nameservers to Cloudflare (free) rather than fighting it.

SSL issues automatically, usually inside five minutes, occasionally an hour.
Don't debug it before then.

### GitHub Pages instead

Settings → Pages → Source `main`, folder `/ (root)`, then Custom domain. That
writes a `CNAME` file into the repo — commit it. DNS at your registrar:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `YOURNAME.github.io` |

All four A records. They're load-balanced, and three of four looks fine until
the day it doesn't. Then tick **Enforce HTTPS** once the cert appears.

---

## 4 · Check it actually works

```bash
# HTTPS, and no redirect chain
curl -sSI https://YOURDOMAIN.com | head -3

# the share image resolves — this is what the crawlers do
curl -sSI https://YOURDOMAIN.com/assets/og-image.jpg | grep -i '^\(HTTP\|content-type\)'
```

Then:

- **Share card:** paste the URL into [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
  and [opengraph.xyz](https://www.opengraph.xyz). LinkedIn caches hard — get
  it right before you post, or you'll be looking at the old card for days.
- **Real phone**, not the browser's device emulator. The mobile build is a
  separate runtime; emulators don't reproduce Safari's collapsing URL bar.
- **The desktop subject renders.** If the wizard is missing, it's WebGL —
  check the console.
- `?fps` for the frame counter, `?off=grain,tear` to isolate layers.

---

## 5 · Things specific to this site

**`face.jpg` is 2 MB and loads at boot.** It's fetched during substrate setup
for a feature that only appears on hover, so every desktop visitor pays 2 MB
before seeing anything. Mobile correctly never requests it. Worth deferring to
the first pointer move, or re-exporting at ~1000px wide.

**Google Fonts is a third-party request.** Two preconnects and a stylesheet to
`fonts.googleapis.com`, then the font files from `fonts.gstatic.com`. It works
everywhere, but it's a dependency you don't control and a GDPR question in the
EU. Self-hosting Space Grotesk and Space Mono removes both; they're OFL.

**Caching is already set up** in `vercel.json` and `_headers`: `assets/`
immutable for a year, `css/` and `js/` revalidated every time. That split
matters — CSS and JS change every time you tune the wizard, and a stale
`substrate.js` against a fresh `site.css` is a very confusing bug report from
somebody else's browser.

**`serve.py` is dev-only.** It sends `no-store` on everything so edits show up
immediately. Nothing like it runs in production, which is exactly why the
cache headers above need to be right.

---

## 6 · Updating

```bash
git add -A && git commit -m "what changed" && git push
```

Every host above rebuilds on push. Rollback is one click in their dashboard —
no need to revert the commit first.
