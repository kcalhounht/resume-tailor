import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfkit outside the bundle so it can load Helvetica.afm from node_modules
  serverExternalPackages: [
    "pdfkit",
    "fontkit",
    "linebreak",
    "png-js",
    "archiver",
    "unpdf",
  ],
  outputFileTracingIncludes: {
    "/api/tailor": ["src/lib/fonts/**/*.ttf", "./src/lib/fonts/**/*"],
    "/api/extension/zip": ["./extension/**/*"],
    "/api/*": ["src/lib/fonts/**/*.ttf", "./src/lib/fonts/**/*", "./extension/**/*"],
    "/*": ["src/lib/fonts/**/*.ttf", "./src/lib/fonts/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' chrome-extension:",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
