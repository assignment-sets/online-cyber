import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";
import { getFulfillmentMeta } from "@/components/shared/status-badges";
import { AfterHoursAlert } from "@/components/storefront/after-hours-alert";
import { DynamicServiceForm } from "@/components/storefront/dynamic-service-form";
import { getRequestShopSettings } from "@/components/storefront/shop-data";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveServiceBySlug } from "@/lib/data/public";
import { formatPaiseToInr } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";

async function ServiceDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;

  const [service, shop] = await Promise.all([
    getActiveServiceBySlug(slug),
    getRequestShopSettings(),
  ]);

  if (!service) {
    notFound();
  }

  const fulfillment = getFulfillmentMeta(service.isCollectibleOnline);
  const FulfillmentIcon = fulfillment.icon;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 lg:max-w-none lg:gap-6">
      <div>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 h-10"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          All Services
        </Link>
      </div>

      {!shop.isOpen ? (
        <AfterHoursAlert closedNotice={shop.closedNotice} />
      ) : null}

      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          {service.name}
        </h1>
        {service.description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
            {service.description}
          </p>
        ) : null}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground sm:text-sm">
          <li>
            From{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatPaiseToInr(service.basePricePaise)}
            </span>
          </li>
          {service.estimatedTurnaround ? (
            <li className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{service.estimatedTurnaround}</span>
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <FulfillmentIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{fulfillment.label}</span>
          </li>
        </ul>
      </header>

      <DynamicServiceForm service={service} shopIsOpen={shop.isOpen} />
    </div>
  );
}

function ServiceDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 lg:max-w-none">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <div className="hidden lg:col-span-5 lg:block">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function ServiceRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<ServiceDetailSkeleton />}>
        <ServiceDetailContent params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
