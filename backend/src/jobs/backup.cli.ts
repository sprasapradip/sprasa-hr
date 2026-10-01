/** Run a backup from the command line (for system cron instead of the in-process scheduler). */
import { prisma } from '../lib/prisma';
import { runBackup } from '../services/backup.service';

runBackup('manual')
  .then((run) => {
    console.log(`Backup ${run.status}${run.filePath ? `: ${run.filePath}` : ''}${run.error ? ` (${run.error})` : ''}`);
    process.exit(run.status === 'SUCCESS' ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
