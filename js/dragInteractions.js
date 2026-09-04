window.CG = window.CG || {};

CG.Drag = (function () {
  var S = CG.State, D = CG.Dates;
  var NS = 'http://www.w3.org/2000/svg';

  function bindBar(groupEl, task) {
    groupEl.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (ev.target.classList.contains('resize-handle') || ev.target.classList.contains('dep-nub')) return;
      ev.preventDefault();
      S.setSelectedTask(task.id);
      startMove(ev, groupEl, task);
    });
  }

  function startMove(ev, groupEl, task) {
    var layout = CG.GanttChart.getLayout();
    if (!layout) return;
    var startX = ev.clientX;
    var project = layout.project;
    var moved = false;

    function onMove(mv) {
      var dxPx = mv.clientX - startX;
      var dxDays = Math.round(dxPx / layout.pxPerDay);
      moved = dxDays !== 0;
      groupEl.setAttribute('transform', 'translate(' + (dxDays * layout.pxPerDay) + ',0)');
      groupEl.dataset.dxDays = dxDays;
    }
    function onUp(up) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      var dxDays = Number(groupEl.dataset.dxDays || 0);
      groupEl.removeAttribute('transform');
      delete groupEl.dataset.dxDays;
      if (moved && dxDays !== 0) {
        S.moveTaskDates(project.id, task.id, D.addDays(task.start, dxDays), D.addDays(task.end, dxDays));
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function bindResizeHandle(handleEl, task, edge, groupEl) {
    handleEl.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      S.setSelectedTask(task.id);
      startResize(ev, groupEl, task, edge);
    });
  }

  function startResize(ev, groupEl, task, edge) {
    var layout = CG.GanttChart.getLayout();
    if (!layout) return;
    var startX = ev.clientX;
    var project = layout.project;
    var bg = groupEl.querySelector('.bar-bg');
    var progressRect = groupEl.querySelector('.bar-progress');
    var origX = parseFloat(bg.getAttribute('x'));
    var origW = parseFloat(bg.getAttribute('width'));
    var pendingDays = 0;

    function onMove(mv) {
      var dxPx = mv.clientX - startX;
      var dxDays = Math.round(dxPx / layout.pxPerDay);
      var newX = origX, newW = origW;
      if (edge === 'start') {
        var maxShift = D.diffDays(task.end, task.start); // can't push start past end
        var clamped = Math.max(-999999, Math.min(dxDays, maxShift));
        newX = origX + clamped * layout.pxPerDay;
        newW = origW - clamped * layout.pxPerDay;
        pendingDays = clamped;
      } else {
        var minShift = -(D.diffDays(task.end, task.start));
        var clampedE = Math.max(minShift, dxDays);
        newW = origW + clampedE * layout.pxPerDay;
        pendingDays = clampedE;
      }
      newW = Math.max(layout.pxPerDay * 0.8, newW);
      bg.setAttribute('x', newX); bg.setAttribute('width', newW);
      if (progressRect) progressRect.setAttribute('x', newX);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (pendingDays !== 0) {
        if (edge === 'start') {
          var newStart = D.addDays(task.start, pendingDays);
          S.updateTask(project.id, task.id, { start: newStart });
        } else {
          var newEnd = D.addDays(task.end, pendingDays);
          if (D.isBefore(newEnd, task.start)) newEnd = task.start;
          S.updateTask(project.id, task.id, { end: newEnd });
        }
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function bindDepNub(nubEl, task, edge) {
    nubEl.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      startDependencyDraw(ev, task, edge, nubEl);
    });
  }

  function startDependencyDraw(ev, task, fromEdge, nubEl) {
    var layout = CG.GanttChart.getLayout();
    if (!layout) return;
    var bodySvg = document.getElementById('gantt-body-svg');
    var draft = document.createElementNS(NS, 'path');
    draft.setAttribute('class', 'dependency-arrow-draft');
    bodySvg.appendChild(draft);

    var startX = parseFloat(nubEl.getAttribute('cx'));
    var startY = parseFloat(nubEl.getAttribute('cy'));

    function onMove(mv) {
      var rect = bodySvg.getBoundingClientRect();
      var lx = mv.clientX - rect.left;
      var ly = mv.clientY - rect.top;
      draft.setAttribute('d', 'M' + startX + ',' + startY + ' L' + lx + ',' + ly);
    }
    function onUp(up) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      draft.remove();
      var el = document.elementFromPoint(up.clientX, up.clientY);
      var targetNub = el && el.closest ? el.closest('.dep-nub') : null;
      if (!targetNub) return;
      var targetTaskId = targetNub.dataset.taskId;
      var toEdge = targetNub.dataset.edge;
      if (targetTaskId === task.id) return;

      var type;
      if (fromEdge === 'end' && toEdge === 'start') type = 'FS';
      else if (fromEdge === 'start' && toEdge === 'start') type = 'SS';
      else if (fromEdge === 'end' && toEdge === 'end') type = 'FF';
      else type = 'SF';

      var project = layout.project;
      var result = S.addDependency(project.id, targetTaskId, task.id, type, 0);
      if (!result.ok && result.reason === 'cycle') {
        CG.Toast.show('That dependency would create a circular reference — not added.', 'error');
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return { bindBar: bindBar, bindResizeHandle: bindResizeHandle, bindDepNub: bindDepNub };
})();
