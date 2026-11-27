import { connection, NextRequest, NextResponse } from "next/server";
import { getActiveServiceBySlug } from "@/lib/data/public";
import { logger } from "@/lib/logger";

/**
 * GET /api/services/[slug] — Fetches a single active service configuration by slug.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  await connection();

  try {
    const { slug } = await context.params;
    const service = await getActiveServiceBySlug(slug);

    if (!service) {
      return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }

    return NextResponse.json({ service }, { status: 200 });
  } catch (error) {
    logger.error("Failed to fetch service by slug", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load service." },
      { status: 500 }
    );
  }
}
