# Adp-Printflow-ai

Browser-only print-layout studio — no backend, nothing uploaded anywhere.

- **Smart Documents Print** — add Aadhar / PAN / Voter ID (or any custom-size document), edges auto-detect and straighten (drag corner handles to fine-tune), then auto-arrange side by side on A4.
  - **Smart ID Print** mode — one fixed card size for everything, packed tight.
  - **Smart Documents Print** mode — mixed sizes, gaps auto-fit.
- **Quick Photo Print** — upload/click a passport photo, auto-crop to 35×45mm (drag to adjust), laid out six across an A4 sheet — choose 6 / 12 / 18 per page.
- Every tool: Download PDF, Download JPEG, or Print directly.

## Run locally
Just open `index.html` in a browser — or serve the folder so the camera and OpenCV.js
load correctly:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy to GitHub Pages
1. Create a new GitHub repo and push this folder's contents to it (this folder is the repo root — `index.html` must sit at the top level).

```bash
cd adp-printflow-ai
git init
git add .
git commit -m "Adp-Printflow-ai"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

2. On GitHub: **Settings → Pages → Source → Deploy from a branch → `main` / root**.
3. Your site goes live at `https://<your-username>.github.io/<your-repo>/`.

## Notes
- Camera capture needs HTTPS (GitHub Pages is HTTPS by default) or `localhost`.
- Edge auto-detection loads OpenCV.js from a CDN on first use; if it's slow/blocked,
  the tools still work with manual corner dragging.
- Everything (image processing, PDF generation, printing) happens client-side in
  the visitor's own browser.

## File map
```
index.html                 landing page
smart-documents.html       Tool 1 — Smart ID / Smart Documents Print
quick-photo.html           Tool 2 — Quick Photo Print
assets/css/style.css       shared design system
assets/js/common.js        mm/px conversion, A4 packing, warp, enhance, export, camera
assets/js/smart-documents.js
assets/js/quick-photo.js
```
