"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
  formatDateTime,
  type StaffAccount,
} from "./admin-types";

interface StaffTabProps {
  currentStaffId: string;
}

async function requestStaffAccounts(): Promise<{
  staff?: StaffAccount[];
  error?: string;
}> {
  try {
    const response = await fetch("/api/admin/staff", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      staff?: StaffAccount[];
      error?: string;
    } | null;

    if (!response.ok || !payload?.staff) {
      return {
        error: extractApiError(payload, "Failed to load staff accounts."),
      };
    }

    return { staff: payload.staff };
  } catch {
    return { error: "Network error while loading staff accounts." };
  }
}

/**
 * Owner-only Staff Management tab to list, create, and remove Admin operator accounts.
 */
export function StaffTab({ currentStaffId }: StaffTabProps) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await requestStaffAccounts();
    if (result.staff) {
      setAccounts(result.staff);
    } else {
      setLoadError(result.error ?? "Failed to load staff accounts.");
      setAccounts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void requestStaffAccounts().then((result) => {
      if (!active) return;
      if (result.staff) {
        setAccounts(result.staff);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? "Failed to load staff accounts.");
        setAccounts([]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreateAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        staff?: StaffAccount;
        error?: string;
        fieldErrors?: Record<string, string[]>;
      } | null;

      if (!response.ok || !payload?.staff) {
        setCreateError(
          extractApiError(payload, "Failed to create admin account.")
        );
        return;
      }

      toast.success(`Admin account "${payload.staff.username}" created.`);
      setUsername("");
      setPassword("");
      await loadStaff();
    } catch {
      setCreateError("Network error while creating admin account.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/staff/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(
          extractApiError(payload, "Failed to delete admin account.")
        );
        return;
      }

      toast.success(`Removed admin "${deleteTarget.username}".`);
      setDeleteTarget(null);
      await loadStaff();
    } catch {
      toast.error("Network error while deleting admin account.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle>Create Admin Account</CardTitle>
          <CardDescription>
            Issue credentials for a new operator. Owners can remove admins at
            any time.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleCreateAdmin}>
          <CardContent className="flex flex-col gap-4">
            {createError ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>Unable to create admin</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="staff-new-username">Username</FieldLabel>
                <Input
                  id="staff-new-username"
                  name="newUsername"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="desk_operator"
                  minLength={3}
                  maxLength={40}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isCreating}
                  required
                />
                <FieldDescription>
                  3–40 characters; letters, numbers, dots, underscores, or
                  hyphens.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-new-password">Password</FieldLabel>
                <Input
                  id="staff-new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isCreating}
                  required
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-4">
            <Button type="submit" className="w-full" disabled={isCreating}>
              {isCreating ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {isCreating ? "Creating…" : "Create Admin"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="min-w-0 lg:col-span-8">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Staff Accounts</CardTitle>
              <CardDescription>
                Active owner and admin accounts for this terminal.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadStaff()}
              disabled={loading}
            >
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Unable to load staff accounts</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : loading ? (
            <output
              aria-live="polite"
              aria-label="Loading staff accounts"
              className="flex flex-col gap-2"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </output>
          ) : accounts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No staff accounts found</EmptyTitle>
                <EmptyDescription>
                  Use the Create Admin form to add an operator.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isOwner = account.role === "owner";
                  const isSelf = account.id === currentStaffId;
                  return (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        {account.username}
                        {isSelf ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isOwner ? "default" : "info"}>
                          {account.role.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={account.is_active ? "success" : "destructive"}
                        >
                          {account.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(account.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isOwner || isSelf}
                          onClick={() => setDeleteTarget(account)}
                        >
                          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
            <AlertDialogTitle>Delete Admin Account</AlertDialogTitle>
            <AlertDialogDescription>
              Remove access for{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.username}
              </span>
              ? They will immediately lose access to `/admin`.
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
              {isDeleting ? "Deleting…" : "Delete Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
