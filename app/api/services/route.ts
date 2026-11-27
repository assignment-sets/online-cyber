import { connection, NextResponse } from "next/server";
import { getActiveServices } from "@/lib/data/public";
import { logger } from "@/lib/logger";

/**
 * GET /api/services — Lists all active services with dynamic form schemas and pricing rules.
 */
export async function GET() {
  await connection();

  try {
    const services = await getActiveServices();
    return NextResponse.json({ services }, { status: 200 });
  } catch (error) {
    logger.error("Failed to fetch active services", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load services." },
      { status: 500 }
    );
  }
}
