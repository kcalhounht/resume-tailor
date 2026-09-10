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
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
