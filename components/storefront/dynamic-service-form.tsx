"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ChevronUpIcon,
  CreditCardIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { PublicService } from "@/lib/data/public";
import {
  calculateRequestPricing,
  type PricingBreakdown,
} from "@/lib/domain/pricing";
import {
  formatPaiseToInr,
  type FormFieldDefinition,
} from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";
import type {
  FileUploadProgressStatus,
  SelectedLocalFile,
} from "./file-upload-field";
import {
  MockCheckoutDialog,
  type CheckoutSuccessPayload,
} from "./mock-checkout-dialog";
import {
  PricingBreakdownContent,
  PricingSummaryCard,
} from "./pricing-summary-card";
import { ServiceFieldRenderer } from "./service-field-renderer";
import {
  TokenIssuedView,
  type IssuedTokenSummary,
} from "./token-issued-view";
import {
  UPLOAD_CONCURRENCY,
  uploadFilesInParallel,
  type UploadTarget,
} from "./upload-queue";

interface DynamicServiceFormProps {
  service: PublicService;
  shopIsOpen: boolean;
}

interface PendingAdvanceCheckout {
  requestId: string;
  amountPaise: number;
  totalAmountPaise: number;
  submittedWhileClosed: boolean;
}

interface PendingInitiationState {
  requestId: string;
  remainingTargets: UploadTarget[];
  succeededKeys: string[];
  allStorageKeys: string[];
  requiresAdvance: boolean;
  totalAmountPaise: number;
  advanceRequiredPaise: number;
  submittedWhileClosed: boolean;
}

interface UploadProgressState {
  uploadedCount: number;
  totalCount: number;
}

interface SubmissionOutcomeResponse {
  status?: string;
  requiresAdvance?: boolean;
  requestId?: string;
  token?: string | null;
  uploadTargets?: UploadTarget[];
  totalAmountPaise?: number;
  advanceRequiredPaise?: number;
  amountPaidPaise?: number;
  submittedWhileClosed?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

type FormStepId = "details" | "documents" | "contact";

function createInitialFormData(
  formSchema: FormFieldDefinition[]
): Record<string, unknown> {
  const initial: Record<string, unknown> = {};
  for (const field of formSchema) {
    initial[field.key] = field.type === "checkbox" ? false : "";
  }
  return initial;
}

/**
 * Config-driven dynamic service request form with progressive mobile/tablet steps,
 * live pricing calculation, Upload-on-Submit parallel R2 uploads,
 * >= ₹500 advance checkout modal, and Work Token issuance.
 */
export function DynamicServiceForm({
  service,
  shopIsOpen,
}: DynamicServiceFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    createInitialFormData(service.formSchema)
  );
  const [selectedFilesByField, setSelectedFilesByField] = useState<
    Record<string, SelectedLocalFile[]>
  >({});
  const [uploadStatusByClientFileId, setUploadStatusByClientFileId] = useState<
    Record<string, FileUploadProgressStatus>
  >({});
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [pendingInitiation, setPendingInitiation] =
    useState<PendingInitiationState | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [priceSheetOpen, setPriceSheetOpen] = useState(false);

  const [pendingAdvance, setPendingAdvance] =
    useState<PendingAdvanceCheckout | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [issuedSummary, setIssuedSummary] =
    useState<IssuedTokenSummary | null>(null);

  const detailFields = useMemo(
    () => service.formSchema.filter((field) => field.type !== "file"),
    [service.formSchema]
  );
  const fileFields = useMemo(
    () => service.formSchema.filter((field) => field.type === "file"),
    [service.formSchema]
  );

  const steps = useMemo(() => {
    const list: Array<{ id: FormStepId; label: string }> = [];
    if (detailFields.length > 0) {
      list.push({ id: "details", label: "Details" });
    }
    if (fileFields.length > 0) {
      list.push({ id: "documents", label: "Documents" });
    }
    list.push({ id: "contact", label: "Contact & Review" });
    return list;
  }, [detailFields.length, fileFields.length]);

  const safeStepIndex = Math.min(activeStepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex];
  const isLastStep = safeStepIndex === steps.length - 1;

  const pricing: PricingBreakdown = useMemo(() => {
    const sanitizedForPricing: Record<string, unknown> = {};
    for (const field of service.formSchema) {
      if (field.type === "file") {
        continue;
      }
      const val = formData[field.key];
      if (field.type === "number") {
        const num = typeof val === "number" ? val : Number(val);
        sanitizedForPricing[field.key] =
          val === "" || val === undefined || !Number.isFinite(num) || num < 0
            ? 0
            : num;
      } else {
        sanitizedForPricing[field.key] = val;
      }
    }

    try {
      return calculateRequestPricing({
        basePricePaise: service.basePricePaise,
        formSchema: service.formSchema,
        pricingRules: service.pricingRules,
        formData: sanitizedForPricing,
      });
    } catch {
      return calculateRequestPricing({
        basePricePaise: service.basePricePaise,
        formSchema: service.formSchema,
        pricingRules: service.pricingRules,
        formData: {},
      });
    }
  }, [formData, service]);

  function clearFieldError(key: string) {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function clearStaleInitiation() {
    if (pendingInitiation) {
      setPendingInitiation(null);
      setUploadStatusByClientFileId({});
      setUploadProgress(null);
    }
    if (formError) {
      setFormError(null);
    }
  }

  function updateFieldValue(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
    clearStaleInitiation();
  }

  function resetFormSession() {
    setFormData(createInitialFormData(service.formSchema));
    setSelectedFilesByField({});
    setUploadStatusByClientFileId({});
    setUploadProgress(null);
    setPendingInitiation(null);
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerNote("");
    setFieldErrors({});
    setFormError(null);
    setActiveStepIndex(0);
    setPriceSheetOpen(false);
    setPendingAdvance(null);
    setCheckoutOpen(false);
    setIssuedSummary(null);
  }

  function validateStep(stepId: FormStepId): boolean {
    const errors: Record<string, string[]> = {};

    if (stepId === "details") {
      for (const field of detailFields) {
        if (!field.required) {
          continue;
        }
        const value = formData[field.key];
        if (field.type === "checkbox") {
          if (value !== true) {
            errors[field.key] = [`${field.label} is required.`];
          }
        } else if (
          value === undefined ||
          value === null ||
          String(value).trim() === ""
        ) {
          errors[field.key] = [`${field.label} is required.`];
        }
      }
    } else if (stepId === "documents") {
      for (const field of fileFields) {
        if (!field.required) {
          continue;
        }
        const attached = selectedFilesByField[field.key] ?? [];
        if (attached.length === 0) {
          errors[field.key] = [`Please attach ${field.label}.`];
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      });
      return false;
    }

    return true;
  }

  function handleNextStep() {
    if (!validateStep(currentStep.id)) {
      return;
    }
    setActiveStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handlePreviousStep() {
    setActiveStepIndex((prev) => Math.max(prev - 1, 0));
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function jumpToErrorStep(errors: Record<string, string[]>) {
    const errorKeys = Object.keys(errors);
    const detailKeys = new Set(detailFields.map((field) => field.key));
    const fileKeys = new Set(fileFields.map((field) => field.key));

    const detailIdx = steps.findIndex((step) => step.id === "details");
    const docsIdx = steps.findIndex((step) => step.id === "documents");
    const contactIdx = steps.findIndex((step) => step.id === "contact");

    if (detailIdx >= 0 && errorKeys.some((key) => detailKeys.has(key))) {
      setActiveStepIndex(detailIdx);
    } else if (docsIdx >= 0 && errorKeys.some((key) => fileKeys.has(key))) {
      setActiveStepIndex(docsIdx);
    } else if (contactIdx >= 0) {
      setActiveStepIndex(contactIdx);
    }
  }

  function applySubmissionOutcome(
    data: SubmissionOutcomeResponse,
    fallbackSubmittedWhileClosed?: boolean
  ): boolean {
    if (data.status === "PENDING" && data.token) {
      const total = data.totalAmountPaise ?? pricing.totalAmountPaise;
      const paid = data.amountPaidPaise ?? 0;
      setIssuedSummary({
        token: data.token,
        totalAmountPaise: total,
        amountPaidPaise: paid,
        balanceDuePaise: Math.max(0, total - paid),
        submittedWhileClosed: Boolean(
          data.submittedWhileClosed ??
            fallbackSubmittedWhileClosed ??
            !shopIsOpen
        ),
      });
      toast.success(`Work Token ${data.token} issued!`);
      return true;
    }

    if (data.status === "DRAFT_AWAITING_ADVANCE" && data.requestId) {
      setPendingAdvance({
        requestId: data.requestId,
        amountPaise: data.advanceRequiredPaise ?? pricing.advanceRequiredPaise,
        totalAmountPaise: data.totalAmountPaise ?? pricing.totalAmountPaise,
        submittedWhileClosed: Boolean(
          data.submittedWhileClosed ??
            fallbackSubmittedWhileClosed ??
            !shopIsOpen
        ),
      });
      setCheckoutOpen(true);
      return true;
    }

    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingAdvance) {
      setCheckoutOpen(true);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const allSelectedFiles = Object.values(selectedFilesByField).flat();

      let initiation: PendingInitiationState | null = pendingInitiation;

      // Phase A: Initiate request & validate payload before sending any bytes to R2
      if (!initiation) {
        const submissionFormData: Record<string, unknown> = {};
        for (const field of service.formSchema) {
          if (field.type === "file") {
            continue;
          }
          const value = formData[field.key];
          if (field.type === "number") {
            if (value !== "" && value !== undefined && value !== null) {
              submissionFormData[field.key] = value;
            }
          } else if (field.type === "checkbox") {
            submissionFormData[field.key] = Boolean(value);
          } else if (typeof value === "string") {
            submissionFormData[field.key] = value;
          }
        }

        const response = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceSlug: service.slug,
            customerPhone: customerPhone.trim() || null,
            customerEmail: customerEmail.trim() || null,
            customerNote: customerNote.trim() || null,
            formData: submissionFormData,
            files: allSelectedFiles.map(
              ({
                clientFileId,
                fieldKey,
                originalFilename,
                mimeType,
                sizeBytes,
              }) => ({
                clientFileId,
                fieldKey,
                originalFilename,
                mimeType,
                sizeBytes,
              })
            ),
          }),
        });

        const data = (await response
          .json()
          .catch(() => ({}))) as SubmissionOutcomeResponse;

        if (!response.ok) {
          if (data.fieldErrors) {
            setFieldErrors(data.fieldErrors);
            jumpToErrorStep(data.fieldErrors);
            requestAnimationFrame(() => {
              formRef.current
                ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus();
            });
          }
          const message =
            data.error ?? "Please review the highlighted fields and try again.";
          setFormError(message);
          toast.error(message);
          return;
        }

        if (
          data.status === "INITIATED" &&
          data.requestId &&
          Array.isArray(data.uploadTargets) &&
          data.uploadTargets.length > 0
        ) {
          initiation = {
            requestId: data.requestId,
            remainingTargets: data.uploadTargets,
            succeededKeys: [],
            allStorageKeys: data.uploadTargets.map((target) => target.storageKey),
            requiresAdvance: Boolean(data.requiresAdvance),
            totalAmountPaise: data.totalAmountPaise ?? pricing.totalAmountPaise,
            advanceRequiredPaise:
              data.advanceRequiredPaise ?? pricing.advanceRequiredPaise,
            submittedWhileClosed: Boolean(
              data.submittedWhileClosed ?? !shopIsOpen
            ),
          };
        } else {
          // Phase C: No-files fast path
          if (!applySubmissionOutcome(data)) {
            setFormError(
              "Unexpected server response while creating your request."
            );
          }
          return;
        }
      }

      // Phase B: Parallel direct-to-R2 uploads (bounded concurrency = 5) then finalize
      const priorSucceededCount = initiation.succeededKeys.length;
      const totalFileCount = initiation.allStorageKeys.length;

      setUploadStatusByClientFileId((prev) => {
        const next: Record<string, FileUploadProgressStatus> = { ...prev };
        for (const target of initiation.remainingTargets) {
          next[target.clientFileId] = "pending";
        }
        return next;
      });
      setUploadProgress({
        uploadedCount: priorSucceededCount,
        totalCount: totalFileCount,
      });

      let combinedSucceededKeys = initiation.succeededKeys;

      if (initiation.remainingTargets.length > 0) {
        const fileByClientFileId = new Map<string, File>(
          allSelectedFiles.map((item) => [item.clientFileId, item.file])
        );

        const uploadResult = await uploadFilesInParallel({
          uploadTargets: initiation.remainingTargets,
          fileByClientFileId,
          concurrency: UPLOAD_CONCURRENCY,
          onFileStatusChange: (clientFileId, status) => {
            setUploadStatusByClientFileId((prev) => ({
              ...prev,
              [clientFileId]: status,
            }));
          },
          onUploadedCountChange: (newlyUploadedCount) => {
            setUploadProgress({
              uploadedCount: priorSucceededCount + newlyUploadedCount,
              totalCount: totalFileCount,
            });
          },
        });

        combinedSucceededKeys = [
          ...initiation.succeededKeys,
          ...uploadResult.succeededKeys,
        ];

        if (uploadResult.failedTargets.length > 0) {
          setPendingInitiation({
            ...initiation,
            remainingTargets: uploadResult.failedTargets,
            succeededKeys: combinedSucceededKeys,
          });
          setUploadProgress(null);
          const message =
            "Some files failed to upload. Click Retry Upload to finish submitting.";
          setFormError(message);
          toast.error(message);
          return;
        }
      }

      const finalizeResponse = await fetch(
        `/api/requests/${encodeURIComponent(initiation.requestId)}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadedStorageKeys: initiation.allStorageKeys,
          }),
        }
      );

      const finalizeData = (await finalizeResponse
        .json()
        .catch(() => ({}))) as SubmissionOutcomeResponse;

      if (!finalizeResponse.ok) {
        setPendingInitiation({
          ...initiation,
          remainingTargets: [],
          succeededKeys: initiation.allStorageKeys,
        });
        setUploadProgress(null);
        const message =
          finalizeData.error ??
          "Failed to finalize your uploaded files. Please retry.";
        setFormError(message);
        toast.error(message);
        return;
      }

      setPendingInitiation(null);
      setUploadProgress(null);

      // Phase C: Finalized request outcome
      if (
        !applySubmissionOutcome(finalizeData, initiation.submittedWhileClosed)
      ) {
        setFormError(
          "Unexpected server response while finalizing your request."
        );
      }
    } catch {
      setUploadProgress(null);
      const message = "Network error while submitting request. Please retry.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAdvanceCheckoutSuccess(result: CheckoutSuccessPayload) {
    setCheckoutOpen(false);
    const issuedToken = result.token;
    if (!issuedToken) {
      setFormError("Payment succeeded, but Work Token was missing.");
      return;
    }

    setIssuedSummary({
      token: issuedToken,
      totalAmountPaise: result.totalAmountPaise,
      amountPaidPaise: result.amountPaidPaise,
      balanceDuePaise: result.balanceDuePaise,
      submittedWhileClosed:
        pendingAdvance?.submittedWhileClosed ?? !shopIsOpen,
    });
    setPendingAdvance(null);
  }

  if (issuedSummary) {
    return (
      <TokenIssuedView
        summary={issuedSummary}
        serviceName={service.name}
        onStartAnother={resetFormSession}
      />
    );
  }

  const formLocked = isSubmitting || pendingAdvance !== null;

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="grid grid-cols-1 gap-6 pb-20 lg:grid-cols-12 lg:items-start lg:pb-0"
      >
        {/* Mobile & Tablet Step Progress Header */}
        {steps.length > 1 ? (
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground tabular-nums">
                Step {safeStepIndex + 1} of {steps.length} ·{" "}
                <span className="text-primary">{currentStep.label}</span>
              </span>
              {safeStepIndex > 0 ? (
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  className="min-h-8 px-1 font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Previous step
                </button>
              ) : null}
            </div>

            <nav
              aria-label="Form steps"
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
              }}
            >
              {steps.map((step, index) => {
                const isCompleted = index < safeStepIndex;
                const isActive = index === safeStepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    disabled={index > safeStepIndex}
                    aria-label={`${step.label} (Step ${index + 1})`}
                    aria-current={isActive ? "step" : undefined}
                    onClick={() => {
                      if (index <= safeStepIndex) {
                        setActiveStepIndex(index);
                      }
                    }}
                    className={cn(
                      "h-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      isCompleted || isActive ? "bg-primary" : "bg-muted",
                      isCompleted ? "cursor-pointer" : "cursor-default"
                    )}
                  />
                );
              })}
            </nav>
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:col-span-7">
          {isSubmitting && uploadProgress ? (
            <Alert variant="info">
              <Spinner aria-hidden="true" />
              <AlertTitle>Uploading Documents</AlertTitle>
              <AlertDescription>
                <output aria-live="polite" className="tabular-nums">
                  Uploading {uploadProgress.uploadedCount} of{" "}
                  {uploadProgress.totalCount} files…
                </output>
              </AlertDescription>
            </Alert>
          ) : null}

          {formError ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Unable to submit request</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {pendingAdvance ? (
            <Alert variant="warning">
              <CreditCardIcon aria-hidden="true" />
              <AlertTitle>Advance Payment Pending</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>
                  Details saved. Complete the 50% advance (
                  {formatPaiseToInr(pendingAdvance.amountPaise)}) to generate
                  your Work Token.
                </span>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCheckoutOpen(true)}
                    className="h-10"
                  >
                    Open Payment Checkout
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Step 1: Details */}
          {detailFields.length > 0 ? (
            <div
              className={cn(
                currentStep.id !== "details" ? "hidden lg:block" : ""
              )}
            >
              <Card className="bg-transparent ring-0 [--card-spacing:0px] md:bg-card md:ring-1 md:[--card-spacing:--spacing(4)]">
                <CardHeader className="pb-4">
                  <CardTitle>Service Details</CardTitle>
                  <CardDescription>
                    Required fields are marked with *. Pricing updates live.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    {detailFields.map((field) => (
                      <ServiceFieldRenderer
                        key={field.key}
                        field={field}
                        value={formData[field.key]}
                        files={selectedFilesByField[field.key] ?? []}
                        uploadStatusByClientFileId={uploadStatusByClientFileId}
                        error={fieldErrors[field.key]?.[0]}
                        disabled={formLocked}
                        onValueChange={updateFieldValue}
                        onFilesChange={(key, nextFiles) => {
                          setSelectedFilesByField((prev) => ({
                            ...prev,
                            [key]: nextFiles,
                          }));
                          clearFieldError(key);
                          clearStaleInitiation();
                        }}
                      />
                    ))}
                  </FieldGroup>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Step 2: Documents */}
          {fileFields.length > 0 ? (
            <div
              className={cn(
                currentStep.id !== "documents" ? "hidden lg:block" : ""
              )}
            >
              <Card className="bg-transparent ring-0 [--card-spacing:0px] md:bg-card md:ring-1 md:[--card-spacing:--spacing(4)]">
                <CardHeader className="pb-4">
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>
                    Attach the required documents below. Files upload when you
                    submit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    {fileFields.map((field) => (
                      <ServiceFieldRenderer
                        key={field.key}
                        field={field}
                        value={formData[field.key]}
                        files={selectedFilesByField[field.key] ?? []}
                        uploadStatusByClientFileId={uploadStatusByClientFileId}
                        error={fieldErrors[field.key]?.[0]}
                        disabled={formLocked}
                        onValueChange={updateFieldValue}
                        onFilesChange={(key, nextFiles) => {
                          setSelectedFilesByField((prev) => ({
                            ...prev,
                            [key]: nextFiles,
                          }));
                          clearFieldError(key);
                          clearStaleInitiation();
                        }}
                      />
                    ))}
                  </FieldGroup>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Step 3: Contact */}
          <div
            className={cn(
              currentStep.id !== "contact" ? "hidden lg:block" : ""
            )}
          >
            <Card className="bg-transparent ring-0 [--card-spacing:0px] md:bg-card md:ring-1 md:[--card-spacing:--spacing(4)]">
              <CardHeader className="pb-4">
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  Provide a phone number or email for updates and token
                  recovery.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldSet>
                  <FieldLegend variant="label" className="sr-only">
                    Customer Contact Information
                  </FieldLegend>
                  <FieldGroup>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        data-invalid={
                          fieldErrors.customerPhone ? true : undefined
                        }
                      >
                        <FieldLabel htmlFor="customer-phone">
                          Phone Number
                        </FieldLabel>
                        <Input
                          id="customer-phone"
                          name="customerPhone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="+91 98765 43210…"
                          value={customerPhone}
                          disabled={formLocked}
                          aria-invalid={
                            fieldErrors.customerPhone ? true : undefined
                          }
                          onChange={(event) => {
                            setCustomerPhone(event.target.value);
                            clearFieldError("customerPhone");
                            clearFieldError("customerEmail");
                            clearStaleInitiation();
                          }}
                          className="h-11 text-base md:h-10 md:text-sm"
                        />
                        {fieldErrors.customerPhone?.[0] ? (
                          <FieldError>
                            {fieldErrors.customerPhone[0]}
                          </FieldError>
                        ) : null}
                      </Field>

                      <Field
                        data-invalid={
                          fieldErrors.customerEmail ? true : undefined
                        }
                      >
                        <FieldLabel htmlFor="customer-email">
                          Email Address
                        </FieldLabel>
                        <Input
                          id="customer-email"
                          name="customerEmail"
                          type="email"
                          autoComplete="email"
                          spellCheck={false}
                          placeholder="you@example.com…"
                          value={customerEmail}
                          disabled={formLocked}
                          aria-invalid={
                            fieldErrors.customerEmail ? true : undefined
                          }
                          onChange={(event) => {
                            setCustomerEmail(event.target.value);
                            clearFieldError("customerEmail");
                            clearFieldError("customerPhone");
                            clearStaleInitiation();
                          }}
                          className="h-11 text-base md:h-10 md:text-sm"
                        />
                        {fieldErrors.customerEmail?.[0] ? (
                          <FieldError>
                            {fieldErrors.customerEmail[0]}
                          </FieldError>
                        ) : null}
                      </Field>
                    </div>

                    <Field
                      data-invalid={fieldErrors.customerNote ? true : undefined}
                    >
                      <FieldLabel htmlFor="customer-note">
                        Additional Note (Optional)
                      </FieldLabel>
                      <Textarea
                        id="customer-note"
                        name="customerNote"
                        placeholder="Special formatting, page range, or pickup instructions…"
                        value={customerNote}
                        disabled={formLocked}
                        aria-invalid={
                          fieldErrors.customerNote ? true : undefined
                        }
                        onChange={(event) => {
                          setCustomerNote(event.target.value);
                          clearFieldError("customerNote");
                          clearStaleInitiation();
                        }}
                        className="min-h-24 text-base md:text-sm"
                      />
                      {fieldErrors.customerNote?.[0] ? (
                        <FieldError>{fieldErrors.customerNote[0]}</FieldError>
                      ) : null}
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </CardContent>
            </Card>
          </div>
        </div>

        <PricingSummaryCard
          pricing={pricing}
          isSubmitting={isSubmitting}
          hasUploadProgress={Boolean(uploadProgress)}
          hasPendingInitiation={Boolean(pendingInitiation)}
          hasPendingAdvance={Boolean(pendingAdvance)}
          className={cn(!isLastStep ? "hidden lg:flex" : "")}
        />

        {/* Sticky Bottom Action Bar for Steps 1–2 on Mobile & Tablet */}
        {!isLastStep ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPriceSheetOpen(true)}
                className="flex min-h-11 flex-col items-start justify-center rounded-md px-1 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Est. Total</span>
                  <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-base font-bold text-foreground tabular-nums">
                    {formatPaiseToInr(pricing.totalAmountPaise)}
                  </span>
                  {pricing.requiresAdvance ? (
                    <span className="text-[11px] font-medium text-warning">
                      50% advance
                    </span>
                  ) : null}
                </span>
              </button>

              <div className="flex items-center gap-2">
                {safeStepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreviousStep}
                    className="h-11 px-4"
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={handleNextStep}
                  className="h-11 px-5"
                >
                  <span>Continue</span>
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </form>

      {/* Mobile & Tablet Price Breakdown Bottom Sheet */}
      <Sheet open={priceSheetOpen} onOpenChange={setPriceSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>Estimated Price Breakdown</SheetTitle>
            <SheetDescription>
              Final amount is verified when you submit.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <PricingBreakdownContent pricing={pricing} />
          </div>
        </SheetContent>
      </Sheet>

      {pendingAdvance ? (
        <MockCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          requestId={pendingAdvance.requestId}
          paymentType="advance"
          amountPaise={pendingAdvance.amountPaise}
          serviceName={service.name}
          onSuccess={handleAdvanceCheckoutSuccess}
        />
      ) : null}
    </>
  );
}
