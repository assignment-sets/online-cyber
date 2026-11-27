"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormFieldDefinition } from "@/lib/domain/service-schema";
import {
  FileUploadField,
  type FileUploadProgressStatus,
  type SelectedLocalFile,
} from "./file-upload-field";

interface ServiceFieldRendererProps {
  field: FormFieldDefinition;
  value: unknown;
  files: SelectedLocalFile[];
  uploadStatusByClientFileId: Record<string, FileUploadProgressStatus>;
  error?: string;
  disabled: boolean;
  onValueChange: (key: string, nextValue: unknown) => void;
  onFilesChange: (key: string, nextFiles: SelectedLocalFile[]) => void;
}

/**
 * Config-driven field renderer supporting file, checkbox, select, textarea, number, and text inputs.
 */
export function ServiceFieldRenderer({
  field,
  value,
  files,
  uploadStatusByClientFileId,
  error,
  disabled,
  onValueChange,
  onFilesChange,
}: ServiceFieldRendererProps) {
  const fieldId = `field-${field.key}`;

  if (field.type === "file") {
    return (
      <FileUploadField
        field={field}
        files={files}
        onFilesChange={(nextFiles) => onFilesChange(field.key, nextFiles)}
        uploadStatusByClientFileId={uploadStatusByClientFileId}
        externalError={error}
        disabled={disabled}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <Field
        orientation="horizontal"
        data-invalid={error ? true : undefined}
        className="min-h-11 items-start rounded-lg border px-3 py-2.5"
      >
        <Checkbox
          id={fieldId}
          checked={Boolean(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onCheckedChange={(checked) =>
            onValueChange(field.key, checked === true)
          }
          className="mt-0.5"
        />
        <FieldContent>
          <FieldLabel htmlFor={fieldId} className="cursor-pointer font-medium">
            {field.label}
            {field.required ? " *" : ""}
          </FieldLabel>
          {field.helpText ? (
            <FieldDescription>{field.helpText}</FieldDescription>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldContent>
      </Field>
    );
  }

  if (field.type === "select") {
    const placeholderText = field.placeholder?.trim() || `Select ${field.label}`;
    const items = [
      { label: placeholderText, value: null },
      ...(field.options ?? []).map((option) => ({
        label: option,
        value: option,
      })),
    ];
    const currentValue =
      typeof value === "string" && value !== "" ? value : null;

    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>
          {field.label}
          {field.required ? " *" : ""}
        </FieldLabel>
        <Select
          items={items}
          value={currentValue}
          disabled={disabled}
          onValueChange={(nextValue) =>
            onValueChange(field.key, nextValue ?? "")
          }
        >
          <SelectTrigger
            id={fieldId}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full text-base data-[size=default]:h-11 md:h-10 md:text-sm md:data-[size=default]:h-10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem
                  key={item.value ?? "__placeholder__"}
                  value={item.value}
                  className="min-h-10 md:min-h-8"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {field.helpText ? (
          <FieldDescription>{field.helpText}</FieldDescription>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>
          {field.label}
          {field.required ? " *" : ""}
        </FieldLabel>
        <Textarea
          id={fieldId}
          name={field.key}
          autoComplete="off"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onValueChange(field.key, event.target.value)}
          className="min-h-24 text-base md:text-sm"
        />
        {field.helpText ? (
          <FieldDescription>{field.helpText}</FieldDescription>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    );
  }

  if (field.type === "number") {
    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>
          {field.label}
          {field.required ? " *" : ""}
        </FieldLabel>
        <Input
          id={fieldId}
          name={field.key}
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={field.min}
          max={field.max}
          value={value === undefined || value === null ? "" : String(value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onValueChange(field.key, event.target.value)}
          className="h-11 text-base md:h-10 md:text-sm"
        />
        {field.helpText ? (
          <FieldDescription>{field.helpText}</FieldDescription>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    );
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={fieldId}>
        {field.label}
        {field.required ? " *" : ""}
      </FieldLabel>
      <Input
        id={fieldId}
        name={field.key}
        type="text"
        autoComplete="off"
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onValueChange(field.key, event.target.value)}
        className="h-11 text-base md:h-10 md:text-sm"
      />
      {field.helpText ? (
        <FieldDescription>{field.helpText}</FieldDescription>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
