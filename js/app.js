(function () {
  "use strict";

  const schoolSelect = document.getElementById("school-select");
  const addressInput = document.getElementById("address-input");
  const suggestionsList = document.getElementById("suggestions-list");
  const findBtn = document.getElementById("find-stops-btn");
  const statusMessage = document.getElementById("status-message");
  const resultsHeading = document.getElementById("results-heading");
  const resultsList = document.getElementById("results-list");

  let schools = []; // public data only -- never the bus stop roster
  let selectedCoords = null; // { lat, lng, placeName }
  let selectedSchoolId = "";
  let debounceTimer = null;
  let map = null;
  let mapInitFailed = false;
  let resultMarkers = [];
  let turnstileToken = null;

  window.onTurnstileSuccess = function (token) {
    turnstileToken = token;
    updateFindButtonState();
    setStatus("");
  };

  window.onTurnstileExpired = function () {
    turnstileToken = null;
    updateFindButtonState();
  };

  const NOLA_CENTER = { lat: 29.9700, lng: -90.0700 };

  init();

  async function init() {
    try {
      const res = await fetch("data/schools.json");
      const data = await res.json();
      schools = data.schools;
    } catch (err) {
      setStatus("Could not load school data. Please try again later.", true);
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
    schools.forEach((school) => {
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
    findBtn.disabled = !(selectedCoords && selectedSchoolId && turnstileToken);
  }

  async function onFindStops() {
    if (!selectedSchoolId) {
      setStatus("Please select your child's school.", true);
      return;
    }
    if (!selectedCoords) {
      setStatus("Please choose an address from the suggestions list.", true);
      return;
    }
    if (!turnstileToken) {
      setStatus("Please complete the verification challenge.", true);
      return;
    }

    findBtn.disabled = true;
    setStatus("Searching...");

    let payload;
    try {
      const res = await fetch("/api/nearest-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: turnstileToken,
          schoolId: selectedSchoolId,
          lat: selectedCoords.lat,
          lng: selectedCoords.lng,
        }),
      });
      payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "request_failed");
      }
    } catch (err) {
      setStatus("Something went wrong verifying your request. Please try again.", true);
      resetTurnstile();
      return;
    }

    // Each token is single-use -- get a fresh one for the next search.
    resetTurnstile();

    const school = schools.find((s) => s.id === selectedSchoolId);
    renderResults(payload.stops, school);
    updateResultsOnMap(payload.stops);
    setStatus("");
  }

  function resetTurnstile() {
    turnstileToken = null;
    updateFindButtonState();
    if (window.turnstile) {
      window.turnstile.reset();
    }
  }

  function renderResults(stops, school) {
    document.querySelector(".results-panel").hidden = false;

    if (school) {
      resultsHeading.textContent = `Nearest locations for ${school.name}`;
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
          <h3>${escapeHtml(stop.crossStreets)}</h3>
        </div>
        <span class="route-badge">${escapeHtml(stop.route)}</span>
        <p class="stop-distance">${stop.distanceMiles.toFixed(2)} miles from your address</p>
        <dl class="stop-times">
          <dt>AM Pickup</dt><dd>${escapeHtml(stop.amPickup)}</dd>
          <dt>PM Drop-off</dt><dd>${escapeHtml(stop.pmDropoff)}</dd>
          <dt>Early Release Drop-off</dt><dd>${escapeHtml(stop.wedEarlyDismissal)}</dd>
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

    const school = schools.find((s) => s.id === selectedSchoolId);
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
        <span class="popup-stop-badge ${rankClass}">#${stopNumber}</span>
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
