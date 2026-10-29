import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Aplikasi ini sepenuhnya dinamis (database SQLite + streaming file),
  // jadi perilaku klasik lebih cocok daripada Cache Components.
  cacheComponents: false,
  // ffmpeg-static menggunakan __dirname untuk menemukan binary;
  // bundling oleh Turbopack merusak path tersebut, jadi biarkan di-resolve saat runtime.
  serverExternalPackages: ["ffmpeg-static"],
  // Akses online lewat Cloudflare Tunnel (quick tunnel: *.trycloudflare.com)
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.trycloudflare.com"],
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
