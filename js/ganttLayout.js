window.CG = window.CG || {};

CG.Layout = (function () {
  var D = CG.Dates;

  var PX_PER_DAY = { day: 40, week: 20, month: 8, quarter: 3.2, year: 1.4 };

  function getPxPerDay(zoom) { return PX_PER_DAY[zoom] || PX_PER_DAY.month; }

  // Snaps the chart's date range to clean period boundaries for the given
  // zoom level, instead of a fixed day-count pad — a fixed pad produces a
  // cramped sliver column (e.g. 13 days of "Jul") whenever it doesn't land
  // on a period boundary, which reads as a rendering glitch. Snapping means
  // every edge column is a complete period with its label properly centered.
  function computeDateRange(project, zoom) {
    var tasks = project.tasks;
    var today = D.todayISO();
    var minStart, maxEnd;
    if (!tasks.length) {
      minStart = today; maxEnd = D.addDays(today, 60);
    } else {
      minStart = tasks[0].start; maxEnd = tasks[0].end;
      tasks.forEach(function (t) {
        if (D.isBefore(t.start, minStart)) minStart = t.start;
        if (D.isAfter(t.end, maxEnd)) maxEnd = t.end;
      });
      if (D.isBefore(today, minStart)) minStart = today;
      if (D.isAfter(today, maxEnd)) maxEnd = today;
    }

    var weekStart = (project.settings && project.settings.weekStart) || 'mon';
    zoom = zoom || 'month';

    if (zoom === 'day') {
      return { start: D.addDays(minStart, -3), end: D.addDays(maxEnd, 4) };
    }
    if (zoom === 'week') {
      return { start: D.startOfWeek(D.addDays(minStart, -7), weekStart), end: D.addDays(D.startOfWeek(D.addDays(maxEnd, 7), weekStart), 7) };
    }
    if (zoom === 'quarter') {
      return { start: D.startOfQuarter(minStart), end: D.addQuarters(D.startOfQuarter(maxEnd), 1) };
    }
    if (zoom === 'year') {
      return { start: D.startOfYear(minStart), end: D.addYears(D.startOfYear(maxEnd), 1) };
    }
    // month (default)
    return { start: D.startOfMonth(minStart), end: D.addMonths(D.startOfMonth(maxEnd), 1) };
  }

  // Raw task date span (no zoom padding) — used to auto-pick an export zoom
  // level, independent of whatever zoom the live view happens to be on.
  function taskSpanDays(project) {
    var tasks = project.tasks;
    if (!tasks.length) return 60;
    var minStart = tasks[0].start, maxEnd = tasks[0].end;
    tasks.forEach(function (t) {
      if (D.isBefore(t.start, minStart)) minStart = t.start;
      if (D.isAfter(t.end, maxEnd)) maxEnd = t.end;
    });
    return D.diffDays(maxEnd, minStart);
  }

  // Picks the coarsest zoom that still gives each period column a readable
  // width for a chart this long — a 500-task, 3-year plan rendered at
  // day/week zoom produces an image tens of thousands of pixels wide, which
  // PowerPoint then has to shrink to fit a slide, making the text
  // unreadable. Thresholds are chosen so the resulting chart width stays in
  // roughly the same ballpark (~2000-4500px) across plan sizes.
  function suggestZoom(project) {
    var days = taskSpanDays(project);
    if (days <= 75) return 'day';
    if (days <= 240) return 'week';
    if (days <= 540) return 'month';
    if (days <= 1200) return 'quarter';
    return 'year';
  }

  function dateToX(iso, chartStart, pxPerDay) {
    return D.diffDays(iso, chartStart) * pxPerDay;
  }

  function xToDayOffset(x, pxPerDay) {
    return Math.round(x / pxPerDay);
  }

  function totalWidth(range, pxPerDay) {
    return D.diffDays(range.end, range.start) * pxPerDay;
  }

  function buildHeaderTicks(zoom, range, weekStart) {
    var pxPerDay = getPxPerDay(zoom);
    var minor = [];
    var cursor;

    if (zoom === 'day') {
      cursor = range.start;
      while (D.isBefore(cursor, range.end)) {
        minor.push({ iso: cursor, width: pxPerDay, label: String(Number(cursor.split('-')[2])), weekend: D.isWeekend(cursor) });
        cursor = D.addDays(cursor, 1);
      }
    } else if (zoom === 'week') {
      cursor = D.startOfWeek(range.start, weekStart);
      while (D.isBefore(cursor, range.end)) {
        // Week-of-month numbering (W1, W2, ...), resetting at each month's
        // first week-start on/after its 1st — the common construction/CAPEX
        // Gantt convention, paired with the "August 2026" major-row label.
        var weekOfMonth = Math.floor(D.diffDays(cursor, D.startOfMonth(cursor)) / 7) + 1;
        minor.push({ iso: cursor, width: pxPerDay * 7, label: 'W' + weekOfMonth });
        cursor = D.addDays(cursor, 7);
      }
    } else if (zoom === 'month') {
      cursor = D.startOfMonth(range.start);
      while (D.isBefore(cursor, range.end)) {
        var next = D.addMonths(cursor, 1);
        var w = D.diffDays(next, cursor) * pxPerDay;
        minor.push({ iso: cursor, width: w, label: D.formatDate(cursor, 'MMM') });
        cursor = next;
      }
    } else if (zoom === 'quarter') {
      cursor = D.startOfQuarter(range.start);
      while (D.isBefore(cursor, range.end)) {
        var nextQ = D.addQuarters(cursor, 1);
        var wq = D.diffDays(nextQ, cursor) * pxPerDay;
        var qNum = Math.floor(Number(cursor.split('-')[1]) / 3) + 1;
        minor.push({ iso: cursor, width: wq, label: 'Q' + qNum });
        cursor = nextQ;
      }
    } else { // year
      cursor = D.startOfYear(range.start);
      while (D.isBefore(cursor, range.end)) {
        var nextY = D.addYears(cursor, 1);
        var wy = D.diffDays(nextY, cursor) * pxPerDay;
        minor.push({ iso: cursor, width: wy, label: cursor.split('-')[0] });
        cursor = nextY;
      }
    }

    // Compute x offsets
    var x = 0;
    minor.forEach(function (m) { m.x = dateToX(m.iso, range.start, pxPerDay); });

    var major = [];
    if (zoom === 'day' || zoom === 'week') {
      var groups = {};
      var order = [];
      minor.forEach(function (m) {
        var key = m.iso.slice(0, 7);
        if (!groups[key]) { groups[key] = { key: key, iso: m.iso, x: m.x, width: 0, label: D.formatDate(m.iso, 'MMMM yyyy') }; order.push(key); }
        groups[key].width += m.width;
      });
      major = order.map(function (k) { return groups[k]; });
    } else if (zoom === 'month' || zoom === 'quarter') {
      var groupsY = {};
      var orderY = [];
      minor.forEach(function (m) {
        var key = m.iso.slice(0, 4);
        if (!groupsY[key]) { groupsY[key] = { key: key, iso: m.iso, x: m.x, width: 0, label: key }; orderY.push(key); }
        groupsY[key].width += m.width;
      });
      major = orderY.map(function (k) { return groupsY[k]; });
    }

    return { minor: minor, major: major, pxPerDay: pxPerDay, hasMajor: major.length > 0 };
  }

  return {
    getPxPerDay: getPxPerDay,
    computeDateRange: computeDateRange,
    dateToX: dateToX,
    xToDayOffset: xToDayOffset,
    totalWidth: totalWidth,
    buildHeaderTicks: buildHeaderTicks,
    taskSpanDays: taskSpanDays,
    suggestZoom: suggestZoom
  };
})();
