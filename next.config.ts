import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up and picks a package-lock.json outside the
  // project as the workspace root.
  turbopack: { root: __dirname },
  // sharp ships a native binary; let Node require() it directly at runtime
  // instead of having the bundler try to pull it into the route's JS bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
