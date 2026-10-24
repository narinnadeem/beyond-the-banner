// Simulated "fingerprinting" tracker: builds a device profile without asking.
(function () {
  var id = sessionStorage.getItem('pid'); if (!id) return;
  var c = document.createElement('canvas'), x = c.getContext('2d'), hash = 0;
  x.font = '14px Arial'; x.fillText('beyond-the-banner', 2, 15);
  var s = c.toDataURL(); for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  navigator.sendBeacon('/api/track/fingerprint', JSON.stringify({
    id: id, screen: screen.width + 'x' + screen.height, language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cpuCores: navigator.hardwareConcurrency, canvasFingerprint: (hash >>> 0).toString(16)
  }));
})();
