import { revalidatePath, revalidateTag } from "next/cache";
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import type { Json } from "@/lib/db/database.types";
import {
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
  ServiceSlugSchema,
  validateServiceConfig,
} from "../_utils";

const CreateServiceBodySchema = z.object({
  slug: ServiceSlugSchema,
  name: z
    .string()
    .trim()
    .min(1, "Service name is required.")
    .max(120, "Service name cannot exceed 120 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters.")
    .default(""),
  isActive: z.boolean().default(true),
  isCollectibleOnline: z.boolean().default(true),
  basePricePaise: z
    .number()
    .int("basePricePaise must be an integer.")
    .nonnegative("basePricePaise cannot be negative."),
  estimatedTurnaround: z
    .string()
    .trim()
    .max(120, "Estimated turnaround cannot exceed 120 characters.")
    .default(""),
  displayOrder: z
    .number()
    .int("displayOrder must be an integer.")
    .default(0),
  formSchema: z.array(z.unknown()).default([]),
  pricingRules: z.array(z.unknown()).default([]),
});

/**
 * GET /api/admin/services
 * Returns all services (active + inactive) ordered by display_order asc, created_at asc.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await connection();
    await requireStaff();

    const supabase = getSupabaseAdmin();
    const { data: services, error } = await supabase
      .from("services")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list services: ${error.message}`);
    }

    return NextResponse.json({ services: services ?? [] }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}

/**
 * POST /api/admin/services
 * Validates and creates a new configurable cyber service.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireStaff();

    const body = await parseJsonBody(request);
    const parsed = CreateServiceBodySchema.parse(body);
    const validatedConfig = validateServiceConfig(
      parsed.formSchema,
      parsed.pricingRules
    );

    const supabase = getSupabaseAdmin();
    const { data: service, error } = await supabase
      .from("services")
      .insert({
        slug: parsed.slug,
        name: parsed.name,
        description: parsed.description,
        is_active: parsed.isActive,
        is_collectible_online: parsed.isCollectibleOnline,
        base_price_paise: parsed.basePricePaise,
        estimated_turnaround: parsed.estimatedTurnaround,
        display_order: parsed.displayOrder,
        form_schema: validatedConfig.form_schema as unknown as Json,
        pricing_rules: validatedConfig.pricing_rules as unknown as Json,
      })
      .select("*")
      .single();

    if (error) {
      if (isPostgresErrorCode(error, "23505")) {
        return NextResponse.json(
          {
            error: "A service with this slug already exists.",
            fieldErrors: { slug: ["A service with this slug already exists."] },
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to create service: ${error.message}`);
    }

    revalidatePath("/");
    revalidateTag("services", "max");

    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
