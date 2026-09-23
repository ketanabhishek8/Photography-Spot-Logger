import { cookies } from "next/headers";
import MapExperience from "@/components/MapExperience";
import SetupGuide from "@/components/SetupGuide";
import { fetchOwnedIds, fetchSpots } from "@/lib/supabase/server";
import { OWNER_TOKEN_COOKIE } from "@/proxy";

// Spots change whenever someone logs one, so never serve a stale prerender.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const spots = await fetchSpots();

  // null means .env.local has not been filled in yet.
  if (spots === null) return <SetupGuide />;

  const ownerToken = (await cookies()).get(OWNER_TOKEN_COOKIE)?.value;
  const ownedIds = await fetchOwnedIds(ownerToken);

  return (
    <main className="h-dvh">
      <MapExperience spots={spots} ownedIds={ownedIds} />
    </main>
  );
}
