(() => {
  const dz = document.getElementById('dz-multi');
  const input = document.getElementById('file-multi');
  const thumbsWrap = document.getElementById('multi-thumbs');
  const btnProcess = document.getElementById('btn-process');
  const btnJpg = document.getElementById('btn-jpg');
  const btnPdf = document.getElementById('btn-pdf');
  const btnPrint = document.getElementById('btn-print');
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');

  let queue = []; // {file, url}
  let pages = [];  // processed canvases

  PF.wireDropzone(dz, input, addFiles);
  input.addEventListener('change', () => { addFiles(null); });

  function addFiles() {
    const files = Array.from(input.files || []);
    files.forEach(f => queue.push({ file: f, url: URL.createObjectURL(f) }));
    renderThumbs();
    btnProcess.disabled = queue.length === 0;
    PF.setStatus(status, '', `${queue.length} document(s) added — ready to process`);
  }

  function renderThumbs() {
    thumbsWrap.innerHTML = '';
    queue.forEach((item, i) => {
      const t = document.createElement('div');
      t.className = 'multi-thumb';
      t.innerHTML = `<img src="${item.url}"><button class="mt-x" data-i="${i}">✕</button>`;
      thumbsWrap.appendChild(t);
    });
    thumbsWrap.querySelectorAll('.mt-x').forEach(btn => {
      btn.onclick = () => {
        queue.splice(Number(btn.dataset.i), 1);
        renderThumbs();
        btnProcess.disabled = queue.length === 0;
      };
    });
  }

  btnProcess.onclick = async () => {
    try {
      btnProcess.disabled = true;
      PF.setStatus(status, 'working', 'Loading AI engine…');
      await PF.loadOpenCV();

      pages = [];
      const margin = PF.mm2px(10);
      const contentW = PF.A4_W - margin * 2;
      const contentH = PF.A4_H - margin * 2;

      for (let i = 0; i < queue.length; i++) {
        PF.setStatus(status, 'working', `Processing document ${i + 1} of ${queue.length}…`);
        const img = await PF.fileToImage(queue[i].file);
        const src = PF.imageToCanvas(img);
        const { canvas: out } = await PF.autoCropDocument(src, contentW, contentH);
        const page = PF.makePage();
        PF.placeGrid(page, [out], { cols: 1, cellW: contentW, cellH: contentH, gap: 0, marginTop: margin });
        pages.push(page);
      }

      stage.innerHTML = '';
      const previewWrap = document.createElement('div');
      previewWrap.style.display = 'flex';
      previewWrap.style.flexDirection = 'column';
      previewWrap.style.gap = '18px';
      pages.forEach(p => previewWrap.appendChild(p));
      stage.appendChild(previewWrap);

      PF.setStatus(status, 'done', `Done — ${pages.length} page(s) ready`);
      btnJpg.disabled = btnPdf.disabled = btnPrint.disabled = false;
    } catch (err) {
      console.error(err);
      PF.setStatus(status, 'error', 'Something went wrong — try clearer photos');
    } finally {
      btnProcess.disabled = false;
    }
  };

  btnJpg.onclick = () => pages.forEach((p, i) => PF.downloadCanvas(p, `document-${i + 1}.jpg`));
  btnPdf.onclick = () => PF.canvasesToPDF(pages, 'documents.pdf');
  btnPrint.onclick = () => PF.printCanvases(pages);
})();
