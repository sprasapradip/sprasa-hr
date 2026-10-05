// Undo the demo-data changes made by capture.js. Copy into backend/ and run:
//   node cleanup.js            (dry run)   |   node cleanup.js --apply
// - removes the 25–27 Nov 2026 leave request from the leave flow (and gives the pending days back)
// - removes the demo employee's web check-in for the capture day (attendance flow) and the approval notification
// Audit-log entries are kept: the app never deletes them.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });

(async () => {
  const user = await p.user.findFirst({ where: { username: 'employee' }, select: { id: true, employeeId: true } });
  if (!user?.employeeId) throw new Error('demo employee not found');

  // leave flow
  const leaves = await p.leaveRequest.findMany({ where: { employeeId: user.employeeId, reason: 'Family trip to Pokhara', startDate: new Date('2026-11-25') } });
  for (const r of leaves) {
    const bal = await p.leaveBalance.findFirst({ where: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: 2026 } });
    const pending = await p.leaveRequest.aggregate({ where: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, status: 'PENDING' }, _sum: { totalDays: true } });
    console.log(`leave ${r.id} ${r.status} ${r.totalDays} days | balance.pending ${bal?.pending} | pending requests ${pending._sum.totalDays}`);
    if (!apply) continue;
    await p.$transaction(async (tx) => {
      if (r.status === 'PENDING' && bal && Number(bal.pending) >= Number(pending._sum.totalDays)) await tx.leaveBalance.update({ where: { id: bal.id }, data: { pending: { decrement: r.totalDays } } });
      await tx.notification.deleteMany({ where: { link: { contains: r.id } } });
      await tx.leaveRequest.delete({ where: { id: r.id } });
    });
    console.log('  removed');
  }

  // attendance flow: the web check-in made on the capture day
  const att = await p.attendance.findMany({ where: { employeeId: user.employeeId, date: new Date(`${day}T00:00:00.000Z`), approvalStatus: { not: null } } });
  for (const a of att) {
    console.log(`attendance ${a.id} ${day} in=${a.checkIn?.toISOString?.() ?? a.checkIn} ${a.approvalStatus}`);
    if (!apply) continue;
    await p.attendance.delete({ where: { id: a.id } });
    const n = await p.notification.deleteMany({ where: { userId: user.id, type: 'ATTENDANCE_APPROVAL', createdAt: { gte: new Date(`${day}T00:00:00+05:45`) } } });
    console.log(`  removed (notifications: ${n.count})`);
  }
  if (!leaves.length && !att.length) console.log('nothing to clean');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
