# Ricki Rubin Real Estate Website

Static marketing website for Ricki Rubin, Realtor with Horizon Realty International.

## Local Preview

Open `index.html` in a browser, or serve the folder with any static file server.

## GitHub Pages Deployment

This repository is configured for GitHub Pages through `.github/workflows/deploy-pages.yml`.

After the repository is pushed to GitHub:

1. Open the repository settings on GitHub.
2. Go to **Pages**.
3. Set the source to **GitHub Actions**.
4. Push to `main` to deploy the site.

The workflow publishes the repository root, so `index.html`, `styles.css`, and `script.js` are served directly.

## FTP Host Deployment

This repository is also configured for FTP deployment through `.github/workflows/deploy-ftp.yml`.

Add these repository secrets in **Settings > Secrets and variables > Actions**:

- `FTP_SERVER`: FTP hostname from the web host
- `FTP_USERNAME`: FTP account username
- `FTP_PASSWORD`: FTP account password
- `FTP_SERVER_DIR`: destination folder on the server, ending with `/`

Example `FTP_SERVER_DIR`:

```text
/home/rickbida/rickirubin.com/mrrr941/
```

Push to `main` or run the workflow manually to upload the site to the host.
