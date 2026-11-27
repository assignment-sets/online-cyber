"use client";

import { useState } from "react";
import { AlertCircleIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { ShopStatusBadge } from "@/components/shared/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { extractApiError, formatDateTime, type ShopSettings } from "./admin-types";

interface ShopTabProps {
  shop: ShopSettings | null;
  loading: boolean;
  error: string | null;
  onShopUpdated: (shop: ShopSettings) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Shop Status & Public Contact Controls tab.
 */
export function ShopTab({
  shop,
  loading,
  error,
  onShopUpdated,
  onRefresh,
}: ShopTabProps) {
  const [isOpen, setIsOpen] = useState(shop?.is_open ?? true);
  const [phone, setPhone] = useState(shop?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(shop?.whatsapp ?? "");
  const [email, setEmail] = useState(shop?.email ?? "");
  const [address, setAddress] = useState(shop?.address ?? "");
  const [closedNotice, setClosedNotice] = useState(shop?.closed_notice ?? "");

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOpen,
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim(),
          address: address.trim(),
          closedNotice: closedNotice.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        shop?: ShopSettings;
        error?: string;
        fieldErrors?: Record<string, string[]>;
      } | null;

      if (!response.ok || !payload?.shop) {
        setSaveError(extractApiError(payload, "Failed to update shop settings."));
        return;
      }

      onShopUpdated(payload.shop);
      toast.success("Shop status and contact details saved.");
    } catch {
      setSaveError("Network error while saving shop settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Shop Status &amp; Public Contact</CardTitle>
            <CardDescription>
              Manage live availability and public storefront contact details.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={loading}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      {loading && !shop ? (
        <CardContent>
          <output
            aria-live="polite"
            aria-label="Loading shop settings"
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </output>
        </CardContent>
      ) : error && !shop ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Unable to load shop settings</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            {saveError ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>Save failed</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field
                orientation="horizontal"
                className="justify-between rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor="shop-is-open">
                      Storefront Availability
                    </FieldLabel>
                    <ShopStatusBadge isOpen={isOpen} />
                  </div>
                  <FieldDescription>
                    When closed, customers see the closed notice and orders are
                    flagged Submitted While Closed.
                  </FieldDescription>
                </div>
                <Switch
                  id="shop-is-open"
                  checked={isOpen}
                  onCheckedChange={setIsOpen}
                  disabled={isSaving}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="shop-phone">Phone</FieldLabel>
                  <Input
                    id="shop-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="shop-whatsapp">WhatsApp</FieldLabel>
                  <Input
                    id="shop-whatsapp"
                    name="whatsapp"
                    type="tel"
                    autoComplete="tel"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="shop-email">Email</FieldLabel>
                  <Input
                    id="shop-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="shop-address">Shop Address</FieldLabel>
                <Textarea
                  id="shop-address"
                  name="address"
                  autoComplete="street-address"
                  rows={2}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  disabled={isSaving}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="shop-closed-notice">
                  Closed Notice Banner
                </FieldLabel>
                <Textarea
                  id="shop-closed-notice"
                  name="closedNotice"
                  autoComplete="off"
                  rows={2}
                  value={closedNotice}
                  onChange={(event) => setClosedNotice(event.target.value)}
                  disabled={isSaving}
                  required
                />
                <FieldDescription>
                  Displayed prominently on the storefront when the shop is set
                  to CLOSED.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>

          <CardFooter className="mt-4 flex-wrap justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {shop ? `Last updated: ${formatDateTime(shop.updated_at)}` : ""}
            </span>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {isSaving ? "Saving…" : "Save Settings"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
