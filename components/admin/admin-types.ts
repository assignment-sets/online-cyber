import {
  getPaymentStatusMeta,
  getRequestStatusMeta,
} from "@/components/shared/status-badges";
import type { BadgeVariant } from "@/components/ui/badge";
import type { Json, Tables } from "@/lib/db/database.types";
import type { StaffRole } from "@/lib/auth/token";
import type { WorkRequestStatus } from "@/lib/domain/retention";
import {
  formatPaiseToInr,
  type FormFieldDefinition,
  type PricingRuleDefinition,
} from "@/lib/domain/service-schema";

export { formatPaiseToInr };
export type { WorkRequestStatus };

export interface AdminStaffSession {
  staffId: string;
  username: string;
  role: StaffRole;
}

export type ShopSettings = Tables<"shop_settings">;
export type ServiceRecord = Tables<"services">;
export type WorkRequestRecord = Tables<"work_requests">;
export type PaymentRecord = Tables<"payments">;

export type RequestFileWithUrl = Tables<"request_files"> & {
  downloadUrl: string | null;
};

export interface PaymentWorkRequestSummary {
  token: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  total_amount_paise: number;
  advance_required_paise: number;
  amount_paid_paise: number;
  service_snapshot: Json;
}

export type PaymentWithRequest = PaymentRecord & {
  work_requests: PaymentWorkRequestSummary | null;
};

export interface StaffAccount {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface ApiErrorPayload {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Formats an ISO timestamp string for the staff terminal.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return iso;
  }
  return dateTimeFormatter.format(new Date(timestamp));
}

/**
 * Formats byte counts into human-readable file sizes.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Extracts service name and online-collectible flag from a request's `service_snapshot`.
 */
export function getSnapshotMeta(snapshot: Json | unknown): {
  name: string;
  isCollectibleOnline: boolean;
} {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { name: "Unknown Service", isCollectibleOnline: false };
  }
  const record = snapshot as Record<string, unknown>;
  const name =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name
      : "Unknown Service";
  const isCollectibleOnline =
    record.isCollectibleOnline === true || record.is_collectible_online === true;
  return { name, isCollectibleOnline };
}

/**
 * Maps a work request status string to a human label and semantic Badge variant.
 */
export function getRequestStatusBadge(status: string): {
  label: string;
  variant: NonNullable<BadgeVariant>;
} {
  return getRequestStatusMeta(status);
}

/**
 * Maps a payment status string to a human label and semantic Badge variant.
 */
export function getPaymentStatusBadge(status: string): {
  label: string;
  variant: NonNullable<BadgeVariant>;
} {
  return getPaymentStatusMeta(status);
}

/**
 * Extracts a clear user-facing error message from an admin JSON error payload.
 */
export function extractApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const data = payload as ApiErrorPayload;
  if (data.fieldErrors && typeof data.fieldErrors === "object") {
    const firstFieldMessages = Object.values(data.fieldErrors).flat();
    if (firstFieldMessages.length > 0 && firstFieldMessages[0]) {
      if (data.error && data.error !== firstFieldMessages[0]) {
        return `${data.error} (${firstFieldMessages[0]})`;
      }
      return firstFieldMessages[0];
    }
  }
  if (typeof data.error === "string" && data.error.trim().length > 0) {
    return data.error;
  }
  return fallback;
}

/**
 * Generates a URL-safe lowercase hyphenated slug from a service name.
 */
export function slugifyServiceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Generates a snake_case field key suggestion from a label.
 */
export function keyifyLabel(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) {
    return "field_1";
  }
  return /^[a-z]/.test(cleaned) ? cleaned : `f_${cleaned}`;
}

/**
 * Safely parses `services.form_schema` JSON into typed form field definitions.
 */
export function parseServiceFormSchema(raw: Json): FormFieldDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is FormFieldDefinition =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

/**
 * Safely parses `services.pricing_rules` JSON into typed pricing rule definitions.
 */
export function parseServicePricingRules(raw: Json): PricingRuleDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is PricingRuleDefinition =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}
