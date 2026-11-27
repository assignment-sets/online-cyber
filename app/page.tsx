import { Suspense } from "react";
import { connection } from "next/server";
import { AfterHoursAlert } from "@/components/storefront/after-hours-alert";
import { ServiceCatalog } from "@/components/storefront/service-catalog";
import { getRequestShopSettings } from "@/components/storefront/shop-data";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { TrackTokenForm } from "@/components/storefront/track-token-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveServices } from "@/lib/data/public";

async function LandingContent() {
  await connection();
  const [shop, services] = await Promise.all([
    getRequestShopSettings(),
    getActiveServices(),
  ]);

  return (
    <div className="flex flex-col gap-6 md:gap-9">
      <section aria-labelledby="hero-heading" className="flex flex-col gap-4 md:gap-5">
        {!shop.isOpen ? (
          <AfterHoursAlert closedNotice={shop.closedNotice} />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <h1
            id="hero-heading"
            className="font-heading text-xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl"
          >
            Skip the Counter. Send Your Job Online.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
            Pick a service, upload documents, and track progress with a Work
            Token.
          </p>
        </div>

        {/* Mobile: slim single-row quick-track strip */}
        <div className="md:hidden">
          <TrackTokenForm
            compact
            submitLabel="Track"
            placeholder="Have a token? e.g. OC-7K9P3M…"
          />
        </div>

        {/* Tablet & Desktop: horizontal lookup strip */}
        <div className="hidden flex-col gap-3 rounded-xl bg-muted/60 p-5 md:flex">
          <div className="flex flex-col gap-0.5">
            <h2
              id="quick-lookup-heading"
              className="font-heading text-sm font-medium text-foreground"
            >
              Already Submitted Something?
            </h2>
            <p className="text-xs text-muted-foreground">
              Enter your Work Token to check status, pay the balance, or
              download files.
            </p>
          </div>
          <TrackTokenForm />
        </div>
      </section>

      <ServiceCatalog services={services} />
    </div>
  );
}

function LandingContentSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:gap-9">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-3/4 max-w-md sm:h-8" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg md:h-28 md:rounded-xl" />
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-3">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function StorefrontHomePage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<LandingContentSkeleton />}>
        <LandingContent />
      </Suspense>
    </StorefrontShell>
  );
}
