"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  InboxIcon,
  LayersIcon,
  LogOutIcon,
  ReceiptIndianRupeeIcon,
  ShieldCheckIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  extractApiError,
  type AdminStaffSession,
  type ShopSettings,
} from "./admin-types";
import { PaymentsTab } from "./payments-tab";
import { QueueTab } from "./queue-tab";
import { ServicesTab } from "./services-tab";
import { ShopTab } from "./shop-tab";
import { StaffTab } from "./staff-tab";

interface AdminTerminalProps {
  staff: AdminStaffSession;
}

async function requestShopSettings(): Promise<{
  shop?: ShopSettings;
  error?: string;
}> {
  try {
    const response = await fetch("/api/admin/shop", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      shop?: ShopSettings;
      error?: string;
    } | null;

    if (!response.ok || !payload?.shop) {
      return {
        error: extractApiError(payload, "Failed to load shop status."),
      };
    }
    return { shop: payload.shop };
  } catch {
    return { error: "Network error while loading shop status." };
  }
}

/**
 * Main interactive shell for `/admin` staff terminal with live shop toggle and role-scoped tabs.
 */
export function AdminTerminal({ staff }: AdminTerminalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("queue");

  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [togglingShop, setTogglingShop] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadShop = useCallback(async () => {
    setShopLoading(true);
    setShopError(null);
    const result = await requestShopSettings();
    if (result.shop) {
      setShop(result.shop);
    } else {
      setShopError(result.error ?? "Failed to load shop status.");
    }
    setShopLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void requestShopSettings().then((result) => {
      if (!active) return;
      if (result.shop) {
        setShop(result.shop);
        setShopError(null);
      } else {
        setShopError(result.error ?? "Failed to load shop status.");
      }
      setShopLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleQuickToggleShop() {
    if (!shop) return;
    const nextIsOpen = !shop.is_open;
    setTogglingShop(true);
    try {
      const response = await fetch("/api/admin/shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: nextIsOpen }),
      });

      const payload = (await response.json().catch(() => null)) as {
        shop?: ShopSettings;
        error?: string;
      } | null;

      if (!response.ok || !payload?.shop) {
        toast.error(extractApiError(payload, "Failed to toggle shop status."));
        return;
      }

      setShop(payload.shop);
      toast.success(
        payload.shop.is_open
          ? "Shop is open. Customers will see you as open."
          : "Shop is closed. New requests will be marked after-hours."
      );
    } catch {
      toast.error("Network error while toggling shop status.");
    } finally {
      setTogglingShop(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch {
      toast.error("Failed to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const isOwner = staff.role === "owner";

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:ring-3 focus:ring-ring/50 focus:outline-none"
      >
        Skip to main content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-4" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col">
              <h1
                translate="no"
                className="font-heading text-sm font-semibold tracking-tight text-balance"
              >
                onlineCyber Staff Terminal
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {staff.username}
                <span aria-hidden="true"> · </span>
                <span className="capitalize">{staff.role}</span>
              </p>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            {shop ? (
              <label
                htmlFor="header-shop-toggle"
                className="flex h-8 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm select-none has-disabled:cursor-progress"
              >
                <Switch
                  id="header-shop-toggle"
                  checked={shop.is_open}
                  disabled={togglingShop}
                  onCheckedChange={() => void handleQuickToggleShop()}
                  className="data-checked:bg-success"
                />
                <span
                  aria-live="polite"
                  className={cn(
                    "min-w-[5.5rem] font-medium",
                    shop.is_open ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {shop.is_open ? "Shop Open" : "Shop Closed"}
                </span>
              </label>
            ) : shopLoading ? (
              <Skeleton className="h-8 w-36 rounded-lg" />
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LogOutIcon data-icon="inline-start" aria-hidden="true" />
              )}
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main
        id="admin-main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-6"
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value) setActiveTab(value);
          }}
          className="gap-4"
        >
          <TabsList className="h-auto min-h-8 w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto sm:w-fit">
            <TabsTrigger value="queue">
              <InboxIcon data-icon="inline-start" aria-hidden="true" />
              Work Queue
            </TabsTrigger>
            <TabsTrigger value="services">
              <LayersIcon data-icon="inline-start" aria-hidden="true" />
              Services &amp; Pricing
            </TabsTrigger>
            <TabsTrigger value="shop">
              <StoreIcon data-icon="inline-start" aria-hidden="true" />
              Shop &amp; Contact
            </TabsTrigger>
            <TabsTrigger value="payments">
              <ReceiptIndianRupeeIcon
                data-icon="inline-start"
                aria-hidden="true"
              />
              Payments &amp; Tokens
            </TabsTrigger>
            {isOwner ? (
              <TabsTrigger value="staff">
                <UsersIcon data-icon="inline-start" aria-hidden="true" />
                Staff
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="queue" className="min-w-0">
            <QueueTab />
          </TabsContent>

          <TabsContent value="services" className="min-w-0">
            <ServicesTab />
          </TabsContent>

          <TabsContent value="shop" className="min-w-0">
            <ShopTab
              key={shop?.updated_at ?? "shop-loading"}
              shop={shop}
              loading={shopLoading}
              error={shopError}
              onShopUpdated={setShop}
              onRefresh={loadShop}
            />
          </TabsContent>

          <TabsContent value="payments" className="min-w-0">
            <PaymentsTab />
          </TabsContent>

          {isOwner ? (
            <TabsContent value="staff" className="min-w-0">
              <StaffTab currentStaffId={staff.staffId} />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
}
