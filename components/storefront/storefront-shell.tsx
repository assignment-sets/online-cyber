import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import {
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  PrinterIcon,
  TicketIcon,
} from "lucide-react";
import { ShopStatusBadge } from "@/components/shared/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toTelHref, toWhatsAppHref } from "./format";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { getRequestShopSettings } from "./shop-data";

async function HeaderShopStatusBadge() {
  const shop = await getRequestShopSettings();

  return <ShopStatusBadge isOpen={shop.isOpen} />;
}

async function MobileBottomNavLoader() {
  const shop = await getRequestShopSettings();

  return <MobileBottomNav shop={shop} />;
}

async function FooterContactInfo() {
  const shop = await getRequestShopSettings();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex items-start gap-2.5">
        <PhoneIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Phone</span>
          <a
            href={toTelHref(shop.phone)}
            className="inline-block py-0.5 text-sm text-foreground underline-offset-4 hover:underline"
          >
            {shop.phone}
          </a>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <MessageCircleIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">WhatsApp</span>
          <a
            href={toWhatsAppHref(shop.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block py-0.5 text-sm text-foreground underline-offset-4 hover:underline"
          >
            {shop.whatsapp}
          </a>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <MailIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Email</span>
          <a
            href={`mailto:${shop.email}`}
            className="inline-block py-0.5 text-sm break-all text-foreground underline-offset-4 hover:underline"
          >
            {shop.email}
          </a>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <MapPinIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Address</span>
          <p className="py-0.5 text-sm text-foreground">{shop.address}</p>
        </div>
      </div>
    </div>
  );
}

function FooterContactSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/**
 * Shared mobile-first storefront layout with compact top bar, thumb-zone mobile bottom nav,
 * live shop status, and tablet/desktop contact footer.
 */
export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:ring-3 focus:ring-ring/50 focus:outline-none"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-13 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 md:h-14">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex min-h-10 items-center gap-2 rounded-md font-heading text-base font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <PrinterIcon className="size-3.5" aria-hidden="true" />
              </span>
              <span translate="no" className="truncate">
                onlineCyber
              </span>
            </Link>

            <span
              aria-hidden="true"
              className="hidden h-4 w-px bg-border md:inline-block"
            />
            <div className="hidden md:flex md:items-center">
              <Suspense fallback={<Skeleton className="h-4 w-14" />}>
                <HeaderShopStatusBadge />
              </Suspense>
            </div>
          </div>

          <div className="flex shrink-0 items-center md:hidden">
            <Suspense fallback={<Skeleton className="h-4 w-14" />}>
              <HeaderShopStatusBadge />
            </Suspense>
          </div>

          <nav
            aria-label="Customer navigation"
            className="hidden shrink-0 items-center gap-2 md:flex"
          >
            <Link
              href="/track"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "min-h-9"
              )}
            >
              <TicketIcon data-icon="inline-start" aria-hidden="true" />
              <span>Track a Token</span>
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:gap-8 md:px-6 md:py-8"
      >
        {children}
      </main>

      <footer className="hidden border-t md:block">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-heading text-sm font-medium text-foreground">
              Need Help or Lost Your Token?
            </h2>
            <p className="text-xs text-muted-foreground">
              Reach out with your phone or email and roughly when you submitted.
            </p>
          </div>

          <Suspense fallback={<FooterContactSkeleton />}>
            <FooterContactInfo />
          </Suspense>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Uploaded files are deleted 14 days after a job is completed or
            canceled.
          </p>
        </div>
      </footer>

      <Suspense fallback={null}>
        <MobileBottomNavLoader />
      </Suspense>
    </div>
  );
}
