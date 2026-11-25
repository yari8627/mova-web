/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["geo-tz","pdfjs-dist"],
  outputFileTracingIncludes: {"/api/gmail/search": ["./scripts/gmail-pdf-worker.mjs","./node_modules/pdfjs-dist/package.json","./node_modules/pdfjs-dist/legacy/build/*.mjs","./node_modules/@napi-rs/canvas/**/*","./node_modules/@napi-rs/canvas-*/**/*"],"/api/places": ["./node_modules/geo-tz/data/timezones.geojson.*"]},
};

export default nextConfig;
