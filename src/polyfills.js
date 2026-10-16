// Tiny safety nets for older mobile browsers.
if (!window.requestIdleCallback) {
  window.requestIdleCallback = (cb) => setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: false }), 1);
}

// CanvasRenderingContext2D.roundRect (Safari < 16)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}
