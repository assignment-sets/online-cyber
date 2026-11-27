"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { FulfillmentBadge } from "@/components/shared/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  extractApiError,
  formatPaiseToInr,
  parseServiceFormSchema,
  parseServicePricingRules,
  type ServiceRecord,
} from "./admin-types";
import { ServiceEditorDialog } from "./service-editor-dialog";

async function requestServicesList(): Promise<{
  services?: ServiceRecord[];
  error?: string;
}> {
  try {
    const response = await fetch("/api/admin/services", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      services?: ServiceRecord[];
      error?: string;
    } | null;

    if (!response.ok || !payload?.services) {
      return {
        error: extractApiError(payload, "Failed to load services."),
      };
    }

    return { services: payload.services };
  } catch {
    return { error: "Network error while loading services." };
  }
}

/**
 * Services & Pricing Configurator tab for creating, toggling, editing, and deleting services.
 */
export function ServicesTab() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(
    null
  );

  const [deleteTarget, setDeleteTarget] = useState<ServiceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await requestServicesList();
    if (result.services) {
      setServices(result.services);
    } else {
      setErrorMessage(result.error ?? "Failed to load services.");
      setServices([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void requestServicesList().then((result) => {
      if (!active) return;
      if (result.services) {
        setServices(result.services);
        setErrorMessage(null);
      } else {
        setErrorMessage(result.error ?? "Failed to load services.");
        setServices([]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function openCreateDialog() {
    setEditingService(null);
    setEditorSession((prev) => prev + 1);
    setEditorOpen(true);
  }

  function openEditDialog(service: ServiceRecord) {
    setEditingService(service);
    setEditorSession((prev) => prev + 1);
    setEditorOpen(true);
  }

  async function handleToggleActive(service: ServiceRecord, nextActive: boolean) {
    setTogglingId(service.id);
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = (await response.json().catch(() => null)) as {
        service?: ServiceRecord;
        error?: string;
      } | null;

      if (!response.ok || !payload?.service) {
        toast.error(
          extractApiError(payload, "Failed to update service visibility.")
        );
        return;
      }

      setServices((prev) =>
        prev.map((item) => (item.id === service.id ? payload.service! : item))
      );
      toast.success(
        nextActive
          ? `${service.name} enabled.`
          : `${service.name} disabled.`
      );
    } catch {
      toast.error("Network error while updating service status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/services/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(extractApiError(payload, "Failed to delete service."));
        return;
      }

      toast.success(`Deleted ${deleteTarget.name}.`);
      setDeleteTarget(null);
      await loadServices();
    } catch {
      toast.error("Network error while deleting service.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Services &amp; Pricing Configurator</CardTitle>
              <CardDescription>
                Manage offered services, base fees, dynamic pricing rules, and
                customer form schemas.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadServices()}
                disabled={loading}
              >
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                Refresh
              </Button>
              <Button size="sm" onClick={openCreateDialog}>
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Create Service
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Unable to load services</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : loading ? (
            <output
              aria-live="polite"
              aria-label="Loading services"
              className="flex flex-col gap-2"
            >
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </output>
          ) : services.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayersIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No services configured</EmptyTitle>
                <EmptyDescription>
                  Create your first cyber service to accept customer orders on
                  the storefront.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={openCreateDialog}>
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Create Service
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => {
                  const fieldCount = parseServiceFormSchema(
                    service.form_schema
                  ).length;
                  const ruleCount = parseServicePricingRules(
                    service.pricing_rules
                  ).length;

                  return (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{service.name}</span>
                          <span
                            translate="no"
                            className="font-mono text-xs text-muted-foreground"
                          >
                            /{service.slug}
                            {service.estimated_turnaround
                              ? ` • ${service.estimated_turnaround}`
                              : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatPaiseToInr(service.base_price_paise)}
                      </TableCell>
                      <TableCell>
                        <FulfillmentBadge
                          isCollectibleOnline={service.is_collectible_online}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {fieldCount} field{fieldCount === 1 ? "" : "s"} •{" "}
                        {ruleCount} rule{ruleCount === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            aria-label={`Toggle ${service.name} active`}
                            checked={service.is_active}
                            disabled={togglingId === service.id}
                            onCheckedChange={(checked) =>
                              void handleToggleActive(service, checked)
                            }
                          />
                          <Badge
                            variant={
                              service.is_active ? "success" : "secondary"
                            }
                          >
                            {service.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(service)}
                          >
                            <PencilIcon data-icon="inline-start" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget(service)}
                          >
                            <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ServiceEditorDialog
        key={`${editingService?.id ?? "new"}-${editorSession}`}
        open={editorOpen}
        service={editingService}
        onOpenChange={setEditorOpen}
        onSaved={() => void loadServices()}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>
              ? Services with existing work requests cannot be deleted and must
              be disabled instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
