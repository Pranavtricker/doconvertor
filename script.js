function $(sel) { return document.querySelector(sel); }

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const chooseBtn = $('#choose-btn');
const convertBtn = $('#convert-btn');
const clearBtn = $('#clear-btn');
const downloadBtn = $('#download-btn');
const modeSelect = $('#mode');
const modeHelp = document.getElementById('mode-help');
const themeToggle = document.getElementById('theme-toggle');
const serviceStatus = document.getElementById('service-status');
const fileInfo = $('#file-info');
const fileList = document.getElementById('file-list');
const jpgOptions = document.getElementById('jpg-options');
const pageSizeSel = document.getElementById('page-size');
const orientationSel = document.getElementById('orientation');
const progress = $('#progress');
const progressBar = $('#progress .bar');
const result = $('#result');
const previewEl = document.getElementById('docx-preview');
let currentFile = null;
let generatedDoc = null;
let currentFiles = [];

function resetUI() {
  fileInput.value = '';
  fileInfo.textContent = '';
  convertBtn.disabled = true;
  clearBtn.disabled = true;
  downloadBtn.disabled = true;
  progressBar.style.width = '0%';
  progress.setAttribute('aria-hidden', 'true');
  result.classList.remove('show');
  result.setAttribute('aria-hidden', 'true');
  result.textContent = '';
  currentFile = null;
  generatedDoc = null;
  currentFiles = [];
  if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.remove('show'); previewEl.hidden = true; }
  if (fileList) { fileList.innerHTML = ''; fileList.classList.remove('show'); fileList.hidden = true; }
  if (jpgOptions) { jpgOptions.hidden = true; }
}

function isWord(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.doc') || name.endsWith('.docx');
}

function isDocx(file) {
  return file && file.name.toLowerCase().endsWith('.docx');
}

function isPdf(file) {
  return file && file.name.toLowerCase().endsWith('.pdf');
}

function isPptx(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.pptx') || name.endsWith('.ppt');
}

function isImage(file) {
  const n = file.name.toLowerCase();
  return n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function setFiles(files) {
  const mode = modeSelect ? modeSelect.value : 'word-to-pdf';
  if (!files || files.length === 0) return;
  let valid = [];
  if (mode === 'word-to-pdf') valid = Array.from(files).filter(isWord);
  else if (mode === 'pdf-to-word') valid = Array.from(files).filter(isPdf).slice(0, 1);
  else if (mode === 'pptx-to-pdf') valid = Array.from(files).filter(isPptx);
  else if (mode === 'jpg-to-pdf') valid = Array.from(files).filter(isImage);
  else if (mode === 'merge-pdfs') valid = Array.from(files).filter(isPdf);
  currentFiles = valid;
  currentFile = valid[0] || null;
  if (valid.length === 0) {
    fileInfo.textContent = 'Selected files do not match the chosen mode.';
    convertBtn.disabled = true;
    clearBtn.disabled = false;
    downloadBtn.disabled = true;
    return;
  }
  if (mode === 'word-to-pdf' || mode === 'pdf-to-word' || mode === 'pptx-to-pdf') {
    fileInfo.textContent = `${valid[0].name} • ${formatBytes(valid[0].size)}`;
    if (fileList) { fileList.innerHTML = ''; fileList.classList.remove('show'); fileList.hidden = true; }
    if (jpgOptions) { jpgOptions.hidden = mode !== 'jpg-to-pdf'; }
  } else {
    fileInfo.textContent = `${valid.length} files selected`;
    renderFileList();
    if (jpgOptions) { jpgOptions.hidden = mode !== 'jpg-to-pdf'; }
  }
  convertBtn.disabled = false;
  clearBtn.disabled = false;
  downloadBtn.disabled = true;
  generatedDoc = null;
  if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.remove('show'); previewEl.hidden = true; }
}

chooseBtn.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  const files = e.dataTransfer.files;
  setFiles(files);
});

fileInput.addEventListener('change', () => setFiles(fileInput.files));

clearBtn.addEventListener('click', () => resetUI());

convertBtn.addEventListener('click', async () => {
  if (!currentFile && currentFiles.length === 0) return;
  convertBtn.disabled = true;
  downloadBtn.disabled = true;
  progress.setAttribute('aria-hidden', 'false');
  progressBar.style.width = '20%';

  try {
    const formData = new FormData();
    const mode = modeSelect ? modeSelect.value : 'word-to-pdf';
    let endpoint = '/api/convert';
    if (mode === 'word-to-pdf') {
      formData.append('file', currentFile);
      endpoint = '/api/convert';
    } else if (mode === 'pdf-to-word') {
      formData.append('file', currentFile);
      endpoint = '/api/pdf-to-word';
    } else if (mode === 'pptx-to-pdf') {
      formData.append('file', currentFile);
      endpoint = '/api/pptx-to-pdf';
    } else if (mode === 'jpg-to-pdf') {
      for (const f of currentFiles) formData.append('files', f);
      formData.append('pageSize', pageSizeSel ? pageSizeSel.value : 'A4');
      formData.append('orientation', orientationSel ? orientationSel.value : 'auto');
      endpoint = '/api/jpg-to-pdf';
    } else if (mode === 'merge-pdfs') {
      for (const f of currentFiles) formData.append('files', f);
      endpoint = '/api/merge-pdf';
    }
    progressBar.style.width = '50%';
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    if (!res.ok) {
      const text = await res.text();
      let msg = 'Server conversion failed';
      try { const data = JSON.parse(text); msg = data.error || msg } catch { if (text) msg = text }
      throw new Error(msg);
    }
    progressBar.style.width = '85%';
    const blob = await res.blob();
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    let filename = 'output.pdf';
    if (mode === 'word-to-pdf') filename = pdfNameFrom(currentFile);
    else if (mode === 'pdf-to-word') filename = currentFile.name.replace(/\.pdf$/i, '') + '.docx';
    else if (mode === 'pptx-to-pdf') filename = currentFile.name.replace(/\.(pptx|ppt)$/i, '') + '.pdf';
    else if (mode === 'merge-pdfs') filename = 'merged.pdf';
    else if (mode === 'jpg-to-pdf') filename = 'images.pdf';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    result.textContent = 'Conversion complete. Your download should begin.';
    result.classList.add('show');
    result.setAttribute('aria-hidden', 'false');
    clearBtn.disabled = false;
    progressBar.style.width = '100%';
  } catch (err) {
    progressBar.style.width = '100%';
    result.textContent = 'Server conversion error: ' + (err && err.message ? err.message : 'Unknown error');
    result.classList.add('show');
    result.setAttribute('aria-hidden', 'false');
    clearBtn.disabled = false;
  }
});

function pdfNameFrom(file) {
  const base = file.name.replace(/\.(docx|doc)$/i, '');
  return base + '.pdf';
}

downloadBtn.addEventListener('click', () => {
  if (!generatedDoc) return;
  const name = currentFile ? pdfNameFrom(currentFile) : 'document.pdf';
  generatedDoc.save(name);
});

resetUI();

function updateMode() {
  const v = modeSelect ? modeSelect.value : 'word-to-pdf';
  document.body.dataset.mode = v;
  if (v === 'word-to-pdf') {
    fileInput.accept = '.doc,.docx';
    fileInput.multiple = false;
    if (modeHelp) modeHelp.textContent = 'Upload a .doc or .docx';
    if (jpgOptions) jpgOptions.hidden = true;
  } else if (v === 'pdf-to-word') {
    fileInput.accept = '.pdf';
    fileInput.multiple = false;
    if (modeHelp) modeHelp.textContent = 'Upload a .pdf';
    if (jpgOptions) jpgOptions.hidden = true;
  } else if (v === 'pptx-to-pdf') {
    fileInput.accept = '.pptx,.ppt';
    fileInput.multiple = false;
    if (modeHelp) modeHelp.textContent = 'Upload a .pptx or .ppt';
    if (jpgOptions) jpgOptions.hidden = true;
  } else if (v === 'jpg-to-pdf') {
    fileInput.accept = '.jpg,.jpeg,.png';
    fileInput.multiple = true;
    if (modeHelp) modeHelp.textContent = 'Upload one or more images (.jpg/.png)';
    if (jpgOptions) jpgOptions.hidden = false;
  } else if (v === 'merge-pdfs') {
    fileInput.accept = '.pdf';
    fileInput.multiple = true;
    if (modeHelp) modeHelp.textContent = 'Upload two or more PDFs to merge';
    if (jpgOptions) jpgOptions.hidden = true;
  }
  resetUI();
}

if (modeSelect) {
  modeSelect.addEventListener('change', updateMode);
  updateMode();
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
}

if (themeToggle) {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

async function checkServiceStatus() {
  try {
    const r = await fetch('/api/status');
    if (!r.ok) throw new Error('status failed');
    const s = await r.json();
    // We can assume services are available if we are using ConvertAPI
    // But let's keep the check if the endpoint exists, or just ignore it
  } catch { }
}

checkServiceStatus();
function renderFileList() {
  const mode = modeSelect ? modeSelect.value : 'word-to-pdf';
  if (!fileList) return;
  if (mode === 'word-to-pdf' || mode === 'pdf-to-word' || mode === 'pptx-to-pdf') { fileList.hidden = true; return; }
  fileList.innerHTML = '';
  fileList.hidden = false;
  fileList.classList.add('show');
  currentFiles.forEach((f, idx) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = f.name;
    const controls = document.createElement('div');
    controls.className = 'controls';
    const up = document.createElement('button'); up.className = 'mini-btn'; up.textContent = '↑'; up.disabled = idx === 0;
    const down = document.createElement('button'); down.className = 'mini-btn'; down.textContent = '↓'; down.disabled = idx === currentFiles.length - 1;
    const remove = document.createElement('button'); remove.className = 'mini-btn'; remove.textContent = '✕';
    up.addEventListener('click', () => { moveFile(idx, idx - 1); });
    down.addEventListener('click', () => { moveFile(idx, idx + 1); });
    remove.addEventListener('click', () => { removeFile(idx); });
    controls.appendChild(up); controls.appendChild(down); controls.appendChild(remove);
    li.appendChild(name); li.appendChild(controls);
    fileList.appendChild(li);
  });
}

function moveFile(from, to) {
  if (to < 0 || to >= currentFiles.length) return;
  const item = currentFiles.splice(from, 1)[0];
  currentFiles.splice(to, 0, item);
  renderFileList();
}

function removeFile(idx) {
  currentFiles.splice(idx, 1);
  if (currentFiles.length === 0) resetUI(); else renderFileList();
}