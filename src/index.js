/**
 * Project Blue — Cloudflare Worker
 *
 * Routes:
 *   POST /api/subscribe → Resend integration
 *   * → static assets from ./public via env.ASSETS
 *
 * Environment variables (Cloudflare dashboard → Settings → Variables):
 *   RESEND_API_KEY      — secret
 *   RESEND_AUDIENCE_ID  — optional, plaintext
 *   ADMIN_EMAIL         — plaintext (honiegodfrey2@gmail.com)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/subscribe') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method === 'POST') {
        return handleSubscribe(request, env);
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleSubscribe(request, env) {
  try {
    const { email, phone, terms } = await request.json();

    if (!terms) return json({ error: 'Terms not accepted' }, 400);
    if (!email && !phone) return json({ error: 'Email or phone required' }, 400);

    if (!env.RESEND_API_KEY) return json({ ok: true, dev: true });

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

    if (email && env.RESEND_AUDIENCE_ID) {
      tasks.push(
        resend(`/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
          email,
          unsubscribed: false,
        })
      );
    }

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

    if (env.ADMIN_EMAIL) {
      tasks.push(
        resend('/emails', {
          from: 'Project Blue <waitlist@projectblue.cc>',
          to: [env.ADMIN_EMAIL],
          subject: 'New waitlist signup — Project Blue',
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
