#!/usr/bin/env node
/* Emits the shared <header> and <footer> HTML for one generated page.
 *
 * Usage: node scripts/nav.js <output-relative-path>
 * Example: node scripts/nav.js Core-Services/EC2-Best-Practices.html
 *
 * Prints two blocks marked with PASTE-HEADER / PASTE-FOOTER comments.
 * The path must be one of the 32 known pages (index.html or <Category>/<Name>.html).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REPO_URL = "https://github.com/AlexanderBesss/AWS_best_praactices";

const GROUPS = [
  ["Core Services", [
    ["EC2", "Core-Services/EC2-Best-Practices.html"],
    ["S3", "Core-Services/S3-Best-Practices.html"],
    ["IAM", "Core-Services/IAM-Best-Practices.html"],
    ["VPC", "Core-Services/VPC-Best-Practices.html"],
  ]],
  ["Database", [
    ["RDS", "Database/RDS-Best-Practices.html"],
    ["DynamoDB", "Database/DynamoDB-Best-Practices.html"],
    ["ElastiCache", "Database/ElastiCache-Best-Practices.html"],
  ]],
  ["Architecture Patterns", [
    ["Event-driven", "Design/01-event-driven-patterns.html"],
    ["Communication", "Design/02-communication-patterns.html"],
    ["Error handling", "Design/03-error-handling-patterns.html"],
    ["Cross-cutting", "Design/04-cross-cutting-patterns.html"],
    ["Database integration", "Design/05-database-integration-patterns.html"],
    ["High availability & DR", "Design/06-high-availability-dr-patterns.html"],
    ["Caching & delivery", "Design/07-caching-content-delivery-patterns.html"],
    ["Compute & deployment", "Design/08-compute-deployment-patterns.html"],
    ["Multi-account", "Design/09-multi-account-landing-zone-patterns.html"],
  ]],
  ["Serverless", [
    ["Lambda", "Serverless/Lambda-Best-Practices.html"],
    ["API Gateway", "Serverless/API-Gateway-Best-Practices.html"],
    ["EventBridge", "Serverless/EventBridge-Best-Practices.html"],
  ]],
  ["Networking", [
    ["CloudFront", "Networking/CloudFront-Best-Practices.html"],
    ["Route 53", "Networking/Route53-Best-Practices.html"],
    ["Load balancing", "Networking/Load-Balancing-Best-Practices.html"],
  ]],
  ["DevOps", [
    ["CI/CD", "DevOps/CI-CD-Best-Practices.html"],
    ["CloudFormation", "DevOps/CloudFormation-Best-Practices.html"],
    ["ECS/EKS", "DevOps/ECS-EKS-Best-Practices.html"],
  ]],
  ["Monitoring", [
    ["CloudWatch", "Monitoring/CloudWatch-Best-Practices.html"],
    ["X-Ray", "Monitoring/X-Ray-Best-Practices.html"],
  ]],
  ["Security", [
    ["WAF", "Security/WAF-Best-Practices.html"],
    ["KMS", "Security/KMS-Best-Practices.html"],
    ["Shield", "Security/Shield-Best-Practices.html"],
  ]],
  ["Cost Optimization", [
    ["Guide", "Cost-Optimization/Cost-Optimization.html"],
  ]],
];

const FLAT = [
  ["index.html", "Overview", "README.md"],
  ...GROUPS.flatMap(([, links]) =>
    links.map(([label, file]) => [file, label, file.replace(/\.html$/, ".md")])
  ),
];

const KNOWN = new Set(FLAT.map(([f]) => f));

function mdTitle(mdRelPath) {
  try {
    const raw = fs.readFileSync(path.join(REPO_ROOT, mdRelPath), "utf8");
    const lines = raw.split(/\r?\n/);
    if (lines[0].trim() !== "---") return null;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") break;
      const m = /^title:\s*(.+?)\s*$/.exec(lines[i]);
      if (m) return m[1].replace(/["']/g, "");
    }
  } catch (_) { /* missing file */ }
  return null;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/nav.js <output-relative-path>");
    process.exit(2);
  }
  const pagePath = arg.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!KNOWN.has(pagePath)) {
    console.error(`Unknown page: ${pagePath}. Must be one of the 32 known pages.`);
    process.exit(1);
  }

  const depth = pagePath.includes("/") ? 1 : 0;
  const p = "../".repeat(depth);
  const idx = FLAT.findIndex(([f]) => f === pagePath);
  const [prevFile, prevLabel, prevMd] = idx > 0 ? FLAT[idx - 1] : [null, null, null];
  const [nextFile, nextLabel, nextMd] = idx < FLAT.length - 1 ? FLAT[idx + 1] : [null, null, null];

  const titleOf = (file, label, md) => esc(mdTitle(md) || label);

  const prevCard = prevFile
    ? `<a class="pager-card prev" href="${p}${prevFile}"><span class="pager-label">&larr; Previous</span><span class="pager-title">${titleOf(prevFile, prevLabel, prevMd)}</span></a>`
    : `<span class="pager-card pager-spacer" aria-hidden="true"></span>`;
  const nextCard = nextFile
    ? `<a class="pager-card next" href="${p}${nextFile}"><span class="pager-label">Next &rarr;</span><span class="pager-title">${titleOf(nextFile, nextLabel, nextMd)}</span></a>`
    : `<span class="pager-card pager-spacer" aria-hidden="true"></span>`;

  const topicGroups = GROUPS.map(([group, links]) => {
    const items = links
      .map(([label, file]) => {
        const current = file === pagePath ? ' aria-current="page"' : "";
        return `        <a href="${p}${file}"${current}>${esc(label)}</a>`;
      })
      .join("\n");
    return `    <div class="topic-group">\n      <h4>${esc(group)}</h4>\n${items}\n    </div>`;
  }).join("\n");

  const header = `<div id="scroll-progress"></div>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="${p}index.html"><span class="brand-dot"></span>AWS Best Practices</a>
    <nav class="header-actions" aria-label="Site actions">
      <a class="gh-link" href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
      <button class="theme-btn" type="button" aria-label="Toggle color theme">
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      </button>
    </nav>
  </div>
</header>`;

  const footer = `<footer class="site-footer">
  <nav class="pager" aria-label="Adjacent pages">
    ${prevCard}
    ${nextCard}
  </nav>
  <div class="topics">
${topicGroups}
  </div>
  <p class="foot-note">Community-maintained guidance. Verify service details against current AWS documentation before production use.</p>
</footer>`;

  console.log("<!-- PASTE-HEADER:START -->");
  console.log(header);
  console.log("<!-- PASTE-HEADER:END -->");
  console.log();
  console.log("<!-- PASTE-FOOTER:START -->");
  console.log(footer);
  console.log("<!-- PASTE-FOOTER:END -->");
}

main();
