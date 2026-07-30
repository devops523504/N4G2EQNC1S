# Find Your Bus Stop

**Live site:** https://kipp-bus-stop-finder.pages.dev

A simple static website that lets families pick their child's school and
enter their home address (with autocomplete) to see the 3 nearest bus
stops for that school, along with route number, AM pickup time, and PM
drop-off time.

## How it works

- `index.html` / `css/styles.css` — page structure and styling.
- `js/config.js` — holds the Mapbox access token.
- `js/app.js` — school dropdown filtering, address autocomplete (Mapbox
  Geocoding API), results rendering, and an optional map view.
- `data/schools.json` — **public** data: the 7 schools (name, address,
  coordinates). Fetched directly by the browser.
- `functions/_data/stops.json` — **private, server-side only** bus stop
  roster. This is intentionally placed under `functions/`, which
  Cloudflare Pages compiles into the server-side Functions bundle instead
  of deploying as a static asset — there is no public URL that serves this
  file. The browser never receives more than the 3 nearest stops for a
  single verified query.
- `functions/api/nearest-stops.js` — the only code path that reads
  `stops.json`. Verifies the request's Turnstile token via Cloudflare's
  canonical `siteverify`, then returns just the 3 nearest stops for the
  given school + coordinates.

### Why the split

Earlier versions of this site kept school + stop data together in one
public `data/bus-stops.json`, fetched directly by the browser. That meant
the entire stop roster (every family's possible pickup location) was
sitting in a plain file anyone could open, in the browser network tab or
directly in the public repo. Schools' names/addresses are public
information regardless, but the bus stop roster is not something that
should be enumerable by an unauthenticated visitor. Moving it behind
`functions/api/nearest-stops.js` means a visitor's browser only ever sees
the 3 stops relevant to their own query.

This isn't a complete guarantee against determined scraping — someone
could still query many different coordinates across the city to
reconstruct most of the roster over time. Folding Turnstile verification
into the same endpoint (each query burns one freshly-solved challenge,
since Turnstile tokens are single-use) raises the cost of that
significantly, but if this matters a lot for the real dataset, consider
also adding rate limiting (e.g. Cloudflare's built-in rate limiting rules)
on `/api/nearest-stops`.

### Data status: what's real vs. placeholder

- **Schools are real.** The 7 schools in `data/schools.json` use their
  actual names, addresses, and geocoded coordinates (looked up via web
  search and the Mapbox Geocoding API).
- **Routes, stops, and times are synthetic demo data.** The 30 routes
  (~8-20 stops each) use real New Orleans street names combined
  arbitrarily, plausible-looking pickup/drop-off times, and each route is
  assigned to exactly one school. None of this reflects an actual bus
  roster — it exists only to demonstrate the app. Replace
  `functions/_data/stops.json` with the real route roster before this goes
  live for families.

## Replacing the sample data

`data/schools.json` — one entry per school:

```json
{
  "id": "kipp-central-city",
  "name": "KIPP Central City",
  "address": "2514 Third Street, New Orleans, LA 70113",
  "lat": 29.939595,
  "lng": -90.090735
}
```

`functions/_data/stops.json` — one entry per bus stop. `schoolId` must
match a school's `id` above — each route serves exactly one school, so
every stop on that route should carry the same `schoolId`:

```json
{
  "id": "unique-id",
  "schoolId": "kipp-central-city",
  "route": "Route 3",
  "crossStreets": "Magazine St & Napoleon Ave",
  "lat": 29.9297,
  "lng": -90.0937,
  "amPickup": "6:45 AM",
  "pmDropoff": "3:30 PM",
  "wedEarlyDismissal": "1:30 PM"
}
```

To get `lat`/`lng` for a street corner or address, you can look it up with
the same Mapbox geocoder this site uses, or any mapping tool — search the
address and copy the coordinates.

If your bus roster lives in a spreadsheet, the easiest path is to export it
to CSV and convert each row into an object in the `stops` array above (or
ask for help converting it). Whatever you do, keep the file under
`functions/_data/` — never move it back under `data/` or anywhere else
that gets served as a static asset.

## Mapbox access token

The site uses Mapbox for address autocomplete and the map. It reads the
token from `js/config.js`, which is **gitignored** and never committed —
copy `js/config.example.js` to `js/config.js` and fill in your own token
to run locally.

Since this is a public, client-side token, it's worth limiting where it can
be used: in the Mapbox account dashboard, add this site's deployed domain
to the token's **URL restrictions** so it can't be reused elsewhere.

## Running locally

```bash
cp js/config.example.js js/config.js   # then edit in your Mapbox token
python3 -m http.server 8123
```

Then open `http://localhost:8123`.

## Deploying

**Live site:** https://kipp-bus-stop-finder.pages.dev

This is a plain static site (HTML/CSS/JS + one JSON file), hosted on
**Cloudflare Pages**. GitHub remains the source of truth for the code and
its history — Cloudflare Pages is just the hosting target, not a git host.

This repo includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that deploys to Cloudflare Pages
automatically on every push to `master`, via `wrangler pages deploy`. It
injects the Mapbox token from a repository secret (`MAPBOX_ACCESS_TOKEN`)
at deploy time, so the real token is never stored in git history. To use
this workflow on a fork/new repo:

1. Repo Settings → Secrets and variables → Actions → add secrets:
   - `MAPBOX_ACCESS_TOKEN` — your Mapbox token
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Pages edit access
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
2. Create the Pages project once (`wrangler pages project create
   kipp-bus-stop-finder`), or change the `--project-name` in the workflow
   to a project you already have.
3. Push to `master` (or run the workflow manually).

GitHub Pages hosting has been turned off for this repo to avoid two live
copies of the site.

If deploying elsewhere (Netlify/Vercel/etc.), just make sure `js/config.js`
exists with a real token before/at deploy time — it is not part of the
repo.

## Bot check (Cloudflare Turnstile)

The search form requires completing a Cloudflare Turnstile challenge before
"Find My Bus Stops" is enabled. The widget's site key is hardcoded in
`index.html` (Turnstile site keys are meant to be public, unlike API
tokens). It's registered to the `hop.knos.pro` and
`kipp-bus-stop-finder.pages.dev` domains — it will show a connection error
on localhost or any other domain, which is expected, not a bug. If the
domain ever changes, update the widget's allowed domains in the Cloudflare
dashboard (Turnstile → this widget → Settings), or via the API.

**Verification is real and server-side**, via
`functions/api/nearest-stops.js`: the token from the widget is sent along
with every search request and checked against Cloudflare's canonical
`siteverify` endpoint before any stop data is touched. A request with a
missing, invalid, or already-used token gets a 403 and no data. Because
Turnstile tokens are single-use, the frontend calls `turnstile.reset()`
after every search (success or failure) so the next search gets a fresh
token.

The secret key lives only as a Cloudflare Pages secret
(`TURNSTILE_SECRET`, set via `wrangler pages secret put`) — it is never in
this repo or sent to the browser. If you redeploy this to a new Pages
project, you'll need to set that secret again for the new project.

## Notes / limitations

- Distance shown is straight-line ("as the crow flies") distance, not
  driving/walking distance.
- The site geocodes addresses within a New Orleans bounding box to keep
  autocomplete results relevant.
- If the Mapbox token is missing or invalid, address suggestions won't
  load and a message will display instead of failing silently.
