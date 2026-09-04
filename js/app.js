window.CG = window.CG || {};

CG.Toast = (function () {
  function show(message, type) {
    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 3400);
  }
  return { show: show };
})();

CG.applyTheme = function () {
  var project = CG.State.getActiveProject();
  var theme = project ? project.settings.theme : 'light';
  var root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else if (theme === 'light') root.setAttribute('data-theme', 'light');
  else { // system
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
};

(function () {
  var S = CG.State;
  var scrollSyncing = false;
  var cycleWarned = false;

  function formatMoney(n) { return n == null ? '0' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  function renderStatusbar() {
    var bar = document.getElementById('statusbar-stats');
    var project = S.getActiveProject();
    if (!project) { bar.textContent = 'No project open — click "+ Project" to start, or open a saved .json file.'; return; }
    var leaves = project.tasks.filter(function (t) { return !project.tasks.some(function (x) { return x.parentId === t.id; }); });
    var tasks = leaves.filter(function (t) { return t.type === 'task'; }).length;
    var milestones = leaves.filter(function (t) { return t.type === 'milestone'; }).length;
    var budget = leaves.reduce(function (s, t) { return s + (t.budget || 0); }, 0);
    var today = CG.Dates.todayISO();
    var overdue = leaves.filter(function (t) { return CG.Dates.isBefore(t.end, today) && (t.progress || 0) < 100; }).length;
    var text = tasks + ' tasks • ' + milestones + ' milestones • Budget ' + formatMoney(budget) + ' • ' + overdue + ' overdue';

    var ui = S.getUi();
    if (ui.criticalPathOn) {
      var cpm = CG.CPM.compute(project.tasks);
      if (cpm.hasCycle) {
        text += '  —  ⚠ Dependency cycle detected: critical path cannot be computed until it is resolved.';
        if (!cycleWarned) { CG.Toast.show('Circular dependency detected — critical path highlighting is unavailable until it is fixed.', 'error'); cycleWarned = true; }
      } else {
        cycleWarned = false;
      }
    }
    bar.textContent = text;
  }

  function renderSaveStatus() {
    var el = document.getElementById('save-status');
    var project = S.getActiveProject();
    if (!project) { el.textContent = ''; return; }
    el.textContent = S.isDirty(S.getActiveProjectId())
      ? 'Autosaved locally · not yet exported to file'
      : 'Saved to file';
  }

  function renderToolbarState() {
    var project = S.getActiveProject();
    var id = S.getActiveProjectId();
    var ui = S.getUi();
    document.getElementById('btn-undo').disabled = !id || !S.canUndo(id);
    document.getElementById('btn-redo').disabled = !id || !S.canRedo(id);
    document.getElementById('btn-add-task').disabled = !project;
    document.getElementById('btn-add-milestone').disabled = !project;
    document.getElementById('btn-indent').disabled = !ui.selectedTaskId;
    document.getElementById('btn-outdent').disabled = !ui.selectedTaskId;
    document.getElementById('btn-delete-task').disabled = !ui.selectedTaskId;
    document.getElementById('btn-critical-path').classList.toggle('on', ui.criticalPathOn);
    document.getElementById('btn-today-marker').classList.toggle('on', ui.showTodayMarker);
    document.getElementById('zoom-select').value = project ? project.settings.defaultZoom : 'month';
    document.getElementById('zoom-select').disabled = !project;
    ['btn-export-excel', 'btn-export-image', 'btn-import', 'btn-save-file', 'btn-settings'].forEach(function (id2) {
      document.getElementById(id2).disabled = !project;
    });
  }

  function renderAll() {
    CG.applyTheme();
    CG.Projects.render();
    CG.TaskTable.render();
    CG.GanttChart.render();
    renderToolbarState();
    renderStatusbar();
    renderSaveStatus();
  }

  S.subscribe(renderAll);

  document.addEventListener('DOMContentLoaded', function () {
    S.init();
    CG.ExcelImport.init();
    wireToolbar();
    wireScrollSync();
    wirePanelResizer();
    wireKeyboard();
    renderAll();
  });

  function wireToolbar() {
    document.getElementById('btn-new-project').addEventListener('click', function () { CG.Projects.openNewProjectModal(); });
    document.getElementById('btn-settings').addEventListener('click', function () { CG.Settings.open(); });

    document.getElementById('btn-add-task').addEventListener('click', function () {
      var id = S.getActiveProjectId(); if (!id) return;
      var newId = S.createTask(id, { name: 'New Task' });
      S.setSelectedTask(newId);
    });
    document.getElementById('btn-add-milestone').addEventListener('click', function () {
      var id = S.getActiveProjectId(); if (!id) return;
      var newId = S.createTask(id, { type: 'milestone', name: 'New Milestone' });
      S.setSelectedTask(newId);
    });
    document.getElementById('btn-indent').addEventListener('click', function () {
      var id = S.getActiveProjectId(); var sel = S.getUi().selectedTaskId;
      if (id && sel) S.indentTask(id, sel);
    });
    document.getElementById('btn-outdent').addEventListener('click', function () {
      var id = S.getActiveProjectId(); var sel = S.getUi().selectedTaskId;
      if (id && sel) S.outdentTask(id, sel);
    });
    document.getElementById('btn-delete-task').addEventListener('click', function () { deleteSelected(); });

    document.getElementById('btn-undo').addEventListener('click', function () { var id = S.getActiveProjectId(); if (id) S.undo(id); });
    document.getElementById('btn-redo').addEventListener('click', function () { var id = S.getActiveProjectId(); if (id) S.redo(id); });

    document.getElementById('zoom-select').addEventListener('change', function (ev) {
      var id = S.getActiveProjectId(); if (id) S.updateSettings(id, { defaultZoom: ev.target.value });
    });
    document.getElementById('btn-today').addEventListener('click', scrollToToday);
    document.getElementById('btn-today-marker').addEventListener('click', function () { S.toggleTodayMarker(); });
    document.getElementById('btn-critical-path').addEventListener('click', function () { S.toggleCriticalPath(); });

    document.getElementById('btn-import').addEventListener('click', function () { CG.ExcelImport.openFilePicker(); });
    document.getElementById('btn-export-excel').addEventListener('click', function () {
      CG.ExportOptions.openForExcelExport();
    });
    document.getElementById('btn-export-image').addEventListener('click', function () {
      CG.ExportOptions.openForImageExport();
    });

    document.getElementById('btn-save-file').addEventListener('click', function () {
      var project = S.getActiveProject(); if (!project) return;
      CG.Persistence.exportProjectToFile(project).then(function (res) {
        if (res.ok) { S.markSaved(project.id); CG.Toast.show('Saved to ' + res.name, 'success'); }
      }).catch(function (e) { CG.Toast.show('Save failed: ' + e.message, 'error'); });
    });
    document.getElementById('btn-load-file').addEventListener('click', function () { document.getElementById('file-input-project').click(); });
    document.getElementById('file-input-project').addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      CG.Persistence.importProjectFromFile(file).then(function (project) {
        S.openProjectFromData(project, { freshlyLoaded: true });
        CG.Toast.show('Loaded "' + project.name + '"', 'success');
      }).catch(function (e) { CG.Toast.show('Could not load file: ' + e.message, 'error'); });
    });
  }

  function deleteSelected() {
    var id = S.getActiveProjectId(); var sel = S.getUi().selectedTaskId;
    if (!id || !sel) return;
    var project = S.getProject(id);
    var t = S.findTask(project, sel);
    if (!t) return;
    if (confirm('Delete "' + t.name + '"? Sub-tasks will also be deleted. This can be undone with Ctrl+Z.')) {
      S.deleteTask(id, sel);
    }
  }

  function scrollToToday() {
    var layout = CG.GanttChart.getLayout();
    if (!layout) return;
    var x = CG.Layout.dateToX(CG.Dates.todayISO(), layout.range.start, layout.pxPerDay);
    var scroller = document.getElementById('gantt-scroll');
    scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
  }

  function wireScrollSync() {
    var tableScroll = document.getElementById('task-table-scroll');
    var ganttScroll = document.getElementById('gantt-scroll');
    tableScroll.addEventListener('scroll', function () {
      if (scrollSyncing) return;
      scrollSyncing = true; ganttScroll.scrollTop = tableScroll.scrollTop; scrollSyncing = false;
    });
    ganttScroll.addEventListener('scroll', function () {
      if (scrollSyncing) return;
      scrollSyncing = true; tableScroll.scrollTop = ganttScroll.scrollTop; scrollSyncing = false;
    });
  }

  function wirePanelResizer() {
    var resizer = document.getElementById('panel-resizer');
    var panel = document.getElementById('task-table-panel');
    resizer.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      resizer.classList.add('active');
      var startX = ev.clientX, startW = panel.getBoundingClientRect().width;
      function onMove(mv) {
        var w = Math.max(220, startW + (mv.clientX - startX));
        panel.style.width = w + 'px';
      }
      function onUp() {
        resizer.classList.remove('active');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    });
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function wireKeyboard() {
    window.addEventListener('keydown', function (ev) {
      var backdropsOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(function (b) { return !b.classList.contains('hidden'); });
      if (backdropsOpen) return;
      var id = S.getActiveProjectId();
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (id) S.undo(id); return; }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); if (id) S.redo(id); return; }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && !isTypingTarget(ev.target) && S.getUi().selectedTaskId) {
        ev.preventDefault(); deleteSelected();
      }
    });
  }
})();
