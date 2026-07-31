(() => {
  const dz = document.getElementById('dz-photo');
  const input = document.getElementById('file-photo');
  const btnProcess = document.getElementById('btn-process');
  const btnJpg = document.getElementById('btn-jpg');
  const btnPdf = document.getElementById('btn-pdf');
  const btnPrint = document.getElementById('btn-print');
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  const chips = document.querySelectorAll('#count-chips .chip');

  let photoFile = null, pageCanvas = null, count = 6;

  chips.forEach(chip => chip.onclick = () => {
    chips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    count = Number(chip.dataset.count);
  });

  PF.wireDropzone(dz, input, (f) => { photoFile = f; PF.showThumb(dz, f, input); btnProcess.disabled = false; PF.setStatus(status, '', 'Ready — click Auto-crop & build A4'); });
  document.getElementById('cam-photo').onclick = () => PFCamera.open((f) => { photoFile = f; PF.showThumb(dz, f, input); btnProcess.disabled = false; PF.setStatus(status, '', 'Ready — click Auto-crop & build A4'); });

  function cropRectFromFace(face, imgW, imgH) {
    // Passport convention: face occupies ~50% of crop height, with headroom above and shoulder room below.
    const cropH = face.height / 0.5;
    const cropW = cropH * (PF.PASS_W / PF.PASS_H);
    const centerX = face.x + face.width / 2;
    let top = face.y - cropH * 0.32;
    let left = centerX - cropW / 2;
    // clamp inside image bounds, preserving aspect ratio by shifting rather than resizing
    left = Math.max(0, Math.min(left, imgW - cropW));
    top = Math.max(0, Math.min(top, imgH - cropH));
    const w = Math.min(cropW, imgW);
    const h = Math.min(cropH, imgH);
    return { x: Math.round(left), y: Math.round(top), width: Math.round(w), height: Math.round(h) };
  }

  btnProcess.onclick = async () => {
    try {
      btnProcess.disabled = true;
      PF.setStatus(status, 'working', 'Loading AI engine…');
      await PF.loadOpenCV();

      PF.setStatus(status, 'working', 'Detecting face…');
      const img = await PF.fileToImage(photoFile);
      const srcCanvas = PF.imageToCanvas(img, 1000);
      const face = await PF.detectFace(srcCanvas);

      PF.setStatus(status, 'working', 'Removing background…');
      const bgRemoved = await PF.removeBackground(srcCanvas, '#3B7DD8');

      PF.setStatus(status, 'working', 'Cropping to passport size…');
      const rect = face
        ? cropRectFromFace(face, bgRemoved.width, bgRemoved.height)
        : { x: 0, y: 0, width: bgRemoved.width, height: Math.min(bgRemoved.height, bgRemoved.width * (PF.PASS_H / PF.PASS_W)) };

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = PF.PASS_W; cropCanvas.height = PF.PASS_H;
      cropCanvas.getContext('2d').drawImage(
        bgRemoved, rect.x, rect.y, rect.width, rect.height, 0, 0, PF.PASS_W, PF.PASS_H
      );

      PF.setStatus(status, 'working', 'Enhancing quality…');
      const enhanced = await PF.enhanceCanvas(cropCanvas);
      const bordered = PF.addBorder(enhanced, 3, '#000');

      PF.setStatus(status, 'working', `Building A4 sheet (${count} photos)…`);
      const items = Array.from({ length: count }, () => bordered);
      pageCanvas = PF.makePage();
      PF.placeGrid(pageCanvas, items, {
        cols: 6, cellW: PF.PASS_W, cellH: PF.PASS_H,
        gap: PF.mm2px(2), marginTop: PF.mm2px(8), border: 0
      });

      stage.innerHTML = ''; stage.appendChild(pageCanvas);
      PF.setStatus(status, 'done', face
        ? `Done — face detected, ${count} photos placed`
        : `Done — face not clearly detected, used centre crop`);
      btnJpg.disabled = btnPdf.disabled = btnPrint.disabled = false;
    } catch (err) {
      console.error(err);
      PF.setStatus(status, 'error', 'Something went wrong — try a clearer front-facing photo');
    } finally {
      btnProcess.disabled = false;
    }
  };

  btnJpg.onclick = () => PF.downloadCanvas(pageCanvas, 'passport-photos-a4.jpg');
  btnPdf.onclick = () => PF.canvasesToPDF([pageCanvas], 'passport-photos-a4.pdf');
  btnPrint.onclick = () => PF.printCanvas(pageCanvas);
})();
