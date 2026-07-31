# ADP PrintFlow AI

4 fully working, AI-powered print-automation tools — runs entirely in the browser, no login, no backend.

1. **Auto ID Card Print** — front + back of any ID card, auto-cropped, straightened, placed on A4 in real ID size.
2. **Smart Document Print** — any document photo, auto-cropped, straightened, A4-ready.
3. **Smart Photo Print** — face-detect, passport crop, blue background, enhance, 3px border, 6/12/18/24-up A4 layout.
4. **Any Document to PDF** — multi-document upload, each auto-cropped, merged into one PDF.

Every tool offers **JPG download**, **PDF download**, and **direct Print**.

## Tech
- Plain HTML/CSS/JS, no build step
- [OpenCV.js](https://docs.opencv.org/4.x/opencv.js) — edge detection, perspective warp (deskew), CLAHE enhance, Haar-cascade face detection
- [MediaPipe Selfie Segmentation](https://www.npmjs.com/package/@mediapipe/selfie_segmentation) — real-time background removal for passport photos
- [jsPDF](https://github.com/parallax/jsPDF) — PDF export
- All libraries loaded from CDN — needs an internet connection to run

## Deploy on GitHub Pages
1. Create a new GitHub repo and push this folder's contents to it.
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, pick the `main` branch and `/ (root)` folder → **Save**.
4. Your site goes live at `https://<username>.github.io/<repo-name>/` within a minute or two.

## Run locally
Just open `index.html` in a browser — no server or build step needed
(a local static server like `python3 -m http.server` is optional, only needed if the browser blocks camera access on `file://`).

## Notes
- All processing happens on-device in the browser — no photo or document is uploaded to any server.
- Camera capture requires HTTPS (GitHub Pages serves HTTPS by default) or `localhost`.
