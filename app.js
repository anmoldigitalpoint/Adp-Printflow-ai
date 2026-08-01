// Constants
const PASSPORT_WIDTH = 35;
const PASSPORT_HEIGHT = 45;
const CARD_WIDTH = 85.6;
const CARD_HEIGHT = 54.0;
const A4_WIDTH = 210;
const A4_HEIGHT = 297;

const app = {
    // === Navigation System ===
    navigate: function(viewId) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(`view-${viewId}`).classList.add('active');
        window.scrollTo(0, 0);
    },

    processWorkflow: function(toolName) {
        if(toolName === 'passport') this.handlePassport();
    },

    // ================= TOOL 1: PASSPORT LOGIC (Browser AI) =================
    passportImageData: null,

    handlePassport: async function() {
        const fileInput = document.getElementById('passport-input');
        const file = fileInput.files[0];
        if (!file) return;

        document.getElementById('passport-upload').classList.add('hidden');
        document.getElementById('passport-workspace').classList.remove('hidden');
        const steps = document.getElementById('passport-steps').children;
        const preview = document.getElementById('passport-preview');

        try {
            steps[0].style.color = 'var(--neon-blue)';
            steps[0].innerText = '⏳ Initializing Free AI Model (Please wait...)';

            // JUGAD: Browser AI se background hatana (100% Free & Unlimited)
            const transparentBlob = await imglyRemoveBackground(file);
            
            steps[0].innerText = '✅ AI Background Removed Locally!';
            steps[1].style.color = 'var(--neon-blue)';
            steps[1].innerText = '⏳ Applying Blue Background & Cropping...';

            const url = URL.createObjectURL(transparentBlob);
            const img = new Image();
            
            img.onload = () => {
                this.cropAndBlueBackground(img); 
                
                steps[1].innerText = '✅ Blue Background Applied!';
                steps[2].style.color = 'var(--neon-blue)';
                steps[2].innerText = '✅ Ready for Print!';
                
                setTimeout(() => {
                    document.getElementById('passport-steps').classList.add('hidden');
                    preview.classList.remove('hidden');
                }, 500);
            };
            img.src = url;

        } catch (error) {
            steps[0].style.color = 'red';
            steps[0].innerText = '❌ Error: Browser AI failed. Please try again.';
            console.error("AI Error: ", error);
        }
    },

    cropAndBlueBackground: function(transparentImg) {
        const canvas = document.getElementById('passport-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 350;
        canvas.height = 450;

        ctx.fillStyle = '#0055ff'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const targetRatio = PASSPORT_WIDTH / PASSPORT_HEIGHT;
        const imgRatio = transparentImg.width / transparentImg.height;
        
        let cropW, cropH, cropX, cropY;
        if (imgRatio > targetRatio) {
            cropH = transparentImg.height;
            cropW = transparentImg.height * targetRatio;
            cropX = (transparentImg.width - cropW) / 2;
            cropY = 0;
        } else {
            cropW = transparentImg.width;
            cropH = transparentImg.width / targetRatio;
            cropX = 0;
            cropY = (transparentImg.height - cropH) / 4;
        }

        ctx.drawImage(transparentImg, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        this.passportImageData = canvas.toDataURL('image/jpeg', 1.0);
    },

    generatePassportDoc: function() {
        if (!this.passportImageData) return null;
        const copies = parseInt(document.getElementById('passport-copies').value);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const startX = 15, startY = 15, gap = 5;
        let cX = startX, cY = startY, count = 0;

        for (let i = 0; i < copies; i++) {
            doc.addImage(this.passportImageData, 'JPEG', cX, cY, PASSPORT_WIDTH, PASSPORT_HEIGHT);
            count++;
            cX += PASSPORT_WIDTH + gap;
            if (count >= 5) {
                count = 0; cX = startX; cY += PASSPORT_HEIGHT + gap;
            }
        }
        return doc;
    },

    downloadPassportPDF: function() {
        const doc = this.generatePassportDoc();
        if(doc) doc.save('Passport_Photos.pdf');
    },

    printPassport: function() {
        const doc = this.generatePassportDoc();
        if(doc) {
            const blob = doc.output('bloburl');
            printJS({ printable: blob, type: 'pdf', showModal: true });
        }
    },


    // ================= TOOL 2: SMART CARD LOGIC =================
    smartCardFrontData: null,
    smartCardBackData: null,

    loadSmartCard: function(side) {
        const file = document.getElementById(`smartcard-${side}`).files[0];
        if (!file) return;

        document.getElementById(`${side}-status`).innerText = "✅ Uploaded";
        document.getElementById(`${side}-status`).style.color = "var(--neon-blue)";

        const reader = new FileReader();
        reader.onload = (e) => {
            if (side === 'front') this.smartCardFrontData = e.target.result;
            if (side === 'back') this.smartCardBackData = e.target.result;

            if (this.smartCardFrontData && this.smartCardBackData) {
                this.processSmartCardWorkflow();
            }
        };
        reader.readAsDataURL(file);
    },

    processSmartCardWorkflow: function() {
        document.getElementById('smartcard-upload-area').style.display = 'none';
        document.getElementById('smartcard-workspace').classList.remove('hidden');
        const steps = document.getElementById('smartcard-steps').children;
        const preview = document.getElementById('smartcard-preview');

        let delay = 0;
        Array.from(steps).forEach((step, index) => {
            setTimeout(() => {
                step.style.color = 'var(--neon-blue)';
                step.innerText = '✅ ' + step.innerText.replace('...', '');
                if (index === steps.length - 1) {
                    setTimeout(() => {
                        document.getElementById('smartcard-steps').classList.add('hidden');
                        preview.classList.remove('hidden');
                        this.drawSmartCardCanvas();
                    }, 500);
                }
            }, delay += 1000);
        });
    },

    drawSmartCardCanvas: function() {
        const canvas = document.getElementById('smartcard-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600; canvas.height = 800;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const imgF = new Image(), imgB = new Image();
        imgF.onload = () => {
            ctx.lineWidth = 2; ctx.strokeStyle = '#000';
            ctx.drawImage(imgF, 50, 50, 500, 315);
            ctx.strokeRect(50, 50, 500, 315);
            imgB.onload = () => {
                ctx.drawImage(imgB, 50, 400, 500, 315);
                ctx.strokeRect(50, 400, 500, 315);
            };
            imgB.src = this.smartCardBackData;
        };
        imgF.src = this.smartCardFrontData;
    },

    generateSmartCardDoc: function() {
        if (!this.smartCardFrontData || !this.smartCardBackData) return null;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const sX = (210 - CARD_WIDTH) / 2;
        const sYF = 20;
        const sYB = sYF + CARD_HEIGHT + 10;

        doc.addImage(this.smartCardFrontData, 'JPEG', sX, sYF, CARD_WIDTH, CARD_HEIGHT);
        doc.setDrawColor(0); doc.setLineWidth(0.5); doc.rect(sX, sYF, CARD_WIDTH, CARD_HEIGHT);

        doc.addImage(this.smartCardBackData, 'JPEG', sX, sYB, CARD_WIDTH, CARD_HEIGHT);
        doc.rect(sX, sYB, CARD_WIDTH, CARD_HEIGHT);

        return doc;
    },

    downloadSmartCardPDF: function() {
        const doc = this.generateSmartCardDoc();
        if(doc) doc.save('SmartCard_A4.pdf');
    },

    printSmartCard: function() {
        const doc = this.generateSmartCardDoc();
        if(doc) {
            const blob = doc.output('bloburl');
            printJS({ printable: blob, type: 'pdf', showModal: true });
        }
    },

    // ================= TOOL 3: ADVANCED DOCUMENT STUDIO (Manual Crop + OpenCV) =================
    documentImageData: null,

    handleDocumentUpload: function() {
        const file = document.getElementById('document-input').files[0];
        if (!file) return;

        if (typeof cv === 'undefined') {
            alert("OpenCV is still loading, please wait a few seconds and try again.");
            return;
        }

        document.getElementById('document-upload').classList.add('hidden');
        document.getElementById('document-crop-area').classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (e) => {
            const imgEl = document.getElementById('doc-source-image');
            imgEl.onload = () => {
                this.setupDraggablePoints();
            };
            imgEl.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    setupDraggablePoints: function() {
        const points = ['pt-tl', 'pt-tr', 'pt-bl', 'pt-br'];
        const container = document.getElementById('crop-container');

        points.forEach(id => {
            const el = document.getElementById(id);
            let isDragging = false;

            el.addEventListener('mousedown', () => isDragging = true);
            window.addEventListener('mouseup', () => isDragging = false);
            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const rect = container.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;
                
                x = Math.max(0, Math.min(x, rect.width));
                y = Math.max(0, Math.min(y, rect.height));
                
                el.style.left = (x / rect.width * 100) + '%';
                el.style.top = (y / rect.height * 100) + '%';
            });

            el.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); }, {passive: false});
            window.addEventListener('touchend', () => isDragging = false);
            window.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                const rect = container.getBoundingClientRect();
                let x = e.touches[0].clientX - rect.left;
                let y = e.touches[0].clientY - rect.top;
                
                x = Math.max(0, Math.min(x, rect.width));
                y = Math.max(0, Math.min(y, rect.height));
                
                el.style.left = (x / rect.width * 100) + '%';
                el.style.top = (y / rect.height * 100) + '%';
            }, {passive: false});
        });
    },

    applySmartCrop: function() {
        document.getElementById('document-crop-area').classList.add('hidden');
        document.getElementById('document-workspace').classList.remove('hidden');

        const imgEl = document.getElementById('doc-source-image');
        
        const getPoint = (id) => {
            const el = document.getElementById(id);
            return {
                x: (parseFloat(el.style.left) / 100) * imgEl.naturalWidth,
                y: (parseFloat(el.style.top) / 100) * imgEl.naturalHeight
            };
        };

        const tl = getPoint('pt-tl');
        const tr = getPoint('pt-tr');
        const bl = getPoint('pt-bl');
        const br = getPoint('pt-br');

        let src = cv.imread(imgEl);
        
        // A4 Ratio for output
        const outputWidth = 1240; 
        const outputHeight = 1754; 

        let dst = new cv.Mat();
        let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
        let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight]);
        
        let M = cv.getPerspectiveTransform(srcCoords, dstCoords);
        cv.warpPerspective(src, dst, M, new cv.Size(outputWidth, outputHeight));

        dst.convertTo(dst, -1, 1.2, 20); // Brightness & contrast

        cv.imshow('document-canvas', dst);
        
        src.delete(); dst.delete(); M.delete(); srcCoords.delete(); dstCoords.delete();

        const canvas = document.getElementById('document-canvas');
        this.documentImageData = canvas.toDataURL('image/jpeg', 0.9);
    },

    generateDocumentDoc: function() {
        if (!this.documentImageData) return null;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        doc.addImage(this.documentImageData, 'JPEG', 0, 0, A4_WIDTH, A4_HEIGHT);
        return doc;
    },

    downloadDocumentPDF: function() {
        const doc = this.generateDocumentDoc();
        if(doc) doc.save('Straightened_Document.pdf');
    },

    printDocument: function() {
        const doc = this.generateDocumentDoc();
        if(doc) {
            const blob = doc.output('bloburl');
            printJS({ printable: blob, type: 'pdf', showModal: true });
        }
    }
};

// --- PWA Setup ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if(btn) btn.style.display = 'block';
});

document.addEventListener('click', async (e) => {
    if(e.target.id === 'installAppBtn' && deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') e.target.style.display = 'none';
        deferredPrompt = null;
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.log('SW Error', err));
    });
}
