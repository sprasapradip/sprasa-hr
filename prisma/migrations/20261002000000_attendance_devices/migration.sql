-- CreateEnum
CREATE TYPE "PunchSource" AS ENUM ('DEVICE_PUSH', 'DEVICE_AGENT', 'FILE_IMPORT');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "deviceUserId" TEXT;

-- CreateTable
CREATE TABLE "AttendanceDevice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "serialNumber" TEXT,
    "agentKeyHash" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "lastPunchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePunch" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceUserId" TEXT NOT NULL,
    "employeeId" TEXT,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "source" "PunchSource" NOT NULL,
    "deviceState" INTEGER,
    "verifyMode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_serialNumber_key" ON "AttendanceDevice"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_agentKeyHash_key" ON "AttendanceDevice"("agentKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_organisationId_name_key" ON "AttendanceDevice"("organisationId", "name");

-- CreateIndex
CREATE INDEX "AttendancePunch_employeeId_punchedAt_idx" ON "AttendancePunch"("employeeId", "punchedAt");

-- CreateIndex
CREATE INDEX "AttendancePunch_organisationId_employeeId_idx" ON "AttendancePunch"("organisationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePunch_organisationId_deviceUserId_punchedAt_key" ON "AttendancePunch"("organisationId", "deviceUserId", "punchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organisationId_deviceUserId_key" ON "Employee"("organisationId", "deviceUserId");

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

