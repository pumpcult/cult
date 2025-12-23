import { buildServer } from "./server";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { TwitterScraperClient } from "./twitter/twitterClient";
import { FollowerWatcher } from "./twitter/followerWatcher";
import { inductFollowers } from "./services/inductionService";
import { logger } from "./services/logger";

const start = async () => {
  await prisma.$connect();

  const server = buildServer();
  await server.listen({ port: env.port, host: env.host });
  logger.info("Server listening", { host: env.host, port: env.port });

  const watcher = new FollowerWatcher(new TwitterScraperClient());
  let processingQueue = Promise.resolve();

  watcher.on("followers", async (followers) => {
    processingQueue = processingQueue.then(async () => {
      if (!env.inductionEnabled) {
        logger.warn("Induction disabled, skipping follower batch");
        return;
      }
      try {
        await inductFollowers(followers);
      } catch (error) {
        logger.error("Follower batch processing failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  watcher.on("error", (error) => {
    logger.error("Follower watcher error", { error: error.message });
  });

  watcher.start();

  const shutdown = async () => {
    watcher.stop();
    await server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
