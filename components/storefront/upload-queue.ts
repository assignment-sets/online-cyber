import type { FileUploadProgressStatus } from "./file-upload-field";

export const UPLOAD_CONCURRENCY = 5;

export interface UploadTarget {
  clientFileId: string;
  fieldKey: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadUrl: string;
}

export interface ParallelUploadOptions {
  uploadTargets: UploadTarget[];
  fileByClientFileId: Map<string, File>;
  concurrency?: number;
  onFileStatusChange?: (
    clientFileId: string,
    status: FileUploadProgressStatus
  ) => void;
  onUploadedCountChange?: (uploadedCount: number) => void;
}

export interface ParallelUploadResult {
  succeededKeys: string[];
  failedTargets: UploadTarget[];
}

/**
 * Uploads presigned targets directly to R2 with bounded concurrency.
 */
export async function uploadFilesInParallel({
  uploadTargets,
  fileByClientFileId,
  concurrency = UPLOAD_CONCURRENCY,
  onFileStatusChange,
  onUploadedCountChange,
}: ParallelUploadOptions): Promise<ParallelUploadResult> {
  if (uploadTargets.length === 0) {
    return { succeededKeys: [], failedTargets: [] };
  }

  const succeededByIndex: Array<string | null> = new Array(
    uploadTargets.length
  ).fill(null);
  const failedByIndex: Array<UploadTarget | null> = new Array(
    uploadTargets.length
  ).fill(null);

  let nextIndex = 0;
  let uploadedCount = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= uploadTargets.length) {
        return;
      }

      const target = uploadTargets[currentIndex];
      const file = fileByClientFileId.get(target.clientFileId);
      if (!file) {
        onFileStatusChange?.(target.clientFileId, "failed");
        failedByIndex[currentIndex] = target;
        continue;
      }

      onFileStatusChange?.(target.clientFileId, "uploading");

      try {
        const response = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": target.mimeType },
          body: file,
        });

        if (!response.ok) {
          onFileStatusChange?.(target.clientFileId, "failed");
          failedByIndex[currentIndex] = target;
          continue;
        }

        succeededByIndex[currentIndex] = target.storageKey;
        uploadedCount += 1;
        onFileStatusChange?.(target.clientFileId, "uploaded");
        onUploadedCountChange?.(uploadedCount);
      } catch {
        onFileStatusChange?.(target.clientFileId, "failed");
        failedByIndex[currentIndex] = target;
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), uploadTargets.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return {
    succeededKeys: succeededByIndex.filter(
      (key): key is string => key !== null
    ),
    failedTargets: failedByIndex.filter(
      (target): target is UploadTarget => target !== null
    ),
  };
}
