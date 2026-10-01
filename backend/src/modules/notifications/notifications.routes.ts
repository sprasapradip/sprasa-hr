import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { params, query } from '../../middleware/validate';
import { notFound } from '../../utils/errors';
import { paginated, paginationQuery, paging } from '../../utils/pagination';

const idParam = z.object({ id: z.string().uuid() });

/** Every user reads and manages only their own notifications. */
export const notificationRoutes = Router();

notificationRoutes.get('/', async (req, res) => {
  const q = query(req, paginationQuery.extend({ unread: z.enum(['0', '1']).optional() }));
  const where = { userId: req.auth!.userId, ...(q.unread === '1' ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging(q) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.auth!.userId, readAt: null } }),
  ]);
  res.json({ success: true, ...paginated(rows, total, q), meta: { unread } });
});

notificationRoutes.get('/unread-count', async (req, res) => {
  res.json({ success: true, data: { unread: await prisma.notification.count({ where: { userId: req.auth!.userId, readAt: null } }) } });
});

notificationRoutes.post('/read-all', async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { userId: req.auth!.userId, readAt: null }, data: { readAt: new Date() } });
  res.json({ success: true, data: { updated: r.count } });
});

notificationRoutes.post('/:id/read', async (req, res) => {
  const { id } = params(req, idParam);
  const r = await prisma.notification.updateMany({ where: { id, userId: req.auth!.userId }, data: { readAt: new Date() } });
  if (!r.count) throw notFound('Notification');
  res.json({ success: true });
});

notificationRoutes.delete('/:id', async (req, res) => {
  const { id } = params(req, idParam);
  const r = await prisma.notification.deleteMany({ where: { id, userId: req.auth!.userId } });
  if (!r.count) throw notFound('Notification');
  res.json({ success: true });
});
