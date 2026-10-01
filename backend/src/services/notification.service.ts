import type { NotificationType } from '@prisma/client';
import type { EmailContent } from '../emails/templates';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { sendEmail } from './email.service';
import { getNotificationSettings } from './settings.service';

export interface NotificationMessage {
  organisationId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** Optional per-recipient email; receives the recipient's name. */
  email?: (recipient: Recipient) => EmailContent;
}

export interface Recipient {
  userId: string;
  email: string;
  name: string;
}

/**
 * A delivery channel. In-app and email are built in; SMS or push can be added by
 * implementing this interface and registering it in `channels`.
 */
export interface NotificationChannel {
  name: string;
  deliver(recipients: Recipient[], msg: NotificationMessage): Promise<void>;
}

const inAppChannel: NotificationChannel = {
  name: 'in_app',
  async deliver(recipients, msg) {
    if (!recipients.length) return;
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        organisationId: msg.organisationId,
        userId: r.userId,
        type: msg.type,
        title: msg.title,
        message: msg.message,
        link: msg.link ?? null,
      })),
    });
  },
};

const emailChannel: NotificationChannel = {
  name: 'email',
  async deliver(recipients, msg) {
    if (!msg.email) return;
    const settings = await getNotificationSettings(msg.organisationId);
    if (!settings.emailEnabled || settings.emailTypes[msg.type] === false) return;
    for (const r of recipients) {
      const ok = await sendEmail(r.email, msg.email(r));
      if (ok) {
        await prisma.notification.updateMany({
          where: { userId: r.userId, type: msg.type, title: msg.title, emailSentAt: null },
          data: { emailSentAt: new Date() },
        });
      }
    }
  },
};

export const channels: NotificationChannel[] = [inAppChannel, emailChannel];

/** Fan a message out to every channel. Never throws: notifications must not break the caller. */
export async function notify(userIds: string[], msg: NotificationMessage): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: unique }, status: 'ACTIVE', deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    const recipients = users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
    for (const channel of channels) {
      try {
        await channel.deliver(recipients, msg);
      } catch (err) {
        logger.error({ err, channel: channel.name, type: msg.type }, 'Notification channel failed');
      }
    }
  } catch (err) {
    logger.error({ err, type: msg.type }, 'Notification dispatch failed');
  }
}

/** Users in the organisation holding any of the given permissions (e.g. HR approvers). */
export async function usersWithPermission(organisationId: string, permissionKeys: string[]): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      organisationId,
      status: 'ACTIVE',
      deletedAt: null,
      role: { permissions: { some: { permission: { key: { in: permissionKeys } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function userIdForEmployee(employeeId: string | null | undefined): Promise<string | null> {
  if (!employeeId) return null;
  const u = await prisma.user.findUnique({ where: { employeeId }, select: { id: true } });
  return u?.id ?? null;
}
