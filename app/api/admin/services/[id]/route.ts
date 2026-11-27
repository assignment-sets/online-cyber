import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import type { Json, TablesUpdate } from "@/lib/db/database.types";
import {
  BadRequestError,
  handleAdminRouteError,
  isPostgresErrorCode,
  parseJsonBody,
  ServiceSlugSchema,
  validateServiceConfig,
  type IdRouteContext,
} from "../../_utils";

const UpdateServiceBodySchema = z
  .object({
    slug: ServiceSlugSchema.optional(),
    name: z
      .string()
      .trim()
      .min(1, "Service name cannot be empty.")
      .max(120, "Service name cannot exceed 120 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters.")
      .optional(),
    isActive: z.boolean().optional(),
    isCollectibleOnline: z.boolean().optional(),
    basePricePaise: z
      .number()
      .int("basePricePaise must be an integer.")
      .nonnegative("basePricePaise cannot be negative.")
      .optional(),
    estimatedTurnaround: z
      .string()
      .trim()
      .max(120, "Estimated turnaround cannot exceed 120 characters.")
      .optional(),
    displayOrder: z
      .number()
      .int("displayOrder must be an integer.")
      .optional(),
    formSchema: z.array(z.unknown()).optional(),
    pricingRules: z.array(z.unknown()).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one service field must be provided to update.",
  });

/**
 * PATCH /api/admin/services/[id]
 * Updates a service and validates combined formSchema + pricingRules.
 */
export async function PATCH(
  request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    await requireStaff();
    const { id } = await context.params;
    const serviceId = id.trim();
    if (!serviceId) {
      throw new BadRequestError("Service ID is required.");
    }

    const body = await parseJsonBody(request);
    const parsed = UpdateServiceBodySchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await supabase
      .from("services")
      .select("id, form_schema, pricing_rules")
      .eq("id", serviceId)
      .maybeSingle();

    if (fetchError) {
      if (isPostgresErrorCode(fetchError, "22P02")) {
        throw new BadRequestError("Invalid service ID format.");
      }
      throw new Error(`Failed to fetch service: ${fetchError.message}`);
    }

    if (!existing) {
      return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }

    const updates: TablesUpdate<"services"> = {};
    if (parsed.slug !== undefined) updates.slug = parsed.slug;
    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.description !== undefined) {
      updates.description = parsed.description;
    }
    if (parsed.isActive !== undefined) updates.is_active = parsed.isActive;
    if (parsed.isCollectibleOnline !== undefined) {
      updates.is_collectible_online = parsed.isCollectibleOnline;
    }
    if (parsed.basePricePaise !== undefined) {
      updates.base_price_paise = parsed.basePricePaise;
    }
    if (parsed.estimatedTurnaround !== undefined) {
      updates.estimated_turnaround = parsed.estimatedTurnaround;
    }
    if (parsed.displayOrder !== undefined) {
      updates.display_order = parsed.displayOrder;
    }

    if (parsed.formSchema !== undefined || parsed.pricingRules !== undefined) {
      const combinedFormSchema = parsed.formSchema ?? existing.form_schema;
      const combinedPricingRules =
        parsed.pricingRules ?? existing.pricing_rules;
      const validatedConfig = validateServiceConfig(
        combinedFormSchema,
        combinedPricingRules
      );
      if (parsed.formSchema !== undefined) {
        updates.form_schema = validatedConfig.form_schema as unknown as Json;
      }
      if (parsed.pricingRules !== undefined) {
        updates.pricing_rules =
          validatedConfig.pricing_rules as unknown as Json;
      }
    }

    const { data: service, error: updateError } = await supabase
      .from("services")
      .update(updates)
      .eq("id", serviceId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      if (isPostgresErrorCode(updateError, "23505")) {
        return NextResponse.json(
          {
            error: "A service with this slug already exists.",
            fieldErrors: { slug: ["A service with this slug already exists."] },
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to update service: ${updateError.message}`);
    }

    if (!service) {
      return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }

    revalidatePath("/");
    revalidateTag("services", "max");

    return NextResponse.json({ service }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}

/**
 * DELETE /api/admin/services/[id]
 * Deletes a service unless existing work_requests reference it (409).
 */
export async function DELETE(
  _request: Request,
  context: IdRouteContext
): Promise<NextResponse> {
  try {
    await requireStaff();
    const { id } = await context.params;
    const serviceId = id.trim();
    if (!serviceId) {
      throw new BadRequestError("Service ID is required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: deleted, error } = await supabase
      .from("services")
      .delete()
      .eq("id", serviceId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isPostgresErrorCode(error, "22P02")) {
        throw new BadRequestError("Invalid service ID format.");
      }
      if (isPostgresErrorCode(error, "23503")) {
        return NextResponse.json(
          {
            error:
              "Service has existing work requests. Disable it instead of deleting.",
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to delete service: ${error.message}`);
    }

    if (!deleted) {
      return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }

    revalidatePath("/");
    revalidateTag("services", "max");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
