import { describe, expect, it } from "vitest";
import {
  ADVANCE_THRESHOLD_PAISE,
  ExpectedUploadItemSchema,
  FormFieldDefinitionSchema,
  PendingFileDescriptorSchema,
  ServiceConfigSchema,
  formatPaiseToInr,
  type FormFieldDefinition,
  type PricingRuleDefinition,
} from "../service-schema";
import {
  validateFileUploadRequest,
  validateWorkRequestInitiation,
  validateWorkRequestSubmission,
} from "../validation";
import { calculateRequestPricing } from "../pricing";
import {
  COMPLETED_RETENTION_MS,
  SHORT_RETENTION_MS,
  computeFilesExpireAt,
} from "../retention";
import {
  WORK_TOKEN_REGEX,
  generateWorkToken,
  isValidWorkToken,
  normalizeWorkToken,
} from "../tokens";

const sampleFormSchema: FormFieldDefinition[] = [
  {
    key: "full_name",
    label: "Full Name",
    type: "text",
    required: true,
    placeholder: "Enter full name",
  },
  {
    key: "instructions",
    label: "Special Instructions",
    type: "textarea",
    required: false,
  },
  {
    key: "page_count",
    label: "Page Count",
    type: "number",
    required: true,
    min: 1,
    max: 500,
  },
  {
    key: "print_mode",
    label: "Print Mode",
    type: "select",
    required: true,
    options: ["Black & White", "Color"],
  },
  {
    key: "spiral_binding",
    label: "Spiral Binding",
    type: "checkbox",
    required: false,
  },
  {
    key: "terms_accepted",
    label: "Confirm Document Accuracy",
    type: "checkbox",
    required: true,
  },
  {
    key: "source_pdfs",
    label: "Source PDFs",
    type: "file",
    required: true,
    allowedMimeTypes: ["application/pdf"],
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxFiles: 2,
  },
];

const samplePricingRules: PricingRuleDefinition[] = [
  {
    id: "rule_pages",
    label: "Per Page Print",
    type: "per_unit",
    fieldKey: "page_count",
    unitPricePaise: 300, // ₹3.00 per page
  },
  {
    id: "rule_print_mode",
    label: "Print Mode Surcharge",
    type: "option_surcharge",
    fieldKey: "print_mode",
    optionSurchargesPaise: {
      "Black & White": 0,
      Color: 5000, // ₹50.00
    },
  },
  {
    id: "rule_binding",
    label: "Spiral Binding",
    type: "boolean_surcharge",
    fieldKey: "spiral_binding",
    surchargePaise: 4000, // ₹40.00
  },
];

describe("service-schema", () => {
  it("exports advance threshold of ₹500.00 (50000 paise) and formats INR", () => {
    expect(ADVANCE_THRESHOLD_PAISE).toBe(50000);
    expect(formatPaiseToInr(0)).toBe("₹0.00");
    expect(formatPaiseToInr(50000)).toBe("₹500.00");
    expect(formatPaiseToInr(25050)).toBe("₹250.50");
    expect(formatPaiseToInr(100000)).toBe("₹1,000.00");
    expect(() => formatPaiseToInr(Number.NaN)).toThrow(RangeError);
  });

  it("validates FormFieldDefinitionSchema constraints", () => {
    expect(
      FormFieldDefinitionSchema.safeParse({
        key: "InvalidKey",
        label: "Bad Key",
        type: "text",
        required: true,
      }).success
    ).toBe(false);

    expect(
      FormFieldDefinitionSchema.safeParse({
        key: "choice",
        label: "Choice",
        type: "select",
        required: true,
        options: [],
      }).success
    ).toBe(false);

    expect(
      FormFieldDefinitionSchema.safeParse({
        key: "doc",
        label: "Doc",
        type: "file",
        required: true,
      }).success
    ).toBe(false);

    expect(
      FormFieldDefinitionSchema.safeParse({
        key: "copies",
        label: "Copies",
        type: "number",
        required: true,
        min: 10,
        max: 5,
      }).success
    ).toBe(false);

    const validFileField = FormFieldDefinitionSchema.parse({
      key: "id_proof",
      label: "ID Proof",
      type: "file",
      required: true,
      allowedMimeTypes: ["IMAGE/JPEG", "application/pdf"],
      maxFileSizeBytes: 5_000_000,
      maxFiles: 1,
    });
    expect(validFileField.allowedMimeTypes).toEqual([
      "image/jpeg",
      "application/pdf",
    ]);
  });

  it("validates ServiceConfigSchema cross-field pricing rules", () => {
    const valid = ServiceConfigSchema.safeParse({
      form_schema: sampleFormSchema,
      pricing_rules: samplePricingRules,
    });
    expect(valid.success).toBe(true);

    const unknownFieldRule = ServiceConfigSchema.safeParse({
      form_schema: sampleFormSchema,
      pricing_rules: [
        {
          id: "bad_ref",
          label: "Unknown",
          type: "per_unit",
          fieldKey: "nonexistent_field",
          unitPricePaise: 100,
        },
      ],
    });
    expect(unknownFieldRule.success).toBe(false);

    const wrongTypeRule = ServiceConfigSchema.safeParse({
      form_schema: sampleFormSchema,
      pricing_rules: [
        {
          id: "wrong_type",
          label: "Wrong Type",
          type: "per_unit",
          fieldKey: "full_name",
          unitPricePaise: 100,
        },
      ],
    });
    expect(wrongTypeRule.success).toBe(false);

    const invalidOptionSurcharge = ServiceConfigSchema.safeParse({
      form_schema: sampleFormSchema,
      pricing_rules: [
        {
          id: "bad_option",
          label: "Bad Option",
          type: "option_surcharge",
          fieldKey: "print_mode",
          optionSurchargesPaise: { Glossy: 2000 },
        },
      ],
    });
    expect(invalidOptionSurcharge.success).toBe(false);
  });

  it("validates PendingFileDescriptorSchema and ExpectedUploadItemSchema", () => {
    const pending = PendingFileDescriptorSchema.parse({
      clientFileId: " file-1 ",
      fieldKey: "source_pdfs",
      originalFilename: " doc.pdf ",
      mimeType: "Application/PDF",
      sizeBytes: 2048,
    });
    expect(pending).toEqual({
      clientFileId: "file-1",
      fieldKey: "source_pdfs",
      originalFilename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    expect(
      PendingFileDescriptorSchema.safeParse({
        clientFileId: "",
        fieldKey: "source_pdfs",
        originalFilename: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      }).success
    ).toBe(false);

    const expected = ExpectedUploadItemSchema.parse({
      ...pending,
      storageKey: "requests/req-1/inputs/source_pdfs/id-doc.pdf",
    });
    expect(expected.storageKey).toBe(
      "requests/req-1/inputs/source_pdfs/id-doc.pdf"
    );
  });
});

function expectOk<T extends { ok: boolean }>(
  result: T
): Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected validation result to succeed");
  }
  return result as Extract<T, { ok: true }>;
}

function expectErr<T extends { ok: boolean }>(
  result: T
): Extract<T, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected validation result to fail");
  }
  return result as Extract<T, { ok: false }>;
}

describe("validation", () => {
  describe("validateFileUploadRequest", () => {
    it("accepts valid file upload metadata and normalizes MIME type", () => {
      const result = expectOk(
        validateFileUploadRequest(sampleFormSchema, {
          fieldKey: "source_pdfs",
          filename: "notes.pdf",
          mimeType: "Application/PDF",
          sizeBytes: 1024 * 500,
          existingFieldFileCount: 1,
        })
      );

      expect(result.field.key).toBe("source_pdfs");
    });

    it("rejects bad MIME type, oversized file, maxFiles exceeded, and unknown field", () => {
      const badMime = expectErr(
        validateFileUploadRequest(sampleFormSchema, {
          fieldKey: "source_pdfs",
          filename: "photo.png",
          mimeType: "image/png",
          sizeBytes: 1024,
        })
      );
      expect(badMime.fieldErrors.source_pdfs).toBeDefined();

      const oversized = expectErr(
        validateFileUploadRequest(sampleFormSchema, {
          fieldKey: "source_pdfs",
          filename: "huge.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10 * 1024 * 1024 + 1,
        })
      );
      expect(oversized.fieldErrors.source_pdfs).toBeDefined();

      const maxReached = expectErr(
        validateFileUploadRequest(sampleFormSchema, {
          fieldKey: "source_pdfs",
          filename: "third.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          existingFieldFileCount: 2,
        })
      );
      expect(maxReached.fieldErrors.source_pdfs).toBeDefined();

      const nonFileField = validateFileUploadRequest(sampleFormSchema, {
        fieldKey: "full_name",
        filename: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      });
      expect(nonFileField.ok).toBe(false);
    });
  });

  describe("validateWorkRequestSubmission", () => {
    it("accepts a valid submission and normalizes contact, form data, and files", () => {
      const result = expectOk(
        validateWorkRequestSubmission(sampleFormSchema, {
          customerPhone: " +91 98765 43210 ",
          customerEmail: " Customer@Example.COM ",
          customerNote: "  Please bind tightly.  ",
          formData: {
            full_name: "  Aarav Sharma ",
            page_count: "25",
            print_mode: "Color",
            terms_accepted: true,
          },
          files: [
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/source.pdf",
              originalFilename: "source.pdf",
              mimeType: "Application/PDF",
              sizeBytes: 4096,
            },
          ],
        })
      );

      expect(result.normalizedContact).toEqual({
        customerPhone: "+91 98765 43210",
        customerEmail: "customer@example.com",
        customerNote: "Please bind tightly.",
      });
      expect(result.normalizedFormData).toEqual({
        full_name: "Aarav Sharma",
        page_count: 25,
        print_mode: "Color",
        spiral_binding: false,
        terms_accepted: true,
      });
      expect(result.files[0]?.mimeType).toBe("application/pdf");
    });

    it("requires at least one valid contact method", () => {
      const missingBoth = expectErr(
        validateWorkRequestSubmission(sampleFormSchema, {
          customerPhone: "   ",
          customerEmail: null,
          formData: {
            full_name: "Aarav",
            page_count: 10,
            print_mode: "Black & White",
            terms_accepted: true,
          },
          files: [
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/a.pdf",
              originalFilename: "a.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
            },
          ],
        })
      );
      expect(missingBoth.fieldErrors.customerPhone).toBeDefined();
      expect(missingBoth.fieldErrors.customerEmail).toBeDefined();

      const invalidPhoneAndEmail = expectErr(
        validateWorkRequestSubmission(sampleFormSchema, {
          customerPhone: "123",
          customerEmail: "not-an-email",
          formData: {
            full_name: "Aarav",
            page_count: 10,
            print_mode: "Black & White",
            terms_accepted: true,
          },
          files: [
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/a.pdf",
              originalFilename: "a.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
            },
          ],
        })
      );
      expect(invalidPhoneAndEmail.fieldErrors.customerPhone).toBeDefined();
      expect(invalidPhoneAndEmail.fieldErrors.customerEmail).toBeDefined();
    });

    it("rejects missing required fields, out-of-bounds numbers, invalid select options, and unexpected keys", () => {
      const result = expectErr(
        validateWorkRequestSubmission(sampleFormSchema, {
          customerPhone: "9876543210",
          formData: {
            full_name: "   ",
            page_count: 999,
            print_mode: "Laser Gold",
            terms_accepted: false,
            extra_hack: "unexpected",
          },
          files: [],
        })
      );

      expect(result.fieldErrors.full_name).toBeDefined();
      expect(result.fieldErrors.page_count).toBeDefined();
      expect(result.fieldErrors.print_mode).toBeDefined();
      expect(result.fieldErrors.terms_accepted).toBeDefined();
      expect(result.fieldErrors.source_pdfs).toBeDefined();
      expect(result.fieldErrors.extra_hack).toBeDefined();
    });

    it("rejects bad MIME type, oversized files, maxFiles exceeded, and duplicate storageKey", () => {
      const result = expectErr(
        validateWorkRequestSubmission(sampleFormSchema, {
          customerEmail: "user@example.com",
          formData: {
            full_name: "Riya",
            page_count: 5,
            print_mode: "Black & White",
            terms_accepted: true,
          },
          files: [
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/dup.pdf",
              originalFilename: "bad.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 1000,
            },
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/big.pdf",
              originalFilename: "big.pdf",
              mimeType: "application/pdf",
              sizeBytes: 20 * 1024 * 1024,
            },
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/dup.pdf",
              originalFilename: "dup.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1000,
            },
            {
              fieldKey: "source_pdfs",
              storageKey: "requests/req-1/third.pdf",
              originalFilename: "third.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1000,
            },
          ],
        })
      );

      expect(result.fieldErrors.source_pdfs?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("validateWorkRequestInitiation", () => {
    it("accepts valid initiation payload and normalizes contact, form data, and pending files", () => {
      const result = expectOk(
        validateWorkRequestInitiation(sampleFormSchema, {
          customerPhone: " +91 98765 43210 ",
          customerEmail: " User@Example.COM ",
          customerNote: "  Urgent print  ",
          formData: {
            full_name: "  Riya Das ",
            page_count: "12",
            print_mode: "Color",
            terms_accepted: true,
          },
          files: [
            {
              clientFileId: "cf-1",
              fieldKey: "source_pdfs",
              originalFilename: "notes.pdf",
              mimeType: "Application/PDF",
              sizeBytes: 4096,
            },
          ],
        })
      );

      expect(result.normalizedContact).toEqual({
        customerPhone: "+91 98765 43210",
        customerEmail: "user@example.com",
        customerNote: "Urgent print",
      });
      expect(result.normalizedFormData).toEqual({
        full_name: "Riya Das",
        page_count: 12,
        print_mode: "Color",
        spiral_binding: false,
        terms_accepted: true,
      });
      expect(result.files).toEqual([
        {
          clientFileId: "cf-1",
          fieldKey: "source_pdfs",
          originalFilename: "notes.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
        },
      ]);
    });

    it("rejects missing contact, unknown keys, file keys in formData, duplicate clientFileId, and invalid files", () => {
      const result = expectErr(
        validateWorkRequestInitiation(sampleFormSchema, {
          customerPhone: "",
          customerEmail: "bad-email",
          formData: {
            full_name: " ",
            page_count: 0,
            print_mode: "Invalid",
            terms_accepted: false,
            unknown_key: "x",
            source_pdfs: null,
          },
          files: [
            {
              clientFileId: "dup-1",
              fieldKey: "source_pdfs",
              originalFilename: "bad.png",
              mimeType: "image/png",
              sizeBytes: 1000,
            },
            {
              clientFileId: "dup-1",
              fieldKey: "source_pdfs",
              originalFilename: "ok.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1000,
            },
            {
              clientFileId: "cf-nonfile",
              fieldKey: "full_name",
              originalFilename: "doc.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1000,
            },
          ],
        })
      );

      expect(result.fieldErrors.customerEmail).toBeDefined();
      expect(result.fieldErrors.full_name?.length).toBeGreaterThanOrEqual(2);
      expect(result.fieldErrors.page_count).toBeDefined();
      expect(result.fieldErrors.print_mode).toBeDefined();
      expect(result.fieldErrors.terms_accepted).toBeDefined();
      expect(result.fieldErrors.unknown_key).toBeDefined();
      expect(result.fieldErrors.source_pdfs?.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects missing required file and exceeding maxFiles", () => {
      const missingFile = expectErr(
        validateWorkRequestInitiation(sampleFormSchema, {
          customerPhone: "9876543210",
          formData: {
            full_name: "Riya",
            page_count: 5,
            print_mode: "Black & White",
            terms_accepted: true,
          },
          files: [],
        })
      );
      expect(missingFile.fieldErrors.source_pdfs).toBeDefined();

      const tooMany = expectErr(
        validateWorkRequestInitiation(sampleFormSchema, {
          customerPhone: "9876543210",
          formData: {
            full_name: "Riya",
            page_count: 5,
            print_mode: "Black & White",
            terms_accepted: true,
          },
          files: [
            {
              clientFileId: "f1",
              fieldKey: "source_pdfs",
              originalFilename: "1.pdf",
              mimeType: "application/pdf",
              sizeBytes: 100,
            },
            {
              clientFileId: "f2",
              fieldKey: "source_pdfs",
              originalFilename: "2.pdf",
              mimeType: "application/pdf",
              sizeBytes: 100,
            },
            {
              clientFileId: "f3",
              fieldKey: "source_pdfs",
              originalFilename: "3.pdf",
              mimeType: "application/pdf",
              sizeBytes: 100,
            },
          ],
        })
      );
      expect(tooMany.fieldErrors.source_pdfs).toBeDefined();
    });
  });
});

describe("retention", () => {
  it("computes files_expire_at per work request status", () => {
    const nowMs = Date.UTC(2026, 10, 27, 12, 0, 0);

    expect(computeFilesExpireAt("INITIATED", nowMs)).toBe(
      new Date(nowMs + SHORT_RETENTION_MS).toISOString()
    );
    expect(computeFilesExpireAt("DRAFT_AWAITING_ADVANCE", nowMs)).toBe(
      new Date(nowMs + SHORT_RETENTION_MS).toISOString()
    );
    expect(computeFilesExpireAt("CANCELED", nowMs)).toBe(
      new Date(nowMs + SHORT_RETENTION_MS).toISOString()
    );
    expect(computeFilesExpireAt("COMPLETED", nowMs)).toBe(
      new Date(nowMs + COMPLETED_RETENTION_MS).toISOString()
    );
    expect(computeFilesExpireAt("PENDING", nowMs)).toBeNull();
    expect(computeFilesExpireAt("IN_PROGRESS", nowMs)).toBeNull();
  });
});

describe("pricing", () => {
  it("requires 0 advance when total is strictly below ₹500 (50000 paise)", () => {
    const pricing = calculateRequestPricing({
      basePricePaise: 5000, // ₹50
      formSchema: sampleFormSchema,
      pricingRules: samplePricingRules,
      formData: {
        page_count: 10, // ₹30
        print_mode: "Black & White", // ₹0
        spiral_binding: false, // ₹0
      },
    });

    expect(pricing.totalAmountPaise).toBe(8000);
    expect(pricing.requiresAdvance).toBe(false);
    expect(pricing.advanceRequiredPaise).toBe(0);
    expect(pricing.remainingBalancePaise).toBe(8000);
    expect(pricing.lineItems.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(
      pricing.totalAmountPaise
    );
  });

  it("requires exactly 50% advance when total equals ₹500 (50000 paise)", () => {
    const pricing = calculateRequestPricing({
      basePricePaise: 11000, // ₹110
      formSchema: sampleFormSchema,
      pricingRules: samplePricingRules,
      formData: {
        page_count: 100, // 100 * ₹3 = ₹300
        print_mode: "Color", // +₹50
        spiral_binding: true, // +₹40
      },
    });

    expect(pricing.totalAmountPaise).toBe(50000);
    expect(pricing.requiresAdvance).toBe(true);
    expect(pricing.advanceRequiredPaise).toBe(25000);
    expect(pricing.remainingBalancePaise).toBe(25000);
    expect(pricing.lineItems).toHaveLength(4);
  });

  it("splits ₹501 (50100 paise) into 25050 advance + 25050 remaining and rounds up odd paise", () => {
    const pricing501 = calculateRequestPricing({
      basePricePaise: 20100, // ₹201
      formSchema: sampleFormSchema,
      pricingRules: samplePricingRules,
      formData: {
        page_count: 100, // ₹300
        print_mode: "Black & White",
        spiral_binding: false,
      },
    });

    expect(pricing501.totalAmountPaise).toBe(50100);
    expect(pricing501.requiresAdvance).toBe(true);
    expect(pricing501.advanceRequiredPaise).toBe(25050);
    expect(pricing501.remainingBalancePaise).toBe(25050);

    const oddPaise = calculateRequestPricing({
      basePricePaise: 50001,
      formSchema: sampleFormSchema,
      pricingRules: [],
      formData: {},
    });

    expect(oddPaise.requiresAdvance).toBe(true);
    expect(oddPaise.advanceRequiredPaise).toBe(25001);
    expect(oddPaise.remainingBalancePaise).toBe(25000);
    expect(oddPaise.advanceRequiredPaise + oddPaise.remainingBalancePaise).toBe(
      50001
    );
  });
});

describe("tokens", () => {
  it("generates OC-XXXXXX tokens using unambiguous characters", () => {
    const generated = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const token = generateWorkToken();
      expect(token).toMatch(WORK_TOKEN_REGEX);
      expect(token.slice(3)).not.toMatch(/[0O1I]/);
      expect(isValidWorkToken(token)).toBe(true);
      generated.add(token);
    }
    expect(generated.size).toBe(100);
  });

  it("normalizes user-entered tokens by trimming and uppercasing", () => {
    expect(normalizeWorkToken("  oc-7k9p3m \n")).toBe("OC-7K9P3M");
    expect(isValidWorkToken(normalizeWorkToken(" oc-7k9p3m "))).toBe(true);
    expect(isValidWorkToken("OC-0O1I23")).toBe(false);
  });
});
