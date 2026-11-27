import { revalidatePath, revalidateTag } from "next/cache";
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import type { TablesUpdate } from "@/lib/db/database.types";
import { handleAdminRouteError, parseJsonBody } from "../_utils";

const ShopSettingsUpdateSchema = z
  .object({
    isOpen: z.boolean().optional(),
    phone: z.string().trim().min(1, "Phone cannot be empty.").max(40).optional(),
    whatsapp: z
      .string()
      .trim()
      .min(1, "WhatsApp cannot be empty.")
      .max(40)
      .optional(),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .max(120)
      .optional(),
    address: z
      .string()
      .trim()
      .min(1, "Address cannot be empty.")
      .max(500)
      .optional(),
    closedNotice: z
      .string()
      .trim()
      .min(1, "Closed notice cannot be empty.")
      .max(500)
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one shop setting field must be provided.",
  });

/**
 * GET /api/admin/shop
 * Fetches the singleton shop settings row (id = 1).
 */
export async function GET(): Promise<NextResponse> {
  try {
    await connection();
    await requireStaff();

    const supabase = getSupabaseAdmin();
    const { data: shop, error } = await supabase
      .from("shop_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch shop settings: ${error.message}`);
    }

    if (!shop) {
      return NextResponse.json(
        { error: "Shop settings not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ shop }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}

/**
 * PATCH /api/admin/shop
 * Updates storefront open/closed status and public contact details.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await requireStaff();

    const body = await parseJsonBody(request);
    const parsed = ShopSettingsUpdateSchema.parse(body);

    const updates: TablesUpdate<"shop_settings"> = {};
    if (parsed.isOpen !== undefined) updates.is_open = parsed.isOpen;
    if (parsed.phone !== undefined) updates.phone = parsed.phone;
    if (parsed.whatsapp !== undefined) updates.whatsapp = parsed.whatsapp;
    if (parsed.email !== undefined) updates.email = parsed.email;
    if (parsed.address !== undefined) updates.address = parsed.address;
    if (parsed.closedNotice !== undefined) {
      updates.closed_notice = parsed.closedNotice;
    }

    const supabase = getSupabaseAdmin();
    const { data: shop, error } = await supabase
      .from("shop_settings")
      .update(updates)
      .eq("id", 1)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update shop settings: ${error.message}`);
    }

    if (!shop) {
      return NextResponse.json(
        { error: "Shop settings not found." },
        { status: 404 }
      );
    }

    revalidatePath("/");
    revalidateTag("shop-settings", "max");

    return NextResponse.json({ shop }, { status: 200 });
  } catch (err) {
    return handleAdminRouteError(err);
  }
}
