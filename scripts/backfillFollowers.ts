import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { ingestFollowers } from "../src/services/inductionService";
import { TwitterScraperClient } from "../src/twitter/twitterClient";

const run = async () => {
  await prisma.$connect();

  const client = new TwitterScraperClient();
  const followers = await client.fetchFollowers(
    env.cultTwitterHandle,
    env.followerFetchLimit,
  );

  const inserted = await ingestFollowers(followers);

  console.log(
    `Backfill complete. Fetched ${followers.length}, inserted ${inserted.length}.`,
  );

  await prisma.$disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
