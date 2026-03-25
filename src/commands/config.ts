import { Command } from "commander";
import { ConfigManager } from "../lib/config.js";

export function configCommand(parent: Command): void {
  const configManager = new ConfigManager();

  const config = new Command("config").description("Manage Pingfyr API configuration");

  // pingfyr config set --api-key <key> [--api-url <url>]
  config
    .command("set")
    .description("Set configuration values")
    .option("--api-key <key>", "API key (starts with rm_)")
    .option("--api-url <url>", "API base URL (default: https://pingfyr.com)")
    .action((options) => {
      if (!options.apiKey && !options.apiUrl) {
        process.stderr.write("Error: Provide at least --api-key or --api-url\n");
        process.exit(1);
      }
      if (options.apiKey) {
        configManager.setApiKey(options.apiKey);
        process.stdout.write("API key saved\n");
      }
      if (options.apiUrl) {
        configManager.setApiUrl(options.apiUrl);
        process.stdout.write("API URL saved\n");
      }
    });

  // pingfyr config show
  config
    .command("show")
    .description("Display current configuration (key masked)")
    .action(() => {
      const cfg = configManager.show();
      if (!cfg.apiKey && !cfg.apiUrl) {
        process.stdout.write("No configuration set. Run: pingfyr config set --api-key <key>\n");
        return;
      }
      process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
    });

  parent.addCommand(config);
}
