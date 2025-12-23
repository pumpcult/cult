import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import {
  MAX_TOKEN_NAME_LENGTH,
  MAX_TOKEN_SYMBOL_LENGTH,
  TOKEN_NAME_SUFFIX,
  TOKEN_SYMBOL_PREFIX,
  X_PROFILE_BASE_URL,
} from "../config/constants";
import { FollowerProfile, TokenMetadataInput, UploadedMetadata } from "../types";

const METADATA_API_URL = "https://pump.fun/api/ipfs";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

type LogoSource = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

const resolveContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
};

const loadLogoFromPath = async (logoPath: string): Promise<LogoSource> => {
  const resolvedPath = path.resolve(process.cwd(), logoPath);
  const buffer = await readFile(resolvedPath);
  const filename = path.basename(resolvedPath) || "logo.png";

  return {
    buffer,
    contentType: resolveContentType(filename),
    filename,
  };
};

const loadLogoFromUrl = async (logoUrl: string): Promise<LogoSource> => {
  const response = await fetch(logoUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo (${response.status}): ${logoUrl}`);
  }

  let filename = "logo.png";
  try {
    const parsed = new URL(logoUrl);
    const candidate = path.basename(parsed.pathname);
    if (candidate) {
      filename = candidate;
    }
  } catch {
    // Ignore invalid URL parsing.
  }

  const headerType = response.headers.get("content-type");
  const contentType = headerType ?? resolveContentType(filename);
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    contentType,
    filename,
  };
};

const resolveLogoSource = async (
  logoUrl: string,
  logoPath?: string,
): Promise<LogoSource> => {
  if (logoPath) {
    return loadLogoFromPath(logoPath);
  }

  if (!logoUrl) {
    throw new Error("CULT_LOGO_URL or CULT_LOGO_PATH must be set.");
  }

  return loadLogoFromUrl(logoUrl);
};

const truncateUtf8 = (value: string, maxBytes: number): string => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let truncated = value;
  while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
};

export const normalizeUsername = (raw: string): string => {
  const trimmed = raw.replace(/^@/, "").trim();
  return trimmed.toLowerCase().replace(/[^a-z0-9_]/g, "");
};

const buildTokenName = (username: string): string => {
  return truncateUtf8(`${username} ${TOKEN_NAME_SUFFIX}`, MAX_TOKEN_NAME_LENGTH);
};

const buildTokenSymbol = (username: string): string => {
  const symbol = `${TOKEN_SYMBOL_PREFIX}${username.toUpperCase()}`.replace(
    /[^A-Z0-9_]/g,
    "",
  );
  return truncateUtf8(symbol, MAX_TOKEN_SYMBOL_LENGTH);
};

export const buildTokenMetadata = (follower: FollowerProfile): TokenMetadataInput => {
  const normalized = normalizeUsername(follower.username);
  const profileUrl = follower.profileUrl || `${X_PROFILE_BASE_URL}/${normalized}`;

  return {
    name: buildTokenName(normalized),
    symbol: buildTokenSymbol(normalized),
    description: env.cultDescription,
    logoUrl: env.cultLogoUrl ?? "",
    followerProfileUrl: profileUrl,
  };
};

export const uploadMetadata = async (
  metadata: TokenMetadataInput,
): Promise<UploadedMetadata> => {
  const logo = await resolveLogoSource(metadata.logoUrl, env.cultLogoPath);

  const form = new FormData();
  form.append(
    "file",
    new Blob([logo.buffer], { type: logo.contentType }),
    logo.filename,
  );
  form.append("name", metadata.name);
  form.append("symbol", metadata.symbol);
  form.append("description", metadata.description);
  form.append("twitter", metadata.followerProfileUrl);
  form.append("telegram", "");
  form.append("website", "");
  form.append("showName", "true");

  const response = await fetch(METADATA_API_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Metadata upload failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    metadataUri?: string;
    image?: string;
  };

  if (!payload.metadataUri) {
    throw new Error("Metadata upload did not return a metadataUri.");
  }

  return {
    metadataUri: payload.metadataUri,
    image: payload.image ?? "",
  };
};
