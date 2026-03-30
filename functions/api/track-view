function trackView() {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('id');
    const alreadyViewed = sessionStorage.getItem(`viewed_${videoId}`);

    if (videoId && !alreadyViewed) {
        // Tunggu 8 detik baru kirim request view ke server
        setTimeout(() => {
            fetch('/api/track-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: videoId }),
                keepalive: true // Agar tetap terkirim meskipun tab ditutup mendadak
            }).then(() => {
                sessionStorage.setItem(`viewed_${videoId}`, 'true');
            }).catch(() => {});
        }, 8000); // 8000 ms = 8 detik
    }
}
trackView();
