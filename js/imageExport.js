window.CG = window.CG || {};

/*
 * Renders the active project's Gantt chart as a single, presentation-ready
 * PNG — task names + bars + milestones + dependency arrows, on a plain white
 * background with no app chrome (toolbar, resize handles, drag nubs, input
 * boxes). This exists because pasting the Excel "Gantt" sheet's colored
 * cells into a slide deck looks like a spreadsheet, not a chart. The SVG
 * here is built from scratch with literal colors (not CSS classes/variables)
 * so it's fully self-contained once serialized to a data URL and rasterized.
 */
CG.ImageExport = (function () {
  var S = CG.State, D = CG.Dates, L = CG.Layout, Color = CG.Color;
  var NS = 'http://www.w3.org/2000/svg';

  var NAME_COL_W = 230, CAT_COL_W = 110;
  var TITLE_H = 44, LEGEND_ROW_H = 22, PADDING = 18;
  var HEADER_MAJOR_H = 20, HEADER_MINOR_H = 24;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Real text measurement (via an offscreen canvas) instead of a flat
  // character-count guess, so truncation actually matches the column/bar
  // width available at each row's indent depth rather than cutting names
  // short in wide rows and overflowing them in narrow ones.
  var measureCtx = document.createElement('canvas').getContext('2d');
  function fontString(size, bold, italic) {
    return (italic ? 'italic ' : '') + (bold ? '700 ' : '400 ') + size + 'px "Segoe UI", Arial, sans-serif';
  }
  function textWidth(text, size, bold, italic) {
    measureCtx.font = fontString(size, bold, italic);
    return measureCtx.measureText(text).width;
  }
  function truncateToWidth(text, maxWidth, size, bold, italic) {
    if (maxWidth <= 0) return '';
    if (textWidth(text, size, bold, italic) <= maxWidth) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      var candidate = text.slice(0, mid) + '…';
      if (textWidth(candidate, size, bold, italic) <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return lo <= 0 ? '…' : text.slice(0, lo) + '…';
  }

  function taskColor(task, project) {
    if (task.color) return task.color;
    var cat = project.categories.find(function (c) { return c.id === task.categoryId; });
    return cat ? cat.color : '#78909c';
  }

  // The optional left-panel columns, same field set as the Excel export's
  // column picker (CG.ExportOptions drives both), rendered as plain text
  // columns beside the Name column. `get` receives the task, its
  // rollup-aware display values (see CG.ExcelExport.displayRow), and a
  // predecessor-id -> task lookup map.
  function columnDefs(project) {
    var fmt = project.settings.dateFormat;
    var money = function (v) { return v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); };
    var builtin = [
      { id: 'type', label: 'TYPE', width: 66, get: function (t) { return t.type === 'milestone' ? 'Milestone' : 'Task'; } },
      { id: 'category', label: 'CATEGORY', width: 108, get: function (t) { var c = project.categories.find(function (x) { return x.id === t.categoryId; }); return c ? c.name : ''; } },
      { id: 'start', label: 'START', width: 76, get: function (t, disp) { return D.formatDate(disp.start, fmt); } },
      { id: 'end', label: 'END', width: 76, get: function (t, disp) { return t.type === 'milestone' ? '' : D.formatDate(disp.end, fmt); } },
      { id: 'duration', label: 'DUR (D)', width: 58, get: function (t, disp) { return t.type === 'milestone' ? '' : String(disp.duration); } },
      { id: 'progress', label: 'PROG %', width: 58, get: function (t, disp) { return disp.progress + '%'; } },
      { id: 'assignee', label: 'ASSIGNEE', width: 96, get: function (t) { return t.assignee || ''; } },
      { id: 'budget', label: 'BUDGET', width: 84, get: function (t, disp) { return money(disp.budget); } },
      { id: 'actualCost', label: 'ACTUAL', width: 84, get: function (t, disp) { return money(disp.actualCost); } },
      { id: 'dependencies', label: 'PREDECESSORS', width: 150, get: function (t, disp, byId) { return (t.dependencies || []).map(function (d) { return CG.Deps.formatDependency(d, byId); }).join(', '); } },
      { id: 'notes', label: 'NOTES', width: 160, get: function (t) { return t.notes || ''; } }
    ];
    var custom = project.customFieldDefs.map(function (def) {
      return { id: def.id, label: def.name.toUpperCase(), width: 100, get: function (t) { return t.customFields && t.customFields[def.id] != null ? String(t.customFields[def.id]) : ''; } };
    });
    return builtin.concat(custom);
  }

  function buildSvg(project, selectedColumnIds, showDate, zoomOverride) {
    if (showDate === undefined) showDate = true;
    var ui = S.getUi();
    // Independent of the live view's zoom: default to an auto-picked level
    // based on the plan's actual date span, so a multi-year plan doesn't
    // render at Day/Week granularity and come out too wide to read once
    // pasted into a slide. An explicit override (from the export dialog)
    // always wins.
    var zoom = (zoomOverride && zoomOverride !== 'auto') ? zoomOverride : L.suggestZoom(project);
    var range = L.computeDateRange(project, zoom);
    var ticks = L.buildHeaderTicks(zoom, range, project.settings.weekStart);
    // A single "Q3" column is too coarse to read a schedule against — split
    // each quarter into its 3 calendar months (own gridline + "Jan"/"Feb"/
    // "Mar" label), with the quarter itself promoted to the major band
    // above (e.g. "Q3 2027") instead of the plain year. Uses quarter's own
    // (coarser) px/day scale throughout, so the chart's total width — and
    // the whole point of auto-picking Quarter for a long plan — is unchanged.
    if (zoom === 'quarter') {
      var qPxPerDay = ticks.pxPerDay;
      var monthMinor = [];
      var mCursor = D.startOfMonth(range.start);
      while (D.isBefore(mCursor, range.end)) {
        var mNext = D.addMonths(mCursor, 1);
        monthMinor.push({
          iso: mCursor,
          x: L.dateToX(mCursor, range.start, qPxPerDay),
          width: D.diffDays(mNext, mCursor) * qPxPerDay,
          label: D.formatDate(mCursor, 'MMM')
        });
        mCursor = mNext;
      }
      var quarterMajor = ticks.minor.map(function (m) {
        var qNum = Math.floor(Number(m.iso.split('-')[1]) / 3) + 1;
        return { iso: m.iso, x: m.x, width: m.width, label: 'Q' + qNum + ' ' + m.iso.slice(0, 4) };
      });
      ticks = { minor: monthMinor, major: quarterMajor, pxPerDay: qPxPerDay, hasMajor: true };
    }
    var pxPerDay = ticks.pxPerDay;
    var chartW = Math.max(L.totalWidth(range, pxPerDay), 300);
    var rows = S.getVisibleTasks(project);
    // Only categories actually assigned to a shown task earn a legend entry —
    // a project that defines a dozen categories but only uses three of them
    // in this particular plan shouldn't clutter the picture with the other
    // nine, unused ones.
    var usedCategoryIds = {};
    rows.forEach(function (r) { if (r.task.categoryId) usedCategoryIds[r.task.categoryId] = true; });
    var usedCategories = project.categories.filter(function (c) { return usedCategoryIds[c.id]; });
    var rowH = project.settings.rowHeight;
    var barH = project.settings.barHeight;
    var headerH = (ticks.hasMajor ? HEADER_MAJOR_H : 0) + HEADER_MINOR_H;
    var bodyH = Math.max(rows.length * rowH, 40);

    var activeCols = columnDefs(project).filter(function (c) { return !selectedColumnIds || selectedColumnIds.indexOf(c.id) !== -1; });
    var colX = []; // each column's x-offset, relative to the start of the left panel (i.e. right after PADDING)
    var cursorW = NAME_COL_W;
    activeCols.forEach(function (c) { colX.push(cursorW); cursorW += c.width; });
    var leftW = cursorW;

    var cpm = ui.criticalPathOn ? CG.CPM.compute(project.tasks) : null;
    var cpmOk = cpm && !cpm.hasCycle;
    var subtitleParts = [];
    if (showDate) subtitleParts.push('Generated ' + D.formatDate(D.todayISO(), 'd MMM yyyy'));
    if (cpmOk) subtitleParts.push('Critical path highlighted');
    var subtitle = subtitleParts.join('  •  ');
    var titleH = subtitle ? TITLE_H : 26;

    var totalW = PADDING * 2 + leftW + chartW;
    var legendH = usedCategories.length ? LEGEND_ROW_H + 14 : 0;
    var totalH = PADDING * 2 + titleH + headerH + bodyH + legendH;

    var chartX = PADDING + leftW;
    var chartTop = PADDING + titleH;
    var bodyTop = chartTop + headerH;

    var rowIndexById = {}, rowsById = {};
    rows.forEach(function (r, i) { rowIndexById[r.task.id] = i; rowsById[r.task.id] = r; });

    function x(iso) { return chartX + L.dateToX(iso, range.start, pxPerDay); }

    // A milestone is a zero-width point, not a bar — its "end" edge must be
    // its own date, not date+1 (that's only correct for a task bar's right
    // edge, which is exclusive). Without this, an outgoing arrow from a
    // milestone starts a full day-width to the right of its diamond,
    // cutting through the milestone's own label.
    function edgeX(task, edge) {
      if (task.type === 'milestone') return x(task.start);
      return edge === 'start' ? x(task.start) : x(D.addDays(task.end, 1));
    }

    var parts = [];
    parts.push('<svg xmlns="' + NS + '" width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + ' ' + totalH + '" font-family="Segoe UI, Arial, sans-serif">');
    parts.push('<rect x="0" y="0" width="' + totalW + '" height="' + totalH + '" fill="#ffffff"/>');

    // Title
    parts.push('<text x="' + PADDING + '" y="' + (PADDING + 18) + '" font-size="16" font-weight="700" fill="#1a1a1a">' + esc(project.name) + '</text>');
    if (subtitle) parts.push('<text x="' + PADDING + '" y="' + (PADDING + 34) + '" font-size="10.5" fill="#666666">' + esc(subtitle) + '</text>');

    // Header background. TASK/CATEGORY sit inside the same lower "minor" row
    // as the month/week labels on the right (not centered across the full
    // two-row header height), so the left header lines up with the date
    // header's baseline instead of floating between its two rows.
    var minorRowTop = chartTop + (ticks.hasMajor ? HEADER_MAJOR_H : 0);
    var leftHeaderLabelY = minorRowTop + HEADER_MINOR_H / 2 + 4;
    parts.push('<rect x="' + chartX + '" y="' + chartTop + '" width="' + chartW + '" height="' + headerH + '" fill="#2c3e50"/>');
    parts.push('<rect x="' + PADDING + '" y="' + chartTop + '" width="' + leftW + '" height="' + headerH + '" fill="#2c3e50"/>');
    parts.push('<text x="' + (PADDING + 8) + '" y="' + leftHeaderLabelY + '" font-size="11" font-weight="700" fill="#ffffff">TASK</text>');
    activeCols.forEach(function (c, i) {
      var headerText = esc(truncateToWidth(c.label, c.width - 16, 11, true, false));
      parts.push('<text x="' + (PADDING + colX[i] + 8) + '" y="' + leftHeaderLabelY + '" font-size="11" font-weight="700" fill="#ffffff">' + headerText + '</text>');
    });

    if (ticks.hasMajor) {
      ticks.major.forEach(function (m) {
        parts.push('<line x1="' + (chartX + m.x) + '" x2="' + (chartX + m.x) + '" y1="' + chartTop + '" y2="' + (chartTop + headerH) + '" stroke="rgba(255,255,255,0.15)"/>');
        // Centered within its own group's width, matching how the month/week
        // labels below are centered in their columns — left-aligning this
        // instead (flush against the group's left divider) is what made it
        // read as misplaced, especially for the first group at the chart edge.
        parts.push('<text x="' + (chartX + m.x + m.width / 2) + '" y="' + (chartTop + 14) + '" font-size="11" font-weight="600" fill="#ffffff" text-anchor="middle">' + esc(m.label) + '</text>');
      });
    }
    ticks.minor.forEach(function (m) {
      var minorY = chartTop + (ticks.hasMajor ? HEADER_MAJOR_H : 0);
      parts.push('<line x1="' + (chartX + m.x) + '" x2="' + (chartX + m.x) + '" y1="' + minorY + '" y2="' + (chartTop + headerH) + '" stroke="rgba(255,255,255,0.12)"/>');
      if (m.width > 14) {
        parts.push('<text x="' + (chartX + m.x + m.width / 2) + '" y="' + (minorY + 16) + '" font-size="9.5" fill="rgba(255,255,255,0.7)" text-anchor="middle">' + esc(m.label) + '</text>');
      }
    });

    // Row bands + gridlines across the WHOLE row (name + category + chart)
    if (zoom === 'day') {
      ticks.minor.forEach(function (m) {
        if (m.weekend) parts.push('<rect x="' + (chartX + m.x) + '" y="' + bodyTop + '" width="' + m.width + '" height="' + bodyH + '" fill="#f4f6f8"/>');
      });
    }
    rows.forEach(function (r, i) {
      var y = bodyTop + i * rowH;
      var fill = i % 2 ? '#f7f8fa' : '#ffffff';
      parts.push('<rect x="' + PADDING + '" y="' + y + '" width="' + (leftW + chartW) + '" height="' + rowH + '" fill="' + fill + '"/>');
    });
    ticks.minor.forEach(function (m) {
      parts.push('<line x1="' + (chartX + m.x) + '" x2="' + (chartX + m.x) + '" y1="' + bodyTop + '" y2="' + (bodyTop + bodyH) + '" stroke="#eceff2"/>');
    });
    if (ticks.hasMajor) {
      ticks.major.forEach(function (m) {
        parts.push('<line x1="' + (chartX + m.x) + '" x2="' + (chartX + m.x) + '" y1="' + bodyTop + '" y2="' + (bodyTop + bodyH) + '" stroke="#d7dce1"/>');
      });
    }
    rows.forEach(function (r, i) {
      var y = bodyTop + (i + 1) * rowH;
      parts.push('<line x1="' + PADDING + '" x2="' + (PADDING + leftW + chartW) + '" y1="' + y + '" y2="' + y + '" stroke="#eceff2"/>');
    });
    parts.push('<line x1="' + chartX + '" x2="' + chartX + '" y1="' + chartTop + '" y2="' + (bodyTop + bodyH) + '" stroke="#c4cad3"/>');
    colX.forEach(function (offset) {
      var lx = PADDING + offset;
      parts.push('<line x1="' + lx + '" x2="' + lx + '" y1="' + chartTop + '" y2="' + (bodyTop + bodyH) + '" stroke="#e4e7eb"/>');
    });

    // Name + extra-column values — truncated to the actual pixel width
    // available at each row's indent depth and column width, not a flat
    // character count.
    var NAME_FONT = 11.5, COL_FONT = 10.5;
    var byId = {}; project.tasks.forEach(function (t) { byId[t.id] = t; });
    rows.forEach(function (r, i) {
      var t = r.task;
      var y = bodyTop + i * rowH + rowH / 2 + 4;
      var color = taskColor(t, project);
      var indent = PADDING + 10 + r.depth * 14;
      parts.push('<circle cx="' + (indent) + '" cy="' + (y - 4) + '" r="4" fill="' + color + '"/>');
      var isMilestone = t.type === 'milestone';
      var nameStyle = isMilestone ? ' font-style="italic"' : '';
      var nameX = indent + 10;
      var nameMaxW = (PADDING + NAME_COL_W - 8) - nameX;
      var nameText = esc(truncateToWidth(t.name, nameMaxW, NAME_FONT, false, isMilestone));
      parts.push('<text x="' + nameX + '" y="' + y + '" font-size="' + NAME_FONT + '"' + nameStyle + ' fill="#1a1a1a">' + nameText + '</text>');

      if (activeCols.length) {
        var disp = CG.ExcelExport.displayRow(t, project);
        activeCols.forEach(function (c, ci) {
          var raw = String(c.get(t, disp, byId) || '');
          if (!raw) return;
          var colX0 = PADDING + colX[ci] + 8;
          var text = esc(truncateToWidth(raw, c.width - 16, COL_FONT, false, false));
          parts.push('<text x="' + colX0 + '" y="' + y + '" font-size="' + COL_FONT + '" fill="#444444">' + text + '</text>');
        });
      }
    });

    // Dependency arrows
    rows.forEach(function (r) {
      var t = r.task;
      (t.dependencies || []).forEach(function (dep) {
        var predRow = rowsById[dep.predecessorId];
        if (!predRow) return;
        var predY = bodyTop + rowIndexById[predRow.task.id] * rowH + rowH / 2;
        var succY = bodyTop + rowIndexById[t.id] * rowH + rowH / 2;
        var fromEdge = (dep.type === 'SS' || dep.type === 'SF') ? 'start' : 'end';
        var toEdge = (dep.type === 'FF' || dep.type === 'SF') ? 'end' : 'start';
        var x1 = edgeX(predRow.task, fromEdge);
        var x2 = edgeX(t, toEdge);
        var critical = cpmOk && cpm.criticalTaskIds[predRow.task.id] && cpm.criticalTaskIds[t.id];
        var stroke = critical ? '#d32f2f' : '#97a0ab';
        var d = elbowPath(x1, predY, x2, succY);
        parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (critical ? 2 : 1.3) + '"/>');
        var dir = toEdge === 'end' ? -1 : 1, s = 4.5;
        parts.push('<polygon points="' + [x2, succY, x2 - s * dir, succY - s, x2 - s * dir, succY + s].join(' ') + '" fill="' + stroke + '"/>');
      });
    });

    // Bars / milestones / parent rollup bars
    rows.forEach(function (r, i) {
      var t = r.task;
      var rowY = bodyTop + i * rowH;
      var color = taskColor(t, project);
      var critical = cpmOk && cpm.criticalTaskIds[t.id];

      if (t.type === 'milestone') {
        var cx = x(t.start), cy = rowY + rowH / 2, rad = 7;
        parts.push('<polygon points="' + [cx, cy - rad, cx + rad, cy, cx, cy + rad, cx - rad, cy].join(' ') + '" fill="' + color + '" stroke="' + (critical ? '#d32f2f' : 'rgba(0,0,0,0.25)') + '" stroke-width="' + (critical ? 2 : 1) + '"/>');
      } else if (r.hasChildren) {
        var rollup = S.getRollupRange(project, t);
        var rx1 = x(rollup.start), rx2 = x(D.addDays(rollup.end, 1));
        var rh = 9, ry = rowY + (rowH - rh) / 2;
        var dark = Color.shade(color, 0.15);
        parts.push('<rect x="' + rx1 + '" y="' + ry + '" width="' + Math.max(2, rx2 - rx1) + '" height="' + rh + '" fill="' + dark + '"/>');
        parts.push('<polygon points="' + [rx1, ry + rh, rx1 - 4, ry + rh + 6, rx1 + 4, ry + rh + 6].join(' ') + '" fill="' + dark + '"/>');
        parts.push('<polygon points="' + [rx2, ry + rh, rx2 - 4, ry + rh + 6, rx2 + 4, ry + rh + 6].join(' ') + '" fill="' + dark + '"/>');
      } else {
        var bx1 = x(t.start), bx2 = x(D.addDays(t.end, 1));
        var by = rowY + (rowH - barH) / 2, bw = Math.max(2, bx2 - bx1);
        var bg = Color.tint(color, 0.55);
        parts.push('<rect x="' + bx1 + '" y="' + by + '" width="' + bw + '" height="' + barH + '" rx="3" fill="' + bg + '" stroke="' + (critical ? '#d32f2f' : 'rgba(0,0,0,0.18)') + '" stroke-width="' + (critical ? 2 : 1) + '"/>');
        var progW = bw * Math.max(0, Math.min(100, t.progress || 0)) / 100;
        if (progW > 0) parts.push('<rect x="' + bx1 + '" y="' + by + '" width="' + progW + '" height="' + barH + '" rx="3" fill="' + color + '"/>');
        if (bw > 30) {
          var label = esc(truncateToWidth(t.name, bw - 10, 10.5, false, false));
          if (label) parts.push('<text x="' + (bx1 + 6) + '" y="' + (by + barH / 2 + 4) + '" font-size="10.5" fill="#ffffff">' + label + '</text>');
        }
      }
    });

    // Today marker
    var today = D.todayISO();
    if (ui.showTodayMarker && !D.isBefore(range.end, today) && !D.isBefore(today, range.start)) {
      var tx = x(today);
      parts.push('<line x1="' + tx + '" x2="' + tx + '" y1="' + chartTop + '" y2="' + (bodyTop + bodyH) + '" stroke="#d32f2f" stroke-width="2"/>');
      parts.push('<rect x="' + (tx + 3) + '" y="' + (minorRowTop + 4) + '" width="40" height="14" fill="#2c3e50"/>');
      parts.push('<text x="' + (tx + 5) + '" y="' + (minorRowTop + 14) + '" font-size="9.5" font-weight="700" fill="#ff6b6b">TODAY</text>');
    }

    // Legend
    if (usedCategories.length) {
      var legendY = bodyTop + bodyH + 20;
      var lx = PADDING;
      usedCategories.forEach(function (cat) {
        parts.push('<rect x="' + lx + '" y="' + (legendY - 10) + '" width="12" height="12" rx="2" fill="' + cat.color + '"/>');
        var label = esc(cat.name);
        parts.push('<text x="' + (lx + 17) + '" y="' + legendY + '" font-size="10.5" fill="#444444">' + label + '</text>');
        lx += 20 + label.length * 6.2 + 20;
      });
      if (cpmOk) {
        parts.push('<line x1="' + lx + '" x2="' + (lx + 20) + '" y1="' + (legendY - 4) + '" y2="' + (legendY - 4) + '" stroke="#d32f2f" stroke-width="2"/>');
        parts.push('<text x="' + (lx + 26) + '" y="' + legendY + '" font-size="10.5" fill="#444444">Critical path</text>');
      }
    }

    parts.push('</svg>');
    return { svg: parts.join(''), width: totalW, height: totalH };
  }

  function elbowPath(x1, y1, x2, y2) {
    // When a connector spans many rows, nudge its vertical segment further
    // out than the default 14px jog — otherwise it sits right at the bar
    // edge and visually "cuts through" every bar/label in between.
    var out = Math.abs(y1 - y2) > 90 ? 34 : 14;
    if (Math.abs(y1 - y2) < 1) return 'M' + x1 + ',' + y1 + ' H' + x2;
    if (x2 >= x1 + out) {
      var midX = Math.max(x1 + out, (x1 + x2) / 2);
      if (x2 >= midX) return 'M' + x1 + ',' + y1 + ' H' + midX + ' V' + y2 + ' H' + x2;
    }
    var midY = (y1 + y2) / 2;
    return 'M' + x1 + ',' + y1 + ' H' + (x1 + out) + ' V' + midY + ' H' + (x2 - out) + ' V' + y2 + ' H' + x2;
  }

  function svgToPngBlob(svgString, width, height, scale) {
    return new Promise(function (resolve, reject) {
      var blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (pngBlob) {
          if (pngBlob) resolve(pngBlob); else reject(new Error('Canvas rendering failed.'));
        }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not rasterize the chart.')); };
      img.src = url;
    });
  }

  async function exportActiveProject(options) {
    var project = S.getActiveProject();
    if (!project) { CG.Toast.show('No project open to export.', 'error'); return; }
    var built = buildSvg(project, options && options.columns, !!(options && options.showDate === true), options && options.zoom);
    var blob = await svgToPngBlob(built.svg, built.width, built.height, 2);
    var filename = CG.Persistence.slugify(project.name) + '-gantt-' + D.todayISO() + '.png';
    var result = await CG.Persistence.saveBinaryToFile(blob, filename, 'image/png');
    if (result.ok) CG.Toast.show('Exported ' + result.name + ' — ready to paste into a slide.', 'success');
  }

  return { exportActiveProject: exportActiveProject, buildSvg: buildSvg, columnDefs: columnDefs };
})();
