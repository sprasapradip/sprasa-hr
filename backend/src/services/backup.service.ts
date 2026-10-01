import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

/**
 * Backup strategy
 *  - Database: pg_dump in custom format (restore with pg_restore), one file per run.
 *  - Uploaded documents: copied into a dated folder next to the dump.
 *  - Retention: runs older than BACKUP_RETENTION_DAYS are deleted from disk.
 * For production, sync BACKUP_DIR to off-site storage (see docs/DEPLOYMENT.md).
 */

function stamp() {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
}

function runPgDump(outFile: string): Promise<void> {
  const url = new URL(env.DATABASE_URL);
  const database = url.pathname.slice(1);
  const args = ['-Fc', '-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-f', outFile, database];
  return new Promise((resolve, reject) => {
    // Password goes through the environment, never on the command line.
    const child = spawn(env.PG_DUMP_PATH, args, { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => reject(new Error(`Could not start pg_dump (${err.message}). Set PG_DUMP_PATH.`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `pg_dump exited with code ${code}`))));
  });
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = path.join(dir, e.name);
    return sum + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
  }, 0);
}

export async function runBackup(kind: 'scheduled' | 'manual' = 'manual') {
  fs.mkdirSync(env.backupDir, { recursive: true });
  const run = await prisma.backupRun.create({ data: { kind, status: 'RUNNING' } });
  const folder = path.join(env.backupDir, `backup-${stamp()}`);
  try {
    fs.mkdirSync(folder, { recursive: true });
    await runPgDump(path.join(folder, 'database.dump'));
    if (fs.existsSync(env.uploadDir)) fs.cpSync(env.uploadDir, path.join(folder, 'uploads'), { recursive: true });
    const size = dirSize(folder);
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', filePath: path.basename(folder), fileSize: BigInt(size), finishedAt: new Date() },
    });
    await pruneBackups();
    logger.info({ folder, size }, 'Backup completed');
  } catch (err) {
    fs.rmSync(folder, { recursive: true, force: true });
    await prisma.backupRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500), finishedAt: new Date() } });
    logger.error({ err }, 'Backup failed');
  }
  return prisma.backupRun.findUniqueOrThrow({ where: { id: run.id } });
}

export async function pruneBackups() {
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 86_400_000;
  for (const entry of fs.readdirSync(env.backupDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
    const full = path.join(env.backupDir, entry.name);
    if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
  }
}

export async function backupStatus() {
  const runs = await prisma.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 });
  const lastSuccess = runs.find((r) => r.status === 'SUCCESS') ?? null;
  return {
    schedule: env.BACKUP_CRON,
    retentionDays: env.BACKUP_RETENTION_DAYS,
    jobsEnabled: env.ENABLE_JOBS,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    runs: runs.map((r) => ({ ...r, fileSize: r.fileSize ? Number(r.fileSize) : null })),
  };
}
