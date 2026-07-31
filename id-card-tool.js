(() => {
  const dzFront = document.getElementById('dz-front');
  const dzBack = document.getElementById('dz-back');
  const inFront = document.getElementById('file-front');
  const inBack = document.getElementById('file-back');
  const btnProcess = document.getElementById('btn-process');
  const btnJpg = document.getElementById('btn-jpg');
  const btnPdf = document.getElementById('btn-pdf');
  const btnPrint = document.getElementById('btn-print');
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');

  let frontFile = null, backFile = null, pageCanvas = null;

  PF.wireDropzone(dzFront, inFront, (f) => { frontFile = f; PF.showThumb(dzFront, f, inFront); checkReady(); });
  PF.wireDropzone(dzBack, inBack, (f) => { backFile = f; PF.showThumb(dzBack, f, inBack); checkReady(); });

  document.getElementById('cam-front').onclick = () => PFCamera.open((f) => { frontFile = f; PF.showThumb(dzFront, f, inFront); checkReady(); });
  document.getElementById('cam-back').onclick = () => PFCamera.open((f) => { backFile = f; PF.showThumb(dzBack, f, inBack); checkReady(); });

  function checkReady() {
    btnProcess.disabled = !(frontFile && backFile);
    if (btnProcess.disabled) PF.setStatus(status, '', 'Waiting for both sides…');
    else PF.setStatus(status, '', 'Ready — click Auto-crop & build A4');
  }

  btnProcess.onclick = async () => {
    try {
      btnProcess.disabled = true;
      PF.setStatus(status, 'working', 'Detecting front card edges…');
      const frontImg = await PF.fileToImage(frontFile);
      const frontSrc = PF.imageToCanvas(frontImg);
      const { canvas: frontOut } = await PF.autoCropDocument(frontSrc, PF.ID_W, PF.ID_H);

      PF.setStatus(status, 'working', 'Detecting back card edges…');
      const backImg = await PF.fileToImage(backFile);
      const backSrc = PF.imageToCanvas(backImg);
      const { canvas: backOut } = await PF.autoCropDocument(backSrc, PF.ID_W, PF.ID_H);

      PF.setStatus(status, 'working', 'Composing A4 sheet…');
      pageCanvas = PF.makePage();
      PF.placeGrid(pageCanvas, [frontOut, backOut], {
        cols: 2, cellW: PF.ID_W, cellH: PF.ID_H,
        gap: PF.mm2px(6), marginTop: PF.mm2px(10)
      });

      renderPreview(pageCanvas);
      PF.setStatus(status, 'done', 'Done — front & back straightened and placed on A4');
      btnJpg.disabled = btnPdf.disabled = btnPrint.disabled = false;
    } catch (err) {
      console.error(err);
      PF.setStatus(status, 'error', 'Something went wrong — try a clearer photo');
    } finally {
      btnProcess.disabled = false;
    }
  };

  function renderPreview(canvas) {
    stage.innerHTML = '';
    stage.appendChild(canvas);
  }

  btnJpg.onclick = () => PF.downloadCanvas(pageCanvas, 'id-card-a4.jpg');
  btnPdf.onclick = () => PF.canvasesToPDF([pageCanvas], 'id-card-a4.pdf').catch(e => alert(e.message));
  btnPrint.onclick = () => PF.printCanvas(pageCanvas);
})();
