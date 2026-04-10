import { db } from "@/db";
import { appLogs } from "@/db/schema";

type Level = "debug" | "info" | "warn" | "error";

interface LogOptions {
  userId?: string;
  metadata?: Record<string, unknown>;
}

export async function log(
  level: Level,
  message: string,
  options: LogOptions = {}
): Promise<void> {
  const values = {
    level,
    message,
    userId: options.userId ?? null,
    metadata: options.metadata ? JSON.stringify(options.metadata) : null,
  };

  try {
    await db.insert(appLogs).values(values);
  } catch {
    // Likely a FK constraint violation (e.g. stale JWT userId not in DB).
    // Retry without userId so the log is not lost entirely.
    if (values.userId) {
      try {
        await db.insert(appLogs).values({ ...values, userId: null });
      } catch (inner) {
        console.error("[logger] Failed to write log:", message, inner);
      }
    } else {
      console.error("[logger] Failed to write log:", message);
    }
  }
}

export const logger = {
  debug: (msg: string, opts?: LogOptions) => log("debug", msg, opts),
  info:  (msg: string, opts?: LogOptions) => log("info",  msg, opts),
  warn:  (msg: string, opts?: LogOptions) => log("warn",  msg, opts),
  error: (msg: string, opts?: LogOptions) => log("error", msg, opts),
};
