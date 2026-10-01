// Runs before every test file, before any app module is imported.
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else {
  // Fall back to the value in .env, then point at a separate *_test database.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
