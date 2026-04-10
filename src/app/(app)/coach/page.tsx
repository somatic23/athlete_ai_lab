import { auth } from "@/lib/auth/config";

export default async function CoachPage() {
  const session = await auth();

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-headline text-4xl font-bold text-primary">
          Willkommen, {session?.user?.name}
        </h1>
        <p className="mt-3 text-on-surface-variant">
          Dein AI Strength Coach ist bereit.
        </p>
        <div className="mt-6 h-px w-24 mx-auto bg-gradient-to-r from-primary-container to-secondary opacity-50" />
        <p className="mt-6 text-sm text-on-surface-variant">
          Phase 3 — AI Chat kommt als naechstes
        </p>
      </div>
    </div>
  );
}
