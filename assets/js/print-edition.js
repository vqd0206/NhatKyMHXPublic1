'use strict';

async function loadPrintEdition() {
  const links = document.querySelectorAll('[data-print-link]');
  const qrBlocks = document.querySelectorAll('.print-qr');
  try {
    const response = await fetch('/api/settings');
    const { printEditionUrl } = await response.json();
    if (!printEditionUrl) throw new Error('Chưa cấu hình');
    links.forEach(link => { link.href = printEditionUrl; link.hidden = false; });
    document.querySelectorAll('.qr-code').forEach(element => {
      element.replaceChildren();
      if (window.QRCode) new QRCode(element, { text: printEditionUrl, width: 148, height: 148, colorDark: '#075c39', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
      else { const link=document.createElement('a');link.href=printEditionUrl;link.textContent='Mở bản in điện tử';link.target='_blank';element.append(link); }
    });
    qrBlocks.forEach(block => block.hidden = false);
  } catch {
    links.forEach(link => link.hidden = true);
    qrBlocks.forEach(block => block.hidden = true);
  }
}
loadPrintEdition();
