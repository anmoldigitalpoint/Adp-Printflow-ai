/* ===================================================================
   Quick Photo Print
   =================================================================== */

const PASSPORT_MM = { w: 35, h: 45 };

let qState = {
  docs: [],          // {id, img, box:{x,y,w,h} in natural px, processedCanvas}
  count: 6,
  cameraStream: null,
  pageCanvases: [],
};

const q$ = (sel) => document.querySelector(sel);
const qels = {
  dropzone: q$('#dropzone'), fileInput: q$('#fileInput'),
  cameraBtn: q$('#cameraBtn'), cameraPanel: q$('#cameraPanel'), cameraVideo: q$('#cameraVideo'),
  captureBtn: q$('#captureBtn'), closeCameraBtn: q$('#closeCameraBtn'),
  listPanel: q$('#listPanel'), docList: q$('#docList'), docCount: q$('#docCount'),
  editorPanel: q$('#editorPanel'), editorWrap: q$('#editorWrap'), editorCanvas: q$('#editorCanvas'),
  confirmCropBtn: q$('#confirmCropBtn'), cancelCropBtn: q$('#cancelCropBtn'),
  stageEmpty: q$('#stageEmpty'), pages: q$('#pages'), exportRow: q$('#exportRow'),
  generateBtn: q$('#generateBtn'), dpiSelect: q$('#dpiSelect'),
  dlPdfBtn: q$('#dlPdfBtn'), dlJpegBtn: q$('#dlJpegBtn'), printBtn: q$('#printBtn'),
};

document.querySelectorAll('#countSeg button').forEach(btn=>{
  btn.addEventListener('click', () => {
    document.querySelectorAll('#countSeg button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    qState.count = +btn.dataset.count;
  });
});

// ---------------- add photos ----------------
qels.dropzone.addEventListener('click', () => qels.fileInput.click());
qels.dropzone.addEventListener('dragover', e => e.preventDefault());
qels.dropzone.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
qels.fileInput.addEventListener('change', () => addFiles(qels.fileInput.files));

async function addFiles(fileList){
  for (const file of fileList){
    if (!file.type.startsWith('image/')) continue;
    const img = await PF.fileToImage(file);
    addPhoto(img);
  }
  qels.fileInput.value = '';
}

function defaultBox(img){
  const targetRatio = PASSPORT_MM.w / PASSPORT_MM.h; // 0.777
  const W = img.naturalWidth, H = img.naturalHeight;
  let w, h;
  if (W / H > targetRatio){ h = H; w = h * targetRatio; } else { w = W; h = w / targetRatio; }
  return { x: (W-w)/2, y: (H-h)/2, w, h };
}

function addPhoto(img){
  const doc = { id:'p'+Math.random().toString(36).slice(2), img, box: defaultBox(img), processedCanvas:null };
  qState.docs.push(doc);
  processPhoto(doc);
  renderDocList();
  qels.listPanel.style.display = '';
}

function processPhoto(doc){
  const dpi = 300;
  const outW = PF.mmToPx(PASSPORT_MM.w, dpi), outH = PF.mmToPx(PASSPORT_MM.h, dpi);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  c.getContext('2d').drawImage(doc.img, doc.box.x, doc.box.y, doc.box.w, doc.box.h, 0, 0, outW, outH);
  PF.enhance(c);
  doc.processedCanvas = c;
}

// ---------------- camera ----------------
qels.cameraBtn.addEventListener('click', async () => {
  qels.cameraPanel.style.display = '';
  try{ qState.cameraStream = await PF.openCamera(qels.cameraVideo); }
  catch(e){ alert('Camera access denied ya unavailable. File upload use karein.'); qels.cameraPanel.style.display='none'; }
});
qels.closeCameraBtn.addEventListener('click', () => { PF.stopCamera(qState.cameraStream); qState.cameraStream=null; qels.cameraPanel.style.display='none'; });
qels.captureBtn.addEventListener('click', async () => {
  const shot = PF.captureFrame(qels.cameraVideo);
  const img = await PF.canvasToImage(shot);
  addPhoto(img);
});

// ---------------- list ----------------
function renderDocList(){
  qels.docCount.textContent = qState.docs.length;
  qels.docList.innerHTML = '';
  qels.stageEmpty.style.display = qState.docs.length ? 'none' : '';

  qState.docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    const thumb = document.createElement('img');
    thumb.src = doc.processedCanvas.toDataURL();
    const meta = document.createElement('div');
    meta.className = 'di-meta';
    meta.innerHTML = `<div class="di-name">Passport photo</div><div class="di-sub">35×45mm · ready</div>`;
    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost small'; editBtn.textContent = 'Adjust';
    editBtn.addEventListener('click', () => openEditor(doc.id));
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.textContent = '✕';
    rm.addEventListener('click', () => { qState.docs = qState.docs.filter(d=>d.id!==doc.id); renderDocList(); });
    item.appendChild(thumb); item.appendChild(meta); item.appendChild(editBtn); item.appendChild(rm);
    qels.docList.appendChild(item);
  });
}

// ---------------- crop editor (pan + resize, aspect locked) ----------------
let qEditor = null;

function openEditor(id){
  const doc = qState.docs.find(d=>d.id===id);
  if (!doc) return;
  qels.editorPanel.style.display = '';
  qels.editorPanel.scrollIntoView({behavior:'smooth', block:'nearest'});

  const maxW = 480;
  const scale = Math.min(1, maxW / doc.img.naturalWidth);
  const cw = Math.round(doc.img.naturalWidth*scale), ch = Math.round(doc.img.naturalHeight*scale);
  qels.editorCanvas.width = cw; qels.editorCanvas.height = ch;

  qEditor = { doc, scale, box: { x: doc.box.x*scale, y: doc.box.y*scale, w: doc.box.w*scale, h: doc.box.h*scale }, mode: null };
  drawEditor();

  qels.editorCanvas.onmousedown = onEditorDown;
  qels.editorCanvas.onmousemove = onEditorMove;
  window.onmouseup = () => { if(qEditor) qEditor.mode = null; };
  qels.editorCanvas.ontouchstart = (e)=>onEditorDown(touchToMouse(e));
  qels.editorCanvas.ontouchmove = (e)=>{ e.preventDefault(); onEditorMove(touchToMouse(e)); };
  window.ontouchend = () => { if(qEditor) qEditor.mode = null; };
}
function touchToMouse(e){
  const t = e.touches[0]; const rect = qels.editorCanvas.getBoundingClientRect();
  return { offsetX: t.clientX-rect.left, offsetY: t.clientY-rect.top };
}

function drawEditor(){
  const { doc, box, scale } = qEditor;
  const ctx = qels.editorCanvas.getContext('2d');
  const cw = qels.editorCanvas.width, ch = qels.editorCanvas.height;
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(doc.img, 0, 0, cw, ch);
  ctx.fillStyle = 'rgba(22,24,29,0.45)';
  ctx.fillRect(0,0,cw,ch);
  ctx.clearRect(box.x, box.y, box.w, box.h);
  ctx.drawImage(doc.img, doc.box.x, doc.box.y, doc.box.w, doc.box.h, box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#D6317E'; ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  // resize handle bottom-right
  ctx.fillStyle = '#D6317E';
  ctx.beginPath();
  ctx.arc(box.x+box.w, box.y+box.h, 8, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

function onEditorDown(e){
  const box = qEditor.box;
  const x = e.offsetX, y = e.offsetY;
  const nearHandle = Math.hypot(x-(box.x+box.w), y-(box.y+box.h)) < 14;
  if (nearHandle){ qEditor.mode = 'resize'; }
  else if (x>box.x && x<box.x+box.w && y>box.y && y<box.y+box.h){
    qEditor.mode = 'move'; qEditor.grab = { dx: x-box.x, dy: y-box.y };
  }
}
function onEditorMove(e){
  if (!qEditor || !qEditor.mode) return;
  const box = qEditor.box;
  const cw = qels.editorCanvas.width, ch = qels.editorCanvas.height;
  const x = e.offsetX, y = e.offsetY;
  const ratio = PASSPORT_MM.w / PASSPORT_MM.h;

  if (qEditor.mode === 'move'){
    box.x = Math.max(0, Math.min(cw-box.w, x - qEditor.grab.dx));
    box.y = Math.max(0, Math.min(ch-box.h, y - qEditor.grab.dy));
  } else if (qEditor.mode === 'resize'){
    let w = Math.max(30, x - box.x);
    w = Math.min(w, cw-box.x, (ch-box.y)*ratio);
    box.w = w; box.h = w/ratio;
  }
  drawEditor();
}

qels.confirmCropBtn.addEventListener('click', () => {
  const { doc, box, scale } = qEditor;
  doc.box = { x: box.x/scale, y: box.y/scale, w: box.w/scale, h: box.h/scale };
  processPhoto(doc);
  renderDocList();
  closeEditor();
});
qels.cancelCropBtn.addEventListener('click', closeEditor);
function closeEditor(){ qels.editorPanel.style.display='none'; qEditor=null; }

// ---------------- generate layout ----------------
qels.generateBtn.addEventListener('click', () => {
  if (!qState.docs.length){ alert('Pehle kam se kam ek photo add karein.'); return; }
  const dpi = +qels.dpiSelect.value;
  const cols = 6;
  const pageDefs = PF.packFixedCols(qState.count, cols, 8, 4, PASSPORT_MM.w/PASSPORT_MM.h);
  const images = [];
  for (let i=0;i<qState.count;i++) images.push(qState.docs[i % qState.docs.length].processedCanvas);
  const canvases = pageDefs.map(page => PF.renderA4Canvas(page, images, dpi));
  showPages(canvases);
});

function showPages(canvases){
  qState.pageCanvases = canvases;
  qels.pages.innerHTML = '';
  qels.pages.style.display = '';
  qels.exportRow.style.display = '';
  qels.stageEmpty.style.display = 'none';
  canvases.forEach((c,i)=>{
    const wrap = document.createElement('div');
    wrap.style.width='100%'; wrap.style.maxWidth='420px';
    const label = document.createElement('div');
    label.className='hint'; label.style.marginBottom='6px';
    label.innerHTML = `<b>Page ${i+1}</b> of ${canvases.length} · A4 · ${c.width}×${c.height}px`;
    const pageDiv = document.createElement('div');
    pageDiv.className='a4-page'; pageDiv.style.aspectRatio='210/297';
    const img = document.createElement('img');
    img.src = c.toDataURL('image/jpeg', 0.92); img.style.width='100%'; img.style.display='block';
    pageDiv.appendChild(img);
    wrap.appendChild(label); wrap.appendChild(pageDiv);
    qels.pages.appendChild(wrap);
  });
}

qels.dlPdfBtn.addEventListener('click', () => PF.downloadPagesAsPDF(qState.pageCanvases, 'adp-printflow-photos.pdf'));
qels.dlJpegBtn.addEventListener('click', () => { qState.pageCanvases.forEach((c,i)=>PF.downloadCanvasAsJPEG(c, `adp-printflow-photos-page${i+1}.jpg`)); });
qels.printBtn.addEventListener('click', () => PF.printCanvases(qState.pageCanvases));
