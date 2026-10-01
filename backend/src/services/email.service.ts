import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import type { EmailContent } from '../emails/templates';
import { logger } from '../lib/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/** Messages sent while SMTP is not configured (development/tests). Capped to avoid growth. */
export const outbox: { to: string; subject: string; text: string; at: Date }[] = [];

/**
 * Sends an email. Failures are logged and reported as `false` rather than thrown, so a mail
 * outage never breaks the business action (approving leave, running payroll) that triggered it.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    outbox.push({ to, subject: content.subject, text: content.text, at: new Date() });
    if (outbox.length > 200) outbox.shift();
    logger.info({ to, subject: content.subject }, 'SMTP not configured; email captured in dev outbox');
    return true;
  }
  try {
    await t.sendMail({ from: env.SMTP_FROM, to, subject: content.subject, html: content.html, text: content.text });
    return true;
  } catch (err) {
    logger.error({ err, subject: content.subject }, 'Email delivery failed');
    return false;
  }
}

export async function verifySmtp(): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { configured: false, ok: false };
  try {
    await t.verify();
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: (err as Error).message };
  }
}
