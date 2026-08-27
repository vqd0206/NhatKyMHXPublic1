'use strict';

const form = document.querySelector('#journal-form');
const fileInput = document.querySelector('#media-files');
const linksInput = document.querySelector('#media-links');
const preview = document.querySelector('#media-preview');
const count = document.querySelector('#media-count');
const status = document.querySelector('#editor-status');
const editToken = new URLSearchParams(location.search).get('edit');
let selectedFiles = [];
const removedMediaIds = new Set();

const links = () => [...new Set(linksInput.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
const toDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
function updateCount(){ const total=selectedFiles.length+links().length; count.textContent=`${total} / 20 mục đã chọn`; count.classList.toggle('over-limit',total>20); }
function renderPreview(){ preview.innerHTML=''; selectedFiles.forEach((file,index)=>{ const item=document.createElement('div');item.className='preview-item';const media=document.createElement(file.type.startsWith('video/')?'video':'img');media.src=URL.createObjectURL(file);if(media.tagName==='IMG')media.alt=file.name;else{media.controls=true;media.muted=true}media.onloadeddata=media.onload=()=>URL.revokeObjectURL(media.src);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.onclick=()=>{selectedFiles.splice(index,1);renderPreview()};item.append(media,remove);preview.append(item)});updateCount() }

const editorReady=window.tinymce?tinymce.init({selector:'#journal-content',license_key:'gpl',height:440,menubar:false,branding:false,promotion:false,paste_as_text:true,plugins:'lists link autoresize wordcount',toolbar:'undo redo | blocks | bold italic underline | bullist numlist | blockquote link | alignleft aligncenter alignright | removeformat',mobile:{toolbar_mode:'sliding',menubar:false}}).then(editors=>editors[0]):Promise.resolve(null);
fileInput.addEventListener('change',()=>{const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];const incoming=[...fileInput.files].filter(file=>allowed.includes(file.type)&&file.size<=(file.type.startsWith('video/')?20:8)*1024*1024);selectedFiles=[...selectedFiles,...incoming].slice(0,20);fileInput.value='';renderPreview()});
linksInput.addEventListener('input',updateCount);

async function loadEdit(){
  if(!editToken)return;
  document.querySelector('#editor-title').textContent='Chỉnh sửa trang nhật ký';document.querySelector('#editor-description').textContent='Mọi thay đổi sẽ được cập nhật vào trang nhật ký hiện có.';document.querySelector('#save-journal').textContent='Lưu thay đổi ♥';
  try{const response=await fetch(`/api/edit/${encodeURIComponent(editToken)}`);const result=await response.json();if(!response.ok)throw new Error(result.error);const journal=result.journal;['title','authorName','writtenAt','eventDate','location','sourceCredit','closingMessage'].forEach(name=>{if(form.elements[name])form.elements[name].value=journal[name]||''});const editor=await editorReady;if(editor)editor.setContent(journal.contentHtml||journal.content||'');else form.elements.content.value=journal.content||'';if(result.media.length){const wrap=document.querySelector('#existing-media-wrap'),root=document.querySelector('#existing-media');wrap.hidden=false;root.innerHTML=result.media.map(item=>`<article class="existing-media-item" data-id="${item.id}">${item.type==='image'?`<img src="${item.url}" alt="">`:`<div class="existing-media-placeholder">${item.type==='embed'?'VIDEO NHÚNG':'VIDEO'}</div>`}<button type="button">Bỏ khỏi trang</button></article>`).join('');root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const item=button.closest('.existing-media-item'),id=item.dataset.id;if(removedMediaIds.has(id)){removedMediaIds.delete(id);item.classList.remove('marked-remove');button.textContent='Bỏ khỏi trang'}else{removedMediaIds.add(id);item.classList.add('marked-remove');button.textContent='Giữ lại'}})}status.textContent=`Đang chỉnh sửa: ${journal.title}`}
  catch(error){status.className='form-status error';status.textContent=error.message;form.querySelector('button[type="submit"]').disabled=true}
}

form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('button[type="submit"]');submit.disabled=true;status.className='form-status';status.textContent=editToken?'Đang lưu thay đổi...':'Đang xuất bản nhật ký...';try{const editor=await editorReady;if(editor)editor.save();const fields=Object.fromEntries(new FormData(form));const contentHtml=editor?.getContent()||fields.content||'';if(!contentHtml.replace(/<[^>]+>/g,'').trim())throw new Error('Vui lòng nhập nội dung nhật ký.');const mediaLinks=links();if(selectedFiles.length+mediaLinks.length>20)throw new Error('Không được vượt quá 20 mục đính kèm.');const media=await Promise.all(selectedFiles.map(async(file,index)=>({dataUrl:await toDataUrl(file),alt:`${file.type.startsWith('video/')?'Video':'Ảnh'} kỷ niệm ${index+1}`,caption:file.name.replace(/\.[^.]+$/,'')})));const endpoint=editToken?`/api/edit/${encodeURIComponent(editToken)}`:'/api/journals';const response=await fetch(endpoint,{method:editToken?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,contentHtml,media,mediaLinks,removeMediaIds:[...removedMediaIds]})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Không thể lưu nhật ký.');status.textContent=editToken?'Đã lưu thay đổi ♥':'Đã xuất bản! Đang mở trang nhật ký...';if(!editToken)setTimeout(()=>location.href=`/journal.html?slug=${encodeURIComponent(result.journal.slug)}`,700)}catch(error){status.className='form-status error';status.textContent=error.message}finally{submit.disabled=false}});
loadEdit();
