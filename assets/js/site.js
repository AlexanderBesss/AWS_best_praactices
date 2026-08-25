(() => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("aws-docs-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

  document.querySelector(".theme-button")?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("aws-docs-theme", root.dataset.theme);
    window.location.reload();
  });

  const menu = document.querySelector(".menu-button");
  const backdrop = document.querySelector(".backdrop");
  const closeNavigation = () => {
    document.body.classList.remove("nav-open");
    menu?.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.hidden = true;
  };

  menu?.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    menu.setAttribute("aria-expanded", String(isOpen));
    if (backdrop) backdrop.hidden = !isOpen;
  });
  backdrop?.addEventListener("click", closeNavigation);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
  });
})();
