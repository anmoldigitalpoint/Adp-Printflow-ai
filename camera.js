/* Simple camera-capture modal. Usage: PFCamera.open(onCapture) */
const PFCamera = (() => {
  let stream = null;

  function open(onCapture) {
    const modal = document.createElement('div');
    modal.className = 'cam-modal';
    modal.innerHTML = `
      <div class="cam-box glass">
        <div class="panel-title">Camera</div>
        <video id="pf-cam-video" autoplay playsinline></video>
        <div class="cam-actions">
          <button class="btn btn-ghost btn-block" id="pf-cam-cancel">Cancel</button>
          <button class="btn btn-primary btn-block" id="pf-cam-shot">Capture</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const video = modal.querySelector('#pf-cam-video');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 960 } })
      .then(s => { stream = s; video.srcObject = s; })
      .catch(() => {
        alert('Camera access denied ya available nahi hai. Photo upload use karein.');
        close();
      });

    function close() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      modal.remove();
    }

    modal.querySelector('#pf-cam-cancel').onclick = close;
    modal.querySelector('#pf-cam-shot').onclick = () => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(blob => {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        onCapture(file);
        close();
      }, 'image/jpeg', 0.95);
    };
  }

  return { open };
})();
