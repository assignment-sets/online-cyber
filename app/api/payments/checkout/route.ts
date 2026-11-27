import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@/lib/db/database.types";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { generateWorkToken } from "@/lib/domain/tokens";
import type { FieldErrors } from "@/lib/domain/validation";
import { logger } from "@/lib/logger";
import { getPaymentProvider } from "@/lib/payments";

const MAX_TOKEN_UPDATE_ATTEMPTS = 5;

const CheckoutBodySchema = z.object({
  requestId: z.string().uuid("requestId must be a valid UUID."),
  paymentType: z.enum(["advance", "balance", "full"]),
  simulatedOutcome: z.enum(["SUCCESS", "FAILED"]).optional(),
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
  return combined.includes("token");
}

/**
 * POST /api/payments/checkout — Executes a one-time advance, balance, or full checkout
 * through the configured PaymentProvider, records the payment, and updates request state.
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

  const parsed = CheckoutBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: toFieldErrors(parsed.error.issues),
      },
      { status: 400 }
    );
  }

  const { requestId, paymentType, simulatedOutcome } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const { data: workRequest, error: fetchError } = await supabase
      .from("work_requests")
      .select(
        "id, token, status, total_amount_paise, advance_required_paise, amount_paid_paise, files_purged_at"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to load work request: ${fetchError.message}`);
    }

    if (!workRequest) {
      return NextResponse.json(
        { error: "Work request not found." },
        { status: 404 }
      );
    }

    if (paymentType === "advance" && workRequest.files_purged_at !== null) {
      return NextResponse.json(
        {
          error:
            "Upload window expired for this draft. Please submit a fresh request.",
        },
        { status: 400 }
      );
    }

    let amountPaise = 0;
    if (paymentType === "advance") {
      if (
        workRequest.status === "DRAFT_AWAITING_ADVANCE" &&
        workRequest.amount_paid_paise < workRequest.advance_required_paise
      ) {
        amountPaise =
          workRequest.advance_required_paise - workRequest.amount_paid_paise;
      }
    } else if (
      workRequest.status === "COMPLETED" &&
      workRequest.amount_paid_paise < workRequest.total_amount_paise
    ) {
      amountPaise =
        workRequest.total_amount_paise - workRequest.amount_paid_paise;
    }

    if (amountPaise <= 0) {
      return NextResponse.json(
        { error: "No payment due for this request in its current state." },
        { status: 400 }
      );
    }

    const result = await getPaymentProvider().processOneTimeCheckout({
      requestId,
      paymentType,
      amountPaise,
      currency: "INR",
      simulatedOutcome,
    });

    const { error: paymentInsertError } = await supabase
      .from("payments")
      .insert({
        request_id: requestId,
        payment_type: paymentType,
        provider: result.provider,
        provider_ref: result.providerRef,
        amount_paise: result.amountPaise,
        status: result.status,
        completed_at: result.status === "SUCCESS" ? result.completedAt : null,
        metadata: (result.metadata ?? {}) as Json,
      });

    if (paymentInsertError) {
      throw new Error(
        `Failed to record payment transaction: ${paymentInsertError.message}`
      );
    }

    if (result.status === "FAILED") {
      return NextResponse.json(
        {
          status: "FAILED",
          error: result.failureReason ?? "Payment failed",
          paymentRef: result.providerRef,
        },
        { status: 402 }
      );
    }

    const updatedAmountPaidPaise = workRequest.amount_paid_paise + amountPaise;

    if (paymentType === "advance") {
      let issuedToken: string | null = null;

      for (let attempt = 0; attempt < MAX_TOKEN_UPDATE_ATTEMPTS; attempt += 1) {
        const candidateToken = generateWorkToken();
        const { error: updateError } = await supabase
          .from("work_requests")
          .update({
            token: candidateToken,
            status: "PENDING",
            amount_paid_paise: updatedAmountPaidPaise,
            files_expire_at: null,
          })
          .eq("id", requestId);

        if (!updateError) {
          issuedToken = candidateToken;
          break;
        }

        if (!isTokenUniqueCollision(updateError)) {
          throw new Error(
            `Failed to finalize advance payment: ${updateError.message}`
          );
        }
      }

      if (!issuedToken) {
        throw new Error(
          "Failed to generate a unique work token after advance payment."
        );
      }

      const balanceDuePaise = Math.max(
        0,
        workRequest.total_amount_paise - updatedAmountPaidPaise
      );

      return NextResponse.json(
        {
          status: "SUCCESS",
          paymentRef: result.providerRef,
          token: issuedToken,
          requestStatus: "PENDING",
          totalAmountPaise: workRequest.total_amount_paise,
          amountPaidPaise: updatedAmountPaidPaise,
          balanceDuePaise,
        },
        { status: 200 }
      );
    }

    const { error: balanceUpdateError } = await supabase
      .from("work_requests")
      .update({
        amount_paid_paise: updatedAmountPaidPaise,
      })
      .eq("id", requestId);

    if (balanceUpdateError) {
      throw new Error(
        `Failed to update request paid amount: ${balanceUpdateError.message}`
      );
    }

    return NextResponse.json(
      {
        status: "SUCCESS",
        paymentRef: result.providerRef,
        token: workRequest.token,
        requestStatus: workRequest.status,
        totalAmountPaise: workRequest.total_amount_paise,
        amountPaidPaise: updatedAmountPaidPaise,
        balanceDuePaise: 0,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Payment checkout failed", {
      requestId,
      paymentType,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to process payment checkout." },
      { status: 500 }
    );
  }
}
