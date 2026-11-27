import Link from "next/link";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { TrackTokenForm } from "@/components/storefront/track-token-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Check Status",
    body: "See whether your job is queued, in progress, or ready.",
  },
  {
    title: "Pay the Balance",
    body: "Settle anything remaining once the work is done.",
  },
  {
    title: "Collect",
    body: "Download your files or get pickup details.",
  },
] as const;

export default function TrackLookupPage() {
  return (
    <StorefrontShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="hidden md:block">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-balance">
              <h1>Track Your Request</h1>
            </CardTitle>
            <CardDescription>
              Enter the Work Token you got after submitting, like{" "}
              <span
                translate="no"
                className="font-mono font-medium text-foreground"
              >
                OC-7K9P3M
              </span>
              .
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <TrackTokenForm submitLabel="Track" />

            {/* Mobile: progressive disclosure so the lookup field stays focused */}
            <details className="group border-t pt-2 md:hidden">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
                <span>How Work Tokens Work</span>
                <ChevronDownIcon
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <ol className="flex flex-col gap-3 pt-2 pb-1 text-xs">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      <span className="text-muted-foreground tabular-nums">
                        {index + 1}.
                      </span>{" "}
                      {step.title}
                    </span>
                    <span className="text-pretty text-muted-foreground">
                      {step.body}
                    </span>
                  </li>
                ))}
              </ol>
            </details>

            {/* Tablet & Desktop: open 3-column guide */}
            <Separator className="hidden md:block" />

            <ol className="hidden grid-cols-3 gap-4 text-xs md:grid">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">
                    <span className="text-muted-foreground tabular-nums">
                      {index + 1}.
                    </span>{" "}
                    {step.title}
                  </span>
                  <span className="text-pretty text-muted-foreground">
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </StorefrontShell>
  );
}
