const PASSPORT_WIDTH = 35; const PASSPORT_HEIGHT = 45; const CARD_WIDTH = 85.6; const CARD_HEIGHT = 54.0; const A4_WIDTH = 210; const A4_HEIGHT = 297;

const app = {
    navigate: function(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
        window.scrollTo(0, 0);
    },

    // ============================================
    // 1. PRINT TOOLS LOGIC
    // ============================================
    resizeForMobile: function(file, maxWidth) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    passportImageData: null,
    handlePassport: async function() {
        const file = document.getElementById('passport-input').files[0]; if (!file) return;
        document.getElementById('passport-upload').classList.add('hidden'); document.getElementById('passport-workspace').classList.remove('hidden');
        const steps = document.getElementById('passport-steps').children;
        try {
            steps[0].style.color = 'var(--neon-blue)';
            const optimizedBlob = await this.resizeForMobile(file, 800);
            const aiConfig = { publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.3/dist/" };
            const transparentBlob = await imglyRemoveBackground(optimizedBlob, aiConfig);
            steps[0].innerText = '✅ AI Background Removed'; steps[1].style.color = 'var(--neon-blue)';
            const url = URL.createObjectURL(transparentBlob); const img = new Image();
            img.onload = () => {
                this.cropAndBlueBackground(img); 
                steps[1].innerText = '✅ Background Applied'; steps[2].style.color = 'var(--neon-blue)';
                setTimeout(() => { document.getElementById('passport-steps').classList.add('hidden'); document.getElementById('passport-preview').classList.remove('hidden'); }, 500);
            };
            img.src = url;
        } catch (error) { steps[0].style.color = 'red'; steps[0].innerText = '❌ Error: Browser AI failed.'; }
    },
    cropAndBlueBackground: function(transparentImg) {
        const canvas = document.getElementById('passport-canvas'); const ctx = canvas.getContext('2d');
        canvas.width = 350; canvas.height = 450; ctx.fillStyle = '#0055ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const targetRatio = PASSPORT_WIDTH / PASSPORT_HEIGHT, imgRatio = transparentImg.width / transparentImg.height;
        let cropW, cropH, cropX, cropY;
        if (imgRatio > targetRatio) { cropH = transparentImg.height; cropW = transparentImg.height * targetRatio; cropX = (transparentImg.width - cropW) / 2; cropY = 0; } 
        else { cropW = transparentImg.width; cropH = transparentImg.width / targetRatio; cropX = 0; cropY = (transparentImg.height - cropH) / 4; }
        ctx.drawImage(transparentImg, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 10; ctx.strokeStyle = '#000000'; ctx.strokeRect(0, 0, canvas.width, canvas.height);
        this.passportImageData = canvas.toDataURL('image/jpeg', 1.0);
    },
    generatePassportDoc: function() {
        if (!this.passportImageData) return null;
        const copies = parseInt(document.getElementById('passport-copies').value); const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let cX = 15, cY = 15, count = 0;
        for (let i = 0; i < copies; i++) {
            doc.addImage(this.passportImageData, 'JPEG', cX, cY, PASSPORT_WIDTH, PASSPORT_HEIGHT); count++; cX += PASSPORT_WIDTH + 5;
            if (count >= 5) { count = 0; cX = 15; cY += PASSPORT_HEIGHT + 5; }
        } return doc;
    },
    downloadPassportPDF: function() { const doc = this.generatePassportDoc(); if(doc) doc.save('Passport_Photos.pdf'); },
    printPassport: function() { const doc = this.generatePassportDoc(); if(doc) printJS({ printable: doc.output('bloburl'), type: 'pdf', showModal: true }); },

    smartCardFrontData: null, smartCardBackData: null,
    loadSmartCard: function(side) {
        const file = document.getElementById(`smartcard-${side}`).files[0]; if (!file) return;
        document.getElementById(`${side}-status`).innerText = "✅ Uploaded"; const reader = new FileReader();
        reader.onload = (e) => {
            if (side === 'front') this.smartCardFrontData = e.target.result; if (side === 'back') this.smartCardBackData = e.target.result;
            if (this.smartCardFrontData && this.smartCardBackData) this.processSmartCardWorkflow();
        }; reader.readAsDataURL(file);
    },
    processSmartCardWorkflow: function() {
        document.getElementById('smartcard-upload-area').style.display = 'none'; document.getElementById('smartcard-workspace').classList.remove('hidden');
        setTimeout(() => { document.getElementById('smartcard-steps').classList.add('hidden'); document.getElementById('smartcard-preview').classList.remove('hidden'); this.drawSmartCardCanvas(); }, 1500);
    },
    drawSmartCardCanvas: function() {
        const canvas = document.getElementById('smartcard-canvas'); const ctx = canvas.getContext('2d'); canvas.width = 600; canvas.height = 800;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const imgF = new Image(), imgB = new Image();
        imgF.onload = () => {
            ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.drawImage(imgF, 50, 50, 500, 315); ctx.strokeRect(50, 50, 500, 315);
            imgB.onload = () => { ctx.drawImage(imgB, 50, 400, 500, 315); ctx.strokeRect(50, 400, 500, 315); };
            imgB.src = this.smartCardBackData;
        }; imgF.src = this.smartCardFrontData;
    },
    generateSmartCardDoc: function() {
        if (!this.smartCardFrontData || !this.smartCardBackData) return null;
        const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const sX = (210 - CARD_WIDTH) / 2, sYF = 20, sYB = sYF + CARD_HEIGHT + 10;
        doc.addImage(this.smartCardFrontData, 'JPEG', sX, sYF, CARD_WIDTH, CARD_HEIGHT); doc.setLineWidth(0.5); doc.rect(sX, sYF, CARD_WIDTH, CARD_HEIGHT);
        doc.addImage(this.smartCardBackData, 'JPEG', sX, sYB, CARD_WIDTH, CARD_HEIGHT); doc.rect(sX, sYB, CARD_WIDTH, CARD_HEIGHT); return doc;
    },
    downloadSmartCardPDF: function() { const doc = this.generateSmartCardDoc(); if(doc) doc.save('SmartCard.pdf'); },
    printSmartCard: function() { const doc = this.generateSmartCardDoc(); if(doc) printJS({ printable: doc.output('bloburl'), type: 'pdf', showModal: true }); },

    documentImageData: null,
    handleDocumentUpload: function() {
        const file = document.getElementById('document-input').files[0]; if (!file) return;
        if (typeof cv === 'undefined') { alert("OpenCV is loading, please wait 2 seconds and try again."); return; }
        document.getElementById('document-upload').classList.add('hidden'); document.getElementById('document-crop-area').classList.remove('hidden');
        const reader = new FileReader(); reader.onload = (e) => { const imgEl = document.getElementById('doc-source-image'); imgEl.onload = () => { this.setupDraggablePoints(); }; imgEl.src = e.target.result; }; reader.readAsDataURL(file);
    },
    setupDraggablePoints: function() {
        const points = ['pt-tl', 'pt-tr', 'pt-bl', 'pt-br'], container = document.getElementById('crop-container');
        points.forEach(id => {
            const el = document.getElementById(id); let isDragging = false;
            const moveHandler = (cX, cY) => {
                if (!isDragging) return; const rect = container.getBoundingClientRect();
                let x = Math.max(0, Math.min(cX - rect.left, rect.width)), y = Math.max(0, Math.min(cY - rect.top, rect.height));
                el.style.left = (x / rect.width * 100) + '%'; el.style.top = (y / rect.height * 100) + '%';
            };
            el.addEventListener('mousedown', () => isDragging = true); window.addEventListener('mouseup', () => isDragging = false); window.addEventListener('mousemove', (e) => moveHandler(e.clientX, e.clientY));
            el.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); }, {passive: false}); window.addEventListener('touchend', () => isDragging = false); window.addEventListener('touchmove', (e) => moveHandler(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
        });
    },
    applySmartCrop: function() {
        document.getElementById('document-crop-area').classList.add('hidden'); document.getElementById('document-workspace').classList.remove('hidden');
        const imgEl = document.getElementById('doc-source-image');
        const getP = (id) => { const el = document.getElementById(id); return { x: (parseFloat(el.style.left) / 100) * imgEl.naturalWidth, y: (parseFloat(el.style.top) / 100) * imgEl.naturalHeight }; };
        let src = cv.imread(imgEl); const outputWidth = 1240, outputHeight = 1754; let dst = new cv.Mat();
        let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [getP('pt-tl').x, getP('pt-tl').y, getP('pt-tr').x, getP('pt-tr').y, getP('pt-br').x, getP('pt-br').y, getP('pt-bl').x, getP('pt-bl').y]);
        let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight]);
        let M = cv.getPerspectiveTransform(srcCoords, dstCoords); cv.warpPerspective(src, dst, M, new cv.Size(outputWidth, outputHeight)); dst.convertTo(dst, -1, 1.2, 20); 
        cv.imshow('document-canvas', dst); src.delete(); dst.delete(); M.delete(); srcCoords.delete(); dstCoords.delete();
        this.documentImageData = document.getElementById('document-canvas').toDataURL('image/jpeg', 0.9);
    },
    generateDocumentDoc: function() { if (!this.documentImageData) return null; const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); doc.addImage(this.documentImageData, 'JPEG', 0, 0, A4_WIDTH, A4_HEIGHT); return doc; },
    downloadDocumentPDF: function() { const doc = this.generateDocumentDoc(); if(doc) doc.save('Document.pdf'); },
    printDocument: function() { const doc = this.generateDocumentDoc(); if(doc) printJS({ printable: doc.output('bloburl'), type: 'pdf', showModal: true }); },

    // ============================================
    // 2. PDF TOOLS
    // ============================================
    handlePDFMergeUI: function() {
        const files = document.getElementById('pdf-merge-input').files; if(files.length < 2) { alert("Select at least 2 PDFs."); return; }
        document.getElementById('pdf-merge-status').classList.remove('hidden'); document.getElementById('pdf-file-count').innerText = `${files.length} PDFs selected ready to merge!`;
    },
    executePDFMerge: async function() {
        const files = document.getElementById('pdf-merge-input').files; if (files.length < 2) return;
        document.getElementById('btn-do-merge').classList.add('hidden'); document.getElementById('pdf-processing-text').classList.remove('hidden');
        try {
            const { PDFDocument } = PDFLib; const mergedPdf = await PDFDocument.create();
            for (let i = 0; i < files.length; i++) {
                const arrayBuffer = await files[i].arrayBuffer(); const pdf = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices()); copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
            const pdfBytes = await mergedPdf.save(); const blob = new Blob([pdfBytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'Merged.pdf'; a.click();
            document.getElementById('pdf-processing-text').innerText = "✅ Merged PDF Downloaded!";
            setTimeout(() => { document.getElementById('btn-do-merge').classList.remove('hidden'); document.getElementById('pdf-processing-text').classList.add('hidden'); document.getElementById('pdf-merge-status').classList.add('hidden'); }, 3000);
        } catch(e) { alert("Error merging PDFs."); }
    },

    handlePDFtoJPG: async function() {
        const file = document.getElementById('pdf-jpg-input').files[0]; if(!file) return;
        document.getElementById('pdf-jpg-upload').classList.add('hidden'); document.getElementById('pdf-jpg-status').classList.remove('hidden');
        const statusText = document.getElementById('pdf-jpg-text');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            for(let i=1; i<=pdf.numPages; i++){
                statusText.innerText = `Converting page ${i} of ${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({scale: 2.0});
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({canvasContext: ctx, viewport: viewport}).promise;
                const link = document.createElement('a'); link.download = `${file.name.replace('.pdf', '')}_Page_${i}.jpg`; link.href = canvas.toDataURL('image/jpeg', 0.9); link.click();
                await new Promise(r => setTimeout(r, 500)); // slight delay for multiple downloads
            }
            statusText.innerText = "✅ All pages downloaded as JPG!";
            setTimeout(() => { document.getElementById('pdf-jpg-upload').classList.remove('hidden'); document.getElementById('pdf-jpg-status').classList.add('hidden'); }, 3000);
        } catch(e) { alert("Error reading PDF."); }
    },

    handlePDFCompress: async function() {
        const file = document.getElementById('pdf-compress-input').files[0]; if(!file) return;
        document.getElementById('pdf-compress-upload').classList.add('hidden'); document.getElementById('pdf-compress-status').classList.remove('hidden');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            // Basic optimization: re-saving without unused objects
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Compressed_${file.name}`; a.click();
            document.getElementById('pdf-compress-text').innerText = "✅ PDF Compressed & Downloaded!";
            setTimeout(() => { document.getElementById('pdf-compress-upload').classList.remove('hidden'); document.getElementById('pdf-compress-status').classList.add('hidden'); }, 3000);
        } catch(e) { alert("Error compressing PDF."); }
    },

    // ============================================
    // 3. IMAGE TOOLS
    // ============================================
    handleImgCompressUI: function() {
        const file = document.getElementById('img-compress-input').files[0]; if(!file) return;
        document.getElementById('img-orig-size').innerText = `${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('img-compress-upload').classList.add('hidden'); document.getElementById('img-compress-workspace').classList.remove('hidden');
    },
    executeImgCompress: function() {
        const file = document.getElementById('img-compress-input').files[0]; const quality = parseFloat(document.getElementById('img-quality-selector').value);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg', quality); a.download = 'Compressed.jpg'; a.click();
                alert("Image compressed and downloaded!");
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    },

    handleImgConvert: function() {
        const file = document.getElementById('img-convert-input').files[0]; if(!file) return;
        document.getElementById('img-convert-upload').classList.add('hidden'); document.getElementById('img-convert-status').classList.remove('hidden');
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d'); ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0);
                const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg', 1.0); a.download = 'Converted.jpg'; a.click();
                document.querySelector('#img-convert-status p').innerText = "✅ Downloaded as JPG!";
                setTimeout(() => { document.getElementById('img-convert-upload').classList.remove('hidden'); document.getElementById('img-convert-status').classList.add('hidden'); document.querySelector('#img-convert-status p').innerText = "Converting to JPG..."; }, 3000);
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    },

    handleImgResizeUI: function() {
        const file = document.getElementById('img-resize-input').files[0]; if(!file) return;
        document.getElementById('img-resize-upload').classList.add('hidden'); document.getElementById('img-resize-workspace').classList.remove('hidden');
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => { document.getElementById('resize-w').value = img.width; document.getElementById('resize-h').value = img.height; };
            img.src = e.target.result;
        }; reader.readAsDataURL(file);
    },
    executeImgResize: function() {
        const file = document.getElementById('img-resize-input').files[0]; const targetW = parseInt(document.getElementById('resize-w').value); const targetH = parseInt(document.getElementById('resize-h').value);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = targetW; canvas.height = targetH;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, targetW, targetH);
                const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg', 0.9); a.download = 'Resized.jpg'; a.click();
                alert("Resized Image Downloaded!");
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    }
};

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('installAppBtn').style.display = 'block'; });
document.addEventListener('click', async (e) => { if(e.target.id === 'installAppBtn' && deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') e.target.style.display = 'none'; deferredPrompt = null; } });
