window.CG = window.CG || {};

CG.Id = (function () {
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var orderCounter = 1000;
  function nextOrder() {
    orderCounter += 1000;
    return orderCounter;
  }

  function orderBetween(a, b) {
    if (a == null && b == null) return nextOrder();
    if (a == null) return b - 1000;
    if (b == null) return a + 1000;
    return (a + b) / 2;
  }

  return { uuid: uuid, nextOrder: nextOrder, orderBetween: orderBetween };
})();
