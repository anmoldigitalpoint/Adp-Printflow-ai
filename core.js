/* ===========================================================
   ADP PrintFlow AI — core.js (self-contained engine)
   No external CV/ML libraries. Pure canvas + JS, so every tool
   loads instantly and never depends on a slow/blocked CDN.
   =========================================================== */

const PF = (() => {

  const DPI = 200;
  const mm2px = (mm) => Math.round((mm / 25.4) * DPI);

  const A4_W = mm2px(210);
  const A4_H = mm2px(297);
  const ID_W = mm2px(85.6);
  const ID_H = mm2px(53.98);
  const PASS_W = mm2px(35);
  const PASS_H = mm2px(45);

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

  function cloneCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  function canvasToImage(canvas) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = canvas.toDataURL('image/png');
    });
  }

  /* ---------------- background / foreground segmentation ---------------- */
  // Flood-fills inward from the image border, treating any pixel within
  // `tolerance` color-distance of the sampled border color as background.
  // Whatever the flood fill can't reach is the foreground (document / person).
  function sampleBorderColor(data, w, h) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < w; x += 3) {
      for (const y of [0, h - 1]) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    for (let y = 0; y < h; y += 3) {
      for (const x of [0, w - 1]) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  }

  function colorDist(data, i, ref) {
    const dr = data[i] - ref[0], dg = data[i + 1] - ref[1], db = data[i + 2] - ref[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function floodFillBackground(data, w, h, bgColor, tolerance) {
    const visited = new Uint8Array(w * h); // 1 = confirmed background
    const qx = new Int32Array(w * h);
    const qy = new Int32Array(w * h);
    let qHead = 0, qTail = 0;

    const tryPush = (x, y) => {
      const idx = y * w + x;
      if (visited[idx]) return;
      const i = idx * 4;
      if (colorDist(data, i, bgColor) < tolerance) {
        visited[idx] = 1;
        qx[qTail] = x; qy[qTail] = y; qTail++;
      }
    };

    for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
    for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }

    while (qHead < qTail) {
      const x = qx[qHead], y = qy[qHead]; qHead++;
      if (x > 0) tryPush(x - 1, y);
      if (x < w - 1) tryPush(x + 1, y);
      if (y > 0) tryPush(x, y - 1);
      if (y < h - 1) tryPush(x, y + 1);
    }
    return visited;
  }

  // Returns { mask, w, h, coverage } where mask[i]=1 means foreground.
  function segmentForeground(canvas, tolerance = 38) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);
    const bg = sampleBorderColor(imgData.data, w, h);
    const bgMask = floodFillBackground(imgData.data, w, h, bg, tolerance);
    const mask = new Uint8Array(w * h);
    let fgCount = 0;
    for (let i = 0; i < mask.length; i++) {
      mask[i] = bgMask[i] ? 0 : 1;
      if (mask[i]) fgCount++;
    }
    return { mask, w, h, coverage: fgCount / (w * h) };
  }

  /* ---------------- boundary + PCA deskew ---------------- */
  function extractBoundaryPoints(mask, w, h) {
    const pts = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (!mask[idx]) continue;
        if (!mask[idx - 1] || !mask[idx + 1] || !mask[idx - w] || !mask[idx + w]) {
          pts.push(x, y);
        }
      }
    }
    return pts; // flat [x0,y0,x1,y1,...]
  }

  // PCA-based orientation: fit the dominant axis of the boundary point cloud,
  // rotate into that frame, take the axis-aligned box, rotate corners back.
  function minAreaCorners(pts) {
    const n = pts.length / 2;
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
    cx /= n; cy /= n;

    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - cx, dy = pts[i + 1] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const cosA = Math.cos(-angle), sinA = Math.sin(-angle);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - cx, dy = pts[i + 1] - cy;
      const rx = dx * cosA - dy * sinA;
      const ry = dx * sinA + dy * cosA;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    }

    const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
    const cosB = Math.cos(angle), sinB = Math.sin(angle);
    return corners.map(([rx, ry]) => ({
      x: cx + rx * cosB - ry * sinB,
      y: cy + rx * sinB + ry * cosB
    }));
  }

  function orderPoints(pts) {
    const sum = pts.map(p => p.x + p.y);
    const diff = pts.map(p => p.y - p.x);
    const tl = pts[sum.indexOf(Math.min(...sum))];
    const br = pts[sum.indexOf(Math.max(...sum))];
    const tr = pts[diff.indexOf(Math.min(...diff))];
    const bl = pts[diff.indexOf(Math.max(...diff))];
    return [tl, tr, br, bl];
  }

  /* ---------------- perspective warp (hand-written, no libs) ---------------- */
  function solve8x8(A, b) {
    const n = 8;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      [b[col], b[piv]] = [b[piv], b[col]];
      const d = A[col][col] || 1e-9;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / d;
        for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
        b[r] -= f * b[col];
      }
    }
    return b.map((v, i) => v / (A[i][i] || 1e-9));
  }

  // Homography mapping destination (x,y) -> source (x,y), built directly
  // from 4 point correspondences (classic DLT for a single quad).
  function computeDestToSrcHomography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = dst[i];
      const [sx, sy] = src[i];
      A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]); b.push(sx);
      A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]); b.push(sy);
    }
    const h = solve8x8(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function bilinear(data, w, h, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return [255, 255, 255, 0];
    const fx = x - x0, fy = y - y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
      const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
      out[c] = top * (1 - fy) + bot * fy;
    }
    return out;
  }

  // Warps `srcCanvas` so the quad `corners` (in src space) maps to a
  // rectangle of size outW x outH. Computes at a capped working resolution
  // for speed, then upscales natively via drawImage.
  function warpPerspective(srcCanvas, corners, outW, outH) {
    const workScale = Math.min(1, 900 / Math.max(outW, outH));
    const wW = Math.max(1, Math.round(outW * workScale));
    const wH = Math.max(1, Math.round(outH * workScale));

    const dstPts = [[0, 0], [wW, 0], [wW, wH], [0, wH]];
    const srcPts = corners.map(p => [p.x, p.y]);
    const H = computeDestToSrcHomography(dstPts, srcPts);

    const sctx = srcCanvas.getContext('2d');
    const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;

    const outData = new Uint8ClampedArray(wW * wH * 4);
    for (let y = 0; y < wH; y++) {
      for (let x = 0; x < wW; x++) {
        const denom = H[6] * x + H[7] * y + 1;
        const sx = (H[0] * x + H[1] * y + H[2]) / denom;
        const sy = (H[3] * x + H[4] * y + H[5]) / denom;
        const px = bilinear(srcData, srcCanvas.width, srcCanvas.height, sx, sy);
        const o = (y * wW + x) * 4;
        outData[o] = px[0]; outData[o + 1] = px[1]; outData[o + 2] = px[2]; outData[o + 3] = 255;
      }
    }

    const workCanvas = document.createElement('canvas');
    workCanvas.width = wW; workCanvas.height = wH;
    workCanvas.getContext('2d').putImageData(new ImageData(outData, wW, wH), 0, 0);

    if (wW === outW && wH === outH) return workCanvas;
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = outW; finalCanvas.height = outH;
    const fctx = finalCanvas.getContext('2d');
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(workCanvas, 0, 0, outW, outH);
    return finalCanvas;
  }

  /* ---------------- enhance (auto contrast/brightness) ---------------- */
  function enhanceCanvasSync(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    const range = Math.max(max - min, 1);
    const scale = 255 / range;

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.min(255, Math.max(0, (data[i + c] - min) * scale));
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
  async function enhanceCanvas(canvas) { return enhanceCanvasSync(cloneCanvas(canvas)); }

  function addBorder(canvas, px = 3, color = '#000') {
    const out = cloneCanvas(canvas);
    const ctx = out.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = px * 2;
    ctx.strokeRect(px, px, out.width - px * 2, out.height - px * 2);
    return out;
  }

  /* ---------------- document auto-crop (public) ---------------- */
  async function autoCropDocument(canvas, outW, outH) {
    const detectMax = 700;
    const workCanvas = imageToCanvas(await canvasToImage(canvas), detectMax);
    const scaleUp = canvas.width / workCanvas.width;

    const { mask, w, h, coverage } = segmentForeground(workCanvas, 38);
    let corners = null;

    if (coverage > 0.08 && coverage < 0.96) {
      const pts = extractBoundaryPoints(mask, w, h);
      if (pts.length >= 8) {
        const rectCorners = minAreaCorners(pts).map(p => ({ x: p.x * scaleUp, y: p.y * scaleUp }));
        corners = orderPoints(rectCorners);
      }
    }

    let out, straightened;
    if (corners) {
      out = warpPerspective(canvas, corners, outW, outH);
      straightened = true;
    } else {
      // fallback: gentle centre-crop to the target aspect ratio
      const targetRatio = outW / outH;
      const srcRatio = canvas.width / canvas.height;
      let rx, ry, rw, rh;
      if (srcRatio > targetRatio) {
        rh = canvas.height; rw = Math.round(rh * targetRatio);
        rx = Math.round((canvas.width - rw) / 2); ry = 0;
      } else {
        rw = canvas.width; rh = Math.round(rw / targetRatio);
        rx = 0; ry = Math.round((canvas.height - rh) / 2);
      }
      const tmp = document.createElement('canvas');
      tmp.width = outW; tmp.height = outH;
      tmp.getContext('2d').drawImage(canvas, rx, ry, rw, rh, 0, 0, outW, outH);
      out = tmp;
      straightened = false;
    }

    enhanceCanvasSync(out);
    return { canvas: out, straightened };
  }

  /* ---------------- passport photo: face estimate + background swap ---------------- */
  // Uses the browser's native Shape Detection API when available (fast,
  // accurate); otherwise estimates the face box from the segmented person
  // silhouette (head sits at the top of the foreground blob).
  async function detectFace(canvas) {
    if ('FaceDetector' in window) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const faces = await detector.detect(canvas);
        if (faces && faces.length) {
          const b = faces[0].boundingBox;
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      } catch (e) { /* fall through to heuristic */ }
    }

    const { mask, w, h, coverage } = segmentForeground(canvas, 42);
    if (coverage < 0.05 || coverage > 0.97) return null;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const blobH = maxY - minY, blobW = maxX - minX;
    const faceH = blobH * 0.38;
    const faceW = faceH * 0.78;
    const faceCX = minX + blobW / 2;
    return { x: faceCX - faceW / 2, y: minY, width: faceW, height: faceH };
  }

  function hexToRgb(hex) {
    const v = hex.replace('#', '');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }

  async function removeBackground(canvas, bgColor = '#3B7DD8') {
    const { mask, w, h, coverage } = segmentForeground(canvas, 42);
    const out = cloneCanvas(canvas);
    if (coverage < 0.04 || coverage > 0.97) return out; // couldn't segment confidently — leave as-is

    const ctx = out.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const rgb = hexToRgb(bgColor);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!mask[idx]) {
          const i = idx * 4;
          data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
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
    if (!window.jspdf) throw new Error('PDF library did not load — check your internet connection and try again');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    canvases.forEach((c, i) => {
      if (i > 0) pdf.addPage();
      const imgData = c.toDataURL('image/jpeg', 0.95);
      const pageW = 210, pageH = 297;
      const wMm = (c.width * 25.4 / DPI);
      const hMm = (c.height * 25.4 / DPI);
      const x = (pageW - wMm) / 2, y = (pageH - hMm) / 2;
      pdf.addImage(imgData, 'JPEG', Math.max(x, 0), Math.max(y, 0), wMm, hMm);
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
    if (input) zone.appendChild(input);
  }

  function setStatus(el, mode, text) {
    el.className = 'status-pill' + (mode ? ' ' + mode : '');
    const span = el.querySelector('span');
    if (span) span.textContent = text;
  }

  return {
    DPI, mm2px, A4_W, A4_H, ID_W, ID_H, PASS_W, PASS_H,
    fileToImage, imageToCanvas,
    autoCropDocument, enhanceCanvas, addBorder,
    detectFace, removeBackground,
    makePage, placeGrid,
    downloadCanvas, canvasesToPDF, printCanvas, printCanvases,
    wireDropzone, showThumb, setStatus
  };
})();
