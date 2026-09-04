window.CG = window.CG || {};

CG.ExcelImport = (function () {
  var S = CG.State, D = CG.Dates, Id = CG.Id;

  var FIELD_OPTIONS = [
    { value: 'ignore', label: '(Ignore this column)' },
    { value: 'name', label: 'Task Name' },
    { value: 'type', label: 'Type (Task/Milestone)' },
    { value: 'category', label: 'Category' },
    { value: 'start', label: 'Start Date' },
    { value: 'end', label: 'End Date' },
    { value: 'progress', label: 'Progress %' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'budget', label: 'Budget' },
    { value: 'actualCost', label: 'Actual Cost' },
    { value: 'predecessors', label: 'Predecessors' },
    { value: 'notes', label: 'Notes' },
    { value: '__new__', label: '+ New custom field' }
  ];

  var HEADER_ALIASES = {
    name: ['task name', 'name', 'task', 'title'],
    type: ['type'],
    category: ['category', 'group', 'phase'],
    start: ['start date', 'start'],
    end: ['end date', 'end', 'finish', 'finish date'],
    progress: ['progress', 'progress %', '% complete', 'percent complete'],
    assignee: ['assignee', 'owner', 'resource'],
    budget: ['budget', 'planned cost', 'planned budget'],
    actualCost: ['actual cost', 'cost', 'actual'],
    predecessors: ['predecessors', 'dependencies', 'predecessor'],
    notes: ['notes', 'comments', 'remarks']
  };

  var state = null; // { headers, rows, mapping[], project, filename }

  function init() {
    document.getElementById('file-input-import').addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      ev.target.value = '';
      if (file) handleFile(file);
    });
  }

  function openFilePicker() { document.getElementById('file-input-import').click(); }

  async function handleFile(file) {
    var project = S.getActiveProject();
    if (!project) { CG.Toast.show('Open a project first.', 'error'); return; }
    var ext = file.name.split('.').pop().toLowerCase();
    var headers, rows;
    try {
      if (ext === 'csv') {
        var text = await CG.Persistence.readFileAsText(file);
        var parsed = CG.Csv.toObjects(text);
        headers = parsed.headers; rows = parsed.rows;
      } else {
        var buf = await CG.Persistence.readFileAsArrayBuffer(file);
        var wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        var ws = wb.worksheets[0];
        var raw = [];
        ws.eachRow(function (row) {
          var vals = row.values.slice(1).map(function (v) {
            if (v && v instanceof Date) return D.fromEpochDay(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
            if (v && typeof v === 'object' && v.text) return v.text;
            return v == null ? '' : v;
          });
          raw.push(vals);
        });
        headers = (raw[0] || []).map(String);
        rows = raw.slice(1).map(function (r) {
          var obj = {};
          headers.forEach(function (h, i) { obj[h] = r[i] !== undefined ? r[i] : ''; });
          return obj;
        });
      }
    } catch (e) {
      CG.Toast.show('Could not read that file: ' + e.message, 'error');
      return;
    }
    if (!headers.length) { CG.Toast.show('No columns found in that file.', 'error'); return; }

    var mapping = headers.map(function (h) { return autoMatch(h); });
    state = { headers: headers, rows: rows, mapping: mapping, project: project };
    renderWizard();
  }

  function autoMatch(header) {
    var norm = header.trim().toLowerCase();
    for (var field in HEADER_ALIASES) {
      if (HEADER_ALIASES[field].indexOf(norm) !== -1) return field;
    }
    return 'ignore';
  }

  function renderWizard() {
    var backdrop = document.getElementById('import-modal-backdrop');
    var modal = document.getElementById('import-modal');
    modal.innerHTML = buildWizardHtml();
    backdrop.classList.remove('hidden');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) closeWizard(); };
    document.getElementById('import-close').onclick = closeWizard;
    document.getElementById('import-cancel').onclick = closeWizard;
    document.getElementById('import-confirm').onclick = confirmImport;
    state.headers.forEach(function (h, i) {
      document.getElementById('map-' + i).addEventListener('change', function (ev) {
        state.mapping[i] = ev.target.value;
        validateAndRefresh();
      });
    });
    validateAndRefresh();
  }

  function closeWizard() { document.getElementById('import-modal-backdrop').classList.add('hidden'); state = null; }

  function buildWizardHtml() {
    var project = state.project;
    var customOpts = project.customFieldDefs.map(function (d) { return { value: d.id, label: '→ custom field: ' + d.name }; });
    var opts = FIELD_OPTIONS.concat(customOpts);

    var headHtml = state.headers.map(function (h, i) {
      var selHtml = opts.map(function (o) { return '<option value="' + o.value + '"' + (o.value === state.mapping[i] ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>'; }).join('');
      return '<th>' + escapeHtml(h) + '<br><select id="map-' + i + '">' + selHtml + '</select></th>';
    }).join('');

    var previewRows = state.rows.slice(0, 6).map(function (row) {
      return '<tr>' + state.headers.map(function (h) { return '<td>' + escapeHtml(String(row[h] != null ? row[h] : '')) + '</td>'; }).join('') + '</tr>';
    }).join('');

    return '' +
      '<span class="close-x" id="import-close">&times;</span>' +
      '<h2>Import Tasks (' + state.rows.length + ' rows found)</h2>' +
      '<p style="font-size:12.5px;color:var(--text-muted)">Map each column to a field. Unmapped columns are ignored unless assigned to a custom field. Required: Task Name, Start Date, End Date.</p>' +
      '<div style="overflow-x:auto"><table class="import-preview-table"><thead><tr>' + headHtml + '</tr></thead><tbody>' + previewRows + '</tbody></table></div>' +
      '<div class="form-row" style="margin-top:12px"><label><input type="checkbox" id="import-group-by-category"> Create phase groups from the Category column</label></div>' +
      '<div id="import-validation" class="import-error"></div>' +
      '<div class="form-actions">' +
      '<button class="btn" id="import-cancel" type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="import-confirm" type="button" disabled>Import</button>' +
      '</div>';
  }

  function validateAndRefresh() {
    var missing = ['name', 'start', 'end'].filter(function (f) { return state.mapping.indexOf(f) === -1; });
    var msg = document.getElementById('import-validation');
    var btn = document.getElementById('import-confirm');
    if (missing.length) {
      msg.textContent = 'Missing required mapping for: ' + missing.join(', ') + '.';
      btn.disabled = true;
    } else {
      msg.textContent = '';
      btn.disabled = false;
    }
  }

  function parseDateFlexible(v, dateFormat) {
    if (!v) return null;
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
    if (m) {
      var a = m[1], b = m[2], c = m[3];
      if (a.length === 4) return a + '-' + pad(b) + '-' + pad(c);
      var dayFirst = !dateFormat || dateFormat.indexOf('dd') === 0;
      var day = dayFirst ? a : b, month = dayFirst ? b : a, year = c.length === 2 ? '20' + c : c;
      return year + '-' + pad(month) + '-' + pad(day);
    }
    var dt = new Date(s);
    if (!isNaN(dt.getTime())) return D.fromEpochDay(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    return null;
  }
  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  function parseNumber(v) {
    if (v === '' || v == null) return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }

  function confirmImport() {
    var project = state.project;
    var mapping = state.mapping, headers = state.headers;
    var groupByCategory = document.getElementById('import-group-by-category').checked;
    var idxOf = {};
    mapping.forEach(function (field, i) { idxOf[field] = i; });
    var customFieldIdxs = mapping.map(function (f, i) { return { field: f, i: i }; }).filter(function (x) { return x.field === '__new__' || project.customFieldDefs.some(function (d) { return d.id === x.field; }); });

    var newCustomDefs = [];
    var customTargets = {}; // header index -> customFieldDefId
    customFieldIdxs.forEach(function (x) {
      if (x.field === '__new__') {
        var def = { id: Id.uuid(), name: headers[x.i], type: 'text' };
        newCustomDefs.push(def);
        customTargets[x.i] = def.id;
      } else {
        customTargets[x.i] = x.field;
      }
    });

    var errors = [];
    var newTasks = [];
    var nameToId = {};
    project.tasks.forEach(function (t) { nameToId[t.name.trim().toLowerCase()] = t.id; });

    var categoryByName = {};
    project.categories.forEach(function (c) { categoryByName[c.name.trim().toLowerCase()] = c.id; });

    var groupParents = {}; // category name -> parent task id

    state.rows.forEach(function (row, rowIdx) {
      var name = idxOf.name !== undefined ? String(row[headers[idxOf.name]] || '').trim() : '';
      var startRaw = idxOf.start !== undefined ? row[headers[idxOf.start]] : '';
      var endRaw = idxOf.end !== undefined ? row[headers[idxOf.end]] : '';
      var start = parseDateFlexible(startRaw, project.settings.dateFormat);
      var end = parseDateFlexible(endRaw, project.settings.dateFormat);
      if (!name || !start) { errors.push('Row ' + (rowIdx + 2) + ': missing name or unparsable start date — skipped.'); return; }
      if (!end || D.isBefore(end, start)) end = start;

      var typeRaw = idxOf.type !== undefined ? String(row[headers[idxOf.type]] || '').trim().toLowerCase() : '';
      var type = typeRaw === 'milestone' ? 'milestone' : 'task';
      if (type === 'milestone') end = start;

      var categoryName = idxOf.category !== undefined ? String(row[headers[idxOf.category]] || '').trim() : '';
      var categoryId = categoryByName[categoryName.trim().toLowerCase()] || null;

      var parentId = null;
      if (groupByCategory && categoryName) {
        if (!groupParents[categoryName]) {
          var pid = Id.uuid();
          groupParents[categoryName] = pid;
          newTasks.push({
            id: pid, parentId: null, order: Id.nextOrder(), type: 'task',
            name: categoryName, start: start, end: end, progress: 0, assignee: '',
            categoryId: categoryId, color: null, dependencies: [], budget: null, actualCost: null,
            notes: 'Auto-created phase group from import.', customFields: {}, collapsed: false
          });
        }
        parentId = groupParents[categoryName];
      }

      var task = {
        id: Id.uuid(), parentId: parentId, order: Id.nextOrder(), type: type,
        name: name, start: start, end: end,
        progress: idxOf.progress !== undefined ? Math.max(0, Math.min(100, parseNumber(row[headers[idxOf.progress]]) || 0)) : 0,
        assignee: idxOf.assignee !== undefined ? String(row[headers[idxOf.assignee]] || '') : '',
        categoryId: categoryId, color: null,
        dependencies: [],
        budget: idxOf.budget !== undefined ? parseNumber(row[headers[idxOf.budget]]) : null,
        actualCost: idxOf.actualCost !== undefined ? parseNumber(row[headers[idxOf.actualCost]]) : null,
        notes: idxOf.notes !== undefined ? String(row[headers[idxOf.notes]] || '') : '',
        customFields: {}, collapsed: false,
        _predText: idxOf.predecessors !== undefined ? String(row[headers[idxOf.predecessors]] || '') : ''
      };
      Object.keys(customTargets).forEach(function (i) { task.customFields[customTargets[i]] = row[headers[i]] || ''; });
      newTasks.push(task);
      nameToId[name.trim().toLowerCase()] = task.id;
    });

    // Second pass: resolve predecessor names now that all new tasks have ids.
    newTasks.forEach(function (t) {
      if (!t._predText) { delete t._predText; return; }
      var parts = t._predText.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      parts.forEach(function (part) {
        var m = part.match(/^(.*?)\s*\(\s*(FS|SS|FF|SF)?\s*([+\-]?\d+d)?\s*\)\s*$/i);
        var predName = (m ? m[1] : part).trim().toLowerCase();
        var predType = (m && m[2]) ? m[2].toUpperCase() : 'FS';
        var lag = (m && m[3]) ? parseInt(m[3], 10) : 0;
        var predId = nameToId[predName];
        if (predId && predId !== t.id) t.dependencies.push({ predecessorId: predId, type: predType, lagDays: lag || 0 });
        else if (predName) errors.push('Could not match predecessor "' + part + '" for task "' + t.name + '".');
      });
      delete t._predText;
    });

    if (!newTasks.length) { CG.Toast.show('Nothing to import.', 'error'); return; }

    S.commitChange(project.id, function (proj) {
      newCustomDefs.forEach(function (d) { proj.customFieldDefs.push(d); });
      newTasks.forEach(function (t) { proj.tasks.push(t); });
    });

    CG.Toast.show('Imported ' + newTasks.length + ' row(s).' + (errors.length ? ' ' + errors.length + ' warning(s) — see console.' : ''), errors.length ? 'error' : 'success');
    if (errors.length) console.warn('Import warnings:\n' + errors.join('\n'));
    closeWizard();
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  return { init: init, openFilePicker: openFilePicker };
})();
