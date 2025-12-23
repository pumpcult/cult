import { env, LogLevel } from "../config/env";

type LogFn = (message: string, meta?: Record<string, unknown>) => void;

type Logger = {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
};

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const formatMeta = (meta?: Record<string, unknown>): string => {
  if (!meta || Object.keys(meta).length === 0) return "";
  return ` ${JSON.stringify(meta)}`;
};

export const createLogger = (level: LogLevel): Logger => {
  const threshold = levels[level] ?? levels.info;

  const log = (lvl: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (levels[lvl] < threshold) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase()} ${message}${formatMeta(meta)}`;
    if (lvl === "error") {
      console.error(line);
    } else if (lvl === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
  };
};

export const logger = createLogger(env.logLevel);
