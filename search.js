const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");
const searchForm = document.querySelector(".search-page-form");
const searchInput = document.querySelector("#search-location");
const filterButtons = document.querySelectorAll("[data-filter]");
const priceButtons = document.querySelectorAll("[data-price-range]");
const filterMenus = document.querySelectorAll(".filter-menu");
const priceLabel = document.querySelector("[data-price-label]");
const propertyLabel = document.querySelector("[data-property-label]");
const featureLabel = document.querySelector("[data-feature-label]");
const bedroomButtons = document.querySelectorAll("[data-bedrooms]");
const bathroomButtons = document.querySelectorAll("[data-bathrooms]");
const filterToggles = document.querySelectorAll("[data-filter-toggle]");
const exactFilterInputs = document.querySelectorAll("[data-exact-filter]");
const rangeFilterInputs = document.querySelectorAll("[data-range-filter]");
const selectFilterInputs = document.querySelectorAll("[data-select-filter]");
const lotUnitInputs = document.querySelectorAll("[data-lot-unit]");
const resetAdvancedFiltersButton = document.querySelector("[data-reset-advanced-filters]");
const closeAdvancedFiltersButton = document.querySelector("[data-close-advanced-filters]");
const resultsList = document.querySelector("#search-results-list");
const resultsStatus = document.querySelector("#search-results-status");
const resultsTitle = document.querySelector("#listing-results-title");
const detailPanel = document.querySelector("#listing-detail-view");
const searchToolbar = document.querySelector(".search-toolbar");
const searchShell = document.querySelector(".search-shell");
const mapElement = document.querySelector("#listing-map");
const mapFallback = document.querySelector("#map-fallback");
const sortSelect = document.querySelector("#listing-sort");
const viewButtons = document.querySelectorAll("[data-view]");
const loadMoreStatus = document.querySelector("#load-more-status");
const loadMoreSentinel = document.querySelector("#load-more-sentinel");
const idxConfig = window.RICKI_IDX_CONFIG || {};
const getSearchEndpoint = () => {
  if (window.location.protocol === "file:") {
    return "http://localhost:4173/api/listings";
  }
  return idxConfig.searchEndpoint || "/api/listings";
};
const REGIONAL_AREA = "sarasota-lakewood-ranch";
const REGIONAL_CENTER = [27.36, -82.45];
const REGIONAL_ZOOM = 11;
const PAGE_LIMIT = 36;
const PRESET_SEARCH_LABELS = {
  all: "",
  "single family": "Single Family",
  condo: "Condos",
  pool: "Pool Homes"
};

const updateCompactNav = () => {
  document.documentElement.classList.toggle("is-compact-nav", window.innerWidth <= 1100);
};

updateCompactNav();
window.addEventListener("resize", updateCompactNav);

const PRICE_LABELS = {
  any: "Any Price",
  "under-500": "Under $500k",
  "500-750": "$500k-$750k",
  "750-1000": "$750k-$1M",
  "1m-plus": "$1M+"
};
const ADVANCED_FILTER_DEFAULTS = {
  openHouse: false,
  companyListings: false,
  priceChanges: false,
  bedrooms: "any",
  bedroomsExact: false,
  bathrooms: "any",
  bathroomsExact: false,
  sqftMin: "",
  sqftMax: "",
  lotUnit: "acres",
  lotMin: "",
  lotMax: "",
  yearMin: "",
  yearMax: "",
  garageSpaces: "any",
  garageExact: false,
  daysOnMarket: "any"
};
const ADVANCED_FILTER_KEYS = Object.keys(ADVANCED_FILTER_DEFAULTS);

let activeFilter = "all";
let activeArea = "";
let activeSort = "newest";
let activeView = "images";
let activePriceRange = "any";
let activeAdvancedFilters = { ...ADVANCED_FILTER_DEFAULTS };
let currentListings = [];
let currentOffset = 0;
let hasMoreListings = true;
let isLoadingListings = false;
let lastRequestKey = "";
let loadMoreObserver;
let listingMap;
let markerGroup;

const escapeHTML = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  const advanced = { ...ADVANCED_FILTER_DEFAULTS };
  ADVANCED_FILTER_KEYS.forEach((key) => {
    if (!params.has(key)) {
      return;
    }
    const value = params.get(key);
    advanced[key] = typeof ADVANCED_FILTER_DEFAULTS[key] === "boolean"
      ? value === "true"
      : value || ADVANCED_FILTER_DEFAULTS[key];
  });
  const legacyFeature = params.get("feature") || "";
  if (legacyFeature === "beds-2") {
    advanced.bedrooms = "2";
  } else if (legacyFeature === "beds-3") {
    advanced.bedrooms = "3";
  } else if (legacyFeature === "baths-2") {
    advanced.bathrooms = "2";
  } else if (legacyFeature === "garage") {
    advanced.garageSpaces = "1";
  }

  return {
    q: params.get("q") || "",
    area: params.get("area") || "",
    propertyType: params.get("propertyType") || "all",
    priceRange: params.get("priceRange") || "any",
    advanced,
    sort: params.get("sort") || "newest",
    view: params.get("view") || "images"
  };
};

const getAdvancedFilterSummary = () => {
  const parts = [];
  if (activeAdvancedFilters.openHouse) parts.push("Open Houses");
  if (activeAdvancedFilters.companyListings) parts.push("Company");
  if (activeAdvancedFilters.priceChanges) parts.push("Price Changes");
  if (activeAdvancedFilters.bedrooms !== "any") {
    parts.push(`${activeAdvancedFilters.bedrooms}${activeAdvancedFilters.bedroomsExact ? "" : "+"} Beds`);
  }
  if (activeAdvancedFilters.bathrooms !== "any") {
    parts.push(`${activeAdvancedFilters.bathrooms}${activeAdvancedFilters.bathroomsExact ? "" : "+"} Baths`);
  }
  if (activeAdvancedFilters.sqftMin || activeAdvancedFilters.sqftMax) parts.push("Sq Ft");
  if (activeAdvancedFilters.lotMin || activeAdvancedFilters.lotMax) parts.push("Lot");
  if (activeAdvancedFilters.yearMin || activeAdvancedFilters.yearMax) parts.push("Year");
  if (activeAdvancedFilters.garageSpaces !== "any") {
    parts.push(`${activeAdvancedFilters.garageSpaces}${activeAdvancedFilters.garageExact ? "" : "+"} Garage`);
  }
  if (activeAdvancedFilters.daysOnMarket !== "any") parts.push(`${activeAdvancedFilters.daysOnMarket} DOM`);

  if (!parts.length) {
    return "Any";
  }
  return parts.length > 2 ? `${parts.slice(0, 2).join(", ")} +${parts.length - 2}` : parts.join(", ");
};

const getPresetLabel = (filter) => PRESET_SEARCH_LABELS[filter] || "";

const getPresetFilterFromValue = (value) => {
  const cleaned = String(value || "").trim().toLowerCase();
  return Object.entries(PRESET_SEARCH_LABELS)
    .find(([, label]) => label && label.toLowerCase() === cleaned)?.[0] || "";
};

const isPresetDisplayValue = (value, filter = activeFilter) => {
  const label = getPresetLabel(filter);
  return Boolean(label && String(value || "").trim().toLowerCase() === label.toLowerCase());
};

const getSearchQueryValue = (value = searchInput?.value || "", filter = activeFilter) => (
  isPresetDisplayValue(value, filter) ? "" : String(value || "").trim()
);

const updateResultsHeading = () => {
  if (!resultsTitle) {
    return;
  }

  const label = getPresetLabel(activeFilter);
  resultsTitle.textContent = label ? `${label} matching your search` : "Homes matching your search";
};

const getRequestKey = () => JSON.stringify({
  query: getSearchQueryValue(),
  area: activeArea,
  filter: activeFilter,
  priceRange: activePriceRange,
  advanced: activeAdvancedFilters,
  sort: activeSort
});

const updateUrl = (
  query,
  propertyType,
  area = "",
  sort = activeSort,
  view = activeView,
  priceRange = activePriceRange,
  advanced = activeAdvancedFilters
) => {
  const url = new URL(window.location.href);
  const cleanQuery = getSearchQueryValue(query, propertyType);

  url.searchParams.delete("q");
  url.searchParams.delete("area");
  url.searchParams.delete("propertyType");
  url.searchParams.delete("priceRange");
  url.searchParams.delete("feature");
  ADVANCED_FILTER_KEYS.forEach((key) => url.searchParams.delete(key));
  url.searchParams.delete("sort");
  url.searchParams.delete("view");
  url.searchParams.delete("listing");

  if (cleanQuery) {
    url.searchParams.set("q", cleanQuery);
  } else if (area) {
    url.searchParams.set("area", area);
  }
  if (propertyType && propertyType !== "all") {
    url.searchParams.set("propertyType", propertyType);
  }
  if (priceRange && priceRange !== "any") {
    url.searchParams.set("priceRange", priceRange);
  }
  ADVANCED_FILTER_KEYS.forEach((key) => {
    const value = advanced[key];
    const defaultValue = ADVANCED_FILTER_DEFAULTS[key];
    if (typeof defaultValue === "boolean") {
      if (value) url.searchParams.set(key, "true");
      return;
    }
    if (value && value !== defaultValue) {
      url.searchParams.set(key, value);
    }
  });
  if (sort && sort !== "newest") {
    url.searchParams.set("sort", sort);
  }
  if (view && view !== "images") {
    url.searchParams.set("view", view);
  }

  window.history.pushState({}, "", url);
};

const updateListingUrl = (listing) => {
  const url = new URL(window.location.href);
  if (listing?.mls || listing?.id) {
    url.searchParams.set("listing", listing.mls || listing.id);
  }
  window.history.pushState({ listing: listing?.mls || listing?.id }, "", url);
};

const showResultsView = () => {
  if (searchToolbar) {
    searchToolbar.hidden = false;
  }
  if (searchShell) {
    searchShell.hidden = false;
  }
  if (detailPanel) {
    detailPanel.hidden = true;
    detailPanel.innerHTML = "";
  }
};

const setActiveFilter = (filter) => {
  activeFilter = filter || "all";
  if (propertyLabel) {
    propertyLabel.textContent = getPresetLabel(activeFilter) || "All";
  }
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
};

const setActivePriceRange = (range) => {
  activePriceRange = PRICE_LABELS[range] ? range : "any";
  if (priceLabel) {
    priceLabel.textContent = PRICE_LABELS[activePriceRange];
  }
  priceButtons.forEach((button) => {
    const isActive = button.dataset.priceRange === activePriceRange;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
};

const setActiveAdvancedFilters = (filters = {}) => {
  activeAdvancedFilters = {
    ...ADVANCED_FILTER_DEFAULTS,
    ...filters
  };

  if (featureLabel) {
    featureLabel.textContent = getAdvancedFilterSummary();
  }

  bedroomButtons.forEach((button) => {
    const isActive = button.dataset.bedrooms === activeAdvancedFilters.bedrooms;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  bathroomButtons.forEach((button) => {
    const isActive = button.dataset.bathrooms === activeAdvancedFilters.bathrooms;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  filterToggles.forEach((input) => {
    input.checked = Boolean(activeAdvancedFilters[input.dataset.filterToggle]);
    const label = input.nextElementSibling;
    if (label) {
      label.textContent = input.checked ? "On" : "Off";
    }
  });

  exactFilterInputs.forEach((input) => {
    const key = `${input.dataset.exactFilter}Exact`;
    input.checked = Boolean(activeAdvancedFilters[key]);
  });

  rangeFilterInputs.forEach((input) => {
    input.value = activeAdvancedFilters[input.dataset.rangeFilter] || "";
  });

  selectFilterInputs.forEach((input) => {
    input.value = activeAdvancedFilters[input.dataset.selectFilter] || "any";
  });

  lotUnitInputs.forEach((input) => {
    input.checked = input.value === activeAdvancedFilters.lotUnit;
  });
};

const getAdvancedFiltersFromControls = () => {
  const nextFilters = { ...activeAdvancedFilters };

  filterToggles.forEach((input) => {
    nextFilters[input.dataset.filterToggle] = input.checked;
  });
  exactFilterInputs.forEach((input) => {
    nextFilters[`${input.dataset.exactFilter}Exact`] = input.checked;
  });
  rangeFilterInputs.forEach((input) => {
    nextFilters[input.dataset.rangeFilter] = input.value.trim();
  });
  selectFilterInputs.forEach((input) => {
    nextFilters[input.dataset.selectFilter] = input.value;
  });
  lotUnitInputs.forEach((input) => {
    if (input.checked) {
      nextFilters.lotUnit = input.value;
    }
  });

  return nextFilters;
};

const closeFilterMenus = () => {
  filterMenus.forEach((menu) => {
    menu.open = false;
  });
};

const applyAdvancedFilters = () => {
  const query = getSearchQueryValue(searchInput.value);
  activeArea = query ? "" : REGIONAL_AREA;
  updateUrl(query, activeFilter, activeArea);
  fetchListings({ append: false });
};

const setActiveView = (view) => {
  activeView = view === "list" ? "list" : "images";

  if (resultsList) {
    resultsList.classList.toggle("is-list-view", activeView === "list");
    resultsList.classList.toggle("is-image-view", activeView === "images");
  }

  viewButtons.forEach((button) => {
    const isActive = button.dataset.view === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
};

const buildSearchUrl = (offset = 0) => {
  const endpoint = getSearchEndpoint();
  const url = new URL(endpoint, window.location.href);
  const query = getSearchQueryValue();

  if (query) {
    url.searchParams.set("q", query);
  } else if (activeArea) {
    url.searchParams.set("area", activeArea);
  }
  if (activeFilter !== "all") {
    url.searchParams.set("propertyType", activeFilter);
  }
  if (activePriceRange !== "any") {
    url.searchParams.set("priceRange", activePriceRange);
  }
  ADVANCED_FILTER_KEYS.forEach((key) => {
    const value = activeAdvancedFilters[key];
    const defaultValue = ADVANCED_FILTER_DEFAULTS[key];
    if (typeof defaultValue === "boolean") {
      if (value) url.searchParams.set(key, "true");
      return;
    }
    if (value && value !== defaultValue) {
      url.searchParams.set(key, value);
    }
  });
  if (activeSort) {
    url.searchParams.set("sort", activeSort);
  }
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("photoLimit", "12");
  if (offset > 0) {
    url.searchParams.set("offset", String(offset));
  }

  return url.toString();
};

const formatMeta = (listing) => [
  `${listing.beds ?? "-"} beds`,
  `${listing.baths ?? "-"} baths`,
  `${listing.sqft ?? "-"} sq ft`,
  listing.type || "Residential"
].filter(Boolean);

const buildImageMarkup = (listing, className = "") => {
  const title = listing.title || listing.address || "Property photo";
  if (listing.image) {
    return `<img class="${className}" src="${escapeHTML(listing.image)}" alt="${escapeHTML(title)}">`;
  }

  return `<div class="result-photo-placeholder ${className}" role="img" aria-label="Photo unavailable">Photo unavailable</div>`;
};

const formatMapPrice = (listing) => {
  const price = Number(listing.listPrice);
  if (!Number.isFinite(price)) {
    return listing.price || "Active";
  }
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(price >= 10000000 ? 0 : 2).replace(/\.00$/, "")}M`;
  }
  return `$${Math.round(price / 1000)}k`;
};

const createListingCard = (listing, index) => {
  const title = listing.title || listing.address || "Address available on request";
  const location = [listing.city, listing.state, listing.zip].filter(Boolean).join(" ");
  const meta = formatMeta(listing);
  const photos = Array.isArray(listing.photos) && listing.photos.length ? listing.photos : [listing.image].filter(Boolean);
  const hasCarousel = photos.length > 1;
  const photoTotal = listing.photoCount || photos.length || 1;
  const firstPhoto = photos[0] || listing.image || "";

  return `
    <article class="search-listing-card" data-listing-index="${index}" data-photo-index="0">
      <div class="search-listing-photo" data-open-listing="true">
        ${firstPhoto
          ? `<img src="${escapeHTML(firstPhoto)}" alt="${escapeHTML(title)}">`
          : '<div class="result-photo-placeholder" role="img" aria-label="Photo unavailable">Photo unavailable</div>'}
        <span class="result-badge">${escapeHTML(listing.status || "Active")}</span>
        ${hasCarousel ? `
          <span class="listing-photo-count" aria-live="polite">1/${escapeHTML(photoTotal)}</span>
          <button class="listing-carousel-control is-prev" type="button" data-carousel-action="prev" aria-label="Previous photo for ${escapeHTML(title)}">
            <span aria-hidden="true">‹</span>
          </button>
          <button class="listing-carousel-control is-next" type="button" data-carousel-action="next" aria-label="Next photo for ${escapeHTML(title)}">
            <span aria-hidden="true">›</span>
          </button>
        ` : ""}
      </div>
      <button class="listing-card-button" type="button" aria-label="View details for ${escapeHTML(title)}">
        <div class="search-listing-copy">
          <div>
            <div class="result-price">${escapeHTML(listing.price || "Price available on request")}</div>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(location)}</p>
          </div>
          <div class="result-meta">
            ${meta.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}
          </div>
          <span class="listing-detail-link">View Details</span>
        </div>
      </button>
    </article>
  `;
};

const updateListingPhoto = (card, direction) => {
  const listingIndex = Number(card.dataset.listingIndex);
  const listing = currentListings[listingIndex];
  const photos = Array.isArray(listing?.photos) && listing.photos.length ? listing.photos : [listing?.image].filter(Boolean);
  if (!listing || photos.length < 2) {
    return;
  }

  const currentIndex = Number(card.dataset.photoIndex || 0);
  const nextIndex = direction === "prev"
    ? (currentIndex - 1 + photos.length) % photos.length
    : (currentIndex + 1) % photos.length;
  const image = card.querySelector(".search-listing-photo img");
  const counter = card.querySelector(".listing-photo-count");
  const title = listing.title || listing.address || "Property photo";

  card.dataset.photoIndex = String(nextIndex);
  if (image) {
    image.src = photos[nextIndex];
    image.alt = `${title} photo ${nextIndex + 1}`;
  }
  if (counter) {
    counter.textContent = `${nextIndex + 1}/${listing.photoCount || photos.length}`;
  }
};

const initMap = () => {
  if (!mapElement || !window.L) {
    if (mapFallback) {
      mapFallback.hidden = false;
    }
    return;
  }

  listingMap = L.map(mapElement, {
    scrollWheelZoom: false
  }).setView([27.44, -82.55], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(listingMap);

  markerGroup = L.layerGroup().addTo(listingMap);
};

const focusListingCard = (index) => {
  const card = resultsList.querySelector(`[data-listing-index="${index}"] .listing-card-button`);
  if (card) {
    card.focus({ preventScroll: true });
  }
};

const updateMap = (listings) => {
  if (!listingMap || !markerGroup) {
    return;
  }

  markerGroup.clearLayers();
  const bounds = [];

  listings.forEach((listing, index) => {
    if (typeof listing.latitude !== "number" || typeof listing.longitude !== "number") {
      return;
    }

    const marker = L.marker([listing.latitude, listing.longitude], {
      icon: L.divIcon({
        className: "price-marker",
        html: `<span>${escapeHTML(formatMapPrice(listing))}</span>`,
        iconSize: [74, 32],
        iconAnchor: [37, 16]
      })
    })
      .bindTooltip(listing.title || "Active listing", {
        direction: "top",
        offset: [0, -16]
      })
      .on("click", () => {
        openListingDetail(index);
        focusListingCard(index);
      });

    marker.addTo(markerGroup);
    bounds.push([listing.latitude, listing.longitude]);
  });

  if (bounds.length) {
    if (activeArea === REGIONAL_AREA) {
      listingMap.setView(REGIONAL_CENTER, REGIONAL_ZOOM);
      return;
    }

    listingMap.fitBounds(bounds, {
      padding: [34, 34],
      maxZoom: 13
    });
  }
};

const renderResults = (listings, { append = false, startIndex = 0 } = {}) => {
  if (!resultsList || !resultsStatus) {
    return;
  }

  if (!append) {
    detailPanel.hidden = true;
    detailPanel.innerHTML = "";
  }
  resultsList.hidden = false;
  resultsList.setAttribute("aria-busy", "false");
  updateResultsHeading();

  if (!listings.length) {
    if (!append) {
      resultsList.innerHTML = '<p class="no-results">No matching active homes found. Try another location or contact Ricki for a custom search.</p>';
      resultsStatus.textContent = "No matching active homes found.";
    }
    return;
  }

  setActiveView(activeView);
  const markup = listings.map((listing, index) => createListingCard(listing, startIndex + index)).join("");
  if (append) {
    resultsList.insertAdjacentHTML("beforeend", markup);
  } else {
    resultsList.innerHTML = markup;
  }
  resultsStatus.textContent = `Showing ${currentListings.length} active listing${currentListings.length === 1 ? "" : "s"} from Stellar MLS.`;
};

const buildDetailGrid = (listing) => {
  const details = [
    ["MLS", listing.mls],
    ["Status", listing.status],
    ["Property Type", listing.type],
    ["Year Built", listing.yearBuilt],
    ["Subdivision", listing.subdivision],
    ["County", listing.county],
    ["Garage", listing.garageSpaces ? `${listing.garageSpaces} spaces` : ""],
    ["Lot Size", listing.lotSize ? `${listing.lotSize} sq ft` : ""]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  return details.map(([label, value]) => `
    <div>
      <dt>${escapeHTML(label)}</dt>
      <dd>${escapeHTML(value)}</dd>
    </div>
  `).join("");
};

const openListingDetail = (index) => {
  const listing = currentListings[index];
  if (!listing || !detailPanel) {
    return;
  }

  const title = listing.title || listing.address || "Address available on request";
  const location = [listing.city, listing.state, listing.zip].filter(Boolean).join(" ");
  const photos = Array.isArray(listing.photos) && listing.photos.length ? listing.photos : [listing.image].filter(Boolean);
  const firstPhoto = photos[0] || "";
  const remarks = listing.remarks || "Contact Ricki for complete property details and current showing availability.";

  if (searchToolbar) {
    searchToolbar.hidden = true;
  }
  if (searchShell) {
    searchShell.hidden = true;
  }
  detailPanel.hidden = false;
  detailPanel.innerHTML = `
    <div class="listing-detail-gallery" aria-label="Property photos">
      <div class="detail-gallery-main">
        ${firstPhoto ? `<img src="${escapeHTML(firstPhoto)}" alt="${escapeHTML(title)}">` : '<div class="result-photo-placeholder" role="img" aria-label="Photo unavailable">Photo unavailable</div>'}
      </div>
      ${photos.slice(1, 7).map((photo, photoIndex) => `
        <img src="${escapeHTML(photo)}" alt="${escapeHTML(title)} photo ${photoIndex + 2}">
      `).join("")}
      <span class="photo-count">${escapeHTML(listing.photoCount || photos.length)} photos</span>
    </div>
    <div class="listing-detail-actions">
      <button class="back-to-results" type="button">Back</button>
      <div>
        <a href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Save</a>
        <a href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Share</a>
        <a class="detail-request-button" href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Request More Info</a>
      </div>
    </div>
    <div class="listing-detail-layout">
      <div class="listing-detail-copy">
        <div>
          <div class="detail-price">${escapeHTML(listing.price || "Price available on request")}</div>
          <h1>${escapeHTML(title)}</h1>
          <p>${escapeHTML(location)}</p>
        </div>
        <div class="result-meta detail-meta">
          ${formatMeta(listing).map((item) => `<span>${escapeHTML(item)}</span>`).join("")}
        </div>
        <p>${escapeHTML(remarks)}</p>
        <dl class="listing-detail-grid">
          ${buildDetailGrid(listing)}
        </dl>
      </div>
      <aside class="detail-agent-card" aria-label="Contact Ricki about this property">
        <p class="eyebrow">Listed in Stellar MLS</p>
        <h2>Ask Ricki about this home.</h2>
        <p>Ricki can help you review the listing details, neighborhood fit, and next steps before scheduling a showing.</p>
        <a class="button primary" href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Request More Info</a>
        <a class="button secondary" href="tel:+19414481632">Call 941-448-1632</a>
      </aside>
    </div>
  `;

  updateListingUrl(listing);

  const backButton = detailPanel.querySelector(".back-to-results");
  if (backButton) {
    backButton.addEventListener("click", () => {
      const params = getQueryParams();
      updateUrl(params.q, activeFilter, activeArea);
      showResultsView();
      focusListingCard(index);
    });
  }

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto"
  });
};

const openListingFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const listingId = params.get("listing");
  if (!listingId || !currentListings.length) {
    return;
  }

  const index = currentListings.findIndex((listing) => listing.mls === listingId || listing.id === listingId);
  if (index >= 0) {
    openListingDetail(index);
  }
};

const setLoadMoreMessage = (message = "") => {
  if (loadMoreStatus) {
    loadMoreStatus.textContent = message;
  }
};

const fetchListings = async ({ append = false } = {}) => {
  if (!resultsList || !resultsStatus) {
    return;
  }
  if (isLoadingListings) {
    return;
  }

  const requestKey = getRequestKey();
  if (!append || requestKey !== lastRequestKey) {
    currentOffset = 0;
    hasMoreListings = true;
    currentListings = [];
    lastRequestKey = requestKey;
  }
  if (append && !hasMoreListings) {
    return;
  }

  isLoadingListings = true;
  showResultsView();
  resultsList.hidden = false;
  detailPanel.hidden = true;
  resultsList.setAttribute("aria-busy", "true");
  if (append) {
    setLoadMoreMessage("Loading more active listings...");
  } else {
    resultsList.innerHTML = '<p class="no-results">Searching active Stellar MLS listings...</p>';
    resultsStatus.textContent = "Searching active Stellar MLS listings.";
    setLoadMoreMessage("");
  }

  try {
    const response = await fetch(buildSearchUrl(currentOffset), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("MLS search request failed.");
    }

    const data = await response.json();
    const nextListings = Array.isArray(data) ? data : data.listings || data.results || [];
    const startIndex = currentListings.length;
    currentListings = append ? [...currentListings, ...nextListings] : nextListings;
    currentOffset = currentListings.length;
    hasMoreListings = nextListings.length >= PAGE_LIMIT;
    renderResults(nextListings, { append, startIndex });
    updateMap(currentListings);
    if (!append) {
      openListingFromUrl();
    }
    setLoadMoreMessage(hasMoreListings ? "" : "All matching listings are loaded.");
  } catch (error) {
    resultsList.setAttribute("aria-busy", "false");
    if (append) {
      setLoadMoreMessage("More listings could not load right now.");
    } else {
      currentListings = [];
      resultsList.innerHTML = '<p class="no-results">The live MLS search could not load. Please try again later or contact Ricki for current listings.</p>';
      resultsStatus.textContent = "The live MLS search could not load.";
    }
  } finally {
    isLoadingListings = false;
  }
};

const initLoadMore = () => {
  if (!loadMoreSentinel || !("IntersectionObserver" in window)) {
    return;
  }

  loadMoreObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting || !hasMoreListings || isLoadingListings || detailPanel?.hidden === false) {
      return;
    }
    fetchListings({ append: true });
  }, {
    root: null,
    rootMargin: "600px 0px 900px",
    threshold: 0
  });

  loadMoreObserver.observe(loadMoreSentinel);
};

if (toggle && nav) {
  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });

  nav.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu();
      toggle.focus();
    }
  });
}

if (resultsList) {
  resultsList.addEventListener("click", (event) => {
    const carouselControl = event.target.closest("[data-carousel-action]");
    if (carouselControl) {
      event.preventDefault();
      event.stopPropagation();
      const carouselCard = carouselControl.closest("[data-listing-index]");
      if (carouselCard) {
        updateListingPhoto(carouselCard, carouselControl.dataset.carouselAction);
      }
      return;
    }

    const card = event.target.closest("[data-listing-index]");
    if (!card) {
      return;
    }

    openListingDetail(Number(card.dataset.listingIndex));
  });
}

if (searchForm && searchInput) {
  const params = getQueryParams();
  activeArea = params.area || (params.q ? "" : REGIONAL_AREA);
  activeSort = params.sort || "newest";
  activePriceRange = params.priceRange || "any";
  activeAdvancedFilters = params.advanced || { ...ADVANCED_FILTER_DEFAULTS };
  searchInput.value = params.q || getPresetLabel(params.propertyType);
  if (activeArea === REGIONAL_AREA && !params.q) {
    searchInput.placeholder = "Sarasota / Lakewood Ranch";
  }
  setActiveFilter(params.propertyType);
  setActivePriceRange(activePriceRange);
  setActiveAdvancedFilters(activeAdvancedFilters);
  updateResultsHeading();
  setActiveView(params.view);
  if (sortSelect) {
    sortSelect.value = activeSort;
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const presetFilter = getPresetFilterFromValue(searchInput.value);
    if (presetFilter) {
      setActiveFilter(presetFilter);
    }
    const query = getSearchQueryValue(searchInput.value);
    activeArea = query ? "" : REGIONAL_AREA;
    updateUrl(query, activeFilter, activeArea);
    fetchListings({ append: false });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveFilter(button.dataset.filter);
      const query = getSearchQueryValue(searchInput.value);
      activeArea = query ? "" : REGIONAL_AREA;
      updateUrl(query, activeFilter, activeArea);
      closeFilterMenus();
      fetchListings({ append: false });
    });
  });

  priceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActivePriceRange(button.dataset.priceRange);
      const query = getSearchQueryValue(searchInput.value);
      activeArea = query ? "" : REGIONAL_AREA;
      updateUrl(query, activeFilter, activeArea);
      closeFilterMenus();
      fetchListings({ append: false });
    });
  });

  bedroomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        bedrooms: button.dataset.bedrooms
      });
      applyAdvancedFilters();
    });
  });

  bathroomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        bathrooms: button.dataset.bathrooms
      });
      applyAdvancedFilters();
    });
  });

  filterToggles.forEach((input) => {
    input.addEventListener("change", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        [input.dataset.filterToggle]: input.checked
      });
      applyAdvancedFilters();
    });
  });

  exactFilterInputs.forEach((input) => {
    input.addEventListener("change", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        [`${input.dataset.exactFilter}Exact`]: input.checked
      });
      applyAdvancedFilters();
    });
  });

  rangeFilterInputs.forEach((input) => {
    input.addEventListener("input", () => {
      activeAdvancedFilters = {
        ...activeAdvancedFilters,
        [input.dataset.rangeFilter]: input.value.trim()
      };
      if (featureLabel) {
        featureLabel.textContent = getAdvancedFilterSummary();
      }
    });

    input.addEventListener("change", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        [input.dataset.rangeFilter]: input.value.trim()
      });
      applyAdvancedFilters();
    });
  });

  selectFilterInputs.forEach((input) => {
    input.addEventListener("change", () => {
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        [input.dataset.selectFilter]: input.value
      });
      applyAdvancedFilters();
    });
  });

  lotUnitInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }
      setActiveAdvancedFilters({
        ...activeAdvancedFilters,
        lotUnit: input.value
      });
      applyAdvancedFilters();
    });
  });

  if (resetAdvancedFiltersButton) {
    resetAdvancedFiltersButton.addEventListener("click", () => {
      setActiveAdvancedFilters({ ...ADVANCED_FILTER_DEFAULTS });
      applyAdvancedFilters();
    });
  }

  if (closeAdvancedFiltersButton) {
    closeAdvancedFiltersButton.addEventListener("click", () => {
      setActiveAdvancedFilters(getAdvancedFiltersFromControls());
      applyAdvancedFilters();
      closeFilterMenus();
    });
  }

  filterMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) {
        return;
      }
      filterMenus.forEach((otherMenu) => {
        if (otherMenu !== menu) {
          otherMenu.open = false;
        }
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-menu")) {
      closeFilterMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFilterMenus();
    }
  });

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      activeSort = sortSelect.value || "newest";
      updateUrl(searchInput.value.trim(), activeFilter, activeArea);
      fetchListings({ append: false });
    });
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.view);
      updateUrl(searchInput.value.trim(), activeFilter, activeArea);
    });
  });
}

window.addEventListener("popstate", () => {
  const params = getQueryParams();
  activeArea = params.area || (params.q ? "" : REGIONAL_AREA);
  activeSort = params.sort || "newest";
  activePriceRange = params.priceRange || "any";
  activeAdvancedFilters = params.advanced || { ...ADVANCED_FILTER_DEFAULTS };
  searchInput.value = params.q || getPresetLabel(params.propertyType);
  searchInput.placeholder = activeArea === REGIONAL_AREA && !params.q
    ? "Sarasota / Lakewood Ranch"
    : "Search by address, neighborhood, school, city or zip";
  setActiveFilter(params.propertyType);
  setActivePriceRange(activePriceRange);
  setActiveAdvancedFilters(activeAdvancedFilters);
  updateResultsHeading();
  setActiveView(params.view);
  if (sortSelect) {
    sortSelect.value = activeSort;
  }
  const listingId = new URLSearchParams(window.location.search).get("listing");
  if (listingId && currentListings.length) {
    openListingFromUrl();
    return;
  }
  showResultsView();
  fetchListings({ append: false });
});

initMap();
initLoadMore();
fetchListings({ append: false });
