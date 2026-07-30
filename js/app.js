(function () {
  "use strict";

  const schoolSelect = document.getElementById("school-select");
  const addressInput = document.getElementById("address-input");
  const suggestionsList = document.getElementById("suggestions-list");
  const findBtn = document.getElementById("find-stops-btn");
  const statusMessage = document.getElementById("status-message");
  const resultsHeading = document.getElementById("results-heading");
  const resultsList = document.getElementById("results-list");

  let busData = null;
  let selectedCoords = null; // { lat, lng, placeName }
  let selectedSchoolId = "";
  let debounceTimer = null;
  let map = null;
  let mapInitFailed = false;
  let resultMarkers = [];

  const MILES_PER_METER = 0.000621371;
  const NOLA_CENTER = { lat: 29.9700, lng: -90.0700 };

  init();

  async function init() {
    try {
      const res = await fetch("data/bus-stops.json");
      busData = await res.json();
    } catch (err) {
      setStatus("Could not load bus stop data. Please try again later.", true);
      return;
    }

    populateSchoolSelect();

    if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN.startsWith("REPLACE_WITH")) {
      setStatus(
        "Address lookup is not configured yet. Add a Mapbox access token in js/config.js.",
        true
      );
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    schoolSelect.addEventListener("change", onSchoolChange);
    addressInput.addEventListener("input", onAddressInput);
    addressInput.addEventListener("keydown", onKeydown);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".autocomplete-wrapper")) {
        hideSuggestions();
      }
    });
    findBtn.addEventListener("click", onFindStops);
  }

  function populateSchoolSelect() {
    busData.schools.forEach((school) => {
      const option = document.createElement("option");
      option.value = school.id;
      option.textContent = school.name;
      schoolSelect.appendChild(option);
    });
  }

  function ensureMapInitialized() {
    if (map || mapInitFailed) return;

    try {
      map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: [NOLA_CENTER.lng, NOLA_CENTER.lat],
        zoom: 11,
      });
    } catch (err) {
      map = null;
      mapInitFailed = true;
      document.querySelector(".map-panel").hidden = true;
    }
  }

  function addSchoolMarker(school) {
    const el = document.createElement("div");
    el.className = "school-marker";
    el.innerHTML = `<img src="assets/kipp-logo.png" alt="${escapeHtml(school.name)}">`;

    const popupHtml = `
      <p class="popup-school-name">${escapeHtml(school.name)}</p>
      <p class="popup-school-address">${escapeHtml(school.address)}</p>
    `;

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([school.lng, school.lat])
      .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(popupHtml))
      .addTo(map);
    resultMarkers.push(marker);
    return marker;
  }

  function onSchoolChange() {
    selectedSchoolId = schoolSelect.value;
    updateFindButtonState();
    setStatus("");
  }

  function onAddressInput() {
    const query = addressInput.value.trim();
    selectedCoords = null;
    updateFindButtonState();
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

    const proximity = `${NOLA_CENTER.lng},${NOLA_CENTER.lat}`;
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
    updateFindButtonState();
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

  function updateFindButtonState() {
    findBtn.disabled = !(selectedCoords && selectedSchoolId);
  }

  function onFindStops() {
    if (!selectedSchoolId) {
      setStatus("Please select your child's school.", true);
      return;
    }
    if (!selectedCoords) {
      setStatus("Please choose an address from the suggestions list.", true);
      return;
    }

    const schoolStops = busData.stops.filter((s) => s.schoolId === selectedSchoolId);

    const ranked = schoolStops
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

    const school = busData.schools.find((s) => s.id === selectedSchoolId);

    renderResults(ranked, school);
    updateResultsOnMap(ranked);
    setStatus("");
  }

  function renderResults(stops, school) {
    if (school) {
      resultsHeading.textContent = `Nearest stops for ${school.name}`;
      resultsHeading.hidden = false;
    }

    resultsList.innerHTML = "";

    stops.forEach((stop, index) => {
      const stopNumber = index + 1;
      const rankClass = `rank-${stopNumber}`;
      const card = document.createElement("article");
      card.className = `stop-card ${rankClass}`;
      card.innerHTML = `
        <div class="stop-card-header">
          <span class="stop-number-badge ${rankClass}">${stopNumber}</span>
          <h3>Stop #${stopNumber}</h3>
        </div>
        <span class="route-badge">${escapeHtml(stop.route)}</span>
        <p class="stop-location">${escapeHtml(stop.crossStreets)}</p>
        <p class="stop-distance">${stop.distanceMiles.toFixed(2)} miles from your address</p>
        <dl class="stop-times">
          <dt>AM Pickup</dt><dd>${escapeHtml(stop.amPickup)}</dd>
          <dt>PM Drop-off</dt><dd>${escapeHtml(stop.pmDropoff)}</dd>
          <dt>Wed/Early Dismissal PM Drop-off</dt><dd>${escapeHtml(stop.wedEarlyDismissal)}</dd>
        </dl>
      `;
      resultsList.appendChild(card);
    });
  }

  function updateResultsOnMap(stops) {
    const mapPanel = document.querySelector(".map-panel");
    mapPanel.hidden = false;

    ensureMapInitialized();
    if (!map) return;
    map.resize();

    resultMarkers.forEach((m) => m.remove());
    resultMarkers = [];

    const school = busData.schools.find((s) => s.id === selectedSchoolId);
    const bounds = new mapboxgl.LngLatBounds();
    if (school) {
      addSchoolMarker(school);
      bounds.extend([school.lng, school.lat]);
    }

    const homeEl = document.createElement("div");
    homeEl.className = "home-marker";

    const homeMarker = new mapboxgl.Marker({ element: homeEl })
      .setLngLat([selectedCoords.lng, selectedCoords.lat])
      .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML("<p class=\"popup-route\">Your home address</p>"))
      .addTo(map);
    resultMarkers.push(homeMarker);
    bounds.extend([selectedCoords.lng, selectedCoords.lat]);

    stops.forEach((stop, index) => {
      const stopNumber = index + 1;
      const rankClass = `rank-${stopNumber}`;
      const el = document.createElement("div");
      el.className = `stop-marker ${rankClass}`;
      el.textContent = stopNumber;

      const popupHtml = `
        <span class="popup-stop-badge ${rankClass}">Stop #${stopNumber}</span>
        <p class="popup-route">${escapeHtml(stop.route)}</p>
        <p class="popup-location">${escapeHtml(stop.crossStreets)}</p>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(popupHtml))
        .addTo(map);
      resultMarkers.push(marker);
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
