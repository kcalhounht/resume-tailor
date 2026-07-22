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
  // Ship Unicode fonts with serverless functions that build PDFs
  outputFileTracingIncludes: {
    "/api/tailor": ["./assets/fonts/**/*"],
    "/api/repackage": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
