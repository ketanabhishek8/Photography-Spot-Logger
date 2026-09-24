import { configDefaults, defineConfig } from "vitest/config";
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
      // A hand-written exclude list REPLACES Vitest's own defaults rather than
      // adding to them - configDefaults.exclude already covers node_modules at
      // any depth (**/node_modules/**), which a bare "node_modules/**" doesn't:
      // that only matches at the repo root, so a nested copy (e.g. a leftover
      // git worktree under .claude/worktrees/) gets scanned and its bundled
      // test files run as if they were this project's own.
      exclude: [...configDefaults.exclude, "**/.next/**", "**/.claude/**"],
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
