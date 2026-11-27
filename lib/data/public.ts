import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import type { Database } from "@/lib/db/database.types";
import {
  FormFieldDefinitionSchema,
  PricingRuleDefinitionSchema,
  type FormFieldDefinition,
  type PricingRuleDefinition,
} from "@/lib/domain/service-schema";

export interface PublicShopSettings {
  isOpen: boolean;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  closedNotice: string;
  updatedAt: string;
}

export interface PublicService {
  id: string;
  slug: string;
  name: string;
  description: string;
  isCollectibleOnline: boolean;
  basePricePaise: number;
  estimatedTurnaround: string;
  displayOrder: number;
  formSchema: FormFieldDefinition[];
  pricingRules: PricingRuleDefinition[];
}

type ShopSettingsRow = Pick<
  Database["public"]["Tables"]["shop_settings"]["Row"],
  "is_open" | "phone" | "whatsapp" | "email" | "address" | "closed_notice" | "updated_at"
>;

type ServiceRow = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  | "id"
  | "slug"
  | "name"
  | "description"
  | "is_collectible_online"
  | "base_price_paise"
  | "estimated_turnaround"
  | "display_order"
  | "form_schema"
  | "pricing_rules"
>;

const FormSchemaArraySchema = z.array(FormFieldDefinitionSchema);
const PricingRulesArraySchema = z.array(PricingRuleDefinitionSchema);

function mapShopSettingsRow(row: ShopSettingsRow): PublicShopSettings {
  return {
    isOpen: row.is_open,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    address: row.address,
    closedNotice: row.closed_notice,
    updatedAt: row.updated_at,
  };
}

function mapServiceRow(row: ServiceRow): PublicService {
  const formSchema = FormSchemaArraySchema.parse(row.form_schema ?? []);
  const pricingRules = PricingRulesArraySchema.parse(row.pricing_rules ?? []);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isCollectibleOnline: row.is_collectible_online,
    basePricePaise: row.base_price_paise,
    estimatedTurnaround: row.estimated_turnaround,
    displayOrder: row.display_order,
    formSchema,
    pricingRules,
  };
}

const SERVICE_SELECT_COLUMNS =
  "id, slug, name, description, is_collectible_online, base_price_paise, estimated_turnaround, display_order, form_schema, pricing_rules";

/**
 * Fetches public shop status and contact information from `shop_settings` (`id = 1`).
 */
export async function getPublicShopSettings(): Promise<PublicShopSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shop_settings")
    .select("is_open, phone, whatsapp, email, address, closed_notice, updated_at")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to load shop settings: ${error?.message ?? "row not found"}`
    );
  }

  return mapShopSettingsRow(data);
}

/**
 * Fetches all active services ordered by `display_order` ascending, then `name` ascending.
 */
export async function getActiveServices(): Promise<PublicService[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_SELECT_COLUMNS)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active services: ${error.message}`);
  }

  return (data ?? []).map(mapServiceRow);
}

/**
 * Fetches a single active service by its unique slug, or `null` if not found / inactive.
 */
export async function getActiveServiceBySlug(
  slug: string
): Promise<PublicService | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_SELECT_COLUMNS)
    .eq("slug", normalizedSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load service "${normalizedSlug}": ${error.message}`
    );
  }

  return data ? mapServiceRow(data) : null;
}
