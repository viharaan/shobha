import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // one `next dev` per distDir: the Claude preview runs with NEXT_DIST_DIR=.next-preview so it can coexist with the HTTPS headset server
  distDir: process.env.NEXT_DIST_DIR || '.next',
  cacheComponents: true,
  // LAN / headset testing: dev assets are refused from non-localhost origins unless listed here
  allowedDevOrigins: ['192.168.0.108', '192.168.0.105', '192.168.0.*', '192.168.255.*'], // Wi-Fi LAN + VPN tunnel
  outputFileTracingRoot: __dirname,
  partialPrefetching: true,
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
