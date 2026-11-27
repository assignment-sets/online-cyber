import Link from "next/link";
import { ArrowRightIcon, ClockIcon } from "lucide-react";
import { getFulfillmentMeta } from "@/components/shared/status-badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PublicService } from "@/lib/data/public";
import { formatPaiseToInr } from "@/lib/domain/service-schema";

/**
 * Catalog card for a single service on tablet and desktop grids.
 * The whole card is the link; meta is plain muted text so the service name and price carry the hierarchy.
 */
export function ServiceCard({ service }: { service: PublicService }) {
  const fulfillment = getFulfillmentMeta(service.isCollectibleOnline);
  const FulfillmentIcon = fulfillment.icon;

  return (
    <Link
      href={`/services/${service.slug}`}
      className="group/service block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-[box-shadow,background-color] group-hover/service:shadow-sm group-hover/service:ring-foreground/20">
        <CardHeader>
          <CardTitle className="text-pretty">{service.name}</CardTitle>
          {service.description ? (
            <CardDescription className="line-clamp-2">
              {service.description}
            </CardDescription>
          ) : null}
        </CardHeader>

        <CardContent className="mt-auto flex items-end justify-between gap-3">
          <ul className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {service.estimatedTurnaround ? (
              <li className="flex items-start gap-1.5">
                <ClockIcon
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span className="line-clamp-1">
                  {service.estimatedTurnaround}
                </span>
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              <FulfillmentIcon
                className="size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{fulfillment.label}</span>
            </li>
          </ul>

          <p className="flex shrink-0 flex-col items-end leading-tight">
            <span className="text-xs text-muted-foreground">from</span>
            <span className="font-heading text-lg font-semibold text-foreground tabular-nums">
              {formatPaiseToInr(service.basePricePaise)}
            </span>
          </p>
        </CardContent>

        <CardFooter className="justify-between bg-transparent py-3 text-sm font-medium text-primary">
          <span>Start Request</span>
          <ArrowRightIcon
            className="size-4 transition-transform motion-safe:group-hover/service:translate-x-0.5"
            aria-hidden="true"
          />
        </CardFooter>
      </Card>
    </Link>
  );
}
