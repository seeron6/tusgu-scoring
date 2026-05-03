import path from "node:path";
import type { NextConfig } from "next";

// GitHub Pages serves the site under https://<user>.github.io/<repo>/.
// Set NEXT_PUBLIC_BASE_PATH = "/<repo>" at build time so all asset URLs and
// router links resolve correctly. Locally (npm run dev) leave it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Pin the workspace root to this directory so Turbopack doesn't crawl up
  // when the project lives inside a git worktree alongside another lockfile.
  turbopack: { root: path.resolve() },
};

export default nextConfig;
