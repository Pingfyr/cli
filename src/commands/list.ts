import { Command } from "commander";
import { ConfigManager } from "../lib/config.js";
import { PingfyrClient } from "../lib/client.js";
import { OutputFormatter, type ColumnConfig } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";

export function listCommand(parent: Command): void {
  const list = new Command("list")
    .description("List reminders")
    .option("--status <status>", "Filter by status: pending|processing|delivered|failed|cancelled")
    .option("--limit <n>", "Number of reminders to return", "50")
    .option("--offset <n>", "Offset for pagination", "0")
    .option("--json", "Output as machine-readable JSON")
    .action(async (options) => {
      const isJson = !!options.json;
      const formatter = new OutputFormatter(isJson);
      const configManager = new ConfigManager();
      const cfg = configManager.getAll();

      if (!cfg.apiKey || !cfg.apiUrl) {
        process.stderr.write(
          formatter.error(
            "API key or URL not configured. Run: pingfyr config set --api-key <key>",
            {
              errorCode: "auth",
            }
          ) + "\n"
        );
        process.exit(3);
        return;
      }

      try {
        const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);

        const result = await withSpinner("Fetching reminders...", isJson, async () =>
          client.listReminders({
            status: options.status,
            limit: parseInt(options.limit, 10),
            offset: parseInt(options.offset, 10),
          })
        );

        const columns: ColumnConfig[] = [
          { key: "id", header: "ID", maxWidth: 8 },
          { key: "title", header: "Title" },
          { key: "channel_type", header: "Channel", maxWidth: 12 },
          { key: "status", header: "Status", isStatus: true, maxWidth: 15 },
          { key: "fire_at", header: "Scheduled", maxWidth: 25 },
        ];

        process.stdout.write(
          formatter.format(result.data, columns, { data: result.data, count: result.count }) + "\n"
        );
        process.exit(0);
      } catch (err: unknown) {
        const error = err as { exitCode?: number; message?: string };
        const exitCode = error.exitCode ?? 1;
        process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
        process.exit(exitCode);
      }
    });

  parent.addCommand(list);
}
