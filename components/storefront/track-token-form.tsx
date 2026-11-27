"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TrackTokenFormProps {
  initialToken?: string;
  submitLabel?: string;
  compact?: boolean;
  placeholder?: string;
}

/**
 * Quick Work Token lookup form used on `/` and `/track` to navigate directly
 * to `/track/<TOKEN>`.
 */
export function TrackTokenForm({
  initialToken = "",
  submitLabel = "Check Status",
  compact = false,
  placeholder = "e.g. OC-7K9P3M…",
}: TrackTokenFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = tokenInput.trim().toUpperCase();

    if (!normalized) {
      setError("Enter your Work Token (for example, OC-7K9P3M).");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    router.push(`/track/${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel
            htmlFor={compact ? "work-token-lookup-compact" : "work-token-lookup"}
            className="sr-only"
          >
            Work Token
          </FieldLabel>
          <div
            className={cn(
              compact
                ? "flex items-center gap-2"
                : "flex flex-col gap-2 sm:flex-row"
            )}
          >
            <div className="relative flex-1 min-w-0">
              <Input
                ref={inputRef}
                id={compact ? "work-token-lookup-compact" : "work-token-lookup"}
                name="token"
                type="text"
                enterKeyHint="search"
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder={placeholder}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                className={cn(
                  "h-11 bg-background font-mono text-base tracking-wide uppercase placeholder:text-sm placeholder:normal-case placeholder:tracking-normal md:h-10 md:text-sm",
                  tokenInput ? "pr-10" : ""
                )}
              />
              {tokenInput ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear token"
                  onClick={() => {
                    setTokenInput("");
                    setError(null);
                    inputRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <Button
              type="submit"
              size="lg"
              className={cn(
                compact
                  ? "h-11 shrink-0 px-3.5"
                  : "h-11 w-full sm:h-10 sm:w-auto"
              )}
            >
              <span>{submitLabel}</span>
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      </FieldGroup>
    </form>
  );
}
