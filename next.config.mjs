/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // googleapis / pg are Node-only; keep them out of the bundled server output.
    serverComponentsExternalPackages: ["googleapis", "pg"],
  },
};

export default nextConfig;
