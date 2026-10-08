// Fails when a Markdown doc is over its size budget, or a path under docs/ isn't kebab-case.
// Standard: serpcompany/serp docs/engineering/standards/agent-harness/docs-are-maps.md (budgets)
// and docs/README.md (naming). Copied from serpcompany/serp/.github/scripts/check-docs.mjs.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const WRAP_WIDTH = 100;
const MAP_BUDGET = 120;
const LEAF_BUDGET = 300;
const MAP_NAMES = ["README.md", "AGENTS.md"];
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Docs already over budget when this check was added. Each may shrink, but never grow.
const ALLOWANCES = {};

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));

const listFiles = (...pathspecs) =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...pathspecs], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((path, index, all) => path && existsSync(path) && all.indexOf(path) === index);

const files = listFiles("AGENTS.md", "README.md", "docs/*.md", "apps/web/AGENTS.md");

const wrappedLines = (text) =>
  text
    .replace(/\r?\n$/, "")
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / WRAP_WIDTH)), 0);

const failures = [];
const notices = [];
// On a PR, a doc that shrank must lower its allowance so it can't grow back; elsewhere it's a notice.
const strict = process.env.GITHUB_EVENT_NAME === "pull_request";

for (const path of files) {
  const size = wrappedLines(readFileSync(path, "utf8"));
  const budget = MAP_NAMES.includes(basename(path)) ? MAP_BUDGET : LEAF_BUDGET;
  const allowance = ALLOWANCES[path];

  if (allowance === undefined) {
    if (size > budget) {
      failures.push(`${path}: ${size} lines, budget ${budget}. Split it by topic into leaves linked from a map.`);
    }
  } else if (size <= budget) {
    failures.push(`${path}: ${size} lines now fits its budget of ${budget}. Delete its allowance in this script.`);
  } else if (size > allowance) {
    failures.push(
      `${path}: ${size} lines, allowance ${allowance}. It predates the budget and may shrink but not grow. Split it by topic instead of adding to it.`,
    );
  } else if (size < allowance) {
    (strict ? failures : notices).push(
      `${path}: ${size} lines, allowance ${allowance}. Lower its allowance in this script to ${size}.`,
    );
  }
}

for (const path of Object.keys(ALLOWANCES)) {
  if (!files.includes(path)) {
    failures.push(`${path}: has an allowance but no longer exists. Delete its allowance in this script.`);
  }
}

const misnamed = new Set();
for (const path of listFiles("docs")) {
  const segments = path.split("/").slice(1);
  segments.forEach((segment, index) => {
    const isFile = index === segments.length - 1;
    if (isFile && MAP_NAMES.includes(segment)) return;
    const name = isFile ? segment.replace(/\.[^.]+$/, "") : segment;
    if (!KEBAB_CASE.test(name)) misnamed.add(["docs", ...segments.slice(0, index + 1)].join("/"));
  });
}
for (const path of misnamed) {
  failures.push(`${path}: not kebab-case. Use lowercase words joined by hyphens; only README.md and AGENTS.md are uppercase.`);
}

notices.forEach((notice) => console.log(notice));

if (failures.length > 0) {
  failures.forEach((failure) => console.error(failure));
  console.error(
    `\nSizes are lines wrapped at ${WRAP_WIDTH} characters; see docs-are-maps.md in serpcompany/serp. Naming: docs/README.md.`,
  );
  process.exit(1);
}

console.log(`${files.length} docs within budget, all paths under docs/ kebab-case.`);
