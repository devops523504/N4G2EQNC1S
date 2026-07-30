# Find Your Bus Stop

A simple static website that lets families enter their home address (with
autocomplete) and see the 3 nearest school bus stops, along with route
number, AM pickup time, and PM drop-off time.

## How it works

- `index.html` / `css/styles.css` — page structure and styling.
- `js/config.js` — holds the Mapbox access token.
- `js/app.js` — address autocomplete (Mapbox Geocoding API), distance
  calculation (straight-line/haversine, in miles), results rendering, and an
  optional map view.
- `data/bus-stops.json` — the bus stop dataset and the school's location.
  This is currently **sample placeholder data** for New Orleans, not a real
  route roster.

No backend or database server is required — everything runs in the
browser. `bus-stops.json` acts as the "database."

## Replacing the sample data

Edit `data/bus-stops.json`. Each stop needs:

```json
{
  "id": "unique-id",
  "route": "Route 3",
  "crossStreets": "Magazine St & Napoleon Ave",
  "lat": 29.9297,
  "lng": -90.0937,
  "amPickup": "6:45 AM",
  "pmDropoff": "3:30 PM"
}
```

Also update the `school` object at the top with the real school name,
address, and coordinates (used to center the map).

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

## Notes / limitations

- Distance shown is straight-line ("as the crow flies") distance, not
  driving/walking distance.
- The site geocodes addresses within a New Orleans bounding box to keep
  autocomplete results relevant.
- If the Mapbox token is missing or invalid, address suggestions won't
  load and a message will display instead of failing silently.
