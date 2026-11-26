/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["geo-tz"],
  outputFileTracingIncludes: {"/api/places": ["./node_modules/geo-tz/data/timezones.geojson.*"]},
};

export default nextConfig;
