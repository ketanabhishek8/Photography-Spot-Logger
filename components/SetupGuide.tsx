/**
 * Shown instead of the map when .env.local has not been filled in yet, so a
 * fresh clone renders something useful rather than a stack trace.
 */
export default function SetupGuide() {
  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: "Create a Supabase project",
      body: (
        <>
          Sign in at{" "}
          <a className="underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            supabase.com/dashboard
          </a>{" "}
          and create a new project.
        </>
      ),
    },
    {
      title: "Run the schema",
      body: (
        <>
          Open the SQL Editor and run the contents of{" "}
          <code className="rounded bg-accent-soft px-1 py-0.5 text-xs">supabase/schema.sql</code>.
        </>
      ),
    },
    {
      title: "Create the storage bucket",
      body: (
        <>
          Storage &rarr; New bucket, named{" "}
          <code className="rounded bg-accent-soft px-1 py-0.5 text-xs">spot-photos</code>, marked{" "}
          <strong>public</strong>.
        </>
      ),
    },
    {
      title: "Add your keys",
      body: (
        <>
          Copy <code className="rounded bg-accent-soft px-1 py-0.5 text-xs">.env.example</code> to{" "}
          <code className="rounded bg-accent-soft px-1 py-0.5 text-xs">.env.local</code> and paste in
          the project URL, anon key and service-role key from Settings &rarr; API Keys.
        </>
      ),
    },
    {
      title: "Seed the Mumbai spots",
      body: (
        <code className="mt-1 block rounded bg-ink px-3 py-2 text-xs text-paper">
          node --env-file=.env.local scripts/seed.mjs
        </code>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Mumbai Photo Spots
      </h1>
      <p className="mt-2 text-sm text-muted">
        Almost there - the app just needs its Supabase project.
      </p>

      <ol className="mt-8 space-y-5">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
              {i + 1}
            </span>
            <div>
              <h2 className="text-sm font-medium text-ink">{step.title}</h2>
              <div className="mt-1 text-sm text-muted">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-xs text-muted">
        Restart the dev server after editing .env.local.
      </p>
    </main>
  );
}
