import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  reactCompiler: true,
  images: {
    qualities: [25, 50, 75, 100],
  },
};

export default nextConfig;
