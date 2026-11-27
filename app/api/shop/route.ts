import { connection, NextResponse } from "next/server";
import { getPublicShopSettings } from "@/lib/data/public";
import { logger } from "@/lib/logger";

/**
 * GET /api/shop — Returns public shop open/closed status and contact details.
 */
export async function GET() {
  await connection();

  try {
    const shop = await getPublicShopSettings();
    return NextResponse.json({ shop }, { status: 200 });
  } catch (error) {
    logger.error("Failed to fetch public shop settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load shop settings." },
      { status: 500 }
    );
  }
}
