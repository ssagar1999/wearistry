import type { NextConfig } from "next";

// Where the Express API runs, as seen from this Next.js server (not from the browser).
// Read at build time for the proxy below, and at request time for server-side calls (src/lib/server-api.ts).
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Builds a small self-contained server in .next/standalone, which the Dockerfile copies into the image.
  output: "standalone",
  // The browser only talks to this site: /api/v1/* is forwarded to the API. Cookies stay first-party,
  // no CORS is needed in the browser, and Google's redirect lands on our own domain.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
