window.CG = window.CG || {};

CG.State = (function () {
  var P = CG.Persistence, Id = CG.Id, Deps = CG.Deps;
  var UNDO_CAP = 100;

  var openProjects = {}; // id -> { project, unsavedChanges, undoStack, redoStack }
  var activeProjectId = null;
  var ui = { selectedTaskId: null, criticalPathOn: false, showTodayMarker: true, panelSplitPx: 560 };
  var listeners = [];

  function subscribe(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  function persist() {
    var slim = {};
    Object.keys(openProjects).forEach(function (id) {
      slim[id] = { project: openProjects[id].project, unsavedChanges: openProjects[id].unsavedChanges };
    });
    P.saveAppStateDebounced({ openProjects: slim, activeProjectId: activeProjectId, savedAt: new Date().toISOString() });
  }

  function defaultSettings() {
    return {
      weekStart: 'mon', dateFormat: 'dd/MM/yyyy',
      rowHeight: 32, barHeight: 20, fontSize: 13, theme: 'light',
      visibleColumns: ['category', 'start', 'end', 'duration', 'progress'],
      defaultZoom: 'month', columnWidths: {}
    };
  }

  function blankProject(name) {
    return {
      id: Id.uuid(), name: name || 'New Project',
      categories: [
        { id: Id.uuid(), name: 'Procurement', color: '#1976d2' },
        { id: Id.uuid(), name: 'Civil', color: '#ef6c00' },
        { id: Id.uuid(), name: 'Installation', color: '#2e7d32' },
        { id: Id.uuid(), name: 'Commissioning', color: '#7b1fa2' }
      ],
      customFieldDefs: [],
      tasks: [],
      settings: defaultSettings()
    };
  }

  function init() {
    var saved = P.loadAppState();
    if (saved && saved.openProjects && Object.keys(saved.openProjects).length) {
      Object.keys(saved.openProjects).forEach(function (id) {
        openProjects[id] = {
          project: saved.openProjects[id].project,
          unsavedChanges: !!saved.openProjects[id].unsavedChanges,
          undoStack: [], redoStack: []
        };
      });
      activeProjectId = saved.activeProjectId && openProjects[saved.activeProjectId] ? saved.activeProjectId : Object.keys(openProjects)[0];
    } else {
      var seed = P.loadSeedProject();
      if (seed) {
        openProjects[seed.id] = { project: seed, unsavedChanges: false, undoStack: [], redoStack: [] };
        activeProjectId = seed.id;
      }
    }
    notify();
  }

  function getOpenProjectIds() { return Object.keys(openProjects); }
  function getEntry(projectId) { return openProjects[projectId]; }
  function getProject(projectId) { var e = openProjects[projectId]; return e ? e.project : null; }
  function getActiveProject() { return activeProjectId ? getProject(activeProjectId) : null; }
  function getActiveProjectId() { return activeProjectId; }
  function isDirty(projectId) { var e = openProjects[projectId]; return e ? e.unsavedChanges : false; }
  function getUi() { return ui; }

  function switchActive(projectId) {
    if (!openProjects[projectId]) return;
    activeProjectId = projectId;
    ui.selectedTaskId = null;
    persist();
    notify();
  }

  function renameProject(projectId, newName) {
    var name = (newName || '').trim();
    if (!name) return;
    commitChange(projectId, function (project) { project.name = name; });
  }

  function openProjectFromData(project, opts) {
    if (!project.id) project.id = Id.uuid();
    if (!project.settings) project.settings = defaultSettings();
    if (!project.customFieldDefs) project.customFieldDefs = [];
    if (!project.categories) project.categories = [];
    openProjects[project.id] = { project: project, unsavedChanges: !(opts && opts.freshlyLoaded), undoStack: [], redoStack: [] };
    activeProjectId = project.id;
    persist();
    notify();
    return project.id;
  }

  function newProject(name) {
    var p = blankProject(name);
    return openProjectFromData(p, { freshlyLoaded: false });
  }

  function closeProject(projectId) {
    delete openProjects[projectId];
    var remaining = Object.keys(openProjects);
    if (activeProjectId === projectId) activeProjectId = remaining.length ? remaining[0] : null;
    persist();
    notify();
  }

  function markSaved(projectId) {
    var e = openProjects[projectId];
    if (e) { e.unsavedChanges = false; persist(); notify(); }
  }

  // ---- Core mutation primitive ----
  function commitChange(projectId, mutateFn) {
    var entry = openProjects[projectId];
    if (!entry) return;
    var snapshot = structuredClone(entry.project);
    entry.undoStack.push(snapshot);
    if (entry.undoStack.length > UNDO_CAP) entry.undoStack.shift();
    entry.redoStack = [];
    mutateFn(entry.project);
    entry.unsavedChanges = true;
    persist();
    notify();
  }

  function undo(projectId) {
    var entry = openProjects[projectId];
    if (!entry || !entry.undoStack.length) return;
    entry.redoStack.push(structuredClone(entry.project));
    entry.project = entry.undoStack.pop();
    entry.unsavedChanges = true;
    persist();
    notify();
  }

  function redo(projectId) {
    var entry = openProjects[projectId];
    if (!entry || !entry.redoStack.length) return;
    entry.undoStack.push(structuredClone(entry.project));
    entry.project = entry.redoStack.pop();
    entry.unsavedChanges = true;
    persist();
    notify();
  }

  function canUndo(projectId) { var e = openProjects[projectId]; return !!(e && e.undoStack.length); }
  function canRedo(projectId) { var e = openProjects[projectId]; return !!(e && e.redoStack.length); }

  // Settings/UI-only changes: persisted, but intentionally NOT pushed onto the undo stack.
  function updateSettings(projectId, partial) {
    var entry = openProjects[projectId];
    if (!entry) return;
    Object.assign(entry.project.settings, partial);
    persist();
    notify();
  }

  function setCollapsed(projectId, taskId, collapsed) {
    var entry = openProjects[projectId];
    if (!entry) return;
    var t = entry.project.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;
    t.collapsed = collapsed;
    persist();
    notify();
  }

  function setSelectedTask(taskId) { ui.selectedTaskId = taskId; notify(); }
  function toggleCriticalPath() { ui.criticalPathOn = !ui.criticalPathOn; notify(); }
  function toggleTodayMarker() { ui.showTodayMarker = !ui.showTodayMarker; notify(); }

  // ---- Task helpers (all go through commitChange) ----
  function blankTask(project, overrides) {
    var base = {
      id: Id.uuid(), parentId: null, order: Id.nextOrder(), type: 'task',
      name: 'New Task', start: CG.Dates.todayISO(), end: CG.Dates.addDays(CG.Dates.todayISO(), 4),
      progress: 0, assignee: '', categoryId: project.categories[0] ? project.categories[0].id : null,
      color: null, dependencies: [], budget: null, actualCost: null, notes: '',
      customFields: {}, collapsed: false
    };
    return Object.assign(base, overrides || {});
  }

  function createTask(projectId, overrides) {
    var newId = Id.uuid();
    commitChange(projectId, function (project) {
      var t = blankTask(project, overrides);
      t.id = newId;
      if (t.type === 'milestone') t.end = t.start;
      project.tasks.push(t);
    });
    return newId;
  }

  function deleteTask(projectId, taskId) {
    commitChange(projectId, function (project) {
      var toDelete = collectSubtreeIds(project.tasks, taskId);
      project.tasks = project.tasks.filter(function (t) { return toDelete.indexOf(t.id) === -1; });
      project.tasks.forEach(function (t) {
        t.dependencies = (t.dependencies || []).filter(function (d) { return toDelete.indexOf(d.predecessorId) === -1; });
      });
    });
    if (ui.selectedTaskId === taskId) ui.selectedTaskId = null;
  }

  function collectSubtreeIds(tasks, rootId) {
    var ids = [rootId];
    var changed = true;
    while (changed) {
      changed = false;
      tasks.forEach(function (t) {
        if (t.parentId && ids.indexOf(t.parentId) !== -1 && ids.indexOf(t.id) === -1) { ids.push(t.id); changed = true; }
      });
    }
    return ids;
  }

  function updateTask(projectId, taskId, changes) {
    commitChange(projectId, function (project) {
      var t = project.tasks.find(function (x) { return x.id === taskId; });
      if (!t) return;
      Object.assign(t, changes);
      if (t.type === 'milestone') t.end = t.start;
      if (CG.Dates.isBefore(t.end, t.start)) t.end = t.start;
    });
  }

  function setTaskDuration(projectId, taskId, durationDays) {
    commitChange(projectId, function (project) {
      var t = project.tasks.find(function (x) { return x.id === taskId; });
      if (!t || t.type === 'milestone') return;
      var d = Math.max(1, Math.round(durationDays));
      t.end = CG.Dates.addDays(t.start, d - 1);
    });
  }

  function moveTaskDates(projectId, taskId, newStart, newEnd) {
    commitChange(projectId, function (project) {
      var t = project.tasks.find(function (x) { return x.id === taskId; });
      if (!t) return;
      t.start = newStart;
      t.end = t.type === 'milestone' ? newStart : newEnd;
    });
  }

  // Reorders a task among its current siblings (dragging a row up/down in
  // the table) — never changes parentId, so it's rejected by the caller
  // (taskTable.js) whenever the drop target belongs to a different parent.
  function reorderTaskAmongSiblings(projectId, taskId, targetTaskId, placeBefore) {
    commitChange(projectId, function (project) {
      var t = findTask(project, taskId);
      var target = findTask(project, targetTaskId);
      if (!t || !target || t.parentId !== target.parentId) return;
      var siblings = project.tasks.filter(function (x) { return x.parentId === target.parentId && x.id !== taskId; })
        .sort(function (a, b) { return a.order - b.order; });
      var idx = siblings.findIndex(function (x) { return x.id === targetTaskId; });
      var prevOrder = placeBefore ? (idx > 0 ? siblings[idx - 1].order : null) : target.order;
      var nextOrder = placeBefore ? target.order : (idx < siblings.length - 1 ? siblings[idx + 1].order : null);
      t.order = Id.orderBetween(prevOrder, nextOrder);
    });
  }

  function indentTask(projectId, taskId) {
    commitChange(projectId, function (project) {
      var siblings = project.tasks.filter(function (t) { return t.parentId === findTask(project, taskId).parentId; })
        .sort(function (a, b) { return a.order - b.order; });
      var idx = siblings.findIndex(function (t) { return t.id === taskId; });
      if (idx <= 0) return; // no previous sibling to become parent
      var newParent = siblings[idx - 1];
      var t = findTask(project, taskId);
      t.parentId = newParent.id;
      var childSiblings = project.tasks.filter(function (x) { return x.parentId === newParent.id; });
      t.order = childSiblings.length ? Math.max.apply(null, childSiblings.map(function (c) { return c.order; })) + 1000 : 1000;
    });
  }

  function outdentTask(projectId, taskId) {
    commitChange(projectId, function (project) {
      var t = findTask(project, taskId);
      if (!t.parentId) return;
      var parent = findTask(project, t.parentId);
      t.parentId = parent ? parent.parentId : null;
      var siblings = project.tasks.filter(function (x) { return x.parentId === t.parentId; });
      t.order = siblings.length ? Math.max.apply(null, siblings.map(function (s) { return s.order; })) + 1000 : 1000;
    });
  }

  function findTask(project, taskId) { return project.tasks.find(function (t) { return t.id === taskId; }); }

  // Depth-first ordered task list (children sorted by `order` under each parent).
  function getOrderedTasks(project) {
    var byParent = {};
    project.tasks.forEach(function (t) {
      var key = t.parentId || '__root__';
      (byParent[key] = byParent[key] || []).push(t);
    });
    Object.keys(byParent).forEach(function (k) { byParent[k].sort(function (a, b) { return a.order - b.order; }); });
    var out = [];
    function walk(parentKey, depth) {
      (byParent[parentKey] || []).forEach(function (t) {
        var hasChildren = !!byParent[t.id];
        out.push({ task: t, depth: depth, hasChildren: hasChildren });
        walk(t.id, depth + 1);
      });
    }
    walk('__root__', 0);
    return out;
  }

  // Same as above but skips descendants of collapsed parents (for rendering).
  function getVisibleTasks(project) {
    var all = getOrderedTasks(project);
    var collapsedAncestors = {};
    var visible = [];
    all.forEach(function (row) {
      if (row.task.parentId && collapsedAncestors[row.task.parentId]) {
        collapsedAncestors[row.task.id] = true; // propagate hidden state down
        return;
      }
      visible.push(row);
      if (row.hasChildren && row.task.collapsed) collapsedAncestors[row.task.id] = true;
    });
    return visible;
  }

  // Parent/summary task's displayed date range = min/max of its descendant leaves.
  function getRollupRange(project, parentTask) {
    var descendants = collectSubtreeIds(project.tasks, parentTask.id).filter(function (id) { return id !== parentTask.id; });
    if (!descendants.length) return { start: parentTask.start, end: parentTask.end, progress: parentTask.progress };
    var tasks = descendants.map(function (id) { return findTask(project, id); }).filter(Boolean);
    var leaves = tasks.filter(function (t) { return !project.tasks.some(function (x) { return x.parentId === t.id; }); });
    var pool = leaves.length ? leaves : tasks;
    var start = pool[0].start, end = pool[0].end;
    var totalDur = 0, weightedProgress = 0;
    pool.forEach(function (t) {
      if (CG.Dates.isBefore(t.start, start)) start = t.start;
      if (CG.Dates.isAfter(t.end, end)) end = t.end;
      var dur = Math.max(1, CG.Dates.duration(t));
      totalDur += dur;
      weightedProgress += dur * (t.progress || 0);
    });
    return { start: start, end: end, progress: totalDur ? Math.round(weightedProgress / totalDur) : 0 };
  }

  function addDependency(projectId, successorId, predecessorId, type, lagDays) {
    var project = getProject(projectId);
    if (Deps.wouldCreateCycle(project.tasks, predecessorId, successorId)) {
      return { ok: false, reason: 'cycle' };
    }
    commitChange(projectId, function (proj) {
      var t = findTask(proj, successorId);
      if (!t) return;
      t.dependencies = t.dependencies || [];
      var exists = t.dependencies.some(function (d) { return d.predecessorId === predecessorId; });
      if (!exists) t.dependencies.push({ predecessorId: predecessorId, type: type || 'FS', lagDays: lagDays || 0 });
    });
    return { ok: true };
  }

  function removeDependency(projectId, successorId, predecessorId) {
    commitChange(projectId, function (project) {
      var t = findTask(project, successorId);
      if (!t) return;
      t.dependencies = (t.dependencies || []).filter(function (d) { return d.predecessorId !== predecessorId; });
    });
  }

  // ---- Category CRUD ----
  function addCategory(projectId, name, color) {
    var id = Id.uuid();
    commitChange(projectId, function (project) { project.categories.push({ id: id, name: name, color: color }); });
    return id;
  }
  function updateCategory(projectId, categoryId, changes) {
    commitChange(projectId, function (project) {
      var c = project.categories.find(function (x) { return x.id === categoryId; });
      if (c) Object.assign(c, changes);
    });
  }
  function deleteCategory(projectId, categoryId) {
    commitChange(projectId, function (project) {
      project.categories = project.categories.filter(function (c) { return c.id !== categoryId; });
      project.tasks.forEach(function (t) { if (t.categoryId === categoryId) t.categoryId = null; });
    });
  }

  // ---- Custom field CRUD ----
  function addCustomFieldDef(projectId, def) {
    def.id = def.id || Id.uuid();
    commitChange(projectId, function (project) { project.customFieldDefs.push(def); });
    return def.id;
  }
  function updateCustomFieldDef(projectId, defId, changes) {
    commitChange(projectId, function (project) {
      var d = project.customFieldDefs.find(function (x) { return x.id === defId; });
      if (d) Object.assign(d, changes);
    });
  }
  function deleteCustomFieldDef(projectId, defId) {
    commitChange(projectId, function (project) {
      project.customFieldDefs = project.customFieldDefs.filter(function (d) { return d.id !== defId; });
      project.tasks.forEach(function (t) { delete t.customFields[defId]; });
    });
  }

  return {
    init: init, subscribe: subscribe,
    getOpenProjectIds: getOpenProjectIds, getEntry: getEntry, getProject: getProject,
    getActiveProject: getActiveProject, getActiveProjectId: getActiveProjectId,
    isDirty: isDirty, getUi: getUi,
    switchActive: switchActive, renameProject: renameProject, openProjectFromData: openProjectFromData, newProject: newProject,
    closeProject: closeProject, markSaved: markSaved,
    commitChange: commitChange, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    updateSettings: updateSettings, setCollapsed: setCollapsed,
    setSelectedTask: setSelectedTask, toggleCriticalPath: toggleCriticalPath, toggleTodayMarker: toggleTodayMarker,
    createTask: createTask, deleteTask: deleteTask, updateTask: updateTask,
    setTaskDuration: setTaskDuration, moveTaskDates: moveTaskDates,
    indentTask: indentTask, outdentTask: outdentTask, findTask: findTask,
    reorderTaskAmongSiblings: reorderTaskAmongSiblings,
    addDependency: addDependency, removeDependency: removeDependency,
    addCategory: addCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
    addCustomFieldDef: addCustomFieldDef, updateCustomFieldDef: updateCustomFieldDef, deleteCustomFieldDef: deleteCustomFieldDef,
    blankProject: blankProject, defaultSettings: defaultSettings,
    getOrderedTasks: getOrderedTasks, getVisibleTasks: getVisibleTasks, getRollupRange: getRollupRange,
    collectSubtreeIds: collectSubtreeIds
  };
})();
