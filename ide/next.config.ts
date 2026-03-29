import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: configDir,
  turbopack: {
    root: configDir,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
