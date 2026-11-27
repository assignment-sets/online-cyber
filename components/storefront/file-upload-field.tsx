"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Trash2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { FormFieldDefinition } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";
import { formatAllowedMimeTypes, formatBytes } from "./format";

export interface SelectedLocalFile {
  clientFileId: string;
  fieldKey: string;
  file: File;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export type FileUploadProgressStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed";

interface FileUploadFieldProps {
  field: FormFieldDefinition;
  files: SelectedLocalFile[];
  onFilesChange: (next: SelectedLocalFile[]) => void;
  uploadStatusByClientFileId?: Record<string, FileUploadProgressStatus>;
  externalError?: string;
  disabled?: boolean;
}

function renderUploadStatusBadge(status: FileUploadProgressStatus | undefined) {
  if (!status) {
    return null;
  }

  switch (status) {
    case "pending":
      return <Badge variant="outline">Queued</Badge>;
    case "uploading":
      return (
        <Badge variant="info">
          <Spinner data-icon="inline-start" aria-hidden="true" />
          Uploading…
        </Badge>
      );
    case "uploaded":
      return (
        <Badge variant="success">
          <CheckCircle2Icon data-icon="inline-start" aria-hidden="true" />
          Uploaded
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <AlertCircleIcon data-icon="inline-start" aria-hidden="true" />
          Failed
        </Badge>
      );
  }
}

/**
 * Per-field local file selector enforcing service schema MIME type,
 * per-file size, and max file count constraints with zero network calls on select.
 */
export function FileUploadField({
  field,
  files,
  onFilesChange,
  uploadStatusByClientFileId,
  externalError,
  disabled = false,
}: FileUploadFieldProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  const maxFiles = field.maxFiles ?? 1;
  const maxBytes = field.maxFileSizeBytes ?? 0;
  const allowedMimes = (field.allowedMimeTypes ?? []).map((mime) =>
    mime.trim().toLowerCase()
  );
  const allowedSet = new Set(allowedMimes);
  const inputId = `field-${field.key}`;
  const displayError = localError ?? externalError ?? null;
  const isAtLimit = files.length >= maxFiles;
  const isDisabled = disabled || isAtLimit;

  const fallbackConstraints = [
    formatAllowedMimeTypes(field.allowedMimeTypes),
    maxBytes > 0 ? `Max ${formatBytes(maxBytes)}` : null,
    maxFiles > 1 ? `Up to ${maxFiles} files` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const helperCopy = field.helpText?.trim() || fallbackConstraints;

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedList = event.target.files;
    if (!selectedList || selectedList.length === 0) {
      return;
    }

    const selectedFiles = Array.from(selectedList);
    // Reset input value so re-selecting the same filename triggers onChange.
    event.target.value = "";

    setLocalError(null);

    let workingFiles = [...files];
    let validationError: string | null = null;

    for (const file of selectedFiles) {
      if (workingFiles.length >= maxFiles) {
        validationError = `Maximum of ${maxFiles} file(s) already reached for "${field.label}".`;
        break;
      }

      const normalizedMime = file.type.trim().toLowerCase();
      if (
        !normalizedMime ||
        (allowedSet.size > 0 && !allowedSet.has(normalizedMime))
      ) {
        validationError = `File "${file.name}" (${normalizedMime || "unknown type"}) is not allowed. Allowed: ${formatAllowedMimeTypes(allowedMimes)}.`;
        continue;
      }

      if (file.size <= 0) {
        validationError = `File "${file.name}" is empty (0 bytes).`;
        continue;
      }

      if (maxBytes > 0 && file.size > maxBytes) {
        validationError = `File "${file.name}" (${formatBytes(file.size)}) exceeds the ${formatBytes(maxBytes)} per-file limit.`;
        continue;
      }

      const localRecord: SelectedLocalFile = {
        clientFileId: crypto.randomUUID(),
        fieldKey: field.key,
        file,
        originalFilename: file.name,
        mimeType: normalizedMime,
        sizeBytes: file.size,
      };

      workingFiles = [...workingFiles, localRecord];
    }

    if (validationError) {
      setLocalError(validationError);
    }

    if (workingFiles.length !== files.length) {
      onFilesChange(workingFiles);
    }
  }

  function handleRemoveFile(clientFileId: string) {
    setLocalError(null);
    onFilesChange(files.filter((item) => item.clientFileId !== clientFileId));
  }

  return (
    <Field
      data-invalid={displayError ? true : undefined}
      data-disabled={disabled ? true : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={inputId}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
        </FieldLabel>
        {maxFiles > 1 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {files.length} / {maxFiles} selected
          </span>
        ) : null}
      </div>

      {helperCopy ? <FieldDescription>{helperCopy}</FieldDescription> : null}

      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          name={field.key}
          type="file"
          accept={allowedMimes.join(",")}
          multiple={maxFiles > 1}
          disabled={isDisabled}
          aria-invalid={displayError ? true : undefined}
          onChange={handleFileSelection}
          className="peer sr-only"
        />

        <label
          htmlFor={inputId}
          aria-disabled={isDisabled ? true : undefined}
          className={cn(
            "flex min-h-13 items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/25 px-4 py-3 text-sm font-medium transition-colors peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            displayError ? "border-destructive" : "",
            isDisabled
              ? "cursor-not-allowed text-muted-foreground opacity-60"
              : "cursor-pointer text-foreground hover:bg-muted/50"
          )}
        >
          <UploadCloudIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>
            {isAtLimit
              ? maxFiles === 1
                ? "File Attached"
                : "File Limit Reached"
              : files.length > 0
                ? "Add Another File"
                : "Tap to Upload File"}
          </span>
        </label>

        {files.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {files.map((file) => {
              const status = uploadStatusByClientFileId?.[file.clientFileId];
              return (
                <li
                  key={file.clientFileId}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileTextIcon
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="truncate font-medium text-foreground">
                      {file.originalFilename}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      ({formatBytes(file.sizeBytes)})
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {renderUploadStatusBadge(status)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      onClick={() => handleRemoveFile(file.clientFileId)}
                      aria-label={`Remove ${file.originalFilename}`}
                      className="size-9 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {displayError ? <FieldError>{displayError}</FieldError> : null}
    </Field>
  );
}
