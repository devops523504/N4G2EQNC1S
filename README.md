# Find Your Bus Stop

A simple static website that lets families pick their child's school and
enter their home address (with autocomplete) to see the 3 nearest bus
stops for that school, along with route number, AM pickup time, and PM
drop-off time.

## How it works

- `index.html` / `css/styles.css` — page structure and styling.
- `js/config.js` — holds the Mapbox access token.
- `js/app.js` — school dropdown filtering, address autocomplete (Mapbox
  Geocoding API), distance calculation (straight-line/haversine, in
  miles), results rendering, and an optional map view.
- `data/bus-stops.json` — the schools and bus stop dataset.

No backend or database server is required — everything runs in the
browser. `bus-stops.json` acts as the "database."

### Data status: what's real vs. placeholder

- **Schools are real.** The 7 schools in `data/bus-stops.json` use their
  actual names, addresses, and geocoded coordinates (looked up via web
  search and the Mapbox Geocoding API).
- **Routes, stops, and times are synthetic demo data.** The 30 routes
  (~20 stops each) use real New Orleans street names combined
  arbitrarily, plausible-looking pickup/drop-off times, and each route is
  assigned to exactly one school. None of this reflects an actual bus
  roster — it exists only to demonstrate the app. Replace `stops` with
  the real route roster before this goes live for families.

## Replacing the sample data

Edit `data/bus-stops.json`. It has two top-level arrays:

`schools` — one entry per school:

```json
{
  "id": "kipp-central-city",
  "name": "KIPP Central City",
  "address": "2514 Third Street, New Orleans, LA 70113",
  "lat": 29.939595,
  "lng": -90.090735
}
```

`stops` — one entry per bus stop. `schoolId` must match a school's `id`
above — each route serves exactly one school, so every stop on that route
should carry the same `schoolId`:

```json
{
  "id": "unique-id",
  "schoolId": "kipp-central-city",
  "route": "Route 3",
  "crossStreets": "Magazine St & Napoleon Ave",
  "lat": 29.9297,
  "lng": -90.0937,
  "amPickup": "6:45 AM",
  "pmDropoff": "3:30 PM"
}
```

To get `lat`/`lng` for a street corner or address, you can look it up with
the same Mapbox geocoder this site uses, or any mapping tool — search the
address and copy the coordinates.

If your bus roster lives in a spreadsheet, the easiest path is to export it
to CSV and convert each row into an object in the `stops` array above (or
ask for help converting it).

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

This is a plain static site (HTML/CSS/JS + one JSON file), so it can be
hosted on any static hosting provider — Netlify, Vercel, GitHub Pages, or a
school website's existing static hosting.

This repo includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that deploys to GitHub Pages automatically
on every push to `master`. It injects the Mapbox token from a repository
secret named `MAPBOX_ACCESS_TOKEN` at deploy time, so the real token is
never stored in the git history. To use it on a fork/new repo:

1. Repo Settings → Secrets and variables → Actions → add secret
   `MAPBOX_ACCESS_TOKEN` with your Mapbox token.
2. Repo Settings → Pages → Source → "GitHub Actions".
3. Push to `master` (or run the workflow manually) and the site deploys to
   `https://<username>.github.io/<repo-name>/`.

If deploying elsewhere (Netlify/Vercel/etc.), just make sure `js/config.js`
exists with a real token before/at deploy time — it is not part of the
repo.

## Bot check (Cloudflare Turnstile)

The search form requires completing a Cloudflare Turnstile challenge before
"Find My Bus Stops" is enabled. The widget's site key is hardcoded in
`index.html` (Turnstile site keys are meant to be public, unlike API
tokens). It's registered to the `devops523504.github.io` domain only, so it
will show a connection error on localhost or any other domain — that's
expected, not a bug.

**Important limitation:** this is a fully static site with no backend, so
there is nowhere to call Cloudflare's `siteverify` endpoint to cryptographically
confirm a challenge response. This setup only gates the button client-side —
it deters basic/naive bots but does not provide airtight verification. If
real server-side verification is ever needed, it would require adding a
small backend (e.g. a Cloudflare Worker) to verify the token before treating
a request as legitimate. The Turnstile secret key is not stored in this
repo; it's only in the Cloudflare dashboard for this widget.

## Notes / limitations

- Distance shown is straight-line ("as the crow flies") distance, not
  driving/walking distance.
- The site geocodes addresses within a New Orleans bounding box to keep
  autocomplete results relevant.
- If the Mapbox token is missing or invalid, address suggestions won't
  load and a message will display instead of failing silently.
