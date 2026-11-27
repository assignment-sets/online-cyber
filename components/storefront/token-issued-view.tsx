"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CopyIcon,
  RotateCcwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentSummaryStrip } from "@/components/shared/payment-summary-strip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface IssuedTokenSummary {
  token: string;
  totalAmountPaise: number;
  amountPaidPaise: number;
  balanceDuePaise: number;
  submittedWhileClosed: boolean;
}

interface TokenIssuedViewProps {
  summary: IssuedTokenSummary;
  serviceName: string;
  onStartAnother: () => void;
}

/**
 * Post-submission confirmation card displaying the issued Work Token,
 * clipboard copy status, and payment summary.
 */
export function TokenIssuedView({
  summary,
  serviceName,
  onStartAnother,
}: TokenIssuedViewProps) {
  const [copyStatus, setCopyStatus] = useState<
    "copied" | "failed" | "pending"
  >("pending");

  useEffect(() => {
    let active = true;
    async function autoCopy() {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(summary.token);
          if (active) {
            setCopyStatus("copied");
          }
        } else if (active) {
          setCopyStatus("failed");
        }
      } catch {
        if (active) {
          setCopyStatus("failed");
        }
      }
    }
    void autoCopy();
    return () => {
      active = false;
    };
  }, [summary.token]);

  async function handleManualCopy() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(summary.token);
        setCopyStatus("copied");
        toast.success("Work Token copied to clipboard!");
      } else {
        setCopyStatus("failed");
        toast.error("Clipboard unavailable. Please copy the token manually.");
      }
    } catch {
      setCopyStatus("failed");
      toast.error("Clipboard permission denied. Please copy manually.");
    }
  }

  return (
    <Card className="border-success/35">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">
            <CheckCircle2Icon data-icon="inline-start" aria-hidden="true" />
            Request Submitted
          </Badge>
          {summary.submittedWhileClosed ? (
            <Badge variant="warning">After-Hours Queue</Badge>
          ) : null}
        </div>
        <CardTitle className="text-xl text-balance">
          Your Work Token is Ready
        </CardTitle>
        <CardDescription>
          Save this token to track progress, pay remaining balance, and collect{" "}
          {serviceName}.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Work Token
          </span>
          <div
            translate="no"
            className="rounded-lg border bg-background px-5 py-3 font-mono text-3xl font-bold tracking-widest text-foreground select-all sm:text-4xl"
          >
            {summary.token}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualCopy}
            className="h-10 px-4"
          >
            {copyStatus === "copied" ? (
              <>
                <ClipboardCheckIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                Copied to Clipboard
              </>
            ) : (
              <>
                <CopyIcon data-icon="inline-start" aria-hidden="true" />
                Copy Token
              </>
            )}
          </Button>
          <span className="sr-only" aria-live="polite">
            {copyStatus === "copied"
              ? `Work Token ${summary.token} copied to clipboard.`
              : copyStatus === "failed"
                ? "Automatic copy blocked. Use the Copy Token button."
                : ""}
          </span>
        </div>

        {copyStatus === "copied" ? (
          <Alert variant="success">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Work Token copied to your clipboard!</AlertTitle>
            <AlertDescription>
              Paste it anytime on Track Token or open the tracking link below.
            </AlertDescription>
          </Alert>
        ) : copyStatus === "failed" ? (
          <Alert variant="warning">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Save your Work Token</AlertTitle>
            <AlertDescription>
              Automatic copy was blocked. Use Copy Token above or write down{" "}
              <span translate="no" className="font-mono font-semibold">
                {summary.token}
              </span>
              .
            </AlertDescription>
          </Alert>
        ) : null}

        <PaymentSummaryStrip
          totalAmountPaise={summary.totalAmountPaise}
          amountPaidPaise={summary.amountPaidPaise}
          balanceDuePaise={summary.balanceDuePaise}
        />
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onStartAnother}
          className="h-11 w-full sm:h-10 sm:w-auto"
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          Submit Another Request
        </Button>
        <Link
          href={`/track/${encodeURIComponent(summary.token)}`}
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-11 w-full sm:h-10 sm:w-auto"
          )}
        >
          <span>Track Request Status</span>
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}
