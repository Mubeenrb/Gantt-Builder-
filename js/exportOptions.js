window.CG = window.CG || {};

/*
 * Shared column-picker modal for both export paths. It's the same idea in
 * both places — pick which fields to include — but with different defaults
 * and a different confirm action:
 *   - Excel: defaults to everything checked (a data export people expect to
 *     be complete unless they trim it); writes to the "Tasks" sheet only.
 *   - Image: defaults to the on-screen table's visible columns (a picture
 *     is meant to look like a clean chart, not a full data dump), and adds
 *     each checked field as its own text column beside the task names.
 * Each context remembers its own selection per project.
 */
CG.ExportOptions = (function () {
  var S = CG.State;

  var CONTEXTS = {
    excel: {
      title: 'Export to Excel',
      intro: 'Choose which fields to include in the <b>Tasks</b> sheet. Task Name is always included. The Gantt and Summary sheets are unaffected.',
      settingsKey: 'excelExportColumns',
      allColumnDefs: function (project) {
        return CG.ExcelExport.builtinTaskColumns().map(function (c) { return { id: c.id, label: c.header }; })
          .concat(project.customFieldDefs.map(function (def) { return { id: def.id, label: def.name }; }));
      },
      defaultSelection: function (project) { return null; }, // null = everything checked
      run: function (project, selectedIds) {
        return CG.ExcelExport.exportActiveProject({ columns: selectedIds });
      }
    },
    image: {
      title: 'Export as Image',
      intro: 'Choose which fields appear as extra columns beside the task names. Fewer fields keep the picture clean for a slide; the Gantt bars/milestones themselves are always shown.',
      settingsKey: 'imageExportColumns',
      allColumnDefs: function (project) {
        return CG.ImageExport.columnDefs(project).map(function (c) { return { id: c.id, label: c.label }; });
      },
      defaultSelection: function (project) { return project.settings.visibleColumns || []; },
      extraToggles: [
        { id: 'showDate', label: "Include the “Generated on” date under the title", settingsKey: 'imageShowDate', defaultValue: false }
      ],
      extraSelects: [
        {
          id: 'zoom', label: 'Timeline detail', settingsKey: 'imageExportZoom', defaultValue: 'auto',
          hint: 'Auto picks the coarsest level that keeps the picture readable, based on how long this plan runs.',
          options: [
            { value: 'auto', label: 'Auto (recommended)' },
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'quarter', label: 'Quarter' },
            { value: 'year', label: 'Year' }
          ]
        }
      ],
      run: function (project, selectedIds, extraValues) {
        return CG.ImageExport.exportActiveProject({ columns: selectedIds, showDate: extraValues.showDate, zoom: extraValues.zoom });
      }
    }
  };

  function open(contextKey) {
    var ctx = CONTEXTS[contextKey];
    var project = S.getActiveProject();
    if (!project) { CG.Toast.show('No project open to export.', 'error'); return; }

    var allCols = ctx.allColumnDefs(project);
    var saved = project.settings[ctx.settingsKey];
    var defaultSet = saved || ctx.defaultSelection(project);
    var selected = {};
    allCols.forEach(function (c) { selected[c.id] = defaultSet === null ? true : defaultSet.indexOf(c.id) !== -1; });

    var extraToggles = ctx.extraToggles || [];
    var extraSelected = {};
    extraToggles.forEach(function (t) {
      var savedVal = project.settings[t.settingsKey];
      extraSelected[t.id] = savedVal === undefined ? t.defaultValue : !!savedVal;
    });

    var extraSelects = ctx.extraSelects || [];
    var extraSelectValues = {};
    extraSelects.forEach(function (s) {
      var savedVal = project.settings[s.settingsKey];
      extraSelectValues[s.id] = savedVal === undefined ? s.defaultValue : savedVal;
    });

    var backdrop = document.getElementById('export-options-modal-backdrop');
    var modal = document.getElementById('export-options-modal');
    modal.innerHTML = buildHtml(ctx, allCols, selected, extraToggles, extraSelected, extraSelects, extraSelectValues);
    backdrop.classList.remove('hidden');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.getElementById('eo-close').onclick = close;
    document.getElementById('eo-cancel').onclick = close;
    document.getElementById('eo-all').onclick = function () { setAll(allCols, true); };
    document.getElementById('eo-none').onclick = function () { setAll(allCols, false); };
    document.getElementById('eo-export').onclick = function () { confirm(ctx, project, allCols, extraToggles, extraSelects); };
  }

  function buildHtml(ctx, allCols, selected, extraToggles, extraSelected, extraSelects, extraSelectValues) {
    var rows = allCols.map(function (c) {
      return '<label class="column-toggle-row"><input type="checkbox" data-col-id="' + c.id + '"' + (selected[c.id] ? ' checked' : '') + '><span>' + escapeHtml(c.label) + '</span></label>';
    }).join('');
    var extraRows = extraToggles.map(function (t) {
      return '<label class="column-toggle-row"><input type="checkbox" data-extra-id="' + t.id + '"' + (extraSelected[t.id] ? ' checked' : '') + '><span>' + t.label + '</span></label>';
    }).join('');
    var selectRows = (extraSelects || []).map(function (s) {
      var opts = s.options.map(function (o) {
        return '<option value="' + escapeHtml(o.value) + '"' + (extraSelectValues[s.id] === o.value ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
      }).join('');
      return '<div class="form-row">' +
        '<label>' + escapeHtml(s.label) + '</label>' +
        '<select data-select-id="' + s.id + '">' + opts + '</select>' +
        (s.hint ? '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + escapeHtml(s.hint) + '</div>' : '') +
        '</div>';
    }).join('');
    return '' +
      '<span class="close-x" id="eo-close">&times;</span>' +
      '<h2>' + escapeHtml(ctx.title) + '</h2>' +
      '<p style="font-size:12.5px;color:var(--text-muted)">' + ctx.intro + '</p>' +
      selectRows +
      (extraRows ? '<div style="margin-bottom:10px">' + extraRows + '</div>' : '') +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      '<button class="btn" id="eo-all" type="button">Select All</button>' +
      '<button class="btn" id="eo-none" type="button">Select None</button>' +
      '</div>' +
      '<div class="column-toggle-list" id="eo-columns" style="max-height:280px">' + rows + '</div>' +
      '<div class="form-actions">' +
      '<button class="btn" id="eo-cancel" type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="eo-export" type="button">Export</button>' +
      '</div>';
  }

  function setAll(allCols, checked) {
    allCols.forEach(function (c) {
      var el = document.querySelector('#eo-columns input[data-col-id="' + c.id + '"]');
      if (el) el.checked = checked;
    });
  }

  function close() { document.getElementById('export-options-modal-backdrop').classList.add('hidden'); }

  function confirm(ctx, project, allCols, extraToggles, extraSelects) {
    var selectedIds = allCols.map(function (c) { return c.id; })
      .filter(function (id) { var el = document.querySelector('#eo-columns input[data-col-id="' + id + '"]'); return el && el.checked; });
    var settingsPatch = {}; settingsPatch[ctx.settingsKey] = selectedIds;

    var extraValues = {};
    (extraToggles || []).forEach(function (t) {
      var el = document.querySelector('#export-options-modal input[data-extra-id="' + t.id + '"]');
      var val = el ? el.checked : t.defaultValue;
      extraValues[t.id] = val;
      settingsPatch[t.settingsKey] = val;
    });
    (extraSelects || []).forEach(function (s) {
      var el = document.querySelector('#export-options-modal select[data-select-id="' + s.id + '"]');
      var val = el ? el.value : s.defaultValue;
      extraValues[s.id] = val;
      settingsPatch[s.settingsKey] = val;
    });

    S.updateSettings(project.id, settingsPatch);
    close();
    ctx.run(project, selectedIds, extraValues).catch(function (e) {
      console.error(e); CG.Toast.show('Export failed: ' + e.message, 'error');
    });
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  return {
    openForExcelExport: function () { open('excel'); },
    openForImageExport: function () { open('image'); }
  };
})();
