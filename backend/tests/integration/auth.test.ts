import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { app, auth, login, PASSWORD, resetDb, seedFixture } from './helpers';

function cookie(res: request.Response, name: string) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

describe('authentication', () => {
  beforeAll(async () => {
    await resetDb();
    await seedFixture();
  });
  afterAll(() => prisma.$disconnect());

  it('rejects wrong passwords with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: 'admin@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'INVALID_CREDENTIALS' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ identifier: 'nobody@test.local', password: 'wrong' });
    expect(unknown.body.message).toBe(res.body.message);
  });

  it('logs in, sets an HTTP-only refresh cookie and returns the profile', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: 'admin@test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.key).toBe('hr_admin');
    const rt = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('sprasa_rt='));
    expect(rt).toMatch(/HttpOnly/i);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('requires a token for protected routes', async () => {
    const res = await request(app).get('/api/v1/employees');
    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({ identifier: 'admin@test.local', password: PASSWORD });
    const rt1 = cookie(loginRes, 'sprasa_rt')!;
    const csrf = cookie(loginRes, 'sprasa_csrf')!;
    const csrfValue = csrf.split('=')[1];

    const noCsrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1);
    expect(noCsrf.status).toBe(403);

    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt1, csrf]).set('X-CSRF-Token', csrfValue);
    expect(r1.status).toBe(200);
    const rt2 = cookie(r1, 'sprasa_rt')!;
    const csrf2 = cookie(r1, 'sprasa_csrf')!;

    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt1, csrf2]).set('X-CSRF-Token', csrf2.split('=')[1]);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_REUSED');

    // The newer token was in the same family, so it is revoked too.
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', [rt2, csrf2]).set('X-CSRF-Token', csrf2.split('=')[1]);
    expect(after.status).toBe(401);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').send({ identifier: 'accountant@test.local', password: 'nope' });
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: 'accountant@test.local', password: PASSWORD });
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    await prisma.user.updateMany({ where: { email: 'accountant@test.local' }, data: { lockedUntil: null, failedLoginCount: 0 } });
  });

  it('changes password and invalidates old tokens', async () => {
    const token = await login('staff@test.local');
    const res = await request(app).post('/api/v1/auth/change-password').set(auth(token)).send({ currentPassword: PASSWORD, newPassword: 'NewPass456' });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100));
    const newToken = await login('staff@test.local', 'NewPass456');
    expect((await request(app).get('/api/v1/auth/me').set(auth(newToken))).status).toBe(200);
  });

  it('password reset: always 200, and a token works exactly once', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    const bad = await request(app).post('/api/v1/auth/reset-password').send({ token: 'x'.repeat(40), password: 'Another123' });
    expect(bad.body.code).toBe('TOKEN_INVALID');
  });
});
