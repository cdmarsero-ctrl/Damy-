import type { NextConfig } from "next";

/** Headers applied to every response. Tightened here rather than in middleware
 *  so they also cover static assets and the service worker. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // The app legitimately needs the microphone for pronunciation practice.
    value: "camera=(), geolocation=(), microphone=(self), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output is only for the Docker image, whose runtime stage copies
  // .next/standalone. Enabling it unconditionally makes `next start` — the
  // command the README and deployment docs tell people to run — emit
  // "next start does not work with output: standalone". The Dockerfile sets
  // this flag; everywhere else keeps a working `npm run start`.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
