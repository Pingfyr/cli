import { Command } from "commander";
import { getVersion } from "./lib/version.js";
import { configCommand } from "./commands/config.js";
import { remindCommand } from "./commands/remind.js";
import { listCommand } from "./commands/list.js";
import { cancelCommand } from "./commands/cancel.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("pingfyr")
  .description("AI agent reminder service — manage reminders from the CLI")
  .version(getVersion(), "-v, --version", "Display version number");

configCommand(program);
remindCommand(program);
listCommand(program);
cancelCommand(program);
statusCommand(program);

program.parse(process.argv);
