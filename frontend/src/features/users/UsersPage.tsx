import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { KeyRound, Lock, Mail, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code, FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/DataTable';
import { EmployeePicker } from '@/components/common/EmployeePicker';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, StatusBadge } from '@/components/ui/display';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Dialog, Drawer, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { useListParams } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import { formatDateTime, titleCase } from '@/lib/utils';

interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  role: { id: string; key: string; name: string };
  employee: { id: string; employeeCode: string; firstName: string; lastName: string } | null;
}
interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  dataScope: 'ORGANISATION' | 'TEAM' | 'SELF';
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}
interface Permission {
  id: string;
  key: string;
  module: string;
  description: string;
}

const SCOPE_LABEL = { ORGANISATION: 'Whole organisation', TEAM: 'Own team', SELF: 'Only themselves' };

function UserDialog({ open, onOpenChange, user, roles }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserRow | null; roles: Role[] }) {
  const [f, setF] = useState({ name: '', email: '', username: '', roleId: '', employeeId: null as string | null, status: 'ACTIVE', setPassword: false, password: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) setF(user ? { name: user.name, email: user.email, username: user.username ?? '', roleId: user.role.id, employeeId: user.employee?.id ?? null, status: user.status, setPassword: false, password: '' } : { name: '', email: '', username: '', roleId: roles.find((r) => r.key === 'employee')?.id ?? '', employeeId: null, status: 'ACTIVE', setPassword: false, password: '' });
    setErr(null);
  }, [open, user, roles]);

  const save = useApiMutation(
    () => {
      const body: Record<string, unknown> = { name: f.name, email: f.email, username: f.username || null, roleId: f.roleId, employeeId: f.employeeId };
      if (user) return api.put(`/users/${user.id}`, { ...body, status: f.status });
      if (f.setPassword) body.password = f.password;
      return api.post('/users', body);
    },
    { success: user ? 'User updated' : f.setPassword ? 'User created' : 'User created and invitation sent', invalidate: [['users'], ['roles']], onSuccess: () => onOpenChange(false) },
  );

  const submit = () => {
    if (f.name.trim().length < 2) return setErr('Enter a name');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email');
    if (!f.roleId) return setErr('Choose a role');
    if (!user && f.setPassword && !(f.password.length >= 8 && /[A-Za-z]/.test(f.password) && /\d/.test(f.password))) return setErr('Password needs 8+ characters with a letter and a number');
    setErr(null);
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Edit ${user.name}` : 'Add user'}
      description={user ? undefined : 'By default the person gets an email link to set their own password.'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="red">{err}</Alert>}
        <FormGrid>
          <Field label="Full name" required>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Email" required>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Username" hint="Optional, for signing in without email">{(p) => <Input {...p} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} />}</Field>
          <Field label="Role" required>
            {(p) => (
              <Select {...p} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
                <option value="">Choose role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="Linked employee" hint="Needed for self-service: own attendance, leave and payslips">
          {(p) => <EmployeePicker id={p.id} value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} selectedLabel={user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : undefined} />}
        </Field>
        {user ? (
          <Field label="Status">
            {(p) => (
              <Select {...p} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="INVITED">Invited</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Checkbox label="Set a temporary password now instead of emailing an invitation" checked={f.setPassword} onChange={(e) => setF({ ...f, setPassword: e.target.checked })} />
            {f.setPassword && <Field label="Temporary password" hint="Share it privately and ask them to change it">{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>}
          </>
        )}
      </div>
    </Dialog>
  );
}

function UsersTab({ roles }: { roles: Role[] }) {
  const { can, user: me } = useAuth();
  const manage = can('users.manage');
  const list = useListParams({ roleId: '', status: '' });
  const q = { page: list.page, limit: list.limit, search: list.search, ...list.filters };
  const { data, isLoading } = useQuery({ queryKey: ['users', q], queryFn: () => api.list<UserRow>('/users', q), placeholderData: keepPreviousData });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const invite = useApiMutation((id: string) => api.post(`/users/${id}/resend-invite`), { success: 'Password setup email sent' });
  const unlock = useApiMutation((id: string) => api.post(`/users/${id}/unlock`), { success: 'Account unlocked', invalidate: [['users']] });
  const remove = useApiMutation((id: string) => api.del(`/users/${id}`), { success: 'User deleted', invalidate: [['users'], ['roles']], onSuccess: () => setDeleting(null) });

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'User',
      mobile: 'title',
      cell: (u) => (
        <span>
          <span className="block font-medium text-fg">{u.name}</span>
          <span className="hidden text-xs text-subtle md:block">{u.email}</span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', mobile: 'subtitle', cell: (u) => u.role.name },
    { key: 'employee', header: 'Employee', optional: true, cell: (u) => (u.employee ? <Code>{u.employee.employeeCode}</Code> : <span className="text-subtle">Not linked</span>) },
    { key: 'lastLogin', header: 'Last sign-in', optional: true, cell: (u) => <span className="num text-subtle">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</span> },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (u) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={u.status} />
          {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
            <Badge tone="red">
              <Lock className="size-3" /> Locked
            </Badge>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Card>
        <Toolbar>
          <SearchInput value={list.search} onChange={(v) => list.update({ search: v })} placeholder="Name or email…" />
          <FilterSelect label="Role" value={list.filters.roleId} onChange={(v) => list.update({ roleId: v })} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect label="Status" value={list.filters.status} onChange={(v) => list.update({ status: v })} options={['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED'].map((s) => ({ value: s, label: titleCase(s) }))} />
          {manage && (
            <Button className="sm:ml-auto" onClick={() => { setEditing(null); setOpen(true); }}>
              <UserPlus /> Add user
            </Button>
          )}
        </Toolbar>
        <DataTable
          caption="Users"
          columns={columns}
          rows={data?.data}
          rowKey={(u) => u.id}
          loading={isLoading}
          columnMenu
          rowActions={
            manage
              ? (u) => (
                  <DropdownMenu>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem onSelect={() => { setEditing(u); setOpen(true); }}>
                        <Pencil /> Edit
                      </DropdownItem>
                      <DropdownItem onSelect={() => invite.mutate(u.id)}>
                        <Mail /> Send password link
                      </DropdownItem>
                      {u.lockedUntil && (
                        <DropdownItem onSelect={() => unlock.mutate(u.id)}>
                          <KeyRound /> Unlock
                        </DropdownItem>
                      )}
                      {u.id !== me?.id && (
                        <>
                          <DropdownSeparator />
                          <DropdownItem danger onSelect={() => setDeleting(u)}>
                            <Trash2 /> Delete
                          </DropdownItem>
                        </>
                      )}
                    </DropdownContent>
                  </DropdownMenu>
                )
              : undefined
          }
          empty={<EmptyState title="No users found" />}
        />
        {data && <Pagination {...data.pagination} onPage={(p) => list.update({ page: p }, false)} />}
      </Card>
      <UserDialog open={open} onOpenChange={setOpen} user={editing} roles={roles} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete user?" description={`${deleting?.name} will no longer be able to sign in. Their audit history is kept.`} confirmLabel="Delete user" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

function RoleDrawer({ open, onOpenChange, role }: { open: boolean; onOpenChange: (o: boolean) => void; role: Role | null }) {
  const { data: permissions } = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<Permission[]>('/roles/permissions') });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<Role['dataScope']>('ORGANISATION');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setScope(role?.dataScope ?? 'ORGANISATION');
    setSelected(new Set(role?.permissions ?? []));
  }, [open, role]);
  const grouped = useMemo(() => {
    const m = new Map<string, Permission[]>();
    permissions?.forEach((p) => m.set(p.module, [...(m.get(p.module) ?? []), p]));
    return [...m.entries()];
  }, [permissions]);
  const locked = role?.key === 'super_admin';
  const body = () => ({ name, description: description || null, dataScope: scope, permissions: [...selected] });
  const save = useApiMutation(() => (role ? api.put(`/roles/${role.id}`, body()) : api.post('/roles', body())), { success: 'Role saved', invalidate: [['roles']], onSuccess: () => onOpenChange(false) });
  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={role ? `Role: ${role.name}` : 'New role'}
      description="Permissions are checked by the server on every request. Hiding a menu is never the only protection."
      footer={
        !locked && (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>
              Save role
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {locked && <Alert tone="blue">The Super Admin role always has every permission and cannot be edited.</Alert>}
        <FormGrid>
          <Field label="Name" required>{(p) => <Input {...p} value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Can see records of" hint="Row-level access for employee data">
            {(p) => (
              <Select {...p} value={scope} disabled={locked} onChange={(e) => setScope(e.target.value as Role['dataScope'])}>
                {Object.entries(SCOPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="Description">{(p) => <Textarea {...p} rows={2} value={description} disabled={locked} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="space-y-4">
          {grouped.map(([module, perms]) => (
            <fieldset key={module} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{module}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {perms.map((p) => (
                  <Checkbox
                    key={p.key}
                    disabled={locked}
                    checked={locked || selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    label={
                      <span>
                        <span className="block text-sm text-fg">{p.description}</span>
                        <span className="font-mono text-[11px] text-subtle">{p.key}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function RolesTab({ roles, loading }: { roles: Role[]; loading: boolean }) {
  const { can } = useAuth();
  const manage = can('roles.manage');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const remove = useApiMutation((id: string) => api.del(`/roles/${id}`), { success: 'Role deleted', invalidate: [['roles']], onSuccess: () => setDeleting(null) });
  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: 'Role',
      mobile: 'title',
      cell: (r) => (
        <span>
          <span className="flex items-center gap-2 font-medium text-fg">
            {r.name} {r.isSystem && <Badge>Built in</Badge>}
          </span>
          <span className="hidden text-xs text-subtle md:block">{r.description}</span>
        </span>
      ),
    },
    { key: 'scope', header: 'Sees', mobile: 'subtitle', cell: (r) => SCOPE_LABEL[r.dataScope] },
    { key: 'perms', header: 'Permissions', align: 'right', cell: (r) => r.permissions.length },
    { key: 'users', header: 'Users', align: 'right', mobile: 'badge', cell: (r) => r.userCount },
  ];
  return (
    <>
      <Card>
        {manage && (
          <Toolbar>
            <Button className="sm:ml-auto" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus /> New role
            </Button>
          </Toolbar>
        )}
        <DataTable
          caption="Roles"
          columns={columns}
          rows={roles}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={manage ? (r) => { setEditing(r); setOpen(true); } : undefined}
          rowActions={manage ? (r) => (!r.isSystem ? <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}><Trash2 /></Button> : null) : undefined}
          empty={<EmptyState icon={<ShieldCheck />} title="No roles" />}
        />
      </Card>
      <RoleDrawer open={open} onOpenChange={setOpen} role={editing} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete role?" description="Roles that still have users cannot be deleted." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/roles') });
  return (
    <div>
      <PageHeader title="Users & roles" description="Who can sign in, and what each role is allowed to see and do." />
      <Tabs value={params.get('tab') ?? 'users'} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab roles={roles ?? []} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab roles={roles ?? []} loading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
