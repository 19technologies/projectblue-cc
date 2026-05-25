import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // Host routing — replaces what src/proxy.ts used to do.
      // Only the root is rewritten: admin.projectblue.cc/ lands on the
      // dashboard. Deeper /admin/* links already carry the prefix, so they
      // resolve directly without a double-prefix.
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "admin.projectblue.cc" }],
          destination: "/admin",
        },
      ],
    };
  },
  async redirects() {
    return [];
  },
};

export default nextConfig;
