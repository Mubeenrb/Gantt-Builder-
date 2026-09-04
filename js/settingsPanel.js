window.CG = window.CG || {};

CG.Settings = (function () {
  var S = CG.State;

  var DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy', 'MMM d, yyyy'];

  function open() {
    var project = S.getActiveProject();
    if (!project) return;
    var backdrop = document.getElementById('settings-modal-backdrop');
    var modal = document.getElementById('settings-modal');
    modal.innerHTML = buildHtml(project);
    backdrop.classList.remove('hidden');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.getElementById('settings-close').onclick = close;
    wireAppearance(project);
    wireColumns(project);
    wireCategories(project);
    wireCustomFields(project);
  }

  function close() { document.getElementById('settings-modal-backdrop').classList.add('hidden'); }

  function buildHtml(project) {
    return '' +
      '<span class="close-x" id="settings-close">&times;</span>' +
      '<h2>Settings</h2>' +

      '<div class="settings-section"><h3>Project</h3>' +
      '<div class="form-row"><label>Project name</label><input type="text" id="s-project-name" value="' + escapeAttr(project.name) + '"></div>' +
      '</div>' +

      '<div class="settings-section"><h3>Appearance</h3><div class="settings-grid">' +
      '<div class="form-row"><label>Theme</label><select id="s-theme">' +
      opt('light', 'Light', project.settings.theme) + opt('dark', 'Dark', project.settings.theme) + opt('system', 'Follow System', project.settings.theme) +
      '</select></div>' +
      '<div class="form-row"><label>Date format</label><select id="s-dateformat">' +
      DATE_FORMATS.map(function (f) { return opt(f, f, project.settings.dateFormat); }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>Week starts on</label><select id="s-weekstart">' + opt('mon', 'Monday', project.settings.weekStart) + opt('sun', 'Sunday', project.settings.weekStart) + '</select></div>' +
      '<div class="form-row"><label>Row height (px)</label><input type="number" id="s-rowheight" min="22" max="60" value="' + project.settings.rowHeight + '"></div>' +
      '<div class="form-row"><label>Bar height (px)</label><input type="number" id="s-barheight" min="10" max="40" value="' + project.settings.barHeight + '"></div>' +
      '<div class="form-row"><label>Font size (px)</label><input type="number" id="s-fontsize" min="10" max="18" value="' + project.settings.fontSize + '"></div>' +
      '</div></div>' +

      '<div class="settings-section"><h3>Visible Columns</h3><div class="column-toggle-list" id="s-columns"></div></div>' +

      '<div class="settings-section"><h3>Categories</h3><div id="s-categories"></div><button class="btn" id="s-cat-add" type="button">+ Add category</button></div>' +

      '<div class="settings-section"><h3>Custom Fields</h3><div id="s-customfields"></div><button class="btn" id="s-cf-add" type="button">+ Add custom field</button></div>' +

      '<div class="form-actions"><button class="btn btn-primary" id="settings-done" type="button">Done</button></div>';
  }

  function opt(value, label, selected) { return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + label + '</option>'; }
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  function wireAppearance(project) {
    document.getElementById('s-theme').addEventListener('change', function (ev) {
      S.updateSettings(project.id, { theme: ev.target.value });
      CG.applyTheme();
    });
    var nameInput = document.getElementById('s-project-name');
    nameInput.addEventListener('change', function () { S.renameProject(project.id, nameInput.value); });
    nameInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); nameInput.blur(); } });
    document.getElementById('s-dateformat').addEventListener('change', function (ev) { S.updateSettings(project.id, { dateFormat: ev.target.value }); });
    document.getElementById('s-weekstart').addEventListener('change', function (ev) { S.updateSettings(project.id, { weekStart: ev.target.value }); });
    document.getElementById('s-rowheight').addEventListener('change', function (ev) { S.updateSettings(project.id, { rowHeight: Number(ev.target.value) || 32 }); });
    document.getElementById('s-barheight').addEventListener('change', function (ev) { S.updateSettings(project.id, { barHeight: Number(ev.target.value) || 20 }); });
    document.getElementById('s-fontsize').addEventListener('change', function (ev) { S.updateSettings(project.id, { fontSize: Number(ev.target.value) || 13 }); });
    document.getElementById('settings-done').addEventListener('click', close);
  }

  function wireColumns(project) {
    var wrap = document.getElementById('s-columns');
    wrap.innerHTML = '';
    var all = CG.TaskTable.getAllColumns(project);
    var visible = project.settings.visibleColumns || [];
    all.forEach(function (col) {
      var row = document.createElement('label');
      row.className = 'column-toggle-row';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = visible.indexOf(col.id) !== -1;
      cb.addEventListener('change', function () {
        var cur = (project.settings.visibleColumns || []).slice();
        if (cb.checked) { if (cur.indexOf(col.id) === -1) cur.push(col.id); }
        else { cur = cur.filter(function (id) { return id !== col.id; }); }
        S.updateSettings(project.id, { visibleColumns: cur });
      });
      row.appendChild(cb);
      var span = document.createElement('span'); span.textContent = col.label; row.appendChild(span);
      wrap.appendChild(row);
    });
  }

  function wireCategories(project) {
    var wrap = document.getElementById('s-categories');
    function render() {
      wrap.innerHTML = '';
      project.categories.forEach(function (cat) {
        var row = document.createElement('div'); row.className = 'custom-field-row';
        var colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = cat.color;
        colorInput.addEventListener('change', function () { S.updateCategory(project.id, cat.id, { color: colorInput.value }); });
        var nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.value = cat.name; nameInput.style.flex = '1';
        nameInput.addEventListener('change', function () { S.updateCategory(project.id, cat.id, { name: nameInput.value }); });
        var del = document.createElement('span'); del.className = 'remove-dep'; del.textContent = '✕';
        del.addEventListener('click', function () { S.deleteCategory(project.id, cat.id); render(); });
        row.appendChild(colorInput); row.appendChild(nameInput); row.appendChild(del);
        wrap.appendChild(row);
      });
    }
    render();
    document.getElementById('s-cat-add').addEventListener('click', function () {
      S.addCategory(project.id, 'New Category', '#78909c');
      render();
    });
  }

  function wireCustomFields(project) {
    var wrap = document.getElementById('s-customfields');
    function render() {
      wrap.innerHTML = '';
      project.customFieldDefs.forEach(function (def) {
        var row = document.createElement('div'); row.className = 'custom-field-row';
        var nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.value = def.name; nameInput.style.flex = '1';
        nameInput.addEventListener('change', function () { S.updateCustomFieldDef(project.id, def.id, { name: nameInput.value }); });
        var typeSel = document.createElement('select');
        ['text', 'number', 'date', 'select'].forEach(function (ty) {
          var o = document.createElement('option'); o.value = ty; o.textContent = ty; if (ty === def.type) o.selected = true; typeSel.appendChild(o);
        });
        typeSel.addEventListener('change', function () { S.updateCustomFieldDef(project.id, def.id, { type: typeSel.value }); render(); });
        var del = document.createElement('span'); del.className = 'remove-dep'; del.textContent = '✕';
        del.addEventListener('click', function () { S.deleteCustomFieldDef(project.id, def.id); render(); });
        row.appendChild(nameInput); row.appendChild(typeSel);
        if (def.type === 'select') {
          var optsInput = document.createElement('input'); optsInput.type = 'text'; optsInput.placeholder = 'comma,separated,options';
          optsInput.value = (def.options || []).join(',');
          optsInput.addEventListener('change', function () { S.updateCustomFieldDef(project.id, def.id, { options: optsInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) }); });
          row.appendChild(optsInput);
        }
        row.appendChild(del);
        wrap.appendChild(row);
      });
    }
    render();
    document.getElementById('s-cf-add').addEventListener('click', function () {
      var id = S.addCustomFieldDef(project.id, { name: 'New Field', type: 'text' });
      var cur = (project.settings.visibleColumns || []).slice();
      cur.push(id);
      S.updateSettings(project.id, { visibleColumns: cur });
      render();
    });
  }

  return { open: open, close: close, DATE_FORMATS: DATE_FORMATS };
})();
