document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;

    // --- LOGIKA UNTUK HALAMAN UPLOAD (index.html) ---
    if (path === '/' || path === '/index.html') {
        const fileInput = document.getElementById('file-input');
        const uploadBtn = document.getElementById('upload-btn');
        const navUploadBtn = document.getElementById('nav-upload-btn');
        const mainContent = document.getElementById('main-content');
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        const triggerUpload = () => fileInput.click();
        if (uploadBtn) uploadBtn.addEventListener('click', triggerUpload);
        if (navUploadBtn) navUploadBtn.addEventListener('click', triggerUpload);

        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (file.size > 500 * 1024 * 1024) {
                    alert('File is too large! Max 500MB.');
                    fileInput.value = '';
                    return;
                }

                // Ganti UI ke progress loading
                mainContent.classList.add('hidden');
                progressContainer.classList.remove('hidden');

                try {
                    const safeFileType = file.type || "application/octet-stream";
                    const res = await fetch(`/api/get-upload-url?type=${encodeURIComponent(safeFileType)}&size=${file.size}`);
                    const data = await res.json();
                    
                    if (!data.success) throw new Error(data.message);

                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', data.uploadUrl, true);
                    xhr.setRequestHeader('Content-Type', safeFileType);

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            progressBar.style.width = percent + '%';
                            progressText.innerText = percent + '%';
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            window.location.href = '/v?id=' + data.videoId;
                        } else {
                            throw new Error('Upload failed');
                        }
                    };

                    xhr.onerror = () => { throw new Error('Network error. Upload failed.'); };
                    xhr.send(file);

                } catch (err) {
                    alert(err.message);
                    mainContent.classList.remove('hidden');
                    progressContainer.classList.add('hidden');
                    fileInput.value = '';
                }
            });
        }
    }

    // --- LOGIKA UNTUK HALAMAN PEMUTAR (v.html) ---
    if (path === '/v' || path === '/v.html') {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const mediaWrapper = document.getElementById('media-wrapper');
        const shareBtn = document.getElementById('share-btn');
        const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share w-[18px] h-[18px]"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" x2="12" y1="2" y2="15"></line></svg>`;
        
        if (!id) {
            if(mediaWrapper) mediaWrapper.innerHTML = `<div class="text-center py-20 text-gray-500">Invalid ID.</div>`;
            return;
        }

        if (mediaWrapper) {
            fetch(`/api/get-video-url?id=${id}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) throw new Error("Media not found");

                const { playUrl, contentType } = data;
                if (contentType.startsWith('image/')) {
                    mediaWrapper.innerHTML = `<img src="${playUrl}" alt="Media" class="w-full md:rounded-[8px]" style="max-height: 520px; object-fit: contain; background: #000;">`;
                } else if (contentType.startsWith('video/')) {
                    mediaWrapper.innerHTML = `<video class="w-full md:rounded-[8px]" controls autoplay playsinline src="${playUrl}" style="max-height: 520px; background: #000;"></video>`;
                } else {
                    mediaWrapper.innerHTML = `<audio class="w-full md:rounded-[8px] bg-gray-100 p-4 border border-gray-200" controls src="${playUrl}"></audio>`;
                }
            })
            .catch(() => {
                mediaWrapper.innerHTML = `<div class="text-center py-24 text-gray-800 font-semibold">Media not found or has been deleted.</div>`;
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                if (navigator.share) {
                    navigator.share({ title: `Pokoco Media`, url: window.location.href });
                } else {
                    navigator.clipboard.writeText(window.location.href);
                    shareBtn.innerHTML = `Copied!`;
                    setTimeout(() => { shareBtn.innerHTML = `${shareIcon} Share link`; }, 2000);
                }
            });
        }
    }
});
