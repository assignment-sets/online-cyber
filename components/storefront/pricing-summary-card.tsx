"use client";

import {
  ArrowRightIcon,
  CreditCardIcon,
  IndianRupeeIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { PricingBreakdown } from "@/lib/domain/pricing";
import { formatPaiseToInr } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";

interface PricingSummaryCardProps {
  pricing: PricingBreakdown;
  isSubmitting: boolean;
  hasUploadProgress: boolean;
  hasPendingInitiation: boolean;
  hasPendingAdvance: boolean;
  className?: string;
}

/**
 * Shared itemized breakdown + >= ₹500 50% advance callout, used in both the
 * summary card and the mobile price breakdown bottom sheet.
 */
export function PricingBreakdownContent({
  pricing,
}: {
  pricing: PricingBreakdown;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 text-sm">
        {pricing.lineItems.map((item) => (
          <li
            key={item.ruleId}
            className="flex items-start justify-between gap-3"
          >
            <span className="text-muted-foreground">
              {item.label}
              {item.type === "per_unit" && item.quantity > 0
                ? ` (${item.quantity} × ${formatPaiseToInr(item.unitAmountPaise)})`
                : ""}
            </span>
            <span className="shrink-0 font-medium text-foreground tabular-nums">
              {formatPaiseToInr(item.amountPaise)}
            </span>
          </li>
        ))}
      </ul>

      <Separator />

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-heading text-base font-semibold text-foreground">
          Estimated Total
        </span>
        <span className="font-heading text-2xl font-bold text-primary tabular-nums">
          {formatPaiseToInr(pricing.totalAmountPaise)}
        </span>
      </div>

      {pricing.requiresAdvance ? (
        <Alert variant="warning">
          <CreditCardIcon aria-hidden="true" />
          <AlertTitle>Large Job ≥ ₹500: 50% Advance Payment Required</AlertTitle>
          <AlertDescription>
            Pay{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatPaiseToInr(pricing.advanceRequiredPaise)}
            </span>{" "}
            now to issue your token. Remaining{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatPaiseToInr(pricing.remainingBalancePaise)}
            </span>{" "}
            is due after completion.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Sticky right-hand live pricing breakdown, advance-payment threshold notice,
 * and request submission CTA.
 */
export function PricingSummaryCard({
  pricing,
  isSubmitting,
  hasUploadProgress,
  hasPendingInitiation,
  hasPendingAdvance,
  className,
}: PricingSummaryCardProps) {
  return (
    <aside
      aria-label="Estimated price summary"
      className={cn(
        "flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-5",
        className
      )}
    >
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <IndianRupeeIcon className="size-4" aria-hidden="true" />
            </span>
            <span>Estimated Price Summary</span>
          </CardTitle>
          <CardDescription>
            Final amount is verified when submitted.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <PricingBreakdownContent pricing={pricing} />
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="h-12 w-full lg:h-11"
          >
            {isSubmitting ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                {hasUploadProgress
                  ? "Uploading Files…"
                  : "Submitting Request…"}
              </>
            ) : hasPendingInitiation ? (
              <>
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                Retry Failed Uploads
              </>
            ) : hasPendingAdvance ? (
              <>
                <CreditCardIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                Complete 50% Advance Payment
              </>
            ) : pricing.requiresAdvance ? (
              <>
                <CreditCardIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                {`Continue & Pay 50% (${formatPaiseToInr(pricing.advanceRequiredPaise)})`}
              </>
            ) : (
              <>
                <span>Submit &amp; Get Work Token</span>
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </aside>
  );
}
