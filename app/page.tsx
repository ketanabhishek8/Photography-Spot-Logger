import MapExperience from "@/components/MapExperience";
import SetupGuide from "@/components/SetupGuide";
import { fetchSpots } from "@/lib/supabase/server";

// Spots change whenever someone logs one, so never serve a stale prerender.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const spots = await fetchSpots();

  // null means .env.local has not been filled in yet.
  if (spots === null) return <SetupGuide />;

  return (
    <main className="h-dvh">
      <MapExperience spots={spots} />
    </main>
  );
}
