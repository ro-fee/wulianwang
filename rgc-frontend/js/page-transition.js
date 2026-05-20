/**
 * Page transition — starfield overlay
 * Renders a mini starfield during navigation so particles never disappear
 */
(function () {
  if (window.__pt) return;
  window.__pt = true;

  // ── Body fade-in on new page ──
  var s = document.createElement('style');
  s.textContent = 'body{animation:pt-in .4s cubic-bezier(.16,1,.3,1) both}@keyframes pt-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(s);

  // ── Build overlay with its own starfield canvas ──
  var ov = document.createElement('div');
  ov.id = '__pt_overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#080c14;opacity:0;pointer-events:none;transition:opacity .45s ease';

  var cvs = document.createElement('canvas');
  cvs.style.cssText = 'position:absolute;inset:0;display:block';
  ov.appendChild(cvs);
  document.body.appendChild(ov);

  // ── Mini starfield on the overlay canvas ──
  var ctx = cvs.getContext('2d');
  var stars = [];
  var w, h, animId;

  function resize() {
    w = cvs.width = ov.clientWidth || window.innerWidth;
    h = cvs.height = ov.clientHeight || window.innerHeight;
  }

  function spawnStars(n) {
    stars = [];
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2.2 + 0.4,
        a: Math.random() * 0.6 + 0.25,
        va: Math.random() * 0.02 + 0.005 + Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.25,
        c: ['0,229,255','200,220,255','255,107,107','0,255,136','180,200,255','255,200,150'][Math.floor(Math.random()*6)]
      });
    }
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.x += st.vx; st.y += st.vy;
      if (st.x < -10) st.x = w + 10; if (st.x > w + 10) st.x = -10;
      if (st.y < -10) st.y = h + 10; if (st.y > h + 10) st.y = -10;
      var a = st.a * (0.6 + 0.4 * Math.sin(t * 0.004 + st.va));
      if (a < 0.05) a = 0.05;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + st.c + ',' + a + ')';
      ctx.fill();
      if (st.r > 1.5) {
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + st.c + ',' + (a * 0.15) + ')';
        ctx.fill();
      }
    }
  }

  function startStars() {
    resize();
    spawnStars(1000);
    var t = 0;
    function loop(ts) { t = ts; drawStars(t); animId = requestAnimationFrame(loop); }
    animId = requestAnimationFrame(loop);
  }

  function stopStars() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  // ── Click handler ──
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (a.target === '_blank') return;
    if (a.host && a.host !== window.location.host) return;

    e.preventDefault();

    // Start the mini starfield BEFORE showing overlay
    startStars();

    // Show overlay with starfield
    ov.style.opacity = '1';
    ov.style.pointerEvents = 'auto';

    // Navigate after a brief moment
    setTimeout(function () {
      window.location = href;
    }, 400);
  });

  // Clean up on page unload (stop animation)
  window.addEventListener('beforeunload', stopStars);
})();
