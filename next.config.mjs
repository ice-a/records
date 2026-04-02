/** @type {import('next').NextConfig} */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {})
};

export default nextConfig;
