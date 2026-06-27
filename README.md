# Ricki Rubin Real Estate Website

A lightweight real estate website for Ricki Rubin with a server-side Bridge/Stellar MLS search endpoint.

## Local Preview

The MLS search requires a server process so the Bridge token is not exposed in browser code.

```sh
BRIDGE_SERVER_TOKEN=your_server_token_here node server.mjs
```

Then open `http://localhost:4173/`.

## Deployment

Set `BRIDGE_SERVER_TOKEN` in the hosting provider's environment variables. The browser calls `/api/listings`; the serverless function in `api/listings.js` calls Bridge/Stellar MLS with the protected token.

For a static-only host, MLS search will not work unless that host supports a serverless function or routes `/api/listings` to another backend.

## Files

- `index.html` - page content and structure
- `styles.css` - responsive visual styling based on the main site direction
- `script.js` - mobile navigation and MLS search behavior
- `bridge-listings.cjs` - Bridge/Stellar MLS query and response normalization
- `api/listings.js` - serverless listings endpoint
- `server.mjs` - local preview server with the same `/api/listings` route
