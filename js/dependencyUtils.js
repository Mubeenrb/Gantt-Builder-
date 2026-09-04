window.CG = window.CG || {};

CG.Deps = (function () {
  // Build predecessor -> [successor ids] adjacency from the full task list.
  function buildAdjacency(tasks) {
    var adj = {};
    tasks.forEach(function (t) { adj[t.id] = []; });
    tasks.forEach(function (t) {
      (t.dependencies || []).forEach(function (dep) {
        if (adj[dep.predecessorId]) adj[dep.predecessorId].push(t.id);
      });
    });
    return adj;
  }

  // Would adding an edge predecessorId -> successorId create a cycle?
  function wouldCreateCycle(tasks, predecessorId, successorId) {
    if (predecessorId === successorId) return true;
    var adj = buildAdjacency(tasks);
    // Adding predecessor->successor creates a cycle if successor can already reach predecessor.
    var visited = {};
    var stack = [successorId];
    while (stack.length) {
      var cur = stack.pop();
      if (cur === predecessorId) return true;
      if (visited[cur]) continue;
      visited[cur] = true;
      (adj[cur] || []).forEach(function (next) { stack.push(next); });
    }
    return false;
  }

  // Full-graph cycle check (Kahn's algorithm) across an arbitrary task list —
  // used to validate manual edits (e.g. from the task modal) before committing.
  function hasAnyCycle(tasks) {
    var adj = buildAdjacency(tasks);
    var inDegree = {};
    tasks.forEach(function (t) { inDegree[t.id] = 0; });
    tasks.forEach(function (t) {
      (t.dependencies || []).forEach(function (dep) {
        if (inDegree[dep.predecessorId] !== undefined) inDegree[t.id]++;
      });
    });
    var queue = tasks.filter(function (t) { return inDegree[t.id] === 0; }).map(function (t) { return t.id; });
    var seen = 0;
    var remaining = Object.assign({}, inDegree);
    while (queue.length) {
      var id = queue.shift();
      seen++;
      (adj[id] || []).forEach(function (next) {
        remaining[next]--;
        if (remaining[next] === 0) queue.push(next);
      });
    }
    return seen < tasks.length;
  }

  function isDescendant(tasks, ancestorId, taskId) {
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    var cur = byId[taskId];
    while (cur && cur.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = byId[cur.parentId];
    }
    return false;
  }

  function formatDependency(dep, tasksById) {
    var t = tasksById[dep.predecessorId];
    var name = t ? t.name : dep.predecessorId;
    var lag = dep.lagDays ? (dep.lagDays > 0 ? '+' + dep.lagDays + 'd' : dep.lagDays + 'd') : '';
    return name + ' (' + dep.type + lag + ')';
  }

  var TYPES = ['FS', 'SS', 'FF', 'SF'];

  return {
    buildAdjacency: buildAdjacency,
    wouldCreateCycle: wouldCreateCycle,
    hasAnyCycle: hasAnyCycle,
    isDescendant: isDescendant,
    formatDependency: formatDependency,
    TYPES: TYPES
  };
})();
