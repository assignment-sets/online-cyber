"use client";

import Link from "next/link";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  CreditCardIcon,
  DownloadIcon,
  FileTextIcon,
  MapPinIcon,
  PackageIcon,
  XCircleIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPaiseToInr } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";
import { formatBytes } from "./format";
import type { DeliverableItem, WorkRequestStatus } from "./token-tracker";

interface TokenStatusPanelProps {
  token: string;
  status: WorkRequestStatus;
  isCollectibleOnline: boolean;
  submittedWhileClosed: boolean;
  balanceDuePaise: number;
  cancellationReason: string | null;
  filesPurgedAt: string | null;
  deliverables: DeliverableItem[];
  shopAddress?: string;
  shopPhone?: string;
  onOpenCheckout: () => void;
}

function LifecycleProgressBar({ status }: { status: WorkRequestStatus }) {
  if (status === "CANCELED") {
    return null;
  }

  const activeStep =
    status === "COMPLETED" ? 2 : status === "IN_PROGRESS" ? 1 : 0;

  const steps = [
    { label: "Queued" },
    { label: "In Progress" },
    { label: "Ready" },
  ];

  return (
    <ol
      aria-label="Request progress"
      className="grid grid-cols-3 py-1"
    >
      {steps.map((step, index) => {
        const isDone = index < activeStep || (activeStep === 2 && index === 2);
        const isCurrent = index === activeStep && activeStep < 2;
        const leftTrackDone = index > 0 && activeStep >= index;
        const rightTrackDone = index < steps.length - 1 && activeStep > index;

        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-col items-center gap-1.5"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3 right-1/2 left-0 h-0.5 -translate-y-1/2 transition-colors",
                  leftTrackDone ? "bg-success" : "bg-border"
                )}
              />
            ) : null}

            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3 right-0 left-1/2 h-0.5 -translate-y-1/2 transition-colors",
                  rightTrackDone ? "bg-success" : "bg-border"
                )}
              />
            ) : null}

            {isDone ? (
              <span
                aria-hidden="true"
                className="relative z-10 flex size-6 items-center justify-center rounded-full bg-success text-success-foreground"
              >
                <CheckIcon className="size-3.5 stroke-[2.5]" aria-hidden="true" />
              </span>
            ) : isCurrent ? (
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full bg-background ring-2",
                  status === "IN_PROGRESS"
                    ? "ring-info"
                    : "ring-warning"
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    status === "IN_PROGRESS" ? "bg-info" : "bg-warning"
                  )}
                />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="relative z-10 flex size-6 items-center justify-center rounded-full border-2 border-border bg-background"
              />
            )}

            <span
              className={cn(
                "text-center text-xs font-medium",
                isDone
                  ? "text-success"
                  : isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Connected milestone stepper, calm status notes, intent-colored actionable alerts,
 * deliverables list, and pickup instructions.
 */
export function TokenStatusPanel({
  token,
  status,
  isCollectibleOnline,
  submittedWhileClosed,
  balanceDuePaise,
  cancellationReason,
  filesPurgedAt,
  deliverables,
  shopAddress,
  shopPhone,
  onOpenCheckout,
}: TokenStatusPanelProps) {
  const isCompletedOnlinePaid =
    status === "COMPLETED" && balanceDuePaise === 0 && isCollectibleOnline;

  const purgedRetentionCopy =
    status === "CANCELED"
      ? "Files uploaded for canceled requests are automatically purged after 24 hours. Your token and cancellation record remain available."
      : "Deliverables and uploaded files are automatically purged 14 days after completion. Your token and payment records remain available.";

  return (
    <div className="flex flex-col gap-4">
      <LifecycleProgressBar status={status} />

      {status === "CANCELED" ? (
        <Alert variant="destructive">
          <XCircleIcon aria-hidden="true" />
          <AlertTitle>Request Canceled</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              <span className="font-semibold">Reason: </span>
              {cancellationReason?.trim() ||
                "No cancellation reason was provided."}
            </p>
            <p>
              Contact the shop{shopPhone ? ` at ${shopPhone}` : ""} or submit a
              new request with updated files.
            </p>
            <div>
              <Link
                href="/"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-11 w-full sm:h-9 sm:w-auto"
                )}
              >
                Submit a New Request
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "PENDING" ? (
        <output className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm">
          <ClockIcon
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              Queued for Processing
            </span>
            <span className="text-muted-foreground">
              {submittedWhileClosed
                ? "Submitted while closed. Staff will pick this up once the shop reopens."
                : "Your request is in the queue and will be started shortly."}
            </span>
          </span>
        </output>
      ) : null}

      {status === "IN_PROGRESS" ? (
        <output className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm">
          <ClockIcon
            className="mt-0.5 size-4 shrink-0 text-info"
            aria-hidden="true"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              Work in Progress
            </span>
            <span className="text-muted-foreground">
              Staff is actively working on your request. Check back soon.
            </span>
          </span>
        </output>
      ) : null}

      {status === "COMPLETED" && balanceDuePaise > 0 ? (
        <Alert variant="success">
          <CheckCircle2Icon aria-hidden="true" />
          <AlertTitle>Work Completed — Balance Payment Required</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Your order is ready. Pay the remaining{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatPaiseToInr(balanceDuePaise)}
              </span>{" "}
              to unlock{" "}
              {isCollectibleOnline
                ? "your downloadable files"
                : "physical pickup instructions"}
              .
            </p>
            <div>
              <Button
                type="button"
                variant="success"
                size="lg"
                onClick={onOpenCheckout}
                className="h-11 w-full sm:w-auto"
              >
                <CreditCardIcon data-icon="inline-start" aria-hidden="true" />
                {`Pay Remaining Balance (${formatPaiseToInr(balanceDuePaise)})`}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "COMPLETED" &&
      balanceDuePaise === 0 &&
      isCollectibleOnline ? (
        <div className="flex flex-col gap-4">
          <Alert variant="success">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Completed &amp; Paid in Full</AlertTitle>
            <AlertDescription>
              Your files are unlocked below and retained for 14 days.
            </AlertDescription>
          </Alert>

          {filesPurgedAt !== null ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Deliverable Files Purged</AlertTitle>
              <AlertDescription>{purgedRetentionCopy}</AlertDescription>
            </Alert>
          ) : deliverables.length === 0 ? (
            <Alert variant="warning">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>No Deliverable Files Attached</AlertTitle>
              <AlertDescription>
                No downloadable output files were found. Contact the shop for
                assistance.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-sm font-semibold text-foreground tabular-nums">
                Downloadable Files ({deliverables.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {deliverables.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                        <FileTextIcon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {file.filename}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                    </div>

                    <a
                      href={file.downloadUrl}
                      download={file.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "success", size: "sm" }),
                        "h-11 w-full sm:h-9 sm:w-auto"
                      )}
                    >
                      <DownloadIcon
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {status === "COMPLETED" &&
      balanceDuePaise === 0 &&
      !isCollectibleOnline ? (
        <Alert variant="success">
          <PackageIcon aria-hidden="true" />
          <AlertTitle>Ready for Physical Pickup</AlertTitle>
          <AlertDescription className="flex flex-col gap-1.5">
            <p>
              Completed and paid in full. Show your Work Token{" "}
              <span
                translate="no"
                className="font-mono font-semibold text-foreground"
              >
                {token}
              </span>{" "}
              at the counter to collect your items.
            </p>
            {shopAddress ? (
              <p className="flex items-start gap-1.5 text-foreground">
                <MapPinIcon
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>{shopAddress}</span>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {filesPurgedAt !== null && !isCompletedOnlinePaid ? (
        <Alert variant="warning">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Uploaded Files Purged</AlertTitle>
          <AlertDescription>{purgedRetentionCopy}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
