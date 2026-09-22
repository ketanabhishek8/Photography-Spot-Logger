import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up and picks a package-lock.json outside the
  // project as the workspace root.
  turbopack: { root: __dirname },
};

export default nextConfig;
