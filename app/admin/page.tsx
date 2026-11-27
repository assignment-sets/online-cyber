import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthError, requireStaff, type StaffSession } from "@/lib/auth/session";
import { AdminTerminal } from "@/components/admin/admin-terminal";
import { Skeleton } from "@/components/ui/skeleton";

function AdminTerminalSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Skeleton className="h-8 w-56" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6">
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}

async function AdminGate() {
  await connection();
  let staff: StaffSession | null = null;
  try {
    staff = await requireStaff();
  } catch (err) {
    if (!(err instanceof AuthError)) {
      throw err;
    }
  }

  if (!staff) {
    redirect("/admin/login");
  }

  return (
    <AdminTerminal
      staff={{
        staffId: staff.staffId,
        username: staff.username,
        role: staff.role,
      }}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminTerminalSkeleton />}>
      <AdminGate />
    </Suspense>
  );
}
