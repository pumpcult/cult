import { InductionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { buildTokenMetadata, normalizeUsername } from "../pumpfun/metadata";
import { launchToken } from "../pumpfun/launcher";
import { FollowerProfile } from "../types";
import { logger } from "./logger";

const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const toFollowerData = (follower: FollowerProfile) => {
  const normalized = normalizeUsername(follower.username);
  return {
    normalized,
    data: {
      username: normalized,
      displayName: follower.displayName ?? null,
      profileUrl: follower.profileUrl,
      xUserId: follower.id ?? null,
    },
  };
};

export const ingestFollowers = async (
  followers: FollowerProfile[],
): Promise<FollowerProfile[]> => {
  const mapped = followers.map(toFollowerData);
  const usernames = mapped.map((entry) => entry.normalized);
  const userIds = mapped
    .map((entry) => entry.data.xUserId)
    .filter((id): id is string => Boolean(id));

  if (usernames.length === 0) return [];

  const existing = await prisma.follower.findMany({
    where: {
      OR: [
        { username: { in: usernames } },
        ...(userIds.length > 0 ? [{ xUserId: { in: userIds } }] : []),
      ],
    },
    select: { username: true, xUserId: true },
  });

  const existingUsernames = new Set(existing.map((row) => row.username));
  const existingUserIds = new Set(
    existing.map((row) => row.xUserId).filter(Boolean),
  );
  const newFollowers = mapped
    .filter((entry) => {
      if (existingUsernames.has(entry.normalized)) return false;
      if (entry.data.xUserId && existingUserIds.has(entry.data.xUserId)) {
        return false;
      }
      return true;
    })
    .map((entry) => entry.data);

  if (newFollowers.length > 0) {
    await prisma.follower.createMany({
      data: newFollowers,
      skipDuplicates: true,
    });
  }

  return newFollowers.map((row) => ({
    username: row.username,
    displayName: row.displayName ?? undefined,
    profileUrl: row.profileUrl,
    id: row.xUserId ?? undefined,
  }));
};

export const processFollower = async (follower: FollowerProfile): Promise<void> => {
  const mapped = toFollowerData(follower);

  let followerRecord = null;

  if (mapped.data.xUserId) {
    const existingById = await prisma.follower.findUnique({
      where: { xUserId: mapped.data.xUserId },
    });
    if (existingById) {
      followerRecord = await prisma.follower.update({
        where: { id: existingById.id },
        data: {
          username: mapped.normalized,
          displayName: mapped.data.displayName,
          profileUrl: mapped.data.profileUrl,
          xUserId: mapped.data.xUserId,
        },
      });
    }
  }

  if (!followerRecord) {
    followerRecord = await prisma.follower.upsert({
      where: { username: mapped.normalized },
      create: mapped.data,
      update: {
        displayName: mapped.data.displayName,
        profileUrl: mapped.data.profileUrl,
        xUserId: mapped.data.xUserId,
      },
    });
  }

  const induction = await prisma.induction.upsert({
    where: { followerId: followerRecord.id },
    create: {
      followerId: followerRecord.id,
      status: InductionStatus.pending,
    },
    update: {},
  });

  if (induction.status === InductionStatus.succeeded) {
    return;
  }

  const existingToken = await prisma.token.findUnique({
    where: { inductionId: induction.id },
  });

  if (existingToken) {
    await prisma.induction.update({
      where: { id: induction.id },
      data: {
        status: InductionStatus.succeeded,
        completedAt: new Date(),
      },
    });
    return;
  }

  const claimed = await prisma.induction.updateMany({
    where: {
      id: induction.id,
      status: { in: [InductionStatus.pending, InductionStatus.failed] },
    },
    data: {
      status: InductionStatus.processing,
      attempts: { increment: 1 },
      lastError: null,
      startedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    return;
  }

  try {
    const metadata = buildTokenMetadata({
      ...follower,
      username: mapped.normalized,
    });

    const launch = await launchToken(metadata);

    await prisma.token.create({
      data: {
        inductionId: induction.id,
        name: metadata.name,
        symbol: metadata.symbol,
        metadataUri: launch.metadataUri,
        address: launch.mintAddress,
        pumpfunUrl: launch.pumpfunUrl,
        txSignature: launch.txSignature,
      },
    });

    await prisma.induction.update({
      where: { id: induction.id },
      data: {
        status: InductionStatus.succeeded,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const message = formatError(error);
    logger.error("Induction failed", {
      follower: mapped.normalized,
      error: message,
    });
    await prisma.induction.update({
      where: { id: induction.id },
      data: {
        status: InductionStatus.failed,
        lastError: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
};

export const inductFollowers = async (
  followers: FollowerProfile[],
): Promise<void> => {
  const newFollowers = await ingestFollowers(followers);

  const retryInductions = await prisma.induction.findMany({
    where: {
      status: { in: [InductionStatus.pending, InductionStatus.failed] },
    },
    include: { follower: true },
  });

  const retryFollowers = retryInductions.map((induction) => ({
    username: induction.follower.username,
    displayName: induction.follower.displayName ?? undefined,
    profileUrl: induction.follower.profileUrl,
    id: induction.follower.xUserId ?? undefined,
  }));

  const queue = [...newFollowers, ...retryFollowers];
  const seen = new Set<string>();

  for (const follower of queue) {
    if (seen.has(follower.username)) continue;
    seen.add(follower.username);
    logger.info("Processing follower", { follower: follower.username });
    await processFollower(follower);
  }
};
