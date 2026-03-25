import { Command } from "commander";
import { ConfigManager } from "../lib/config.js";
import { PingfyrClient, NotFoundError } from "../lib/client.js";
import { OutputFormatter } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";

export function statusCommand(parent: Command): void {
  const status = new Command("status")
    .description("Show details for a reminder")
    .argument("<id>", "Reminder ID to inspect")
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

        const reminder = await withSpinner("Fetching reminder...", isJson, async () => {
          const result = await client.listReminders({ limit: 100 });
          const found = result.data.find((r) => r.id === id);
          if (!found) throw new NotFoundError("Reminder not found: " + id);
          return found;
        });

        // Build delivery summary string if available
        let deliverySummaryStr: string | undefined;
        const ds = reminder.delivery_summary;
        if (ds && (ds.success || ds.failure || ds.suppressed || ds.rate_limited)) {
          const parts: string[] = [];
          if (ds.success) parts.push(`${ds.success} delivered`);
          if (ds.failure) parts.push(`${ds.failure} failed`);
          if (ds.suppressed) parts.push(`${ds.suppressed} suppressed`);
          if (ds.rate_limited) parts.push(`${ds.rate_limited} rate-limited`);
          deliverySummaryStr = parts.join(", ");
        }

        const display: Record<string, unknown> = {
          ...reminder,
          recipients: Array.isArray(reminder.recipients)
            ? (reminder.recipients as string[]).join(", ")
            : String(reminder.recipients),
          ...(deliverySummaryStr ? { delivery: deliverySummaryStr } : {}),
        };

        const fields = [
          { key: "id", label: "ID" },
          { key: "title", label: "Title" },
          { key: "channel_type", label: "Channel" },
          { key: "status", label: "Status", isStatus: true },
          { key: "fire_at", label: "Scheduled" },
          { key: "timezone", label: "Timezone" },
          { key: "recipients", label: "Recipients" },
          { key: "body", label: "Message" },
          ...(deliverySummaryStr ? [{ key: "delivery", label: "Delivery" }] : []),
        ];

        process.stdout.write(formatter.detail(display, fields) + "\n");
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

  parent.addCommand(status);
}
