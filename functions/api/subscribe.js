/**
 * Cloudflare Pages Function — /api/subscribe
 *
 * Environment variables to set in Cloudflare Pages dashboard:
 *   RESEND_API_KEY      — from resend.com/api-keys
 *   RESEND_AUDIENCE_ID  — from resend.com/audiences (create one named "Project Blue Waitlist")
 *   ADMIN_EMAIL         — your email to receive signup notifications
 *
 * Your sending domain (projectblue.cc) must be verified in Resend before
 * you can send from waitlist@projectblue.cc. While testing, Resend allows
 * sending to your own account email from onboarding@resend.dev.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email, phone, terms } = await request.json();

    if (!terms) {
      return json({ error: 'Terms not accepted' }, 400);
    }

    if (!email && !phone) {
      return json({ error: 'Email or phone required' }, 400);
    }

    /* Skip API calls in local dev (no RESEND_API_KEY set) */
    if (!env.RESEND_API_KEY) {
      return json({ ok: true, dev: true });
    }

    const resend = (path, body) =>
      fetch(`https://api.resend.com${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    const tasks = [];

    /* Add to Resend Audience contact list */
    if (email && env.RESEND_AUDIENCE_ID) {
      tasks.push(
        resend(`/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
          email,
          unsubscribed: false,
        })
      );
    }

    /* Confirmation email to the user */
    if (email) {
      tasks.push(
        resend('/emails', {
          from: 'Project Blue <waitlist@projectblue.cc>',
          to: [email],
          subject: "You're on the list — Project Blue",
          html: confirmationHtml(),
        })
      );
    }

    /* Admin notification */
    if (env.ADMIN_EMAIL) {
      tasks.push(
        resend('/emails', {
          from: 'Project Blue <waitlist@projectblue.cc>',
          to: [env.ADMIN_EMAIL],
          subject: `New waitlist signup — Project Blue`,
          html: `
            <p style="font-family:Georgia,serif;color:#1A1826;line-height:1.7">
              <strong>New signup</strong><br>
              Email: ${email || '—'}<br>
              Phone: ${phone || '—'}
            </p>`,
        })
      );
    }

    await Promise.allSettled(tasks);

    return json({ ok: true });
  } catch {
    return json({ error: 'Server error' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function confirmationHtml() {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;background:#0D0F1F;color:#ECF0FF;padding:48px 36px;max-width:480px;margin:auto">
  <p style="font-size:0.75rem;letter-spacing:0.18em;text-transform:uppercase;color:#4A72E8;margin-bottom:1.5rem">Project Blue</p>
  <h1 style="font-size:1.75rem;font-weight:400;margin-bottom:1rem;letter-spacing:-0.01em">You're on the list.</h1>
  <p style="color:#7080AA;line-height:1.8;font-size:0.95rem;margin-bottom:1.5rem">
    We'll reach out when your room is ready — with the very first invite.<br>
    Thanks for believing in something new.
  </p>
  <p style="color:#7080AA;font-size:0.82rem">— The Project Blue team</p>
</body>
</html>`;
}
