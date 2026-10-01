import fs from 'node:fs';
import { createApp } from './app';
import { env } from './config/env';
import { startJobs, stopJobs } from './jobs';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

async function main() {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  await prisma.$connect();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Sprasa HR API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  });

  if (env.ENABLE_JOBS) startJobs();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
