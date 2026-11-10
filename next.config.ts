import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  devIndicators: false,
};
export default config;
