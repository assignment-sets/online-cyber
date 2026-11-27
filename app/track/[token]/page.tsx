import { Suspense } from "react";
import { connection } from "next/server";
import { getRequestShopSettings } from "@/components/storefront/shop-data";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { TokenTracker } from "@/components/storefront/token-tracker";
import { Skeleton } from "@/components/ui/skeleton";

async function TokenTrackerLoader({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const [{ token }, shop] = await Promise.all([
    params,
    getRequestShopSettings(),
  ]);
  const decodedToken = decodeURIComponent(token);

  return (
    <TokenTracker
      initialToken={decodedToken}
      shopAddress={shop.address}
      shopPhone={shop.phone}
    />
  );
}

function TokenTrackerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

export default function TrackTokenResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<TokenTrackerSkeleton />}>
        <TokenTrackerLoader params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
