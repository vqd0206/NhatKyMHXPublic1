'use strict';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const formatDate = (value, long = false) => value ? new Intl.DateTimeFormat('vi-VN', long ? { day:'numeric', month:'long', year:'numeric' } : { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${value}T00:00:00`)) : '';
const relativeDate = value => new Intl.DateTimeFormat('vi-VN', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value));

let currentSlug = '';
let galleryItems = [];
let currentImage = 0;

function renderComments(comments) {
  const root = document.querySelector('#comments-list');
  if (!comments.length) { root.innerHTML = '<div class="comments-empty">Chưa có lời nhắn nào. Hãy để lại một chút yêu thương nhé!</div>'; return; }
  root.innerHTML = [...comments].reverse().map(comment => `<article class="comment"><div class="comment-head"><span class="comment-name">${comment.isAnonymous ? '♥ ' : ''}${escapeHtml(comment.displayName)}</span><time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(relativeDate(comment.createdAt))}</time></div><p>${escapeHtml(comment.content)}</p></article>`).join('');
}

function openLightbox(index) {
  currentImage = index;
  const dialog = document.querySelector('#lightbox');
  const item = galleryItems[currentImage];
  dialog.querySelector('img').src = item.url;
  dialog.querySelector('img').alt = item.alt || '';
  dialog.querySelector('figcaption').textContent = item.caption || item.alt || '';
  if (!dialog.open) dialog.showModal();
}

function bindLightbox() {
  const dialog = document.querySelector('#lightbox');
  document.querySelectorAll('.image-item').forEach(button => button.addEventListener('click', () => openLightbox(Number(button.dataset.imageIndex))));
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.lightbox-prev').addEventListener('click', () => openLightbox((currentImage - 1 + galleryItems.length) % galleryItems.length));
  dialog.querySelector('.lightbox-next').addEventListener('click', () => openLightbox((currentImage + 1) % galleryItems.length));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}

function bindCommentForm(comments) {
  const form = document.querySelector('#comment-form');
  const status = form.querySelector('.form-status');
  const nameInput = form.elements.displayName;
  form.elements.isAnonymous.addEventListener('change', event => { nameInput.disabled = event.target.checked; nameInput.placeholder = event.target.checked ? 'Bạn đang ẩn danh' : 'Tên của bạn'; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); status.className = 'form-status'; status.textContent = 'Đang gửi lời nhắn...';
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
      const response = await fetch(`/api/journals/${encodeURIComponent(currentSlug)}/comments`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ displayName:form.elements.displayName.value, isAnonymous:form.elements.isAnonymous.checked, content:form.elements.content.value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể gửi bình luận.');
      comments.push(result.comment); renderComments(comments); form.reset(); nameInput.disabled = false; status.textContent = 'Lời nhắn đã xuất hiện trên trang nhật ký ♥';
    } catch (error) { status.className = 'form-status error'; status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
}

async function loadJournal() {
  const root = document.querySelector('#journal-root');
  currentSlug = new URLSearchParams(location.search).get('slug') || '';
  if (!currentSlug) { root.innerHTML = '<div class="page-loading">Thiếu địa chỉ trang nhật ký. <a href="/">Quay lại trang chủ</a></div>'; return; }
  try {
    const response = await fetch(`/api/journals/${encodeURIComponent(currentSlug)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không tìm thấy nhật ký.');
    const fragment = document.querySelector('#journal-template').content.cloneNode(true);
    root.replaceChildren(fragment);
    const { journal, media, comments } = data;
    document.title = `${journal.title} | Nhật ký Mùa Hè Xanh`;
    root.querySelector('.entry-date').textContent = `${journal.location ? `${journal.location}, ` : ''}${formatDate(journal.writtenAt, true)}`;
    root.querySelector('.entry-title').textContent = `“${journal.title}”`;
    const contentRoot = root.querySelector('.entry-content');
    if (journal.contentFormat === 'html' && journal.contentHtml) contentRoot.innerHTML = journal.contentHtml;
    else contentRoot.textContent = journal.content;
    root.querySelector('.entry-source').textContent = journal.sourceCredit ? `Nguồn: ${journal.sourceCredit}` : '';
    root.querySelector('.entry-author').textContent = journal.authorName ? `— ${journal.authorName}` : '';
    root.querySelector('.closing-message').textContent = journal.closingMessage || '';
    galleryItems = media.filter(item => item.type === 'image');
    const gallery = root.querySelector('#gallery');
    let imageIndex = 0;
    gallery.innerHTML = media.length ? media.map((item, index) => {
      if (item.type === 'embed') return `<figure class="photo-item video-item embed-item"><iframe src="${escapeHtml(item.url)}" title="${escapeHtml(item.alt)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`;
      if (item.type === 'video') return `<figure class="photo-item video-item"><video src="${escapeHtml(item.url)}" controls preload="metadata" playsinline aria-label="${escapeHtml(item.alt)}"></video>${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`;
      return `<button class="photo-item image-item" data-image-index="${imageIndex++}" type="button" aria-label="Mở ảnh ${index + 1}"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" loading="lazy"></button>`;
    }).join('') : '<div class="photo-empty">Trang viết này chưa có ảnh hoặc video đính kèm.</div>';
    renderComments(comments);
    if (galleryItems.length) bindLightbox();
    bindCommentForm(comments);
  } catch (error) { root.innerHTML = `<div class="page-loading">${escapeHtml(error.message)}&nbsp; <a href="/">Quay lại trang chủ</a></div>`; }
}

loadJournal();
