import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // don't fail the build on lint errors
  },
};

export default nextConfig;