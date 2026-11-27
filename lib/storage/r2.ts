import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_REGION = "auto";
const DEFAULT_PRESIGN_EXPIRES_SECONDS = 300;
const MAX_PRESIGN_EXPIRES_SECONDS = 604_800; // 7 days (S3 v4 signature limit)
const MAX_FILENAME_LENGTH = 100;
const MAX_EXTENSION_LENGTH = 16;
const MAX_DELETE_BATCH_SIZE = 1000;
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface R2Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface R2ClientOptions {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export type PresignUrlFn = (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options?: { expiresIn?: number }
) => Promise<string>;

export interface R2StorageDeps {
  client?: S3Client;
  bucket?: string;
  signUrl?: PresignUrlFn;
}

export interface DeleteRequestFolderDeps {
  client?: Pick<S3Client, "send">;
  bucket?: string;
}

export interface CreatePresignedUploadUrlParams {
  storageKey: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
}

export interface CreatePresignedDownloadUrlParams {
  storageKey: string;
  downloadFilename?: string;
  expiresInSeconds?: number;
}

export interface BuildObjectStorageKeyParams {
  requestId: string;
  direction: "input" | "output";
  fieldKey?: string;
  filename: string;
  fileId?: string;
}

let cachedClientEntry: { cacheKey: string; client: S3Client } | null = null;

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Resolves and validates S3/R2 configuration lazily from environment variables.
 */
export function getR2Config(): R2Config {
  const endpoint = readTrimmedEnv("S3_ENDPOINT");
  const region = readTrimmedEnv("S3_REGION") ?? DEFAULT_REGION;
  const bucket = readTrimmedEnv("S3_BUCKET");
  const accessKeyId = readTrimmedEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readTrimmedEnv("S3_SECRET_ACCESS_KEY");

  const missing: string[] = [];
  if (!endpoint) missing.push("S3_ENDPOINT");
  if (!bucket) missing.push("S3_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required R2/S3 environment variable(s): ${missing.join(", ")}`
    );
  }

  return {
    endpoint: endpoint!,
    region,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  };
}

/**
 * Resolves the target R2/S3 bucket name from overrides or S3_BUCKET env var.
 */
export function getR2Bucket(overrideBucket?: string): string {
  const bucket = overrideBucket?.trim() || readTrimmedEnv("S3_BUCKET");
  if (!bucket) {
    throw new Error("Missing required R2/S3 environment variable(s): S3_BUCKET");
  }
  return bucket;
}

/**
 * Creates a new S3Client configured for Cloudflare R2 (or S3-compatible storage).
 */
export function createR2Client(options?: R2ClientOptions): S3Client {
  const endpoint = options?.endpoint?.trim() || readTrimmedEnv("S3_ENDPOINT");
  const region =
    options?.region?.trim() || readTrimmedEnv("S3_REGION") || DEFAULT_REGION;
  const accessKeyId =
    options?.accessKeyId?.trim() || readTrimmedEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey =
    options?.secretAccessKey?.trim() || readTrimmedEnv("S3_SECRET_ACCESS_KEY");

  const missing: string[] = [];
  if (!endpoint) missing.push("S3_ENDPOINT");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required R2/S3 environment variable(s): ${missing.join(", ")}`
    );
  }

  return new S3Client({
    region,
    endpoint: endpoint!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  });
}

/**
 * Lazily returns a cached S3Client configured from current environment variables.
 */
export function getR2Client(): S3Client {
  const endpoint = readTrimmedEnv("S3_ENDPOINT");
  const region = readTrimmedEnv("S3_REGION") ?? DEFAULT_REGION;
  const accessKeyId = readTrimmedEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readTrimmedEnv("S3_SECRET_ACCESS_KEY");

  const cacheKey = JSON.stringify([
    endpoint ?? "",
    region,
    accessKeyId ?? "",
    secretAccessKey ?? "",
  ]);

  if (cachedClientEntry && cachedClientEntry.cacheKey === cacheKey) {
    return cachedClientEntry.client;
  }

  const client = createR2Client({
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
  });
  cachedClientEntry = { cacheKey, client };
  return client;
}

/**
 * Clears the cached S3Client instance (useful in tests).
 */
export function resetR2Client(): void {
  cachedClientEntry = null;
}

function assertSafePathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || !SAFE_SEGMENT_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid ${label}: must contain only alphanumeric characters, underscores, or hyphens.`
    );
  }
  return trimmed;
}

function assertValidStorageKey(storageKey: string): string {
  const trimmed = storageKey.trim();
  if (
    !trimmed ||
    trimmed.startsWith("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes("//")
  ) {
    throw new Error("Invalid storageKey.");
  }
  return trimmed;
}

function validateExpiresIn(expiresInSeconds?: number): number {
  const value = expiresInSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS;
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_PRESIGN_EXPIRES_SECONDS
  ) {
    throw new Error(
      `Invalid expiresInSeconds: must be an integer between 1 and ${MAX_PRESIGN_EXPIRES_SECONDS}.`
    );
  }
  return value;
}

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
}

/**
 * Sanitizes an untrusted filename by removing path traversal, directory segments,
 * and special characters while safely preserving the extension and truncating length.
 */
export function sanitizeFilename(name: string): string {
  const normalizedSlashes = name.replace(/\\/g, "/");
  const segments = normalizedSlashes.split("/").filter(Boolean);
  const rawBasename = stripControlChars(segments.at(-1) ?? "").trim();

  if (!rawBasename || rawBasename === "." || rawBasename === "..") {
    return "file";
  }

  const lastDotIndex = rawBasename.lastIndexOf(".");
  let rawStem = rawBasename;
  let ext = "";

  if (lastDotIndex > 0) {
    const candidateExt = rawBasename
      .slice(lastDotIndex + 1)
      .replace(/[^a-zA-Z0-9]/g, "");
    if (
      candidateExt.length > 0 &&
      candidateExt.length <= MAX_EXTENSION_LENGTH
    ) {
      ext = `.${candidateExt}`;
      rawStem = rawBasename.slice(0, lastDotIndex);
    }
  }

  let stem = rawStem
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!stem) {
    stem = "file";
  }

  const maxStemLength = Math.max(1, MAX_FILENAME_LENGTH - ext.length);
  if (stem.length > maxStemLength) {
    stem =
      stem.slice(0, maxStemLength).replace(/[-_]+$/g, "") ||
      "file".slice(0, maxStemLength);
  }

  return `${stem}${ext}`;
}

/**
 * Builds the isolated object storage prefix for a work request.
 */
export function buildRequestStoragePrefix(requestId: string): string {
  const safeRequestId = assertSafePathSegment(requestId, "requestId");
  return `requests/${safeRequestId}`;
}

/**
 * Builds an isolated object storage key for a request input or output file.
 */
export function buildObjectStorageKey(
  params: BuildObjectStorageKeyParams
): string {
  const prefix = buildRequestStoragePrefix(params.requestId);
  const id = params.fileId
    ? assertSafePathSegment(params.fileId, "fileId")
    : crypto.randomUUID();
  const safeName = sanitizeFilename(params.filename);

  if (params.direction === "output") {
    return `${prefix}/outputs/${id}-${safeName}`;
  }

  if (params.fieldKey !== undefined && params.fieldKey.trim() !== "") {
    const safeFieldKey = assertSafePathSegment(params.fieldKey, "fieldKey");
    return `${prefix}/inputs/${safeFieldKey}/${id}-${safeName}`;
  }

  return `${prefix}/inputs/${id}-${safeName}`;
}

/**
 * Generates a presigned PUT URL for direct-to-storage file uploads.
 */
export async function createPresignedUploadUrl(
  params: CreatePresignedUploadUrlParams,
  deps?: R2StorageDeps
): Promise<string> {
  const key = assertValidStorageKey(params.storageKey);
  const contentType = params.contentType.trim();
  if (!contentType) {
    throw new Error("contentType is required for presigned upload URL.");
  }

  if (
    params.contentLength !== undefined &&
    (!Number.isInteger(params.contentLength) || params.contentLength <= 0)
  ) {
    throw new Error(
      "Invalid contentLength: must be a positive integer byte count."
    );
  }

  const expiresIn = validateExpiresIn(params.expiresInSeconds);
  const bucket = getR2Bucket(deps?.bucket);
  const client = deps?.client ?? getR2Client();
  const signUrl = deps?.signUrl ?? getSignedUrl;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(params.contentLength !== undefined
      ? { ContentLength: params.contentLength }
      : {}),
  });

  return signUrl(client, command, { expiresIn });
}

/**
 * Generates a presigned GET URL for downloading stored deliverables or inputs.
 */
export async function createPresignedDownloadUrl(
  params: CreatePresignedDownloadUrlParams,
  deps?: R2StorageDeps
): Promise<string> {
  const key = assertValidStorageKey(params.storageKey);
  const expiresIn = validateExpiresIn(params.expiresInSeconds);
  const bucket = getR2Bucket(deps?.bucket);
  const client = deps?.client ?? getR2Client();
  const signUrl = deps?.signUrl ?? getSignedUrl;

  const safeDownloadName =
    params.downloadFilename && params.downloadFilename.trim() !== ""
      ? sanitizeFilename(params.downloadFilename)
      : undefined;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(safeDownloadName
      ? {
          ResponseContentDisposition: `attachment; filename="${safeDownloadName}"`,
        }
      : {}),
  });

  return signUrl(client, command, { expiresIn });
}

/**
 * Deletes all objects under a single request storage prefix (e.g. `requests/<id>`).
 * Refuses prefixes outside `requests/<id>` to prevent accidental bucket-wide deletion.
 */
export async function deleteRequestFolder(
  storagePrefix: string,
  deps?: DeleteRequestFolderDeps
): Promise<{ deletedCount: number }> {
  const trimmed = storagePrefix.trim();
  if (
    !trimmed.startsWith("requests/") ||
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    trimmed.includes("//")
  ) {
    throw new Error(
      `Refusing to delete unsafe storagePrefix "${storagePrefix}": must be a valid "requests/<requestId>" prefix.`
    );
  }

  const remainder = trimmed.slice("requests/".length).replace(/\/+$/, "");
  if (!remainder) {
    throw new Error(
      `Refusing to delete root "requests/" prefix without a specific request identifier.`
    );
  }

  const normalizedPrefix = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  const bucket = getR2Bucket(deps?.bucket);
  const client = deps?.client ?? getR2Client();

  let deletedCount = 0;
  let continuationToken: string | undefined;

  while (true) {
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      })
    );

    const keys = (listResponse.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));

    for (let i = 0; i < keys.length; i += MAX_DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + MAX_DELETE_BATCH_SIZE);
      const deleteResponse = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
          },
        })
      );

      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        const failed = deleteResponse.Errors.map(
          (err) => `${err.Key ?? "unknown"} (${err.Code ?? "Error"})`
        ).join(", ");
        throw new Error(
          `Failed to delete object(s) under "${normalizedPrefix}": ${failed}`
        );
      }

      deletedCount += deleteResponse.Deleted?.length ?? batch.length;
    }

    if (
      !listResponse.IsTruncated ||
      !listResponse.NextContinuationToken ||
      listResponse.NextContinuationToken === continuationToken
    ) {
      break;
    }

    continuationToken = listResponse.NextContinuationToken;
  }

  return { deletedCount };
}
