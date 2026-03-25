import { Command } from "commander";
import * as readline from "node:readline/promises";
import { ConfigManager } from "../lib/config.js";
import { PingfyrClient } from "../lib/client.js";
import { OutputFormatter } from "../lib/output.js";
import { withSpinner } from "../lib/spinner.js";
import { parseIn, parseAt, formatScheduled } from "../lib/time-parser.js";

export function remindCommand(parent: Command): void {
  const remind = new Command("remind")
    .description("Create a new reminder")
    .requiredOption(
      "--channel <type>",
      "Delivery channel: email|webhook|slack|discord|telegram|openclaw|google_calendar"
    )
    .requiredOption("--recipients <list>", "Comma-separated list of recipients")
    .option("--fire-at <iso>", "ISO 8601 datetime when the reminder fires")
    .option("--in <duration>", "Schedule relative to now: 30m, 2h, 3d, 1w")
    .option("--at <time>", 'Schedule at a time: "Monday 9am", "tomorrow 15:17", "15:17"')
    .option("--repeat <interval>", "Recurrence: daily|weekly|monthly|custom")
    .option("--cron <expression>", "Cron expression when --repeat custom (e.g. '0 9 * * 1')")
    .option("--message <text>", "Reminder body text")
    .option("--title <text>", "Reminder title", "")
    .option(
      "--timezone <tz>",
      "Timezone (default: system timezone)",
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
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

      // Mutual exclusion validation
      const timeFlags = [options.fireAt, options.in, options.at].filter(Boolean);
      if (timeFlags.length > 1) {
        process.stderr.write(
          formatter.error("--fire-at, --in, and --at are mutually exclusive — use exactly one") +
            "\n"
        );
        process.exit(1);
        return;
      }
      if (timeFlags.length === 0) {
        process.stderr.write(formatter.error("One of --fire-at, --in, or --at is required") + "\n");
        process.exit(1);
        return;
      }

      try {
        const client = new PingfyrClient(cfg.apiKey, cfg.apiUrl);
        const recipients = options.recipients.split(",").map((r: string) => r.trim());

        // Resolve fire_at ISO string
        let resolvedFireAt: string;
        if (options.fireAt) {
          resolvedFireAt = options.fireAt;
        } else if (options.in) {
          resolvedFireAt = parseIn(options.in);
        } else {
          const { iso, isPast } = parseAt(options.at, options.timezone);
          if (isPast) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
            const answer = await rl.question(
              `"${options.at}" resolves to a time in the past. Schedule for the next occurrence? (y/N) `
            );
            rl.close();
            if (answer.trim().toLowerCase() !== "y") {
              process.stderr.write(
                formatter.error("Aborted — time expression resolved to past") + "\n"
              );
              process.exit(1);
              return;
            }
          }
          resolvedFireAt = iso;
        }

        // Cron without repeat=custom warning
        if (options.cron && options.repeat !== "custom") {
          process.stderr.write(
            "Warning: --cron is set but --repeat is not 'custom'. Consider adding --repeat custom.\n"
          );
        }

        const result = await withSpinner("Creating reminder...", isJson, async () =>
          client.createReminder({
            title: options.title,
            body: options.message,
            channel: options.channel,
            recipients,
            fire_at: resolvedFireAt,
            timezone: options.timezone,
            repeat: options.repeat,
            cron_expression: options.cron,
          })
        );

        const label = formatScheduled(result.fire_at, options.timezone);
        process.stdout.write(
          formatter.success(`Scheduled for ${label}`, {
            id: result.id,
            channel: result.channel_type,
            fire_at: result.fire_at,
            scheduled_label: label,
          }) + "\n"
        );
        process.exit(0);
      } catch (err: unknown) {
        const error = err as { exitCode?: number; message?: string };
        const exitCode = error.exitCode ?? 1;
        process.stderr.write(formatter.error(error.message ?? "Unknown error") + "\n");
        process.exit(exitCode);
      }
    });

  parent.addCommand(remind);
}
