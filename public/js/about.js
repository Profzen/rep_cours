// public/js/about.js
// Updated carousel, mobile nav toggle, FAQ, accessibility and small UX polish.

(function () {
  /* -------- NAV TOGGLE (mobile) -------- */
  const navToggle = document.getElementById('nav-toggle');
  const mainNav = document.getElementById('main-nav');
  const navList = document.getElementById('nav-list');

  if (navToggle && mainNav && navList) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // prevent page jump on mobile by keeping nav absolute (CSS handles top:100%)
      if (isOpen) {
        // set focus to first menu item for accessibility
        const firstLink = navList.querySelector('a');
        if (firstLink) firstLink.focus();
      }
    });

    // Close menu after clicking an item (mobile)
    Array.from(navList.querySelectorAll('a')).forEach(a => {
      a.addEventListener('click', () => {
        if (mainNav.classList.contains('open')) {
          mainNav.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  /* -------- CAROUSEL (hero-visual) -------- */
  const heroVisual = document.getElementById('hero-visual');
  if (heroVisual) {
    const slides = Array.from(heroVisual.querySelectorAll('.image'));
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const indicatorsWrap = document.getElementById('carousel-indicators');

    let idx = 0;
    let timer = null;
    const DELAY = 4500;
    let autoplay = true;

    // defensive guards
    if (!slides || slides.length === 0) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (indicatorsWrap) indicatorsWrap.style.display = 'none';
    } else {
      // ensure a visible active slide
      function ensureActive() {
        if (!slides.some(s => s.classList.contains('active'))) slides[0].classList.add('active');
      }
      ensureActive();

      // create indicators
      function createIndicators() {
        if (!indicatorsWrap) return;
        indicatorsWrap.innerHTML = '';
        slides.forEach((s, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('aria-label', `Aller à l'image ${i + 1}`);
          btn.addEventListener('click', () => {
            goTo(i);
            restartAutoplay();
          });
          indicatorsWrap.appendChild(btn);
        });
      }

      function update() {
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        if (indicatorsWrap) {
          Array.from(indicatorsWrap.children).forEach((b, i) => b.classList.toggle('active', i === idx));
        }
      }

      function goTo(n) {
        idx = ((n % slides.length) + slides.length) % slides.length;
        update();
      }
      function next() { goTo(idx + 1); }
      function prev() { goTo(idx - 1); }

      function startAutoplay() {
        stopAutoplay();
        timer = setInterval(() => { next(); }, DELAY);
      }
      function stopAutoplay() {
        if (timer) { clearInterval(timer); timer = null; }
      }
      function restartAutoplay() {
        stopAutoplay();
        startAutoplay();
      }

      // set up events
      if (prevBtn) prevBtn.addEventListener('click', () => { prev(); restartAutoplay(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { next(); restartAutoplay(); });

      // keyboard nav when the visual is focused
      heroVisual.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { prev(); restartAutoplay(); }
        if (e.key === 'ArrowRight') { next(); restartAutoplay(); }
      });

      // pause on hover/focus (desktop) and resume
      heroVisual.addEventListener('mouseenter', () => { autoplay = false; stopAutoplay(); });
      heroVisual.addEventListener('mouseleave', () => { autoplay = true; startAutoplay(); });
      heroVisual.addEventListener('focusin', () => { autoplay = false; stopAutoplay(); });
      heroVisual.addEventListener('focusout', () => { autoplay = true; startAutoplay(); });

      // swipe support (mobile)
      (function addSwipe() {
        let startX = 0;
        heroVisual.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
        heroVisual.addEventListener('touchend', e => {
          const dx = e.changedTouches[0].clientX - startX;
          if (Math.abs(dx) > 40) {
            if (dx < 0) next(); else prev();
            restartAutoplay();
          }
        }, { passive: true });
      })();

      // init
      createIndicators();
      // if first slide already had 'active' in markup, pick its index
      const initial = slides.findIndex(s => s.classList.contains('active'));
      idx = initial >= 0 ? initial : 0;
      update();
      startAutoplay();
    }
  }

  /* -------- FAQ accordion (accessible) -------- */
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-question');
    const a = item.querySelector('.faq-answer');
    if (!q || !a) return;

    q.tabIndex = 0;
    q.setAttribute('role', 'button');
    q.setAttribute('aria-expanded', 'false');
    a.setAttribute('aria-hidden', 'true');

    const toggle = () => {
      const open = item.classList.toggle('open');
      q.setAttribute('aria-expanded', open ? 'true' : 'false');
      a.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    q.addEventListener('click', toggle);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  /* Small entrance animations */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.card').forEach((el, i) => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(6px)';
      setTimeout(() => {
        el.style.transition = 'opacity 420ms ease, transform 420ms ease';
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }, 80 + i * 60);
    });
  });

  /* Accessibility: close mobile nav on Escape */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mainNav && mainNav.classList.contains('open')) {
      mainNav.classList.remove('open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      if (navToggle) navToggle.focus();
    }
  });
})();
