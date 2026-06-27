import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchListings } = require("./bridge-listings.cjs");

const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const listingsCache = new Map();
const pendingListingsRequests = new Map();
const LISTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const LISTINGS_CACHE_MAX_ENTRIES = 80;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const sendJson = (res, statusCode, data, cacheControl = "no-store") => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
};

const getListingsCacheKey = (url) => {
  const params = [...url.searchParams.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB));
  return new URLSearchParams(params).toString();
};

const rememberListings = (key, data) => {
  listingsCache.set(key, {
    data,
    expiresAt: Date.now() + LISTINGS_CACHE_TTL_MS
  });

  if (listingsCache.size > LISTINGS_CACHE_MAX_ENTRIES) {
    listingsCache.delete(listingsCache.keys().next().value);
  }
};

const serveStatic = async (req, res) => {
  const requestedPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath === "/" ? "index.html" : safePath);
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
  });
  res.end(body);
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/listings") {
      const cacheKey = getListingsCacheKey(url);
      const cached = listingsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        sendJson(res, 200, cached.data, "public, max-age=60, stale-while-revalidate=300");
        return;
      }

      let request = pendingListingsRequests.get(cacheKey);
      if (!request) {
        request = fetchListings({
          query: url.searchParams.get("q") || "",
          area: url.searchParams.get("area") || "",
          propertyType: url.searchParams.get("propertyType") || "all",
          priceRange: url.searchParams.get("priceRange") || "any",
          feature: url.searchParams.get("feature") || "any",
          advancedFilters: {
            bedrooms: url.searchParams.get("bedrooms") || "any",
            bedroomsExact: url.searchParams.get("bedroomsExact") === "true",
            bathrooms: url.searchParams.get("bathrooms") || "any",
            bathroomsExact: url.searchParams.get("bathroomsExact") === "true",
            sqftMin: url.searchParams.get("sqftMin") || "",
            sqftMax: url.searchParams.get("sqftMax") || "",
            lotUnit: url.searchParams.get("lotUnit") || "acres",
            lotMin: url.searchParams.get("lotMin") || "",
            lotMax: url.searchParams.get("lotMax") || "",
            yearMin: url.searchParams.get("yearMin") || "",
            yearMax: url.searchParams.get("yearMax") || "",
            garageSpaces: url.searchParams.get("garageSpaces") || "any",
            garageExact: url.searchParams.get("garageExact") === "true",
            daysOnMarket: url.searchParams.get("daysOnMarket") || "any"
          },
          sort: url.searchParams.get("sort") || "newest",
          limit: url.searchParams.get("limit") || "12",
          offset: url.searchParams.get("offset") || "0",
          photoLimit: url.searchParams.get("photoLimit") || "48",
          token: process.env.BRIDGE_SERVER_TOKEN || process.env.BRIDGE_ACCESS_TOKEN
        }).then((data) => {
          rememberListings(cacheKey, data);
          return data;
        }).finally(() => {
          pendingListingsRequests.delete(cacheKey);
        });
        pendingListingsRequests.set(cacheKey, request);
      }

      const data = await request;
      sendJson(res, 200, data, "public, max-age=60, stale-while-revalidate=300");
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    sendJson(res, error.statusCode || 500, {
      error: "Request failed."
    });
  }
}).listen(port, () => {
  console.log(`Ricki Rubin site running at http://localhost:${port}/`);
});
