import dotenv from "dotenv";

dotenv.config();

type LogLevel = "debug" | "info" | "warn" | "error";

const missing: string[] = [];

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    missing.push(key);
    return "";
  }
  return value;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const logLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";
const cultLogoUrl = process.env.CULT_LOGO_URL;
const cultLogoPath = process.env.CULT_LOGO_PATH;

if (!cultLogoUrl && !cultLogoPath) {
  missing.push("CULT_LOGO_URL or CULT_LOGO_PATH");
}

const env = {
  databaseUrl: requireEnv("DATABASE_URL"),
  cultTwitterHandle: requireEnv("CULT_TWITTER_HANDLE"),
  pumpfunDeployerPrivateKey: requireEnv("PUMPFUN_DEPLOYER_PRIVATE_KEY"),
  cultDescription: requireEnv("CULT_DESCRIPTION"),
  cultLogoUrl,
  cultLogoPath,
  solanaRpcUrl:
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  logLevel,
  followerPollIntervalMs: toNumber(
    process.env.FOLLOWER_POLL_INTERVAL_MS,
    30000,
  ),
  followerFetchLimit: Math.max(
    1,
    toNumber(process.env.FOLLOWER_FETCH_LIMIT, 100),
  ),
  inductionEnabled: toBoolean(process.env.INDUCTION_ENABLED, true),
  host: process.env.HOST ?? "0.0.0.0",
  port: toNumber(process.env.PORT, 3000),
  xScraperUsername: process.env.X_SCRAPER_USERNAME,
  xScraperPassword: process.env.X_SCRAPER_PASSWORD,
  xScraperEmail: process.env.X_SCRAPER_EMAIL,
  xScraper2faSecret: process.env.X_SCRAPER_2FA_SECRET,
  xScraperCookies: process.env.X_SCRAPER_COOKIES,
};

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

export { env, LogLevel };
