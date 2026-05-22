/**
 * Seed content for the Terms and Privacy pages. When the admin
 * dashboard ships its KV-backed editor, KV overrides these values
 * at request time. Until then, this is the source of truth.
 */

export type LegalSlug = "terms" | "privacy";

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  body: string; // markdown
  updatedAt: string;
}

const TERMS_BODY = `## 1. About Project Blue

Project Blue lets people in different places listen to the same audio at the same moment. You join a six-character room code, and every device in that room plays in sync.

## 2. Using the service

You can use Project Blue anonymously. No sign-up is required to open or join a room. If you create an account it's only to keep your rooms and friends between visits.

## 3. The room code

A room code is six characters long. Anyone with the code can open the room. Treat your code like a password if you don't want strangers joining — choose a new one for each session.

## 4. What you upload

You're responsible for the audio you bring into a room. Do not upload audio you don't have the right to share. We may remove content and revoke access if a room is being used to distribute copyright-infringing or unlawful material.

## 5. Acceptable use

Don't use Project Blue to harass, threaten, deceive or harm people. Don't try to compromise the service, scrape audio you don't own, or impersonate someone else. We may suspend access if you do.

## 6. Service availability

We aim to keep Project Blue running smoothly but the service is provided as-is, without warranty. We may change features, take rooms offline for maintenance, or end the service with reasonable notice.

## 7. Liability

To the extent allowed by law, Project Blue isn't liable for indirect or consequential loss arising from your use of the service. Nothing in these terms limits liability for matters that can't be limited by law.

## 8. Changes to these terms

We may update these terms. When we do, we'll change the "Last updated" date at the top of the page. Continuing to use Project Blue after a change means you accept the new terms.

## 9. Contact

Questions about these terms — email [hello@projectblue.cc](mailto:hello@projectblue.cc).
`;

const PRIVACY_BODY = `## 1. Who we are

Project Blue is operated by the Project Blue team. We're the controllers of the data we collect from you under UK data-protection law.

## 2. What we collect

When you use Project Blue without an account, we collect:

- The six-character room code you create or join.
- Your randomly generated session name. You can shuffle this whenever you like.
- Timing measurements we use to keep playback in sync across devices (an NTP-style handshake of timestamps, not your IP geography).
- Audio files you upload, for the duration of the room.

We don't ask for your name, your address, or your phone number for anonymous use.

## 3. If you create an account

An account adds your email address, your chosen username and your password (stored hashed — never as plain text). Your account lets you keep rooms and friends between visits.

## 4. Cookies and storage

We use your browser's local storage to remember small things like your theme preference (\`pb-theme\`) and your session. We don't use third-party advertising cookies.

## 5. Where the data lives

Audio uploads are stored on Cloudflare R2. Anonymous room state lives in memory on our server and is wiped 60 seconds after the last person leaves. Backups are written to R2 every minute and restored on server startup.

## 6. Sharing

We don't sell your data. We share it with infrastructure providers (Cloudflare, our hosting provider) strictly to deliver the service, and with law-enforcement only when legally required.

## 7. Your rights

You have the right to access, correct or delete the personal data we hold about you, and to object to or restrict processing. To make a request, email [privacy@projectblue.cc](mailto:privacy@projectblue.cc).

## 8. Children

Project Blue isn't directed at children under 13. We don't knowingly collect personal data from anyone under 13. If you think a child has signed up, contact us and we'll remove the account.

## 9. Changes to this notice

We'll update the "Last updated" date at the top of the page when we change this notice. Material changes will be flagged in the app.

## 10. Contact

For anything about your data — email [privacy@projectblue.cc](mailto:privacy@projectblue.cc).
`;

export const LEGAL_SEED: Record<LegalSlug, LegalDoc> = {
  terms: {
    slug: "terms",
    title: "Terms of use",
    body: TERMS_BODY,
    updatedAt: "2026-05-22T00:00:00.000Z",
  },
  privacy: {
    slug: "privacy",
    title: "Privacy notice",
    body: PRIVACY_BODY,
    updatedAt: "2026-05-22T00:00:00.000Z",
  },
};

export const LEGAL_SLUGS: LegalSlug[] = ["terms", "privacy"];
