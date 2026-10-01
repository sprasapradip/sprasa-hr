import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common';
import { Pagination } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { cn, relativeTime } from '@/lib/utils';
import type { Notification } from '@/types';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['notifications', page, unreadOnly], queryFn: () => api.list<Notification>('/notifications', { page, limit: 20, unread: unreadOnly ? '1' : undefined }), placeholderData: keepPreviousData });
  const invalidate = [['notifications']];
  const readAll = useApiMutation(() => api.post('/notifications/read-all'), { success: 'All marked as read', invalidate });
  const read = useApiMutation((id: string) => api.post(`/notifications/${id}/read`), { invalidate });
  const remove = useApiMutation((id: string) => api.del(`/notifications/${id}`), { invalidate });
  const unread = (data?.meta?.unread as number) ?? 0;

  const open = (n: Notification) => {
    if (!n.readAt) read.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You’re up to date'}
        actions={
          <>
            <Button variant="secondary" onClick={() => { setUnreadOnly((u) => !u); setPage(1); }} aria-pressed={unreadOnly}>
              {unreadOnly ? 'Show all' : 'Unread only'}
            </Button>
            <Button variant="secondary" onClick={() => readAll.mutate()} disabled={!unread} loading={readAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.data.length ? (
          <EmptyState icon={<Bell />} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="Leave decisions, payslips and document reminders will show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {data.data.map((n) => (
              <li key={n.id} className={cn('group flex gap-3 px-4 py-3', !n.readAt && 'bg-brand-50/50 dark:bg-brand-900/20')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-label={n.readAt ? undefined : 'Unread'} />
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <p className={cn('text-sm text-fg', !n.readAt && 'font-semibold')}>{n.title}</p>
                  <p className="text-sm text-muted">{n.message}</p>
                  <p className="mt-0.5 text-xs text-subtle">{relativeTime(n.createdAt)}</p>
                </button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(n.id)} aria-label="Delete notification" className="opacity-60 group-hover:opacity-100">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination {...data.pagination} onPage={setPage} />}
      </Card>
    </div>
  );
}
