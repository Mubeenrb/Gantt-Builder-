window.CG = window.CG || {};

CG.Persistence = (function () {
  var STORAGE_KEY = 'capexGanttApp.v1';

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function loadAppState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('CAPEX Gantt: failed to read saved state, starting fresh.', e);
      return null;
    }
  }

  function saveAppStateNow(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('CAPEX Gantt: failed to autosave (storage full or unavailable).', e);
      return false;
    }
  }

  var saveAppStateDebounced = debounce(saveAppStateNow, 400);

  function loadSeedProject() {
    if (!window.CG_SEED_PROJECT) return null;
    return JSON.parse(JSON.stringify(window.CG_SEED_PROJECT.project));
  }

  function slugify(name) {
    return (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  var fsaSupported = typeof window.showSaveFilePicker === 'function';

  // Save project JSON to a local file. Tries the File System Access API first
  // (real save dialog, can overwrite the same file next time); falls back to
  // a plain browser download if unavailable or the user cancels/it's blocked.
  async function exportProjectToFile(project) {
    var payload = { fileFormatVersion: 1, project: project };
    var text = JSON.stringify(payload, null, 2);
    var filename = slugify(project.name) + '.json';

    if (fsaSupported) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'CAPEX Gantt Project', accept: { 'application/json': ['.json'] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return { ok: true, method: 'fsa', name: handle.name };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
        console.warn('CAPEX Gantt: File System Access save failed, falling back to download.', e);
      }
    }
    downloadBlob(new Blob([text], { type: 'application/json' }), filename);
    return { ok: true, method: 'download', name: filename };
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function importProjectFromFile(file) {
    var text = await readFileAsText(file);
    var parsed = JSON.parse(text);
    if (parsed && parsed.project) return parsed.project;
    if (parsed && parsed.tasks) return parsed; // tolerate a bare project object
    throw new Error('This file does not look like a CAPEX Gantt project export.');
  }

  var TYPE_DESCRIPTORS = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { description: 'Excel Workbook', ext: '.xlsx' },
    'image/png': { description: 'PNG Image', ext: '.png' }
  };

  // Save an arbitrary binary blob (used for .xlsx / .png export) via FSA or download.
  // `data` may be an ArrayBuffer or a Blob — both are valid write() sources for
  // a FileSystemWritableFileStream and both are valid Blob constructor parts.
  async function saveBinaryToFile(data, filename, mimeType) {
    if (fsaSupported) {
      try {
        var descriptor = TYPE_DESCRIPTORS[mimeType] || { description: 'File', ext: '.' + (filename.split('.').pop() || 'bin') };
        var accept = {};
        accept[mimeType] = [descriptor.ext];
        var handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: descriptor.description, accept: accept }]
        });
        var writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return { ok: true, method: 'fsa', name: handle.name };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
        console.warn('CAPEX Gantt: File System Access export failed, falling back to download.', e);
      }
    }
    downloadBlob(data instanceof Blob ? data : new Blob([data], { type: mimeType }), filename);
    return { ok: true, method: 'download', name: filename };
  }

  return {
    loadAppState: loadAppState,
    saveAppStateNow: saveAppStateNow,
    saveAppStateDebounced: saveAppStateDebounced,
    loadSeedProject: loadSeedProject,
    exportProjectToFile: exportProjectToFile,
    importProjectFromFile: importProjectFromFile,
    saveBinaryToFile: saveBinaryToFile,
    readFileAsText: readFileAsText,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
    slugify: slugify,
    fsaSupported: fsaSupported
  };
})();
