const { fetchListings } = require("../bridge-listings.cjs");

const getQueryParam = (req, key) => {
  const parsedUrl = new URL(req.url, "http://localhost");
  return parsedUrl.searchParams.get(key) || "";
};

module.exports = async function listingsHandler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const data = await fetchListings({
      query: getQueryParam(req, "q"),
      area: getQueryParam(req, "area"),
      propertyType: getQueryParam(req, "propertyType"),
      priceRange: getQueryParam(req, "priceRange") || "any",
      feature: getQueryParam(req, "feature") || "any",
      advancedFilters: {
        bedrooms: getQueryParam(req, "bedrooms") || "any",
        bedroomsExact: getQueryParam(req, "bedroomsExact") === "true",
        bathrooms: getQueryParam(req, "bathrooms") || "any",
        bathroomsExact: getQueryParam(req, "bathroomsExact") === "true",
        sqftMin: getQueryParam(req, "sqftMin"),
        sqftMax: getQueryParam(req, "sqftMax"),
        lotUnit: getQueryParam(req, "lotUnit") || "acres",
        lotMin: getQueryParam(req, "lotMin"),
        lotMax: getQueryParam(req, "lotMax"),
        yearMin: getQueryParam(req, "yearMin"),
        yearMax: getQueryParam(req, "yearMax"),
        garageSpaces: getQueryParam(req, "garageSpaces") || "any",
        garageExact: getQueryParam(req, "garageExact") === "true",
        daysOnMarket: getQueryParam(req, "daysOnMarket") || "any"
      },
      sort: getQueryParam(req, "sort") || "newest",
      limit: getQueryParam(req, "limit"),
      offset: getQueryParam(req, "offset"),
      photoLimit: getQueryParam(req, "photoLimit"),
      token: process.env.BRIDGE_SERVER_TOKEN || process.env.BRIDGE_ACCESS_TOKEN
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.setHeader("X-Ricki-Api", "serverless-cache-v2");
    res.status(200).json(data);
  } catch (error) {
    console.error("Listing search failed", {
      message: error.message,
      statusCode: error.statusCode
    });

    res.status(error.statusCode || 500).json({
      error: "MLS listings could not be loaded right now."
    });
  }
};
