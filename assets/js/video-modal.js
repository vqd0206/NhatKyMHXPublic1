'use strict';

(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'video-modal';
  dialog.setAttribute('aria-label', 'Trình xem video');
  dialog.innerHTML = '<div class="video-modal-panel"><button class="video-modal-close" type="button" aria-label="Đóng video">×</button><div class="video-modal-frame"></div><p class="video-modal-caption"></p></div>';
  document.body.append(dialog);

  const frameRoot = dialog.querySelector('.video-modal-frame');
  const caption = dialog.querySelector('.video-modal-caption');
  const close = () => { if (dialog.open) dialog.close(); frameRoot.replaceChildren(); };
  const open = button => {
    const iframe = document.createElement('iframe');
    iframe.src = button.dataset.videoUrl;
    iframe.title = button.dataset.videoTitle || 'Video kỷ niệm';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frameRoot.replaceChildren(iframe);
    caption.textContent = button.dataset.videoCaption || '';
    dialog.showModal();
  };

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-video-url]');
    if (trigger) open(trigger);
  });
  dialog.querySelector('.video-modal-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => frameRoot.replaceChildren());
})();
