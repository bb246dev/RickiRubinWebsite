const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");
const searchForm = document.querySelector(".search-panel");
const searchInput = document.querySelector("#search-location");
const filterButtons = document.querySelectorAll("[data-filter]");
const resultsGrid = document.querySelector(".results-grid");
const resultsStatus = document.querySelector("#results-status");
const idxConfig = window.RICKI_IDX_CONFIG || {};
const getSearchEndpoint = () => {
  if (window.location.protocol === "file:") {
    return "http://localhost:4173/api/listings";
  }
  return idxConfig.searchEndpoint || "/api/listings";
};
const REGIONAL_AREA = "sarasota-lakewood-ranch";
const PRESET_SEARCH_LABELS = {
  all: "",
  "single family": "Single Family",
  condo: "Condos",
  pool: "Pool Homes"
};
let activeFilter = "all";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const escapeHTML = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const setResultsMessage = (message) => {
  if (!resultsGrid || !resultsStatus) {
    return;
  }

  resultsGrid.setAttribute("aria-busy", "false");
  resultsGrid.innerHTML = `<p class="no-results">${escapeHTML(message)}</p>`;
  resultsStatus.textContent = message;
};

const createListingCard = (listing) => {
  const title = listing.title || listing.address || "Address available on request";
  const location = [listing.city, listing.state, listing.zip].filter(Boolean).join(" ");
  const imageMarkup = listing.image
    ? `<img src="${escapeHTML(listing.image)}" alt="${escapeHTML(title)}">`
    : `<div class="result-photo-placeholder" role="img" aria-label="Photo unavailable">Photo unavailable</div>`;

  return `
    <article class="result-card">
      <div class="result-photo">
        ${imageMarkup}
        <span class="result-badge">${escapeHTML(listing.status || "Active")}</span>
      </div>
      <div class="result-card-body">
        <div>
          <div class="result-price">${escapeHTML(listing.price || "Price available on request")}</div>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(location)}</p>
        </div>
        <div class="result-meta">
          <span>${escapeHTML(listing.beds ?? "-")} beds</span>
          <span>${escapeHTML(listing.baths ?? "-")} baths</span>
          <span>${escapeHTML(listing.sqft ?? "-")} sq ft</span>
          <span>MLS ${escapeHTML(listing.mls || "-")}</span>
        </div>
        <a class="result-link" href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Ask Ricki about this property</a>
      </div>
    </article>
  `;
};

const buildSearchUrl = () => {
  const endpoint = getSearchEndpoint();
  const url = new URL(endpoint, window.location.href);
  const query = getSearchQueryValue();

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.set("area", REGIONAL_AREA);
  }
  if (activeFilter !== "all") {
    url.searchParams.set("propertyType", activeFilter);
  }
  url.searchParams.set("limit", "12");
  url.searchParams.set("photoLimit", "1");

  return url.toString();
};

const getPresetLabel = (filter) => PRESET_SEARCH_LABELS[filter] || "";

const isPresetDisplayValue = (value, filter = activeFilter) => {
  const label = getPresetLabel(filter);
  return Boolean(label && String(value || "").trim().toLowerCase() === label.toLowerCase());
};

const getSearchQueryValue = () => {
  const value = searchInput ? searchInput.value.trim() : "";
  return isPresetDisplayValue(value) ? "" : value;
};

const openSearchPage = () => {
  const url = new URL("./search.html", window.location.href);
  const query = getSearchQueryValue();

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.set("area", REGIONAL_AREA);
  }
  if (activeFilter !== "all") {
    url.searchParams.set("propertyType", activeFilter);
  }

  window.location.href = url.toString();
};

const renderLiveListings = async () => {
  if (!resultsGrid || !resultsStatus) {
    return;
  }

  resultsStatus.textContent = "Searching active Stellar MLS listings...";
  resultsGrid.setAttribute("aria-busy", "true");
  resultsGrid.innerHTML = '<p class="no-results">Searching active Stellar MLS listings...</p>';

  try {
    const response = await fetch(buildSearchUrl(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("MLS search request failed.");
    }

    const data = await response.json();
    const listings = Array.isArray(data) ? data : data.listings || data.results || [];

    if (!listings.length) {
      setResultsMessage("No matching active homes found. Try another location or contact Ricki for a custom search.");
      return;
    }

    resultsGrid.innerHTML = listings.map(createListingCard).join("");
    resultsGrid.setAttribute("aria-busy", "false");
    resultsStatus.textContent = `${listings.length} active listing${listings.length === 1 ? "" : "s"} found through Stellar MLS.`;
  } catch (error) {
    setResultsMessage("The live MLS search could not load. Please try again later or contact Ricki for current listings.");
  }
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

if (searchForm && searchInput) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    openSearchPage();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      searchInput.value = getPresetLabel(activeFilter);
      filterButtons.forEach((filterButton) => {
        filterButton.classList.remove("is-active");
        filterButton.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      openSearchPage();
    });
  });
}
