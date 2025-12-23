import Fastify from "fastify";
import { env } from "./config/env";

export const buildServer = () => {
  const server = Fastify({ logger: false });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/status", async () => ({
    status: "ok",
    inductionEnabled: env.inductionEnabled,
    pollIntervalMs: env.followerPollIntervalMs,
    timestamp: new Date().toISOString(),
  }));

  return server;
};
