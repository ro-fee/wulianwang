/**
 * Chart.js — Crosshair + Enhanced Tooltip
 * Auto-registers globally for all Chart instances
 */
(function () {
  if (window.__chartEnhanceLoaded) return;
  window.__chartEnhanceLoaded = true;

  if (typeof Chart === 'undefined') {
    document.addEventListener('DOMContentLoaded', arguments.callee);
    return;
  }

  // ── Crosshair Plugin ──
  Chart.register({
    id: 'crosshairPlugin',
    afterDraw: function (chart) {
      if (!chart.tooltip || !chart.tooltip._active || !chart.tooltip._active.length) return;

      var active = chart.tooltip._active;
      var ctx = chart.ctx;
      var xAxis = chart.scales.x;
      var yAxis = chart.scales.y;
      var x = active[0].element.x;
      var topY = yAxis.top;
      var bottomY = yAxis.bottom;
      var leftX = xAxis.left;
      var rightX = xAxis.right;

      ctx.save();
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.strokeStyle = 'rgba(0,229,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizontal line through first active point
      var y = active[0].element.y;
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.strokeStyle = 'rgba(0,229,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glow dot at intersection
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,229,255,0.85)';
      ctx.fill();
      ctx.shadowColor = 'rgba(0,229,255,0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Draw value label near the dot
      var dataset = chart.data.datasets[active[0].datasetIndex];
      if (dataset && dataset.data[active[0].index] !== undefined) {
        var val = dataset.data[active[0].index];
        if (val !== null && val !== undefined) {
          var label = dataset.label || '';
          var str = label + ': ' + Number(val).toFixed(1) + '°';
          var textX = x + 12;
          var textY = y - 10;
          if (textX + 120 > rightX) textX = x - 130;
          if (textY < topY + 16) textY = y + 18;

          ctx.fillStyle = 'rgba(8,12,20,0.9)';
          ctx.strokeStyle = 'rgba(0,229,255,0.4)';
          ctx.lineWidth = 1;
          var pw = ctx.measureText(str).width + 16;
          ctx.beginPath();
          ctx.roundRect(textX - 8, textY - 13, pw, 22, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#00e5ff';
          ctx.font = '11px "JetBrains Mono","Consolas",monospace';
          ctx.textBaseline = 'middle';
          ctx.fillText(str, textX, textY);
        }
      }
    }
  });

  // ── Enhanced default tooltip ──
  if (Chart.defaults && Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
    Chart.defaults.plugins.tooltip.mode = 'index';
    Chart.defaults.plugins.tooltip.intersect = false;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(8,12,20,0.92)';
    Chart.defaults.plugins.tooltip.titleColor = '#00e5ff';
    Chart.defaults.plugins.tooltip.bodyColor = '#e8ecf2';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,229,255,0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.titleFont = { family: '"Rajdhani","PingFang SC",sans-serif', size: 13, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyFont = { family: '"JetBrains Mono","Consolas",monospace', size: 11 };
  }

  // ── Add zoom plugin if available ──
  function tryAddZoom() {
    if (typeof window.chartjsPluginZoom === 'undefined') {
      // Try again later
      setTimeout(tryAddZoom, 200);
      return;
    }

    // Patch existing charts with zoom
    var instances = Object.values(Chart.instances || {});
    // Actually, we'll apply per-chart in arm.js and other places.
    // For now, just ensure the plugin is registered globally.
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Ensure all existing charts get enhanced tooltip defaults
    Object.values(Chart.instances || {}).forEach(function (chart) {
      if (chart.options && chart.options.plugins) {
        chart.options.plugins.tooltip = Object.assign(
          chart.options.plugins.tooltip || {},
          Chart.defaults.plugins.tooltip
        );
      }
    });
  });
})();
