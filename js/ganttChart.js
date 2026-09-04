window.CG = window.CG || {};

CG.Color = (function () {
  function hexToRgb(hex) {
    hex = (hex || '#90a4ae').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
  }
  function tint(hex, amount) {
    var c = hexToRgb(hex);
    return rgbToHex(c.r + (255 - c.r) * amount, c.g + (255 - c.g) * amount, c.b + (255 - c.b) * amount);
  }
  function shade(hex, amount) {
    var c = hexToRgb(hex);
    return rgbToHex(c.r * (1 - amount), c.g * (1 - amount), c.b * (1 - amount));
  }
  return { hexToRgb: hexToRgb, rgbToHex: rgbToHex, tint: tint, shade: shade };
})();

CG.GanttChart = (function () {
  var S = CG.State, D = CG.Dates, L = CG.Layout;
  var NS = 'http://www.w3.org/2000/svg';
  var HEADER_MINOR_H = 26, HEADER_MAJOR_H = 20;

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // Dependency arrows are drawn in their own layer; wherever a label sits
  // outside a solid bar (a milestone's name, or a narrow bar's name drawn
  // beside it) an arrow can legitimately need to pass through that same
  // strip of the row (e.g. an outgoing arrow leaving a milestone to the
  // right, in the same direction as its own label). A background rect
  // behind the text — same idea as the TODAY label's backing — masks that
  // so the line reads as passing behind the label, not through it.
  var measureCtx = document.createElement('canvas').getContext('2d');
  function textWidthPx(text, size, bold) {
    measureCtx.font = (bold ? '700 ' : '400 ') + size + 'px "Segoe UI", Arial, sans-serif';
    return measureCtx.measureText(text).width;
  }
  // `baselineY` is the exact y that will be given to the <text> element
  // (its baseline) — same value callers already computed before this helper
  // existed (e.g. `cy + 4`).
  function appendMaskedLabel(g, x, baselineY, text, cls, fontSize) {
    fontSize = fontSize || 11;
    var w = textWidthPx(text, fontSize);
    g.appendChild(svgEl('rect', { class: 'label-mask', x: x - 3, y: baselineY - fontSize, width: w + 6, height: fontSize + 6 }));
    var label = svgEl('text', { class: cls, x: x, y: baselineY });
    label.textContent = text;
    g.appendChild(label);
    return label;
  }

  function taskColor(task, project) {
    if (task.color) return task.color;
    var cat = project.categories.find(function (c) { return c.id === task.categoryId; });
    return cat ? cat.color : '#78909c';
  }

  var lastLayout = null; // cached for drag interactions: { range, pxPerDay, rowH, rowIndexById, rowsById }

  function getLayout() { return lastLayout; }

  function render() {
    var project = S.getActiveProject();
    var headerSvg = document.getElementById('gantt-header-svg');
    var bodySvg = document.getElementById('gantt-body-svg');
    var content = document.getElementById('gantt-content');

    if (!project) {
      headerSvg.innerHTML = ''; bodySvg.innerHTML = '';
      lastLayout = null;
      return;
    }

    var ui = S.getUi();
    var zoom = project.settings.defaultZoom;
    var range = L.computeDateRange(project, zoom);
    var ticks = L.buildHeaderTicks(zoom, range, project.settings.weekStart);
    var pxPerDay = ticks.pxPerDay;
    var totalW = Math.max(L.totalWidth(range, pxPerDay), 400);
    var rows = S.getVisibleTasks(project);
    var rowH = project.settings.rowHeight;
    var barH = project.settings.barHeight;
    var headerH = (ticks.hasMajor ? HEADER_MAJOR_H : 0) + HEADER_MINOR_H;
    var bodyH = Math.max(rows.length * rowH, 60);

    content.style.width = totalW + 'px';

    var rowIndexById = {}, rowsById = {};
    rows.forEach(function (r, i) { rowIndexById[r.task.id] = i; rowsById[r.task.id] = r; });

    var cpm = null;
    if (ui.criticalPathOn) {
      cpm = CG.CPM.compute(project.tasks);
    }

    lastLayout = { range: range, pxPerDay: pxPerDay, rowH: rowH, barH: barH, rowIndexById: rowIndexById, rows: rows, project: project, cpm: cpm, headerH: headerH };

    function x(iso) { return L.dateToX(iso, range.start, pxPerDay); }

    // ---------- HEADER ----------
    headerSvg.setAttribute('width', totalW);
    headerSvg.setAttribute('height', headerH);
    headerSvg.innerHTML = '';
    headerSvg.appendChild(svgEl('rect', { class: 'gantt-header-bg', x: 0, y: 0, width: totalW, height: headerH }));
    if (ticks.hasMajor) {
      ticks.major.forEach(function (m) {
        headerSvg.appendChild(svgEl('line', { class: 'grid-line strong', x1: m.x, x2: m.x, y1: 0, y2: headerH, stroke: 'rgba(255,255,255,0.15)' }));
        // Centered within its own group's width, matching how the month/week
        // labels below are centered in their columns.
        var t = svgEl('text', { class: 'gantt-header-text', x: m.x + m.width / 2, y: 14, 'text-anchor': 'middle' });
        t.textContent = m.label;
        headerSvg.appendChild(t);
      });
    }
    ticks.minor.forEach(function (m) {
      var minorY = ticks.hasMajor ? HEADER_MAJOR_H : 0;
      headerSvg.appendChild(svgEl('line', { x1: m.x, x2: m.x, y1: minorY, y2: headerH, stroke: 'rgba(255,255,255,0.1)' }));
      if (m.width > 14) {
        var t2 = svgEl('text', { class: 'gantt-header-text sub', x: m.x + m.width / 2, y: minorY + 17, 'text-anchor': 'middle' });
        t2.textContent = m.label;
        headerSvg.appendChild(t2);
      }
    });
    headerSvg.appendChild(svgEl('line', { x1: 0, x2: totalW, y1: headerH - 0.5, y2: headerH - 0.5, stroke: 'rgba(0,0,0,0.3)' }));

    // ---------- BODY ----------
    bodySvg.setAttribute('width', totalW);
    bodySvg.setAttribute('height', bodyH);
    bodySvg.innerHTML = '';

    // Weekend shading (day zoom only)
    if (zoom === 'day') {
      ticks.minor.forEach(function (m) {
        if (m.weekend) bodySvg.appendChild(svgEl('rect', { class: 'weekend-band', x: m.x, y: 0, width: m.width, height: bodyH }));
      });
    }

    // Row bands
    rows.forEach(function (r, i) {
      var cls = 'row-band' + (i % 2 ? ' alt' : '') + (ui.selectedTaskId === r.task.id ? ' selected' : '');
      bodySvg.appendChild(svgEl('rect', { class: cls, x: 0, y: i * rowH, width: totalW, height: rowH }));
    });

    // Vertical gridlines
    ticks.minor.forEach(function (m) {
      bodySvg.appendChild(svgEl('line', { class: 'grid-line', x1: m.x, x2: m.x, y1: 0, y2: bodyH }));
    });
    if (ticks.hasMajor) {
      ticks.major.forEach(function (m) {
        bodySvg.appendChild(svgEl('line', { class: 'grid-line strong', x1: m.x, x2: m.x, y1: 0, y2: bodyH }));
      });
    }
    // Horizontal row separators
    rows.forEach(function (r, i) {
      bodySvg.appendChild(svgEl('line', { class: 'grid-line', x1: 0, x2: totalW, y1: (i + 1) * rowH, y2: (i + 1) * rowH }));
    });

    var byId = {}; project.tasks.forEach(function (t) { byId[t.id] = t; });

    // Dependency arrows
    var depsGroup = svgEl('g', { class: 'deps-group' });
    rows.forEach(function (r) {
      var t = r.task;
      (t.dependencies || []).forEach(function (dep) {
        var predRow = rowsById[dep.predecessorId];
        if (!predRow) return;
        drawDependencyArrow(depsGroup, predRow.task, t, dep, rowIndexById, rowH, barH, x, project, cpm);
      });
    });
    bodySvg.appendChild(depsGroup);

    // Bars / milestones
    var barsGroup = svgEl('g', { class: 'bars-group' });
    rows.forEach(function (r, i) {
      var t = r.task;
      var rowY = i * rowH;
      var color = taskColor(t, project);
      var isCritical = cpm && !cpm.hasCycle && cpm.criticalTaskIds[t.id];

      if (t.type === 'milestone') {
        barsGroup.appendChild(buildMilestone(t, x(t.start), rowY, rowH, color, isCritical, project));
      } else if (r.hasChildren) {
        var rollup = S.getRollupRange(project, t);
        barsGroup.appendChild(buildParentBar(t, x(rollup.start), x(D.addDays(rollup.end, 1)), rowY, rowH, color, rollup));
      } else {
        barsGroup.appendChild(buildTaskBar(t, x(t.start), x(D.addDays(t.end, 1)), rowY, rowH, barH, color, isCritical, project));
      }
    });
    bodySvg.appendChild(barsGroup);

    // Today marker
    if (ui.showTodayMarker && !D.isBefore(range.end, D.todayISO()) && !D.isBefore(D.todayISO(), range.start)) {
      var tx = x(D.todayISO());
      bodySvg.appendChild(svgEl('line', { class: 'today-line', x1: tx, x2: tx, y1: 0, y2: bodyH }));
      headerSvg.appendChild(svgEl('line', { x1: tx, x2: tx, y1: 0, y2: headerH, stroke: 'var(--today-line)', 'stroke-width': 2 }));
    }
  }

  function buildTaskBar(t, x1, x2, rowY, rowH, barH, color, isCritical, project) {
    var g = svgEl('g', { class: 'task-bar' + (isCritical ? ' critical' : ''), 'data-task-id': t.id });
    var y = rowY + (rowH - barH) / 2;
    var w = Math.max(2, x2 - x1);
    var bg = CG.Color.tint(color, 0.55);
    g.appendChild(svgEl('rect', { class: 'bar-bg', x: x1, y: y, width: w, height: barH, fill: bg }));
    var progW = w * Math.max(0, Math.min(100, t.progress || 0)) / 100;
    if (progW > 0) g.appendChild(svgEl('rect', { class: 'bar-progress', x: x1, y: y, width: progW, height: barH, fill: color }));
    var title = svgEl('title'); title.textContent = t.name + '\n' + t.start + ' → ' + t.end + '\n' + (t.progress || 0) + '% complete';
    g.appendChild(title);

    if (w > 40) {
      var label = svgEl('text', { class: 'bar-label inside', x: x1 + 6, y: y + barH / 2 + 4 });
      label.textContent = t.name.length > Math.floor(w / 7) ? t.name.slice(0, Math.floor(w / 7) - 1) + '…' : t.name;
      g.appendChild(label);
    } else {
      appendMaskedLabel(g, x2 + 6, y + barH / 2 + 4, t.name, 'bar-label');
    }

    // Resize handles (sit ON the bar edges)
    var leftHandle = svgEl('rect', { class: 'resize-handle', x: x1 - 3, y: y, width: 8, height: barH, 'data-task-id': t.id, 'data-handle': 'start' });
    var rightHandle = svgEl('rect', { class: 'resize-handle', x: x2 - 5, y: y, width: 8, height: barH, 'data-task-id': t.id, 'data-handle': 'end' });
    g.appendChild(leftHandle);
    g.appendChild(rightHandle);

    // Dependency nubs: offset just outside the bar edges so their hit area
    // never overlaps the resize handles (arrows still anchor to the true
    // edge coordinates via edgeX(), independent of this visual offset).
    g.appendChild(buildNub(t, x1 - 9, y + barH / 2, 'start'));
    g.appendChild(buildNub(t, x2 + 9, y + barH / 2, 'end'));

    CG.Drag.bindBar(g, t);
    CG.Drag.bindResizeHandle(leftHandle, t, 'start', g);
    CG.Drag.bindResizeHandle(rightHandle, t, 'end', g);

    return g;
  }

  function buildParentBar(t, x1, x2, rowY, rowH, color, rollup) {
    var g = svgEl('g', { class: 'task-bar parent-bar', 'data-task-id': t.id });
    var h = 10;
    var y = rowY + (rowH - h) / 2;
    var w = Math.max(2, x2 - x1);
    g.appendChild(svgEl('rect', { x: x1, y: y, width: w, height: h, fill: CG.Color.shade(color, 0.15) }));
    // end caps (small downward tabs), classic summary-bar look
    g.appendChild(svgEl('polygon', { points: [x1, y + h, x1 - 5, y + h + 7, x1 + 5, y + h + 7].join(' '), fill: CG.Color.shade(color, 0.15) }));
    g.appendChild(svgEl('polygon', { points: [x2, y + h, x2 - 5, y + h + 7, x2 + 5, y + h + 7].join(' '), fill: CG.Color.shade(color, 0.15) }));
    var title = svgEl('title'); title.textContent = t.name + ' (phase)\n' + rollup.start + ' → ' + rollup.end + '\n' + rollup.progress + '% complete';
    g.appendChild(title);
    return g;
  }

  function buildMilestone(t, cx, rowY, rowH, color, isCritical, project) {
    var g = svgEl('g', { class: 'milestone-marker' + (isCritical ? ' critical' : ''), 'data-task-id': t.id });
    var cy = rowY + rowH / 2;
    var r = 8;
    g.appendChild(svgEl('polygon', { points: [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(' '), fill: color }));
    var title = svgEl('title'); title.textContent = t.name + ' (milestone)\n' + t.start;
    g.appendChild(title);
    appendMaskedLabel(g, cx + r + 6, cy + 4, t.name, 'bar-label');
    g.appendChild(buildNub(t, cx, cy, 'start'));
    CG.Drag.bindBar(g, t);
    return g;
  }

  function buildNub(t, x, y, edge) {
    var nub = svgEl('circle', { class: 'dep-nub', cx: x, cy: y, r: 5, 'data-task-id': t.id, 'data-edge': edge });
    CG.Drag.bindDepNub(nub, t, edge);
    return nub;
  }

  function edgeX(task, edge, xFn) {
    // A milestone is a zero-width point, not a bar — its "end" edge must be
    // its own date, not date+1 (that's only correct for a task bar's right
    // edge, which is exclusive). Using +1 here made outgoing arrows start a
    // full day-width to the right of the diamond, cutting through its label.
    if (task.type === 'milestone') return xFn(task.start);
    return edge === 'start' ? xFn(task.start) : xFn(CG.Dates.addDays(task.end, 1));
  }

  function drawDependencyArrow(group, predTask, succTask, dep, rowIndexById, rowH, barH, xFn, project, cpm) {
    var predY = rowIndexById[predTask.id] * rowH + rowH / 2;
    var succY = rowIndexById[succTask.id] * rowH + rowH / 2;
    var fromEdge = (dep.type === 'SS' || dep.type === 'SF') ? 'start' : 'end';
    var toEdge = (dep.type === 'FF' || dep.type === 'SF') ? 'end' : 'start';
    var x1 = edgeX(predTask, fromEdge, xFn);
    var x2 = edgeX(succTask, toEdge, xFn);
    var isCritical = cpm && !cpm.hasCycle && cpm.criticalTaskIds[predTask.id] && cpm.criticalTaskIds[succTask.id];
    var d = buildElbowPath(x1, predY, x2, succY);
    group.appendChild(svgEl('path', { class: 'dependency-arrow' + (isCritical ? ' critical' : ''), d: d }));
    var head = arrowheadPolygon(x2, succY, toEdge === 'end' ? -1 : 1);
    group.appendChild(svgEl('polygon', { class: 'dep-arrowhead' + (isCritical ? ' critical' : ''), points: head }));
  }

  function buildElbowPath(x1, y1, x2, y2) {
    // When a connector spans many rows, nudge its vertical segment further
    // out than the default 14px jog — otherwise it sits right at the bar
    // edge and visually cuts through every bar/label in between.
    var out = Math.abs(y1 - y2) > 90 ? 34 : 14;
    if (x2 >= x1 + out || Math.abs(y1 - y2) < 1) {
      var midX = Math.max(x1 + out, (x1 + x2) / 2);
      if (x2 >= midX) return 'M' + x1 + ',' + y1 + ' H' + midX + ' V' + y2 + ' H' + x2;
    }
    var midY = (y1 + y2) / 2;
    return 'M' + x1 + ',' + y1 + ' H' + (x1 + out) + ' V' + midY + ' H' + (x2 - out) + ' V' + y2 + ' H' + x2;
  }

  function arrowheadPolygon(x, y, dir) {
    var s = 5;
    return [x, y, x - s * dir, y - s, x - s * dir, y + s].join(' ');
  }

  return { render: render, getLayout: getLayout, taskColor: taskColor };
})();
