window.CG = window.CG || {};

CG.TaskTable = (function () {
  var S = CG.State, D = CG.Dates;

  function money(v) {
    if (v === null || v === undefined || v === '') return '';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function builtinColumns() {
    return [
      { id: 'type', label: 'Type', width: 78, kind: 'readonly', getValue: function (t) { return t.type === 'milestone' ? 'Milestone' : 'Task'; } },
      {
        id: 'category', label: 'Category', width: 130, kind: 'select',
        options: function (project) { return project.categories.map(function (c) { return { value: c.id, label: c.name }; }); },
        getValue: function (t) { return t.categoryId || ''; },
        setValue: function (t, v) { return { categoryId: v || null }; }
      },
      {
        id: 'start', label: 'Start', width: 118, kind: 'date',
        getValue: function (t) { return t.start; },
        setValue: function (t, v) { return { start: v, end: t.type === 'milestone' ? v : (D.isBefore(t.end, v) ? v : t.end) }; },
        rollup: function (r) { return r.start; }
      },
      {
        id: 'end', label: 'End', width: 118, kind: 'date',
        disabledFor: function (t) { return t.type === 'milestone'; },
        getValue: function (t) { return t.end; },
        setValue: function (t, v) { return { end: v }; },
        rollup: function (r) { return r.end; }
      },
      {
        id: 'duration', label: 'Duration (d)', width: 90, kind: 'duration',
        disabledFor: function (t) { return t.type === 'milestone'; },
        getValue: function (t) { return D.duration(t); },
        rollup: function (r) { return D.diffDays(r.end, r.start) + 1; }
      },
      {
        id: 'progress', label: 'Progress', width: 130, kind: 'progress',
        getValue: function (t) { return t.progress; },
        setValue: function (t, v) { return { progress: Math.max(0, Math.min(100, Number(v) || 0)) }; },
        rollup: function (r) { return r.progress; }
      },
      {
        id: 'assignee', label: 'Assignee', width: 110, kind: 'text',
        getValue: function (t) { return t.assignee || ''; },
        setValue: function (t, v) { return { assignee: v }; }
      },
      {
        id: 'budget', label: 'Budget', width: 110, kind: 'number', display: money,
        getValue: function (t) { return t.budget; },
        setValue: function (t, v) { return { budget: v === '' ? null : Number(v) }; }
      },
      {
        id: 'actualCost', label: 'Actual Cost', width: 110, kind: 'number', display: money,
        getValue: function (t) { return t.actualCost; },
        setValue: function (t, v) { return { actualCost: v === '' ? null : Number(v) }; }
      },
      {
        id: 'dependencies', label: 'Predecessors', width: 170, kind: 'clickReadonly',
        getValue: function (t, project) {
          var byId = {}; project.tasks.forEach(function (x) { byId[x.id] = x; });
          return (t.dependencies || []).map(function (d) { return CG.Deps.formatDependency(d, byId); }).join(', ');
        }
      },
      {
        id: 'notes', label: 'Notes', width: 200, kind: 'clickReadonly',
        getValue: function (t) { return t.notes || ''; }
      }
    ];
  }

  function customFieldColumns(project) {
    return project.customFieldDefs.map(function (def) {
      return {
        id: def.id, label: def.name, width: 110, kind: def.type === 'select' ? 'customSelect' : def.type, isCustom: true, def: def,
        getValue: function (t) { return t.customFields ? t.customFields[def.id] : undefined; },
        setValue: function (t, v) {
          var cf = Object.assign({}, t.customFields || {});
          cf[def.id] = def.type === 'number' ? (v === '' ? '' : Number(v)) : v;
          return { customFields: cf };
        }
      };
    });
  }

  function getAllColumns(project) { return builtinColumns().concat(customFieldColumns(project)); }

  function getVisibleColumnDefs(project) {
    var all = getAllColumns(project);
    var visibleIds = project.settings.visibleColumns || [];
    return all.filter(function (c) { return visibleIds.indexOf(c.id) !== -1; });
  }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // Row reordering via drag-and-drop. Only reorders among siblings that
  // already share the same parent — dragging never re-parents a task, so
  // the drop target is rejected (no indicator, dropEffect 'none') whenever
  // its parentId doesn't match the dragged row's. Indent/Outdent remain the
  // way to change hierarchy level.
  var dragState = { taskId: null, parentId: null };

  function clearDropIndicators() {
    Array.prototype.forEach.call(document.querySelectorAll('#task-table-body tr.drop-above, #task-table-body tr.drop-below'), function (row) {
      row.classList.remove('drop-above', 'drop-below');
    });
  }

  function bindDragHandle(grip, tr, task) {
    grip.addEventListener('dragstart', function (ev) {
      dragState.taskId = task.id;
      dragState.parentId = task.parentId;
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', task.id);
      try { ev.dataTransfer.setDragImage(tr, 12, 12); } catch (e) { /* not all browsers support a custom drag image source */ }
      tr.classList.add('dragging-row');
    });
    grip.addEventListener('dragend', function () {
      tr.classList.remove('dragging-row');
      clearDropIndicators();
      dragState.taskId = null;
    });
  }

  function bindRowDragDrop(tr, task, project) {
    tr.addEventListener('dragover', function (ev) {
      if (!dragState.taskId || dragState.taskId === task.id || task.parentId !== dragState.parentId) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      var rect = tr.getBoundingClientRect();
      var before = (ev.clientY - rect.top) < rect.height / 2;
      clearDropIndicators();
      tr.classList.add(before ? 'drop-above' : 'drop-below');
      tr.dataset.dropBefore = before ? '1' : '0';
    });
    tr.addEventListener('dragleave', function (ev) {
      if (!tr.contains(ev.relatedTarget)) tr.classList.remove('drop-above', 'drop-below');
    });
    tr.addEventListener('drop', function (ev) {
      ev.preventDefault();
      var draggedId = dragState.taskId;
      var before = tr.dataset.dropBefore === '1';
      clearDropIndicators();
      if (!draggedId || draggedId === task.id || task.parentId !== dragState.parentId) return;
      S.reorderTaskAmongSiblings(project.id, draggedId, task.id, before);
    });
  }

  // A <colgroup> forces the header and body rows to share the exact same
  // column widths regardless of cell content — without it, browsers running
  // the table's auto layout algorithm can size the header row's columns
  // differently from the body row's (e.g. once a cell contains flex-laid-out
  // children), producing a visibly misaligned/duplicated-looking header.
  var HANDLE_COL_W = 22;
  var NAME_COL_DEFAULT_W = 220;
  var MIN_COL_W = { name: 120, other: 56 };

  // Column widths are user-adjustable (drag the handle at the right edge of
  // a header cell) and persisted per project in settings.columnWidths, keyed
  // by column id ('name' for the always-present Task Name column). Falls
  // back to the built-in default width whenever nothing's been customized.
  function getColWidth(project, colId, defaultWidth) {
    var saved = project.settings.columnWidths;
    return (saved && saved[colId]) || defaultWidth;
  }

  function setColWidth(project, colId, width, minWidth) {
    var cur = Object.assign({}, project.settings.columnWidths || {});
    cur[colId] = Math.max(minWidth, Math.round(width));
    S.updateSettings(project.id, { columnWidths: cur });
  }

  function bindColumnResize(handleEl, colIndex, colId, project, minWidth) {
    handleEl.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var colEl = document.querySelectorAll('#task-table-colgroup col')[colIndex];
      var startX = ev.clientX;
      var startW = colEl.getBoundingClientRect().width;
      handleEl.classList.add('active');
      function onMove(mv) {
        var w = Math.max(minWidth, startW + (mv.clientX - startX));
        colEl.style.width = w + 'px';
      }
      function onUp(up) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        handleEl.classList.remove('active');
        setColWidth(project, colId, startW + (up.clientX - startX), minWidth);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function renderColgroup(project) {
    var colgroup = document.getElementById('task-table-colgroup');
    colgroup.innerHTML = '';
    var handleCol = el('col', null); handleCol.style.width = HANDLE_COL_W + 'px';
    colgroup.appendChild(handleCol);
    var nameCol = el('col', null); nameCol.style.width = getColWidth(project, 'name', NAME_COL_DEFAULT_W) + 'px';
    colgroup.appendChild(nameCol);
    getVisibleColumnDefs(project).forEach(function (col) {
      var c = el('col', null); c.style.width = getColWidth(project, col.id, col.width) + 'px';
      colgroup.appendChild(c);
    });
  }

  function renderHead() {
    var thead = document.getElementById('task-table-head');
    var project = S.getActiveProject();
    thead.innerHTML = '';
    if (!project) return;
    var tr = document.createElement('tr');
    var thHandle = el('th', null); thHandle.innerHTML = '&nbsp;'; tr.appendChild(thHandle);

    var thName = el('th', 'resizable-th'); thName.textContent = 'Task Name';
    var nameResize = el('span', 'col-resize-handle');
    bindColumnResize(nameResize, 1, 'name', project, MIN_COL_W.name);
    thName.appendChild(nameResize);
    tr.appendChild(thName);

    getVisibleColumnDefs(project).forEach(function (col, i) {
      var th = el('th', 'resizable-th'); th.textContent = col.label;
      var resize = el('span', 'col-resize-handle');
      bindColumnResize(resize, i + 2, col.id, project, MIN_COL_W.other);
      th.appendChild(resize);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }

  function renderBody() {
    var tbody = document.getElementById('task-table-body');
    var project = S.getActiveProject();
    tbody.innerHTML = '';
    if (!project) return;
    var ui = S.getUi();
    var cols = getVisibleColumnDefs(project);
    var rows = S.getVisibleTasks(project);

    rows.forEach(function (row) {
      var t = row.task;
      var tr = el('tr', (t.type === 'milestone' ? 'milestone-row ' : '') + (ui.selectedTaskId === t.id ? 'selected' : ''));
      tr.dataset.taskId = t.id;
      tr.addEventListener('click', function () { S.setSelectedTask(t.id); });
      tr.addEventListener('dblclick', function () { CG.TaskModal.open(t.id); });
      bindRowDragDrop(tr, t, project);

      var tdHandle = el('td', 'col-handle');
      var grip = el('span', 'row-drag-handle');
      grip.textContent = '⋮⋮';
      grip.title = 'Drag to reorder';
      grip.draggable = true;
      bindDragHandle(grip, tr, t, project);
      tdHandle.appendChild(grip);
      tr.appendChild(tdHandle);

      var tdName = el('td', 'col-name');
      var nameInner = el('div', 'name-cell-inner');
      tdName.appendChild(nameInner);
      var spacer = el('span', 'indent-spacer'); spacer.style.width = (row.depth * 16) + 'px'; spacer.style.display = 'inline-block';
      nameInner.appendChild(spacer);
      if (row.hasChildren) {
        var toggle = el('span', 'collapse-toggle');
        toggle.textContent = t.collapsed ? '▸' : '▾';
        toggle.addEventListener('click', function (ev) { ev.stopPropagation(); S.setCollapsed(project.id, t.id, !t.collapsed); });
        nameInner.appendChild(toggle);
      } else {
        var pad = el('span', 'collapse-toggle'); nameInner.appendChild(pad);
      }
      var category = project.categories.find(function (c) { return c.id === t.categoryId; });
      var color = t.color || (category ? category.color : '#90a4ae');
      var dot = el('span', 'color-dot'); dot.style.background = color; nameInner.appendChild(dot);

      if (t.type === 'milestone') {
        var diamond = el('span'); diamond.textContent = '◆'; diamond.style.color = color; diamond.style.fontSize = '10px'; nameInner.appendChild(diamond);
      }

      var nameSpan = el('span', 'name-text');
      nameSpan.contentEditable = 'true';
      nameSpan.textContent = t.name;
      nameSpan.addEventListener('click', function (ev) { ev.stopPropagation(); });
      nameSpan.addEventListener('blur', function () {
        var v = nameSpan.textContent.trim() || 'Untitled';
        if (v !== t.name) S.updateTask(project.id, t.id, { name: v });
      });
      nameSpan.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); nameSpan.blur(); }
      });
      nameInner.appendChild(nameSpan);
      tr.appendChild(tdName);

      var rollup = row.hasChildren ? S.getRollupRange(project, t) : null;

      cols.forEach(function (col) {
        var td = el('td');
        renderCell(td, col, t, project, rollup, row.hasChildren);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function renderCell(td, col, t, project, rollup, hasChildren) {
    var readOnlyRollup = hasChildren && col.rollup;
    if (col.kind === 'readonly') {
      td.textContent = col.getValue(t, project);
      return;
    }
    if (col.kind === 'clickReadonly') {
      td.textContent = col.getValue(t, project);
      td.classList.add('editable');
      td.title = 'Click to edit in task details';
      td.addEventListener('click', function (ev) { ev.stopPropagation(); CG.TaskModal.open(t.id); });
      return;
    }
    if (readOnlyRollup) {
      var val = col.rollup(rollup);
      td.textContent = col.display ? col.display(val) : (col.id === 'progress' ? val + '%' : val);
      td.title = 'Computed from sub-tasks';
      td.style.color = 'var(--text-muted)';
      return;
    }
    var disabled = col.disabledFor && col.disabledFor(t);
    if (disabled) { td.textContent = '—'; td.style.color = 'var(--text-faint)'; return; }

    if (col.kind === 'select' || col.kind === 'customSelect') {
      var select = el('select', 'cell-input');
      var opts = col.kind === 'customSelect' ? (col.def.options || []).map(function (o) { return { value: o, label: o }; }) : col.options(project);
      if (col.id === 'category') {
        var noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = '(none)'; select.appendChild(noneOpt);
      }
      opts.forEach(function (o) {
        var opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label;
        if (o.value === col.getValue(t)) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('click', function (ev) { ev.stopPropagation(); });
      select.addEventListener('change', function () { S.updateTask(project.id, t.id, col.setValue(t, select.value)); });
      td.appendChild(select);
      return;
    }

    if (col.kind === 'progress') {
      var wrap = el('span');
      var track = el('span', 'progress-mini-track');
      var fill = el('span', 'progress-mini-fill'); fill.style.width = (t.progress || 0) + '%';
      track.appendChild(fill); wrap.appendChild(track);
      var input = el('input', 'cell-input'); input.type = 'number'; input.min = 0; input.max = 100; input.style.width = '40px'; input.style.display = 'inline-block';
      input.value = t.progress || 0;
      input.addEventListener('click', function (ev) { ev.stopPropagation(); });
      input.addEventListener('change', function () { S.updateTask(project.id, t.id, col.setValue(t, input.value)); });
      wrap.appendChild(input);
      td.appendChild(wrap);
      return;
    }

    if (col.kind === 'duration') {
      var dInput = el('input', 'cell-input'); dInput.type = 'number'; dInput.min = 1; dInput.value = col.getValue(t);
      dInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      dInput.addEventListener('change', function () { S.setTaskDuration(project.id, t.id, dInput.value); });
      td.appendChild(dInput);
      return;
    }

    var input2 = el('input', 'cell-input');
    input2.type = col.kind === 'date' ? 'date' : (col.kind === 'number' ? 'number' : 'text');
    var raw = col.getValue(t);
    input2.value = raw === null || raw === undefined ? '' : raw;
    input2.addEventListener('click', function (ev) { ev.stopPropagation(); });
    input2.addEventListener('change', function () { S.updateTask(project.id, t.id, col.setValue(t, input2.value)); });
    td.appendChild(input2);
  }

  function render() {
    var project = S.getActiveProject();
    document.documentElement.style.setProperty('--row-height', project ? project.settings.rowHeight + 'px' : '32px');
    document.documentElement.style.setProperty('--font-size', project ? project.settings.fontSize + 'px' : '13px');
    if (project) renderColgroup(project);
    renderHead();
    renderBody();
  }

  return { render: render, getAllColumns: getAllColumns, getVisibleColumnDefs: getVisibleColumnDefs, builtinColumns: builtinColumns };
})();
