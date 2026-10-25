import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "192.168.1.11",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.*.*.*",
    "*.*",
    "*.*.*",
    "*.local",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "*",
  ],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
