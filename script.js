const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");
const searchForm = document.querySelector(".search-panel");
const searchInput = document.querySelector("#search-location");
const quickSearchButtons = document.querySelectorAll("[data-search]");
const filterButtons = document.querySelectorAll("[data-filter]");
const resultsGrid = document.querySelector(".results-grid");
const resultsStatus = document.querySelector("#results-status");
const contactForm = document.querySelector(".contact-form");
const contactStatus = document.querySelector("#contact-status");

const idxConfig = window.RICKI_IDX_CONFIG || {};
let activeFilter = "all";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const escapeHTML = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const closeMenu = () => {
  nav.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
};

const setResultsMessage = (message) => {
  resultsGrid.setAttribute("aria-busy", "false");
  resultsGrid.innerHTML = `<p class="no-results">${escapeHTML(message)}</p>`;
  resultsStatus.textContent = message;
};

const formatListingValue = (value, fallback = "Available on request") => value || fallback;

const createListingCard = (listing) => {
  const title = formatListingValue(listing.title || listing.address, "Address available on request");
  const city = formatListingValue(listing.city, "Area details available on request");
  const state = escapeHTML(listing.state || "FL");
  const zip = escapeHTML(listing.zip || "");
  const price = formatListingValue(listing.price);
  const beds = formatListingValue(listing.beds, "-");
  const baths = formatListingValue(listing.baths, "-");
  const sqft = formatListingValue(listing.sqft, "-");
  const mls = formatListingValue(listing.mls || listing.mlsId, "MLS");
  const image = escapeHTML(listing.image || listing.imageUrl || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80");

  return `
    <article class="result-card">
      <img src="${image}" alt="${escapeHTML(title)} in ${escapeHTML(city)}">
      <div class="result-card-body">
        <div>
          <div class="result-price">${escapeHTML(price)}</div>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(city)}, ${state} ${zip}</p>
        </div>
        <div class="result-meta">
          <span>${escapeHTML(beds)} beds</span>
          <span>${escapeHTML(baths)} baths</span>
          <span>${escapeHTML(sqft)} sq ft</span>
          <span>MLS ${escapeHTML(mls)}</span>
        </div>
        <a class="button secondary" href="mailto:ricki.rubin@gmail.com?subject=Real%20Estate%20Inquiry">Ask Ricki</a>
      </div>
    </article>
  `;
};

const buildSearchUrl = () => {
  if (!idxConfig.searchEndpoint) {
    return "";
  }

  const url = new URL(idxConfig.searchEndpoint, window.location.href);
  const query = searchInput.value.trim();
  if (query) {
    url.searchParams.set("q", query);
  }
  if (activeFilter !== "all") {
    url.searchParams.set("propertyType", activeFilter);
  }
  return url.toString();
};

const renderLiveListings = async () => {
  if (!idxConfig.searchEndpoint) {
    setResultsMessage("Live MLS search is not connected yet. Add an IDX or Stellar MLS data endpoint to make this search return current available properties.");
    return;
  }

  resultsStatus.textContent = "Searching live MLS listings...";
  resultsGrid.setAttribute("aria-busy", "true");
  resultsGrid.innerHTML = '<p class="no-results">Searching live MLS listings...</p>';

  try {
    const response = await fetch(buildSearchUrl(), { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error("MLS search request failed.");
    }

    const data = await response.json();
    const listings = Array.isArray(data) ? data : data.listings || data.results || [];

    if (!listings.length) {
      setResultsMessage("No matching homes found. Try another location or contact Ricki for a custom search.");
      return;
    }

    resultsGrid.innerHTML = listings.map(createListingCard).join("");
    resultsGrid.setAttribute("aria-busy", "false");
    resultsStatus.textContent = `${listings.length} active listing${listings.length === 1 ? "" : "s"} found.`;
  } catch (error) {
    setResultsMessage("The live MLS search could not load. Please try again later or contact Ricki for current listings.");
  }
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

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(searchForm);
  const searchIntent = Object.fromEntries(formData.entries());
  sessionStorage.setItem("rickiSearchIntent", JSON.stringify(searchIntent));
  renderLiveListings();
  document.querySelector("#property-results").scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start"
  });
});

quickSearchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.search;
    searchForm.requestSubmit();
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filterButton) => {
      filterButton.classList.remove("is-active");
      filterButton.setAttribute("aria-pressed", "false");
    });
    button.classList.add("is-active");
    button.setAttribute("aria-pressed", "true");
    renderLiveListings();
  });
});

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) {
    return;
  }

  const button = contactForm.querySelector("button");
  button.textContent = "Message Ready";
  button.disabled = true;
  contactStatus.textContent = "Your message is ready. Please email or call Ricki directly to complete your inquiry.";
  contactForm.dataset.state = "submitted";
});

renderLiveListings();
