(() => {
  const dz = document.getElementById('dz-doc');
  const input = document.getElementById('file-doc');
  const btnProcess = document.getElementById('btn-process');
  const btnJpg = document.getElementById('btn-jpg');
  const btnPdf = document.getElementById('btn-pdf');
  const btnPrint = document.getElementById('btn-print');
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');

  let docFile = null, pageCanvas = null;

  PF.wireDropzone(dz, input, (f) => { docFile = f; PF.showThumb(dz, f, input); btnProcess.disabled = false; PF.setStatus(status, '', 'Ready — click Auto-crop & build A4'); });
  document.getElementById('cam-doc').onclick = () => PFCamera.open((f) => { docFile = f; PF.showThumb(dz, f, input); btnProcess.disabled = false; PF.setStatus(status, '', 'Ready — click Auto-crop & build A4'); });

  btnProcess.onclick = async () => {
    try {
      btnProcess.disabled = true;
      PF.setStatus(status, 'working', 'Detecting document edges…');
      const img = await PF.fileToImage(docFile);
      const src = PF.imageToCanvas(img);

      const margin = PF.mm2px(10);
      const contentW = PF.A4_W - margin * 2;
      const contentH = PF.A4_H - margin * 2;
      const { canvas: docOut } = await PF.autoCropDocument(src, contentW, contentH);

      PF.setStatus(status, 'working', 'Composing A4 sheet…');
      pageCanvas = PF.makePage();
      PF.placeGrid(pageCanvas, [docOut], {
        cols: 1, cellW: contentW, cellH: contentH, gap: 0, marginTop: margin
      });

      stage.innerHTML = ''; stage.appendChild(pageCanvas);
      PF.setStatus(status, 'done', 'Done — straightened and placed on A4');
      btnJpg.disabled = btnPdf.disabled = btnPrint.disabled = false;
    } catch (err) {
      console.error(err);
      PF.setStatus(status, 'error', 'Something went wrong — try a clearer photo');
    } finally {
      btnProcess.disabled = false;
    }
  };

  btnJpg.onclick = () => PF.downloadCanvas(pageCanvas, 'document-a4.jpg');
  btnPdf.onclick = () => PF.canvasesToPDF([pageCanvas], 'document-a4.pdf').catch(e => alert(e.message));
  btnPrint.onclick = () => PF.printCanvas(pageCanvas);
})();
