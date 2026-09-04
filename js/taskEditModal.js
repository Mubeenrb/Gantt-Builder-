window.CG = window.CG || {};

CG.TaskModal = (function () {
  var S = CG.State, D = CG.Dates, Deps = CG.Deps;
  var SWATCHES = ['#1976d2', '#ef6c00', '#2e7d32', '#7b1fa2', '#d32f2f', '#00897b', '#5d4037', '#546e7a', '#c2185b', '#fbc02d'];

  var pendingDeps = [];
  var pendingCustom = {};
  var currentTaskId = null;

  function open(taskId) {
    var project = S.getActiveProject();
    var task = S.findTask(project, taskId);
    if (!task) return;
    currentTaskId = taskId;
    pendingDeps = (task.dependencies || []).map(function (d) { return Object.assign({}, d); });
    pendingCustom = Object.assign({}, task.customFields || {});

    var backdrop = document.getElementById('task-modal-backdrop');
    var modal = document.getElementById('task-modal');
    modal.innerHTML = buildHtml(task, project);
    backdrop.classList.remove('hidden');

    wireStatic(task, project);
    renderDepList(task, project);
    renderCustomFields(task, project);

    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.getElementById('task-modal-close').onclick = close;
    document.getElementById('task-modal-cancel').onclick = close;
    document.getElementById('task-modal-save').onclick = function () { save(project); };
    document.getElementById('task-modal-delete').onclick = function () {
      if (confirm('Delete "' + task.name + '"? This also deletes its sub-tasks. This can be undone with Ctrl+Z.')) {
        S.deleteTask(project.id, task.id);
        close();
      }
    };
  }

  function close() {
    document.getElementById('task-modal-backdrop').classList.add('hidden');
    currentTaskId = null;
  }

  function buildHtml(task, project) {
    var isMilestone = task.type === 'milestone';
    return '' +
      '<span class="close-x" id="task-modal-close">&times;</span>' +
      '<h2>Edit ' + (isMilestone ? 'Milestone' : 'Task') + '</h2>' +
      '<div class="form-row"><label>Name</label><input type="text" id="f-name" value="' + escapeAttr(task.name) + '"></div>' +
      '<div class="form-row-inline">' +
      '<div class="form-row"><label>Type</label><select id="f-type"><option value="task"' + (!isMilestone ? ' selected' : '') + '>Task</option><option value="milestone"' + (isMilestone ? ' selected' : '') + '>Milestone</option></select></div>' +
      '<div class="form-row"><label>Category</label><select id="f-category">' + categoryOptions(project, task.categoryId) + '</select></div>' +
      '</div>' +
      '<div class="form-row-inline">' +
      '<div class="form-row"><label>' + (isMilestone ? 'Date' : 'Start') + '</label><input type="date" id="f-start" value="' + task.start + '"></div>' +
      '<div class="form-row" id="f-end-row" style="' + (isMilestone ? 'display:none' : '') + '"><label>End</label><input type="date" id="f-end" value="' + task.end + '"></div>' +
      '</div>' +
      '<div class="form-row-inline">' +
      '<div class="form-row"><label>Progress %</label><input type="number" id="f-progress" min="0" max="100" value="' + (task.progress || 0) + '"></div>' +
      '<div class="form-row"><label>Assignee / Owner</label><input type="text" id="f-assignee" value="' + escapeAttr(task.assignee || '') + '"></div>' +
      '</div>' +
      '<div class="form-row-inline">' +
      '<div class="form-row"><label>Budget</label><input type="number" id="f-budget" value="' + (task.budget != null ? task.budget : '') + '"></div>' +
      '<div class="form-row"><label>Actual Cost</label><input type="number" id="f-actualCost" value="' + (task.actualCost != null ? task.actualCost : '') + '"></div>' +
      '</div>' +
      '<div class="form-row"><label>Color override</label><div class="color-swatches" id="f-color-swatches"></div></div>' +
      '<div class="form-row"><label>Notes</label><textarea id="f-notes">' + escapeHtml(task.notes || '') + '</textarea></div>' +
      '<h3>Dependencies</h3>' +
      '<div class="dep-list" id="dep-list"></div>' +
      '<button class="btn" id="dep-add" type="button">+ Add dependency</button>' +
      '<div id="custom-fields-section"></div>' +
      '<div class="form-actions">' +
      '<button class="btn btn-danger" id="task-modal-delete" type="button">Delete</button>' +
      '<span style="flex:1"></span>' +
      '<button class="btn" id="task-modal-cancel" type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="task-modal-save" type="button">Save</button>' +
      '</div>';
  }

  function categoryOptions(project, selectedId) {
    var html = '<option value="">(none)</option>';
    project.categories.forEach(function (c) {
      html += '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
    });
    return html;
  }

  function wireStatic(task, project) {
    document.getElementById('f-type').addEventListener('change', function (ev) {
      var isMilestone = ev.target.value === 'milestone';
      document.getElementById('f-end-row').style.display = isMilestone ? 'none' : '';
    });

    var swatchWrap = document.getElementById('f-color-swatches');
    var selectedColor = task.color;
    function renderSwatches() {
      swatchWrap.innerHTML = '';
      var noneSw = document.createElement('div');
      noneSw.className = 'color-swatch' + (!selectedColor ? ' selected' : '');
      noneSw.style.background = 'repeating-linear-gradient(45deg,#ccc,#ccc 3px,#fff 3px,#fff 6px)';
      noneSw.title = 'Use category color';
      noneSw.onclick = function () { selectedColor = null; renderSwatches(); };
      swatchWrap.appendChild(noneSw);
      SWATCHES.forEach(function (c) {
        var sw = document.createElement('div');
        sw.className = 'color-swatch' + (selectedColor === c ? ' selected' : '');
        sw.style.background = c;
        sw.onclick = function () { selectedColor = c; renderSwatches(); };
        swatchWrap.appendChild(sw);
      });
    }
    renderSwatches();
    swatchWrap.getSelectedColor = function () { return selectedColor; };
    document.getElementById('task-modal').dataset._colorRef = '';
    document.getElementById('task-modal')._getColor = function () { return selectedColor; };

    document.getElementById('dep-add').addEventListener('click', function () {
      var candidate = project.tasks.find(function (t) {
        return t.id !== task.id && !pendingDeps.some(function (d) { return d.predecessorId === t.id; });
      });
      if (!candidate) { CG.Toast.show('No other tasks available to depend on.', 'error'); return; }
      pendingDeps.push({ predecessorId: candidate.id, type: 'FS', lagDays: 0 });
      renderDepList(task, project);
    });
  }

  function renderDepList(task, project) {
    var wrap = document.getElementById('dep-list');
    wrap.innerHTML = '';
    if (!pendingDeps.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:var(--text-muted)';
      empty.textContent = 'No predecessors.';
      wrap.appendChild(empty);
    }
    pendingDeps.forEach(function (dep, idx) {
      var row = document.createElement('div');
      row.className = 'dep-row';

      var sel = document.createElement('select');
      sel.className = 'dep-predecessor';
      project.tasks.filter(function (t) { return t.id !== task.id; }).forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.id; opt.textContent = t.name;
        if (t.id === dep.predecessorId) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { dep.predecessorId = sel.value; });

      var typeSel = document.createElement('select');
      typeSel.className = 'dep-type';
      Deps.TYPES.forEach(function (ty) {
        var opt = document.createElement('option'); opt.value = ty; opt.textContent = ty;
        if (ty === dep.type) opt.selected = true;
        typeSel.appendChild(opt);
      });
      typeSel.addEventListener('change', function () { dep.type = typeSel.value; });

      var lagInput = document.createElement('input');
      lagInput.type = 'number'; lagInput.className = 'dep-lag'; lagInput.value = dep.lagDays || 0;
      lagInput.title = 'Lag (days)';
      lagInput.addEventListener('change', function () { dep.lagDays = Number(lagInput.value) || 0; });

      var remove = document.createElement('span');
      remove.className = 'remove-dep'; remove.textContent = '✕';
      remove.addEventListener('click', function () { pendingDeps.splice(idx, 1); renderDepList(task, project); });

      row.appendChild(sel); row.appendChild(typeSel); row.appendChild(lagInput); row.appendChild(remove);
      wrap.appendChild(row);
    });
  }

  function renderCustomFields(task, project) {
    var section = document.getElementById('custom-fields-section');
    section.innerHTML = '';
    if (!project.customFieldDefs.length) return;
    var h = document.createElement('h3'); h.textContent = 'Custom Fields'; section.appendChild(h);
    project.customFieldDefs.forEach(function (def) {
      var row = document.createElement('div');
      row.className = 'form-row';
      var label = document.createElement('label'); label.textContent = def.name; row.appendChild(label);
      var input;
      if (def.type === 'select') {
        input = document.createElement('select');
        (def.options || []).forEach(function (o) {
          var opt = document.createElement('option'); opt.value = o; opt.textContent = o;
          if (pendingCustom[def.id] === o) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = def.type === 'number' ? 'number' : (def.type === 'date' ? 'date' : 'text');
        input.value = pendingCustom[def.id] != null ? pendingCustom[def.id] : '';
      }
      input.addEventListener('change', function () { pendingCustom[def.id] = input.value; });
      row.appendChild(input);
      section.appendChild(row);
    });
  }

  function save(project) {
    var task = S.findTask(project, currentTaskId);
    if (!task) { close(); return; }

    var type = document.getElementById('f-type').value;
    var start = document.getElementById('f-start').value;
    var end = type === 'milestone' ? start : (document.getElementById('f-end').value || start);
    if (D.isBefore(end, start)) end = start;

    // Validate the edited dependency list won't introduce a cycle before committing.
    var simulatedTasks = project.tasks.map(function (t) {
      if (t.id !== task.id) return t;
      return Object.assign({}, t, { dependencies: pendingDeps });
    });
    if (Deps.hasAnyCycle(simulatedTasks)) {
      CG.Toast.show('These dependencies would create a circular reference. Fix them before saving.', 'error');
      return;
    }

    var color = document.getElementById('task-modal')._getColor ? document.getElementById('task-modal')._getColor() : task.color;

    var changes = {
      name: document.getElementById('f-name').value.trim() || 'Untitled',
      type: type,
      categoryId: document.getElementById('f-category').value || null,
      start: start, end: end,
      progress: Math.max(0, Math.min(100, Number(document.getElementById('f-progress').value) || 0)),
      assignee: document.getElementById('f-assignee').value,
      budget: document.getElementById('f-budget').value === '' ? null : Number(document.getElementById('f-budget').value),
      actualCost: document.getElementById('f-actualCost').value === '' ? null : Number(document.getElementById('f-actualCost').value),
      color: color,
      notes: document.getElementById('f-notes').value,
      dependencies: pendingDeps,
      customFields: pendingCustom
    };
    S.updateTask(project.id, task.id, changes);
    close();
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  return { open: open, close: close };
})();
