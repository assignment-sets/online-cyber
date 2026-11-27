import { formatPaiseToInr } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";

interface PaymentSummaryStripProps {
  totalAmountPaise: number;
  amountPaidPaise: number;
  balanceDuePaise: number;
  compact?: boolean;
  className?: string;
}

/**
 * Reusable 3-part financial breakdown with intent-colored paid and due amounts.
 * Renders as a compact 3-row receipt ledger on `< sm` when not `compact`,
 * and a 3-column summary strip on `sm+`.
 */
export function PaymentSummaryStrip({
  totalAmountPaise,
  amountPaidPaise,
  balanceDuePaise,
  compact = false,
  className,
}: PaymentSummaryStripProps) {
  const isPaid = amountPaidPaise > 0;
  const hasBalanceDue = balanceDuePaise > 0;
  const isSettled = !hasBalanceDue && totalAmountPaise > 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/25 tabular-nums",
        compact
          ? "grid grid-cols-3 gap-3 p-3 text-sm"
          : "divide-y px-3.5 sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:p-4",
        className
      )}
    >
      <div
        className={cn(
          compact
            ? "flex flex-col gap-0.5"
            : "flex items-center justify-between gap-3 py-2.5 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5 sm:py-0"
        )}
      >
        <span className="text-xs text-muted-foreground">
          {compact ? "Total" : "Total Charge"}
        </span>
        <span
          className={cn(
            "font-heading font-semibold text-foreground",
            compact ? "text-sm" : "text-sm sm:text-base"
          )}
        >
          {formatPaiseToInr(totalAmountPaise)}
        </span>
      </div>

      <div
        className={cn(
          compact
            ? "flex flex-col gap-0.5"
            : "flex items-center justify-between gap-3 py-2.5 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5 sm:py-0"
        )}
      >
        <span className="text-xs text-muted-foreground">
          {compact ? "Paid" : "Amount Paid"}
        </span>
        <span
          className={cn(
            "font-heading font-semibold",
            compact ? "text-sm" : "text-sm sm:text-base",
            isPaid ? "text-success" : "text-foreground"
          )}
        >
          {formatPaiseToInr(amountPaidPaise)}
        </span>
      </div>

      <div
        className={cn(
          compact
            ? "flex flex-col gap-0.5"
            : "flex items-center justify-between gap-3 py-2.5 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5 sm:py-0"
        )}
      >
        <span className="text-xs text-muted-foreground">
          {compact ? "Balance Due" : "Remaining Balance Due"}
        </span>
        <span
          className={cn(
            "font-heading font-semibold",
            compact ? "text-sm" : "text-sm sm:text-base",
            hasBalanceDue
              ? "text-warning"
              : isSettled
                ? "text-success"
                : "text-foreground"
          )}
        >
          {formatPaiseToInr(balanceDuePaise)}
        </span>
      </div>
    </div>
  );
}
