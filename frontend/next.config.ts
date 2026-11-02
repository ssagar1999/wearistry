import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a small self-contained server in .next/standalone, which the Dockerfile copies into the image.
  output: "standalone",
  // Uploaded photos live in .data at runtime; keep them out of the build.
  outputFileTracingExcludes: { "*": [".data/**"] },
};

export default nextConfig;
