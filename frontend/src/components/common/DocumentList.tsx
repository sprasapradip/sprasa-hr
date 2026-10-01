import { Download, Eye, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { ConfirmDialog, Dialog } from '@/components/ui/overlay';
import { download, objectUrl } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { api } from '@/lib/api';
import { formatDate, titleCase } from '@/lib/utils';

export interface DocumentRow {
  id: string;
  employeeId: string;
  employeeName: string;
  documentType: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  expiryState: 'NONE' | 'EXPIRED' | 'EXPIRING' | 'VALID';
  createdAt: string;
  employee?: { employeeCode: string };
}

const PREVIEWABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export function ExpiryBadge({ doc }: { doc: Pick<DocumentRow, 'expiryState' | 'daysToExpiry' | 'expiryDate'> }) {
  if (doc.expiryState === 'NONE') return <span className="text-subtle">—</span>;
  if (doc.expiryState === 'EXPIRED') return <Badge tone="red">Expired {formatDate(doc.expiryDate)}</Badge>;
  if (doc.expiryState === 'EXPIRING') return <Badge tone="amber">Expires in {doc.daysToExpiry} d</Badge>;
  return <span className="num text-sm text-muted">{formatDate(doc.expiryDate)}</span>;
}

/** Document rows with preview, download and (optionally) delete. Files always go through the authenticated API. */
export function DocumentList({ docs, loading, canDelete, showEmployee, invalidate = [] }: { docs?: DocumentRow[]; loading?: boolean; canDelete?: boolean; showEmployee?: boolean; invalidate?: unknown[][] }) {
  const [preview, setPreview] = useState<{ url: string; doc: DocumentRow } | null>(null);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);
  const remove = useApiMutation((id: string) => api.del(`/documents/${id}`), { success: 'Document deleted', invalidate: [['documents'], ...invalidate], onSuccess: () => setDeleting(null) });

  const open = async (doc: DocumentRow) => {
    try {
      const url = await objectUrl(`/documents/${doc.id}/download`, { inline: '1' });
      setPreview({ url, doc });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!docs?.length) return <EmptyState icon={<FileText />} title="No documents yet" description="Citizenship, contracts and certificates you upload will appear here." />;

  return (
    <>
      <ul className="divide-y divide-border">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="rounded-md bg-surface-2 p-2 text-subtle">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{d.title}</p>
              <p className="truncate text-xs text-subtle">
                {showEmployee && `${d.employeeName} · `}
                {titleCase(d.documentType)} · {size(d.fileSize)} · uploaded {formatDate(d.createdAt)}
              </p>
            </div>
            <ExpiryBadge doc={d} />
            <div className="flex gap-1">
              {PREVIEWABLE.includes(d.mimeType) && (
                <Button variant="ghost" size="icon-sm" onClick={() => open(d)} aria-label={`Preview ${d.title}`}>
                  <Eye />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => download(`/documents/${d.id}/download`, undefined, d.fileName).catch((e) => toast.error(e.message))} aria-label={`Download ${d.title}`}>
                <Download />
              </Button>
              {canDelete && (
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(d)} aria-label={`Delete ${d.title}`}>
                  <Trash2 className="text-rose-600" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(o) => {
          if (!o && preview) URL.revokeObjectURL(preview.url);
          if (!o) setPreview(null);
        }}
        title={preview?.doc.title ?? 'Preview'}
        size="xl"
      >
        {preview &&
          (preview.doc.mimeType === 'application/pdf' ? (
            <iframe src={preview.url} title={preview.doc.title} className="h-[70vh] w-full rounded-md border border-border" />
          ) : (
            <img src={preview.url} alt={preview.doc.title} className="mx-auto max-h-[70vh] rounded-md" />
          ))}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete document?"
        description={`"${deleting?.title}" will be removed permanently. This cannot be undone.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
