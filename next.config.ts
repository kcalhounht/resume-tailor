import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfkit / pdf-parse outside the bundle for native/worker assets
  serverExternalPackages: [
    "pdfkit",
    "fontkit",
    "linebreak",
    "png-js",
    "archiver",
    "pdf-parse",
    "pdfjs-dist",
  ],
};

export default nextConfig;
