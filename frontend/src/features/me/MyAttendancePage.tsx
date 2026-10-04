import { PageHeader } from '@/components/common';
import { AttendanceMonth } from '@/components/common/AttendanceMonth';
import { Card } from '@/components/ui/display';
import { TodayAttendanceCard } from './TodayAttendanceCard';

export default function MyAttendancePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="My attendance" description="Your times for each day, from the thumb machine or web check-in." />
      <TodayAttendanceCard />
      <Card className="p-4 sm:p-5">
        <AttendanceMonth path="/me/attendance" />
      </Card>
      <p className="px-1 text-xs text-subtle">A scan missing or a time wrong? Tell HR the date and what happened. They can fix it.</p>
    </div>
  );
}
