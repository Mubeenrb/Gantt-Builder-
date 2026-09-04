window.CG = window.CG || {};

CG.ExcelExport = (function () {
  var S = CG.State, D = CG.Dates;

  function argb(hex) { return 'FF' + (hex || '#90A4AE').replace('#', '').toUpperCase(); }
  function contrastFont(hex) {
    var c = CG.Color.hexToRgb(hex);
    var lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.6 ? 'FF1A1A1A' : 'FFFFFFFF';
  }

  function leafTasks(project) {
    var childParentIds = {};
    project.tasks.forEach(function (t) { if (t.parentId) childParentIds[t.parentId] = true; });
    return project.tasks.filter(function (t) { return !childParentIds[t.id]; });
  }

  function displayRow(task, project) {
    var hasChildren = project.tasks.some(function (t) { return t.parentId === task.id; });
    if (hasChildren) {
      var r = S.getRollupRange(project, task);
      var kids = S.collectSubtreeIds(project.tasks, task.id).filter(function (id) { return id !== task.id; })
        .map(function (id) { return S.findTask(project, id); }).filter(Boolean);
      var leaves = kids.filter(function (k) { return !project.tasks.some(function (x) { return x.parentId === k.id; }); });
      var budget = leaves.reduce(function (s, k) { return s + (k.budget || 0); }, 0);
      var actual = leaves.reduce(function (s, k) { return s + (k.actualCost || 0); }, 0);
      return { start: r.start, end: r.end, duration: D.diffDays(r.end, r.start) + 1, progress: r.progress, budget: budget || null, actualCost: actual || null };
    }
    return { start: task.start, end: task.end, duration: D.duration(task), progress: task.progress, budget: task.budget, actualCost: task.actualCost };
  }

  async function exportActiveProject(options) {
    var project = S.getActiveProject();
    if (!project) { CG.Toast.show('No project open to export.', 'error'); return; }
    options = options || { progressStyle: 'tint' };

    var workbook = new ExcelJS.Workbook();
    workbook.creator = 'CAPEX Gantt';
    workbook.created = new Date();

    buildTasksSheet(workbook, project, options.columns);
    buildGanttSheet(workbook, project, options);
    buildSummarySheet(workbook, project);

    var buffer = await workbook.xlsx.writeBuffer();
    var filename = CG.Persistence.slugify(project.name) + '-' + D.todayISO() + '.xlsx';
    var result = await CG.Persistence.saveBinaryToFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (result.ok) CG.Toast.show('Exported to ' + result.name, 'success');
  }

  // Full set of optional Tasks-sheet columns, keyed by the same ids the
  // on-screen column picker (CG.TaskTable / Settings) and the export column
  // picker (CG.ExportOptions) use — "Task Name" itself is always included
  // and isn't part of this list.
  function builtinTaskColumns() {
    return [
      { id: 'type', header: 'Type', key: 'type', width: 11 },
      { id: 'category', header: 'Category', key: 'category', width: 16 },
      { id: 'start', header: 'Start', key: 'start', width: 12 },
      { id: 'end', header: 'End', key: 'end', width: 12 },
      { id: 'duration', header: 'Duration (d)', key: 'duration', width: 12 },
      { id: 'progress', header: 'Progress %', key: 'progress', width: 11 },
      { id: 'assignee', header: 'Assignee', key: 'assignee', width: 16 },
      { id: 'budget', header: 'Budget', key: 'budget', width: 14 },
      { id: 'actualCost', header: 'Actual Cost', key: 'actualCost', width: 14 },
      { id: 'dependencies', header: 'Predecessors', key: 'predecessors', width: 28 },
      { id: 'notes', header: 'Notes', key: 'notes', width: 30 }
    ];
  }

  function buildTasksSheet(workbook, project, selectedColumnIds) {
    var ws = workbook.addWorksheet('Tasks');
    var include = function (id) { return !selectedColumnIds || selectedColumnIds.indexOf(id) !== -1; };
    var activeCols = builtinTaskColumns().filter(function (c) { return include(c.id); });
    var customCols = project.customFieldDefs.filter(function (def) { return include(def.id); })
      .map(function (def) { return { id: def.id, header: def.name, key: 'cf_' + def.id, width: 16, isCustom: true }; });
    activeCols = activeCols.concat(customCols);

    ws.columns = [{ header: 'Task Name', key: 'name', width: 34 }].concat(
      activeCols.map(function (c) { return { header: c.header, key: c.key, width: c.width }; })
    );

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).eachCell(function (cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    var byId = {}; project.tasks.forEach(function (t) { byId[t.id] = t; });
    var ordered = S.getOrderedTasks(project);
    var has = function (id) { return activeCols.some(function (c) { return c.id === id; }); };

    ordered.forEach(function (r) {
      var t = r.task;
      var disp = displayRow(t, project);
      var cat = project.categories.find(function (c) { return c.id === t.categoryId; });
      var rowData = { name: '    '.repeat(r.depth) + t.name };
      activeCols.forEach(function (c) {
        if (c.isCustom) { rowData[c.key] = t.customFields ? (t.customFields[c.id] != null ? t.customFields[c.id] : '') : ''; return; }
        switch (c.id) {
          case 'type': rowData.type = t.type === 'milestone' ? 'Milestone' : 'Task'; break;
          case 'category': rowData.category = cat ? cat.name : ''; break;
          case 'start': rowData.start = disp.start; break;
          case 'end': rowData.end = t.type === 'milestone' ? '' : disp.end; break;
          case 'duration': rowData.duration = t.type === 'milestone' ? 0 : disp.duration; break;
          case 'progress': rowData.progress = disp.progress; break;
          case 'assignee': rowData.assignee = t.assignee || ''; break;
          case 'budget': rowData.budget = disp.budget; break;
          case 'actualCost': rowData.actualCost = disp.actualCost; break;
          case 'dependencies': rowData.predecessors = (t.dependencies || []).map(function (d) { return CG.Deps.formatDependency(d, byId); }).join(', '); break;
          case 'notes': rowData.notes = t.notes || ''; break;
        }
      });
      var row = ws.addRow(rowData);
      row.outlineLevel = r.depth;
      if (cat && has('category')) {
        var cell = row.getCell('category');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(cat.color) } };
        cell.font = { color: { argb: contrastFont(cat.color) } };
      }
      if (has('progress')) row.getCell('progress').numFmt = '0"%"';
      if (has('budget') && disp.budget != null) row.getCell('budget').numFmt = '#,##0';
      if (has('actualCost') && disp.actualCost != null) row.getCell('actualCost').numFmt = '#,##0';
    });
  }

  function buildGanttSheet(workbook, project, options) {
    var ws = workbook.addWorksheet('Gantt');
    var leaves = leafTasks(project);
    if (!leaves.length) { ws.addRow(['No tasks yet.']); return; }
    var minStart = leaves[0].start, maxEnd = leaves[0].end;
    leaves.forEach(function (t) { if (D.isBefore(t.start, minStart)) minStart = t.start; if (D.isAfter(t.end, maxEnd)) maxEnd = t.end; });

    var spanDays = D.diffDays(maxEnd, minStart) + 1;
    var unit = spanDays > 180 ? 'week' : 'day';
    var cols = [];
    if (unit === 'day') {
      var cur = minStart;
      while (!D.isAfter(cur, maxEnd)) { cols.push({ start: cur, end: cur, label: D.formatDate(cur, 'd MMM') }); cur = D.addDays(cur, 1); }
    } else {
      var wcur = D.startOfWeek(minStart, project.settings.weekStart);
      while (!D.isAfter(wcur, maxEnd)) {
        var wend = D.addDays(wcur, 6);
        cols.push({ start: wcur, end: wend, label: D.formatDate(wcur, 'd MMM') });
        wcur = D.addDays(wcur, 7);
      }
    }

    var today = D.todayISO();
    var todayColIdx = -1;
    if (S.getUi().showTodayMarker) {
      cols.forEach(function (c, i) { if (!D.isBefore(today, c.start) && !D.isAfter(today, c.end)) todayColIdx = i; });
    }

    ws.columns = [{ width: 32 }, { width: 15 }].concat(cols.map(function () { return { width: unit === 'day' ? 3.4 : 9 }; }));
    var headerRow = ws.getRow(1);
    headerRow.getCell(1).value = 'Task Name';
    headerRow.getCell(2).value = 'Category';
    cols.forEach(function (c, i) {
      var cell = headerRow.getCell(i + 3);
      cell.value = c.label;
      if (unit === 'day') cell.alignment = { textRotation: 90, horizontal: 'center' };
      if (i === todayColIdx) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } };
    });
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell(function (cell) { if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }; });
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    var ordered = S.getOrderedTasks(project);
    ordered.forEach(function (r) {
      var t = r.task;
      var disp = displayRow(t, project);
      var cat = project.categories.find(function (c) { return c.id === t.categoryId; });
      var color = t.color || (cat ? cat.color : '#90A4AE');
      var row = ws.addRow([]);
      row.getCell(1).value = '    '.repeat(r.depth) + t.name;
      row.getCell(2).value = cat ? cat.name : '';
      row.outlineLevel = r.depth;

      var progressCutoff = null;
      if (t.type !== 'milestone' && disp.progress > 0) {
        var totalDur = D.diffDays(disp.end, disp.start);
        progressCutoff = D.addDays(disp.start, Math.round(totalDur * disp.progress / 100));
      }

      cols.forEach(function (c, i) {
        var overlapStart = D.max(disp.start, c.start);
        var overlapEnd = D.min(disp.end, c.end);
        var cellIdx = i + 3;
        var cell = row.getCell(cellIdx);
        if (D.isAfter(overlapStart, overlapEnd)) return; // no overlap

        if (t.type === 'milestone') {
          cell.value = '◆';
          cell.font = { bold: true, color: { argb: argb(color) } };
          cell.alignment = { horizontal: 'center' };
          cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } };
          return;
        }
        var solid = progressCutoff !== null && !D.isAfter(overlapEnd, progressCutoff);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(solid ? color : CG.Color.tint(color, 0.55)) } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
          left: { style: c.start === overlapStart ? 'medium' : 'thin', color: { argb: 'FF555555' } },
          right: { style: c.end === overlapEnd ? 'medium' : 'thin', color: { argb: 'FF555555' } }
        };
      });

      if (todayColIdx >= 0) {
        var tCell = row.getCell(todayColIdx + 3);
        tCell.border = Object.assign({}, tCell.border, { left: { style: 'thick', color: { argb: 'FFD32F2F' } }, right: { style: 'thick', color: { argb: 'FFD32F2F' } } });
      }
    });
  }

  function buildSummarySheet(workbook, project) {
    var ws = workbook.addWorksheet('Summary');
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 22;

    var leaves = leafTasks(project);
    var tasksOnly = leaves.filter(function (t) { return t.type === 'task'; });
    var milestones = leaves.filter(function (t) { return t.type === 'milestone'; });
    var totalBudget = leaves.reduce(function (s, t) { return s + (t.budget || 0); }, 0);
    var totalActual = leaves.reduce(function (s, t) { return s + (t.actualCost || 0); }, 0);
    var totalDur = 0, weighted = 0;
    leaves.forEach(function (t) { var dur = Math.max(1, D.duration(t)); totalDur += dur; weighted += dur * (t.progress || 0); });
    var pctComplete = totalDur ? Math.round(weighted / totalDur) : 0;
    var today = D.todayISO();
    var overdue = leaves.filter(function (t) { return D.isBefore(t.end, today) && (t.progress || 0) < 100; }).length;
    var completed = leaves.filter(function (t) { return (t.progress || 0) >= 100; }).length;
    var cpm = CG.CPM.compute(project.tasks);
    var criticalCount = cpm.hasCycle ? 0 : leaves.filter(function (t) { return cpm.criticalTaskIds[t.id]; }).length;

    var minStart = leaves.length ? leaves[0].start : D.todayISO();
    var maxEnd = leaves.length ? leaves[0].end : D.todayISO();
    leaves.forEach(function (t) { if (D.isBefore(t.start, minStart)) minStart = t.start; if (D.isAfter(t.end, maxEnd)) maxEnd = t.end; });

    var titleCell = ws.getCell('A1');
    titleCell.value = 'Project Summary'; titleCell.font = { bold: true, size: 14 };
    ws.mergeCells('A1:B1');

    var rows = [
      ['Project Name', project.name],
      ['Date Range', minStart + '  →  ' + maxEnd],
      ['Total Budget', totalBudget],
      ['Total Actual Cost', totalActual],
      ['Budget Variance', totalBudget - totalActual],
      ['Overall % Complete', pctComplete],
      ['Total Tasks', tasksOnly.length],
      ['Milestones', milestones.length],
      ['Completed Tasks', completed],
      ['Overdue Tasks', overdue],
      ['Critical Path Tasks', cpm.hasCycle ? 'N/A (dependency cycle detected)' : criticalCount]
    ];
    var startRow = 3;
    rows.forEach(function (r, i) {
      var rowNum = startRow + i;
      ws.getCell('A' + rowNum).value = r[0];
      ws.getCell('A' + rowNum).font = { bold: true };
      var cell = ws.getCell('B' + rowNum);
      cell.value = r[1];
      if (r[0] === 'Total Budget' || r[0] === 'Total Actual Cost' || r[0] === 'Budget Variance') cell.numFmt = '#,##0';
      if (r[0] === 'Overall % Complete') cell.numFmt = '0"%"';
      if (r[0] === 'Budget Variance' && typeof r[1] === 'number' && r[1] < 0) cell.font = { color: { argb: 'FFD32F2F' }, bold: true };
      if (r[0] === 'Overdue Tasks' && r[1] > 0) cell.font = { color: { argb: 'FFD32F2F' }, bold: true };
    });

    var catHeaderRow = startRow + rows.length + 2;
    ws.getCell('A' + catHeaderRow).value = 'By Category';
    ws.getCell('A' + catHeaderRow).font = { bold: true, size: 12 };
    var hRow = catHeaderRow + 1;
    ['Category', 'Task Count', 'Budget', 'Avg % Complete'].forEach(function (h, i) {
      var c = ws.getCell(hRow, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
    });
    project.categories.forEach(function (cat, i) {
      var catLeaves = leaves.filter(function (t) { return t.categoryId === cat.id; });
      var r = hRow + 1 + i;
      ws.getCell(r, 1).value = cat.name;
      ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(cat.color) } };
      ws.getCell(r, 1).font = { color: { argb: contrastFont(cat.color) } };
      ws.getCell(r, 2).value = catLeaves.length;
      ws.getCell(r, 3).value = catLeaves.reduce(function (s, t) { return s + (t.budget || 0); }, 0);
      ws.getCell(r, 3).numFmt = '#,##0';
      var catDur = 0, catWeighted = 0;
      catLeaves.forEach(function (t) { var dur = Math.max(1, D.duration(t)); catDur += dur; catWeighted += dur * (t.progress || 0); });
      ws.getCell(r, 4).value = catDur ? Math.round(catWeighted / catDur) : 0;
      ws.getCell(r, 4).numFmt = '0"%"';
    });
  }

  return { exportActiveProject: exportActiveProject, builtinTaskColumns: builtinTaskColumns, displayRow: displayRow };
})();
