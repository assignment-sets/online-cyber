import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildObjectStorageKey,
  buildRequestStoragePrefix,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  createR2Client,
  deleteRequestFolder,
  getR2Client,
  getR2Config,
  type PresignUrlFn,
  resetR2Client,
  sanitizeFilename,
} from "@/lib/storage/r2";

type MockSendFn = (command: unknown) => Promise<unknown>;

const ORIGINAL_ENV = { ...process.env };

function setTestR2Env(overrides: Record<string, string | undefined> = {}) {
  process.env.S3_ENDPOINT = "https://account-id.r2.cloudflarestorage.com";
  process.env.S3_BUCKET = "online-cyber-bucket";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  delete process.env.S3_REGION;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetR2Client();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetR2Client();
  vi.restoreAllMocks();
});

describe("sanitizeFilename", () => {
  it("strips UNIX and Windows path traversal segments", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("../../../foo/../bar.pdf")).toBe("bar.pdf");
    expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe(
      "cmd.exe"
    );
    expect(sanitizeFilename("C:\\Users\\Alice\\My Doc.pdf")).toBe("My-Doc.pdf");
  });

  it("sanitizes special characters and preserves extensions", () => {
    expect(sanitizeFilename("My Aadhaar (Front) #1.PDF")).toBe(
      "My-Aadhaar-Front-1.PDF"
    );
    expect(sanitizeFilename("report..v2 [final].docx")).toBe(
      "report-v2-final.docx"
    );
    expect(sanitizeFilename("🎉🔥.png")).toBe("file.png");
    expect(sanitizeFilename(".env")).toBe("env");
  });

  it("falls back safely on empty or traversal-only filenames", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("   ")).toBe("file");
    expect(sanitizeFilename(".")).toBe("file");
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename("///")).toBe("file");
    expect(sanitizeFilename("../../")).toBe("file");
  });

  it("truncates overly long filenames while preserving the extension", () => {
    const longStem = "a".repeat(150);
    const result = sanitizeFilename(`${longStem}.jpeg`);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith(".jpeg")).toBe(true);
    expect(result).toBe(`${"a".repeat(95)}.jpeg`);
  });
});

describe("storage prefix and key builders", () => {
  it("builds an isolated request storage prefix", () => {
    expect(buildRequestStoragePrefix("req_123-abc")).toBe(
      "requests/req_123-abc"
    );
  });

  it("rejects unsafe requestId values", () => {
    expect(() => buildRequestStoragePrefix("")).toThrow(/Invalid requestId/);
    expect(() => buildRequestStoragePrefix("../other")).toThrow(
      /Invalid requestId/
    );
    expect(() => buildRequestStoragePrefix("req/sub")).toThrow(
      /Invalid requestId/
    );
  });

  it("builds input object keys with fieldKey and sanitized filename", () => {
    const key = buildObjectStorageKey({
      requestId: "req-42",
      direction: "input",
      fieldKey: "aadhaar_card",
      fileId: "file-001",
      filename: "../../My Aadhaar (1).pdf",
    });

    expect(key).toBe(
      "requests/req-42/inputs/aadhaar_card/file-001-My-Aadhaar-1.pdf"
    );
  });

  it("builds input object keys without fieldKey using generated UUID", () => {
    const key = buildObjectStorageKey({
      requestId: "req-42",
      direction: "input",
      filename: "scan.jpg",
    });

    expect(key).toMatch(
      /^requests\/req-42\/inputs\/[0-9a-f-]{36}-scan\.jpg$/i
    );
  });

  it("builds output object keys", () => {
    const key = buildObjectStorageKey({
      requestId: "req-42",
      direction: "output",
      fileId: "out-9",
      filename: "Final Receipt.pdf",
    });

    expect(key).toBe("requests/req-42/outputs/out-9-Final-Receipt.pdf");
  });

  it("rejects unsafe fieldKey or fileId segments", () => {
    expect(() =>
      buildObjectStorageKey({
        requestId: "req-42",
        direction: "input",
        fieldKey: "../secrets",
        filename: "doc.pdf",
      })
    ).toThrow(/Invalid fieldKey/);

    expect(() =>
      buildObjectStorageKey({
        requestId: "req-42",
        direction: "output",
        fileId: "bad/id",
        filename: "doc.pdf",
      })
    ).toThrow(/Invalid fileId/);
  });
});

describe("R2 config and client initialization", () => {
  it("loads config lazily with default region 'auto' and forcePathStyle", async () => {
    setTestR2Env();
    const config = getR2Config();
    expect(config).toEqual({
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "online-cyber-bucket",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    });

    const client = createR2Client();
    expect(client).toBeInstanceOf(S3Client);
    expect(client.config.forcePathStyle).toBe(true);
    expect(await client.config.region()).toBe("auto");
  });

  it("throws a clear error listing missing env vars", () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;

    expect(() => getR2Config()).toThrow(
      /S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/
    );
  });

  it("caches getR2Client for unchanged env and rebuilds on env change", () => {
    setTestR2Env();
    const first = getR2Client();
    const second = getR2Client();
    expect(first).toBe(second);

    process.env.S3_ACCESS_KEY_ID = "rotated-key";
    const third = getR2Client();
    expect(third).not.toBe(first);
  });
});

describe("presigned URL generation", () => {
  it("creates a presigned upload URL with PutObjectCommand, ContentType, and ContentLength", async () => {
    setTestR2Env();
    const fakeClient = new S3Client({
      region: "auto",
      endpoint: "https://example.r2.cloudflarestorage.com",
      forcePathStyle: true,
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
    });
    const signUrl = vi.fn<PresignUrlFn>(
      async () => "https://signed.example/upload"
    );

    const url = await createPresignedUploadUrl(
      {
        storageKey: "requests/req-1/inputs/id/123-card.pdf",
        contentType: "application/pdf",
        contentLength: 2048,
        expiresInSeconds: 600,
      },
      { client: fakeClient, bucket: "custom-bucket", signUrl }
    );

    expect(url).toBe("https://signed.example/upload");
    expect(signUrl).toHaveBeenCalledTimes(1);

    const [passedClient, passedCommand, passedOpts] = signUrl.mock.calls[0]!;
    expect(passedClient).toBe(fakeClient);
    expect(passedCommand).toBeInstanceOf(PutObjectCommand);
    expect((passedCommand as PutObjectCommand).input).toEqual({
      Bucket: "custom-bucket",
      Key: "requests/req-1/inputs/id/123-card.pdf",
      ContentType: "application/pdf",
      ContentLength: 2048,
    });
    expect(passedOpts).toEqual({ expiresIn: 600 });
  });

  it("omits ContentLength when not specified and defaults expiresInSeconds", async () => {
    setTestR2Env();
    const signUrl = vi.fn<PresignUrlFn>(
      async () => "https://signed.example/upload-default"
    );

    const url = await createPresignedUploadUrl(
      {
        storageKey: "requests/req-1/outputs/abc-out.png",
        contentType: "image/png",
      },
      { signUrl }
    );

    expect(url).toBe("https://signed.example/upload-default");
    const [, command, opts] = signUrl.mock.calls[0]!;
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "online-cyber-bucket",
      Key: "requests/req-1/outputs/abc-out.png",
      ContentType: "image/png",
    });
    expect(opts).toEqual({ expiresIn: 300 });
  });

  it("validates upload parameters", async () => {
    setTestR2Env();
    const signUrl = vi.fn<PresignUrlFn>(
      async () => "https://signed.example/never"
    );

    await expect(
      createPresignedUploadUrl(
        { storageKey: "../bad", contentType: "application/pdf" },
        { signUrl }
      )
    ).rejects.toThrow(/Invalid storageKey/);

    await expect(
      createPresignedUploadUrl(
        {
          storageKey: "requests/req-1/inputs/a.pdf",
          contentType: "   ",
        },
        { signUrl }
      )
    ).rejects.toThrow(/contentType is required/);

    await expect(
      createPresignedUploadUrl(
        {
          storageKey: "requests/req-1/inputs/a.pdf",
          contentType: "application/pdf",
          contentLength: 0,
        },
        { signUrl }
      )
    ).rejects.toThrow(/Invalid contentLength/);

    await expect(
      createPresignedUploadUrl(
        {
          storageKey: "requests/req-1/inputs/a.pdf",
          contentType: "application/pdf",
          expiresInSeconds: -10,
        },
        { signUrl }
      )
    ).rejects.toThrow(/Invalid expiresInSeconds/);
  });

  it("creates a presigned download URL with sanitized attachment filename", async () => {
    setTestR2Env();
    const signUrl = vi.fn<PresignUrlFn>(
      async () => "https://signed.example/download"
    );

    const url = await createPresignedDownloadUrl(
      {
        storageKey: "requests/req-1/outputs/abc-result.pdf",
        downloadFilename: '../../evil";header=1/Final Receipt.pdf',
        expiresInSeconds: 120,
      },
      { signUrl }
    );

    expect(url).toBe("https://signed.example/download");
    const [, command, opts] = signUrl.mock.calls[0]!;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: "online-cyber-bucket",
      Key: "requests/req-1/outputs/abc-result.pdf",
      ResponseContentDisposition: 'attachment; filename="Final-Receipt.pdf"',
    });
    expect(opts).toEqual({ expiresIn: 120 });
  });

  it("creates a presigned download URL without ResponseContentDisposition when omitted", async () => {
    setTestR2Env();
    const signUrl = vi.fn<PresignUrlFn>(
      async () => "https://signed.example/download-plain"
    );

    await createPresignedDownloadUrl(
      {
        storageKey: "requests/req-1/outputs/abc-result.pdf",
      },
      { signUrl }
    );

    const [, command] = signUrl.mock.calls[0]!;
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: "online-cyber-bucket",
      Key: "requests/req-1/outputs/abc-result.pdf",
    });
  });
});

describe("deleteRequestFolder", () => {
  it("refuses unsafe prefixes that could wipe the bucket or escape requests/", async () => {
    setTestR2Env();
    const send = vi.fn<MockSendFn>();

    const unsafePrefixes = [
      "",
      "/",
      "requests",
      "requests/",
      "requests///",
      "other-folder/req-1",
      "requests/../other",
      "requests/req-1\\sub",
      "requests//req-1",
    ];

    for (const prefix of unsafePrefixes) {
      await expect(
        deleteRequestFolder(prefix, { client: { send } })
      ).rejects.toThrow(/Refusing to delete/);
    }

    expect(send).not.toHaveBeenCalled();
  });

  it("returns deletedCount 0 when folder has no objects", async () => {
    setTestR2Env();
    const send = vi.fn<MockSendFn>(async () => ({
      Contents: [],
      IsTruncated: false,
    }));

    const result = await deleteRequestFolder("requests/req-empty", {
      client: { send },
    });

    expect(result).toEqual({ deletedCount: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const listCmd = send.mock.calls[0]![0];
    expect(listCmd).toBeInstanceOf(ListObjectsV2Command);
    expect((listCmd as ListObjectsV2Command).input).toEqual({
      Bucket: "online-cyber-bucket",
      Prefix: "requests/req-empty/",
    });
  });

  it("paginates ListObjectsV2Command and batches deletes up to 1000 objects", async () => {
    setTestR2Env();

    const page1Keys = Array.from({ length: 1050 }, (_, i) => ({
      Key: `requests/req-big/inputs/bulk/file-${i}.pdf`,
    }));
    const page2Keys = [
      { Key: "requests/req-big/outputs/final-1.pdf" },
      { Key: "requests/req-big/outputs/final-2.pdf" },
    ];

    const sentCommands: unknown[] = [];
    const send = vi.fn<MockSendFn>(async (command: unknown) => {
      sentCommands.push(command);

      if (command instanceof ListObjectsV2Command) {
        if (!command.input.ContinuationToken) {
          return {
            Contents: page1Keys,
            IsTruncated: true,
            NextContinuationToken: "token-page-2",
          };
        }
        return {
          Contents: page2Keys,
          IsTruncated: false,
        };
      }

      if (command instanceof DeleteObjectsCommand) {
        const count = command.input.Delete?.Objects?.length ?? 0;
        return {
          Deleted: Array.from({ length: count }, (_, i) => ({
            Key: `deleted-${i}`,
          })),
        };
      }

      throw new Error("Unexpected command");
    });

    const result = await deleteRequestFolder("requests/req-big", {
      client: { send },
      bucket: "test-bucket",
    });

    expect(result).toEqual({ deletedCount: 1052 });

    const listCalls = sentCommands.filter(
      (c): c is ListObjectsV2Command => c instanceof ListObjectsV2Command
    );
    expect(listCalls).toHaveLength(2);
    expect(listCalls[0]!.input).toEqual({
      Bucket: "test-bucket",
      Prefix: "requests/req-big/",
    });
    expect(listCalls[1]!.input).toEqual({
      Bucket: "test-bucket",
      Prefix: "requests/req-big/",
      ContinuationToken: "token-page-2",
    });

    const deleteCalls = sentCommands.filter(
      (c): c is DeleteObjectsCommand => c instanceof DeleteObjectsCommand
    );
    expect(deleteCalls).toHaveLength(3);
    expect(deleteCalls[0]!.input.Delete?.Objects).toHaveLength(1000);
    expect(deleteCalls[1]!.input.Delete?.Objects).toHaveLength(50);
    expect(deleteCalls[2]!.input.Delete?.Objects).toHaveLength(2);
  });

  it("throws when DeleteObjectsCommand returns partial Errors", async () => {
    setTestR2Env();
    const send = vi.fn<MockSendFn>(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [{ Key: "requests/req-err/inputs/doc.pdf" }],
          IsTruncated: false,
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        return {
          Errors: [
            {
              Key: "requests/req-err/inputs/doc.pdf",
              Code: "AccessDenied",
              Message: "Access Denied",
            },
          ],
        };
      }
      throw new Error("Unexpected command");
    });

    await expect(
      deleteRequestFolder("requests/req-err/", { client: { send } })
    ).rejects.toThrow(/Failed to delete object\(s\).*AccessDenied/);
  });
});
