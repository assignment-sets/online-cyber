"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  FORM_FIELD_TYPES,
  ServiceConfigSchema,
  type FormFieldDefinition,
  type FormFieldType,
  type PricingRuleDefinition,
} from "@/lib/domain/service-schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  extractApiError,
  keyifyLabel,
  parseServiceFormSchema,
  parseServicePricingRules,
  slugifyServiceName,
  type ServiceRecord,
} from "./admin-types";

const COMMON_MIME_OPTIONS = [
  { label: "PDF", mime: "application/pdf" },
  { label: "JPG", mime: "image/jpeg" },
  { label: "PNG", mime: "image/png" },
  {
    label: "DOCX",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
] as const;

const COMMON_MIME_SET = new Set<string>(
  COMMON_MIME_OPTIONS.map((item) => item.mime)
);

const FIELD_TYPE_ITEMS: Array<{ value: FormFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file", label: "File Upload" },
];

const RULE_TYPE_ITEMS: Array<{
  value: PricingRuleDefinition["type"];
  label: string;
}> = [
  { value: "per_unit", label: "Per Unit (Number field)" },
  { value: "option_surcharge", label: "Option Surcharge (Select field)" },
  { value: "boolean_surcharge", label: "Checkbox Surcharge (Checkbox field)" },
];

interface DraftField {
  uid: string;
  key: string;
  keyManuallyEdited: boolean;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  min: string;
  max: string;
  optionsText: string;
  selectedMimes: string[];
  customMimesText: string;
  maxFileSizeMb: string;
  maxFiles: string;
}

interface DraftPricingRule {
  uid: string;
  id: string;
  label: string;
  type: PricingRuleDefinition["type"];
  fieldKey: string;
  unitPriceInr: string;
  surchargeInr: string;
  optionSurchargesInr: Record<string, string>;
}

interface ServiceEditorDialogProps {
  open: boolean;
  service: ServiceRecord | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function makeUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function paiseToInrInput(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

function inrInputToPaise(raw: string): number | null {
  const num = Number(raw.trim());
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return Math.round(num * 100);
}

function parseOptionsText(raw: string): string[] {
  const separator = raw.includes("\n") ? /\r?\n/ : ",";
  return raw
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toDraftField(field: FormFieldDefinition): DraftField {
  const mimes = field.allowedMimeTypes ?? [];
  const selectedMimes = mimes.filter((m) => COMMON_MIME_SET.has(m));
  const customMimes = mimes.filter((m) => !COMMON_MIME_SET.has(m));
  const options = field.options ?? [];

  return {
    uid: makeUid(),
    key: field.key,
    keyManuallyEdited: true,
    label: field.label,
    type: FORM_FIELD_TYPES.includes(field.type) ? field.type : "text",
    required: Boolean(field.required),
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    min: field.min !== undefined ? String(field.min) : "",
    max: field.max !== undefined ? String(field.max) : "",
    optionsText: options.some((opt) => opt.includes(","))
      ? options.join("\n")
      : options.join(", "),
    selectedMimes:
      selectedMimes.length > 0
        ? selectedMimes
        : field.type === "file"
          ? []
          : ["application/pdf", "image/jpeg", "image/png"],
    customMimesText: customMimes.join(", "),
    maxFileSizeMb:
      field.maxFileSizeBytes !== undefined
        ? String(Number((field.maxFileSizeBytes / (1024 * 1024)).toFixed(2)))
        : "5",
    maxFiles: field.maxFiles !== undefined ? String(field.maxFiles) : "1",
  };
}

function createEmptyDraftField(index: number): DraftField {
  return {
    uid: makeUid(),
    key: `field_${index + 1}`,
    keyManuallyEdited: false,
    label: "",
    type: "text",
    required: true,
    placeholder: "",
    helpText: "",
    min: "",
    max: "",
    optionsText: "",
    selectedMimes: ["application/pdf", "image/jpeg", "image/png"],
    customMimesText: "",
    maxFileSizeMb: "5",
    maxFiles: "1",
  };
}

function toDraftRule(rule: PricingRuleDefinition): DraftPricingRule {
  if (rule.type === "per_unit") {
    return {
      uid: makeUid(),
      id: rule.id,
      label: rule.label,
      type: "per_unit",
      fieldKey: rule.fieldKey,
      unitPriceInr: paiseToInrInput(rule.unitPricePaise),
      surchargeInr: "0",
      optionSurchargesInr: {},
    };
  }
  if (rule.type === "boolean_surcharge") {
    return {
      uid: makeUid(),
      id: rule.id,
      label: rule.label,
      type: "boolean_surcharge",
      fieldKey: rule.fieldKey,
      unitPriceInr: "0",
      surchargeInr: paiseToInrInput(rule.surchargePaise),
      optionSurchargesInr: {},
    };
  }
  const optionSurchargesInr: Record<string, string> = {};
  for (const [opt, paise] of Object.entries(rule.optionSurchargesPaise)) {
    optionSurchargesInr[opt] = paiseToInrInput(paise);
  }
  return {
    uid: makeUid(),
    id: rule.id,
    label: rule.label,
    type: "option_surcharge",
    fieldKey: rule.fieldKey,
    unitPriceInr: "0",
    surchargeInr: "0",
    optionSurchargesInr,
  };
}

function expectedFieldTypeForRule(
  ruleType: PricingRuleDefinition["type"]
): FormFieldType {
  switch (ruleType) {
    case "per_unit":
      return "number";
    case "option_surcharge":
      return "select";
    case "boolean_surcharge":
      return "checkbox";
  }
}

/**
 * Create/Edit modal for configuring service metadata, dynamic form fields, and pricing rules.
 */
export function ServiceEditorDialog({
  open,
  service,
  onOpenChange,
  onSaved,
}: ServiceEditorDialogProps) {
  const isEditing = Boolean(service);

  const [name, setName] = useState(service?.name ?? "");
  const [slug, setSlug] = useState(service?.slug ?? "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    Boolean(service)
  );
  const [description, setDescription] = useState(service?.description ?? "");
  const [basePriceInr, setBasePriceInr] = useState(
    service ? paiseToInrInput(service.base_price_paise) : "50"
  );
  const [estimatedTurnaround, setEstimatedTurnaround] = useState(
    service?.estimated_turnaround ?? "Same day"
  );
  const [displayOrder, setDisplayOrder] = useState(
    service ? String(service.display_order) : "0"
  );
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [isCollectibleOnline, setIsCollectibleOnline] = useState(
    service?.is_collectible_online ?? true
  );

  const [fields, setFields] = useState<DraftField[]>(() =>
    service ? parseServiceFormSchema(service.form_schema).map(toDraftField) : []
  );
  const [rules, setRules] = useState<DraftPricingRule[]>(() =>
    service ? parseServicePricingRules(service.pricing_rules).map(toDraftRule) : []
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function updateField(uid: string, patch: Partial<DraftField>) {
    setFields((prev) =>
      prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item))
    );
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function removeField(uid: string) {
    setFields((prev) => prev.filter((item) => item.uid !== uid));
  }

  function addPricingRule() {
    const defaultType: PricingRuleDefinition["type"] = "per_unit";
    const matchingFields = fields.filter((f) => f.type === "number");
    const firstKey = matchingFields[0]?.key ?? "";
    setRules((prev) => [
      ...prev,
      {
        uid: makeUid(),
        id: `rule_${prev.length + 1}`,
        label: "",
        type: defaultType,
        fieldKey: firstKey,
        unitPriceInr: "0",
        surchargeInr: "0",
        optionSurchargesInr: {},
      },
    ]);
  }

  function updateRule(uid: string, patch: Partial<DraftPricingRule>) {
    setRules((prev) =>
      prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item))
    );
  }

  function removeRule(uid: string) {
    setRules((prev) => prev.filter((item) => item.uid !== uid));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const basePricePaise = inrInputToPaise(basePriceInr);
    if (basePricePaise === null) {
      setErrorMessage("Base price must be a non-negative INR amount.");
      return;
    }

    const parsedOrder = Number.parseInt(displayOrder.trim() || "0", 10);
    if (!Number.isFinite(parsedOrder)) {
      setErrorMessage("Display order must be an integer.");
      return;
    }

    const builtFields: FormFieldDefinition[] = [];
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      const base: FormFieldDefinition = {
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.placeholder.trim() ? { placeholder: f.placeholder.trim() } : {}),
        ...(f.helpText.trim() ? { helpText: f.helpText.trim() } : {}),
      };

      if (f.type === "number") {
        if (f.min.trim() !== "") {
          const minVal = Number(f.min.trim());
          if (!Number.isFinite(minVal)) {
            setErrorMessage(`Field "${f.label || f.key}": min must be a valid number.`);
            return;
          }
          base.min = minVal;
        }
        if (f.max.trim() !== "") {
          const maxVal = Number(f.max.trim());
          if (!Number.isFinite(maxVal)) {
            setErrorMessage(`Field "${f.label || f.key}": max must be a valid number.`);
            return;
          }
          base.max = maxVal;
        }
      }

      if (f.type === "select") {
        base.options = parseOptionsText(f.optionsText);
      }

      if (f.type === "file") {
        const customMimes = f.customMimesText
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0);
        base.allowedMimeTypes = Array.from(
          new Set([...f.selectedMimes, ...customMimes])
        );

        const mb = Number(f.maxFileSizeMb.trim());
        if (!Number.isFinite(mb) || mb <= 0) {
          setErrorMessage(
            `File field "${f.label || f.key}": Max file size (MB) must be positive.`
          );
          return;
        }
        base.maxFileSizeBytes = Math.round(mb * 1024 * 1024);

        const maxFiles = Number.parseInt(f.maxFiles.trim(), 10);
        if (!Number.isFinite(maxFiles) || maxFiles <= 0) {
          setErrorMessage(
            `File field "${f.label || f.key}": Max files must be a positive integer.`
          );
          return;
        }
        base.maxFiles = maxFiles;
      }

      builtFields.push(base);
    }

    const builtRules: PricingRuleDefinition[] = [];
    for (const r of rules) {
      if (r.type === "per_unit") {
        const unitPricePaise = inrInputToPaise(r.unitPriceInr);
        if (unitPricePaise === null) {
          setErrorMessage(
            `Pricing rule "${r.label || r.id}": Unit price must be a non-negative INR amount.`
          );
          return;
        }
        builtRules.push({
          id: r.id.trim(),
          label: r.label.trim(),
          type: "per_unit",
          fieldKey: r.fieldKey.trim(),
          unitPricePaise,
        });
      } else if (r.type === "boolean_surcharge") {
        const surchargePaise = inrInputToPaise(r.surchargeInr);
        if (surchargePaise === null) {
          setErrorMessage(
            `Pricing rule "${r.label || r.id}": Surcharge must be a non-negative INR amount.`
          );
          return;
        }
        builtRules.push({
          id: r.id.trim(),
          label: r.label.trim(),
          type: "boolean_surcharge",
          fieldKey: r.fieldKey.trim(),
          surchargePaise,
        });
      } else {
        const targetField = builtFields.find((f) => f.key === r.fieldKey.trim());
        const optionSurchargesPaise: Record<string, number> = {};
        const validOpts = targetField?.options ?? [];
        for (const opt of validOpts) {
          const rawInr = r.optionSurchargesInr[opt] ?? "0";
          const paise = inrInputToPaise(rawInr || "0");
          if (paise === null) {
            setErrorMessage(
              `Pricing rule "${r.label || r.id}": Invalid surcharge for option "${opt}".`
            );
            return;
          }
          optionSurchargesPaise[opt] = paise;
        }
        builtRules.push({
          id: r.id.trim(),
          label: r.label.trim(),
          type: "option_surcharge",
          fieldKey: r.fieldKey.trim(),
          optionSurchargesPaise,
        });
      }
    }

    const schemaCheck = ServiceConfigSchema.safeParse({
      form_schema: builtFields,
      pricing_rules: builtRules,
    });

    if (!schemaCheck.success) {
      setErrorMessage(
        schemaCheck.error.issues[0]?.message ?? "Invalid service configuration."
      );
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = isEditing
        ? `/api/admin/services/${service!.id}`
        : "/api/admin/services";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          basePricePaise,
          estimatedTurnaround: estimatedTurnaround.trim(),
          displayOrder: parsedOrder,
          isActive,
          isCollectibleOnline,
          formSchema: schemaCheck.data.form_schema,
          pricingRules: schemaCheck.data.pricing_rules,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        service?: ServiceRecord;
        error?: string;
        fieldErrors?: Record<string, string[]>;
      } | null;

      if (!response.ok) {
        setErrorMessage(
          extractApiError(payload, "Failed to save service configuration.")
        );
        return;
      }

      toast.success(isEditing ? "Service updated." : "Service created.");
      onOpenChange(false);
      onSaved();
    } catch {
      setErrorMessage("Network error while saving service.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit Service: ${service?.name}` : "Create New Service"}
          </DialogTitle>
          <DialogDescription>
            Configure base pricing, customer form fields, document upload
            constraints, and dynamic pricing rules.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Configuration error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="svc-name">Service Name</FieldLabel>
                <Input
                  id="svc-name"
                  autoComplete="off"
                  placeholder="e.g., PAN Card Correction"
                  value={name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setName(nextName);
                    if (!isEditing && !slugManuallyEdited) {
                      setSlug(slugifyServiceName(nextName));
                    }
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="svc-slug">Slug</FieldLabel>
                <Input
                  id="svc-slug"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="pan-card-correction"
                  value={slug}
                  onChange={(event) => {
                    setSlugManuallyEdited(true);
                    setSlug(event.target.value);
                  }}
                  required
                />
                <FieldDescription>
                  Lowercase letters, numbers, and single hyphens.
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="svc-description">Description</FieldLabel>
              <Textarea
                id="svc-description"
                autoComplete="off"
                rows={2}
                placeholder="Explain what this service covers and what documents are needed."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="svc-base-price">
                  Base Price (INR)
                </FieldLabel>
                <Input
                  id="svc-base-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={basePriceInr}
                  onChange={(event) => setBasePriceInr(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="svc-turnaround">
                  Estimated Turnaround
                </FieldLabel>
                <Input
                  id="svc-turnaround"
                  autoComplete="off"
                  placeholder="e.g., 2 hours / Same day"
                  value={estimatedTurnaround}
                  onChange={(event) =>
                    setEstimatedTurnaround(event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="svc-order">Display Order</FieldLabel>
                <Input
                  id="svc-order"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <Switch
                  id="svc-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="svc-active">Active on Storefront</FieldLabel>
                  <FieldDescription>
                    Disabled services are hidden from customers.
                  </FieldDescription>
                </div>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <Switch
                  id="svc-online"
                  checked={isCollectibleOnline}
                  onCheckedChange={setIsCollectibleOnline}
                />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="svc-online">
                    Collectible Online
                  </FieldLabel>
                  <FieldDescription>
                    When enabled, staff upload deliverables before completion.
                  </FieldDescription>
                </div>
              </Field>
            </div>
          </FieldGroup>

          <Separator />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Form Fields Builder ({fields.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Define the inputs and document upload slots customers complete.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFields((prev) => [...prev, createEmptyDraftField(prev.length)])
                }
              >
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Add Field
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No custom form fields configured. Customers will only provide
                contact details and optional notes.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <div
                    key={field.uid}
                    className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Field #{index + 1}</Badge>
                        <span
                          translate="no"
                          className="font-mono text-xs text-muted-foreground"
                        >
                          {field.key || "unnamed"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move field ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => moveField(index, -1)}
                        >
                          <ArrowUpIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move field ${index + 1} down`}
                          disabled={index === fields.length - 1}
                          onClick={() => moveField(index, 1)}
                        >
                          <ArrowDownIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove field ${index + 1}`}
                          onClick={() => removeField(field.uid)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <Field>
                        <FieldLabel htmlFor={`fld-label-${field.uid}`}>
                          Label
                        </FieldLabel>
                        <Input
                          id={`fld-label-${field.uid}`}
                          autoComplete="off"
                          placeholder="e.g., Page Count"
                          value={field.label}
                          onChange={(event) => {
                            const nextLabel = event.target.value;
                            updateField(field.uid, {
                              label: nextLabel,
                              ...(!field.keyManuallyEdited
                                ? { key: keyifyLabel(nextLabel) }
                                : {}),
                            });
                          }}
                          required
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`fld-key-${field.uid}`}>
                          Field Key
                        </FieldLabel>
                        <Input
                          id={`fld-key-${field.uid}`}
                          autoComplete="off"
                          spellCheck={false}
                          className="font-mono"
                          placeholder="page_count"
                          value={field.key}
                          onChange={(event) =>
                            updateField(field.uid, {
                              key: event.target.value,
                              keyManuallyEdited: true,
                            })
                          }
                          required
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`fld-type-${field.uid}`}>
                          Type
                        </FieldLabel>
                        <Select
                          items={FIELD_TYPE_ITEMS}
                          value={field.type}
                          onValueChange={(value) => {
                            if (!value) return;
                            updateField(field.uid, {
                              type: value as FormFieldType,
                            });
                          }}
                        >
                          <SelectTrigger
                            id={`fld-type-${field.uid}`}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {FIELD_TYPE_ITEMS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field
                        orientation="horizontal"
                        className="items-end pb-1"
                      >
                        <Switch
                          id={`fld-req-${field.uid}`}
                          checked={field.required}
                          onCheckedChange={(checked) =>
                            updateField(field.uid, { required: checked })
                          }
                        />
                        <FieldLabel htmlFor={`fld-req-${field.uid}`}>
                          Required
                        </FieldLabel>
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {field.type === "text" ||
                      field.type === "number" ||
                      field.type === "textarea" ? (
                        <Field>
                          <FieldLabel htmlFor={`fld-ph-${field.uid}`}>
                            Placeholder
                          </FieldLabel>
                          <Input
                            id={`fld-ph-${field.uid}`}
                            value={field.placeholder}
                            onChange={(event) =>
                              updateField(field.uid, {
                                placeholder: event.target.value,
                              })
                            }
                          />
                        </Field>
                      ) : null}
                      <Field>
                        <FieldLabel htmlFor={`fld-help-${field.uid}`}>
                          Help Text
                        </FieldLabel>
                        <Input
                          id={`fld-help-${field.uid}`}
                          value={field.helpText}
                          onChange={(event) =>
                            updateField(field.uid, {
                              helpText: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>

                    {field.type === "number" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Field>
                          <FieldLabel htmlFor={`fld-min-${field.uid}`}>
                            Min Value
                          </FieldLabel>
                          <Input
                            id={`fld-min-${field.uid}`}
                            type="number"
                            value={field.min}
                            onChange={(event) =>
                              updateField(field.uid, {
                                min: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`fld-max-${field.uid}`}>
                            Max Value
                          </FieldLabel>
                          <Input
                            id={`fld-max-${field.uid}`}
                            type="number"
                            value={field.max}
                            onChange={(event) =>
                              updateField(field.uid, {
                                max: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    ) : null}

                    {field.type === "select" ? (
                      <Field>
                        <FieldLabel htmlFor={`fld-opts-${field.uid}`}>
                          Options (comma- or newline-separated)
                        </FieldLabel>
                        <Textarea
                          id={`fld-opts-${field.uid}`}
                          rows={2}
                          placeholder="Standard, Express, Priority"
                          value={field.optionsText}
                          onChange={(event) =>
                            updateField(field.uid, {
                              optionsText: event.target.value,
                            })
                          }
                        />
                      </Field>
                    ) : null}

                    {field.type === "file" ? (
                      <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
                        <FieldSet>
                          <FieldLegend variant="label">
                            Allowed File Types
                          </FieldLegend>
                          <FieldGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {COMMON_MIME_OPTIONS.map((opt) => {
                              const checked = field.selectedMimes.includes(
                                opt.mime
                              );
                              const checkId = `fld-mime-${field.uid}-${opt.label}`;
                              return (
                                <Field
                                  key={opt.mime}
                                  orientation="horizontal"
                                >
                                  <Checkbox
                                    id={checkId}
                                    checked={checked}
                                    onCheckedChange={(isChecked) => {
                                      const next = isChecked
                                        ? Array.from(
                                            new Set([
                                              ...field.selectedMimes,
                                              opt.mime,
                                            ])
                                          )
                                        : field.selectedMimes.filter(
                                            (m) => m !== opt.mime
                                          );
                                      updateField(field.uid, {
                                        selectedMimes: next,
                                      });
                                    }}
                                  />
                                  <FieldLabel
                                    htmlFor={checkId}
                                    className="font-normal"
                                  >
                                    {opt.label}
                                  </FieldLabel>
                                </Field>
                              );
                            })}
                          </FieldGroup>
                        </FieldSet>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <Field>
                            <FieldLabel htmlFor={`fld-cmime-${field.uid}`}>
                              Extra MIME Types
                            </FieldLabel>
                            <Input
                              id={`fld-cmime-${field.uid}`}
                              autoComplete="off"
                              spellCheck={false}
                              placeholder="image/webp"
                              value={field.customMimesText}
                              onChange={(event) =>
                                updateField(field.uid, {
                                  customMimesText: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`fld-maxmb-${field.uid}`}>
                              Max File Size (MB)
                            </FieldLabel>
                            <Input
                              id={`fld-maxmb-${field.uid}`}
                              type="number"
                              inputMode="decimal"
                              min="0.1"
                              step="0.1"
                              value={field.maxFileSizeMb}
                              onChange={(event) =>
                                updateField(field.uid, {
                                  maxFileSizeMb: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`fld-maxfiles-${field.uid}`}>
                              Max Files
                            </FieldLabel>
                            <Input
                              id={`fld-maxfiles-${field.uid}`}
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={field.maxFiles}
                              onChange={(event) =>
                                updateField(field.uid, {
                                  maxFiles: event.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Pricing Rules Builder ({rules.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Add dynamic surcharges tied to number, select, or checkbox
                  form fields.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPricingRule}
              >
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Add Rule
              </Button>
            </div>

            {rules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No dynamic pricing rules. Service uses base price only.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {rules.map((rule, index) => {
                  const expectedType = expectedFieldTypeForRule(rule.type);
                  const compatibleFields = fields.filter(
                    (f) => f.type === expectedType && f.key.trim().length > 0
                  );
                  const fieldSelectItems =
                    compatibleFields.length > 0
                      ? compatibleFields.map((f) => ({
                          value: f.key.trim(),
                          label: f.label.trim()
                            ? `${f.label.trim()} (${f.key.trim()})`
                            : f.key.trim(),
                        }))
                      : [{ value: "__none__", label: `No ${expectedType} fields` }];

                  const selectedSelectField = fields.find(
                    (f) => f.key.trim() === rule.fieldKey.trim()
                  );
                  const selectFieldOptions =
                    rule.type === "option_surcharge" && selectedSelectField
                      ? parseOptionsText(selectedSelectField.optionsText)
                      : [];

                  return (
                    <div
                      key={rule.uid}
                      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline">Rule #{index + 1}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove pricing rule ${index + 1}`}
                          onClick={() => removeRule(rule.uid)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field>
                          <FieldLabel htmlFor={`rule-label-${rule.uid}`}>
                            Rule Label
                          </FieldLabel>
                          <Input
                            id={`rule-label-${rule.uid}`}
                            autoComplete="off"
                            placeholder="e.g., Extra Color Pages"
                            value={rule.label}
                            onChange={(event) =>
                              updateRule(rule.uid, { label: event.target.value })
                            }
                            required
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`rule-type-${rule.uid}`}>
                            Rule Type
                          </FieldLabel>
                          <Select
                            items={RULE_TYPE_ITEMS}
                            value={rule.type}
                            onValueChange={(value) => {
                              if (!value) return;
                              const nextType =
                                value as PricingRuleDefinition["type"];
                              const nextExpected =
                                expectedFieldTypeForRule(nextType);
                              const firstCompatible = fields.find(
                                (f) =>
                                  f.type === nextExpected &&
                                  f.key.trim().length > 0
                              );
                              updateRule(rule.uid, {
                                type: nextType,
                                fieldKey: firstCompatible?.key.trim() ?? "",
                              });
                            }}
                          >
                            <SelectTrigger
                              id={`rule-type-${rule.uid}`}
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                {RULE_TYPE_ITEMS.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`rule-field-${rule.uid}`}>
                            Target Field ({expectedType})
                          </FieldLabel>
                          <Select
                            items={fieldSelectItems}
                            value={
                              compatibleFields.some(
                                (f) => f.key.trim() === rule.fieldKey.trim()
                              )
                                ? rule.fieldKey.trim()
                                : "__none__"
                            }
                            onValueChange={(value) => {
                              if (!value || value === "__none__") return;
                              updateRule(rule.uid, { fieldKey: value });
                            }}
                          >
                            <SelectTrigger
                              id={`rule-field-${rule.uid}`}
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                {fieldSelectItems.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                    disabled={item.value === "__none__"}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      {rule.type === "per_unit" ? (
                        <Field className="max-w-xs">
                          <FieldLabel htmlFor={`rule-unit-${rule.uid}`}>
                            Price Per Unit (INR)
                          </FieldLabel>
                          <Input
                            id={`rule-unit-${rule.uid}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={rule.unitPriceInr}
                            onChange={(event) =>
                              updateRule(rule.uid, {
                                unitPriceInr: event.target.value,
                              })
                            }
                          />
                        </Field>
                      ) : null}

                      {rule.type === "boolean_surcharge" ? (
                        <Field className="max-w-xs">
                          <FieldLabel htmlFor={`rule-bool-${rule.uid}`}>
                            Surcharge When Checked (INR)
                          </FieldLabel>
                          <Input
                            id={`rule-bool-${rule.uid}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={rule.surchargeInr}
                            onChange={(event) =>
                              updateRule(rule.uid, {
                                surchargeInr: event.target.value,
                              })
                            }
                          />
                        </Field>
                      ) : null}

                      {rule.type === "option_surcharge" ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-xs font-medium">
                            Option Surcharges (INR)
                          </div>
                          {selectFieldOptions.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Select a target `select` field with options to
                              configure per-option surcharges.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              {selectFieldOptions.map((option) => (
                                <Field key={option}>
                                  <FieldLabel
                                    htmlFor={`rule-opt-${rule.uid}-${option}`}
                                  >
                                    {option}
                                  </FieldLabel>
                                  <Input
                                    id={`rule-opt-${rule.uid}-${option}`}
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={
                                      rule.optionSurchargesInr[option] ?? "0"
                                    }
                                    onChange={(event) =>
                                      updateRule(rule.uid, {
                                        optionSurchargesInr: {
                                          ...rule.optionSurchargesInr,
                                          [option]: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                </Field>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save Changes"
                  : "Create Service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
