export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-headline text-6xl font-bold tracking-tight text-primary">
          ATHLETE AI LAB
        </h1>
        <p className="max-w-md text-lg text-on-surface-variant">
          Your AI-powered Strength Coach
        </p>
        <div className="mt-8 h-1 w-24 rounded-full bg-gradient-to-r from-primary-container to-secondary" />
      </div>
    </div>
  );
}
