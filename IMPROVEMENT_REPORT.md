# Phase 12 — Final Improvement Report

This report covers the work done against `AUDIT_REPORT.md`. Every number below is from an actual tool run (Lighthouse 13.4.0 + axe-core 4.12.1 against the live site via headless Chromium), not an estimate — the raw JSON is in `/home/claude/lh_before.json`, `/home/claude/lh_final2.json` if you want to inspect it directly.

## Honesty note, upfront

A few things in the original checklist genuinely aren't achievable in this environment, and I'm not going to claim otherwise:
- **No NVDA/JAWS/VoiceOver/TalkBack** — those require real OS + assistive-tech software I don't have access to. What I *did* do instead: run axe-core (the same engine that powers most automated accessibility testing in industry, including Lighthouse's own accessibility category) directly against the rendered DOM, which catches the large majority of what a screen-reader pass would surface.
- **Lighthouse Performance is not a stable 100** — and can't honestly be reported as one. In this sandbox, three CDN requests (Three.js, GSAP, Google Fonts) are blocked by network policy and time out, which inflates load-timing metrics unpredictably — I saw the Performance score swing between 64 and 84 across identical, unchanged code just from run-to-run network timing noise. On a real server with those resources actually loading, this whole category of noise disappears. I fixed everything that's within the code's control (see below) and I'm reporting the real, if noisy, numbers rather than a cherry-picked best run.
- **A full one-file-per-concern CSS/JS module split** (the folder example in the checklist) was not done — see `README.md` for the specific reasoning. Splitting CSS was low-risk and I could do it if wanted; splitting the JS into 9 files without a bundler would require converting to ES modules, which is a materially larger and riskier change than anything else in this pass, and "do not introduce regressions" was an explicit hard rule.

---

## Real, Verified Before/After Scores

| Category | Before | After |
|---|---|---|
| **Accessibility (Lighthouse)** | 96 | **100** |
| **Accessibility (axe-core violations)** | 2 found in spot-checks* | **0** |
| **Best Practices** | 96 | 96 (see note) |
| **SEO (Lighthouse)** | 100 | 100 (see note) |
| **Performance** | 64 | 65–84 (volatile, see above) |

\* The original audit's manual spot-checks found the missing focus-visible outline and missing H1 via direct DOM inspection, not a formal axe run. The *first* formal axe-core run (done during this pass, before fixes) surfaced 1 violation not caught in the manual audit (a Label-in-Name mismatch); fixing it surfaced a second, subtler one (aria-hidden containing a focusable element); fixing that surfaced a third (a landmark-region gap); fixing that got to zero. This iterative surfacing is normal — accessibility tools often reveal a new layer once the prior one is fixed.

**Best Practices stayed at 96** because the only remaining flagged item is `errors-in-console` — which in this test run *is* the three blocked-CDN 403s, a sandbox artifact, not a code issue. **SEO stayed at 100** both before and after — worth understanding why: Lighthouse's automated SEO category checks crawlability basics (viewport tag, title, meta description, valid `robots`, etc.), and none of those were ever broken. The real SEO gap the original audit found — missing Open Graph/Twitter/canonical/structured data — isn't something Lighthouse's SEO score penalizes, but it's exactly what determines whether the link looks correct when shared on LinkedIn/Twitter/Slack, which is why it was fixed anyway despite not moving this particular number.

### Real performance metrics (same noisy environment, but directionally consistent)

| Metric | Before | After |
|---|---|---|
| First Contentful Paint | 2.2s | 1.6s |
| Total Blocking Time | 2,410ms | 1,780ms |
| Speed Index | 5.4s | 5.1s |
| Time to Interactive | 9.5s | 5.8s |

---

## Completed Checklist

### Critical
- [x] Add proper `<h1>` — promoted the profile card's name (was `<h3>`) to `<h1>`; rest of the hierarchy already nested correctly underneath it, verified live.
- [x] Add `:focus-visible` styles — was completely absent (`outline: none` on every element, confirmed via live testing); now present globally, confirmed rendering as `outline-style: solid` on tab.
- [x] Fix `--text-faint` contrast — 3.46:1 → 6.68:1 (computed via the WCAG relative-luminance formula, not estimated), passes AA with real margin.
- [x] Add Open Graph, Twitter Card, canonical, JSON-LD Person schema, favicon (SVG + 4 PNG sizes), web manifest.

### High
- [x] Fix Label-in-Name mismatch on the logo button and Contact Me button (found by axe-core, not in the original manual audit).
- [x] Fix `aria-hidden` on the intro overlay containing a still-focusable button after being hidden — upgraded to the `inert` attribute, which browser-guarantees unfocusability rather than relying on CSS visibility alone (found by axe-core after the first fix pass).
- [x] Fix `egg-toast` landmark-region violation — added `role="status"` (found by axe-core after the second fix pass).
- [x] Fix a real, silent bug: the scroll-spy's active-nav-state logic was still checking `link.getAttribute('href')`, a leftover from before nav links were converted to `<button>` elements in an earlier session — it was comparing against `null` on every check and silently never matching. Rewritten to use `dataset.target`; also added `aria-current="page"`.
- [x] Fix a genuine forced-reflow bug (confirmed by Lighthouse's own audit) — the profile card's tilt engine read `clientWidth`/`clientHeight` on every animation frame immediately after a style write, forcing synchronous layout recalculation 60×/second while active. Fixed by caching dimensions and only recomputing on resize.
- [x] Fix a genuine CSS Grid "blowout" bug found during final verification — long, unwrapped email/URL text in the Contact section was forcing its grid column wider than its track, causing real horizontal overflow at 320px width (confirmed before/after with a live scrollWidth measurement: 320px overflowed, now doesn't). Fixed with `min-width:0` on the grid/flex children plus `overflow-wrap`.
- [x] `defer` on all three scripts (both CDN scripts and the app's own inline script, which needed to move to `defer` too to preserve execution order).
- [x] Form inputs bumped to 16px on mobile to prevent iOS Safari's auto-zoom-on-focus.

### Medium
- [x] Increased touch targets to 44px (nav toggle; project track prev/next and social icons on coarse-pointer devices specifically, to avoid changing desktop sizing unnecessarily).
- [x] Added `preconnect`/`dns-prefetch` for the CDN domains.
- [x] Passive event listeners audited — one (the cursor-tracking `mousemove`) was missing `passive:true` and has been fixed; the project-drag-track's `mousemove` was correctly left non-passive since it legitimately calls `preventDefault()` during an active drag.
- [x] Removed 6 inline `style="..."` attributes, replaced with named classes (`.projects-head-row`, `.section-head--tight`, `.contact-form`, `.btn2--block`, `.skills-cat-grid`).
- [x] Removed fully-dead CSS/HTML (the VR-frame overlay remnants — a decorative effect removed from the design in an earlier session, whose CSS/HTML never got cleaned up).

### Low / Investigated, Not Changed
- [ ] SRI hashes — investigated, deliberately not added. See README for why (a wrong hash breaks the whole site, and this sandbox can't independently verify a hash against live file bytes).
- [ ] Full CSS/JS module split — deliberately scoped out this pass. See README.

### Requires your input (not something I can fix)
- [ ] The three project "view code" links all currently point to your GitHub *profile* rather than each project's real repository, because the source resume PDF only had the link text, not the URL. I need the three real repo URLs from you to finish this one.
- [ ] `example.com` is a placeholder domain throughout (canonical, OG URLs, robots.txt, sitemap.xml) — swap in the real domain once this is deployed somewhere.

---

## Remaining Issues

After this pass, the only items left are the two above that need information only you have, plus the two deliberately-scoped-out lower-risk architectural items (SRI hashes, full module split) — both documented with reasoning in `README.md` rather than silently skipped. Everything else in the original audit's Top 20 has a verified, tested fix.

## File Manifest

```
/production
  index.html, README.md, AUDIT_REPORT.md, IMPROVEMENT_REPORT.md (this file)
  /css/styles.css
  /js/main.js
  favicon.svg, favicon-16.png, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
  site.webmanifest, robots.txt, sitemap.xml, social-preview.png
```
