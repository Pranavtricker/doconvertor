'use strict';

(function () {
  const doc = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const sections = ['home', 'about', 'projects', 'skills', 'contact']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  // Set year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Theme: load preference
  const storedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
    doc.classList.add('dark');
  } else {
    doc.classList.remove('dark');
  }
  updateThemeIcon();

  // Theme toggle
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isDark = doc.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeIcon();
    });
  }

  function updateThemeIcon() {
    if (!themeIcon) return;
    const isDark = doc.classList.contains('dark');
    themeIcon.textContent = isDark ? '☀️' : '🌙';
  }

  // Active link highlighting via IntersectionObserver
  const linkMap = new Map();
  navLinks.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      linkMap.set(href.slice(1), a);
    }
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const link = linkMap.get(id);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('bg-white/10', 'text-white'));
          link.classList.add('bg-white/10', 'text-white');
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0.01 }
  );

  sections.forEach(sec => observer.observe(sec));

  // Expose contact handler
  window.handleContact = function handleContact(e) {
    e.preventDefault();
    const form = e.target;
    const [name, email, message] = Array.from(form.querySelectorAll('input, textarea'));
    const subject = encodeURIComponent(`Portfolio Inquiry from ${name.value}`);
    const body = encodeURIComponent(`${message.value}\n\n— ${name.value} (${email.value})`);
    window.location.href = `mailto:you@example.com?subject=${subject}&body=${body}`;
    return false;
  };
})();
