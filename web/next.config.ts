import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SHAGUN_BUILD_DIR || ".next",
  reactStrictMode: true,
  turbopack: { rules: { "*.css": { condition: { not: { path: "*.module.css" } }, loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), publickey-credentials-get=(self), publickey-credentials-create=(self)" },
      ...(process.env.APP_URL?.startsWith("https:") ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }];
  },
};

export default nextConfig;
