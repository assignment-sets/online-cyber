export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function isEnvFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  return defaultValue;
}

function writeLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  if (
    !isEnvFlagEnabled(process.env.LOG_ENABLED, true) ||
    !isEnvFlagEnabled(process.env.LOG_TO_STDOUT, true)
  ) {
    return;
  }

  if (LOG_PRIORITY[level] < LOG_PRIORITY[resolveLogLevel()]) {
    return;
  }

  const timestamp = new Date().toISOString();

  if (process.env.NODE_ENV === "production") {
    const payload = JSON.stringify({
      timestamp,
      level,
      message,
      ...(context ? { context } : {}),
    });
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.log(payload);
    return;
  }

  const prefix = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  const writer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.info;

  if (context && Object.keys(context).length > 0) {
    writer(prefix, context);
  } else {
    writer(prefix);
  }
}

/**
 * Lightweight zero-dependency structured logger.
 * Outputs JSON in production (for Vercel Logs) and readable lines in development.
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    writeLog("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    writeLog("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    writeLog("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    writeLog("error", message, context),
};
