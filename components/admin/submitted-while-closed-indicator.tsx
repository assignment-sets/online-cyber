"use client";

import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Subtle inline info icon with hover/focus tooltip indicating an order was
 * submitted while the shop was closed.
 */
export function SubmittedWhileClosedIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label="Submitted while shop was closed"
        className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <InfoIcon className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Submitted while shop was closed</TooltipContent>
    </Tooltip>
  );
}
