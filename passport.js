import { FaceDetector, ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

const DOM = { load: document.getElementById('pass-loader'), c: document.getElementById('pass-canvas'), file: document.getElementById('pass-file'), btnUp: document.getElementById('btn-pass-up'), btnAlign: document.getElementById('btn-align'), btnRm: document.getElementById('btn-rmbg'), selSz: document.getElementById('sel-size'), selSh: document.getElementById('sel-sheet'), bgOrg: document.getElementById('bg-org'), bgWht: document.getElementById('bg-wht'), bgBlu: document.getElementById('bg-blu') };

let fd, seg, baseImg = null, mask = null, bg = 'org';
const SIZES = { '3.5x4.5': {w:413, h:531}, '2x2': {w:600, h:600} };
const A4 = {w:2480, h:3508};

async function init() {
    try {
        const vis = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
        fd = await FaceDetector.createFromOptions(vis, { baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", delegate:"GPU"}, runningMode:"IMAGE" });
        seg = await ImageSegmenter.createFromOptions(vis, { baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite", delegate:"GPU"}, runningMode:"IMAGE", outputCategoryMask:true });
        DOM.load.classList.add('hidden');
    } catch(e) { console.warn("MP failed", e); }
}

DOM.btnUp.addEventListener('click', () => DOM.file.click());
DOM.file.addEventListener('change', e => {
    if (!e.target.files[0]) return;
    const i = new Image(), u = URL.createObjectURL(e.target.files[0]);
    i.onload = () => { baseImg = i; mask = null; render(); }; i.src = u;
});

function render() {
    if (!baseImg) return;
    const ctx = DOM.c.getContext('2d');
    DOM.c.width = baseImg.width; DOM.c.height = baseImg.height;
    if (bg !== 'org' && mask) {
        ctx.fillStyle = bg === 'wht' ? '#fff' : '#3b82f6'; ctx.fillRect(0,0,DOM.c.width,DOM.c.height);
        ctx.drawImage(mask,0,0); ctx.globalCompositeOperation = 'source-in';
    }
    ctx.drawImage(baseImg, 0, 0);
}

DOM.btnAlign.addEventListener('click', async () => {
    if (!baseImg || !fd) return; DOM.load.classList.remove('hidden');
    setTimeout(() => {
        const d = fd.detect(baseImg);
        if (d.detections.length > 0) {
            const bb = d.detections[0].boundingBox, cx = bb.originX + bb.width/2, cy = bb.originY + bb.height/2;
            const sz = SIZES[DOM.selSz.value], r = sz.w/sz.h, th = bb.height*2.5, tw = th*r;
            const tc = document.createElement('canvas'); tc.width = sz.w; tc.height = sz.h;
            tc.getContext('2d').drawImage(baseImg, cx-tw/2, cy-th/2.2, tw, th, 0, 0, sz.w, sz.h);
            const i = new Image(); i.onload = () => { baseImg = i; mask = null; render(); DOM.load.classList.add('hidden'); }; i.src = tc.toDataURL();
        } else { DOM.load.classList.add('hidden'); alert("No face detected!"); }
    }, 50);
});

DOM.btnRm.addEventListener('click', async () => {
    if (!baseImg || !seg) return; DOM.load.classList.remove('hidden');
    setTimeout(() => {
        seg.segment(baseImg, (res) => {
            const mk = res.categoryMask, tc = document.createElement('canvas'), ctx = tc.getContext('2d');
            tc.width = mk.width; tc.height = mk.height; const d = ctx.createImageData(tc.width, tc.height);
            for(let i=0; i<mk.getAsFloat32Array().length; i++){ d.data[i*4+3] = mk.getAsFloat32Array()[i]>0?255:0; d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=255; }
            ctx.putImageData(d,0,0); const i = new Image(); i.onload = () => { mask = i; bg = 'wht'; DOM.bgWht.classList.add('active'); DOM.bgOrg.classList.remove('active'); render(); DOM.load.classList.add('hidden'); }; i.src = tc.toDataURL();
        });
    }, 50);
});

[DOM.bgOrg, DOM.bgWht, DOM.bgBlu].forEach(b => b.addEventListener('click', e => {
    [DOM.bgOrg, DOM.bgWht, DOM.bgBlu].forEach(x => x.classList.remove('active'));
    e.target.classList.add('active'); bg = e.target.id.replace('bg-',''); render();
}));

async function getSheet() {
    if (!baseImg) return null; DOM.load.classList.remove('hidden');
    return new Promise(res => setTimeout(() => {
        const c = document.createElement('canvas'), ctx = c.getContext('2d');
        c.width = A4.w; c.height = A4.h; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,A4.w,A4.h);
        const sz = SIZES[DOM.selSz.value], n = parseInt(DOM.selSh.value), cols = n>6?4:3, rows = n>6?n/4:2, gap = 50;
        const sx = (A4.w-(cols*sz.w)-((cols-1)*gap))/2, sy = 200;
        const pc = document.createElement('canvas'), pctx = pc.getContext('2d'); pc.width = sz.w; pc.height = sz.h;
        if (bg !== 'org' && mask) { pctx.fillStyle = bg==='wht'?'#fff':'#3b82f6'; pctx.fillRect(0,0,sz.w,sz.h); pctx.drawImage(mask,0,0); pctx.globalCompositeOperation = 'source-in'; }
        pctx.drawImage(baseImg,0,0);
        for(let r=0; r<rows; r++) for(let c=0; c<cols; c++) { ctx.drawImage(pc, sx+c*(sz.w+gap), sy+r*(sz.h+gap)); ctx.strokeStyle = '#ccc'; ctx.strokeRect(sx+c*(sz.w+gap), sy+r*(sz.h+gap), sz.w, sz.h); }
        DOM.load.classList.add('hidden'); res(c);
    }, 50));
}

document.getElementById('btn-pass-pdf').addEventListener('click', async () => {
    const s = await getSheet(); if (!s) return;
    s.toBlob(b => { const u = URL.createObjectURL(b), i = new Image(); i.onload = () => { const { jsPDF } = window.jspdf; const p = new jsPDF('p','pt','a4',true); p.addImage(i,'JPEG',0,0,p.internal.pageSize.getWidth(),p.internal.pageSize.getHeight(),'','FAST'); p.save('ADP_Pass.pdf'); URL.revokeObjectURL(u); }; i.src = u; }, 'image/jpeg', 0.9);
});
document.getElementById('btn-pass-jpg').addEventListener('click', async () => { const s = await getSheet(); if (!s) return; s.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ADP_Pass.jpg'; a.click(); }, 'image/jpeg', 0.95); });
init();
