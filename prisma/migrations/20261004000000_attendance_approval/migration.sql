-- Self check-ins from the app now need HR approval.

-- CreateEnum
CREATE TYPE "AttendanceApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_APPROVAL';

-- AlterTable
ALTER TABLE "Attendance"
  ADD COLUMN "approvalStatus" "AttendanceApproval",
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Attendance_organisationId_approvalStatus_idx" ON "Attendance"("organisationId", "approvalStatus");

-- New permission, granted to the existing Super Admin and HR Admin roles of every organisation.
-- Other roles can be given it from Users & Roles.
INSERT INTO "Permission" ("id", "key", "module", "description")
VALUES (gen_random_uuid()::text, 'attendance.approve', 'attendance', 'Approve or reject check-ins employees make from the app')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'attendance.approve' AND r."key" IN ('super_admin', 'hr_admin')
ON CONFLICT DO NOTHING;
