import { DownloadIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, type RequestFileWithUrl } from "./admin-types";

interface RequestFileListProps {
  files: RequestFileWithUrl[];
  kind: "input" | "deliverable";
  emptyMessage: string;
}

/**
 * Reusable file list for customer input uploads and staff finished deliverables.
 */
export function RequestFileList({
  files,
  kind,
  emptyMessage,
}: RequestFileListProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const isDeliverable = kind === "deliverable";

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                isDeliverable
                  ? "bg-success/10 text-success"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isDeliverable ? (
                <UploadIcon className="size-4" aria-hidden="true" />
              ) : (
                <FileTextIcon className="size-4" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {file.original_filename}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {!isDeliverable && file.field_key
                  ? `${file.field_key} • `
                  : ""}
                {file.mime_type} • {formatBytes(file.size_bytes)}
              </div>
            </div>
          </div>

          {file.downloadUrl ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Download ${file.original_filename}`}
                />
              }
              nativeButton={false}
            >
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Download
            </Button>
          ) : (
            <Badge variant="warning">Purged after retention window</Badge>
          )}
        </div>
      ))}
    </div>
  );
}
