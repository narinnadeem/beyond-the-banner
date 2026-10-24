// Simulated "analytics" tracker: reports time on page + scroll depth.
(function () {
  var id = sessionStorage.getItem('pid'); if (!id) return;
  var start = Date.now(), maxScroll = 0;
  addEventListener('scroll', function () {
    var h = document.documentElement;
    var d = Math.round(100 * (h.scrollTop + innerHeight) / h.scrollHeight);
    if (d > maxScroll) maxScroll = Math.min(d, 100);
  });
  function send() {
    navigator.sendBeacon('/api/track/analytics', JSON.stringify({
      id: id, page: location.pathname, referrer: document.referrer || '(none)',
      secondsOnPage: Math.round((Date.now() - start) / 1000), scrollDepthPercent: maxScroll
    }));
  }
  send(); setInterval(send, 15000);
  window.__flushAnalytics = send;
})();
