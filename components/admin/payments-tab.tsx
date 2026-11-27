"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  ReceiptIndianRupeeIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  PaymentStatusBadge,
} from "@/components/shared/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  extractApiError,
  formatDateTime,
  formatPaiseToInr,
  getSnapshotMeta,
  type PaymentWithRequest,
} from "./admin-types";
import { cn } from "@/lib/utils";

const PAYMENT_STATUS_ITEMS = [
  { value: "ALL", label: "All Statuses" },
  { value: "SUCCESS", label: "Success" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const PAYMENT_TYPE_ITEMS = [
  { value: "ALL", label: "All Types" },
  { value: "advance", label: "Advance" },
  { value: "balance", label: "Balance" },
  { value: "full", label: "Full" },
];

async function requestPaymentsHistory(): Promise<{
  payments?: PaymentWithRequest[];
  error?: string;
}> {
  try {
    const response = await fetch("/api/admin/payments", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      payments?: PaymentWithRequest[];
      error?: string;
    } | null;

    if (!response.ok || !payload?.payments) {
      return {
        error: extractApiError(payload, "Failed to load payments history."),
      };
    }

    return { payments: payload.payments };
  } catch {
    return { error: "Network error while loading payments." };
  }
}

/**
 * Payment & Token History tab showing transaction records, dues breakdown, and provider references.
 */
export function PaymentsTab() {
  const [payments, setPayments] = useState<PaymentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await requestPaymentsHistory();
    if (result.payments) {
      setPayments(result.payments);
    } else {
      setErrorMessage(result.error ?? "Failed to load payments history.");
      setPayments([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void requestPaymentsHistory().then((result) => {
      if (!active) return;
      if (result.payments) {
        setPayments(result.payments);
        setErrorMessage(null);
      } else {
        setErrorMessage(result.error ?? "Failed to load payments history.");
        setPayments([]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((payment) => {
      if (statusFilter !== "ALL" && payment.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "ALL" && payment.payment_type !== typeFilter) {
        return false;
      }
      if (!q) return true;
      const req = payment.work_requests;
      const token = req?.token?.toLowerCase() ?? "";
      const phone = req?.customer_phone?.toLowerCase() ?? "";
      const email = req?.customer_email?.toLowerCase() ?? "";
      const ref = payment.provider_ref.toLowerCase();
      return (
        token.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        ref.includes(q)
      );
    });
  }, [payments, query, statusFilter, typeFilter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Payment &amp; Token History</CardTitle>
            <CardDescription>
              Audit advance, balance, and full payments linked to customer work
              tokens.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPayments()}
            disabled={loading}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-12 sm:items-end">
          <Field className="sm:col-span-6">
            <FieldLabel htmlFor="payments-search">
              Search Token, Contact, or Provider Ref
            </FieldLabel>
            <Input
              id="payments-search"
              name="q"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g., OC-7K9P3M, pay_…, phone, email…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>

          <Field className="sm:col-span-3">
            <FieldLabel htmlFor="payments-status">Payment Status</FieldLabel>
            <Select
              items={PAYMENT_STATUS_ITEMS}
              value={statusFilter}
              onValueChange={(value) => {
                if (value) setStatusFilter(value);
              }}
            >
              <SelectTrigger id="payments-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {PAYMENT_STATUS_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field className="sm:col-span-3">
            <FieldLabel htmlFor="payments-type">Payment Type</FieldLabel>
            <Select
              items={PAYMENT_TYPE_ITEMS}
              value={typeFilter}
              onValueChange={(value) => {
                if (value) setTypeFilter(value);
              }}
            >
              <SelectTrigger id="payments-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {PAYMENT_TYPE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Unable to load payments</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : loading ? (
          <output
            aria-live="polite"
            aria-label="Loading payments"
            className="flex flex-col gap-2"
          >
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </output>
        ) : filteredPayments.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptIndianRupeeIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No matching payments</EmptyTitle>
              <EmptyDescription>
                No payment transactions match your current filter criteria.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total / Paid / Due</TableHead>
                <TableHead>Provider Ref</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => {
                const req = payment.work_requests;
                const snapshot = req
                  ? getSnapshotMeta(req.service_snapshot)
                  : null;
                const duePaise = req
                  ? Math.max(0, req.total_amount_paise - req.amount_paid_paise)
                  : 0;

                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono font-medium">
                      {req?.token ? (
                        <span translate="no">{req.token}</span>
                      ) : (
                        <Badge variant="warning">Awaiting Advance</Badge>
                      )}
                    </TableCell>
                    <TableCell>{snapshot?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span>{req?.customer_phone || "—"}</span>
                        <span className="text-muted-foreground">
                          {req?.customer_email || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payment.payment_type === "advance"
                            ? "info"
                            : "secondary"
                        }
                        className="capitalize"
                      >
                        {payment.payment_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatPaiseToInr(payment.amount_paise)}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {req ? (
                        <div className="flex flex-col">
                          <span>
                            Total: {formatPaiseToInr(req.total_amount_paise)}
                          </span>
                          <span className="text-muted-foreground">
                            Paid: {formatPaiseToInr(req.amount_paid_paise)} •{" "}
                            <span
                              className={cn(
                                "font-medium",
                                duePaise > 0 ? "text-warning" : "text-success"
                              )}
                            >
                              Due: {formatPaiseToInr(duePaise)}
                            </span>
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      translate="no"
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {payment.provider_ref}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(
                        payment.completed_at ?? payment.created_at
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
