# Ricki Rubin Real Estate Website

Static marketing website for Ricki Rubin, Realtor with Horizon Realty International.

## Local Preview

Open `index.html` in a browser, or serve the folder with any static file server.

## Deployment

This repository is configured for GitHub Pages through `.github/workflows/deploy-pages.yml`.

After the repository is pushed to GitHub:

1. Open the repository settings on GitHub.
2. Go to **Pages**.
3. Set the source to **GitHub Actions**.
4. Push to `main` to deploy the site.

The workflow publishes the repository root, so `index.html`, `styles.css`, and `script.js` are served directly.
