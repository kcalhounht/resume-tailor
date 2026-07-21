import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy native/PDF packages outside the webpack bundle
  serverExternalPackages: [
    "pdfkit",
    "fontkit",
    "linebreak",
    "png-js",
    "archiver",
    "unpdf",
  ],
};

export default nextConfig;
