/**
 * First-run setup for a clean production database: creates an organisation with default
 * roles, leave types, salary components and sample tax slabs, plus its Super Admin.
 *
 *   ORG_NAME="Acme Pvt. Ltd." ADMIN_NAME="Sita Sharma" ADMIN_EMAIL=sita@acme.com.np \
 *   ADMIN_PASSWORD='a strong password' npm run setup:admin -w backend
 */
import { prisma } from '../lib/prisma';
import { hashPassword } from '../modules/auth/auth.service';
import { passwordSchema } from '../modules/auth/auth.schemas';
import { bootstrapOrganisation } from '../services/org-bootstrap.service';

async function main() {
  const { ORG_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ORG_NAME || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ORG_NAME, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD.');
    process.exit(1);
  }
  const pw = passwordSchema.safeParse(ADMIN_PASSWORD);
  if (!pw.success) {
    console.error(`Password rejected: ${pw.error.issues.map((i) => i.message).join(', ')}`);
    process.exit(1);
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`A user with ${email} already exists.`);
    process.exit(1);
  }
  await prisma.$transaction(
    async (tx) => {
      const org = await tx.organisation.create({ data: { name: ORG_NAME } });
      const { roles } = await bootstrapOrganisation(tx, org.id);
      await tx.user.create({
        data: { organisationId: org.id, email, name: ADMIN_NAME, passwordHash: await hashPassword(ADMIN_PASSWORD), roleId: roles.super_admin, emailVerifiedAt: new Date() },
      });
    },
    { timeout: 60_000 },
  );
  console.log(`Created "${ORG_NAME}" with Super Admin ${email}. Sign in and complete Settings, then review the sample tax slabs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
