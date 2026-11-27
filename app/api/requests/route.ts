import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveServiceBySlug, getPublicShopSettings } from "@/lib/data/public";
import type { Json } from "@/lib/db/database.types";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { calculateRequestPricing } from "@/lib/domain/pricing";
import { computeFilesExpireAt } from "@/lib/domain/retention";
import type {
  ExpectedUploadItem,
  PendingFileDescriptor,
} from "@/lib/domain/service-schema";
import { generateWorkToken } from "@/lib/domain/tokens";
import {
  validateWorkRequestInitiation,
  type FieldErrors,
} from "@/lib/domain/validation";
import { logger } from "@/lib/logger";
import {
  buildObjectStorageKey,
  buildRequestStoragePrefix,
  createPresignedUploadUrl,
} from "@/lib/storage/r2";

const MAX_TOKEN_INSERT_ATTEMPTS = 5;

const CreateRequestEnvelopeSchema = z.object({
  serviceSlug: z.string().trim().min(1, "serviceSlug is required."),
  customerPhone: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  customerNote: z.string().nullable().optional(),
  formData: z.unknown().optional(),
  files: z.unknown().optional(),
});

function toFieldErrors(issues: z.ZodIssue[]): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "request";
    if (!fieldErrors[key]) {
      fieldErrors[key] = [issue.message];
    } else {
      fieldErrors[key].push(issue.message);
    }
  }
  return fieldErrors;
}

function isTokenUniqueCollision(error: {
  code?: string;
  message?: string;
  details?: string | null;
}): boolean {
  if (error.code !== "23505") {
    return false;
  }
  const combined = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (combined.includes("pkey") || combined.includes("storage_prefix")) {
    return false;
  }
  return combined.includes("token");
}

/**
 * POST /api/requests — Validates and initiates a new customer work request (Upload-on-Submit),
 * computes backend-authoritative pricing, and either:
 * - Returns INITIATED with batch presigned uploadTargets when files must be uploaded, OR
 * - Creates PENDING (with Work Token) or DRAFT_AWAITING_ADVANCE immediately when no files are required.
 */
export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const envelope = CreateRequestEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: toFieldErrors(envelope.error.issues),
      },
      { status: 400 }
    );
  }

  const body = envelope.data;
  const requestId = crypto.randomUUID();

  try {
    const [service, shop] = await Promise.all([
      getActiveServiceBySlug(body.serviceSlug),
      getPublicShopSettings(),
    ]);

    if (!service) {
      return NextResponse.json(
        { error: "Service not found." },
        { status: 404 }
      );
    }

    const validation = validateWorkRequestInitiation(service.formSchema, {
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      customerNote: body.customerNote,
      formData: (body.formData === undefined
        ? {}
        : body.formData) as Record<string, unknown>,
      files: (body.files === undefined
        ? []
        : body.files) as PendingFileDescriptor[],
    });

    if (!validation.ok) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const pricing = calculateRequestPricing({
      basePricePaise: service.basePricePaise,
      formSchema: service.formSchema,
      pricingRules: service.pricingRules,
      formData: validation.normalizedFormData,
    });

    const submittedWhileClosed = !shop.isOpen;
    const storagePrefix = buildRequestStoragePrefix(requestId);
    const advanceRequiredPaise = pricing.requiresAdvance
      ? pricing.advanceRequiredPaise
      : 0;

    const supabase = getSupabaseAdmin();

    // Fast path: no files to upload -> immediately PENDING (< ₹500) or DRAFT_AWAITING_ADVANCE (>= ₹500)
    if (validation.files.length === 0) {
      const serviceSnapshot = {
        id: service.id,
        slug: service.slug,
        name: service.name,
        isCollectibleOnline: service.isCollectibleOnline,
        basePricePaise: service.basePricePaise,
        pricingBreakdown: pricing,
      };

      const baseInsert = {
        id: requestId,
        service_id: service.id,
        service_snapshot: serviceSnapshot as unknown as Json,
        customer_phone: validation.normalizedContact.customerPhone,
        customer_email: validation.normalizedContact.customerEmail,
        customer_note: validation.normalizedContact.customerNote,
        form_data: validation.normalizedFormData as unknown as Json,
        total_amount_paise: pricing.totalAmountPaise,
        advance_required_paise: advanceRequiredPaise,
        amount_paid_paise: 0,
        storage_prefix: storagePrefix,
        submitted_while_closed: submittedWhileClosed,
      };

      if (!pricing.requiresAdvance) {
        let issuedToken: string | null = null;

        for (let attempt = 0; attempt < MAX_TOKEN_INSERT_ATTEMPTS; attempt += 1) {
          const candidateToken = generateWorkToken();
          const { error: insertError } = await supabase
            .from("work_requests")
            .insert({
              ...baseInsert,
              token: candidateToken,
              status: "PENDING",
              files_expire_at: computeFilesExpireAt("PENDING"),
            });

          if (!insertError) {
            issuedToken = candidateToken;
            break;
          }

          if (!isTokenUniqueCollision(insertError)) {
            throw new Error(
              `Failed to insert work request: ${insertError.message}`
            );
          }
        }

        if (!issuedToken) {
          throw new Error(
            "Failed to generate a unique work token after maximum retries."
          );
        }

        return NextResponse.json(
          {
            status: "PENDING",
            requiresAdvance: false,
            requestId,
            token: issuedToken,
            uploadTargets: [],
            totalAmountPaise: pricing.totalAmountPaise,
            advanceRequiredPaise: 0,
            amountPaidPaise: 0,
            pricing,
            submittedWhileClosed,
          },
          { status: 201 }
        );
      }

      const { error: insertError } = await supabase
        .from("work_requests")
        .insert({
          ...baseInsert,
          token: null,
          status: "DRAFT_AWAITING_ADVANCE",
          files_expire_at: computeFilesExpireAt("DRAFT_AWAITING_ADVANCE"),
        });

      if (insertError) {
        throw new Error(`Failed to insert work request: ${insertError.message}`);
      }

      return NextResponse.json(
        {
          status: "DRAFT_AWAITING_ADVANCE",
          requiresAdvance: true,
          requestId,
          token: null,
          uploadTargets: [],
          totalAmountPaise: pricing.totalAmountPaise,
          advanceRequiredPaise,
          amountPaidPaise: 0,
          pricing,
          submittedWhileClosed,
        },
        { status: 201 }
      );
    }

    // Upload-on-Submit path: generate scoped storageKeys and presigned PUT URLs
    const uploadTargets = await Promise.all(
      validation.files.map(async (file) => {
        const storageKey = buildObjectStorageKey({
          requestId,
          direction: "input",
          fieldKey: file.fieldKey,
          filename: file.originalFilename,
          fileId: crypto.randomUUID(),
        });
        const uploadUrl = await createPresignedUploadUrl({
          storageKey,
          contentType: file.mimeType,
          contentLength: file.sizeBytes,
        });

        return {
          clientFileId: file.clientFileId,
          fieldKey: file.fieldKey,
          storageKey,
          originalFilename: file.originalFilename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadUrl,
        };
      })
    );

    const expectedUploads: ExpectedUploadItem[] = uploadTargets.map(
      ({ uploadUrl: _uploadUrl, ...item }) => item
    );

    const serviceSnapshot = {
      id: service.id,
      slug: service.slug,
      name: service.name,
      isCollectibleOnline: service.isCollectibleOnline,
      basePricePaise: service.basePricePaise,
      pricingBreakdown: pricing,
      expectedUploads,
    };

    const { error: initiateError } = await supabase
      .from("work_requests")
      .insert({
        id: requestId,
        service_id: service.id,
        service_snapshot: serviceSnapshot as unknown as Json,
        token: null,
        status: "INITIATED",
        customer_phone: validation.normalizedContact.customerPhone,
        customer_email: validation.normalizedContact.customerEmail,
        customer_note: validation.normalizedContact.customerNote,
        form_data: validation.normalizedFormData as unknown as Json,
        total_amount_paise: pricing.totalAmountPaise,
        advance_required_paise: advanceRequiredPaise,
        amount_paid_paise: 0,
        files_expire_at: computeFilesExpireAt("INITIATED"),
        storage_prefix: storagePrefix,
        submitted_while_closed: submittedWhileClosed,
      });

    if (initiateError) {
      throw new Error(
        `Failed to initiate work request: ${initiateError.message}`
      );
    }

    return NextResponse.json(
      {
        status: "INITIATED",
        requiresAdvance: pricing.requiresAdvance,
        requestId,
        token: null,
        uploadTargets,
        totalAmountPaise: pricing.totalAmountPaise,
        advanceRequiredPaise,
        amountPaidPaise: 0,
        pricing,
        submittedWhileClosed,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to create work request", {
      requestId,
      serviceSlug: body.serviceSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to submit work request." },
      { status: 500 }
    );
  }
}
