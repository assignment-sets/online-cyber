import { NextResponse } from "next/server";
import { z, ZodError, type ZodIssue } from "zod";
import { AuthError } from "@/lib/auth/session";
import {
  ServiceConfigSchema,
  type ServiceConfig,
} from "@/lib/domain/service-schema";
import { logger } from "@/lib/logger";

export type FieldErrors = Record<string, string[]>;

export interface IdRouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Error thrown when an incoming request payload or parameter is syntactically invalid.
 */
export class BadRequestError extends Error {
  public readonly fieldErrors?: FieldErrors;

  constructor(message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "BadRequestError";
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Parses a JSON request body and throws `BadRequestError` on malformed JSON or non-object payloads.
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Invalid JSON request body.");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  return body;
}

/**
 * Converts a `ZodError` into field-level error lists keyed by dot-joined field path.
 */
export function formatZodFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "_root";
    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }
    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

/**
 * Checks whether an error object from Supabase/PostgREST carries a specific Postgres error code.
 */
export function isPostgresErrorCode(
  error: { code?: string | null } | null | undefined,
  code: string
): boolean {
  return error?.code === code;
}

export const SERVICE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ServiceSlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required.")
  .max(100, "Slug cannot exceed 100 characters.")
  .regex(
    SERVICE_SLUG_REGEX,
    "Slug must contain lowercase alphanumeric words separated by single hyphens."
  );

/**
 * Validates combined `formSchema` and `pricingRules` via `ServiceConfigSchema`,
 * remapping error paths back to camelCase (`formSchema`, `pricingRules`) for API responses.
 */
export function validateServiceConfig(
  formSchema: unknown,
  pricingRules: unknown
): ServiceConfig {
  const result = ServiceConfigSchema.safeParse({
    form_schema: formSchema,
    pricing_rules: pricingRules,
  });

  if (!result.success) {
    const mappedIssues: ZodIssue[] = result.error.issues.map((issue) => {
      const [head, ...rest] = issue.path;
      const mappedHead =
        head === "form_schema"
          ? "formSchema"
          : head === "pricing_rules"
            ? "pricingRules"
            : head;
      return {
        ...issue,
        path: mappedHead !== undefined ? [mappedHead, ...rest] : issue.path,
      };
    });
    throw new ZodError(mappedIssues);
  }

  return result.data;
}

/**
 * Centralized error handler for all `/api/admin/*` route handlers.
 */
export function handleAdminRouteError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  if (err instanceof ZodError) {
    const fieldErrors = formatZodFieldErrors(err);
    const firstMessage = err.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json(
      {
        error: firstMessage,
        fieldErrors,
        details: err.issues,
      },
      { status: 400 }
    );
  }

  if (err instanceof BadRequestError) {
    return NextResponse.json(
      {
        error: err.message,
        ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
      },
      { status: 400 }
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error("Unhandled admin API route error", {
    error: message,
  });

  return NextResponse.json(
    { error: "Internal server error." },
    { status: 500 }
  );
}
