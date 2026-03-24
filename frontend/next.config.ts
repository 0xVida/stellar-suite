import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: isDev,
  register: true,
  skipWaiting: true,
  buildExcludes: [/chunks\/pages\/api/],
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
