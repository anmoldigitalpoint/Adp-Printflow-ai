/* ===================================================================
   Smart Documents Print
   =================================================================== */

const TYPE_SIZES = {
  aadhar: { w: 85.6, h: 54 },
  pan:    { w: 85.6, h: 54 },
  voter:  { w: 85.6, h: 54 },
};

let state = {
  mode: 'id',            // 'id' | 'mixed'
  globalType: 'aadhar',
  customW: 90, customH: 60,
  docs: [],               // {id, img, corners, wmm, hmm, type, processedCanvas, status}
  editingId: null,
  cameraStream: null,
  pageCanvases: [],
};

const $ = (sel) => document.querySelector(sel);
const els = {
  cvDot: $('#cvDot'), cvStatus: $('#cvStatus'),
  dropzone: $('#dropzone'), fileInput: $('#fileInput'),
  cameraBtn: $('#cameraBtn'), cameraPanel: $('#cameraPanel'), cameraVideo: $('#cameraVideo'),
  captureBtn: $('#captureBtn'), closeCameraBtn: $('#closeCameraBtn'),
  listPanel: $('#listPanel'), docList: $('#docList'), docCount: $('#docCount'),
  editorPanel: $('#editorPanel'), editorWrap: $('#editorWrap'), editorCanvas: $('#editorCanvas'),
  confirmCropBtn: $('#confirmCropBtn'), cancelCropBtn: $('#cancelCropBtn'),
  stageEmpty: $('#stageEmpty'), pages: $('#pages'), exportRow: $('#exportRow'),
  generateBtn: $('#generateBtn'), dpiSelect: $('#dpiSelect'),
  globalType: $('#globalType'), customSizeFields: $('#customSizeFields'),
  customW: $('#customW'), customH: $('#customH'),
  dlPdfBtn: $('#dlPdfBtn'), dlJpegBtn: $('#dlJpegBtn'), printBtn: $('#printBtn'),
  typePanel: $('#typePanel'), modeHint: $('#modeHint'),
};

// ---------------- init ----------------
(async function init(){
  const ok = await PF.loadOpenCV();
  els.cvDot.classList.add(ok ? 'ready' : 'ready');
  els.cvStatus.textContent = ok
    ? 'Edge detection ready — auto-crop enabled.'
    : 'Edge detection unavailable — manual corner drag still works.';
})();

// ---------------- mode / type controls ----------------
document.querySelectorAll('#modeSeg button').forEach(btn=>{
  btn.addEventListener('click', () => {
    document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    els.typePanel.style.display = state.mode === 'id' ? '' : 'none';
    els.modeHint.textContent = state.mode === 'id'
      ? 'All documents printed at one fixed card size, packed edge to edge on A4.'
      : 'Each document keeps its own size — the page auto-arranges the gaps to fit everything neatly.';
    renderDocList();
  });
});

els.globalType.addEventListener('change', () => {
  state.globalType = els.globalType.value;
  els.customSizeFields.style.display = state.globalType === 'custom' ? '' : 'none';
  if (state.mode === 'id') reprocessAllForGlobalType();
});
els.customW.addEventListener('input', () => { state.customW = +els.customW.value || 90; if(state.mode==='id') reprocessAllForGlobalType(); });
els.customH.addEventListener('input', () => { state.customH = +els.customH.value || 60; if(state.mode==='id') reprocessAllForGlobalType(); });

function sizeForType(type){
  if (type === 'custom') return { w: state.customW, h: state.customH };
  return TYPE_SIZES[type] || TYPE_SIZES.aadhar;
}

// ---------------- add documents ----------------
els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('dragover', e => { e.preventDefault(); });
els.dropzone.addEventListener('drop', e => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});
els.fileInput.addEventListener('change', () => addFiles(els.fileInput.files));

async function addFiles(fileList){
  for (const file of fileList){
    if (!file.type.startsWith('image/')) continue;
    const img = await PF.fileToImage(file);
    await addDocument(img);
  }
  els.fileInput.value = '';
}

async function addDocument(img){
  const type = state.mode === 'id' ? state.globalType : 'aadhar';
  const size = sizeForType(type);
  const doc = {
    id: 'd' + Math.random().toString(36).slice(2),
    img, corners: null, type, wmm: size.w, hmm: size.h,
    processedCanvas: null, status: 'detecting',
  };
  state.docs.push(doc);
  renderDocList();
  els.listPanel.style.display = '';

  doc.corners = PF.autoDetectCorners(img);
  await processDoc(doc);
}

async function processDoc(doc){
  doc.status = 'processing';
  renderDocList();
  const dpi = 300;
  const outW = PF.mmToPx(doc.wmm, dpi), outH = PF.mmToPx(doc.hmm, dpi);
  const warped = PF.warpToRect(doc.img, doc.corners, outW, outH);
  PF.enhance(warped);
  doc.processedCanvas = warped;
  doc.status = 'ready';
  renderDocList();
}

function reprocessAllForGlobalType(){
  const size = sizeForType(state.globalType);
  state.docs.forEach(d => { d.type = state.globalType; d.wmm = size.w; d.hmm = size.h; });
  Promise.all(state.docs.map(processDoc)).then(renderDocList);
}

// ---------------- camera ----------------
els.cameraBtn.addEventListener('click', async () => {
  els.cameraPanel.style.display = '';
  try{
    state.cameraStream = await PF.openCamera(els.cameraVideo);
  } catch(e){
    alert('Camera access denied or unavailable. Aap file upload use kar sakte hain.');
    els.cameraPanel.style.display = 'none';
  }
});
els.closeCameraBtn.addEventListener('click', closeCamera);
function closeCamera(){
  PF.stopCamera(state.cameraStream);
  state.cameraStream = null;
  els.cameraPanel.style.display = 'none';
}
els.captureBtn.addEventListener('click', async () => {
  const shot = PF.captureFrame(els.cameraVideo);
  const img = await PF.canvasToImage(shot);
  await addDocument(img);
});

// ---------------- doc list UI ----------------
function renderDocList(){
  els.docCount.textContent = state.docs.length;
  els.docList.innerHTML = '';
  els.stageEmpty.style.display = state.docs.length ? 'none' : '';

  state.docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';

    const thumb = document.createElement('img');
    thumb.src = (doc.processedCanvas || doc.img).toDataURL ? (doc.processedCanvas || doc.img).toDataURL() : doc.img.src;

    const meta = document.createElement('div');
    meta.className = 'di-meta';
    const name = document.createElement('div');
    name.className = 'di-name';
    name.textContent = labelForType(doc.type);
    const sub = document.createElement('div');
    sub.className = 'di-sub';
    sub.textContent = `${doc.wmm}×${doc.hmm}mm · ${statusLabel(doc.status)}`;
    meta.appendChild(name); meta.appendChild(sub);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost small';
    editBtn.textContent = 'Edit crop';
    editBtn.addEventListener('click', () => openEditor(doc.id));

    const wrap = document.createElement('div');
    wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap='6px';

    if (state.mode === 'mixed'){
      const sel = document.createElement('select');
      sel.style.fontSize = '11px'; sel.style.padding='4px';
      ['aadhar','pan','voter','custom'].forEach(t=>{
        const o = document.createElement('option'); o.value=t; o.textContent = labelForType(t);
        if (t===doc.type) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        doc.type = sel.value;
        const size = sizeForType(sel.value === 'custom' ? 'custom' : sel.value);
        doc.wmm = size.w; doc.hmm = size.h;
        processDoc(doc);
      });
      wrap.appendChild(sel);
    }
    wrap.appendChild(editBtn);

    const rm = document.createElement('button');
    rm.className = 'rm'; rm.textContent = '✕';
    rm.addEventListener('click', () => {
      state.docs = state.docs.filter(d=>d.id!==doc.id);
      renderDocList();
    });

    item.appendChild(thumb); item.appendChild(meta); item.appendChild(wrap); item.appendChild(rm);
    els.docList.appendChild(item);
  });
}

function labelForType(t){
  return { aadhar:'Aadhar Card', pan:'PAN Card', voter:'Voter ID', custom:'Custom' }[t] || t;
}
function statusLabel(s){
  return { detecting:'detecting edges…', processing:'straightening…', ready:'ready' }[s] || s;
}

// ---------------- corner editor ----------------
let editorState = null;

function openEditor(docId){
  const doc = state.docs.find(d=>d.id===docId);
  if (!doc) return;
  state.editingId = docId;
  els.editorPanel.style.display = '';
  els.editorPanel.scrollIntoView({behavior:'smooth', block:'nearest'});

  const maxW = 520;
  const scale = Math.min(1, maxW / doc.img.naturalWidth);
  const cw = Math.round(doc.img.naturalWidth * scale), ch = Math.round(doc.img.naturalHeight * scale);
  els.editorCanvas.width = cw; els.editorCanvas.height = ch;
  const ctx = els.editorCanvas.getContext('2d');
  ctx.drawImage(doc.img, 0, 0, cw, ch);

  document.querySelectorAll('.handle').forEach(h=>h.remove());
  const corners = doc.corners.map(c => ({ x: c.x*scale, y: c.y*scale }));
  editorState = { doc, scale, corners, handles: [] };

  corners.forEach((c, i) => {
    const h = document.createElement('div');
    h.className = 'handle';
    h.style.left = c.x + 'px'; h.style.top = c.y + 'px';
    els.editorWrap.appendChild(h);
    editorState.handles.push(h);
    makeDraggable(h, i, cw, ch);
  });
  drawGuideLines();
}

function makeDraggable(handle, index, cw, ch){
  let dragging = false;
  const onDown = (e) => { dragging = true; e.preventDefault(); };
  const onMove = (e) => {
    if (!dragging) return;
    const rect = els.editorWrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let x = clientX - rect.left, y = clientY - rect.top;
    x = Math.max(0, Math.min(cw, x)); y = Math.max(0, Math.min(ch, y));
    handle.style.left = x + 'px'; handle.style.top = y + 'px';
    editorState.corners[index] = { x, y };
    drawGuideLines();
  };
  const onUp = () => { dragging = false; };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

function drawGuideLines(){
  let svg = els.editorWrap.querySelector('svg.editor-lines');
  if (!svg){
    svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','editor-lines');
    els.editorWrap.appendChild(svg);
  }
  const cw = els.editorCanvas.width, ch = els.editorCanvas.height;
  svg.setAttribute('width', cw); svg.setAttribute('height', ch);
  const pts = editorState.corners.map(c=>`${c.x},${c.y}`).join(' ');
  svg.innerHTML = `<polygon points="${pts}" fill="rgba(214,49,126,0.12)" stroke="#D6317E" stroke-width="2"/>`;
}

els.confirmCropBtn.addEventListener('click', async () => {
  const { doc, scale, corners } = editorState;
  doc.corners = corners.map(c => ({ x: c.x/scale, y: c.y/scale }));
  closeEditor();
  await processDoc(doc);
});
els.cancelCropBtn.addEventListener('click', closeEditor);

function closeEditor(){
  els.editorPanel.style.display = 'none';
  document.querySelectorAll('.handle').forEach(h=>h.remove());
  const svg = els.editorWrap.querySelector('svg.editor-lines');
  if (svg) svg.remove();
  editorState = null;
}

// ---------------- generate layout ----------------
els.generateBtn.addEventListener('click', async () => {
  const ready = state.docs.filter(d=>d.status==='ready' && d.processedCanvas);
  if (!ready.length){ alert('Pehle kam se kam ek document add karein.'); return; }
  const dpi = +els.dpiSelect.value;

  let pageDefs, images;
  if (state.mode === 'id'){
    const size = sizeForType(state.globalType);
    pageDefs = PF.packUniformGrid(ready.length, size.w, size.h, 8, 4);
    images = ready.map(d=>d.processedCanvas);
    els.pages.innerHTML = '';
    const canvases = [];
    let cursor = 0;
    pageDefs.forEach(page => {
      const pageImages = images.slice(cursor, cursor+page.length);
      cursor += page.length;
      const c = PF.renderA4Canvas(page, pageImages, dpi);
      canvases.push(c);
    });
    showPages(canvases);
  } else {
    const items = ready.map(d => ({ w:d.wmm, h:d.hmm }));
    pageDefs = PF.packShelves(items, 8, 4);
    images = ready.map(d=>d.processedCanvas);
    const canvases = pageDefs.map(page => PF.renderA4Canvas(page, images, dpi));
    showPages(canvases);
  }
});

function showPages(canvases){
  state.pageCanvases = canvases;
  els.pages.innerHTML = '';
  els.pages.style.display = '';
  els.exportRow.style.display = '';
  els.stageEmpty.style.display = 'none';
  canvases.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.style.width = '100%'; wrap.style.maxWidth = '420px';
    const label = document.createElement('div');
    label.className = 'hint'; label.style.marginBottom='6px';
    label.innerHTML = `<b>Page ${i+1}</b> of ${canvases.length} · A4 · ${c.width}×${c.height}px`;
    const pageDiv = document.createElement('div');
    pageDiv.className = 'a4-page';
    pageDiv.style.aspectRatio = '210/297';
    const img = document.createElement('img');
    img.src = c.toDataURL('image/jpeg', 0.92);
    img.style.width = '100%'; img.style.display='block';
    pageDiv.appendChild(img);
    wrap.appendChild(label); wrap.appendChild(pageDiv);
    els.pages.appendChild(wrap);
  });
}

els.dlPdfBtn.addEventListener('click', () => PF.downloadPagesAsPDF(state.pageCanvases, 'adp-printflow-documents.pdf'));
els.dlJpegBtn.addEventListener('click', () => {
  state.pageCanvases.forEach((c,i) => PF.downloadCanvasAsJPEG(c, `adp-printflow-documents-page${i+1}.jpg`));
});
els.printBtn.addEventListener('click', () => PF.printCanvases(state.pageCanvases));
