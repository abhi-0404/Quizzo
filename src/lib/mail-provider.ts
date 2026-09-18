/**
 * Best-effort "open your inbox" link for the post-signup confirmation screen.
 *
 * There is no API that opens a specific message in someone else's mailbox —
 * this only gets the student to their provider's inbox in a new tab, for the
 * common webmail providers. Unrecognised domains (a college or company
 * address) get no button; a wrong guess (e.g. a self-hosted Gmail-alias
 * domain) is worse than no button at all.
 */
const WEBMAIL_INBOX_BY_DOMAIN: Record<string, string> = {
  "gmail.com": "https://mail.google.com/mail/u/0/#inbox",
  "googlemail.com": "https://mail.google.com/mail/u/0/#inbox",
  "outlook.com": "https://outlook.live.com/mail/0/inbox",
  "hotmail.com": "https://outlook.live.com/mail/0/inbox",
  "live.com": "https://outlook.live.com/mail/0/inbox",
  "msn.com": "https://outlook.live.com/mail/0/inbox",
  "yahoo.com": "https://mail.yahoo.com/",
  "icloud.com": "https://www.icloud.com/mail",
  "me.com": "https://www.icloud.com/mail",
  "proton.me": "https://mail.proton.me/",
  "protonmail.com": "https://mail.proton.me/",
};

export function webmailInboxUrl(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  return domain ? WEBMAIL_INBOX_BY_DOMAIN[domain] ?? null : null;
}
