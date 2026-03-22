import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from any domain (Drive CDN + API server)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.onrender.com" },
      { protocol: "https", hostname: "*.railway.app" },
    ],
  },
};

export default nextConfig;
