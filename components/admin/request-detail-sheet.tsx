"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  PlayIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentSummaryStrip } from "@/components/shared/payment-summary-strip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SubmittedWhileClosedIndicator } from "@/components/admin/submitted-while-closed-indicator";
import {
  extractApiError,
  formatDateTime,
  formatPaiseToInr,
  getPaymentStatusBadge,
  getRequestStatusBadge,
  getSnapshotMeta,
  type PaymentRecord,
  type RequestFileWithUrl,
  type WorkRequestRecord,
} from "./admin-types";
import { RequestFileList } from "./request-file-list";

interface RequestDetailPayload {
  request: WorkRequestRecord;
  inputFiles: RequestFileWithUrl[];
  outputFiles: RequestFileWithUrl[];
  payments: PaymentRecord[];
}

interface RequestDetailSheetProps {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onRequestUpdated: () => void;
}

function formatFormValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatFormValue(item)).join(", ");
  }
  return JSON.stringify(value);
}

async function fetchRequestDetailPayload(id: string): Promise<{
  detail?: RequestDetailPayload;
  error?: string;
}> {
  try {
    const response = await fetch(`/api/admin/requests/${id}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | RequestDetailPayload
      | { error?: string }
      | null;

    if (!response.ok || !payload || !("request" in payload)) {
      return {
        error: extractApiError(payload, "Failed to load request details."),
      };
    }

    return { detail: payload };
  } catch {
    return { error: "Network error while loading request details." };
  }
}

/**
 * Side-sheet inspector for a single work request: form answers, files, deliverables, payments, and lifecycle transitions.
 */
export function RequestDetailSheet({
  requestId,
  onOpenChange,
  onRequestUpdated,
}: RequestDetailSheetProps) {
  const [detail, setDetail] = useState<RequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(requestId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const cancelReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelValidationError, setCancelValidationError] = useState<
    string | null
  >(null);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    const result = await fetchRequestDetailPayload(id);
    if (result.detail) {
      setDetail(result.detail);
    } else {
      setLoadError(result.error ?? "Failed to load request details.");
      setDetail(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!requestId) return;
    let active = true;
    void fetchRequestDetailPayload(requestId).then((result) => {
      if (!active) return;
      if (result.detail) {
        setDetail(result.detail);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? "Failed to load request details.");
        setDetail(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestId]);

  async function handleStatusTransition(
    targetStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELED",
    reason?: string
  ) {
    if (!detail) return;
    setActionError(null);
    setStatusPending(targetStatus);

    try {
      const response = await fetch(
        `/api/admin/requests/${detail.request.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: targetStatus,
            ...(reason !== undefined ? { cancellationReason: reason } : {}),
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { request?: WorkRequestRecord; error?: string; fieldErrors?: Record<string, string[]> }
        | null;

      if (!response.ok) {
        const message = extractApiError(
          payload,
          `Failed to update request to ${targetStatus}.`
        );
        setActionError(message);
        if (targetStatus === "CANCELED") {
          setCancelValidationError(message);
        } else {
          toast.error(message);
        }
        return;
      }

      toast.success(
        targetStatus === "IN_PROGRESS"
          ? "Work started."
          : targetStatus === "COMPLETED"
            ? "Request marked completed."
            : "Request canceled."
      );

      if (targetStatus === "CANCELED") {
        setCancelDialogOpen(false);
        setCancellationReason("");
        setCancelValidationError(null);
      }

      await fetchDetail(detail.request.id);
      onRequestUpdated();
    } catch {
      const message = "Network error while updating request status.";
      setActionError(message);
      toast.error(message);
    } finally {
      setStatusPending(null);
    }
  }

  async function handleDeliverableUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0 || !detail) {
      return;
    }

    const files = Array.from(fileList);
    event.target.value = "";
    setUploadingFiles(true);
    setActionError(null);

    try {
      for (const file of files) {
        const mimeType = file.type || "application/octet-stream";

        const uploadUrlRes = await fetch(
          `/api/admin/requests/${detail.request.id}/deliverables/upload-url`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              mimeType,
              sizeBytes: file.size,
            }),
          }
        );

        const uploadUrlPayload = (await uploadUrlRes.json().catch(() => null)) as
          | { uploadUrl?: string; storageKey?: string; error?: string }
          | null;

        if (
          !uploadUrlRes.ok ||
          !uploadUrlPayload?.uploadUrl ||
          !uploadUrlPayload?.storageKey
        ) {
          throw new Error(
            extractApiError(
              uploadUrlPayload,
              `Failed to get upload URL for ${file.name}.`
            )
          );
        }

        const putRes = await fetch(uploadUrlPayload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
          },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Storage upload failed for ${file.name}.`);
        }

        const registerRes = await fetch(
          `/api/admin/requests/${detail.request.id}/deliverables`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storageKey: uploadUrlPayload.storageKey,
              originalFilename: file.name,
              mimeType,
              sizeBytes: file.size,
            }),
          }
        );

        const registerPayload = await registerRes.json().catch(() => null);
        if (!registerRes.ok) {
          throw new Error(
            extractApiError(
              registerPayload,
              `Failed to register deliverable ${file.name}.`
            )
          );
        }
      }

      toast.success(
        files.length === 1
          ? `Uploaded ${files[0].name}`
          : `Uploaded ${files.length} deliverables`
      );
      await fetchDetail(detail.request.id);
      onRequestUpdated();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to upload deliverable file.";
      setActionError(message);
      toast.error(message);
    } finally {
      setUploadingFiles(false);
    }
  }

  function handleCancelSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = cancellationReason.trim();
    if (trimmed.length < 3) {
      setCancelValidationError(
        "Cancellation reason must be at least 3 characters."
      );
      cancelReasonRef.current?.focus();
      return;
    }
    setCancelValidationError(null);
    void handleStatusTransition("CANCELED", trimmed);
  }

  const workRequest = detail?.request ?? null;
  const snapshotMeta = workRequest
    ? getSnapshotMeta(workRequest.service_snapshot)
    : null;
  const statusInfo = workRequest
    ? getRequestStatusBadge(workRequest.status)
    : null;
  const formEntries =
    workRequest &&
    workRequest.form_data &&
    typeof workRequest.form_data === "object" &&
    !Array.isArray(workRequest.form_data)
      ? Object.entries(workRequest.form_data as Record<string, unknown>)
      : [];

  const canWorkOnRequest =
    workRequest?.status === "PENDING" || workRequest?.status === "IN_PROGRESS";
  const missingOnlineDeliverable =
    Boolean(snapshotMeta?.isCollectibleOnline) &&
    (detail?.outputFiles.length ?? 0) === 0;
  const balanceDuePaise = workRequest
    ? Math.max(0, workRequest.total_amount_paise - workRequest.amount_paid_paise)
    : 0;

  return (
    <>
      <Sheet open={Boolean(requestId)} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto overscroll-contain sm:max-w-xl"
        >
          <SheetHeader className="border-b">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <SheetTitle translate={workRequest?.token ? "no" : undefined}>
                {workRequest?.token
                  ? `Token ${workRequest.token}`
                  : "Request Details"}
              </SheetTitle>
              {statusInfo ? (
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              ) : null}
              {workRequest?.submitted_while_closed ? (
                <SubmittedWhileClosedIndicator />
              ) : null}
            </div>
            <SheetDescription>
              {snapshotMeta
                ? `${snapshotMeta.name} • ${snapshotMeta.isCollectibleOnline ? "Online Download" : "Physical Pickup"}`
                : "Inspect customer submission, files, payments, and actions."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 p-4">
            {loading ? (
              <output
                aria-live="polite"
                aria-label="Loading request details"
                className="flex flex-col gap-3"
              >
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-28 w-full" />
              </output>
            ) : loadError ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>Unable to load request</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  <span>{loadError}</span>
                  {requestId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => void fetchDetail(requestId)}
                    >
                      <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                      Retry
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : detail && workRequest ? (
              <>
                {actionError ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon aria-hidden="true" />
                    <AlertTitle>Action failed</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                ) : null}

                {workRequest.status === "INITIATED" ? (
                  <Alert variant="info">
                    <AlertCircleIcon aria-hidden="true" />
                    <AlertTitle>File Uploads In Progress</AlertTitle>
                    <AlertDescription>
                      Customer started submitting this request; file uploads
                      have not finalized yet. Auto-purges after 24 hours if
                      abandoned.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {workRequest.status === "CANCELED" &&
                workRequest.cancellation_reason ? (
                  <Alert variant="destructive">
                    <XCircleIcon aria-hidden="true" />
                    <AlertTitle>Cancellation Reason</AlertTitle>
                    <AlertDescription>
                      {workRequest.cancellation_reason}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Customer &amp; Timing
                  </h3>
                  <div className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="font-medium">
                        {workRequest.customer_phone || "—"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="truncate font-medium">
                        {workRequest.customer_email || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Submitted At
                      </div>
                      <div className="tabular-nums">
                        {formatDateTime(workRequest.created_at)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Completed / Canceled At
                      </div>
                      <div className="tabular-nums">
                        {formatDateTime(workRequest.terminal_at)}
                      </div>
                    </div>
                    {workRequest.customer_note ? (
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground">
                          Customer Note
                        </div>
                        <div className="whitespace-pre-wrap">
                          {workRequest.customer_note}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Submitted Form Values
                  </h3>
                  {formEntries.length === 0 ? (
                    <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
                      No custom form answers submitted.
                    </div>
                  ) : (
                    <dl className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 text-sm sm:grid-cols-2">
                      {formEntries.map(([key, value]) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <dt className="font-mono text-xs text-muted-foreground">
                            {key}
                          </dt>
                          <dd className="break-words font-medium">
                            {formatFormValue(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Customer Input Files ({detail.inputFiles.length})
                  </h3>
                  <RequestFileList
                    files={detail.inputFiles}
                    kind="input"
                    emptyMessage="No input documents uploaded."
                  />
                </section>

                {snapshotMeta?.isCollectibleOnline ? (
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Finished Deliverables ({detail.outputFiles.length})
                      </h3>
                    </div>

                    {canWorkOnRequest ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-card p-3">
                        <Field>
                          <FieldLabel htmlFor="deliverable-upload-input">
                            Upload Deliverable(s)
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Input
                              id="deliverable-upload-input"
                              type="file"
                              multiple
                              disabled={uploadingFiles}
                              onChange={handleDeliverableUpload}
                            />
                            {uploadingFiles ? (
                              <output
                                aria-live="polite"
                                className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                              >
                                <Spinner />
                                <span>Uploading…</span>
                              </output>
                            ) : null}
                          </div>
                          <FieldDescription>
                            Files attach directly to this token for customer
                            download.
                          </FieldDescription>
                        </Field>
                      </div>
                    ) : null}

                    <RequestFileList
                      files={detail.outputFiles}
                      kind="deliverable"
                      emptyMessage="No deliverables uploaded yet."
                    />
                  </section>
                ) : null}

                <Separator />

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Payments Breakdown
                  </h3>
                  <PaymentSummaryStrip
                    totalAmountPaise={workRequest.total_amount_paise}
                    amountPaidPaise={workRequest.amount_paid_paise}
                    balanceDuePaise={balanceDuePaise}
                    compact
                  />

                  {detail.payments.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      No payment records logged yet.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {detail.payments.map((payment) => {
                        const badge = getPaymentStatusBadge(payment.status);
                        return (
                          <div
                            key={payment.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
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
                              <span className="font-medium tabular-nums">
                                {formatPaiseToInr(payment.amount_paise)}
                              </span>
                              <Badge variant={badge.variant}>
                                {badge.label}
                              </Badge>
                            </div>
                            <div className="min-w-0 text-muted-foreground tabular-nums">
                              <span
                                translate="no"
                                className="break-all font-mono"
                              >
                                {payment.provider_ref}
                              </span>{" "}
                              • {formatDateTime(payment.created_at)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {canWorkOnRequest && missingOnlineDeliverable ? (
                  <Alert variant="warning">
                    <AlertCircleIcon aria-hidden="true" />
                    <AlertTitle>Deliverable required</AlertTitle>
                    <AlertDescription>
                      Upload at least one finished deliverable file before
                      marking this online-collectible request completed.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            ) : null}
          </div>

          {workRequest && canWorkOnRequest ? (
            <SheetFooter className="border-t bg-muted/40">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {workRequest.status === "PENDING" ? (
                  <Button
                    variant="secondary"
                    disabled={statusPending !== null || uploadingFiles}
                    onClick={() => void handleStatusTransition("IN_PROGRESS")}
                  >
                    {statusPending === "IN_PROGRESS" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <PlayIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    Start Work
                  </Button>
                ) : null}

                <Button
                  variant="success"
                  disabled={
                    statusPending !== null ||
                    uploadingFiles ||
                    missingOnlineDeliverable
                  }
                  onClick={() => void handleStatusTransition("COMPLETED")}
                >
                  {statusPending === "COMPLETED" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <CheckCircle2Icon data-icon="inline-start" aria-hidden="true" />
                  )}
                  Mark Completed
                </Button>

                <Button
                  variant="destructive"
                  disabled={statusPending !== null || uploadingFiles}
                  onClick={() => {
                    setCancelValidationError(null);
                    setCancelDialogOpen(true);
                  }}
                >
                  <XCircleIcon data-icon="inline-start" aria-hidden="true" />
                  Cancel / Reject
                </Button>
              </div>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(nextOpen) => {
          if (statusPending === "CANCELED") return;
          setCancelDialogOpen(nextOpen);
        }}
      >
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Cancel / Reject Request</DialogTitle>
            <DialogDescription>
              Provide a clear cancellation reason. This note is shown to the
              customer on token lookup.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCancelSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(cancelValidationError) || undefined}>
                <FieldLabel htmlFor="cancellation-reason-input">
                  Cancellation Reason
                </FieldLabel>
                <Textarea
                  ref={cancelReasonRef}
                  id="cancellation-reason-input"
                  name="cancellationReason"
                  autoComplete="off"
                  placeholder="e.g., Uploaded document is blurry; please resubmit or contact counter…"
                  rows={3}
                  value={cancellationReason}
                  onChange={(event) => {
                    setCancellationReason(event.target.value);
                    if (cancelValidationError) {
                      setCancelValidationError(null);
                    }
                  }}
                  aria-invalid={Boolean(cancelValidationError) || undefined}
                  disabled={statusPending === "CANCELED"}
                />
                <FieldDescription>
                  Minimum 3 characters required.
                </FieldDescription>
                {cancelValidationError ? (
                  <FieldError>{cancelValidationError}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
                disabled={statusPending === "CANCELED"}
              >
                Keep Request
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={statusPending === "CANCELED"}
              >
                {statusPending === "CANCELED" ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Confirm Cancellation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
