import chalk from "chalk";
import Table from "cli-table3";

const MAX_CELL_WIDTH = 40;

/**
 * Truncates a string to maxLen characters, appending "..." if truncated.
 */
function truncate(value: unknown, maxLen = MAX_CELL_WIDTH): string {
  const str = value === null || value === undefined ? "—" : String(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/** Colors for reminder status values */
function colorStatus(status: string): string {
  switch (status) {
    case "pending":
      return chalk.yellow(status);
    case "processing":
      return chalk.blue(status);
    case "delivered":
      return chalk.green(status);
    case "failed":
      return chalk.red(status);
    case "cancelled":
    case "channel_restricted":
      return chalk.gray(status);
    default:
      return status;
  }
}

export interface ColumnConfig {
  key: string;
  header: string;
  /** Max chars before truncation. Defaults to MAX_CELL_WIDTH (40). */
  maxWidth?: number;
  /** If true, apply status colorization. */
  isStatus?: boolean;
}

export interface JsonSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface JsonErrorEnvelope {
  success: false;
  error: string;
  message: string;
}

export class OutputFormatter {
  constructor(private readonly isJson: boolean) {}

  /**
   * Format an array of rows as a table (human) or JSON success envelope (machine).
   * @param rows - Data rows to display
   * @param columns - Column config: key = field name in row, header = display name
   * @param jsonData - Optional: alternate data shape for JSON envelope (defaults to rows)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format(rows: any[], columns: ColumnConfig[], jsonData?: unknown): string {
    if (this.isJson) {
      const envelope: JsonSuccessEnvelope<unknown> = {
        success: true,
        data: jsonData ?? rows,
      };
      return JSON.stringify(envelope, null, 2);
    }

    if (rows.length === 0) {
      return chalk.dim("No results found.");
    }

    const table = new Table({
      head: columns.map((c) => chalk.bold(c.header)),
      style: { head: [], border: ["grey"] },
    });

    for (const row of rows) {
      table.push(
        columns.map((c) => {
          const raw = (row as Record<string, unknown>)[c.key];
          const truncated = truncate(raw, c.maxWidth ?? MAX_CELL_WIDTH);
          return c.isStatus ? colorStatus(truncated) : truncated;
        })
      );
    }

    return table.toString();
  }

  /**
   * Format a single object for display (e.g., status command detail view).
   * Human: key-value pairs with labels. JSON: success envelope wrapping the object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail(obj: any, fields: { key: string; label: string; isStatus?: boolean }[]): string {
    if (this.isJson) {
      const envelope: JsonSuccessEnvelope<unknown> = { success: true, data: obj };
      return JSON.stringify(envelope, null, 2);
    }

    return fields
      .map((f) => {
        const value = obj[f.key];
        const display = value === null || value === undefined ? chalk.dim("—") : String(value);
        const colored = f.isStatus ? colorStatus(display) : display;
        return `${chalk.bold(f.label + ":")} ${colored}`;
      })
      .join("\n");
  }

  /**
   * Format a success message (e.g., "Reminder cancelled").
   * Human: chalk.green message. JSON: success envelope with message field.
   */
  success(message: string, data?: unknown): string {
    if (this.isJson) {
      return JSON.stringify({ success: true, data: data ?? { message } }, null, 2);
    }
    return chalk.green(message);
  }

  /**
   * Format an error message for stderr output.
   * Human: chalk.red "Error: <message>" with optional hint. JSON: error envelope.
   */
  error(message: string, options?: { errorCode?: string; hint?: string }): string {
    if (this.isJson) {
      const envelope: JsonErrorEnvelope = {
        success: false,
        error: options?.errorCode ?? "error",
        message,
      };
      return JSON.stringify(envelope, null, 2);
    }

    let output = chalk.red(`Error: ${message}`);
    if (options?.hint) {
      output += `\n\n${options.hint}`;
    }
    return output;
  }
}
