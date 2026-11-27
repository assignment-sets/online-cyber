"use client";

import { useState } from "react";
import { AlertCircleIcon, CreditCardIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatPaiseToInr } from "@/lib/domain/service-schema";

export interface CheckoutSuccessPayload {
  status: "SUCCESS";
  paymentRef: string;
  token: string | null;
  requestStatus: string;
  totalAmountPaise: number;
  amountPaidPaise: number;
  balanceDuePaise: number;
}

interface MockCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  paymentType: "advance" | "balance";
  amountPaise: number;
  serviceName: string;
  onSuccess: (result: CheckoutSuccessPayload) => void;
}

/**
 * Simulated one-time payment checkout modal for 50% advance (>= ₹500 jobs)
 * and remaining balance collection after completion.
 */
export function MockCheckoutDialog({
  open,
  onOpenChange,
  requestId,
  paymentType,
  amountPaise,
  serviceName,
  onSuccess,
}: MockCheckoutDialogProps) {
  const [submittingOutcome, setSubmittingOutcome] = useState<
    "SUCCESS" | "FAILED" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isProcessing = submittingOutcome !== null;

  async function handleCheckout(simulatedOutcome: "SUCCESS" | "FAILED") {
    setErrorMessage(null);
    setSubmittingOutcome(simulatedOutcome);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          paymentType,
          simulatedOutcome,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as Partial<
        CheckoutSuccessPayload & { error?: string }
      >;

      if (!response.ok || data.status !== "SUCCESS") {
        const message =
          data.error ?? "Payment could not be completed. Please try again.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      toast.success(
        paymentType === "advance"
          ? "Advance payment received! Generating your Work Token."
          : "Balance payment completed!"
      );
      onSuccess(data as CheckoutSuccessPayload);
    } catch {
      const message = "Network error while processing payment. Please retry.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmittingOutcome(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isProcessing) {
          if (!nextOpen) {
            setErrorMessage(null);
          }
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCardIcon className="size-4 text-primary" aria-hidden="true" />
            <span>
              {paymentType === "advance"
                ? "50% Advance Payment Required"
                : "Pay Remaining Balance"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {paymentType === "advance"
              ? "Complete the 50% advance payment to finalize your request and issue your Work Token."
              : "Complete your remaining balance to unlock your completed order."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">Service</span>
            <span className="min-w-0 truncate text-right font-medium text-foreground">
              {serviceName}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Payment Type</span>
            <span className="font-medium text-foreground">
              {paymentType === "advance" ? "50% Advance" : "Final Balance"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-primary/15 pt-2.5">
            <span className="text-sm font-medium text-foreground">
              Amount Due Now
            </span>
            <span className="font-heading text-xl font-bold text-primary tabular-nums">
              {formatPaiseToInr(amountPaise)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md bg-info/10 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheckIcon
            className="size-4 shrink-0 text-info"
            aria-hidden="true"
          />
          <span>
            Simulated checkout: choose an outcome below to test success or
            decline.
          </span>
        </div>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Payment Failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={isProcessing}
            onClick={() => handleCheckout("FAILED")}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {submittingOutcome === "FAILED" ? (
              <>
                <Spinner data-icon="inline-start" />
                Simulating Failure…
              </>
            ) : (
              "Simulate Payment Failure"
            )}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={isProcessing}
            onClick={() => handleCheckout("SUCCESS")}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {submittingOutcome === "SUCCESS" ? (
              <>
                <Spinner data-icon="inline-start" />
                Processing…
              </>
            ) : (
              `Pay ${formatPaiseToInr(amountPaise)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
