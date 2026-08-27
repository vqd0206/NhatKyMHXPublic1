'use strict';

(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'video-modal';
  dialog.setAttribute('aria-label', 'Trình xem ảnh và video');
  dialog.innerHTML = '<div class="video-modal-panel"><button class="video-modal-close" type="button" aria-label="Đóng trình xem">×</button><div class="video-modal-frame"></div><p class="video-modal-caption"></p></div>';
  document.body.append(dialog);

  const frameRoot = dialog.querySelector('.video-modal-frame');
  const caption = dialog.querySelector('.video-modal-caption');
  const close = () => { if (dialog.open) dialog.close(); frameRoot.replaceChildren(); };
  const open = button => {
    const url = button.dataset.mediaUrl || button.dataset.videoUrl;
    const type = button.dataset.mediaType || 'embed';
    let media;
    if (type === 'image') {
      media = document.createElement('img');
      media.alt = button.dataset.mediaTitle || 'Ảnh kỷ niệm';
    } else if (type === 'video') {
      media = document.createElement('video');
      media.controls = true; media.autoplay = true; media.playsInline = true;
    } else {
      media = document.createElement('iframe');
      media.title = button.dataset.mediaTitle || button.dataset.videoTitle || 'Video kỷ niệm';
      media.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      media.allowFullscreen = true;
    }
    media.src = url;
    frameRoot.classList.toggle('is-image', type === 'image');
    frameRoot.replaceChildren(media);
    caption.textContent = button.dataset.mediaCaption || button.dataset.videoCaption || '';
    dialog.showModal();
  };

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-video-url], [data-media-url]');
    if (trigger) open(trigger);
  });
  dialog.querySelector('.video-modal-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => frameRoot.replaceChildren());
})();
