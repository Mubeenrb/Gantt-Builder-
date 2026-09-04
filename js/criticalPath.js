window.CG = window.CG || {};

/*
 * Critical Path Method (CPM) engine.
 * Only leaf tasks (no children) participate as scheduling nodes; parent/summary
 * tasks are display-only rollups of their children's date range and are flagged
 * critical for display if any descendant leaf is critical.
 */
CG.CPM = (function () {
  var D = CG.Dates;

  function schedDuration(t) {
    // Half-open-interval elapsed days: EF = ES + schedDuration lands the day
    // AFTER the task's last inclusive working day, so a back-to-back FS chain
    // (predecessor ends Dec 17, successor starts Dec 18) correctly yields zero
    // float. Matches CG.Dates.duration's inclusive convention used everywhere
    // else in the app (0 for milestones, since they're a zero-length point event).
    return D.duration(t);
  }

  function compute(tasks) {
    var result = {
      criticalTaskIds: {},
      earliestStart: {}, earliestFinish: {}, latestStart: {}, latestFinish: {},
      hasCycle: false, cycleTaskIds: []
    };

    var childParentIds = {};
    tasks.forEach(function (t) { if (t.parentId) childParentIds[t.parentId] = true; });
    var leaves = tasks.filter(function (t) { return !childParentIds[t.id]; });
    if (!leaves.length) return result;

    var byId = {};
    leaves.forEach(function (t) { byId[t.id] = t; });

    var adj = {}; // predecessor -> [successor, type, lag][]
    var inDegree = {};
    leaves.forEach(function (t) { adj[t.id] = []; inDegree[t.id] = 0; });

    leaves.forEach(function (t) {
      (t.dependencies || []).forEach(function (dep) {
        if (!byId[dep.predecessorId]) return; // orphaned or points at a non-leaf; ignore
        adj[dep.predecessorId].push({ to: t.id, type: dep.type || 'FS', lag: dep.lagDays || 0 });
        inDegree[t.id]++;
      });
    });

    // Kahn's algorithm: topological order + cycle detection
    var queue = leaves.filter(function (t) { return inDegree[t.id] === 0; }).map(function (t) { return t.id; });
    var topo = [];
    var remainingDegree = Object.assign({}, inDegree);
    while (queue.length) {
      var id = queue.shift();
      topo.push(id);
      adj[id].forEach(function (edge) {
        remainingDegree[edge.to]--;
        if (remainingDegree[edge.to] === 0) queue.push(edge.to);
      });
    }
    if (topo.length < leaves.length) {
      result.hasCycle = true;
      result.cycleTaskIds = leaves.map(function (t) { return t.id; }).filter(function (id) { return topo.indexOf(id) === -1; });
      return result;
    }

    var ES = {}, EF = {}, LS = {}, LF = {};

    var predecessorsOf = {};
    leaves.forEach(function (t) { predecessorsOf[t.id] = []; });
    leaves.forEach(function (t) {
      (t.dependencies || []).forEach(function (dep) {
        if (!byId[dep.predecessorId]) return;
        predecessorsOf[t.id].push({ from: dep.predecessorId, type: dep.type || 'FS', lag: dep.lagDays || 0 });
      });
    });

    // Forward pass: a true root (no predecessors) is anchored to its own
    // stored start; every other node's ES comes purely from constraint
    // propagation, NOT from its own manually-placed start. This is what
    // makes the critical path span the actual longest dependency chain
    // rather than collapsing to near-zero whenever a task happens to be
    // scheduled with some slack already baked into its manual date.
    topo.forEach(function (id) {
      var t = byId[id];
      var dur = schedDuration(t);
      if (!predecessorsOf[id].length) {
        ES[id] = D.parseISO(t.start) / D.MS_PER_DAY;
      } else {
        var es = -Infinity;
        predecessorsOf[id].forEach(function (edge) {
          var predEF = EF[edge.from], predES = ES[edge.from];
          var candidate;
          if (edge.type === 'FS') candidate = predEF + edge.lag;
          else if (edge.type === 'SS') candidate = predES + edge.lag;
          else if (edge.type === 'FF') candidate = predEF + edge.lag - dur;
          else /* SF */ candidate = predES + edge.lag - dur;
          if (candidate > es) es = candidate;
        });
        ES[id] = es;
      }
      EF[id] = ES[id] + dur;
    });

    var projectFinish = Math.max.apply(null, topo.map(function (id) { return EF[id]; }));

    // Backward pass (reverse topological order)
    var reverseTopo = topo.slice().reverse();
    reverseTopo.forEach(function (id) {
      var successors = adj[id];
      var t = byId[id];
      var dur = schedDuration(t);
      if (!successors.length) {
        LF[id] = projectFinish;
      } else {
        var lf = Infinity;
        successors.forEach(function (edge) {
          var succLS = LS[edge.to], succLF = LF[edge.to];
          var candidate;
          if (edge.type === 'FS') candidate = succLS - edge.lag;
          else if (edge.type === 'SS') candidate = succLS - edge.lag + dur;
          else if (edge.type === 'FF') candidate = succLF - edge.lag;
          else /* SF */ candidate = succLF - edge.lag + dur;
          if (candidate < lf) lf = candidate;
        });
        LF[id] = lf;
      }
      LS[id] = LF[id] - dur;
    });

    var criticalSet = {};
    topo.forEach(function (id) {
      var float = LS[id] - ES[id];
      result.earliestStart[id] = ES[id];
      result.earliestFinish[id] = EF[id];
      result.latestStart[id] = LS[id];
      result.latestFinish[id] = LF[id];
      if (Math.round(float) === 0) criticalSet[id] = true;
    });

    // Bubble critical flag up to ancestors for display purposes
    var byIdAll = {};
    tasks.forEach(function (t) { byIdAll[t.id] = t; });
    Object.keys(criticalSet).forEach(function (id) {
      var cur = byIdAll[id];
      while (cur && cur.parentId) {
        criticalSet[cur.parentId] = true;
        cur = byIdAll[cur.parentId];
      }
    });

    result.criticalTaskIds = criticalSet;
    return result;
  }

  return { compute: compute, schedDuration: schedDuration };
})();
