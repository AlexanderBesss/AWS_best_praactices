(() => {
  "use strict";

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const THEME_KEY = "aws-docs-theme-v2";
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

  /* ---------- scroll progress bar ---------- */
  const bar = document.getElementById("scroll-progress");
  const updateProgress = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    if (bar) bar.style.width = pct + "%";
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  /* ---------- reveal on scroll ---------- */
  const revealTargets = document.querySelectorAll(".sec, .toc, .card-grid, .callout");
  revealTargets.forEach((el) => el.classList.add("reveal"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("visible"));
  }

  /* ---------- code labels ---------- */
  document.querySelectorAll("pre > code").forEach((code) => {
    const match = /language-([\w-]+)/.exec(code.className);
    if (!match) return;
    const label = document.createElement("span");
    label.className = "code-lang";
    label.textContent = match[1];
    code.parentElement.appendChild(label);
  });

  /* ---------- theme toggle ---------- */
  const themeBtn = document.querySelector(".theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, root.dataset.theme);
    });
  }

  /* ---------- TOC scroll spy ---------- */
  const tocLinks = Array.from(document.querySelectorAll(".toc a[href^='#']"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const sections = Array.from(byId.keys())
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (sections.length) {
      const spy = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            tocLinks.forEach((a) => a.classList.remove("active"));
            byId.get(entry.target.id)?.classList.add("active");
          });
        },
        { rootMargin: "-15% 0px -70% 0px" }
      );
      sections.forEach((s) => spy.observe(s));
    }
  }
})();
