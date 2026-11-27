"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HelpCircleIcon,
  LayoutGridIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  TicketIcon,
} from "lucide-react";
import { ShopStatusBadge } from "@/components/shared/status-badges";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PublicShopSettings } from "@/lib/data/public";
import { cn } from "@/lib/utils";
import { toTelHref, toWhatsAppHref } from "./format";

interface MobileBottomNavProps {
  shop: PublicShopSettings;
}

/**
 * Thumb-zone bottom navigation bar for `< md` viewports (`Services`, `Track`, `Help` sheet).
 * Hidden on `/services/[slug]` where the form's sticky action bar owns the bottom edge.
 */
export function MobileBottomNav({ shop }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);

  if (pathname?.startsWith("/services/")) {
    return null;
  }

  const isServicesActive = pathname === "/";
  const isTrackActive = pathname?.startsWith("/track") ?? false;

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          <Link
            href="/"
            aria-current={isServicesActive ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              isServicesActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGridIcon className="size-5" aria-hidden="true" />
            <span>Services</span>
          </Link>

          <Link
            href="/track"
            aria-current={isTrackActive ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              isTrackActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TicketIcon className="size-5" aria-hidden="true" />
            <span>Track</span>
          </Link>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              helpOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <HelpCircleIcon className="size-5" aria-hidden="true" />
            <span>Help</span>
          </button>
        </div>
      </nav>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="gap-1.5 pb-2">
            <div className="flex items-center gap-2.5 pr-8">
              <SheetTitle>Shop Help &amp; Contact</SheetTitle>
              <ShopStatusBadge isOpen={shop.isOpen} />
            </div>
            <SheetDescription>
              Lost your Work Token? Reach out with your phone or email and
              roughly when you submitted.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4">
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={toTelHref(shop.phone)}
                className="flex min-h-12 items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PhoneIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-semibold text-foreground">
                    Call Shop
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {shop.phone}
                  </span>
                </div>
              </a>

              <a
                href={toWhatsAppHref(shop.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/12 text-success">
                  <MessageCircleIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-semibold text-foreground">
                    WhatsApp
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {shop.whatsapp}
                  </span>
                </div>
              </a>
            </div>

            <div className="flex flex-col divide-y rounded-xl border bg-muted/25">
              <a
                href={`mailto:${shop.email}`}
                className="flex min-h-11 items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <MailIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span className="break-all text-foreground">
                    {shop.email}
                  </span>
                </div>
              </a>

              <div className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                <MapPinIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">
                    Shop Address
                  </span>
                  <span className="text-foreground">{shop.address}</span>
                </div>
              </div>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground">
              Uploaded files are deleted 14 days after a job is completed or
              canceled.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
