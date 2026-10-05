// Removes leave requests created by promo takes (reason 'Family trip to Pokhara') and undoes their side effects.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.leaveRequest.findMany({ where: { reason: 'Family trip to Pokhara', startDate: new Date('2026-11-25') } });
  for (const r of rows) {
    const bal = await p.leaveBalance.findFirst({ where: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: 2026 } });
    const pendingReqs = await p.leaveRequest.aggregate({ where: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, status: 'PENDING' }, _sum: { totalDays: true } });
    console.log('request', r.id, r.status, 'days', String(r.totalDays), '| balance.pending', bal && String(bal.pending), '| sum of pending requests', String(pendingReqs._sum.totalDays));
    if (process.argv[2] !== '--apply') continue;
    await p.$transaction(async (tx) => {
      // only give the days back if the balance actually counted them
      if (r.status === 'PENDING' && bal && Number(bal.pending) >= Number(pendingReqs._sum.totalDays)) {
        await tx.leaveBalance.update({ where: { id: bal.id }, data: { pending: { decrement: r.totalDays } } });
      }
      const n = await tx.notification.deleteMany({ where: { link: { contains: r.id } } });
      await tx.leaveRequest.delete({ where: { id: r.id } });
      console.log('  removed; notifications deleted:', n.count);
    });
  }
  if (!rows.length) console.log('nothing to clean');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
