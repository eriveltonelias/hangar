#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import {
  scanProject,
  scanRouter,
  formatScanReportMarkdown,
  doctorSummary,
  formatRouterTree,
} from "@hangar/core";
import { createNodeFileSystem } from "@hangar/core/node";

const program = new Command();

program
  .name("hangar")
  .description("Hangar CLI - Ship with confidence.")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan an Expo project for health issues")
  .argument("[path]", "Project directory", ".")
  .option("--json", "Output as JSON")
  .action(async (path: string, options: { json?: boolean }) => {
    const projectPath = resolve(path);
    const fs = createNodeFileSystem(projectPath);
    const result = await scanProject(projectPath, fs);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const critical = result.issues.filter((i) => i.severity === "critical");
    const warnings = result.issues.filter((i) => i.severity === "warning");

    console.log(chalk.bold(`\n${result.projectName}`));
    console.log(chalk.dim(`  ${projectPath}\n`));
    console.log(`  Health Score: ${colorScore(result.healthScore)}`);
    console.log(`  SDK: ${result.sdkVersion ?? "Unknown"}`);
    console.log(`  Critical: ${chalk.red(String(critical.length))}`);
    console.log(`  Warnings: ${chalk.yellow(String(warnings.length))}\n`);

    for (const issue of result.issues.filter((i) => i.severity !== "passed")) {
      const icon =
        issue.severity === "critical" ? chalk.red("✖") :
        issue.severity === "warning" ? chalk.yellow("⚠") :
        chalk.blue("ℹ");
      console.log(`  ${icon} ${chalk.bold(issue.title)}`);
      console.log(chalk.dim(`    ${issue.description}`));
      if (issue.suggestedFix) console.log(chalk.green(`    → ${issue.suggestedFix}`));
      console.log();
    }
  });

program
  .command("report")
  .description("Generate a markdown health report")
  .argument("[path]", "Project directory", ".")
  .option("--markdown", "Output markdown (default)")
  .action(async (path: string) => {
    const projectPath = resolve(path);
    const fs = createNodeFileSystem(projectPath);
    const result = await scanProject(projectPath, fs);
    console.log(formatScanReportMarkdown(result));
  });

program
  .command("router")
  .description("Visualize Expo Router structure")
  .argument("[path]", "Project directory", ".")
  .action(async (path: string) => {
    const projectPath = resolve(path);
    const fs = createNodeFileSystem(projectPath);
    const result = await scanRouter(projectPath, fs);

    console.log(chalk.bold("\nExpo Router Tree\n"));
    console.log(formatRouterTree(result.routes));

    if (result.warnings.length > 0) {
      console.log(chalk.yellow("\nWarnings:"));
      for (const w of result.warnings) {
        console.log(`  ⚠ ${w.title}: ${w.description}`);
      }
    }
  });

program
  .command("doctor")
  .description("Quick health check summary")
  .argument("[path]", "Project directory", ".")
  .action(async (path: string) => {
    const projectPath = resolve(path);
    const fs = createNodeFileSystem(projectPath);
    const result = await scanProject(projectPath, fs);

    console.log(chalk.bold(`\nHangar Doctor - ${result.projectName}\n`));
    console.log(`  Score: ${colorScore(result.healthScore)}/100`);
    console.log(`  ${doctorSummary(result)}\n`);
  });

function colorScore(score: number): string {
  if (score >= 80) return chalk.green(String(score));
  if (score >= 60) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

program.parse();
