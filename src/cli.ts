#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { lint, formatFinding } from "./linter";

function collectFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return [target];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(target)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
      continue;
    }
    const full = path.join(target, entry);
    const entryStat = fs.statSync(full);
    if (entryStat.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(ts|tsx|js|jsx|json)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function main(): void {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    process.stderr.write("usage: money-lint <file-or-directory> [...]\n");
    process.exit(1);
  }

  const files: string[] = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) {
      process.stderr.write(`money-lint: no such file or directory: ${target}\n`);
      process.exit(1);
    }
    files.push(...collectFiles(target));
  }

  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const finding of lint(source, file)) {
      process.stdout.write(formatFinding(finding, source) + "\n\n");
      if (finding.severity === "error") {
        errorCount++;
      } else {
        warningCount++;
      }
    }
  }

  const total = errorCount + warningCount;
  if (total > 0) {
    process.stdout.write(
      `${total} problem${total === 1 ? "" : "s"} ` +
        `(${errorCount} error${errorCount === 1 ? "" : "s"}, ` +
        `${warningCount} warning${warningCount === 1 ? "" : "s"})\n`,
    );
  }

  process.exitCode = errorCount > 0 ? 1 : 0;
}

main();
