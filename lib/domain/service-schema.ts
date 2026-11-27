import { z } from "zod";

/**
 * Threshold in paise at or above which a 50% advance payment is required (₹500.00).
 */
export const ADVANCE_THRESHOLD_PAISE = 50000;

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an integer paise amount as an INR currency string (e.g. 50000 -> "₹500.00").
 */
export function formatPaiseToInr(paise: number): string {
  if (!Number.isFinite(paise)) {
    throw new RangeError("Amount in paise must be a finite number");
  }
  return inrFormatter.format(paise / 100);
}

export const FORM_FIELD_TYPES = [
  "text",
  "number",
  "textarea",
  "select",
  "checkbox",
  "file",
] as const;

export const FormFieldTypeSchema = z.enum(FORM_FIELD_TYPES);
export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

export const FormFieldDefinitionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        FIELD_KEY_REGEX,
        "Field key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
      ),
    label: z.string().trim().min(1, "Field label is required"),
    type: FormFieldTypeSchema,
    required: z.boolean(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    min: z.number().finite("min must be a finite number").optional(),
    max: z.number().finite("max must be a finite number").optional(),
    options: z.array(z.string().trim().min(1, "Option cannot be empty")).optional(),
    allowedMimeTypes: z
      .array(
        z
          .string()
          .trim()
          .min(1, "MIME type cannot be empty")
          .transform((value) => value.toLowerCase())
      )
      .optional(),
    maxFileSizeBytes: z
      .number()
      .int("maxFileSizeBytes must be an integer")
      .positive("maxFileSizeBytes must be positive")
      .optional(),
    maxFiles: z
      .number()
      .int("maxFiles must be an integer")
      .positive("maxFiles must be positive")
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "max must be greater than or equal to min",
      });
    }

    if (field.type === "select") {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Select fields must define at least one option",
        });
      } else if (new Set(field.options).size !== field.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Select field options must be unique",
        });
      }
    }

    if (field.type === "file") {
      if (!field.allowedMimeTypes || field.allowedMimeTypes.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["allowedMimeTypes"],
          message: "File fields must define at least one allowed MIME type",
        });
      }
      if (field.maxFileSizeBytes === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["maxFileSizeBytes"],
          message: "File fields must specify a positive maxFileSizeBytes",
        });
      }
      if (field.maxFiles === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["maxFiles"],
          message: "File fields must specify a positive maxFiles",
        });
      }
    }
  });

export type FormFieldDefinition = z.infer<typeof FormFieldDefinitionSchema>;

const PerUnitPricingRuleSchema = z.object({
  id: z.string().trim().min(1, "Pricing rule id is required"),
  label: z.string().trim().min(1, "Pricing rule label is required"),
  type: z.literal("per_unit"),
  fieldKey: z.string().trim().min(1, "fieldKey is required"),
  unitPricePaise: z
    .number()
    .int("unitPricePaise must be an integer")
    .nonnegative("unitPricePaise cannot be negative"),
});

const OptionSurchargePricingRuleSchema = z.object({
  id: z.string().trim().min(1, "Pricing rule id is required"),
  label: z.string().trim().min(1, "Pricing rule label is required"),
  type: z.literal("option_surcharge"),
  fieldKey: z.string().trim().min(1, "fieldKey is required"),
  optionSurchargesPaise: z.record(
    z.string().min(1),
    z
      .number()
      .int("Option surcharge must be an integer")
      .nonnegative("Option surcharge cannot be negative")
  ),
});

const BooleanSurchargePricingRuleSchema = z.object({
  id: z.string().trim().min(1, "Pricing rule id is required"),
  label: z.string().trim().min(1, "Pricing rule label is required"),
  type: z.literal("boolean_surcharge"),
  fieldKey: z.string().trim().min(1, "fieldKey is required"),
  surchargePaise: z
    .number()
    .int("surchargePaise must be an integer")
    .nonnegative("surchargePaise cannot be negative"),
});

export const PricingRuleDefinitionSchema = z.discriminatedUnion("type", [
  PerUnitPricingRuleSchema,
  OptionSurchargePricingRuleSchema,
  BooleanSurchargePricingRuleSchema,
]);

export type PricingRuleDefinition = z.infer<typeof PricingRuleDefinitionSchema>;

const EXPECTED_FIELD_TYPE_BY_RULE: Record<
  PricingRuleDefinition["type"],
  FormFieldType
> = {
  per_unit: "number",
  option_surcharge: "select",
  boolean_surcharge: "checkbox",
};

/**
 * Validates a service's form_schema and pricing_rules together, ensuring field keys
 * and rule IDs are unique and every pricing rule references a compatible field.
 */
export const ServiceConfigSchema = z
  .object({
    form_schema: z.array(FormFieldDefinitionSchema),
    pricing_rules: z.array(PricingRuleDefinitionSchema),
  })
  .superRefine((config, ctx) => {
    const fieldMap = new Map<string, FormFieldDefinition>();

    config.form_schema.forEach((field, index) => {
      if (fieldMap.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["form_schema", index, "key"],
          message: `Duplicate field key "${field.key}"`,
        });
        return;
      }
      fieldMap.set(field.key, field);
    });

    const ruleIds = new Set<string>();

    config.pricing_rules.forEach((rule, index) => {
      if (ruleIds.has(rule.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["pricing_rules", index, "id"],
          message: `Duplicate pricing rule id "${rule.id}"`,
        });
      }
      ruleIds.add(rule.id);

      const targetField = fieldMap.get(rule.fieldKey);
      if (!targetField) {
        ctx.addIssue({
          code: "custom",
          path: ["pricing_rules", index, "fieldKey"],
          message: `Pricing rule references unknown fieldKey "${rule.fieldKey}"`,
        });
        return;
      }

      const expectedType = EXPECTED_FIELD_TYPE_BY_RULE[rule.type];
      if (targetField.type !== expectedType) {
        ctx.addIssue({
          code: "custom",
          path: ["pricing_rules", index, "fieldKey"],
          message: `Pricing rule type "${rule.type}" requires a "${expectedType}" field, got "${targetField.type}"`,
        });
        return;
      }

      if (rule.type === "option_surcharge" && targetField.options) {
        const validOptions = new Set(targetField.options);
        for (const optionKey of Object.keys(rule.optionSurchargesPaise)) {
          if (!validOptions.has(optionKey)) {
            ctx.addIssue({
              code: "custom",
              path: ["pricing_rules", index, "optionSurchargesPaise", optionKey],
              message: `Option "${optionKey}" does not exist on select field "${targetField.key}"`,
            });
          }
        }
      }
    });
  });

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

export const UploadedFileMetadataSchema = z.object({
  fieldKey: z.string().trim().min(1, "fieldKey is required"),
  storageKey: z.string().trim().min(1, "storageKey is required"),
  originalFilename: z.string().trim().min(1, "originalFilename is required"),
  mimeType: z
    .string()
    .trim()
    .min(1, "mimeType is required")
    .transform((value) => value.toLowerCase()),
  sizeBytes: z
    .number()
    .int("sizeBytes must be an integer")
    .positive("sizeBytes must be positive"),
});

export type UploadedFileMetadata = z.infer<typeof UploadedFileMetadataSchema>;

export const PendingFileDescriptorSchema = z.object({
  clientFileId: z
    .string()
    .trim()
    .min(1, "clientFileId is required")
    .max(100, "clientFileId cannot exceed 100 characters"),
  fieldKey: z.string().trim().min(1, "fieldKey is required"),
  originalFilename: z
    .string()
    .trim()
    .min(1, "originalFilename is required")
    .max(255, "originalFilename cannot exceed 255 characters"),
  mimeType: z
    .string()
    .trim()
    .min(1, "mimeType is required")
    .max(120, "mimeType cannot exceed 120 characters")
    .transform((value) => value.toLowerCase()),
  sizeBytes: z
    .number()
    .int("sizeBytes must be an integer")
    .positive("sizeBytes must be positive"),
});

export type PendingFileDescriptor = z.infer<typeof PendingFileDescriptorSchema>;

export const ExpectedUploadItemSchema = PendingFileDescriptorSchema.extend({
  storageKey: z.string().trim().min(1, "storageKey is required"),
});

export type ExpectedUploadItem = z.infer<typeof ExpectedUploadItemSchema>;
