(function () {
  "use strict";

  const addressInput = document.getElementById("address-input");
  const suggestionsList = document.getElementById("suggestions-list");
  const findBtn = document.getElementById("find-stops-btn");
  const statusMessage = document.getElementById("status-message");
  const resultsList = document.getElementById("results-list");

  let busData = null;
  let selectedCoords = null; // { lat, lng, placeName }
  let debounceTimer = null;
  let map = null;
  let markers = [];

  const MILES_PER_METER = 0.000621371;

  init();

  async function init() {
    try {
      const res = await fetch("data/bus-stops.json");
      busData = await res.json();
    } catch (err) {
      setStatus("Could not load bus stop data. Please try again later.", true);
      return;
    }

    if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN.startsWith("REPLACE_WITH")) {
      setStatus(
        "Address lookup is not configured yet. Add a Mapbox access token in js/config.js.",
        true
      );
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    try {
      map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: [busData.school.lng, busData.school.lat],
        zoom: 12,
      });

      new mapboxgl.Marker({ color: "#1d4e89" })
        .setLngLat([busData.school.lng, busData.school.lat])
        .setPopup(new mapboxgl.Popup().setText(busData.school.name))
        .addTo(map);
    } catch (err) {
      map = null;
      document.querySelector(".map-panel").hidden = true;
    }

    addressInput.addEventListener("input", onAddressInput);
    addressInput.addEventListener("keydown", onKeydown);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".autocomplete-wrapper")) {
        hideSuggestions();
      }
    });
    findBtn.addEventListener("click", onFindStops);
  }

  function onAddressInput() {
    const query = addressInput.value.trim();
    selectedCoords = null;
    findBtn.disabled = true;
    clearTimeout(debounceTimer);

    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
  }

  async function fetchSuggestions(query) {
    if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN.startsWith("REPLACE_WITH")) {
      return;
    }

    const proximity = `${busData.school.lng},${busData.school.lat}`;
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&autocomplete=true` +
      `&country=US` +
      `&types=address` +
      `&proximity=${proximity}` +
      `&bbox=-90.3,29.85,-89.9,30.15`; // rough New Orleans bounding box

    try {
      const res = await fetch(url);
      const data = await res.json();
      renderSuggestions(data.features || []);
    } catch (err) {
      hideSuggestions();
    }
  }

  function renderSuggestions(features) {
    suggestionsList.innerHTML = "";

    if (features.length === 0) {
      hideSuggestions();
      return;
    }

    features.forEach((feature) => {
      const li = document.createElement("li");
      li.textContent = feature.place_name;
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.addEventListener("click", () => selectSuggestion(feature));
      suggestionsList.appendChild(li);
    });

    suggestionsList.hidden = false;
    addressInput.setAttribute("aria-expanded", "true");
  }

  function selectSuggestion(feature) {
    addressInput.value = feature.place_name;
    selectedCoords = {
      lng: feature.center[0],
      lat: feature.center[1],
      placeName: feature.place_name,
    };
    findBtn.disabled = false;
    hideSuggestions();
    setStatus("");
  }

  function hideSuggestions() {
    suggestionsList.hidden = true;
    suggestionsList.innerHTML = "";
    addressInput.setAttribute("aria-expanded", "false");
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      hideSuggestions();
    }
  }

  function onFindStops() {
    if (!selectedCoords) {
      setStatus("Please choose an address from the suggestions list.", true);
      return;
    }

    const ranked = busData.stops
      .map((stop) => ({
        ...stop,
        distanceMiles: haversineMiles(
          selectedCoords.lat,
          selectedCoords.lng,
          stop.lat,
          stop.lng
        ),
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 3);

    renderResults(ranked);
    updateMap(ranked);
    setStatus("");
  }

  function renderResults(stops) {
    resultsList.innerHTML = "";

    stops.forEach((stop, index) => {
      const card = document.createElement("article");
      card.className = "stop-card";
      card.innerHTML = `
        <h3>#${index + 1}: ${escapeHtml(stop.route)}</h3>
        <p class="stop-location">${escapeHtml(stop.crossStreets)}</p>
        <p class="stop-distance">${stop.distanceMiles.toFixed(2)} miles from your address</p>
        <dl class="stop-times">
          <dt>AM Pickup</dt><dd>${escapeHtml(stop.amPickup)}</dd>
          <dt>PM Drop-off</dt><dd>${escapeHtml(stop.pmDropoff)}</dd>
        </dl>
      `;
      resultsList.appendChild(card);
    });
  }

  function updateMap(stops) {
    if (!map) return;

    markers.forEach((m) => m.remove());
    markers = [];

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([busData.school.lng, busData.school.lat]);

    const homeMarker = new mapboxgl.Marker({ color: "#c0392b" })
      .setLngLat([selectedCoords.lng, selectedCoords.lat])
      .setPopup(new mapboxgl.Popup().setText("Your home address"))
      .addTo(map);
    markers.push(homeMarker);
    bounds.extend([selectedCoords.lng, selectedCoords.lat]);

    stops.forEach((stop) => {
      const marker = new mapboxgl.Marker({ color: "#27ae60" })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(new mapboxgl.Popup().setText(`${stop.route}: ${stop.crossStreets}`))
        .addTo(map);
      markers.push(marker);
      bounds.extend([stop.lng, stop.lat]);
    });

    map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
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

  function setStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", !!isError);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
