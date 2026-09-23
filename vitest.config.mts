import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

const root = import.meta.dirname;

// Route handlers under test read Supabase creds from process.env
// (createAdminClient, fetchSpots). loadEnv pulls in .env.local the same way
// `next dev` does, but without crashing when it's absent - tests/security.test.ts
// and the DB-backed half of app/api/spots/[id]/route.test.ts skip themselves
// via `describe.skipIf` when it's not there, which is exactly what happens
// in CI unless the repo secrets are wired up.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    test: {
      environment: "node",
      include: ["**/*.test.ts"],
      exclude: ["node_modules/**", ".next/**"],
    },
    resolve: {
      alias: {
        "@": root,
        // See tests/stubs/server-only.ts for why this needs stubbing.
        "server-only": path.join(root, "tests/stubs/server-only.ts"),
      },
    },
  };
});
