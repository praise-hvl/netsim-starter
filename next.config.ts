import type { NextConfig } from "next";

// NETSIM_PAGES=1 builds a static copy for GitHub Pages (npm run pages:check, and the Pages
// workflow). NETSIM_BASE_PATH is where Pages serves it: "/<your repo's name>".
const pages = process.env.NETSIM_PAGES === "1";

const nextConfig: NextConfig = pages
  ? { output: "export", basePath: process.env.NETSIM_BASE_PATH ?? "", trailingSlash: true, images: { unoptimized: true } }
  : {};

export default nextConfig;
