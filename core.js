/* ===========================================================
   ADP PrintFlow AI — core.js
   Shared image-processing + layout + export utilities.
   Loaded by every tool page.
   =========================================================== */

const PF = (() => {

  const DPI = 200; // working resolution for all print canvases
  const mm2px = (mm) => Math.round((mm / 25.4) * DPI);

  const A4_W = mm2px(210);
  const A4_H = mm2px(297);
  const ID_W = mm2px(85.6);   // real ISO/IEC 7810 ID-1 card size
  const ID_H = mm2px(53.98);
  const PASS_W = mm2px(35);   // standard passport photo
  const PASS_H = mm2px(45);

  /* ---------------- OpenCV loader ---------------- */
  let cvReadyPromise = null;
  function loadOpenCV() {
    if (cvReadyPromise) return cvReadyPromise;
    cvReadyPromise = new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat) { resolve(window.cv); return; }
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.x/opencv.js';
      script.async = true;
      script.onload = () => {
        const check = () => {
          if (window.cv && window.cv.Mat) resolve(window.cv);
          else window.cv['onRuntimeInitialized'] = () => resolve(window.cv);
        };
        // opencv.js sets cv as a factory in some builds; handle both
        if (window.cv && window.cv.then) window.cv.then(resolve);
        else check();
      };
      script.onerror = () => reject(new Error('OpenCV failed to load — check internet connection'));
      document.head.appendChild(script);
    });
    return cvReadyPromise;
  }

  /* ---------------- file/image helpers ---------------- */
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function imageToCanvas(img, maxDim = 1600) {
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    return c;
  }

  /* ---------------- document corner detection + perspective warp ---------------- */
  function orderPoints(pts) {
    // pts: array of {x,y} length 4 -> [tl,tr,br,bl]
    const sum = pts.map(p => p.x + p.y);
    const diff = pts.map(p => p.y - p.x);
    const tl = pts[sum.indexOf(Math.min(...sum))];
    const br = pts[sum.indexOf(Math.max(...sum))];
    const tr = pts[diff.indexOf(Math.min(...diff))];
    const bl = pts[diff.indexOf(Math.max(...diff))];
    return [tl, tr, br, bl];
  }

  function findDocumentCorners(cv, srcMat) {
    const gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const edged = new cv.Mat();
    cv.Canny(gray, edged, 50, 150);
    cv.dilate(edged, edged, cv.Mat.ones(3, 3, cv.CV_8U));

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best = null, bestArea = 0;
    const imgArea = srcMat.cols * srcMat.rows;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea && area > imgArea * 0.15) {
          bestArea = area;
          if (best) best.delete();
          best = approx;
        } else {
          approx.delete();
        }
      } else {
        approx.delete();
      }
      cnt.delete();
    }

    gray.delete(); edged.delete(); contours.delete(); hierarchy.delete();

    if (!best) return null;
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: best.data32S[i * 2], y: best.data32S[i * 2 + 1] });
    }
    best.delete();
    return orderPoints(pts);
  }

  function warpToRect(cv, srcMat, corners, outW, outH) {
    const [tl, tr, br, bl] = corners;
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outW, 0, outW, outH, 0, outH
    ]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(srcMat, dst, M, new cv.Size(outW, outH));
    srcTri.delete(); dstTri.delete(); M.delete();
    return dst;
  }

  // Detects the document/card in `canvas`, straightens + crops it to an output
  // canvas of aspect ratio outW:outH (uses real px targets). Falls back to a
  // gentle auto-crop of the full frame if no strong quadrilateral is found.
  async function autoCropDocument(canvas, outW, outH) {
    const cv = await loadOpenCV();
    const src = cv.imread(canvas);
    let corners = findDocumentCorners(cv, src);
    let outMat;
    if (corners) {
      outMat = warpToRect(cv, src, corners, outW, outH);
    } else {
      // fallback: center-crop to target aspect ratio, no perspective info found
      const targetRatio = outW / outH;
      const srcRatio = src.cols / src.rows;
      let rx, ry, rw, rh;
      if (srcRatio > targetRatio) {
        rh = src.rows; rw = Math.round(rh * targetRatio);
        rx = Math.round((src.cols - rw) / 2); ry = 0;
      } else {
        rw = src.cols; rh = Math.round(rw / targetRatio);
        rx = 0; ry = Math.round((src.rows - rh) / 2);
      }
      const rect = new cv.Rect(rx, ry, rw, rh);
      const cropped = src.roi(rect);
      outMat = new cv.Mat();
      cv.resize(cropped, outMat, new cv.Size(outW, outH));
      cropped.delete();
    }
    autoEnhance(cv, outMat);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW; outCanvas.height = outH;
    cv.imshow(outCanvas, outMat);
    src.delete(); outMat.delete();
    return { canvas: outCanvas, straightened: !!corners };
  }

  /* ---------------- auto enhance (contrast stretch + slight sharpen) ---------------- */
  function autoEnhance(cv, mat) {
    // convert to Lab, CLAHE on L channel for local contrast, back to RGBA
    const rgb = new cv.Mat();
    cv.cvtColor(mat, rgb, cv.COLOR_RGBA2RGB);
    const lab = new cv.Mat();
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    const planes = new cv.MatVector();
    cv.split(lab, planes);
    const l = planes.get(0);
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(l, l);
    planes.set(0, l);
    cv.merge(planes, lab);
    cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
    cv.cvtColor(rgb, mat, cv.COLOR_RGB2RGBA);
    rgb.delete(); lab.delete(); planes.delete(); l.delete(); clahe.delete();
  }

  /* ---------------- face detection (OpenCV Haar cascade) ---------------- */
  let faceCascadePromise = null;
  async function loadFaceCascade() {
    if (faceCascadePromise) return faceCascadePromise;
    faceCascadePromise = (async () => {
      const cv = await loadOpenCV();
      const fileName = 'haarcascade_frontalface_default.xml';
      if (!cv.FS.analyzePath('/' + fileName).exists) {
        const resp = await fetch('https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml');
        const buf = new Uint8Array(await resp.arrayBuffer());
        cv.FS_createDataFile('/', fileName, buf, true, false, false);
      }
      const classifier = new cv.CascadeClassifier();
      classifier.load(fileName);
      return classifier;
    })();
    return faceCascadePromise;
  }

  // Returns the largest detected face as {x,y,width,height} in canvas pixel space, or null.
  async function detectFace(canvas) {
    const cv = await loadOpenCV();
    const classifier = await loadFaceCascade();
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, gray);
    const faces = new cv.RectVector();
    classifier.detectMultiScale(gray, faces, 1.1, 5, 0, new cv.Size(60, 60));
    let best = null, bestArea = 0;
    for (let i = 0; i < faces.size(); i++) {
      const r = faces.get(i);
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = { x: r.x, y: r.y, width: r.width, height: r.height }; }
    }
    src.delete(); gray.delete(); faces.delete();
    return best;
  }

  /* ---------------- background removal (MediaPipe Selfie Segmentation) ---------------- */
  let segModel = null, segReady = null;
  function getSegModel() {
    if (segModel) return segReady;
    segModel = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
    segModel.setOptions({ modelSelection: 1 });
    segReady = Promise.resolve(segModel);
    return segReady;
  }

  // Replaces the background of `canvas` with solid `bgColor`, returns a new canvas.
  function removeBackground(canvas, bgColor = '#3B7DD8') {
    return new Promise(async (resolve, reject) => {
      try {
        const model = await getSegModel();
        model.onResults((results) => {
          const out = document.createElement('canvas');
          out.width = canvas.width; out.height = canvas.height;
          const ctx = out.getContext('2d');
          ctx.save();
          ctx.clearRect(0, 0, out.width, out.height);
          ctx.drawImage(results.segmentationMask, 0, 0, out.width, out.height);
          ctx.globalCompositeOperation = 'source-in';
          ctx.drawImage(results.image, 0, 0, out.width, out.height);
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.restore();
          resolve(out);
        });
        await model.send({ image: canvas });
      } catch (e) { reject(e); }
    });
  }

  // Runs the same CLAHE-based enhance used for documents on a plain photo canvas.
  async function enhanceCanvas(canvas) {
    const cv = await loadOpenCV();
    const src = cv.imread(canvas);
    autoEnhance(cv, src);
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    cv.imshow(out, src);
    src.delete();
    return out;
  }

  function addBorder(canvas, px = 3, color = '#000') {
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = px * 2; // centered stroke -> full px thickness lands inside the edge
    ctx.strokeRect(px, px, out.width - px * 2, out.height - px * 2);
    return out;
  }

  /* ---------------- layout: place canvases on an A4 page ---------------- */
  function makePage() {
    const c = document.createElement('canvas');
    c.width = A4_W; c.height = A4_H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Places item canvases in a row-major grid starting near the top of the page.
  function placeGrid(page, items, { cols, cellW, cellH, gap = mm2px(3), marginTop = mm2px(8), border = 0 }) {
    const ctx = page.getContext('2d');
    const totalW = cols * cellW + (cols - 1) * gap;
    const startX = Math.round((page.width - totalW) / 2);
    items.forEach((item, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (cellW + gap);
      const y = marginTop + row * (cellH + gap);
      if (border > 0) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = border;
        ctx.strokeRect(x, y, cellW, cellH);
      }
      ctx.drawImage(item, x, y, cellW, cellH);
    });
    return page;
  }

  /* ---------------- export ---------------- */
  function downloadCanvas(canvas, filename, type = 'image/jpeg', quality = 0.95) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL(type, quality);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function canvasesToPDF(canvases, filename) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    canvases.forEach((c, i) => {
      if (i > 0) pdf.addPage();
      const imgData = c.toDataURL('image/jpeg', 0.95);
      // fit canvas into A4 page proportionally
      const pageW = 210, pageH = 297;
      const ratio = Math.min(pageW / (c.width * 25.4 / DPI), pageH / (c.height * 25.4 / DPI));
      const wMm = (c.width * 25.4 / DPI);
      const hMm = (c.height * 25.4 / DPI);
      const x = (pageW - wMm) / 2, y = (pageH - hMm) / 2;
      pdf.addImage(imgData, 'JPEG', Math.max(x,0), Math.max(y,0), wMm, hMm);
    });
    pdf.save(filename);
  }

  function printCanvas(canvas) { printCanvases([canvas]); }

  function printCanvases(canvases) {
    let area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    area.innerHTML = '';
    canvases.forEach((c, i) => {
      const img = document.createElement('img');
      img.src = c.toDataURL('image/jpeg', 0.98);
      img.style.width = '210mm';
      img.style.display = 'block';
      if (i > 0) img.style.pageBreakBefore = 'always';
      area.appendChild(img);
    });
    window.print();
  }

  /* ---------------- dropzone wiring ---------------- */
  // zone: the .dropzone element, input: its <input type=file>, onFile: fn(File)
  function wireDropzone(zone, input, onFile) {
    zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
    ['dragenter', 'dragover'].forEach(ev =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }

  function showThumb(zone, file, input) {
    const url = URL.createObjectURL(file);
    zone.classList.add('filled');
    zone.innerHTML = `<img src="${url}" alt="preview"><div class="dz-badge">✓ Loaded</div>
      <button class="dz-remove" type="button" data-remove>✕</button>`;
    if (input) zone.appendChild(input); // keep the <input> alive so re-upload still works
  }

  function setStatus(el, mode, text) {
    el.className = 'status-pill' + (mode ? ' ' + mode : '');
    el.querySelector('#status-text') ? (el.querySelector('#status-text').textContent = text)
                                      : (el.querySelector('span').textContent = text);
  }

  return {
    DPI, mm2px, A4_W, A4_H, ID_W, ID_H, PASS_W, PASS_H,
    loadOpenCV, fileToImage, imageToCanvas,
    autoCropDocument, autoEnhance, enhanceCanvas, addBorder,
    detectFace, removeBackground,
    makePage, placeGrid,
    downloadCanvas, canvasesToPDF, printCanvas, printCanvases,
    wireDropzone, showThumb, setStatus
  };
})();
