import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Department, Designation, EmployeeOption, LeaveType, SalaryComponent, Shift } from '@/types';

/** Reference data used across forms and filters. Cached for a few minutes. */
const long = { staleTime: 5 * 60_000 };

export const useDepartments = () => useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments'), ...long });
export const useDesignations = () => useQuery({ queryKey: ['designations'], queryFn: () => api.get<Designation[]>('/designations'), ...long });
export const useShifts = () => useQuery({ queryKey: ['shifts'], queryFn: () => api.get<Shift[]>('/shifts'), ...long });
export const useLeaveTypes = (active = false) => useQuery({ queryKey: ['leave-types', active], queryFn: () => api.get<LeaveType[]>('/leave/types', { active: active ? '1' : undefined }), ...long });
export const useSalaryComponents = (enabled = true) => useQuery({ queryKey: ['salary-components'], queryFn: () => api.get<SalaryComponent[]>('/salary-components'), enabled, ...long });
export const useEmployeeOptions = (search: string, enabled = true) =>
  useQuery({ queryKey: ['employee-options', search], queryFn: () => api.get<EmployeeOption[]>('/employees/options', { search }), enabled, staleTime: 60_000 });

export const departmentOptions = (d?: Department[]) => (d ?? []).filter((x) => x.status === 'ACTIVE').map((x) => ({ value: x.id, label: x.name }));
