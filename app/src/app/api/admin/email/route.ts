import { sessionOptions, type AdminSession } from "@/lib/sessions";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

interface Env {
  RESEND_API_KEY?: string;
  ADMIN_EMAIL?: string;
}

function getEnv(): Env {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@projectblue.cc",
  };
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<AdminSession>(await cookies(), sessionOptions);
  if (!session.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY secret not configured. Add it via `wrangler secret put RESEND_API_KEY`." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { to, subject, message, betaCode } = body as {
    to?: string;
    subject?: string;
    message?: string;
    betaCode?: string;
  };

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
  }
  if (!subject || !subject.trim()) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  }
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const codeBlock = betaCode?.trim()
    ? `\n\n---\nYour beta invite code: ${betaCode.trim()}\n\nEnter it at https://beta.projectblue.cc to get started.\n---`
    : "";

  const textBody = `${message.trim()}${codeBlock}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0A0D1A;font-family:Inter,system-ui,sans-serif;color:#ECF0FF;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111527;border-radius:12px;overflow:hidden;border:1px solid rgba(236,240,255,0.12);">
        <!-- Top band -->
        <tr><td style="height:5px;background:#5B7BC4;"></td></tr>
        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;">
          <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:1.05rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#ECF0FF;">Project Blue</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 40px 32px;font-size:0.95rem;line-height:1.65;color:rgba(236,240,255,0.85);white-space:pre-wrap;">
          ${message.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}
        </td></tr>
        ${
          betaCode?.trim()
            ? `<!-- Code block -->
        <tr><td style="padding:0 40px 32px;">
          <div style="background:rgba(91,123,196,0.12);border:1px solid rgba(91,123,196,0.3);border-radius:8px;padding:20px 24px;text-align:center;">
            <p style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,240,255,0.5);">Your beta invite code</p>
            <p style="margin:0 0 16px;font-size:1.75rem;font-family:'SF Mono','JetBrains Mono','Menlo',monospace;letter-spacing:0.1em;color:#ECF0FF;font-weight:600;">${betaCode.trim().replace(/</g, "&lt;")}</p>
            <a href="https://beta.projectblue.cc" style="display:inline-block;background:#5B7BC4;color:#050810;text-decoration:none;padding:10px 24px;border-radius:9999px;font-size:0.875rem;font-weight:600;">Enter code →</a>
          </div>
        </td></tr>`
            : ""
        }
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(236,240,255,0.08);font-size:0.75rem;color:rgba(236,240,255,0.3);">
          Project Blue · Synchronized listening, together
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `Project Blue <${env.ADMIN_EMAIL}>`,
    to: [to],
    subject: subject.trim(),
    text: textBody,
    html: htmlBody,
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: error.message ?? "Failed to send email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
