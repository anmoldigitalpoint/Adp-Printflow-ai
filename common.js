/* ===================================================================
   Adp-Printflow-ai — shared utilities
   =================================================================== */

const A4_MM = { w: 210, h: 297 };

const PF = {

  mmToPx(mm, dpi){ return Math.round(mm / 25.4 * dpi); },
  pxToMm(px, dpi){ return px / dpi * 25.4; },

  // ---------------- OpenCV.js loader (auto-detect edges + perspective warp) ----------------
  _cvReady: null,
  loadOpenCV(){
    if (this._cvReady) return this._cvReady;
    this._cvReady = new Promise((resolve) => {
      if (window.cv && window.cv.Mat) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.9.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const check = () => {
          if (window.cv && (window.cv.Mat || window.cv.onRuntimeInitialized !== undefined)) {
            if (window.cv.Mat) resolve(true);
            else window.cv['onRuntimeInitialized'] = () => resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      // safety timeout so UI never hangs forever waiting on a slow/blocked CDN
      setTimeout(() => resolve(!!(window.cv && window.cv.Mat)), 12000);
    });
    return this._cvReady;
  },

  // Auto-detect the 4 corners of the most prominent rectangular document
  // in an image. Returns [{x,y} x4] in ORIGINAL image pixel coordinates,
  // ordered TL, TR, BR, BL. Falls back to a small inset of the full frame
  // if no confident quadrilateral is found (user can still drag corners).
  autoDetectCorners(imgEl){
    const cv = window.cv;
    const W = imgEl.naturalWidth, H = imgEl.naturalHeight;
    const fallback = () => {
      const ix = W * 0.06, iy = H * 0.06;
      return [{x:ix,y:iy},{x:W-ix,y:iy},{x:W-ix,y:H-iy},{x:ix,y:H-iy}];
    };
    if (!cv || !cv.Mat) return fallback();
    try{
      const maxDim = 700;
      const scale = Math.min(1, maxDim / Math.max(W, H));
      const cvs = document.createElement('canvas');
      cvs.width = Math.round(W * scale); cvs.height = Math.round(H * scale);
      cvs.getContext('2d').drawImage(imgEl, 0, 0, cvs.width, cvs.height);

      let src = cv.imread(cvs);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
      let edges = new cv.Mat();
      cv.Canny(gray, edges, 50, 150);
      let kernel = cv.Mat.ones(3,3, cv.CV_8U);
      cv.dilate(edges, edges, kernel);

      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let best = null, bestArea = 0;
      const imgArea = cvs.width * cvs.height;
      for (let i=0; i<contours.size(); i++){
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < imgArea * 0.15) { cnt.delete(); continue; }
        const peri = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea){
          bestArea = area;
          if (best) best.delete();
          best = approx;
        } else {
          approx.delete();
        }
        cnt.delete();
      }

      let pts = null;
      if (best){
        const raw = [];
        for (let i=0;i<4;i++) raw.push({ x: best.intPtr(i,0)[0] / scale, y: best.intPtr(i,0)[1] / scale });
        pts = this._orderCorners(raw);
        best.delete();
      }

      src.delete(); gray.delete(); edges.delete(); kernel.delete();
      contours.delete(); hierarchy.delete();

      return pts || fallback();
    } catch(e){
      console.warn('autoDetectCorners failed, using fallback', e);
      return fallback();
    }
  },

  _orderCorners(pts){
    // returns TL, TR, BR, BL
    const sum = pts.map(p=>p.x+p.y);
    const diff = pts.map(p=>p.x-p.y);
    const tl = pts[sum.indexOf(Math.min(...sum))];
    const br = pts[sum.indexOf(Math.max(...sum))];
    const tr = pts[diff.indexOf(Math.max(...diff))];
    const bl = pts[diff.indexOf(Math.min(...diff))];
    return [tl, tr, br, bl];
  },

  // Warp the quadrilateral defined by corners (in source image pixel space)
  // into a flat rectangle of outW x outH pixels. Returns a canvas.
  warpToRect(imgEl, corners, outW, outH){
    const cv = window.cv;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imgEl.naturalWidth; srcCanvas.height = imgEl.naturalHeight;
    srcCanvas.getContext('2d').drawImage(imgEl, 0, 0);

    if (!cv || !cv.Mat){
      // no opencv available — do a plain crop of the bounding box (no perspective correction)
      const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      out.getContext('2d').drawImage(srcCanvas, x0, y0, x1-x0, y1-y0, 0, 0, outW, outH);
      return out;
    }

    const src = cv.imread(srcCanvas);
    const dst = new cv.Mat();
    const srcTri = cv.matFromArray(4,1,cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y
    ]);
    const dstTri = cv.matFromArray(4,1,cv.CV_32FC2, [0,0, outW,0, outW,outH, 0,outH]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    cv.imshow(out, dst);

    src.delete(); dst.delete(); srcTri.delete(); dstTri.delete(); M.delete();
    return out;
  },

  // ---------------- auto quality enhance (contrast stretch + light sharpen) ----------------
  enhance(canvas){
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imgData = ctx.getImageData(0,0,w,h);
    const d = imgData.data;

    // per-channel histogram stretch (clip 0.5%)
    for (const ch of [0,1,2]){
      let min=255, max=0;
      for (let i=ch; i<d.length; i+=4){ const v=d[i]; if(v<min)min=v; if(v>max)max=v; }
      const range = Math.max(1, max-min);
      for (let i=ch; i<d.length; i+=4){ d[i] = Math.max(0, Math.min(255, (d[i]-min)*255/range)); }
    }
    ctx.putImageData(imgData, 0, 0);

    // light unsharp mask, blended at 35% to avoid halos
    const blurred = document.createElement('canvas');
    blurred.width = w; blurred.height = h;
    const bctx = blurred.getContext('2d');
    bctx.filter = 'blur(1.2px)';
    bctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    const sharp = ctx.getImageData(0,0,w,h);
    const soft = bctx.getImageData(0,0,w,h);
    const sd = sharp.data, bd = soft.data;
    const amount = 0.35;
    for (let i=0;i<sd.length;i+=4){
      for (let c=0;c<3;c++){
        const hi = sd[i+c] + (sd[i+c]-bd[i+c]) * amount;
        sd[i+c] = Math.max(0, Math.min(255, hi));
      }
    }
    ctx.putImageData(sharp, 0, 0);
    return canvas;
  },

  // ---------------- layout packers ----------------
  // Uniform grid: every item is the same target size (mm). Returns array of pages,
  // each page an array of {x,y,w,h} (mm, top-left origin) matched 1:1 to items order.
  packUniformGrid(count, itemWmm, itemHmm, marginMm=8, gapMm=4){
    const usableW = A4_MM.w - marginMm*2;
    const usableH = A4_MM.h - marginMm*2;
    const cols = Math.max(1, Math.floor((usableW + gapMm) / (itemWmm + gapMm)));
    const rows = Math.max(1, Math.floor((usableH + gapMm) / (itemHmm + gapMm)));
    const perPage = cols * rows;
    const gridW = cols*itemWmm + (cols-1)*gapMm;
    const gridH = rows*itemHmm + (rows-1)*gapMm;
    const offX = marginMm + (usableW-gridW)/2;
    const offY = marginMm + (usableH-gridH)/2;

    const pages = [];
    let page = [];
    for (let i=0;i<count;i++){
      const posInPage = i % perPage;
      if (posInPage === 0 && i>0){ pages.push(page); page=[]; }
      const r = Math.floor(posInPage/cols), c = posInPage%cols;
      page.push({ x: offX + c*(itemWmm+gapMm), y: offY + r*(itemHmm+gapMm), w:itemWmm, h:itemHmm });
    }
    if (page.length) pages.push(page);
    return pages;
  },

  // Fixed column count, N rows (used by Quick Photo Print: "6 across" x rows).
  packFixedCols(count, cols, marginMm=8, gapMm=4, aspectWH=35/45){
    const usableW = A4_MM.w - marginMm*2;
    const cellW = (usableW - gapMm*(cols-1)) / cols;
    const cellH = cellW / aspectWH;
    const rows = Math.ceil(count/cols);
    const usableH = A4_MM.h - marginMm*2;
    const gridH = rows*cellH + (rows-1)*gapMm;
    const offY = marginMm + Math.max(0,(usableH-gridH)/2);

    const pages = []; let page = [];
    const perPage = cols*rows; // single page target — caller decides how many pages to request
    for (let i=0;i<count;i++){
      const posInPage = i % perPage;
      if (posInPage===0 && i>0){ pages.push(page); page=[]; }
      const r = Math.floor(posInPage/cols), c = posInPage%cols;
      page.push({ x: marginMm + c*(cellW+gapMm), y: offY + r*(cellH+gapMm), w:cellW, h:cellH });
    }
    if (page.length) pages.push(page);
    return pages;
  },

  // Mixed sizes — shelf packing, sorted tallest-first within reasonable width bands.
  packShelves(items, marginMm=8, gapMm=4){
    // items: [{w,h,...}]
    const usableW = A4_MM.w - marginMm*2;
    const usableH = A4_MM.h - marginMm*2;
    const sorted = items.map((it,idx)=>({...it, idx})).sort((a,b)=> b.h-a.h);

    const pages = []; let page = []; let x=marginMm, y=marginMm, shelfH=0;
    const newPage = () => { if(page.length) pages.push(page); page=[]; x=marginMm; y=marginMm; shelfH=0; };

    for (const it of sorted){
      if (it.w > usableW) it.h = it.h * (usableW/it.w), it.w = usableW; // safety clamp
      if (x + it.w > marginMm+usableW){ // wrap to next shelf
        x = marginMm; y += shelfH + gapMm; shelfH = 0;
      }
      if (y + it.h > marginMm+usableH){ newPage(); }
      page.push({ x, y, w: it.w, h: it.h, idx: it.idx });
      x += it.w + gapMm;
      shelfH = Math.max(shelfH, it.h);
    }
    if (page.length) pages.push(page);

    // re-sort each page's placements back to original item order for predictable export
    return pages.map(p => p.slice().sort((a,b)=>a.idx-b.idx));
  },

  // ---------------- render pages to canvases ----------------
  // placements: array of pages -> array of {x,y,w,h, img (HTMLCanvasElement/Image), idx?}
  renderA4Canvas(placements, images, dpi=300){
    const cw = this.mmToPx(A4_MM.w, dpi), ch = this.mmToPx(A4_MM.h, dpi);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cw,ch);
    placements.forEach((p, i) => {
      const img = images[p.idx !== undefined ? p.idx : i];
      if (!img) return;
      const px = this.mmToPx(p.x, dpi), py = this.mmToPx(p.y, dpi);
      const pw = this.mmToPx(p.w, dpi), ph = this.mmToPx(p.h, dpi);
      ctx.drawImage(img, px, py, pw, ph);
    });
    return canvas;
  },

  // ---------------- export ----------------
  async downloadPagesAsPDF(canvases, filename){
    await this._ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
    canvases.forEach((c, i) => {
      if (i>0) doc.addPage('a4','portrait');
      const data = c.toDataURL('image/jpeg', 0.92);
      doc.addImage(data, 'JPEG', 0, 0, A4_MM.w, A4_MM.h);
    });
    doc.save(filename);
  },

  _jspdfReady: null,
  _ensureJsPDF(){
    if (this._jspdfReady) return this._jspdfReady;
    this._jspdfReady = new Promise((resolve, reject) => {
      if (window.jspdf) { resolve(true); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => resolve(true);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return this._jspdfReady;
  },

  downloadCanvasAsJPEG(canvas, filename){
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.95);
    a.download = filename;
    a.click();
  },

  printCanvases(canvases){
    const area = document.getElementById('printArea');
    area.innerHTML = '';
    canvases.forEach(c => {
      const wrap = document.createElement('div');
      wrap.className = 'a4-page';
      const img = document.createElement('img');
      img.src = c.toDataURL('image/jpeg', 0.95);
      img.style.width = '100%';
      wrap.appendChild(img);
      area.appendChild(wrap);
    });
    window.print();
  },

  // ---------------- camera ----------------
  async openCamera(videoEl){
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  },
  stopCamera(stream){
    if (stream) stream.getTracks().forEach(t=>t.stop());
  },
  captureFrame(videoEl){
    const c = document.createElement('canvas');
    c.width = videoEl.videoWidth; c.height = videoEl.videoHeight;
    c.getContext('2d').drawImage(videoEl, 0, 0);
    return c;
  },

  fileToImage(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  },
  canvasToImage(canvas){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = canvas.toDataURL('image/png');
    });
  }
};
