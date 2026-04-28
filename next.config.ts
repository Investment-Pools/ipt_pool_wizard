// SPDX-License-Identifier: Apache-2.0

// import type { NextConfig } from "next";

const nextConfig = {
  // ❌ Disable React Strict Mode (dev only behavior)
  reactStrictMode: false,
  output: 'export',
  env: {
    NEXT_PUBLIC_APP_ENV: 'development',
  },
};

module.exports = nextConfig;