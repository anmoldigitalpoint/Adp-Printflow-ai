document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('./service-worker.js'); } 
        catch (e) { console.error('PWA SW Failed', e); }
    }
    
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); deferredPrompt = e;
        if (installBtn) installBtn.classList.remove('hidden');
    });
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.classList.add('hidden');
        });
    }
});
