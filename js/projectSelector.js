window.CG = window.CG || {};

CG.Projects = (function () {
  var S = CG.State;

  function render() {
    var wrap = document.getElementById('project-tabs');
    wrap.innerHTML = '';
    var activeId = S.getActiveProjectId();
    S.getOpenProjectIds().forEach(function (id) {
      var project = S.getProject(id);
      var tab = document.createElement('div');
      tab.className = 'project-tab' + (id === activeId ? ' active' : '') + (S.isDirty(id) ? ' dirty' : '');
      var dot = document.createElement('span'); dot.className = 'dirty-dot'; tab.appendChild(dot);
      var label = document.createElement('span');
      label.textContent = project.name;
      label.title = 'Double-click to rename';
      label.addEventListener('dblclick', function (ev) {
        ev.stopPropagation();
        label.contentEditable = 'true';
        label.focus();
        document.execCommand('selectAll', false, null);
      });
      label.addEventListener('click', function (ev) { if (label.isContentEditable) ev.stopPropagation(); });
      label.addEventListener('blur', function () {
        if (label.contentEditable !== 'true') return;
        label.contentEditable = 'false';
        var v = label.textContent.trim();
        if (v && v !== project.name) S.renameProject(id, v);
        else label.textContent = project.name;
      });
      label.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); label.blur(); }
        else if (ev.key === 'Escape') { label.textContent = project.name; label.contentEditable = 'false'; label.blur(); }
      });
      tab.appendChild(label);
      var close = document.createElement('span'); close.className = 'close-tab'; close.textContent = '✕';
      close.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (S.isDirty(id) && !confirm('"' + project.name + '" has unsaved changes (autosaved locally, but not exported to a file). Close anyway?')) return;
        S.closeProject(id);
      });
      tab.appendChild(close);
      tab.addEventListener('click', function () { S.switchActive(id); });
      wrap.appendChild(tab);
    });
  }

  function openNewProjectModal() {
    var backdrop = document.getElementById('newproject-modal-backdrop');
    var modal = document.getElementById('newproject-modal');
    modal.innerHTML =
      '<span class="close-x" id="np-close">&times;</span>' +
      '<h2>New Project</h2>' +
      '<div class="form-row"><label>Project name</label><input type="text" id="np-name" value="New CAPEX Project"></div>' +
      '<div class="form-actions"><button class="btn" id="np-cancel" type="button">Cancel</button><button class="btn btn-primary" id="np-create" type="button">Create</button></div>';
    backdrop.classList.remove('hidden');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) hideNew(); };
    document.getElementById('np-close').onclick = hideNew;
    document.getElementById('np-cancel').onclick = hideNew;
    document.getElementById('np-create').onclick = function () {
      var name = document.getElementById('np-name').value.trim() || 'New Project';
      S.newProject(name);
      hideNew();
    };
    document.getElementById('np-name').focus();
    document.getElementById('np-name').select();
  }

  function hideNew() { document.getElementById('newproject-modal-backdrop').classList.add('hidden'); }

  return { render: render, openNewProjectModal: openNewProjectModal };
})();
