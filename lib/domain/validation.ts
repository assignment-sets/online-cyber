import { z } from "zod";
import {
  PendingFileDescriptorSchema,
  UploadedFileMetadataSchema,
  type FormFieldDefinition,
  type PendingFileDescriptor,
  type UploadedFileMetadata,
} from "./service-schema";

export type FieldErrors = Record<string, string[]>;

export interface FileUploadRequestInput {
  fieldKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  existingFieldFileCount?: number;
}

export type FileUploadValidationResult =
  | { ok: true; field: FormFieldDefinition }
  | { ok: false; message: string; fieldErrors: FieldErrors };

export interface WorkRequestSubmissionPayload {
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerNote?: string | null;
  formData: Record<string, unknown>;
  files: UploadedFileMetadata[];
}

export interface NormalizedContactInfo {
  customerPhone: string | null;
  customerEmail: string | null;
  customerNote: string | null;
}

export type WorkRequestValidationResult =
  | {
      ok: true;
      normalizedFormData: Record<string, unknown>;
      normalizedContact: NormalizedContactInfo;
      files: UploadedFileMetadata[];
    }
  | { ok: false; fieldErrors: FieldErrors };

export interface WorkRequestInitiationPayload {
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerNote?: string | null;
  formData: Record<string, unknown>;
  files: PendingFileDescriptor[];
}

export type WorkRequestInitiationValidationResult =
  | {
      ok: true;
      normalizedFormData: Record<string, unknown>;
      normalizedContact: NormalizedContactInfo;
      files: PendingFileDescriptor[];
    }
  | { ok: false; fieldErrors: FieldErrors };

const PHONE_ALLOWED_CHARS_REGEX = /^[+\d\s().-]+$/;
const emailSchema = z.string().email();
const MAX_NOTE_LENGTH = 2000;

function addFieldError(
  fieldErrors: FieldErrors,
  key: string,
  message: string
): void {
  const existing = fieldErrors[key];
  if (existing) {
    existing.push(message);
  } else {
    fieldErrors[key] = [message];
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAllowedMimes(field: FormFieldDefinition): Set<string> {
  return new Set(
    (field.allowedMimeTypes ?? []).map((mime) => mime.trim().toLowerCase())
  );
}

/**
 * Validates a presigned upload request against a single file field in the service schema.
 */
export function validateFileUploadRequest(
  serviceFormSchema: FormFieldDefinition[],
  input: FileUploadRequestInput
): FileUploadValidationResult {
  const fieldErrors: FieldErrors = {};
  const fieldKey = typeof input.fieldKey === "string" ? input.fieldKey.trim() : "";

  if (!fieldKey) {
    addFieldError(fieldErrors, "fieldKey", "File field key is required.");
    return {
      ok: false,
      message: "File field key is required.",
      fieldErrors,
    };
  }

  const field = serviceFormSchema.find((item) => item.key === fieldKey);
  if (!field || field.type !== "file") {
    addFieldError(
      fieldErrors,
      fieldKey,
      `Unknown or non-file field "${fieldKey}".`
    );
    return {
      ok: false,
      message: `Unknown or non-file field "${fieldKey}".`,
      fieldErrors,
    };
  }

  const filename =
    typeof input.filename === "string" ? input.filename.trim() : "";
  if (!filename) {
    addFieldError(fieldErrors, "filename", "Filename is required.");
  }

  const normalizedMime =
    typeof input.mimeType === "string"
      ? input.mimeType.trim().toLowerCase()
      : "";
  const allowedMimes = normalizeAllowedMimes(field);
  if (!normalizedMime || !allowedMimes.has(normalizedMime)) {
    const allowedList = Array.from(allowedMimes).join(", ");
    addFieldError(
      fieldErrors,
      field.key,
      `File type "${normalizedMime || "unknown"}" is not allowed. Allowed types: ${allowedList}.`
    );
  }

  const maxBytes = field.maxFileSizeBytes ?? 0;
  if (
    typeof input.sizeBytes !== "number" ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > maxBytes
  ) {
    addFieldError(
      fieldErrors,
      field.key,
      `File size must be between 1 and ${maxBytes} bytes.`
    );
  }

  const existingCount = input.existingFieldFileCount ?? 0;
  const maxFiles = field.maxFiles ?? 1;
  if (!Number.isInteger(existingCount) || existingCount < 0) {
    addFieldError(
      fieldErrors,
      field.key,
      "Existing file count must be a non-negative integer."
    );
  } else if (existingCount >= maxFiles) {
    addFieldError(
      fieldErrors,
      field.key,
      `Maximum of ${maxFiles} file(s) already reached for "${field.label}".`
    );
  }

  if (Object.keys(fieldErrors).length > 0) {
    const firstMessage = Object.values(fieldErrors)[0]?.[0] ?? "Invalid file upload request.";
    return { ok: false, message: firstMessage, fieldErrors };
  }

  return { ok: true, field };
}

function validateAndNormalizeContact(
  payload: {
    customerPhone?: string | null;
    customerEmail?: string | null;
    customerNote?: string | null;
  },
  fieldErrors: FieldErrors
): NormalizedContactInfo {
  const customerPhone = normalizeOptionalString(payload.customerPhone);
  const rawEmail = normalizeOptionalString(payload.customerEmail);
  const customerEmail = rawEmail ? rawEmail.toLowerCase() : null;
  const customerNote = normalizeOptionalString(payload.customerNote);

  if (!customerPhone && !customerEmail) {
    const msg = "Provide at least a phone number or an email address.";
    addFieldError(fieldErrors, "customerPhone", msg);
    addFieldError(fieldErrors, "customerEmail", msg);
  }

  if (customerPhone) {
    const digitsOnly = customerPhone.replace(/\D/g, "");
    if (
      !PHONE_ALLOWED_CHARS_REGEX.test(customerPhone) ||
      digitsOnly.length < 7 ||
      digitsOnly.length > 15
    ) {
      addFieldError(
        fieldErrors,
        "customerPhone",
        "Enter a valid phone number with at least 7 digits."
      );
    }
  }

  if (customerEmail && !emailSchema.safeParse(customerEmail).success) {
    addFieldError(fieldErrors, "customerEmail", "Enter a valid email address.");
  }

  if (customerNote && customerNote.length > MAX_NOTE_LENGTH) {
    addFieldError(
      fieldErrors,
      "customerNote",
      `Customer note cannot exceed ${MAX_NOTE_LENGTH} characters.`
    );
  }

  return { customerPhone, customerEmail, customerNote };
}

function validateTextField(
  field: FormFieldDefinition,
  rawValue: unknown,
  fieldErrors: FieldErrors
): string | undefined {
  if (rawValue === undefined || rawValue === null) {
    if (field.required) {
      addFieldError(fieldErrors, field.key, `${field.label} is required.`);
    }
    return undefined;
  }

  if (typeof rawValue !== "string") {
    addFieldError(fieldErrors, field.key, `${field.label} must be text.`);
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    if (field.required) {
      addFieldError(fieldErrors, field.key, `${field.label} is required.`);
    }
    return undefined;
  }

  if (field.min !== undefined && trimmed.length < field.min) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be at least ${field.min} characters.`
    );
  }
  if (field.max !== undefined && trimmed.length > field.max) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be at most ${field.max} characters.`
    );
  }

  return trimmed;
}

function validateNumberField(
  field: FormFieldDefinition,
  rawValue: unknown,
  fieldErrors: FieldErrors
): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (field.required) {
      addFieldError(fieldErrors, field.key, `${field.label} is required.`);
    }
    return undefined;
  }

  let parsed: number;
  if (typeof rawValue === "number") {
    parsed = rawValue;
  } else if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      if (field.required) {
        addFieldError(fieldErrors, field.key, `${field.label} is required.`);
      }
      return undefined;
    }
    parsed = Number(trimmed);
  } else {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be a valid number.`
    );
    return undefined;
  }

  if (!Number.isFinite(parsed)) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be a finite number.`
    );
    return undefined;
  }

  if (field.min !== undefined && parsed < field.min) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be at least ${field.min}.`
    );
  }

  if (field.max !== undefined && parsed > field.max) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be at most ${field.max}.`
    );
  }

  return parsed;
}

function validateSelectField(
  field: FormFieldDefinition,
  rawValue: unknown,
  fieldErrors: FieldErrors
): string | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (field.required) {
      addFieldError(fieldErrors, field.key, `${field.label} is required.`);
    }
    return undefined;
  }

  if (typeof rawValue !== "string") {
    addFieldError(fieldErrors, field.key, `${field.label} must be a string option.`);
    return undefined;
  }

  const options = field.options ?? [];
  if (!options.includes(rawValue)) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} must be one of: ${options.join(", ")}.`
    );
    return undefined;
  }

  return rawValue;
}

function validateCheckboxField(
  field: FormFieldDefinition,
  rawValue: unknown,
  fieldErrors: FieldErrors
): boolean {
  if (rawValue === undefined || rawValue === null) {
    if (field.required) {
      addFieldError(fieldErrors, field.key, `${field.label} must be checked.`);
    }
    return false;
  }

  if (typeof rawValue !== "boolean") {
    addFieldError(fieldErrors, field.key, `${field.label} must be a boolean.`);
    return false;
  }

  if (field.required && !rawValue) {
    addFieldError(fieldErrors, field.key, `${field.label} must be checked.`);
  }

  return rawValue;
}

function validateFilesForField(
  field: FormFieldDefinition,
  fieldFiles: Array<{
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
  }>,
  fieldErrors: FieldErrors
): void {
  const maxFiles = field.maxFiles ?? 1;
  const maxBytes = field.maxFileSizeBytes ?? 0;
  const allowedMimes = normalizeAllowedMimes(field);

  if (field.required && fieldFiles.length === 0) {
    addFieldError(
      fieldErrors,
      field.key,
      `At least one file is required for ${field.label}.`
    );
    return;
  }

  if (fieldFiles.length > maxFiles) {
    addFieldError(
      fieldErrors,
      field.key,
      `${field.label} allows at most ${maxFiles} file(s).`
    );
  }

  for (const file of fieldFiles) {
    const normalizedMime = file.mimeType.trim().toLowerCase();
    if (!allowedMimes.has(normalizedMime)) {
      addFieldError(
        fieldErrors,
        field.key,
        `File "${file.originalFilename}" has disallowed MIME type "${normalizedMime}".`
      );
    }
    if (file.sizeBytes <= 0 || file.sizeBytes > maxBytes) {
      addFieldError(
        fieldErrors,
        field.key,
        `File "${file.originalFilename}" exceeds max size of ${maxBytes} bytes.`
      );
    }
  }
}

interface CoreValidationOptions<TFile> {
  fileSchema: z.ZodType<TFile>;
  getDedupeKey: (file: TFile) => string;
  dedupeKeyLabel: string;
  invalidFileFieldMessage: (fieldKey: string) => string;
  rejectNullFileKeyInFormData: boolean;
}

function validateWorkRequestCore<
  TFile extends {
    fieldKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  },
>(
  serviceFormSchema: FormFieldDefinition[],
  payload: {
    customerPhone?: string | null;
    customerEmail?: string | null;
    customerNote?: string | null;
    formData: Record<string, unknown>;
    files: unknown;
  },
  options: CoreValidationOptions<TFile>
):
  | {
      ok: true;
      normalizedFormData: Record<string, unknown>;
      normalizedContact: NormalizedContactInfo;
      files: TFile[];
    }
  | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};

  const normalizedContact = validateAndNormalizeContact(payload, fieldErrors);

  const formData =
    payload.formData &&
    typeof payload.formData === "object" &&
    !Array.isArray(payload.formData)
      ? payload.formData
      : null;

  if (!formData) {
    addFieldError(fieldErrors, "formData", "formData must be an object.");
    return { ok: false, fieldErrors };
  }

  const schemaByKey = new Map<string, FormFieldDefinition>();
  for (const field of serviceFormSchema) {
    schemaByKey.set(field.key, field);
  }

  for (const key of Object.keys(formData)) {
    const field = schemaByKey.get(key);
    if (!field) {
      addFieldError(fieldErrors, key, `Unknown form field "${key}".`);
    } else if (
      field.type === "file" &&
      formData[key] !== undefined &&
      (options.rejectNullFileKeyInFormData || formData[key] !== null)
    ) {
      addFieldError(
        fieldErrors,
        key,
        `File field "${key}" must be submitted via ${options.rejectNullFileKeyInFormData ? "files" : "uploaded file metadata"}.`
      );
    }
  }

  const filesInput = Array.isArray(payload.files) ? payload.files : null;
  if (!filesInput) {
    addFieldError(fieldErrors, "files", "files must be an array.");
    return { ok: false, fieldErrors };
  }

  const filesByField = new Map<string, TFile[]>();
  const seenDedupeKeys = new Set<string>();
  const normalizedFiles: TFile[] = [];

  for (const rawFile of filesInput) {
    const parsedFile = options.fileSchema.safeParse(rawFile);
    if (!parsedFile.success) {
      const targetKey =
        rawFile &&
        typeof rawFile === "object" &&
        "fieldKey" in rawFile &&
        typeof rawFile.fieldKey === "string" &&
        rawFile.fieldKey.trim()
          ? rawFile.fieldKey.trim()
          : "files";
      addFieldError(
        fieldErrors,
        targetKey,
        parsedFile.error.issues[0]?.message ?? "Invalid file metadata."
      );
      continue;
    }

    const file = parsedFile.data;
    const targetField = schemaByKey.get(file.fieldKey);
    if (!targetField || targetField.type !== "file") {
      addFieldError(
        fieldErrors,
        file.fieldKey,
        options.invalidFileFieldMessage(file.fieldKey)
      );
      continue;
    }

    const dedupeVal = options.getDedupeKey(file);
    if (seenDedupeKeys.has(dedupeVal)) {
      addFieldError(
        fieldErrors,
        file.fieldKey,
        `Duplicate ${options.dedupeKeyLabel} "${dedupeVal}" is not allowed.`
      );
      continue;
    }
    seenDedupeKeys.add(dedupeVal);

    normalizedFiles.push(file);
    const bucket = filesByField.get(file.fieldKey);
    if (bucket) {
      bucket.push(file);
    } else {
      filesByField.set(file.fieldKey, [file]);
    }
  }

  const normalizedFormData: Record<string, unknown> = {};

  for (const field of serviceFormSchema) {
    const rawValue = Object.hasOwn(formData, field.key)
      ? formData[field.key]
      : undefined;

    switch (field.type) {
      case "text":
      case "textarea": {
        const normalized = validateTextField(field, rawValue, fieldErrors);
        if (normalized !== undefined) {
          normalizedFormData[field.key] = normalized;
        }
        break;
      }
      case "number": {
        const normalized = validateNumberField(field, rawValue, fieldErrors);
        if (normalized !== undefined) {
          normalizedFormData[field.key] = normalized;
        }
        break;
      }
      case "select": {
        const normalized = validateSelectField(field, rawValue, fieldErrors);
        if (normalized !== undefined) {
          normalizedFormData[field.key] = normalized;
        }
        break;
      }
      case "checkbox": {
        normalizedFormData[field.key] = validateCheckboxField(
          field,
          rawValue,
          fieldErrors
        );
        break;
      }
      case "file": {
        validateFilesForField(
          field,
          filesByField.get(field.key) ?? [],
          fieldErrors
        );
        break;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    normalizedFormData,
    normalizedContact,
    files: normalizedFiles,
  };
}

/**
 * Strictly validates an incoming work request submission against the active service schema.
 */
export function validateWorkRequestSubmission(
  serviceFormSchema: FormFieldDefinition[],
  payload: WorkRequestSubmissionPayload
): WorkRequestValidationResult {
  return validateWorkRequestCore(serviceFormSchema, payload, {
    fileSchema: UploadedFileMetadataSchema,
    getDedupeKey: (file) => file.storageKey,
    dedupeKeyLabel: "storageKey",
    invalidFileFieldMessage: (fieldKey) =>
      `Uploaded file references unknown or non-file field "${fieldKey}".`,
    rejectNullFileKeyInFormData: false,
  });
}

/**
 * Strictly validates an incoming work request initiation (Upload-on-Submit)
 * against the active service schema before generating presigned upload URLs.
 */
export function validateWorkRequestInitiation(
  serviceFormSchema: FormFieldDefinition[],
  payload: WorkRequestInitiationPayload
): WorkRequestInitiationValidationResult {
  return validateWorkRequestCore(serviceFormSchema, payload, {
    fileSchema: PendingFileDescriptorSchema,
    getDedupeKey: (file) => file.clientFileId,
    dedupeKeyLabel: "clientFileId",
    invalidFileFieldMessage: (fieldKey) =>
      `Pending file references unknown or non-file field "${fieldKey}".`,
    rejectNullFileKeyInFormData: true,
  });
}
