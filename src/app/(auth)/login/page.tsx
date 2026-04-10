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

const schema = z.object({
  email: z.string().email("Ungueltige E-Mail"),
  password: z.string().min(6, "Mindestens 6 Zeichen"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setServerError("E-Mail oder Passwort falsch");
    } else {
      router.push("/coach");
      router.refresh();
    }
  };

  return (
    <div className="rounded-xl bg-surface-container p-8">
      <h2 className="mb-1 font-headline text-xl font-semibold text-on-surface">
        Anmelden
      </h2>
      <p className="mb-6 text-sm text-on-surface-variant">
        Kein Account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Registrieren
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
          Anmelden
        </Button>
      </form>
    </div>
  );
}
