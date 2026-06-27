const BRIDGE_SERVICE_ROOT = "https://api.bridgedataoutput.com/api/v2/OData/stellar";
const BRIDGE_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const BRIDGE_RESPONSE_CACHE_MAX_ENTRIES = 80;
const bridgeResponseCache = new Map();
const pendingBridgeRequests = new Map();

const BASE_FILTERS = [
  "StandardStatus eq 'Active'",
  "IDXParticipationYN eq true",
  "InternetAddressDisplayYN eq true",
  "PropertyType eq 'Residential'"
];

const SELECT_FIELDS = [
  "ListingKey",
  "ListingId",
  "ListPrice",
  "UnparsedAddress",
  "City",
  "StateOrProvince",
  "PostalCode",
  "BedroomsTotal",
  "BathroomsTotalInteger",
  "BathroomsFull",
  "BathroomsHalf",
  "LivingArea",
  "Latitude",
  "Longitude",
  "PublicRemarks",
  "YearBuilt",
  "LotSizeSquareFeet",
  "GarageSpaces",
  "SubdivisionName",
  "CountyOrParish",
  "PropertyType",
  "PropertySubType",
  "MlsStatus",
  "StandardStatus",
  "Media",
  "PhotosCount",
  "PoolPrivateYN",
  "OnMarketDate",
  "ListingContractDate",
  "ModificationTimestamp"
].join(",");

const toTitleCase = (value) => String(value || "")
  .toLowerCase()
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  .replace(/\bFl\b/g, "FL");

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatPrice = (value) => {
  const number = toNumber(value);
  if (number === null) {
    return "Price available on request";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(number);
};

const formatNumber = (value) => {
  const number = toNumber(value);
  return number === null ? "" : new Intl.NumberFormat("en-US").format(number);
};

const escapeODataString = (value) => String(value || "")
  .trim()
  .slice(0, 80)
  .replace(/'/g, "''")
  .toLowerCase();

const rememberBridgeResponse = (key, data) => {
  bridgeResponseCache.set(key, {
    data,
    expiresAt: Date.now() + BRIDGE_RESPONSE_CACHE_TTL_MS
  });

  if (bridgeResponseCache.size > BRIDGE_RESPONSE_CACHE_MAX_ENTRIES) {
    bridgeResponseCache.delete(bridgeResponseCache.keys().next().value);
  }
};

const buildLocalCountyFilter = () => `(${[
  "tolower(CountyOrParish) eq 'manatee'",
  "tolower(CountyOrParish) eq 'sarasota'"
].join(" or ")})`;

const getOrderedPhotos = (listing) => {
  const media = Array.isArray(listing.Media) ? listing.Media : [];
  return media
    .filter((item) => item && item.MediaURL)
    .sort((first, second) => Number(first.Order ?? 999) - Number(second.Order ?? 999));
};

const getPhotoGallery = (listing, limit = 48) => {
  const urls = getOrderedPhotos(listing).map((photo) => photo.MediaURL);
  if (!urls.length) {
    return [];
  }

  const leadPhoto = getFirstPhoto(listing) || urls[0];
  const gallery = [leadPhoto];
  const remaining = urls.filter((url) => url !== leadPhoto);
  const step = Math.max(1, Math.floor(remaining.length / Math.max(limit - 1, 1)));

  for (let index = 0; index < remaining.length && gallery.length < limit; index += step) {
    gallery.push(remaining[index]);
  }

  return gallery;
};

const getFirstPhoto = (listing) => {
  const photos = getOrderedPhotos(listing);

  if (photos.length > 1) {
    const key = String(listing.ListingKey || listing.ListingId || "");
    const hash = Array.from(key).reduce((total, character) => total + character.charCodeAt(0), 0);
    return photos[1 + (hash % (photos.length - 1))].MediaURL;
  }

  const photo = photos[0];
  return photo ? photo.MediaURL : "";
};

const buildSearchFilter = (query) => {
  const cleaned = escapeODataString(query);
  if (!cleaned) {
    return "";
  }

  if (/^\d{5}$/.test(cleaned)) {
    return `PostalCode eq '${cleaned}'`;
  }

  if (cleaned.includes("lakewood ranch")) {
    return `(${[
      "tolower(City) eq 'lakewood ranch'",
      "contains(tolower(SubdivisionName),'lakewood ranch')",
      "contains(tolower(MLSAreaMajor),'lakewood ranch')",
      "PostalCode eq '34202'",
      "PostalCode eq '34211'",
      "PostalCode eq '34240'"
    ].join(" or ")}) and ${buildLocalCountyFilter()}`;
  }

  const clauses = [
    `contains(tolower(City),'${cleaned}')`,
    `contains(tolower(UnparsedAddress),'${cleaned}')`,
    `contains(tolower(PostalCode),'${cleaned}')`,
    `contains(tolower(SubdivisionName),'${cleaned}')`,
    `contains(tolower(MLSAreaMajor),'${cleaned}')`,
    `contains(tolower(ListingId),'${cleaned}')`
  ];

  return `(${clauses.join(" or ")})`;
};

const buildAreaFilter = (area) => {
  switch (String(area || "").toLowerCase()) {
    case "sarasota-lakewood-ranch":
      return `(${[
        "tolower(City) eq 'sarasota'",
        "tolower(City) eq 'bradenton'",
        "contains(tolower(SubdivisionName),'lakewood ranch')",
        "contains(tolower(MLSAreaMajor),'lakewood ranch')"
      ].join(" or ")}) and ${buildLocalCountyFilter()}`;
    default:
      return "";
  }
};

const buildTypeFilter = (propertyType) => {
  switch (String(propertyType || "").toLowerCase()) {
    case "single family":
      return "PropertySubType eq 'Single Family Residence'";
    case "condo":
      return "PropertySubType eq 'Condominium'";
    case "pool":
      return "PoolPrivateYN eq true";
    default:
      return "";
  }
};

const buildPriceFilter = (priceRange) => {
  switch (String(priceRange || "").toLowerCase()) {
    case "under-500":
      return "ListPrice le 500000";
    case "500-750":
      return "(ListPrice ge 500000 and ListPrice le 750000)";
    case "750-1000":
      return "(ListPrice ge 750000 and ListPrice le 1000000)";
    case "1m-plus":
      return "ListPrice ge 1000000";
    default:
      return "";
  }
};

const buildFeatureFilter = (feature) => {
  switch (String(feature || "").toLowerCase()) {
    case "beds-2":
      return "BedroomsTotal ge 2";
    case "beds-3":
      return "BedroomsTotal ge 3";
    case "baths-2":
      return "BathroomsTotalInteger ge 2";
    case "garage":
      return "GarageSpaces ge 1";
    default:
      return "";
  }
};

const cleanNumber = (value) => {
  if (value === null || value === undefined || value === "" || value === "any") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const buildRangeFilters = ({ field, min, max }) => {
  const filters = [];
  const minValue = cleanNumber(min);
  const maxValue = cleanNumber(max);

  if (minValue !== null) {
    filters.push(`${field} ge ${minValue}`);
  }
  if (maxValue !== null) {
    filters.push(`${field} le ${maxValue}`);
  }

  return filters;
};

const buildAdvancedFilters = (advancedFilters = {}) => {
  const filters = [];
  const bedrooms = cleanNumber(advancedFilters.bedrooms);
  const bathrooms = cleanNumber(advancedFilters.bathrooms);
  const garageSpaces = cleanNumber(advancedFilters.garageSpaces);
  const daysOnMarket = cleanNumber(advancedFilters.daysOnMarket);
  const lotMultiplier = advancedFilters.lotUnit === "acres" ? 43560 : 1;
  const lotMin = cleanNumber(advancedFilters.lotMin);
  const lotMax = cleanNumber(advancedFilters.lotMax);

  if (bedrooms !== null) {
    filters.push(`BedroomsTotal ${advancedFilters.bedroomsExact ? "eq" : "ge"} ${bedrooms}`);
  }
  if (bathrooms !== null) {
    filters.push(`BathroomsTotalInteger ${advancedFilters.bathroomsExact ? "eq" : "ge"} ${bathrooms}`);
  }
  filters.push(...buildRangeFilters({
    field: "LivingArea",
    min: advancedFilters.sqftMin,
    max: advancedFilters.sqftMax
  }));
  if (lotMin !== null) {
    filters.push(`LotSizeSquareFeet ge ${Math.round(lotMin * lotMultiplier)}`);
  }
  if (lotMax !== null) {
    filters.push(`LotSizeSquareFeet le ${Math.round(lotMax * lotMultiplier)}`);
  }
  filters.push(...buildRangeFilters({
    field: "YearBuilt",
    min: advancedFilters.yearMin,
    max: advancedFilters.yearMax
  }));
  if (garageSpaces !== null) {
    filters.push(`GarageSpaces ${advancedFilters.garageExact ? "eq" : "ge"} ${garageSpaces}`);
  }
  if (daysOnMarket !== null && daysOnMarket > 0) {
    const startDate = new Date(Date.now() - (daysOnMarket * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    filters.push(`OnMarketDate ge ${startDate}`);
  }

  return filters;
};

const buildOrderBy = (sort) => {
  switch (String(sort || "").toLowerCase()) {
    case "price-high":
      return "ListPrice desc";
    case "price-low":
      return "ListPrice asc";
    case "updated":
      return "ModificationTimestamp desc";
    case "availability":
      return "OnMarketDate desc";
    case "newest":
    default:
      return "ListingContractDate desc";
  }
};

const normalizeListing = (listing, photoLimit = 48) => ({
  id: listing.ListingKey,
  mls: listing.ListingId,
  title: toTitleCase(listing.UnparsedAddress || "Address available on request"),
  address: toTitleCase(listing.UnparsedAddress || ""),
  city: toTitleCase(listing.City || ""),
  state: listing.StateOrProvince || "FL",
  zip: listing.PostalCode || "",
  price: formatPrice(listing.ListPrice),
  listPrice: toNumber(listing.ListPrice),
  beds: listing.BedroomsTotal ?? "-",
  baths: listing.BathroomsTotalInteger ?? "-",
  bathroomsFull: listing.BathroomsFull ?? "",
  bathroomsHalf: listing.BathroomsHalf ?? "",
  sqft: listing.LivingArea ? new Intl.NumberFormat("en-US").format(listing.LivingArea) : "-",
  livingArea: toNumber(listing.LivingArea),
  latitude: toNumber(listing.Latitude),
  longitude: toNumber(listing.Longitude),
  remarks: listing.PublicRemarks || "",
  yearBuilt: listing.YearBuilt || "",
  lotSize: formatNumber(listing.LotSizeSquareFeet),
  garageSpaces: listing.GarageSpaces ?? "",
  subdivision: toTitleCase(listing.SubdivisionName || ""),
  county: toTitleCase(listing.CountyOrParish || ""),
  type: listing.PropertySubType || listing.PropertyType || "Residential",
  status: listing.MlsStatus || listing.StandardStatus || "Active",
  image: getFirstPhoto(listing),
  photos: getPhotoGallery(listing, photoLimit),
  photoCount: listing.PhotosCount || (Array.isArray(listing.Media) ? listing.Media.length : 0),
  onMarketDate: listing.OnMarketDate || "",
  listingContractDate: listing.ListingContractDate || "",
  updatedAt: listing.ModificationTimestamp || "",
  detailUrl: `https://www.realtor.com/realestateandhomes-detail/${encodeURIComponent(listing.ListingId || listing.ListingKey || "")}`
});

const fetchListings = async ({
  query = "",
  area = "",
  propertyType = "all",
  priceRange = "any",
  feature = "any",
  advancedFilters = {},
  sort = "newest",
  limit = 12,
  offset = 0,
  photoLimit = 48,
  token
}) => {
  if (!token) {
    const error = new Error("Bridge API token is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 48);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safePhotoLimit = Math.min(Math.max(Number(photoLimit) || 48, 1), 48);
  const filters = [
    ...BASE_FILTERS,
    "PhotosCount gt 0",
    buildSearchFilter(query),
    query ? "" : buildAreaFilter(area),
    buildTypeFilter(propertyType),
    buildPriceFilter(priceRange),
    buildFeatureFilter(feature),
    ...buildAdvancedFilters(advancedFilters)
  ].filter(Boolean);
  const url = new URL(`${BRIDGE_SERVICE_ROOT}/Property`);

  url.searchParams.set("$top", String(safeLimit));
  if (safeOffset > 0) {
    url.searchParams.set("$skip", String(safeOffset));
  }
  url.searchParams.set("$select", SELECT_FIELDS);
  url.searchParams.set("$filter", filters.join(" and "));
  url.searchParams.set("$orderby", buildOrderBy(sort));

  const cacheKey = url.toString();
  const cached = bridgeResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let request = pendingBridgeRequests.get(cacheKey);
  if (!request) {
    request = (async () => {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const details = await response.text();
        const error = new Error(`Bridge API request failed with ${response.status}.`);
        error.statusCode = response.status;
        error.details = details;
        throw error;
      }

      const data = await response.json();
      const listings = Array.isArray(data.value)
        ? data.value.map((listing) => normalizeListing(listing, safePhotoLimit))
        : [];

      const normalized = {
        listings,
        count: listings.length,
        source: "Bridge/Stellar MLS",
        generatedAt: new Date().toISOString()
      };

      rememberBridgeResponse(cacheKey, normalized);
      return normalized;
    })().finally(() => {
      pendingBridgeRequests.delete(cacheKey);
    });
    pendingBridgeRequests.set(cacheKey, request);
  }

  return request;
};

module.exports = {
  fetchListings
};
