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
    return [
      // Beta gate for /room/* on beta.* — pushed into the Next config so
      // the Worker never pays iron-session unseal CPU just to redirect
      // unredeemed visitors. (Was a major contributor to 1102.) The cookie
      // is an iron-session sealed value, so mere presence implies the user
      // passed through /beta; forged cookies still fail at /api/upload/audio
      // which re-validates the session.
      {
        source: "/room/:code",
        has: [{ type: "host", value: "beta.projectblue.cc" }],
        missing: [{ type: "cookie", key: "pb_beta_session" }],
        destination: "/beta",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
