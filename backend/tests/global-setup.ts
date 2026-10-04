import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Runs once for the whole test run (not per file): points at the *_test database and
 * applies migrations. Doing this per file re-ran the Prisma CLI for every suite, which
 * is slow enough on some machines to hit the hook timeout.
 */
export default function setup() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  const url = process.env.TEST_DATABASE_URL;
  if (!url?.includes('_test')) throw new Error('Set TEST_DATABASE_URL to a *_test database before running tests');
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } });
}
