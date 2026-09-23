/* Shared site chrome (header, sidebar navigation, footer pager) for every page.
 * Single source of truth: edit page list / links here only — the HTML pages
 * contain no header/sidebar/footer markup of their own. */
(() => {
  "use strict";

  const REPO_URL = "https://github.com/AlexanderBesss/AWS_best_praactices";

  const GROUPS = [
    ["Core Services", [
      ["EC2", "Core-Services/EC2-Best-Practices.html", "EC2 Best Practices"],
      ["S3", "Core-Services/S3-Best-Practices.html", "S3 Best Practices"],
      ["IAM", "Core-Services/IAM-Best-Practices.html", "IAM Best Practices"],
      ["VPC", "Core-Services/VPC-Best-Practices.html", "VPC Best Practices"],
    ]],
    ["Database", [
      ["RDS", "Database/RDS-Best-Practices.html", "RDS Best Practices"],
      ["DynamoDB", "Database/DynamoDB-Best-Practices.html", "DynamoDB Best Practices"],
      ["ElastiCache", "Database/ElastiCache-Best-Practices.html", "ElastiCache Best Practices"],
    ]],
    ["Architecture Patterns", [
      ["Event-driven", "Design/01-event-driven-patterns.html", "Event-Driven Architecture Patterns"],
      ["Communication", "Design/02-communication-patterns.html", "Serverless Communication Patterns"],
      ["Error handling", "Design/03-error-handling-patterns.html", "Error Handling & Resilience Patterns"],
      ["Cross-cutting", "Design/04-cross-cutting-patterns.html", "Cross-Cutting Architecture Patterns"],
      ["Database integration", "Design/05-database-integration-patterns.html", "Database Integration Patterns"],
      ["High availability & DR", "Design/06-high-availability-dr-patterns.html", "High-Availability & Disaster Recovery Patterns"],
      ["Caching & delivery", "Design/07-caching-content-delivery-patterns.html", "Caching & Content Delivery Patterns"],
      ["Compute & deployment", "Design/08-compute-deployment-patterns.html", "Compute & Deployment Patterns"],
      ["Multi-account", "Design/09-multi-account-landing-zone-patterns.html", "Multi-Account & Landing Zone Patterns"],
    ]],
    ["Serverless", [
      ["Lambda", "Serverless/Lambda-Best-Practices.html", "AWS Lambda Best Practices"],
      ["API Gateway", "Serverless/API-Gateway-Best-Practices.html", "Amazon API Gateway Best Practices"],
      ["EventBridge", "Serverless/EventBridge-Best-Practices.html", "Amazon EventBridge Best Practices"],
    ]],
    ["Networking", [
      ["CloudFront", "Networking/CloudFront-Best-Practices.html", "CloudFront Best Practices"],
      ["Route 53", "Networking/Route53-Best-Practices.html", "Route 53 Best Practices"],
      ["Load balancing", "Networking/Load-Balancing-Best-Practices.html", "Load Balancing Best Practices"],
    ]],
    ["DevOps", [
      ["CI/CD", "DevOps/CI-CD-Best-Practices.html", "CI/CD Best Practices"],
      ["CloudFormation", "DevOps/CloudFormation-Best-Practices.html", "CloudFormation Best Practices"],
      ["ECS/EKS", "DevOps/ECS-EKS-Best-Practices.html", "ECS/EKS Best Practices"],
    ]],
    ["Monitoring", [
      ["CloudWatch", "Monitoring/CloudWatch-Best-Practices.html", "CloudWatch Best Practices"],
      ["X-Ray", "Monitoring/X-Ray-Best-Practices.html", "X-Ray Best Practices"],
    ]],
    ["Security", [
      ["WAF", "Security/WAF-Best-Practices.html", "AWS WAF Best Practices"],
      ["KMS", "Security/KMS-Best-Practices.html", "AWS KMS Best Practices"],
      ["Shield", "Security/Shield-Best-Practices.html", "AWS Shield Best Practices"],
    ]],
    ["Cost Optimization", [
      ["Guide", "Cost-Optimization/Cost-Optimization.html", "Cost Optimization Guide"],
    ]],
  ];

  const FLAT = [
    { file: "index.html", label: "Overview", title: "AWS Best Practices Documentation", group: null },
    ...GROUPS.flatMap(([group, pages]) =>
      pages.map(([label, file, title]) => ({ label, file, title, group }))
    ),
  ];

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const path = location.pathname.replace(/\\/g, "/");
  const isIndex = /(^|\/)(index\.html)?$/i.test(path);
  const prefix = isIndex ? "" : "../";
  const current = isIndex
    ? FLAT[0]
    : FLAT.find((e) => path.endsWith("/" + e.file)) || null;

  const SIDEBAR_KEY = "aws-docs-sidebar-v1";

  function loadOpenGroups() {
    try {
      const raw = localStorage.getItem(SIDEBAR_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : null;
    } catch (_) {
      return null;
    }
  }

  function saveOpenGroups(names) {
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(names));
    } catch (_) {}
  }

  const savedOpen = loadOpenGroups();

  const CHEVRON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function headerHtml() {
    const crumbs = current && current.group
      ? `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="${prefix}index.html">Home</a>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <span class="crumb-cat">${esc(current.group)}</span>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <span class="crumb-cur" aria-current="page">${esc(current.label)}</span>
      </nav>`
      : "";

    return `<div id="scroll-progress"></div>
<header class="site-header">
  <div class="header-inner">
    <button class="menu-btn" type="button" aria-label="Toggle navigation menu" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <a class="brand" href="${prefix}index.html"><span class="brand-dot"></span>AWS Best Practices</a>
    ${crumbs}
    <nav class="header-actions" aria-label="Site actions">
      <a class="gh-link" href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
      <button class="theme-btn" type="button" aria-label="Toggle color theme">
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      </button>
    </nav>
  </div>
</header>`;
  }

  function sidebarHtml() {
    const homeCurrent = current && current.file === "index.html" ? ' aria-current="page"' : "";
    const groups = GROUPS.map(([group, pages], i) => {
      const isCurrentGroup = !!(current && pages.some(([, file]) => file === current.file));
      const open = isCurrentGroup || (savedOpen ? savedOpen.has(group) : false);
      const items = pages
        .map(([label, file]) => {
          const cur = current && file === current.file ? ' aria-current="page"' : "";
          return `            <li><a href="${prefix}${file}"${cur}>${esc(label)}</a></li>`;
        })
        .join("\n");
      return `    <div class="side-group${open ? " open" : ""}" data-name="${esc(group)}">
      <button class="side-cat" type="button" aria-expanded="${open ? "true" : "false"}" aria-controls="side-items-${i}">
        ${esc(group)}
        ${CHEVRON}
      </button>
      <div class="side-items" id="side-items-${i}">
        <ul>
${items}
        </ul>
      </div>
    </div>`;
    }).join("\n");

    return `<nav class="sidebar" aria-label="Site navigation">
  <button class="side-close" type="button" aria-label="Close navigation menu">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
  </button>
  <div class="sidebar-inner">
    <a class="side-home" href="${prefix}index.html"${homeCurrent}>Overview</a>
${groups}
  </div>
</nav>`;
  }

  function footerHtml() {
    const idx = current ? FLAT.findIndex((e) => e.file === current.file) : -1;
    const prev = idx > 0 ? FLAT[idx - 1] : null;
    const next = idx >= 0 && idx < FLAT.length - 1 ? FLAT[idx + 1] : null;

    const prevCard = prev
      ? `<a class="pager-card prev" href="${prefix}${prev.file}"><span class="pager-label">&larr; Previous</span><span class="pager-title">${esc(prev.title)}</span></a>`
      : `<span class="pager-card pager-spacer" aria-hidden="true"></span>`;
    const nextCard = next
      ? `<a class="pager-card next" href="${prefix}${next.file}"><span class="pager-label">Next &rarr;</span><span class="pager-title">${esc(next.title)}</span></a>`
      : `<span class="pager-card pager-spacer" aria-hidden="true"></span>`;

    return `<footer class="site-footer">
  <nav class="pager" aria-label="Adjacent pages">
    ${prevCard}
    ${nextCard}
  </nav>
  <p class="foot-note">Community-maintained guidance. Verify service details against current AWS documentation before production use.</p>
</footer>`;
  }

  function wireSidebar() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    sidebar.querySelectorAll(".side-group").forEach((group) => {
      const btn = group.querySelector(".side-cat");
      if (!btn) return;
      btn.addEventListener("click", () => {
        const open = group.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        saveOpenGroups(
          [...document.querySelectorAll(".side-group.open")].map((g) => g.dataset.name)
        );
      });
    });

    const menuBtn = document.querySelector(".menu-btn");
    const backdrop = document.querySelector(".sidebar-backdrop");
    if (!menuBtn) return;

    const setDrawer = (open) => {
      sidebar.classList.toggle("open", open);
      if (backdrop) backdrop.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () => setDrawer(!sidebar.classList.contains("open")));

    const closeBtn = sidebar.querySelector(".side-close");
    if (closeBtn) closeBtn.addEventListener("click", () => setDrawer(false));
    if (backdrop) backdrop.addEventListener("click", () => setDrawer(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setDrawer(false);
    });
    sidebar.querySelectorAll(".side-items a, .side-home").forEach((a) =>
      a.addEventListener("click", () => setDrawer(false))
    );
  }

  function mount() {
    const main = document.querySelector("main.page");
    if (!main) return;
    try {
      const body = document.body;
      body.insertAdjacentHTML("afterbegin", headerHtml());

      const layout = document.createElement("div");
      layout.className = "layout";
      body.replaceChild(layout, main);
      layout.insertAdjacentHTML("beforeend", sidebarHtml() + '<div class="sidebar-backdrop"></div>');

      const content = document.createElement("div");
      content.className = "content";
      content.appendChild(main);
      content.insertAdjacentHTML("beforeend", footerHtml());
      layout.appendChild(content);

      wireSidebar();
    } finally {
      document.documentElement.removeAttribute("data-chrome");
    }
  }

  document.documentElement.setAttribute("data-chrome", "pending");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
