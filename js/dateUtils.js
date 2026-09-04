window.CG = window.CG || {};

/*
 * All dates are stored as 'YYYY-MM-DD' strings and treated as calendar days
 * with no timezone component. Internally we convert to a UTC epoch-day
 * integer for arithmetic so DST/timezone shifts never corrupt a date.
 */
CG.Dates = (function () {
  var MS_PER_DAY = 86400000;

  function parseISO(iso) {
    var parts = iso.split('-');
    return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function fromEpochDay(ms) {
    var d = new Date(ms);
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(iso, n) {
    return fromEpochDay(parseISO(iso) + n * MS_PER_DAY);
  }

  function diffDays(isoEnd, isoStart) {
    return Math.round((parseISO(isoEnd) - parseISO(isoStart)) / MS_PER_DAY);
  }

  function duration(task) {
    if (task.type === 'milestone') return 0;
    return diffDays(task.end, task.start) + 1;
  }

  function isBefore(a, b) { return parseISO(a) < parseISO(b); }
  function isAfter(a, b) { return parseISO(a) > parseISO(b); }
  function min(a, b) { return isBefore(a, b) ? a : b; }
  function max(a, b) { return isAfter(a, b) ? a : b; }

  function getWeekdayIndex(iso) {
    // 0 = Sunday .. 6 = Saturday
    return new Date(parseISO(iso)).getUTCDay();
  }

  function isWeekend(iso) {
    var wd = getWeekdayIndex(iso);
    return wd === 0 || wd === 6;
  }

  function startOfWeek(iso, weekStart) {
    var wd = getWeekdayIndex(iso);
    var startIdx = weekStart === 'mon' ? 1 : 0;
    var delta = (wd - startIdx + 7) % 7;
    return addDays(iso, -delta);
  }

  function startOfMonth(iso) {
    var parts = iso.split('-');
    return parts[0] + '-' + parts[1] + '-01';
  }

  function addMonths(iso, n) {
    var parts = iso.split('-').map(Number);
    var totalMonths = (parts[0] * 12 + (parts[1] - 1)) + n;
    var y = Math.floor(totalMonths / 12);
    var m = totalMonths % 12;
    return y + '-' + String(m + 1).padStart(2, '0') + '-01';
  }

  function startOfQuarter(iso) {
    var parts = iso.split('-').map(Number);
    var qMonth = Math.floor((parts[1] - 1) / 3) * 3;
    return parts[0] + '-' + String(qMonth + 1).padStart(2, '0') + '-01';
  }

  function addQuarters(iso, n) { return addMonths(iso, n * 3); }

  function startOfYear(iso) { return iso.split('-')[0] + '-01-01'; }
  function addYears(iso, n) {
    var parts = iso.split('-');
    return (Number(parts[0]) + n) + '-01-01';
  }

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function formatDate(iso, fmt) {
    if (!iso) return '';
    var parts = iso.split('-').map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    var wd = getWeekdayIndex(iso);
    fmt = fmt || 'dd/MM/yyyy';
    return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEE/g, function (token) {
      switch (token) {
        case 'yyyy': return String(y);
        case 'yy': return String(y).slice(-2);
        case 'MMMM': return MONTH_NAMES_FULL[m - 1];
        case 'MMM': return MONTH_NAMES[m - 1];
        case 'MM': return String(m).padStart(2, '0');
        case 'M': return String(m);
        case 'dd': return String(d).padStart(2, '0');
        case 'd': return String(d);
        case 'EEE': return DAY_NAMES[wd];
        default: return token;
      }
    });
  }

  function snapToGrid(iso) {
    // All interactions snap to whole calendar days regardless of zoom level,
    // so precision (e.g. exact vendor lead-time dates) is never lost when zoomed out.
    return iso;
  }

  function clampMinSpan(start, end) {
    return isBefore(end, start) ? start : end;
  }

  return {
    MS_PER_DAY: MS_PER_DAY,
    parseISO: parseISO,
    fromEpochDay: fromEpochDay,
    todayISO: todayISO,
    addDays: addDays,
    diffDays: diffDays,
    duration: duration,
    isBefore: isBefore,
    isAfter: isAfter,
    min: min,
    max: max,
    getWeekdayIndex: getWeekdayIndex,
    isWeekend: isWeekend,
    startOfWeek: startOfWeek,
    startOfMonth: startOfMonth,
    addMonths: addMonths,
    startOfQuarter: startOfQuarter,
    addQuarters: addQuarters,
    startOfYear: startOfYear,
    addYears: addYears,
    formatDate: formatDate,
    snapToGrid: snapToGrid,
    clampMinSpan: clampMinSpan,
    MONTH_NAMES: MONTH_NAMES,
    MONTH_NAMES_FULL: MONTH_NAMES_FULL,
    DAY_NAMES: DAY_NAMES
  };
})();
