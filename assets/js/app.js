'use strict';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${value}T00:00:00`)) : '';

async function loadJournals() {
  const root = document.querySelector('#journal-list');
  try {
    const response = await fetch('/api/journals');
    if (!response.ok) throw new Error('Không thể tải dữ liệu');
    const { journals } = await response.json();
    if (!journals.length) {
      root.innerHTML = '<div class="empty-state">Chưa có trang nhật ký nào. Hãy là người đầu tiên viết nên ký ức màu xanh!</div>';
      return;
    }
    root.innerHTML = journals.map((journal, index) => {
      const cover = journal.media?.[0];
      return `<a class="journal-card" href="/journal.html?slug=${encodeURIComponent(journal.slug)}">
        <div class="card-cover ${cover ? '' : 'no-image'}">${cover ? `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt)}">` : ''}<span class="card-number">TRANG ${String(index + 1).padStart(2, '0')}</span></div>
        <div class="card-body"><span class="card-meta">${escapeHtml(formatDate(journal.writtenAt))} · ${escapeHtml(journal.location || 'Mùa Hè Xanh')}</span><h3>${escapeHtml(journal.title)}</h3><p>${escapeHtml(journal.excerpt)}</p><span class="card-link">Đọc trang nhật ký →</span></div>
      </a>`;
    }).join('');
  } catch (error) {
    root.innerHTML = '<div class="empty-state">Không mở được kho ký ức. Hãy kiểm tra máy chủ và thử lại.</div>';
  }
}

async function loadCommunityGallery() {
  const root = document.querySelector('#community-gallery-list');
  if (!root) return;
  try {
    const response = await fetch('/api/gallery');
    const { media } = await response.json();
    if (!response.ok) throw new Error('Không thể tải thư viện');
    if (!media.length) {
      root.innerHTML = '<div class="empty-state">Thư viện chung chưa có khoảnh khắc nào. Bạn có thể thêm ảnh hoặc video trong trang viết nhật ký.</div>';
      return;
    }
    root.innerHTML = media.map(item => {
      if (item.type === 'embed') return `<figure class="community-item community-video"><iframe src="${escapeHtml(item.url)}" title="${escapeHtml(item.alt)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><figcaption>${escapeHtml(item.caption || 'Video kỷ niệm')}</figcaption></figure>`;
      if (item.type === 'video') return `<figure class="community-item community-video"><video src="${escapeHtml(item.url)}" controls preload="metadata" playsinline></video><figcaption>${escapeHtml(item.caption || 'Video kỷ niệm')}</figcaption></figure>`;
      return `<a class="community-item" href="${escapeHtml(item.url)}" target="_blank"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" loading="lazy"><span>${escapeHtml(item.caption || 'Ảnh kỷ niệm')}</span></a>`;
    }).join('');
  } catch {
    root.innerHTML = '<div class="empty-state">Chưa thể mở thư viện chung. Vui lòng thử lại sau.</div>';
  }
}

loadJournals();
loadCommunityGallery();
