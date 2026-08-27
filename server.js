'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'images', 'uploads');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MHX2025@Admin';
const MAX_BODY = 220 * 1024 * 1024;
const adminSessions = new Map();
const JSON_FILES = {
  campaigns: path.join(DATA_DIR, 'campaigns.json'),
  journals: path.join(DATA_DIR, 'journals.json'),
  media: path.join(DATA_DIR, 'media.json'),
  comments: path.join(DATA_DIR, 'comments.json'),
  settings: path.join(DATA_DIR, 'settings.json')
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf', '.ico': 'image/x-icon'
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2));
}

function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  const expires = token && adminSessions.get(token);
  if (!expires || expires < Date.now()) { if (token) adminSessions.delete(token); return false; }
  return true;
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  send(res, 401, { error: 'Vui lòng đăng nhập quản trị.' });
  return false;
}

function secureEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left)).digest();
  const b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function readStore(name) {
  return JSON.parse(await fsp.readFile(JSON_FILES[name], 'utf8'));
}

async function writeStore(name, value) {
  const target = JSON_FILES[name];
  const temp = `${target}.${process.pid}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, target);
}

function cleanText(value, max = 5000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function sanitizeRichHtml(value, max = 50000) {
  let html = String(value || '').slice(0, max)
    .replace(/&lt;|&#0*60;|&#x0*3c;/gi, '<')
    .replace(/&gt;|&#0*62;|&#x0*3e;/gi, '>');
  html = html.replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s(href|src)\s*=\s*(["'])\s*(javascript:|data:text\/html)[\s\S]*?\2/gi, '');
  return html;
}

function looksLikeDomDump(value) {
  const text = String(value || '');
  return (text.match(/\b(?:div|span)\s+(?:id|class|data-|role)=/gi) || []).length >= 3
    || /data-observe-id|ResponsesView|aria-disabled=/.test(text);
}

function slugify(value) {
  return cleanText(value, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn.'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON không hợp lệ.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function normalizeEmbedUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
      else if (/^\/(shorts|embed)\//.test(parsed.pathname)) videoId = parsed.pathname.split('/')[2] || '';
    }
    if (/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}` };
    }
    if (host === 'drive.google.com') {
      const match = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const fileId = match?.[1] || parsed.searchParams.get('id') || '';
      if (/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
        return { provider: 'google-drive', embedUrl: `https://drive.google.com/file/d/${fileId}/preview` };
      }
    }
  } catch {}
  return null;
}

async function saveMedia(files, links, journalId, scope = 'journal') {
  const mediaStore = await readStore('media');
  const allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  const inputFiles = (Array.isArray(files) ? files : []).slice(0, 20);
  const uniqueLinks = [...new Set((Array.isArray(links) ? links : []).map(link => String(link).trim()).filter(Boolean))];
  if (inputFiles.length + uniqueLinks.length > 20) throw Object.assign(new Error('Mỗi thư viện chỉ được thêm tối đa 20 mục một lần.'), { status: 400 });
  const validatedFiles = inputFiles.map((file, index) => {
    const match = String(file.dataUrl || '').match(/^data:((?:image\/(?:jpeg|png|webp))|(?:video\/(?:mp4|webm)));base64,(.+)$/);
    if (!match || !allowed[match[1]]) throw Object.assign(new Error(`Tệp đính kèm số ${index + 1} không đúng định dạng.`), { status: 400 });
    const buffer = Buffer.from(match[2], 'base64');
    const isVideo = match[1].startsWith('video/');
    if (!buffer.length || buffer.length > (isVideo ? 20 : 8) * 1024 * 1024) throw Object.assign(new Error(`${isVideo ? 'Video' : 'Ảnh'} số ${index + 1} vượt quá dung lượng cho phép.`), { status: 400 });
    return { file, buffer, isVideo, mime: match[1] };
  });
  const normalizedLinks = uniqueLinks.map((link, index) => {
    const normalized = normalizeEmbedUrl(link);
    if (!normalized) throw Object.assign(new Error(`Liên kết video số ${index + 1} không phải YouTube hoặc Google Drive hợp lệ.`), { status: 400 });
    return normalized;
  });
  const saved = [];
  for (const [index, validated] of validatedFiles.entries()) {
    const { file, buffer, isVideo, mime } = validated;
    const id = crypto.randomUUID();
    const filename = `${id}.${allowed[mime]}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    const item = {
      id, journalId, scope, type: isVideo ? 'video' : 'image', url: `/assets/images/uploads/${filename}`,
      alt: cleanText(file.alt || `${isVideo ? 'Video' : 'Ảnh'} kỷ niệm ${index + 1}`, 180),
      caption: cleanText(file.caption, 300), sortOrder: index,
      createdAt: new Date().toISOString()
    };
    mediaStore.media.push(item);
    saved.push(item);
  }
  for (const [offset, normalized] of normalizedLinks.entries()) {
    const item = {
      id: crypto.randomUUID(), journalId, scope, type: 'embed', provider: normalized.provider,
      url: normalized.embedUrl,
      alt: normalized.provider === 'youtube' ? 'Video YouTube' : 'Video Google Drive',
      caption: normalized.provider === 'youtube' ? 'Video từ YouTube' : 'Video từ Google Drive',
      sortOrder: saved.length + offset, createdAt: new Date().toISOString()
    };
    mediaStore.media.push(item);
    saved.push(item);
  }
  await writeStore('media', mediaStore);
  return saved;
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const settings = await readStore('settings');
    return send(res, 200, { printEditionUrl: settings.printEditionUrl || '' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const body = await collectBody(req);
    if (!secureEqual(body.password || '', ADMIN_PASSWORD)) return send(res, 401, { error: 'Mật khẩu không đúng.' });
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
    const token = parseCookies(req).admin_session;
    if (token) adminSessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
    if (!requireAdmin(req, res)) return;
    const [journals, comments, media, settings] = await Promise.all([readStore('journals'), readStore('comments'), readStore('media'), readStore('settings')]);
    return send(res, 200, { journals: journals.journals, comments: comments.comments, media: media.media, settings });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/admin/settings') {
    if (!requireAdmin(req, res)) return;
    const body = await collectBody(req);
    let parsed;
    try { parsed = new URL(String(body.printEditionUrl || '').trim()); } catch { return send(res, 400, { error: 'Link bản in không hợp lệ.' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return send(res, 400, { error: 'Link bản in phải dùng http hoặc https.' });
    const settings = { printEditionUrl: parsed.href, updatedAt: new Date().toISOString() };
    await writeStore('settings', settings);
    return send(res, 200, { settings });
  }

  const adminJournalMatch = url.pathname.match(/^\/api\/admin\/journals\/([^/]+)$/);
  if (req.method === 'PATCH' && adminJournalMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await collectBody(req);
    const store = await readStore('journals');
    const journal = store.journals.find(item => item.id === adminJournalMatch[1]);
    if (!journal) return send(res, 404, { error: 'Không tìm thấy nhật ký.' });
    if (['published', 'hidden'].includes(body.status)) journal.status = body.status;
    if (typeof body.allowComments === 'boolean') journal.allowComments = body.allowComments;
    journal.updatedAt = new Date().toISOString();
    await writeStore('journals', store);
    return send(res, 200, { journal });
  }

  const editLinkMatch = url.pathname.match(/^\/api\/admin\/journals\/([^/]+)\/edit-link$/);
  if (req.method === 'POST' && editLinkMatch) {
    if (!requireAdmin(req, res)) return;
    const store = await readStore('journals');
    const journal = store.journals.find(item => item.id === editLinkMatch[1]);
    if (!journal) return send(res, 404, { error: 'Không tìm thấy nhật ký.' });
    const token = crypto.randomBytes(32).toString('base64url');
    journal.editTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    journal.editTokenCreatedAt = new Date().toISOString();
    await writeStore('journals', store);
    return send(res, 200, { editUrl: `/write.html?edit=${encodeURIComponent(token)}` });
  }

  const adminCommentMatch = url.pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
  if (req.method === 'PATCH' && adminCommentMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await collectBody(req);
    const store = await readStore('comments');
    const comment = store.comments.find(item => item.id === adminCommentMatch[1]);
    if (!comment) return send(res, 404, { error: 'Không tìm thấy bình luận.' });
    if (['approved', 'hidden'].includes(body.status)) comment.status = body.status;
    await writeStore('comments', store);
    return send(res, 200, { comment });
  }

  const adminMediaMatch = url.pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
  if (req.method === 'PATCH' && adminMediaMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await collectBody(req);
    const store = await readStore('media');
    const media = store.media.find(item => item.id === adminMediaMatch[1] && item.scope === 'global');
    if (!media) return send(res, 404, { error: 'Không tìm thấy mục thư viện.' });
    media.caption = cleanText(body.caption, 300);
    media.alt = cleanText(body.alt || media.alt, 180);
    await writeStore('media', store);
    return send(res, 200, { media });
  }

  if (req.method === 'DELETE' && adminMediaMatch) {
    if (!requireAdmin(req, res)) return;
    const store = await readStore('media');
    const index = store.media.findIndex(item => item.id === adminMediaMatch[1] && item.scope === 'global');
    if (index < 0) return send(res, 404, { error: 'Không tìm thấy mục thư viện.' });
    const [removed] = store.media.splice(index, 1);
    await writeStore('media', store);
    if (removed.url?.startsWith('/assets/images/uploads/')) await fsp.unlink(path.join(UPLOAD_DIR, path.basename(removed.url))).catch(() => {});
    return send(res, 200, { removed: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/gallery') {
    if (!requireAdmin(req, res)) return;
    const body = await collectBody(req);
    const media = await saveMedia(body.media, body.mediaLinks, null, 'global');
    if (!media.length) return send(res, 400, { error: 'Không có ảnh, video hoặc liên kết hợp lệ.' });
    return send(res, 201, { media });
  }

  if (req.method === 'GET' && url.pathname === '/api/gallery') {
    const media = await readStore('media');
    return send(res, 200, {
      media: media.media.filter(item => item.scope === 'global').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/journals') {
    const [journals, media] = await Promise.all([readStore('journals'), readStore('media')]);
    const result = journals.journals.filter(j => j.status === 'published').map(j => ({
      ...j, media: media.media.filter(m => m.journalId === j.id)
    }));
    return send(res, 200, { journals: result });
  }

  const publicEditMatch = url.pathname.match(/^\/api\/edit\/([^/]+)$/);
  if (publicEditMatch && ['GET', 'PUT'].includes(req.method)) {
    const rawToken = decodeURIComponent(publicEditMatch[1]);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const store = await readStore('journals');
    const journal = store.journals.find(item => item.editTokenHash === tokenHash);
    if (!journal) return send(res, 404, { error: 'Link chỉnh sửa không hợp lệ hoặc đã được thay thế.' });
    if (req.method === 'GET') {
      const media = await readStore('media');
      return send(res, 200, { journal, media: media.media.filter(item => item.journalId === journal.id) });
    }
    const body = await collectBody(req);
    const title = cleanText(body.title, 180);
    const contentHtml = sanitizeRichHtml(body.contentHtml, 50000);
    const contentText = cleanText(contentHtml.replace(/<[^>]+>/g, ' '), 12000);
    if (!title || !contentText) return send(res, 400, { error: 'Vui lòng nhập tiêu đề và nội dung.' });
    if (looksLikeDomDump(contentText)) return send(res, 400, { error: 'Nội dung đang chứa mã của cả trang web. Vui lòng chỉ sao chép phần câu trả lời cần đăng.' });
    const mediaStore = await readStore('media');
    const removeIds = new Set(Array.isArray(body.removeMediaIds) ? body.removeMediaIds.map(String) : []);
    const ownedMedia = mediaStore.media.filter(item => item.journalId === journal.id);
    const remainingMedia = ownedMedia.filter(item => !removeIds.has(item.id));
    const incomingCount = (Array.isArray(body.media) ? body.media.length : 0) + (Array.isArray(body.mediaLinks) ? body.mediaLinks.length : 0);
    if (remainingMedia.length + incomingCount > 20) return send(res, 400, { error: 'Một trang nhật ký chỉ được có tối đa 20 ảnh/video.' });
    const removedMedia = ownedMedia.filter(item => removeIds.has(item.id));
    mediaStore.media = mediaStore.media.filter(item => !(item.journalId === journal.id && removeIds.has(item.id)));
    await writeStore('media', mediaStore);
    for (const removed of removedMedia) {
      if (removed.url?.startsWith('/assets/images/uploads/')) await fsp.unlink(path.join(UPLOAD_DIR, path.basename(removed.url))).catch(() => {});
    }
    Object.assign(journal, {
      title, excerpt: cleanText(body.excerpt || contentText, 220), content: contentText,
      contentHtml, contentFormat: 'html', authorName: cleanText(body.authorName, 100) || journal.authorName,
      writtenAt: body.writtenAt || journal.writtenAt, eventDate: body.eventDate || null,
      location: cleanText(body.location, 180), sourceCredit: cleanText(body.sourceCredit, 300),
      closingMessage: cleanText(body.closingMessage, 300), updatedAt: new Date().toISOString()
    });
    await writeStore('journals', store);
    const newMedia = await saveMedia(body.media, body.mediaLinks, journal.id, 'journal');
    return send(res, 200, { journal, media: newMedia });
  }

  const journalMatch = url.pathname.match(/^\/api\/journals\/([^/]+)$/);
  if (req.method === 'GET' && journalMatch) {
    const slug = decodeURIComponent(journalMatch[1]);
    const [journals, media, comments] = await Promise.all([
      readStore('journals'), readStore('media'), readStore('comments')
    ]);
    const journal = journals.journals.find(j => j.slug === slug && j.status === 'published');
    if (!journal) return send(res, 404, { error: 'Không tìm thấy trang nhật ký.' });
    return send(res, 200, {
      journal,
      media: media.media.filter(m => m.journalId === journal.id).sort((a, b) => a.sortOrder - b.sortOrder),
      comments: comments.comments.filter(c => c.journalId === journal.id && c.status === 'approved')
    });
  }

  const commentMatch = url.pathname.match(/^\/api\/journals\/([^/]+)\/comments$/);
  if (req.method === 'POST' && commentMatch) {
    const body = await collectBody(req);
    const journals = await readStore('journals');
    const journal = journals.journals.find(j => j.slug === decodeURIComponent(commentMatch[1]) && j.status === 'published');
    if (!journal || !journal.allowComments) return send(res, 404, { error: 'Nhật ký không nhận bình luận.' });
    const content = cleanText(body.content, 1200);
    if (content.length < 2) return send(res, 400, { error: 'Bình luận cần ít nhất 2 ký tự.' });
    const isAnonymous = Boolean(body.isAnonymous);
    const item = {
      id: crypto.randomUUID(), journalId: journal.id, parentId: body.parentId || null,
      displayName: isAnonymous ? 'Một người bạn áo xanh' : cleanText(body.displayName, 80) || 'Khách',
      isAnonymous, content, status: 'approved', createdAt: new Date().toISOString(), reactions: 0
    };
    const store = await readStore('comments');
    store.comments.push(item);
    await writeStore('comments', store);
    return send(res, 201, { comment: item });
  }

  if (req.method === 'POST' && url.pathname === '/api/journals') {
    const body = await collectBody(req);
    const title = cleanText(body.title, 180);
    const contentHtml = sanitizeRichHtml(body.contentHtml, 50000);
    const contentText = cleanText(contentHtml.replace(/<[^>]+>/g, ' '), 12000);
    if (!title || !contentText) return send(res, 400, { error: 'Vui lòng nhập tiêu đề và nội dung.' });
    if (looksLikeDomDump(contentText)) return send(res, 400, { error: 'Nội dung đang chứa mã của cả trang web. Vui lòng chỉ sao chép phần câu trả lời cần đăng.' });
    const store = await readStore('journals');
    const baseSlug = slugify(body.slug || title) || `nhat-ky-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (store.journals.some(j => j.slug === slug)) slug = `${baseSlug}-${suffix++}`;
    const item = {
      id: crypto.randomUUID(), campaignId: 'mhx-2025', title, slug,
      excerpt: cleanText(body.excerpt || contentText, 220), content: contentText,
      contentHtml, contentFormat: 'html',
      authorName: cleanText(body.authorName, 100) || 'Chiến sĩ tình nguyện',
      writtenAt: body.writtenAt || new Date().toISOString().slice(0, 10),
      eventDate: body.eventDate || null, location: cleanText(body.location, 180),
      sourceCredit: cleanText(body.sourceCredit, 300),
      closingMessage: cleanText(body.closingMessage, 300) || 'Một mùa hè - Một hành trình. Một thanh xuân - Một kỷ niệm đẹp!',
      allowComments: true, allowAnonymousComments: true, status: 'published',
      createdAt: new Date().toISOString()
    };
    store.journals.unshift(item);
    await writeStore('journals', store);
    try {
      const media = await saveMedia(body.media, body.mediaLinks, item.id, 'journal');
      return send(res, 201, { journal: item, media });
    } catch (error) {
      store.journals = store.journals.filter(journal => journal.id !== item.id);
      await writeStore('journals', store);
      throw error;
    }
  }

  return send(res, 404, { error: 'API không tồn tại.' });
}

async function serveStatic(res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const resolved = path.resolve(ROOT, `.${pathname}`);
  if (!resolved.startsWith(ROOT) || resolved.includes(`${path.sep}data${path.sep}`) || resolved.includes(`${path.sep}database${path.sep}`)) {
    return send(res, 403, { error: 'Không được phép truy cập.' });
  }
  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(resolved).pipe(res);
  } catch { send(res, 404, { error: 'Không tìm thấy trang.' }); }
}

async function main() {
  await Promise.all([fsp.mkdir(DATA_DIR, { recursive: true }), fsp.mkdir(UPLOAD_DIR, { recursive: true })]);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(res, url);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, error.status || 500, { error: error.message || 'Có lỗi xảy ra.' });
    }
  });
  server.listen(PORT, () => console.log(`Nhật ký đang chạy tại http://localhost:${PORT}`));
}

if (require.main === module) main();

module.exports = { normalizeEmbedUrl };
