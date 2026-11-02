import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts buffers request bodies and silently cuts them at 10MB by
    // default, which truncates editor video and large audio uploads.
    proxyClientMaxBodySize: "2gb",
  },
};

export default nextConfig;
