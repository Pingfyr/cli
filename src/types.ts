export interface ConfigSchema {
  apiKey?: string;
  apiUrl?: string;
}

export interface DeliverySummary {
  success: number;
  failure: number;
  suppressed: number;
  rate_limited: number;
}

export interface ReminderRecord {
  id: string;
  user_id: string;
  api_key_id: string;
  title: string;
  body: string | null;
  channel_type: string;
  recipients: unknown;
  fire_at: string;
  status: "pending" | "processing" | "delivered" | "failed" | "cancelled" | "channel_restricted";
  repeat: string | null;
  cron_expression: string | null;
  timezone: string;
  metadata: unknown;
  created_at: string;
  delivery_summary?: DeliverySummary;
}

export interface ListRemindersResponse {
  data: ReminderRecord[];
  count: number;
}

export interface CreateReminderRequest {
  title: string;
  body?: string;
  channel: "email" | "webhook" | "slack" | "discord" | "telegram" | "openclaw" | "google_calendar";
  recipients: string[];
  fire_at: string;
  timezone?: string;
  repeat?: "daily" | "weekly" | "monthly" | "custom";
  cron_expression?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateReminderRequest {
  title?: string;
  body?: string;
  channel?: string;
  recipients?: string[];
  fire_at?: string;
  timezone?: string;
  repeat?: string | null;
  cron_expression?: string | null;
  metadata?: Record<string, unknown>;
  status?: "cancelled";
}

export interface ListRemindersParams {
  status?: string;
  limit?: number;
  offset?: number;
}
