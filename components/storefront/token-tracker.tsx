"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  RefreshCwIcon,
  SearchXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentSummaryStrip } from "@/components/shared/payment-summary-strip";
import {
  getFulfillmentMeta,
  RequestStatusBadge,
} from "@/components/shared/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "./format";
import { MockCheckoutDialog } from "./mock-checkout-dialog";
import { TokenStatusPanel } from "./token-status-panel";
import { TrackTokenForm } from "./track-token-form";

export type WorkRequestStatus =
  | "DRAFT_AWAITING_ADVANCE"
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

export interface DeliverableItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface TokenLookupResponse {
  token: string;
  requestId: string;
  serviceName: string;
  isCollectibleOnline: boolean;
  status: WorkRequestStatus;
  submittedWhileClosed: boolean;
  totalAmountPaise: number;
  advanceRequiredPaise: number;
  amountPaidPaise: number;
  balanceDuePaise: number;
  cancellationReason: string | null;
  filesPurgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
  deliverables: DeliverableItem[];
}

interface TokenTrackerProps {
  initialToken: string;
  shopAddress?: string;
  shopPhone?: string;
}

/**
 * Interactive Work Token status tracker supporting balance checkout,
 * online deliverable downloads, physical pickup instructions, and cancellation reasons.
 */
export function TokenTracker({
  initialToken,
  shopAddress,
  shopPhone,
}: TokenTrackerProps) {
  const normalizedToken = initialToken.trim().toUpperCase();
  const [data, setData] = useState<TokenLookupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(normalizedToken));
  const [errorState, setErrorState] = useState<{
    notFound: boolean;
    message: string;
  } | null>(() =>
    normalizedToken
      ? null
      : {
          notFound: true,
          message: "Work token not found.",
        }
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const loadTokenDetails = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!normalizedToken) {
        setErrorState({
          notFound: true,
          message: "Work token not found.",
        });
        setIsLoading(false);
        return;
      }

      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorState(null);

      try {
        const response = await fetch(
          `/api/tokens/${encodeURIComponent(normalizedToken)}`,
          { cache: "no-store" }
        );
        const body = (await response.json().catch(() => ({}))) as Partial<
          TokenLookupResponse & { error?: string }
        >;

        if (!response.ok) {
          setData(null);
          setErrorState({
            notFound: response.status === 404,
            message:
              body.error ??
              (response.status === 404
                ? "Work token not found."
                : "Failed to load work token details."),
          });
          return;
        }

        setData(body as TokenLookupResponse);
      } catch {
        setErrorState({
          notFound: false,
          message: "Network error while checking your Work Token. Please retry.",
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [normalizedToken]
  );

  useEffect(() => {
    if (!normalizedToken) {
      return;
    }

    let cancelled = false;

    async function fetchInitial() {
      try {
        const response = await fetch(
          `/api/tokens/${encodeURIComponent(normalizedToken)}`,
          { cache: "no-store" }
        );
        const body = (await response.json().catch(() => ({}))) as Partial<
          TokenLookupResponse & { error?: string }
        >;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setData(null);
          setErrorState({
            notFound: response.status === 404,
            message:
              body.error ??
              (response.status === 404
                ? "Work token not found."
                : "Failed to load work token details."),
          });
        } else {
          setErrorState(null);
          setData(body as TokenLookupResponse);
        }
      } catch {
        if (!cancelled) {
          setErrorState({
            notFound: false,
            message:
              "Network error while checking your Work Token. Please retry.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitial();

    return () => {
      cancelled = true;
    };
  }, [normalizedToken]);

  async function handleCopyToken(tokenText: string) {
    try {
      await navigator.clipboard.writeText(tokenText);
      setCopiedToken(true);
      toast.success("Work Token copied!");
      window.setTimeout(() => setCopiedToken(false), 2500);
    } catch {
      toast.error("Could not copy token automatically.");
    }
  }

  if (isLoading) {
    return (
      <output
        aria-live="polite"
        aria-label="Loading token details"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4"
      >
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </output>
    );
  }

  if (errorState || !data) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Card>
          <CardContent className="pt-4">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {errorState?.notFound
                    ? `Work Token "${normalizedToken || "—"}" Not Found`
                    : "Unable to Load Work Token"}
                </EmptyTitle>
                <EmptyDescription>
                  {errorState?.message ??
                    "Check your token code for typos or try again."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="w-full max-w-md">
                <TrackTokenForm
                  initialToken={normalizedToken}
                  submitLabel="Try Again"
                />
                {!errorState?.notFound ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadTokenDetails()}
                    className="h-11 w-full sm:h-10 sm:w-auto"
                  >
                    <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                    Retry Lookup
                  </Button>
                ) : null}
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fulfillment = getFulfillmentMeta(data.isCollectibleOnline);
  const FulfillmentIcon = fulfillment.icon;
  const submittedLabel = formatTimestamp(data.createdAt);
  const updatedLabel = formatTimestamp(data.updatedAt);
  const showUpdated = updatedLabel !== submittedLabel;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/track"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 h-10"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          Check Another Token
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 h-10"
          disabled={isRefreshing}
          onClick={() => void loadTokenDetails({ silent: true })}
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={cn(isRefreshing ? "animate-spin" : "")}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleCopyToken(data.token)}
              aria-label={`Copy token ${data.token}`}
              className="-ml-2 h-10 gap-2 px-2 font-mono text-sm font-semibold tracking-wider text-muted-foreground hover:text-foreground"
            >
              <span translate="no">{data.token}</span>
              {copiedToken ? (
                <CheckIcon className="text-success" aria-hidden="true" />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
            </Button>
            <span className="sr-only" aria-live="polite">
              {copiedToken
                ? `Work Token ${data.token} copied to clipboard.`
                : ""}
            </span>

            <RequestStatusBadge status={data.status} />
          </div>

          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl text-balance">
              <h1>{data.serviceName}</h1>
            </CardTitle>
            <CardDescription className="flex flex-col gap-1 tabular-nums sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
              <span className="inline-flex items-center gap-1.5">
                <FulfillmentIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{fulfillment.label}</span>
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span>Submitted {submittedLabel}</span>
              {showUpdated ? (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">
                    ·
                  </span>
                  <span>Updated {updatedLabel}</span>
                </>
              ) : null}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <TokenStatusPanel
            token={data.token}
            status={data.status}
            isCollectibleOnline={data.isCollectibleOnline}
            submittedWhileClosed={data.submittedWhileClosed}
            balanceDuePaise={data.balanceDuePaise}
            cancellationReason={data.cancellationReason}
            filesPurgedAt={data.filesPurgedAt}
            deliverables={data.deliverables}
            shopAddress={shopAddress}
            shopPhone={shopPhone}
            onOpenCheckout={() => setCheckoutOpen(true)}
          />

          <Separator />

          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-sm font-medium text-foreground">
              Payment Summary
            </h2>
            <PaymentSummaryStrip
              totalAmountPaise={data.totalAmountPaise}
              amountPaidPaise={data.amountPaidPaise}
              balanceDuePaise={data.balanceDuePaise}
            />
          </div>
        </CardContent>

        {data.terminalAt ? (
          <CardFooter className="text-xs text-muted-foreground tabular-nums">
            {data.status === "COMPLETED" ? "Completed" : "Closed"} on{" "}
            {formatTimestamp(data.terminalAt)}
          </CardFooter>
        ) : null}
      </Card>

      {data.status === "COMPLETED" && data.balanceDuePaise > 0 ? (
        <MockCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          requestId={data.requestId}
          paymentType="balance"
          amountPaise={data.balanceDuePaise}
          serviceName={data.serviceName}
          onSuccess={() => {
            setCheckoutOpen(false);
            void loadTokenDetails({ silent: true });
          }}
        />
      ) : null}
    </div>
  );
}
