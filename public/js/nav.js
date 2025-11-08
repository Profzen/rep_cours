// public/js/nav.js
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.burger');
  if (!burger) return;
  const menu = createMobileMenu();
  burger.addEventListener('click', () => {
    menu.classList.toggle('open');
  });

  function createMobileMenu() {
    const menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong style="color:var(--primary)">Rep Cours</strong>
        <button id="close-menu" style="background:transparent;border:none;color:#fff;font-size:18px">✕</button>
      </div>
      <a href="index.html">Accueil</a>
      <a href="library.html">Bibliothèque</a>
      <a href="about.html">À propos</a>
      <a href="contact.html">Contact</a>
      <a href="admin.html">Admin</a>
    `;
    document.body.appendChild(menu);
    document.getElementById('close-menu').addEventListener('click', () => menu.classList.remove('open'));
    return menu;
  }
});
