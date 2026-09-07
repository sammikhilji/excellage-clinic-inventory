import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure seed.csv is available at runtime on Vercel (first-run seeding)
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/seed.csv"],
    "/*": ["./data/seed.csv"],
  },
};

export default nextConfig;
