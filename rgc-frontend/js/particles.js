/**
 * Cyberpunk Starfield — cosmic depth + data network
 * Dense layered star particles with subtle connection grid
 */
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'particle-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let w, h;

  // ── Star layers ──
  const DEEP_STARS = 700;    // tiny distant stars, barely moving
  const MID_STARS = 300;     // mid-layer, slow drift
  const NEAR_STARS = 100;    // bright close stars, visible movement
  const CONNECT_DIST = 160;  // connection range for near stars

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Star class ──
  class Star {
    constructor(layer) {
      this.layer = layer;
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.z = Math.random(); // depth 0..1

      if (layer === 'deep') {
        this.size = Math.random() * 1.2 + 0.3;
        this.baseOpacity = Math.random() * 0.4 + 0.15;
        this.vx = (Math.random() - 0.5) * 0.08;
        this.vy = (Math.random() - 0.5) * 0.06;
        this.twinkleSpeed = Math.random() * 0.006 + 0.001;
        this.color = '200,220,255'; // cool white-blue
      } else if (layer === 'mid') {
        this.size = Math.random() * 1.8 + 0.6;
        this.baseOpacity = Math.random() * 0.55 + 0.35;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.15;
        this.twinkleSpeed = Math.random() * 0.008 + 0.002;
        // Mix of colors
        const colors = ['180,220,255','200,240,255','160,200,255','255,180,200','180,255,220'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      } else { // near
        this.size = Math.random() * 2.8 + 1.5;
        this.baseOpacity = Math.random() * 0.4 + 0.5;
        this.vx = (Math.random() - 0.5) * 0.45;
        this.vy = (Math.random() - 0.5) * 0.35;
        this.twinkleSpeed = Math.random() * 0.01 + 0.003;
        const colors = ['0,229,255','255,107,107','0,255,136','255,180,100','180,140,255'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      this.twinkleOffset = Math.random() * Math.PI * 2;
      this.opacity = this.baseOpacity;
    }

    update(time) {
      this.x += this.vx;
      this.y += this.vy;
      // Wrap screen edges
      if (this.x < -20) this.x = w + 20;
      if (this.x > w + 20) this.x = -20;
      if (this.y < -20) this.y = h + 20;
      if (this.y > h + 20) this.y = -20;

      // Twinkle using sine wave
      this.opacity = this.baseOpacity * (0.5 + 0.5 * Math.sin(time * this.twinkleSpeed + this.twinkleOffset));
      // Clamp
      this.opacity = Math.max(0.06, Math.min(1, this.opacity));
    }

    draw() {
      const a = this.opacity;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color},${a})`;
      ctx.fill();

      // Glow halo for near stars and bright mid stars
      if (this.layer === 'near' || (this.layer === 'mid' && this.size > 1.2)) {
        const haloSize = this.size * 4;
        const haloAlpha = a * 0.15;
        if (haloAlpha > 0.015) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, haloSize, 0, Math.PI * 2);
          const gradient = ctx.createRadialGradient(this.x, this.y, this.size * 0.5, this.x, this.y, haloSize);
          gradient.addColorStop(0, `rgba(${this.color},${haloAlpha * 2})`);
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }
    }
  }

  // ── Create stars ──
  const deepStars = [];
  const midStars = [];
  const nearStars = [];

  for (let i = 0; i < DEEP_STARS; i++) deepStars.push(new Star('deep'));
  for (let i = 0; i < MID_STARS; i++) midStars.push(new Star('mid'));
  for (let i = 0; i < NEAR_STARS; i++) nearStars.push(new Star('near'));

  const allStars = [...deepStars, ...midStars, ...nearStars];

  // ── Connection lines (near stars) ──
  function connectNear() {
    for (let i = 0; i < nearStars.length; i++) {
      for (let j = i + 1; j < nearStars.length; j++) {
        const dx = nearStars[i].x - nearStars[j].x;
        const dy = nearStars[i].y - nearStars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          // Brighter when closer, quadratic falloff for more contrast
          const ratio = 1 - dist / CONNECT_DIST;
          const alpha = ratio * ratio * 0.35; // quadratic: close=0.35, mid=0.09, far=0.02
          if (alpha < 0.015) continue;
          ctx.beginPath();
          ctx.moveTo(nearStars[i].x, nearStars[i].y);
          ctx.lineTo(nearStars[j].x, nearStars[j].y);
          ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
          // Thicker when closer
          ctx.lineWidth = 0.3 + ratio * 0.7;
          ctx.stroke();
        }
      }
    }
  }

  // ── Occasional shooting star ──
  let shootingStar = null;
  function maybeShoot() {
    if (shootingStar) return;
    if (Math.random() > 0.001) return; // ~1 per 1000 frames ≈ every 15-20 sec
    shootingStar = {
      x: Math.random() * w * 0.8 + w * 0.1,
      y: Math.random() * h * 0.5,
      vx: 3 + Math.random() * 6,
      vy: 1.5 + Math.random() * 3,
      life: 1,
      decay: 0.015 + Math.random() * 0.03,
      length: 60 + Math.random() * 120,
    };
  }

  function drawShootingStar() {
    if (!shootingStar) return;
    const s = shootingStar;
    s.x += s.vx;
    s.y += s.vy;
    s.life -= s.decay;

    if (s.life <= 0) { shootingStar = null; return; }
    if (s.x > w + 100 || s.y > h + 100) { shootingStar = null; return; }

    const endX = s.x - s.vx * s.length / 10;
    const endY = s.y - s.vy * s.length / 10;

    const gradient = ctx.createLinearGradient(s.x, s.y, endX, endY);
    gradient.addColorStop(0, `rgba(255,255,255,${s.life})`);
    gradient.addColorStop(0.3, `rgba(200,230,255,${s.life * 0.6})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bright head
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.life})`;
    ctx.fill();
  }

  // ── Animation loop ──
  function animate(time) {
    ctx.clearRect(0, 0, w, h);

    // Draw deep stars first
    deepStars.forEach(s => { s.update(time); s.draw(); });
    midStars.forEach(s  => { s.update(time); s.draw(); });
    nearStars.forEach(s => { s.update(time); s.draw(); });

    connectNear();

    maybeShoot();
    drawShootingStar();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
