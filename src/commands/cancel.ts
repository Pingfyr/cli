import { Command } from "commander";
import { ConfigManager } from "../lib/config.js";
import { PingfyrClient, NotFoundError } from "../lib/client.js";
import { OutputFormatter } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";

export function cancelCommand(parent: Command): void {
  const cancel = new Command("cancel")
    .description("Cancel a pending reminder")
    .argument("<id>", "Reminder ID to cancel")
    .option("--json", "Output as machine-readable JSON")
    .action(async (id: string, options) => {
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

        await withSpinner("Cancelling reminder...", isJson, async () => client.cancelReminder(id));

        process.stdout.write(formatter.success("Reminder cancelled: " + id, { id }) + "\n");
        process.exit(0);
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          process.stderr.write(
            formatter.error("Reminder not found: " + id, { errorCode: "not_found" }) + "\n"
          );
          process.exit(2);
          return;
        }
        const error = err as { exitCode?: number; message?: string };
        const exitCode = error.exitCode ?? 1;
        process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
        process.exit(exitCode);
      }
    });

  parent.addCommand(cancel);
}
