const CONFIG = { A4_W: 2480, A4_H: 3508, MAX_DIM: 1200, EXP_DIM: 4000 };
let cvReady = false, srcMat = null, procMat = null;
let p = { b: 0, c: 1, s: 0, bw: false, rot: 0 };

const DOM = {
    load: document.getElementById('loader'),
    canvas: document.getElementById('doc-canvas'),
    file: document.getElementById('file-input'),
    btnGal: document.getElementById('btn-gallery'),
    btnAuto: document.getElementById('btn-auto'),
    btnCrop: document.getElementById('btn-crop'),
    btnRot: document.getElementById('btn-rotate'),
    b: document.getElementById('val-b'),
    c: document.getElementById('val-c'),
    s: document.getElementById('val-s'),
    bw: document.getElementById('btn-bw'),
    col: document.getElementById('btn-col')
};

document.addEventListener('DOMContentLoaded', () => {
    const checkCV = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.getBuildInformation) {
            clearInterval(checkCV); cvReady = true; DOM.load.classList.add('hidden');
        }
    }, 100);
});

const cleanup = (...mats) => { mats.forEach(m => { if(m && !m.isDeleted) try{ m.delete(); }catch(e){} }); };

DOM.btnGal.addEventListener('click', () => DOM.file.click());
DOM.file.addEventListener('change', (e) => {
    if (!e.target.files[0]) return;
    DOM.load.classList.remove('hidden');
    const img = new Image(), url = URL.createObjectURL(e.target.files[0]);
    img.onload = () => {
        if (srcMat) cleanup(srcMat);
        srcMat = cv.imread(img);
        URL.revokeObjectURL(url);
        render(); DOM.load.classList.add('hidden');
    };
    img.src = url;
});

function processPipeline(source, isExport = false) {
    if (!source) return null;
    let dst = new cv.Mat(), temp = new cv.Mat();
    try {
        source.copyTo(temp);
        if (p.rot === 90) cv.rotate(temp, temp, cv.ROTATE_90_CLOCKWISE);
        else if (p.rot === 180) cv.rotate(temp, temp, cv.ROTATE_180);
        else if (p.rot === 270) cv.rotate(temp, temp, cv.ROTATE_90_COUNTERCLOCKWISE);

        if (p.bw) {
            let gray = new cv.Mat(), enh = new cv.Mat();
            cv.cvtColor(temp, gray, cv.COLOR_RGBA2GRAY, 0);
            gray.convertTo(enh, -1, p.c, p.b);
            cv.adaptiveThreshold(enh, temp, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 15);
            cv.cvtColor(temp, temp, cv.COLOR_GRAY2RGBA, 0);
            cleanup(gray, enh);
        } else {
            temp.convertTo(temp, -1, p.c, p.b);
        }
        
        if (p.s > 0) {
            let blur = new cv.Mat();
            cv.GaussianBlur(temp, blur, new cv.Size(0,0), 3);
            cv.addWeighted(temp, 1+(p.s/10), blur, -(p.s/10), 0, temp);
            cleanup(blur);
        }
        temp.copyTo(dst); return dst;
    } finally { cleanup(temp); }
}

function render() {
    if (!srcMat) return;
    requestAnimationFrame(() => {
        if (procMat) cleanup(procMat);
        procMat = processPipeline(srcMat);
        cv.imshow(DOM.canvas, procMat);
    });
}

// Controls
DOM.b.addEventListener('input', e => { p.b = parseInt(e.target.value); render(); });
DOM.c.addEventListener('input', e => { p.c = parseFloat(e.target.value); render(); });
DOM.s.addEventListener('input', e => { p.s = parseInt(e.target.value); render(); });
DOM.bw.addEventListener('click', () => { p.bw = true; DOM.bw.classList.add('active'); DOM.col.classList.remove('active'); render(); });
DOM.col.addEventListener('click', () => { p.bw = false; DOM.col.classList.add('active'); DOM.bw.classList.remove('active'); render(); });
DOM.btnRot.addEventListener('click', () => { p.rot = (p.rot + 90) % 360; render(); });

async function getExportCanvas() {
    DOM.load.classList.remove('hidden');
    return new Promise(res => setTimeout(() => {
        if (!srcMat) { DOM.load.classList.add('hidden'); return res(null); }
        const c = document.createElement('canvas'); c.width = CONFIG.A4_W; c.height = CONFIG.A4_H;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,CONFIG.A4_W,CONFIG.A4_H);
        
        let out = processPipeline(srcMat, true);
        const tempC = document.createElement('canvas'); cv.imshow(tempC, out); cleanup(out);
        
        let sc = Math.min((CONFIG.A4_W-240)/tempC.width, (CONFIG.A4_H-240)/tempC.height);
        let dw = tempC.width*sc, dh = tempC.height*sc;
        ctx.drawImage(tempC, 120+(CONFIG.A4_W-240-dw)/2, 120+(CONFIG.A4_H-240-dh)/2, dw, dh);
        
        DOM.load.classList.add('hidden'); res(c);
    }, 50));
}

document.getElementById('btn-pdf').addEventListener('click', async () => {
    const c = await getExportCanvas(); if (!c) return;
    c.toBlob(b => {
        const u = URL.createObjectURL(b), i = new Image();
        i.onload = () => {
            const { jsPDF } = window.jspdf; const p = new jsPDF('p','pt','a4',true);
            p.addImage(i,'JPEG',0,0,p.internal.pageSize.getWidth(),p.internal.pageSize.getHeight(),'','FAST');
            p.save('ADP_Doc.pdf'); URL.revokeObjectURL(u);
        }; i.src = u;
    }, 'image/jpeg', 0.9);
});
document.getElementById('btn-jpg').addEventListener('click', async () => {
    const c = await getExportCanvas(); if (!c) return;
    c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ADP_Doc.jpg'; a.click(); }, 'image/jpeg', 0.95);
});
