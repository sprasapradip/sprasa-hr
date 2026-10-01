import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { notifyExpiringDocuments } from '../modules/documents/documents.service';
import { runBackup } from '../services/backup.service';
import { ensureLeaveBalancesForOrganisation } from '../services/leave-balance.service';

const tasks: ScheduledTask[] = [];

function schedule(name: string, expression: string, fn: () => Promise<unknown>) {
  tasks.push(
    cron.schedule(
      expression,
      async () => {
        const started = Date.now();
        try {
          await fn();
          logger.info({ job: name, ms: Date.now() - started }, 'Job finished');
        } catch (err) {
          logger.error({ err, job: name }, 'Job failed');
        }
      },
      { timezone: 'Asia/Kathmandu' },
    ),
  );
}

export function startJobs() {
  schedule('backup', env.BACKUP_CRON, () => runBackup('scheduled'));
  schedule('document-expiry', '0 8 * * *', notifyExpiringDocuments);
  // Create next year's leave balances (with carry-forward) on 1 January.
  schedule('leave-year-rollover', '15 0 1 1 *', async () => {
    const year = new Date().getUTCFullYear();
    const orgs = await prisma.organisation.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const o of orgs) await ensureLeaveBalancesForOrganisation(o.id, year);
  });
  logger.info(`Background jobs scheduled (${tasks.length})`);
}

export function stopJobs() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}
