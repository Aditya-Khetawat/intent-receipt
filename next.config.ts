import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.paypal.com https://*.paypalobjects.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.paypal.com https://*.paypalobjects.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.paypal.com https://*.paypalobjects.com",
      "frame-src https://*.paypal.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@paypal/agent-toolkit"],
  async rewrites() {
    return [{ source: "/.well-known/intent-receipt-key.json", destination: "/api/public-key" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
