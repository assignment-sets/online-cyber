"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  FolderOpenIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { getFulfillmentMeta } from "@/components/shared/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PublicService } from "@/lib/data/public";
import { formatPaiseToInr } from "@/lib/domain/service-schema";
import { cn } from "@/lib/utils";
import { ServiceCard } from "./service-card";

type FulfillmentFilter = "all" | "digital" | "pickup";

interface ServiceCatalogProps {
  services: PublicService[];
}

/**
 * Responsive service catalog:
 * - Mobile (`< md`): Search + Select bottom sheet picker, 1-tap quick-pick chips,
 *   and a single focused preview card so users never scroll a tall wall of cards.
 * - Tablet & Desktop (`md+`): Searchable 2-column / 3-column grid.
 */
export function ServiceCatalog({ services }: ServiceCatalogProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    () => services[0]?.slug ?? ""
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] =
    useState<FulfillmentFilter>("all");

  const hasBothFulfillmentTypes = useMemo(() => {
    const hasDigital = services.some((s) => s.isCollectibleOnline);
    const hasPickup = services.some((s) => !s.isCollectibleOnline);
    return hasDigital && hasPickup;
  }, [services]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return services.filter((service) => {
      if (fulfillmentFilter === "digital" && !service.isCollectibleOnline) {
        return false;
      }
      if (fulfillmentFilter === "pickup" && service.isCollectibleOnline) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query)
      );
    });
  }, [services, searchQuery, fulfillmentFilter]);

  const selectedService = useMemo(() => {
    return (
      services.find((service) => service.slug === selectedSlug) ?? services[0]
    );
  }, [services, selectedSlug]);

  if (services.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpenIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No Active Services Right Now</EmptyTitle>
          <EmptyDescription>
            Check back shortly or contact the shop directly for help.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const quickPickServices = services.slice(0, 6);
  const hasMoreThanQuickPick = services.length > 6;
  const selectedFulfillment = selectedService
    ? getFulfillmentMeta(selectedService.isCollectibleOnline)
    : null;
  const SelectedFulfillmentIcon = selectedFulfillment?.icon;

  return (
    <section aria-labelledby="services-heading" className="flex flex-col gap-4">
      {/* Mobile: Search & Select trigger + Quick-pick chips + Single focused preview */}
      <div className="flex flex-col gap-3.5 md:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="services-heading-mobile"
            className="font-heading text-base font-semibold tracking-tight text-foreground"
          >
            Choose a Service
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {services.length} available
          </span>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border bg-background px-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <SearchIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium text-foreground">
              {selectedService
                ? selectedService.name
                : "Search or select a service…"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
            <span>Change</span>
            <ChevronsUpDownIcon className="size-3.5" aria-hidden="true" />
          </span>
        </button>

        {services.length > 1 ? (
          <ul
            aria-label="Quick service switcher"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {quickPickServices.map((service) => {
              const isSelected = selectedService?.slug === service.slug;
              return (
                <li key={service.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSlug(service.slug)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {service.name}
                  </button>
                </li>
              );
            })}
            {hasMoreThanQuickPick ? (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="min-h-9 rounded-full border border-dashed border-border bg-background px-3 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  More…
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {selectedService && selectedFulfillment && SelectedFulfillmentIcon ? (
          <Card>
            <CardHeader className="gap-1.5">
              <CardTitle className="text-lg font-semibold text-pretty">
                {selectedService.name}
              </CardTitle>
              {selectedService.description ? (
                <CardDescription className="text-sm leading-relaxed text-pretty">
                  {selectedService.description}
                </CardDescription>
              ) : null}
            </CardHeader>

            <CardContent className="flex items-end justify-between gap-3">
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
                {selectedService.estimatedTurnaround ? (
                  <li className="flex items-center gap-1.5">
                    <ClockIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{selectedService.estimatedTurnaround}</span>
                  </li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <SelectedFulfillmentIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{selectedFulfillment.label}</span>
                </li>
              </ul>

              <p className="flex shrink-0 flex-col items-end leading-tight">
                <span className="text-xs text-muted-foreground">from</span>
                <span className="font-heading text-xl font-semibold text-foreground tabular-nums">
                  {formatPaiseToInr(selectedService.basePricePaise)}
                </span>
              </p>
            </CardContent>

            <CardFooter className="bg-transparent pt-0 pb-4">
              <Link
                href={`/services/${selectedService.slug}`}
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "h-12 w-full text-base font-medium"
                )}
              >
                <span>Start Request</span>
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>
        ) : null}

        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[80dvh] flex-col gap-0 overscroll-contain rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="gap-3 border-b p-4 pb-3">
              <div className="pr-8">
                <SheetTitle>Select a Service</SheetTitle>
                <SheetDescription className="sr-only">
                  Search and pick a service to preview and start a request.
                </SheetDescription>
              </div>

              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label="Search services"
                  placeholder="Search services…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-11 pr-10 pl-9 text-base"
                />
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery("")}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                ) : null}
              </div>

              {hasBothFulfillmentTypes ? (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { value: "all", label: "All" },
                      { value: "digital", label: "Digital delivery" },
                      { value: "pickup", label: "Pickup at shop" },
                    ] as const
                  ).map((option) => {
                    const active = fulfillmentFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFulfillmentFilter(option.value)}
                        className={cn(
                          "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-2 py-1">
              {filteredServices.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyTitle>No Matching Services</EmptyTitle>
                    <EmptyDescription>
                      Try a different search term or reset the filter.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setFulfillmentFilter("all");
                      }}
                    >
                      Clear Search
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="divide-y">
                  {filteredServices.map((service) => {
                    const fulfillment = getFulfillmentMeta(
                      service.isCollectibleOnline
                    );
                    const isSelected = selectedService?.slug === service.slug;

                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-label={`${service.name}, from ${formatPaiseToInr(service.basePricePaise)}`}
                        onClick={() => {
                          setSelectedSlug(service.slug);
                          setPickerOpen(false);
                        }}
                        className={cn(
                          "flex min-h-15 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                          isSelected ? "bg-primary/5" : ""
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <span className="truncate">{service.name}</span>
                            {isSelected ? (
                              <CheckIcon
                                className="size-3.5 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {service.estimatedTurnaround
                              ? `${service.estimatedTurnaround} · ${fulfillment.label}`
                              : fulfillment.label}
                          </span>
                        </span>

                        <span className="flex shrink-0 flex-col items-end leading-tight">
                          <span className="text-[11px] text-muted-foreground">
                            from
                          </span>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPaiseToInr(service.basePricePaise)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Tablet & Desktop: Searchable 2-col / 3-col Grid */}
      <div className="hidden md:flex md:flex-col md:gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2
              id="services-heading"
              className="font-heading text-lg font-semibold tracking-tight text-foreground"
            >
              Services
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredServices.length} available
            </span>
          </div>

          <div className="relative w-64">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search services"
              placeholder="Search services…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 pr-8 pl-8 text-sm"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              >
                <XIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {filteredServices.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No Matching Services</EmptyTitle>
              <EmptyDescription>
                No services match &ldquo;{searchQuery.trim()}&rdquo;.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
              >
                Clear Search
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {filteredServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
