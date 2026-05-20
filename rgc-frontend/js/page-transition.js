/**
 * Page transition — fade out old page, fade in new page
 * Works in all browsers (not just Chrome)
 */
(function () {
  if (window.__pageTransitionInstalled) return;
  window.__pageTransitionInstalled = true;

  const CSS = `
    body {
      animation: pt-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    body.pt-exiting {
      animation: pt-exit 0.25s cubic-bezier(0.4, 0, 0.2, 1) both;
      pointer-events: none;
    }
    @keyframes pt-enter {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pt-exit {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.98); }
    }
  `;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Intercept same-origin link clicks
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') || link.target === '_blank') return;

    // Only intercept same-origin navigations
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
    } catch (_) { return; }

    e.preventDefault();
    document.body.classList.add('pt-exiting');
    setTimeout(function () {
      window.location = href;
    }, 230);
  });
})();
