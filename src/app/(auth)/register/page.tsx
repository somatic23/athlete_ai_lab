"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    displayName: z.string().min(2, "Mindestens 2 Zeichen"),
    email: z.string().email("Ungueltige E-Mail"),
    password: z.string().min(6, "Mindestens 6 Zeichen"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwoerter stimmen nicht ueberein",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setServerError(
        err.error === "Email already registered"
          ? "Diese E-Mail ist bereits registriert"
          : "Registrierung fehlgeschlagen"
      );
      return;
    }

    // Auto-login after registration
    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    router.push("/onboarding");
    router.refresh();
  };

  return (
    <div className="rounded-xl bg-surface-container p-8">
      <h2 className="mb-1 font-headline text-xl font-semibold text-on-surface">
        Registrieren
      </h2>
      <p className="mb-6 text-sm text-on-surface-variant">
        Bereits registriert?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Anmelden
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          id="displayName"
          label="Name"
          placeholder="Max Mustermann"
          error={errors.displayName?.message}
          {...register("displayName")}
        />
        <Input
          id="email"
          type="email"
          label="E-Mail"
          placeholder="deine@email.de"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          id="password"
          type="password"
          label="Passwort"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register("password")}
        />
        <Input
          id="confirmPassword"
          type="password"
          label="Passwort bestaetigen"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        {serverError && (
          <p className="rounded-md bg-error-container/20 px-3 py-2 text-sm text-error">
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          isLoading={isSubmitting}
          className="mt-2 w-full"
        >
          Account erstellen
        </Button>
      </form>
    </div>
  );
}
