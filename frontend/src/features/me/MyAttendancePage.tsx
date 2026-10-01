import { PageHeader } from '@/components/common';
import { AttendanceMonth } from '@/components/common/AttendanceMonth';
import { Card } from '@/components/ui/display';

export default function MyAttendancePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My attendance" description="Tap a day to see your times. Ask HR if something looks wrong." />
      <Card className="p-5">
        <AttendanceMonth path="/me/attendance" />
      </Card>
    </div>
  );
}
