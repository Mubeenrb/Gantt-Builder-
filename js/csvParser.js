window.CG = window.CG || {};

/* Minimal RFC4180-ish CSV parser: quoted fields, escaped quotes (""), commas/newlines inside quotes. */
CG.Csv = (function () {
  function parse(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var len = text.length;

    function pushField() { row.push(field); field = ''; }
    function pushRow() { pushField(); rows.push(row); row = []; }

    while (i < len) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      } else {
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ',') { pushField(); i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') { pushRow(); i++; continue; }
        field += ch; i++; continue;
      }
    }
    if (field.length > 0 || row.length > 0) pushRow();

    // Drop trailing fully-empty rows
    while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();
    return rows;
  }

  function toObjects(text) {
    var rows = parse(text);
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0];
    var objRows = rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
      return obj;
    });
    return { headers: headers, rows: objRows };
  }

  return { parse: parse, toObjects: toObjects };
})();
