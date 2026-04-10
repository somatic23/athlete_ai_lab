export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface">
      {/* Background ambient elements */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-10 blur-3xl"
        style={{ background: "var(--primary-container)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full opacity-5 blur-3xl"
        style={{ background: "var(--secondary)" }}
      />
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="mb-8 text-center">
          <h1 className="font-headline text-2xl font-bold tracking-tight text-primary">
            ATHLETE AI LAB
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
