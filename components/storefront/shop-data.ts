import { cache } from "react";
import { connection } from "next/server";
import { getPublicShopSettings } from "@/lib/data/public";

/**
 * Request-scoped cached loader for public shop settings.
 * Defers to request time via `connection()` so Next.js 16 Cache Components
 * streams live DB data inside `<Suspense>` without duplicate per-request queries.
 */
export const getRequestShopSettings = cache(async () => {
  await connection();
  return getPublicShopSettings();
});
