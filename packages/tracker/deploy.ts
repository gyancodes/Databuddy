import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { confirm } from "@inquirer/prompts";
import { file } from "bun";
import chalk from "chalk";
import { Command } from "commander";

const program = new Command();

program
    .name("deploy")
    .description("Deploy Databuddy tracker scripts to Bunny.net Storage")
    .option("-d, --dry-run", "Simulate the deployment without uploading files")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("-v, --verbose", "Enable verbose logging")
    .parse(process.argv);

const options = program.opts<{
    dryRun: boolean;
    yes: boolean;
    verbose: boolean;
}>();

const STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME;
const ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY;
const REGION = process.env.BUNNY_STORAGE_REGION || "";

if (!STORAGE_ZONE_NAME) {
    console.error(chalk.red("❌ Missing BUNNY_STORAGE_ZONE_NAME env var"));
    process.exit(1);
}

if (!ACCESS_KEY) {
    console.error(chalk.red("❌ Missing BUNNY_STORAGE_ACCESS_KEY env var"));
    process.exit(1);
}

const BASE_URL = REGION
    ? `https://${REGION}.storage.bunnycdn.com`
    : "https://storage.bunnycdn.com";

const DIST_DIR = join(import.meta.dir, "dist");

async function uploadFile(filename: string) {
    const filePath = join(DIST_DIR, filename);
    const fileContent = file(filePath);

    if (!(await fileContent.exists())) {
        console.warn(chalk.yellow(`⚠️ File not found: ${filename}`));
        return;
    }

    const url = `${BASE_URL}/${STORAGE_ZONE_NAME}/${filename}`;
    const size = (await fileContent.size) / 1024; // KB

    if (options.dryRun) {
        console.log(
            chalk.cyan(`[DRY RUN] Would upload ${chalk.bold(filename)}`) +
            chalk.dim(` (${size.toFixed(2)} KB) to ${url}`),
        );
        return;
    }

    if (options.verbose) {
        console.log(chalk.dim(`Uploading ${filename} (${size.toFixed(2)} KB)...`));
    }

    try {
        const start = performance.now();
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                AccessKey: ACCESS_KEY as string,
                "Content-Type": "application/javascript",
            },
            body: fileContent,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const duration = (performance.now() - start).toFixed(0);
        console.log(
            chalk.green(`✅ Uploaded ${filename}`) +
            chalk.dim(` in ${duration}ms`),
        );
    } catch (error) {
        console.error(chalk.red(`❌ Failed to upload ${filename}:`), error);
        process.exit(1);
    }
}

async function deploy() {
    try {
        const files = await readdir(DIST_DIR);
        const jsFiles = files.filter(
            (f) => f.endsWith(".js") || f.endsWith(".map"),
        );

        if (jsFiles.length === 0) {
            console.log(chalk.yellow("⚠️ No files found in dist/ to upload."));
            return;
        }

        console.log(
            chalk.bold(
                `\n🚀 Preparing to deploy ${jsFiles.length} files to ${chalk.cyan(STORAGE_ZONE_NAME)}...`,
            ),
        );

        if (options.verbose) {
            console.log(chalk.dim(`Target URL Base: ${BASE_URL}`));
            console.log(chalk.dim(`Files: ${jsFiles.join(", ")}`));
        }

        const skipConfirmation = options.yes || options.dryRun;

        if (!skipConfirmation) {
            const answer = await confirm({
                message: "Are you sure you want to deploy these files?",
                default: false,
            });

            if (!answer) {
                console.log(chalk.yellow("Cancelled."));
                process.exit(0);
            }
        }

        await Promise.all(jsFiles.map(uploadFile));

        if (options.dryRun) {
            console.log(
                chalk.cyan("\n✨ Dry run completed. No files were uploaded."),
            );
        } else {
            console.log(
                chalk.green(
                    `\n✨ Deployment completed successfully! (${jsFiles.length} files)`,
                ),
            );
        }
    } catch (error) {
        console.error(chalk.red("❌ Deployment failed:"), error);
        process.exit(1);
    }
}

deploy();
