import { DownloadIcon, StoreIcon } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Quiet live shop availability indicator: a colored dot plus plain text.
 * Intent color lives only in the dot so it never competes with real alerts.
 */
export function ShopStatusBadge({
  isOpen,
  openLabel = "Open",
  closedLabel = "Closed",
  className,
}: {
  isOpen: boolean;
  openLabel?: string;
  closedLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground",
        className
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        {isOpen ? (
          <span className="absolute inline-flex size-full rounded-full bg-success/50 motion-safe:animate-ping" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            isOpen ? "bg-success" : "bg-destructive"
          )}
        />
      </span>
      {isOpen ? openLabel : closedLabel}
    </span>
  );
}

export function getFulfillmentMeta(isCollectibleOnline: boolean) {
  return isCollectibleOnline
    ? { label: "Digital delivery", icon: DownloadIcon }
    : { label: "Pickup at shop", icon: StoreIcon };
}

/**
 * Neutral label distinguishing digital delivery from counter pickup.
 * Deliberately uncolored: fulfillment is a property, not a status.
 */
export function FulfillmentBadge({
  isCollectibleOnline,
}: {
  isCollectibleOnline: boolean;
}) {
  const meta = getFulfillmentMeta(isCollectibleOnline);
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function getRequestStatusMeta(
  status: string,
  uppercase = false
): {
  label: string;
  variant: NonNullable<BadgeVariant>;
} {
  const format = (text: string) => (uppercase ? text.toUpperCase() : text);

  switch (status) {
    case "INITIATED":
      return { label: format("Initiated (Uploading)"), variant: "info" };
    case "PENDING":
      return { label: format("Pending"), variant: "warning" };
    case "IN_PROGRESS":
      return { label: format("In Progress"), variant: "info" };
    case "COMPLETED":
      return { label: format("Completed"), variant: "success" };
    case "CANCELED":
      return { label: format("Canceled"), variant: "destructive" };
    case "DRAFT_AWAITING_ADVANCE":
      return { label: format("Awaiting Advance"), variant: "warning" };
    default:
      return { label: format(status), variant: "outline" };
  }
}

/**
 * Semantic intent-colored badge for work request lifecycle states.
 */
export function RequestStatusBadge({
  status,
  uppercase = false,
  className,
}: {
  status: string;
  uppercase?: boolean;
  className?: string;
}) {
  const meta = getRequestStatusMeta(status, uppercase);
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  );
}

export function getPaymentStatusMeta(status: string): {
  label: string;
  variant: NonNullable<BadgeVariant>;
} {
  switch (status) {
    case "SUCCESS":
      return { label: "Success", variant: "success" };
    case "PENDING":
      return { label: "Pending", variant: "warning" };
    case "FAILED":
      return { label: "Failed", variant: "destructive" };
    default:
      return { label: status, variant: "outline" };
  }
}

/**
 * Semantic intent-colored badge for payment transaction states.
 */
export function PaymentStatusBadge({ status }: { status: string }) {
  const meta = getPaymentStatusMeta(status);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
