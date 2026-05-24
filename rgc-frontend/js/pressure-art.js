/**
 * Pressure Mandala — foot-pressure generative art
 * 36 particles (18 left foot + 18 right foot) in a circle
 * Standalone: own WebSocket connection, no dependency on index.js
 */
(function () {
  const canvas = document.getElementById('pressure-mandala-canvas');
  const wrap = document.getElementById('pressure-mandala-wrap');
  const noData = document.getElementById('pressure-no-data');
  const ctx = canvas.getContext('2d');

  const N_PER_FOOT = 18;
  const N = 36; // 18 left + 18 right
  let w, h, cx, cy, R;

  // Smooth pressure targets [0..1] — indices 0..17 left, 18..35 right
  const target = new Float32Array(N);
  const current = new Float32Array(N);
  let hasData = false;
  let lastDataTime = 0;

  // ── Resize ──
  function resize() {
    const rect = wrap.getBoundingClientRect();
    w = canvas.width = rect.width * devicePixelRatio;
    h = canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    cx = w / 2;
    cy = h / 2;
    R = Math.min(w, h) * 0.38;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Particle positions — left half-circle + right half-circle ──
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pa = new Float32Array(N); // angle of each particle
  function computePositions() {
    for (let i = 0; i < N_PER_FOOT; i++) {
      // Left foot: left half (π/2 → 3π/2, i.e. top → bottom via left)
      const aL = Math.PI / 2 + (i / (N_PER_FOOT - 1)) * Math.PI;
      pa[i] = aL;
      px[i] = cx + Math.cos(aL) * R;
      py[i] = cy + Math.sin(aL) * R;
    }
    for (let i = 0; i < N_PER_FOOT; i++) {
      // Right foot: right half (3π/2 → 5π/2, i.e. bottom → top via right)
      const aR = Math.PI * 1.5 + (i / (N_PER_FOOT - 1)) * Math.PI;
      pa[N_PER_FOOT + i] = aR;
      px[N_PER_FOOT + i] = cx + Math.cos(aR) * R;
      py[N_PER_FOOT + i] = cy + Math.sin(aR) * R;
    }
  }
  computePositions();

  // ── Color ramp: blue → cyan → green → gold → coral ──
  function colorFor(t) {
    const stops = [
      { v: 0.0, r: 0, g: 136, b: 204 },
      { v: 0.25, r: 0, g: 229, b: 255 },
      { v: 0.5, r: 0, g: 255, b: 136 },
      { v: 0.75, r: 255, g: 184, b: 0 },
      { v: 1.0, r: 255, g: 107, b: 107 },
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].v && t <= stops[i + 1].v) { lo = stops[i]; hi = stops[i + 1]; break; }
    }
    const f = (t - lo.v) / (hi.v - lo.v);
    return {
      r: Math.round(lo.r + (hi.r - lo.r) * f),
      g: Math.round(lo.g + (hi.g - lo.g) * f),
      b: Math.round(lo.b + (hi.b - lo.b) * f),
    };
  }

  // ── WebSocket ──
  const WS_URL = 'ws://' + (window.location.hostname || '127.0.0.1') + ':8765';
  let socket = null;

  function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    socket = new WebSocket(WS_URL);
    socket.onmessage = function (e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.source && Array.isArray(msg.data) && msg.data.length >= 24) {
          const offset = msg.source === 'LEFT' ? 0 : N_PER_FOOT;
          const pressureStart = msg.data.length - 18; // V1=6, V2=12
          for (let i = 0; i < N_PER_FOOT; i++) {
            const raw = msg.data[pressureStart + i] || 0;
            // Normalize: /50 means 50 = full bright
            const v = Math.min(1, Math.max(0, raw / 50));
            target[offset + i] = v;
          }
          if (!hasData) {
            hasData = true;
            for (let i = 0; i < N; i++) current[i] = target[i];
            if (noData) noData.style.display = 'none';
          }
          lastDataTime = performance.now();
        }
      } catch (_) {}
    };
    socket.onclose = function () { setTimeout(connect, 2000); };
    socket.onerror = function () { socket.close(); };
  }
  connect();

  // ── Simulation: alternating left/right steps ──
  const SIM_TIMEOUT = 5000;
  let simActive = true;
  let simStartTime = 0;

  function updateSimulation(ts) {
    if (!simStartTime) {
      simStartTime = ts;
      if (noData) {
        noData.innerHTML = '<span style="color:#ffb800;font-size:.85rem;font-family:Rajdhani,sans-serif;letter-spacing:.06em">模拟演示中</span><p style="color:var(--text-muted);margin-top:6px;font-size:.75rem">连接足底传感器获取真实数据</p>';
      }
    }
    const t = (ts - simStartTime) / 1000;
    const cadence = 2.6;

    // Left foot wave — starts at heel (bottom of left arc), sweeps toward toe (top)
    simulateHalf(0, t, cadence, 0);
    // Right foot wave — half cycle behind (alternating steps)
    simulateHalf(N_PER_FOOT, t, cadence, Math.PI);
  }

  function simulateHalf(offset, t, cadence, phaseShift) {
    const phase = (t * cadence * Math.PI * 2 + phaseShift) % (Math.PI * 2);
    for (let i = 0; i < N_PER_FOOT; i++) {
      // Map i to angle within the half-circle
      const angle = (i / (N_PER_FOOT - 1)) * Math.PI;
      let dist = angle - phase;
      while (dist > Math.PI) dist -= Math.PI * 2;
      while (dist < -Math.PI) dist += Math.PI * 2;
      const sigma = (3.5 / N_PER_FOOT) * Math.PI;
      const bell = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      const noise = Math.sin(t * 7.3 + i * 1.7) * 0.05;
      const val = bell + noise;
      target[offset + i] = Math.min(1, Math.max(0, val));
    }
  }

  // ── Drawing helpers ──
  function drawGlow(x, y, r, color, alpha) {
    const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.5);
    grad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')');
    grad.addColorStop(0.4, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (alpha * 0.4) + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawConnections(start, end) {
    for (let i = start; i < end; i++) {
      const j = i + 1 >= end ? start : i + 1;
      const avg = (current[i] + current[j]) / 2;
      if (avg > 0.15) {
        const c = colorFor(avg);
        const alpha = 0.08 + avg * 0.25;
        ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
        ctx.lineWidth = 0.4 + avg * 1.6;
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[j], py[j]);
        ctx.stroke();
      }
    }
  }

  function drawParticles(start, end, idle) {
    for (let i = start; i < end; i++) {
      const v = current[i];
      const idleFlicker = idle * (0.15 + 0.1 * Math.sin(time * 0.003 + i * 0.7));
      const val = idle ? idleFlicker : v;
      const c = colorFor(val);
      const size = 1.5 + val * 13;
      const alpha = 0.35 + val * 0.65;
      if (size < 2 && idle) continue;
      const push = val * 18;
      const nx = px[i] + Math.cos(pa[i]) * push;
      const ny = py[i] + Math.sin(pa[i]) * push;
      drawGlow(nx, ny, size, c, alpha);
      ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 1.3) + ')';
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fill();
      if (val > 0.7) {
        const hotAlpha = (val - 0.7) / 0.3;
        ctx.fillStyle = 'rgba(255,255,255,' + (hotAlpha * 0.9) + ')';
        ctx.beginPath();
        ctx.arc(nx, ny, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── Animation ──
  let time = 0;
  function animate(ts) {
    time = ts;
    ctx.clearRect(0, 0, w, h);

    // Switch real ↔ sim
    const dataAge = ts - lastDataTime;
    if (hasData && dataAge < 500) {
      if (simActive && noData) noData.style.display = 'none';
      simActive = false;
      simStartTime = 0;
    } else if (hasData && dataAge > SIM_TIMEOUT) {
      simActive = true;
    }
    if (!hasData) simActive = true;
    if (simActive) updateSimulation(ts);

    // Smooth lerp
    for (let i = 0; i < N; i++) {
      current[i] += (target[i] - current[i]) * 0.12;
    }
    const idle = (!hasData && !simActive) ? 1 : 0;

    // Background rings
    ctx.strokeStyle = 'rgba(167,139,250,0.04)';
    ctx.lineWidth = 0.5;
    for (let r = R * 0.4; r < R * 1.6; r += R * 0.2) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Left/right labels
    const labelAlpha = 0.08;
    ctx.fillStyle = 'rgba(0,229,255,' + labelAlpha + ')';
    ctx.font = (R * 0.12) + 'px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEFT', cx - R * 0.5, cy);
    ctx.fillStyle = 'rgba(255,107,107,' + labelAlpha + ')';
    ctx.fillText('RIGHT', cx + R * 0.5, cy);

    // Divider line between left/right
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 1.2);
    ctx.lineTo(cx, cy + R * 1.2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Connections within each foot
    drawConnections(0, N_PER_FOOT);
    drawConnections(N_PER_FOOT, N);

    // Cross connections: left-right symmetric pairs
    for (let i = 0; i < N_PER_FOOT; i++) {
      const j = N_PER_FOOT + N_PER_FOOT - 1 - i; // mirror index in right foot
      const avg = (current[i] + current[j]) / 2;
      if (avg > 0.5) {
        const alpha = (avg - 0.5) * 0.18;
        ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[j], py[j]);
        ctx.stroke();
      }
    }

    // Draw particles
    drawParticles(0, N_PER_FOOT, idle);
    drawParticles(N_PER_FOOT, N, idle);

    // Center pulse
    let sum = 0;
    for (let i = 0; i < N; i++) sum += current[i];
    const avgPressure = sum / N;
    if (avgPressure > 0.03 || simActive) {
      const pulseR = 5 + avgPressure * 22;
      const c = colorFor(avgPressure);
      const grad = ctx.createRadialGradient(cx, cy, pulseR * 0.1, cx, cy, pulseR);
      grad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + avgPressure * 0.4) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, 2 + avgPressure * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  // Recompute on resize
  window.addEventListener('resize', function () { resize(); computePositions(); });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { resize(); computePositions(); }).observe(wrap);
  }
  requestAnimationFrame(animate);
})();
