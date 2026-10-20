// Set PDF.js worker to local file (fully offline)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

// ─── State ───────────────────────────────────────────────────────────────────
let files = [];

// ─── DOM References ──────────────────────────────────────────────────────────
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const mergeBtn = document.getElementById('mergeBtn');
const statusEl = document.getElementById('status');
const pdfPassword = document.getElementById('pdfPassword');
const dropZone = document.getElementById('dropZone');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPdfFile(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function setStatus(message, type) {
  statusEl.innerText = message;
  statusEl.className = type || '';
}

// ─── Drop Zone Events ────────────────────────────────────────────────────────

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const dropped = Array.from(e.dataTransfer.files).filter(isPdfFile);
  if (dropped.length > 0) {
    dropped.forEach(file => {
      files.push({
        file: file,
        totalPages: null,
        pageMode: 'full',
        selectedPages: new Set(),
        pageRanges: ''
      });
    });
    renderList();
    preloadPageCounts();
  } else {
    setStatus('No valid PDF files dropped.', 'error');
  }
});

// ─── File Input Event ────────────────────────────────────────────────────────

fileInput.addEventListener('change', (e) => {
  const newFiles = Array.from(e.target.files).filter(isPdfFile);
  if (newFiles.length > 0) {
    newFiles.forEach(file => {
      files.push({
        file: file,
        totalPages: null,
        pageMode: 'full',
        selectedPages: new Set(),
        pageRanges: ''
      });
    });
    fileInput.value = '';
    renderList();
    preloadPageCounts();
  } else {
    setStatus('No valid PDF files selected.', 'error');
  }
});

// ─── Merge Button ────────────────────────────────────────────────────────────

mergeBtn.addEventListener('click', processFiles);

// ─── Preload Page Counts ─────────────────────────────────────────────────────

async function preloadPageCounts() {
  for (let i = 0; i < files.length; i++) {
    if (files[i].totalPages === null) {
      try {
        const buf = await files[i].file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        files[i].totalPages = pdf.getPageCount();
      } catch (err) {
        console.error('Failed to load PDF:', err);
        files[i].totalPages = '?';
        setStatus('Error: "' + files[i].file.name + '" could not be read. It may be corrupted or encrypted.', 'error');
      }
    }
  }
  renderList();
  updateMergeButton();
}

// ─── Render File List ────────────────────────────────────────────────────────

function renderList() {
  if (files.length === 0) {
    fileList.innerHTML = '<li class="empty-state"><p>No PDFs added yet. Upload some files to get started!</p></li>';
    updateMergeButton();
    return;
  }

  let html = '';

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const isCustom = item.pageMode === 'custom';
    const pageCountText = typeof item.totalPages === 'number' ? item.totalPages + ' pages' : 'Loading...';

    // Mode toggle
    let modeToggleHtml =
      '<div class="mode-toggle">' +
        '<button type="button" class="mode-btn ' + (!isCustom ? 'active' : '') + '" onclick="setPageMode(' + i + ', \'full\')">📄 Full Document</button>' +
        '<button type="button" class="mode-btn ' + (isCustom ? 'active' : '') + '" onclick="setPageMode(' + i + ', \'custom\')">✂️ Choose Pages</button>' +
      '</div>';

    // Custom pages panel
    let customPanelHtml = '';
    if (isCustom && typeof item.totalPages === 'number') {
      const checkboxes = [];
      for (let p = 1; p <= item.totalPages; p++) {
        const isChecked = item.selectedPages.has(p);
        checkboxes.push(
          '<div class="page-checkbox-label ' + (isChecked ? 'checked' : '') + '" onclick="togglePage(' + i + ', ' + p + ')">' +
            p +
          '</div>'
        );
      }

      customPanelHtml =
        '<div class="custom-pages-panel">' +
          '<div class="quick-actions">' +
            '<button type="button" class="quick-btn" onclick="selectEven(' + i + ')">Even Pages</button>' +
            '<button type="button" class="quick-btn" onclick="selectOdd(' + i + ')">Odd Pages</button>' +
            '<button type="button" class="quick-btn" onclick="selectAll(' + i + ')">All Pages</button>' +
            '<button type="button" class="quick-btn" onclick="selectNone(' + i + ')">None</button>' +
          '</div>' +
          '<div class="page-grid">' + checkboxes.join('') + '</div>' +
          '<div class="range-section">' +
            '<input type="text" class="range-input" id="range-' + i + '" placeholder="e.g. 1-3,5,7-9" value="' + (item.pageRanges || '') + '">' +
            '<button type="button" class="apply-range-btn" onclick="applyRange(' + i + ')">Apply</button>' +
          '</div>' +
          '<div class="range-hint">Selected: ' + item.selectedPages.size + ' of ' + item.totalPages + ' pages</div>' +
        '</div>';
    }

    html +=
      '<li class="file-item">' +
        '<div class="file-header">' +
          '<div class="file-info">' +
            '<span class="file-name">' + escapeHtml(item.file.name) + '</span>' +
            '<span class="file-meta">' + formatBytes(item.file.size) + ' • ' + pageCountText + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="btn-secondary" onclick="move(' + i + ', -1)" title="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="btn-secondary" onclick="move(' + i + ', 1)" title="Move down"' + (i === files.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="btn-remove" onclick="remove(' + i + ')" title="Remove">✕</button>' +
          '</div>' +
        '</div>' +
        modeToggleHtml +
        customPanelHtml +
      '</li>';
  }

  fileList.innerHTML = html;
  updateMergeButton();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── File Actions (global functions for onclick) ─────────────────────────────

function move(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= files.length) return;
  const temp = files[index];
  files[index] = files[target];
  files[target] = temp;
  renderList();
}

function remove(index) {
  files.splice(index, 1);
  renderList();
}

function setPageMode(index, mode) {
  files[index].pageMode = mode;
  if (mode === 'full') {
    files[index].selectedPages = new Set();
    files[index].pageRanges = '';
  }
  renderList();
}

function togglePage(index, pageNum) {
  if (files[index].selectedPages.has(pageNum)) {
    files[index].selectedPages.delete(pageNum);
  } else {
    files[index].selectedPages.add(pageNum);
  }
  renderList();
}

function selectEven(index) {
  const total = files[index].totalPages;
  if (typeof total !== 'number') return;
  files[index].selectedPages = new Set();
  for (let i = 2; i <= total; i += 2) files[index].selectedPages.add(i);
  files[index].pageRanges = '';
  renderList();
}

function selectOdd(index) {
  const total = files[index].totalPages;
  if (typeof total !== 'number') return;
  files[index].selectedPages = new Set();
  for (let i = 1; i <= total; i += 2) files[index].selectedPages.add(i);
  files[index].pageRanges = '';
  renderList();
}

function selectAll(index) {
  const total = files[index].totalPages;
  if (typeof total !== 'number') return;
  files[index].selectedPages = new Set();
  for (let i = 1; i <= total; i++) files[index].selectedPages.add(i);
  files[index].pageRanges = '';
  renderList();
}

function selectNone(index) {
  files[index].selectedPages = new Set();
  files[index].pageRanges = '';
  renderList();
}

function applyRange(index) {
  const input = document.getElementById('range-' + index);
  const rangeStr = input.value.trim();
  const total = files[index].totalPages;

  if (typeof total !== 'number' || !rangeStr) return;

  const pages = parsePageRanges(rangeStr, total);
  if (pages.length === 0) {
    setStatus('Invalid page range for "' + files[index].file.name + '".', 'error');
    return;
  }
  files[index].selectedPages = new Set(pages);
  files[index].pageRanges = rangeStr;
  setStatus('', '');
  renderList();
}

function parsePageRanges(rangeStr, totalPages) {
  if (!rangeStr) return [];
  const pages = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(s => s);

  for (const part of parts) {
    if (part.includes('-')) {
      const rangeParts = part.split('-').map(s => parseInt(s.trim(), 10));
      if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
        const start = Math.max(1, rangeParts[0]);
        const end = Math.min(totalPages, rangeParts[1]);
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) pages.add(num);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// ─── Update Merge Button State ───────────────────────────────────────────────

function updateMergeButton() {
  const hasFiles = files.length > 0;
  const allLoaded = files.every(f => typeof f.totalPages === 'number');
  const allValid = files.every(f => f.pageMode === 'full' || f.selectedPages.size > 0);
  mergeBtn.disabled = !(hasFiles && allLoaded && allValid);
}

// ─── Process / Merge Files ───────────────────────────────────────────────────

async function processFiles() {
  mergeBtn.disabled = true;
  const pass = pdfPassword.value.trim();

  try {
    // Validate all files
    for (const item of files) {
      if (typeof item.totalPages !== 'number') {
        setStatus('Error: Could not determine page count for "' + item.file.name + '".', 'error');
        mergeBtn.disabled = false;
        return;
      }
      if (item.pageMode === 'custom' && item.selectedPages.size === 0) {
        setStatus('Error: No pages selected for "' + item.file.name + '".', 'error');
        mergeBtn.disabled = false;
        return;
      }
    }

    setStatus('Merging PDF pages...', '');
    const mergedDoc = await PDFLib.PDFDocument.create();
    let totalMergedPages = 0;

    for (const item of files) {
      const buf = await item.file.arrayBuffer();
      const srcPdf = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });

      let pageIndices;
      if (item.pageMode === 'full') {
        pageIndices = srcPdf.getPageIndices();
      } else {
        pageIndices = Array.from(item.selectedPages).sort((a, b) => a - b).map(p => p - 1);
      }

      const pages = await mergedDoc.copyPages(srcPdf, pageIndices);
      pages.forEach(p => mergedDoc.addPage(p));
      totalMergedPages += pageIndices.length;
    }

    const mergedBytes = await mergedDoc.save();

    // If no password, just download the merged file directly
    if (!pass) {
      triggerDownload(mergedBytes, 'merged.pdf');
      setStatus('Done! Merged ' + totalMergedPages + ' pages. File downloaded.', 'success');
      mergeBtn.disabled = false;
      return;
    }

    // Password-protected: render pages as images and encrypt with jsPDF
    setStatus('Securing document with password...', '');
    const loadingTask = pdfjsLib.getDocument({ data: mergedBytes });
    const pdfDoc = await loadingTask.promise;
    const { jsPDF } = window.jspdf;

    // Determine orientation from first page
    const firstPage = await pdfDoc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 2.0 });
    const isLandscape = firstViewport.width > firstViewport.height;

    const doc = new jsPDF({
      orientation: isLandscape ? 'l' : 'p',
      unit: 'pt',
      format: [firstViewport.width, firstViewport.height],
      encryption: {
        userPassword: pass,
        ownerPassword: pass + '_root',
        userPermissions: ['print']
      }
    });

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      setStatus('Encrypting page ' + i + ' of ' + pdfDoc.numPages + '...');
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      if (i > 1) {
        doc.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'l' : 'p');
      }
      doc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);

      // Free memory
      canvas.width = 0;
      canvas.height = 0;
    }

    doc.save('secured-document.pdf');
    setStatus('Success! Encrypted file downloaded (' + totalMergedPages + ' pages).', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message, 'error');
  } finally {
    updateMergeButton();
  }
}

// ─── Download Helper ─────────────────────────────────────────────────────────

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Initial Render ──────────────────────────────────────────────────────────
renderList();