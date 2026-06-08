# @pingfyr/cli

The Pingfyr CLI lets you schedule and manage reminders directly from your terminal — no browser required. Built for developers and AI agent pipelines that need scriptable reminder control.

All commands support `--json` mode for clean stdout output, making it easy to compose with `jq` or pipe into scripts.

## Install

```bash
npm install -g @pingfyr/cli
```

Or run without installing:

```bash
npx @pingfyr/cli --help
```

## Requirements

- Node.js 18+
- A Pingfyr account and API key ([pingfyr.com](https://pingfyr.com))

## Quick Start

```bash
# Set your API key (one-time)
pingfyr config set --api-key rm_your_key_here

# Create a reminder (relative time)
pingfyr remind --channel email --recipients you@example.com --in 30m --message "Break time"

# Create a reminder (natural language time)
pingfyr remind --channel email --recipients you@example.com --at "tomorrow 9am" --message "Stand-up"

# Create a reminder (exact time)
pingfyr remind --channel email --recipients you@example.com --fire-at 2026-12-01T09:00:00Z --message "Deploy"

# Create a Google Calendar reminder (Starter+ plan required)
pingfyr remind --channel google_calendar --recipients google --at "Monday 10am" --message "Team sync"

# List reminders
pingfyr list

# Check a reminder's status
pingfyr status <reminder-id>

# Cancel a reminder
pingfyr cancel <reminder-id>
```

## Commands

### `pingfyr config`

Manage API credentials.

```bash
pingfyr config set --api-key <key>      # Store API key
pingfyr config set --api-url <url>      # Override API URL (default: https://pingfyr.com)
pingfyr config show                     # Display current configuration (key masked)
```

Config is stored via the `conf` library. Typical paths:

- **macOS:** `~/Library/Preferences/pingfyr-nodejs/config.json`
- **Linux:** `~/.config/pingfyr-nodejs/config.json`
- **Windows:** `%APPDATA%/pingfyr-nodejs/config.json`

Environment variables `PINGFYR_API_KEY` and `PINGFYR_API_URL` override stored config values.

### `pingfyr remind`

Create a new reminder.

```
Options:
  --channel <type>       Delivery channel (required):
                         email | webhook | slack | discord | telegram | openclaw | google_calendar
  --recipients <list>    Comma-separated list of recipient addresses (required)
  --fire-at <iso>        ISO 8601 datetime when the reminder fires
  --in <duration>        Schedule relative to now: 30m, 2h, 3d, 1w
  --at <time>            Schedule at a time: "Monday 9am", "tomorrow 15:17"
  --message <text>       Reminder body text
  --title <text>         Reminder title
  --repeat <interval>    Recurrence: daily | weekly | monthly | custom
  --cron <expression>    Cron expression when --repeat custom (e.g. '0 9 * * 1')
  --timezone <tz>        IANA timezone (default: system timezone)
  --json                 Output raw JSON to stdout
```

**Time scheduling:** Exactly one of `--fire-at`, `--in`, or `--at` is required. They are mutually exclusive.

### `pingfyr list`

List reminders.

```
Options:
  --status <status>   Filter by status: pending | processing | delivered | failed | cancelled
  --limit <n>         Max results (default: 50)
  --offset <n>        Offset for pagination (default: 0)
  --json              Output raw JSON to stdout
```

### `pingfyr status <id>`

Show full detail for a single reminder including per-recipient delivery log.

```
Options:
  --json   Output raw JSON to stdout
```

### `pingfyr cancel <id>`

Cancel a pending reminder.

```
Options:
  --json   Output raw JSON to stdout
```

## Environment Variables

| Variable          | Description                            |
| ----------------- | -------------------------------------- |
| `PINGFYR_API_KEY` | API key — overrides stored config      |
| `PINGFYR_API_URL` | API base URL — overrides stored config |

## Exit Codes

| Code | Meaning                                 |
| ---- | --------------------------------------- |
| 0    | Success                                 |
| 1    | API or rate-limit error                 |
| 2    | Not found or usage error                |
| 3    | Auth error (missing or invalid API key) |

## JSON Mode

All commands support `--json`. In JSON mode:

- Only valid JSON is written to **stdout**
- Spinner and error messages go to **stderr**

Useful for scripting and agent pipelines:

```bash
ID=$(pingfyr remind --channel email --recipients bot@example.com \
  --in 2h --message "Done" --json | jq -r '.data.id')
echo "Created: $ID"
```

## License

MIT
