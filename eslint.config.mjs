import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next. Patterns need the
  // leading "**/" to match at any depth, not just the repo root - without
  // it, a nested copy of the repo (e.g. a leftover git worktree under
  // .claude/worktrees/) keeps its own compiled .next output on the scan.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    ".claude/**",
  ]),
]);

export default eslintConfig;
