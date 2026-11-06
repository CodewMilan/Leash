import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SHAGUN_BUILD_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { tsconfigPath: process.env.VERCEL ? "tsconfig.build.json" : "tsconfig.json" },
  serverExternalPackages: ["pg"],
  allowedDevOrigins: process.env.APP_URL ? [new URL(process.env.APP_URL).hostname] : [],
  async rewrites() {
    const origin = process.env.API_PROXY_ORIGIN;
    if (!origin) return [];
    const target = new URL(origin);
    if (target.protocol !== "https:") throw new Error("API_PROXY_ORIGIN must use HTTPS.");
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${target.origin}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(), microphone=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
          },
          ...(process.env.APP_URL?.startsWith("https:")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
