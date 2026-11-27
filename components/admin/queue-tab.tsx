"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  InboxIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
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
import { SubmittedWhileClosedIndicator } from "@/components/admin/submitted-while-closed-indicator";
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
  getRequestStatusBadge,
  getSnapshotMeta,
  type WorkRequestRecord,
} from "./admin-types";
import { cn } from "@/lib/utils";
import { RequestDetailSheet } from "./request-detail-sheet";

const STATUS_FILTER_ITEMS = [
  { value: "ACTIVE", label: "All Active" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
  { value: "INITIATED", label: "Initiated (Uploading)" },
  { value: "DRAFT_AWAITING_ADVANCE", label: "Draft (Awaiting Advance)" },
] as const;

type StatusFilterValue = (typeof STATUS_FILTER_ITEMS)[number]["value"];

/**
 * Work Queue & Lost-Token Recovery tab for searching, filtering, and inspecting customer requests.
 */
export function QueueTab() {
  const [statusFilter, setStatusFilter] =
    useState<StatusFilterValue>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [requests, setRequests] = useState<WorkRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  );

  const loadRequests = useCallback(
    async (filters: {
      status: StatusFilterValue;
      q: string;
      from: string;
      to: string;
    }) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams();
        if (filters.status !== "ACTIVE") {
          params.set("status", filters.status);
        }
        if (filters.q.trim()) {
          params.set("q", filters.q.trim());
        }
        if (filters.from) {
          params.set("from", filters.from);
        }
        if (filters.to) {
          params.set("to", filters.to);
        }

        const qs = params.toString();
        const response = await fetch(
          `/api/admin/requests${qs ? `?${qs}` : ""}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as {
          requests?: WorkRequestRecord[];
          error?: string;
        } | null;

        if (!response.ok || !payload?.requests) {
          setErrorMessage(
            extractApiError(payload, "Failed to load work requests.")
          );
          setRequests([]);
          return;
        }

        setRequests(payload.requests);
      } catch {
        setErrorMessage("Network error while fetching work requests.");
        setRequests([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadRequests({
      status: statusFilter,
      q: searchQuery,
      from: fromDate,
      to: toDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadRequests({
      status: statusFilter,
      q: searchQuery,
      from: fromDate,
      to: toDate,
    });
  }

  function handleReset() {
    setStatusFilter("ACTIVE");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    void loadRequests({
      status: "ACTIVE",
      q: "",
      from: "",
      to: "",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Work Queue</CardTitle>
              <CardDescription>
                Active jobs. Search by token, phone, or email to recover a lost
                token.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void loadRequests({
                  status: statusFilter,
                  q: searchQuery,
                  from: fromDate,
                  to: toDate,
                })
              }
              disabled={loading}
            >
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            onSubmit={handleSearchSubmit}
            className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-3 md:grid-cols-12 md:items-end"
          >
            <Field className="md:col-span-3">
              <FieldLabel htmlFor="queue-search-input">
                Token, Phone, or Email
              </FieldLabel>
              <Input
                id="queue-search-input"
                name="q"
                autoComplete="off"
                spellCheck={false}
                placeholder="OC-7K9P3M, phone, or email…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </Field>

            <Field className="md:col-span-3">
              <FieldLabel htmlFor="queue-status-select">Status</FieldLabel>
              <Select
                items={[...STATUS_FILTER_ITEMS]}
                value={statusFilter}
                onValueChange={(value) => {
                  if (value) {
                    setStatusFilter(value as StatusFilterValue);
                  }
                }}
              >
                <SelectTrigger id="queue-status-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {STATUS_FILTER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="queue-from-date">From</FieldLabel>
              <Input
                id="queue-from-date"
                name="from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="queue-to-date">To</FieldLabel>
              <Input
                id="queue-to-date"
                name="to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 md:col-span-2 md:justify-end">
              <Button type="submit" size="sm" disabled={loading}>
                <SearchIcon data-icon="inline-start" aria-hidden="true" />
                Filter
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Reset filters"
                aria-label="Reset filters"
                onClick={handleReset}
                disabled={loading}
              >
                <RotateCcwIcon aria-hidden="true" />
              </Button>
            </div>
          </form>

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Failed to load queue</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : loading ? (
            <output
              aria-live="polite"
              aria-label="Loading work queue"
              className="flex flex-col gap-2"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </output>
          ) : requests.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No matching requests</EmptyTitle>
                <EmptyDescription>
                  Try adjusting your status filter, search query, or date range.
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
                  <TableHead>Total / Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const snapshot = getSnapshotMeta(req.service_snapshot);
                  const badge = getRequestStatusBadge(req.status);
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono font-medium">
                        {req.token ? (
                          <Button
                            variant="link"
                            size="sm"
                            translate="no"
                            className="h-auto p-0 font-mono"
                            onClick={() => setSelectedRequestId(req.id)}
                          >
                            {req.token}
                          </Button>
                        ) : req.status === "INITIATED" ? (
                          <Badge variant="info">Uploading Files</Badge>
                        ) : (
                          <Badge variant="warning">Awaiting Advance</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{snapshot.name}</span>
                          {req.submitted_while_closed ? (
                            <SubmittedWhileClosedIndicator />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span>{req.customer_phone || "—"}</span>
                          <span className="text-muted-foreground">
                            {req.customer_email || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs tabular-nums">
                          <span className="font-medium">
                            {formatPaiseToInr(req.total_amount_paise)}
                          </span>
                          <span
                            className={cn(
                              req.total_amount_paise > 0 &&
                                req.amount_paid_paise >= req.total_amount_paise
                                ? "font-medium text-success"
                                : req.status === "COMPLETED" &&
                                    req.amount_paid_paise <
                                      req.total_amount_paise
                                  ? "font-medium text-warning"
                                  : "text-muted-foreground"
                            )}
                          >
                            Paid: {formatPaiseToInr(req.amount_paid_paise)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(req.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRequestId(req.id)}
                        >
                          Inspect
                          <ChevronRightIcon
                            data-icon="inline-end"
                            aria-hidden="true"
                          />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RequestDetailSheet
        key={selectedRequestId ?? "closed"}
        requestId={selectedRequestId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null);
          }
        }}
        onRequestUpdated={() =>
          void loadRequests({
            status: statusFilter,
            q: searchQuery,
            from: fromDate,
            to: toDate,
          })
        }
      />
    </div>
  );
}
