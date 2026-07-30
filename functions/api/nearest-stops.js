// Cloudflare Pages Function. This is the ONLY place the full bus stop
// roster is ever loaded -- it lives in functions/_data/stops.json, which
// Cloudflare Pages does not serve as a static asset (anything under
// functions/ is compiled into the Functions bundle, not deployed as a
// public file). The browser never receives more than the 3 nearest stops
// for a single verified query.
//
// Each request must include a Turnstile token, verified here via the
// canonical siteverify call before any stop data is touched. Turnstile
// tokens are single-use, so every real query costs the caller a freshly
// solved challenge -- this doesn't make scraping the full roster
// impossible, but it raises the cost well above "fetch a JSON file."

import stopsData from "../_data/stops.json";

const MILES_PER_METER = 0.000621371;

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const { token, schoolId, lat, lng } = body || {};

  if (!token || typeof token !== "string") {
    return jsonResponse({ error: "missing_token" }, 400);
  }
  if (!schoolId || typeof schoolId !== "string") {
    return jsonResponse({ error: "missing_school" }, 400);
  }
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return jsonResponse({ error: "missing_location" }, 400);
  }

  const remoteIp = request.headers.get("CF-Connecting-IP") || "";

  let verifyResult;
  try {
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: remoteIp,
        }),
      }
    );
    if (!verifyRes.ok) {
      throw new Error(`siteverify responded ${verifyRes.status}`);
    }
    verifyResult = await verifyRes.json();
  } catch (err) {
    // Fail closed: if we can't confirm the token, don't hand out stops.
    return jsonResponse({ error: "verify_unavailable" }, 502);
  }

  if (!verifyResult.success) {
    return jsonResponse({ error: "verification_failed" }, 403);
  }

  const schoolStops = stopsData.stops.filter((s) => s.schoolId === schoolId);

  const nearest = schoolStops
    .map((stop) => ({
      ...stop,
      distanceMiles: haversineMiles(lat, lng, stop.lat, stop.lng),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 3);

  return jsonResponse({ stops: nearest }, 200);
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * MILES_PER_METER;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
