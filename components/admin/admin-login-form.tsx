"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, LockIcon } from "lucide-react";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Staff authentication form for the internal `/admin` terminal.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingUsername, setMissingUsername] = useState(false);
  const [missingPassword, setMissingPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setMissingUsername(false);
    setMissingPassword(false);

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage("Enter both your username and password.");
      setMissingUsername(!trimmedUsername);
      setMissingPassword(!password);
      if (!trimmedUsername) {
        usernameRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(
          payload?.error ?? "Invalid username or password."
        );
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setErrorMessage("Network error while signing in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="border-b bg-primary/4 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LockIcon className="size-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-balance">
              <h1>Staff Terminal Login</h1>
            </CardTitle>
            <CardDescription>
              Internal access for <span translate="no">onlineCyber</span> operators
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={missingUsername ? true : undefined}>
              <FieldLabel htmlFor="admin-username">Username</FieldLabel>
              <Input
                ref={usernameRef}
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                spellCheck={false}
                placeholder="operator"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (missingUsername) setMissingUsername(false);
                }}
                aria-invalid={missingUsername ? true : undefined}
                disabled={isSubmitting}
                required
              />
            </Field>
            <Field data-invalid={missingPassword ? true : undefined}>
              <FieldLabel htmlFor="admin-password">Password</FieldLabel>
              <Input
                ref={passwordRef}
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (missingPassword) setMissingPassword(false);
                }}
                aria-invalid={missingPassword ? true : undefined}
                disabled={isSubmitting}
                required
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {isSubmitting ? "Signing in…" : "Sign In"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
