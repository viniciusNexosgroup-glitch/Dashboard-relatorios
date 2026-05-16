import type { NextConfig } from "next";

// Bypass SSL verification on Windows dev only (some local dev setups fail TLS).
// In production (Linux/Docker), keep TLS strict — do not set this var.
if (process.platform === 'win32' && process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const nextConfig: NextConfig = {
  // Builds a self-contained server bundle, ideal for Docker/EasyPanel deploys
  output: 'standalone',
};

export default nextConfig;
